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

import { useMemo, useState } from 'react';
import { Calendar, FileXls } from '@phosphor-icons/react';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { CONTRACT_SUB } from '@/components/layout/sub-nav';
import { BottomBar } from '@/components/layout/bottom-bar';
import { EmptyRow } from '@/components/ui/empty-row';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { displayCompanyName } from '@/lib/company-display';
import { CompanyFilter } from '@/components/ui/filter-bar';
import { buildCompanyOptions, matchesCompanyFilter } from '@/lib/filter-helpers';
import { sumPayments, sumDiscounts, balance } from '@/lib/payment-schedule';
import { usePersistentState } from '@/lib/use-persistent-state';
import { useVehicleDialog } from '@/lib/global-dialogs';
import { exportToExcel } from '@/lib/excel-export';
import { toast } from '@/lib/toast';
import type { Contract, PaymentScheduleInline, ScheduleStatus } from '@/lib/types';

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
  const { companies: companyMaster } = useCompanies();
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
              <button type="button" className="chip" onClick={() => shiftPeriod(-1)} title="이전">◀</button>
              <strong className="mono" style={{ minWidth: 80, textAlign: 'center', fontSize: 12 }}>{periodLabel}</strong>
              <button type="button" className="chip" onClick={() => shiftPeriod(1)} title="다음">▶</button>
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
            <button className="btn" type="button" disabled={rows.length === 0} onClick={handleExcel}>
              <FileXls size={14} weight="bold" /> 엑셀 <span className="chip-count">{rows.length}</span>
            </button>
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
            <tr><td colSpan={12} className="muted center" style={{ padding: 32 }}>
              {loading ? '데이터 불러오는 중…' : '해당 조건의 회차 없음'}
            </td></tr>
          ) : rows.map((r) => {
            const tone = statusTone(r.status);
            return (
              <tr
                key={`${r.contract.id}-${r.seq}`}
                onDoubleClick={() => r.contract.vehiclePlate && openVehicle(r.contract.vehiclePlate, 'payment')}
                style={{ cursor: 'pointer' }}
              >
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
            );
          })}
        </tbody>
      </table>

    </MasterPageShell>
  );
}
