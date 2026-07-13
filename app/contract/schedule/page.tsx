'use client';

/**
 * /contract/schedule — 계약스케줄.
 *
 *   계약 체결 시 정해진 "회차별 청구 일정 + 결제 사실" 만 노출.
 *   미수·회수 같은 파생 view 는 리스크관리. 여기는 SSOT 원천.
 *
 *   - 모든 계약의 schedules[] 1회차 = 1행 으로 flat 펼침
 *   - 필터: 회사·기간(월/분기/연)·상태(예정/연체/부분납/완료/면제)
 *   - 더블클릭 → ContractDetailDialog
 */

import { useMemo, useState, Fragment } from 'react';
import { Calendar, FileXls, CaretLeft, CaretRight, LinkSimple } from '@phosphor-icons/react';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { CONTRACT_SUB } from '@/components/layout/sub-nav';
import { BottomBar } from '@/components/layout/bottom-bar';
import { ExcelButton } from '@/components/ui/page-actions';
import { EmptyRow } from '@/components/ui/empty-row';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useBankTx } from '@/lib/firebase/transactions-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { displayCompanyName } from '@/lib/company-display';
import { formatDateFull } from '@/lib/utils';
import { CompanyFilter } from '@/components/ui/filter-bar';
import { buildCompanyOptions, matchesCompanyFilter } from '@/lib/filter-helpers';
import { sumPayments, sumDiscounts, balance } from '@/lib/payment-schedule';
import { usePersistentState } from '@/lib/use-persistent-state';
import { useVehicleDialog } from '@/lib/global-dialogs';
import { exportToExcel } from '@/lib/excel-export';
import { toast } from '@/lib/toast';
import type { Contract, PaymentScheduleInline, ScheduleStatus, PaymentEntry, DiscountEntry, BankTransaction } from '@/lib/types';

type Bucket = 'all' | '예정' | '연체' | '부분납' | '완료' | '면제';

type Row = {
  contract: Contract;
  schedule: PaymentScheduleInline;
  seq: number;
  dueDate: string;
  charge: number;
  discount: number;
  paid: number;
  bal: number;
  status: ScheduleStatus;
  paidAt?: string;
};

const fmt = (v: number) => v ? v.toLocaleString('ko-KR') : '';

export default function ContractSchedulePage() {
  const { contracts, loading } = useContracts();
  const { rows: bankTx } = useBankTx();
  const { companies: companyMaster } = useCompanies();
  /** 계좌 입금(source='계좌')의 txId → 자금일보 거래 역참조 (연동 표시) */
  const bankTxById = useMemo(() => new Map(bankTx.map((t) => [t.id, t])), [bankTx]);
  /** 회차 행 펼침 — `${contractId}-${seq}` */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  const [companyFilter, setCompanyFilter] = usePersistentState<string>('filter:contract-schedule:company', 'all');
  const [bucket, setBucket] = usePersistentState<Bucket>('filter:contract-schedule:bucket', 'all');
  const [periodMode, setPeriodMode] = usePersistentState<'month' | 'quarter' | 'year' | 'all'>('filter:contract-schedule:period', 'month');
  const [periodAnchor, setPeriodAnchor] = useState<{ y: number; m: number }>(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  });
  const { openVehicle } = useVehicleDialog();

  const companyOptions = useMemo(() => buildCompanyOptions(contracts, (c) => c.company), [contracts]);

  function shiftPeriod(delta: number) {
    setPeriodAnchor((p) => {
      const step = periodMode === 'month' ? 1 : periodMode === 'quarter' ? 3 : 12;
      const d = new Date(p.y, p.m - 1 + step * delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    });
  }
  const periodLabel = (() => {
    if (periodMode === 'all') return '전체 기간';
    if (periodMode === 'year') return `${periodAnchor.y}`;
    if (periodMode === 'quarter') {
      const q = Math.floor((periodAnchor.m - 1) / 3) + 1;
      return `${periodAnchor.y} Q${q}`;
    }
    return `${periodAnchor.y}-${String(periodAnchor.m).padStart(2, '0')}`;
  })();
  function inPeriod(yyyymmdd: string): boolean {
    if (periodMode === 'all') return true;
    if (!yyyymmdd) return false;
    const [yStr, mStr] = yyyymmdd.split('-');
    const y = Number(yStr), m = Number(mStr);
    if (Number.isNaN(y) || Number.isNaN(m)) return false;
    if (periodMode === 'year') return y === periodAnchor.y;
    if (periodMode === 'quarter') {
      const qa = Math.floor((periodAnchor.m - 1) / 3);
      const qy = Math.floor((m - 1) / 3);
      return y === periodAnchor.y && qy === qa;
    }
    return y === periodAnchor.y && m === periodAnchor.m;
  }

  const allRows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const c of contracts) {
      if (!matchesCompanyFilter(c.company, companyFilter)) continue;
      const list = (c.schedules ?? []) as PaymentScheduleInline[];
      for (const s of list) {
        const due = (s.dueDate ?? '').slice(0, 10);
        if (!inPeriod(due)) continue;
        const charge = s.amount ?? 0;
        const discount = sumDiscounts(s);
        const paid = sumPayments(s);
        out.push({
          contract: c,
          schedule: s,
          seq: s.seq,
          dueDate: due,
          charge,
          discount,
          paid,
          bal: balance(s),
          status: s.status,
          paidAt: s.paidAt,
        });
      }
    }
    return out.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  }, [contracts, companyFilter, periodMode, periodAnchor]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { all: allRows.length, '예정': 0, '연체': 0, '부분납': 0, '완료': 0, '면제': 0 };
    for (const r of allRows) {
      if (c[r.status] !== undefined) c[r.status]++;
    }
    return c;
  }, [allRows]);

  const rows = useMemo(() => bucket === 'all' ? allRows : allRows.filter((r) => r.status === bucket), [allRows, bucket]);

  const totals = useMemo(() => {
    let charge = 0, paid = 0, bal = 0;
    for (const r of rows) {
      charge += r.charge;
      paid += r.paid;
      bal += r.bal;
    }
    return { charge, paid, bal };
  }, [rows]);

  function handleExcel() {
    if (rows.length === 0) { toast.info('내보낼 회차 없음'); return; }
    const data = rows.map((r) => ({
      회사: r.contract.company ? displayCompanyName(r.contract.company, companyMaster) : '',
      계약번호: r.contract.contractNo ?? '',
      계약자: r.contract.customerName ?? '',
      차량번호: r.contract.vehiclePlate ?? '',
      회차: `${r.seq}/${(r.contract.termMonths ?? '?')}`,
      예정일: r.dueDate,
      청구액: r.charge,
      할인: r.discount,
      납부액: r.paid,
      잔액: r.bal,
      상태: r.status,
      납부완료일: r.paidAt ?? '',
    }));
    const result = exportToExcel({
      title: `계약스케줄 ${periodLabel}`,
      fileName: `계약스케줄_${periodLabel}.xlsx`,
      sheetName: '계약스케줄',
      columns: [
        { key: '회사', header: '회사' },
        { key: '계약번호', header: '계약번호', type: 'mono' },
        { key: '계약자', header: '계약자' },
        { key: '차량번호', header: '차량번호', type: 'mono' },
        { key: '회차', header: '회차', type: 'center' },
        { key: '예정일', header: '예정일', type: 'date' },
        { key: '청구액', header: '청구액', type: 'number' },
        { key: '할인', header: '할인', type: 'number' },
        { key: '납부액', header: '납부액', type: 'number' },
        { key: '잔액', header: '잔액', type: 'number' },
        { key: '상태', header: '상태', type: 'center' },
        { key: '납부완료일', header: '납부완료일', type: 'date' },
      ],
      rows: data,
    });
    if (result.ok) toast.success(`계약스케줄 ${rows.length}건 엑셀 저장`);
  }

  const statusTone = (s: ScheduleStatus): { bg: string; text: string } => {
    if (s === '완료') return { bg: 'var(--green-bg)', text: 'var(--green-text)' };
    if (s === '연체') return { bg: 'var(--red-bg)', text: 'var(--red-text)' };
    if (s === '부분납') return { bg: 'var(--orange-bg)', text: 'var(--orange-text)' };
    if (s === '면제') return { bg: 'var(--bg-sunken)', text: 'var(--text-sub)' };
    return { bg: 'var(--brand-bg)', text: 'var(--brand)' };
  };

  return (
    <MasterPageShell
      title="계약스케줄"
      icon={<Calendar size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      subNav={CONTRACT_SUB}
      search={
        <>
          <CompanyFilter value={companyFilter} onChange={setCompanyFilter} options={companyOptions} master={companyMaster} />
          <span className="filter-divider" />
          <button type="button" className={`chip ${periodMode === 'month' ? 'active' : ''}`} onClick={() => setPeriodMode('month')}>월</button>
          <button type="button" className={`chip ${periodMode === 'quarter' ? 'active' : ''}`} onClick={() => setPeriodMode('quarter')}>분기</button>
          <button type="button" className={`chip ${periodMode === 'year' ? 'active' : ''}`} onClick={() => setPeriodMode('year')}>연</button>
          <button type="button" className={`chip ${periodMode === 'all' ? 'active' : ''}`} onClick={() => setPeriodMode('all')}>전체</button>
          {periodMode !== 'all' && (
            <>
              <span className="filter-divider" />
              <button type="button" className="chip" onClick={() => shiftPeriod(-1)} title="이전"><CaretLeft size={11} weight="bold" /></button>
              <strong className="mono" style={{ minWidth: 80, textAlign: 'center', fontSize: 12 }}>{periodLabel}</strong>
              <button type="button" className="chip" onClick={() => shiftPeriod(1)} title="다음"><CaretRight size={11} weight="bold" /></button>
            </>
          )}
        </>
      }
      quickFilters={
        <>
          <button type="button" className={`chip ${bucket === 'all' ? 'active' : ''}`} onClick={() => setBucket('all')}>
            전체<span className="chip-count">{counts.all}</span>
          </button>
          <button type="button" className={`chip chip-tone-brand ${bucket === '예정' ? 'active' : ''}`} onClick={() => setBucket('예정')}>
            예정<span className="chip-count">{counts['예정']}</span>
          </button>
          <button type="button" className={`chip chip-tone-orange ${bucket === '부분납' ? 'active' : ''}`} onClick={() => setBucket('부분납')}>
            부분납<span className="chip-count">{counts['부분납']}</span>
          </button>
          <button type="button" className={`chip chip-tone-red ${bucket === '연체' ? 'active' : ''}`} onClick={() => setBucket('연체')}>
            연체<span className="chip-count">{counts['연체']}</span>
          </button>
          <button type="button" className={`chip chip-tone-green ${bucket === '완료' ? 'active' : ''}`} onClick={() => setBucket('완료')}>
            완료<span className="chip-count">{counts['완료']}</span>
          </button>
          {counts['면제'] > 0 && (
            <button type="button" className={`chip ${bucket === '면제' ? 'active' : ''}`} onClick={() => setBucket('면제')}>
              면제<span className="chip-count">{counts['면제']}</span>
            </button>
          )}
        </>
      }
      bottomBar={
        <BottomBar
          left={
            <ExcelButton count={rows.length} onClick={handleExcel} />
          }
          right={
            <span className="dim mono" style={{ fontSize: 11 }}>
              청구 ₩{fmt(totals.charge)} · 납부 ₩{fmt(totals.paid)} · 잔액 ₩{fmt(totals.bal)}
            </span>
          }
        />
      }
    >
      <table className="table">
        <thead>
          <tr>
            <th className="center" style={{ width: 30 }}></th>
            <th style={{ width: 56 }}>회사</th>
            <th style={{ width: 90 }}>계약번호</th>
            <th style={{ minWidth: 130 }}>계약자</th>
            <th style={{ width: 90 }}>차량번호</th>
            <th className="center" style={{ width: 70 }}>회차</th>
            <th style={{ width: 100 }}>예정일</th>
            <th className="num" style={{ width: 100 }}>청구액</th>
            <th className="num" style={{ width: 90 }}>할인</th>
            <th className="num" style={{ width: 100 }}>납부액</th>
            <th className="num" style={{ width: 100 }}>잔액</th>
            <th className="center" style={{ width: 70 }}>상태</th>
            <th style={{ width: 100 }}>납부완료일</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={13} className="muted center" style={{ padding: 32 }}>
              {loading ? '데이터 불러오는 중…' : '해당 조건의 회차 없음'}
            </td></tr>
          ) : rows.map((r) => {
            const tone = statusTone(r.status);
            const key = `${r.contract.id}-${r.seq}`;
            const pays = r.schedule.payments ?? [];
            const discs = r.schedule.discounts ?? [];
            const hasEntries = pays.length > 0 || discs.length > 0;
            const isExpanded = expanded.has(key);
            return (
              <Fragment key={key}>
              <tr
                onDoubleClick={() => r.contract.vehiclePlate && openVehicle(r.contract.vehiclePlate, 'payment')}
                onClick={() => hasEntries && toggleExpand(key)}
                style={{ cursor: hasEntries ? 'pointer' : 'default' }}
                title={hasEntries ? '펼쳐서 분할납부·할인·자금일보 연동 보기' : undefined}
              >
                <td className="center">
                  {hasEntries && (
                    <CaretRight size={10} weight="bold" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: 'var(--text-weak)' }} />
                  )}
                </td>
                <td className="dim">{r.contract.company ? displayCompanyName(r.contract.company, companyMaster) : '-'}</td>
                <td className="mono dim">{r.contract.contractNo || '-'}</td>
                <td>{r.contract.customerName || '-'}</td>
                <td className="mono">{r.contract.vehiclePlate || '-'}</td>
                <td className="center mono dim">{r.seq}/{r.contract.termMonths ?? '?'}</td>
                <td className="mono">{r.dueDate || '-'}</td>
                <td className="num mono">{fmt(r.charge) || '-'}</td>
                <td className="num mono dim" style={{ color: r.discount > 0 ? 'var(--orange-text)' : undefined }}>
                  {r.discount > 0 ? fmt(r.discount) : '-'}
                </td>
                <td className="num mono" style={{ color: r.paid > 0 ? 'var(--green-text)' : 'var(--text-weak)' }}>
                  {r.paid > 0 ? fmt(r.paid) : '-'}
                </td>
                <td className="num mono" style={{ color: r.bal > 0 ? 'var(--red-text)' : 'var(--text-weak)', fontWeight: r.bal > 0 ? 600 : undefined }}>
                  {r.bal > 0 ? fmt(r.bal) : '-'}
                </td>
                <td className="center">
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                    background: tone.bg, color: tone.text,
                  }}>{r.status}</span>
                </td>
                <td className="mono dim">{r.paidAt || '-'}</td>
              </tr>
              {isExpanded && hasEntries && (
                <tr>
                  <td colSpan={13} style={{ background: 'var(--bg-sunken)', padding: 8 }}>
                    <ScheduleBreakdown pays={pays} discs={discs} bankTxById={bankTxById} />
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

    </MasterPageShell>
  );
}

/**
 * 회차 펼침 상세 — 분할납부(payments) + 청구할인(discounts) 을 날짜순으로 통합.
 * 계좌 입금(source='계좌' + txId)은 자금일보 거래로 역참조해 "어느 입금이 이 회차를 냈는지" 연동 표시.
 * payment-tab 의 펼침 상세와 동일 규격 — 여기선 read-only 요약.
 */
function ScheduleBreakdown({
  pays, discs, bankTxById,
}: {
  pays: PaymentEntry[];
  discs: DiscountEntry[];
  bankTxById: Map<string, BankTransaction>;
}) {
  const entries = [
    ...pays.map((p) => ({ kind: 'payment' as const, date: p.date, amount: p.amount, source: p.source, memo: p.memo, by: p.by, txId: p.txId, reason: undefined as string | undefined })),
    ...discs.map((d) => ({ kind: 'discount' as const, date: d.date, amount: d.amount, source: '할인' as const, memo: d.memo, by: d.by, txId: undefined, reason: d.reason })),
  ].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  return (
    <table className="table" style={{ fontSize: 11, margin: 0 }}>
      <thead>
        <tr>
          <th style={{ width: 100 }}>일자</th>
          <th className="center" style={{ width: 52 }}>구분</th>
          <th className="num" style={{ width: 110 }}>금액</th>
          <th className="center" style={{ width: 64 }}>출처/사유</th>
          <th style={{ minWidth: 220 }}>자금일보 연동</th>
          <th>메모</th>
          <th className="mono dim" style={{ width: 120 }}>등록자</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e, i) => {
          const linked = e.kind === 'payment' && e.source === '계좌' && e.txId ? bankTxById.get(e.txId) : undefined;
          const chipBg = e.kind === 'discount' ? 'var(--bg-sunken)'
            : e.source === '정산' ? 'var(--bg-sunken)'
            : e.source === '계좌' ? 'var(--blue-bg)'
            : e.source === '카드' ? 'var(--purple-bg)'
            : 'var(--green-bg)';
          const chipColor = e.kind === 'discount' ? 'var(--text-weak)'
            : e.source === '정산' ? 'var(--text-weak)'
            : e.source === '계좌' ? 'var(--blue-text)'
            : e.source === '카드' ? 'var(--purple-text)'
            : 'var(--green-text)';
          return (
            <tr key={i}>
              <td className="mono">{formatDateFull(e.date)}</td>
              <td className="center">
                <span className="chip" style={{ height: 16, padding: '0 6px', fontSize: 10, background: e.kind === 'discount' ? 'var(--red-bg)' : 'var(--green-bg)', color: e.kind === 'discount' ? 'var(--red-text)' : 'var(--green-text)' }}>
                  {e.kind === 'discount' ? '할인' : '입금'}
                </span>
              </td>
              <td className="num mono" style={{ color: e.kind === 'discount' ? 'var(--red-text)' : undefined }}>
                {e.kind === 'discount' ? '-' : ''}₩{e.amount.toLocaleString('ko-KR')}
              </td>
              <td className="center">
                <span className="chip" style={{ height: 16, padding: '0 6px', fontSize: 10, background: chipBg, color: chipColor }}>
                  {e.kind === 'discount' ? (e.reason ?? '할인') : e.source}
                </span>
              </td>
              <td className="dim" style={{ fontSize: 11 }}>
                {linked ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <LinkSimple size={10} style={{ color: 'var(--blue-text)' }} />
                    <span className="mono">{(linked.txDate ?? '').slice(0, 10)}</span>
                    <span>{linked.counterparty || '입금'}</span>
                    {linked.account && <span className="mono dim">· {linked.account}</span>}
                  </span>
                ) : e.kind === 'payment' && e.source === '계좌' ? (
                  <span className="dim" style={{ fontSize: 10 }}>계좌 입금 (자금일보 미링크)</span>
                ) : e.kind === 'payment' && e.source === '정산' ? (
                  <span className="dim" style={{ fontSize: 10 }}>이월 정산 (실입금 아님)</span>
                ) : (
                  <span className="dim">-</span>
                )}
              </td>
              <td className="dim">{e.memo || '-'}</td>
              <td className="mono dim">{e.by ?? (e.kind === 'payment' && e.source === '정산' ? '(자동)' : '-')}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
