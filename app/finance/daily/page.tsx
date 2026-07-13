'use client';

/**
 * /finance/daily — 자금일보 standalone.
 * BankTx + CardTx 를 회사·일자별로 집계 (세무사 보고용).
 *
 * 구성:
 *   · 회사·기간 필터 (월/분기/연)
 *   · KPI 카드 (총 입금/총 출금/순증감/거래건수)
 *   · 일자별 집계 표 + 행 expand 로 그 날 거래 list
 *   · 엑셀 다운로드
 */

import { useMemo, useState } from 'react';
import { ChartBar, FileXls, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { FilterSelect } from '@/components/ui/filter-select';
import { CompanyFilter, PeriodFilter } from '@/components/ui/filter-bar';
import { FINANCE_SUB } from '@/components/layout/sub-nav';
import { BottomBar } from '@/components/layout/bottom-bar';
import { EmptyRow } from '@/components/ui/empty-row';
import { ExcelButton, ActionButton, ActionSep } from '@/components/ui/page-actions';
import { useBankTx, useCardTx } from '@/lib/firebase/transactions-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { updateBankTxWithMatchSync, updateCardTxWithMatchSync } from '@/lib/firebase/tx-contract-sync';
import { useCompanies } from '@/lib/firebase/companies-store';
import { displayCompanyName } from '@/lib/company-display';
import { buildCompanyOptions } from '@/lib/filter-helpers';
import { downloadDailyLedgerExcel } from '@/lib/ledger-export';
import { formatCurrency } from '@/lib/utils';
import { todayKr } from '@/lib/mock-data';
import { DailyLedgerView } from '@/components/finance/daily-ledger-view';
import { TransactionDetailDialog, DailyBucketDetailDialog } from '@/components/finance/transaction-detail-dialog';
import type { BankTransaction } from '@/lib/types';
import { findCmsMatchCandidates, buildSettlementPatches } from '@/lib/cms-matching';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';
import { downloadTaxInvoiceExcel } from '@/lib/tax-invoice-export';
import { recordIssuedInvoices, snapshotFromContract } from '@/lib/firebase/issued-invoices-store';
import { useAuth } from '@/lib/use-auth';
import { usePersistentState } from '@/lib/use-persistent-state';

type DailyRow = {
  key: string; companyCode: string; date: string;
  txCount: number; deposit: number; withdraw: number; netChange: number; endBalance: number;
  depoSubjects: string; drawSubjects: string;
};

export default function FinanceDailyPage() {
  const { user } = useAuth();
  const { rows: bankTx, loading: bankLoading, update: updateBank } = useBankTx();
  const { rows: cardTx, loading: cardLoading, update: updateCard } = useCardTx();
  const dataLoading = bankLoading || cardLoading;
  const { contracts, update: updateContract } = useContracts();
  const { companies: companyMaster } = useCompanies();

  const contractById = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts]);

  // 거래 상세 / 일자행 상세 모달
  const [detailTx, setDetailTx] = useState<BankTransaction | null>(null);
  const [bucketDetail, setBucketDetail] = useState<{ companyCode: string; date: string } | null>(null);

  // 회사 + 기간 + 검색 필터
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = usePersistentState('filter:finance-daily:company', 'all');
  const [periodMode, setPeriodMode] = usePersistentState<'month' | 'quarter' | 'year'>('filter:finance-daily:period', 'month');
  const [periodAnchor, setPeriodAnchor] = useState<{ y: number; m: number }>(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  });
  function shiftPeriod(delta: number) {
    setPeriodAnchor((p) => {
      const step = periodMode === 'month' ? 1 : periodMode === 'quarter' ? 3 : 12;
      const d = new Date(p.y, p.m - 1 + step * delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    });
  }
  function gotoCurrent() {
    const d = new Date();
    setPeriodAnchor({ y: d.getFullYear(), m: d.getMonth() + 1 });
  }
  const periodLabel = (() => {
    if (periodMode === 'year') return `${periodAnchor.y}`;
    if (periodMode === 'quarter') {
      const q = Math.floor((periodAnchor.m - 1) / 3) + 1;
      return `${periodAnchor.y} Q${q}`;
    }
    return `${periodAnchor.y}-${String(periodAnchor.m).padStart(2, '0')}`;
  })();
  function inPeriod(yyyymmdd: string): boolean {
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

  const companyOptions = useMemo(
    () => buildCompanyOptions(bankTx, (t) => t.companyCode || (t.matchedContractId && contractById.get(t.matchedContractId)?.company) || ''),
    [bankTx, contractById],
  );

  const daily = useMemo<DailyRow[]>(() => {
    const m = new Map<string, DailyRow & { _depo: Record<string, number>; _draw: Record<string, number> }>();
    function bucket(companyCode: string, day: string) {
      const k = `${companyCode}|${day}`;
      let cur = m.get(k);
      if (!cur) {
        cur = {
          key: k, companyCode, date: day, txCount: 0,
          deposit: 0, withdraw: 0, netChange: 0, endBalance: 0,
          depoSubjects: '', drawSubjects: '',
          _depo: {}, _draw: {},
        };
        m.set(k, cur);
      }
      return cur;
    }
    for (const t of bankTx) {
      // CMS 묶음: 집금 입금과 구성 자동이체(item)는 같은 돈 — item 제외 (이중집계 방지)
      if (t.settlementRole === 'item') continue;
      const day = (t.txDate ?? '').slice(0, 10);
      if (!day || !inPeriod(day)) continue;
      const companyCode = t.companyCode || (t.matchedContractId && contractById.get(t.matchedContractId)?.company) || '(미지정)';
      if (companyFilter !== 'all' && companyCode !== companyFilter) continue;
      const cur = bucket(companyCode, day);
      cur.deposit += t.amount ?? 0;
      cur.withdraw += t.withdraw ?? 0;
      cur.netChange = cur.deposit - cur.withdraw;
      cur.endBalance = t.balance ?? cur.endBalance;
      const subj = t.subject || ((t.amount ?? 0) > 0 ? '대여료수입' : undefined);
      if (subj && (t.amount ?? 0) > 0) cur._depo[subj] = (cur._depo[subj] ?? 0) + (t.amount ?? 0);
      if (subj && (t.withdraw ?? 0) > 0) cur._draw[subj] = (cur._draw[subj] ?? 0) + (t.withdraw ?? 0);
      cur.txCount++;
    }
    for (const t of cardTx) {
      if ((t.kind ?? '매출') !== '매출') continue;
      const day = (t.txDate ?? '').slice(0, 10);
      if (!day || !inPeriod(day)) continue;
      // 회사귀속: 은행거래와 동일하게 t.companyCode 폴백 (누락 시 카드만 '(미지정)'으로 새 나가 버킷 모달과 불일치)
      const companyCode = t.companyCode || (t.matchedContractId && contractById.get(t.matchedContractId)?.company) || '(미지정)';
      if (companyFilter !== 'all' && companyCode !== companyFilter) continue;
      const cur = bucket(companyCode, day);
      cur.deposit += t.amount ?? 0;
      cur.netChange = cur.deposit - cur.withdraw;
      cur._depo['카드매출'] = (cur._depo['카드매출'] ?? 0) + (t.amount ?? 0);
      cur.txCount++;
    }
    return Array.from(m.values()).map(({ _depo, _draw, ...rest }) => ({
      ...rest,
      depoSubjects: Object.entries(_depo).map(([s, v]) => `${s} ₩${v.toLocaleString('ko-KR')}`).join(' / '),
      drawSubjects: Object.entries(_draw).map(([s, v]) => `${s} ₩${v.toLocaleString('ko-KR')}`).join(' / '),
    })).sort((a, b) => b.date.localeCompare(a.date) || a.companyCode.localeCompare(b.companyCode));
  }, [bankTx, cardTx, contractById, companyFilter, periodMode, periodAnchor]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    let inSum = 0, outSum = 0;
    for (const r of daily) { inSum += r.deposit; outSum += r.withdraw; }
    return { inSum, outSum };
  }, [daily]);

  async function handleCmsAutoMatch() {
    const candidates = findCmsMatchCandidates(bankTx);
    if (candidates.length === 0) {
      toast.info('CMS 매칭 후보 없음 — 미매칭 CMS 집금건 또는 자동이체가 없습니다');
      return;
    }
    const highConfidence = candidates.filter((c) => c.confidence === 'high');
    const others = candidates.length - highConfidence.length;

    if (!await showConfirm({
      title: `CMS 자동 매칭 ${highConfidence.length}건 적용`,
      description: others > 0 ? `나머지 ${others}건은 수동 검토 필요` : undefined,
    })) return;

    let applied = 0;
    for (const cand of highConfidence) {
      const patches = buildSettlementPatches(cand);
      for (const { id, patch } of patches) {
        try { await updateBank(id, patch); applied++; } catch (e) { console.error('[cms-match]', e); }
      }
    }
    toast.success(`CMS 매칭 ${highConfidence.length}건 적용 (총 ${applied} BankTx update)`);
  }

  async function handleTaxInvoiceExport() {
    // contracts → B2B 활성 계약 → 셀렉션 양식 즉시 다운로드
    const r = downloadTaxInvoiceExcel(contracts);
    if (!r.ok) {
      toast.info('B2B 활성 계약 없음 — 사업자/법인 계약 없거나 모두 반납/해지 상태');
      return;
    }
    // ERP #29 Frozen Artifact — 발행 시점 snapshot 영구 보존
    try {
      const billingMonth = todayKr().slice(0, 7);   // KST 월 (엑셀 기본값과 통일)
      const items = r.snapshots.map(snapshotFromContract);
      await recordIssuedInvoices({
        billingMonth, items,
        issuedBy: user?.email ?? user?.uid ?? 'unknown',
      });
      toast.success(`세금계산서 ${r.count}건 발행 엑셀 다운로드 + frozen ledger 기록`);
    } catch (e) {
      console.error('[tax-invoice ledger]', e);
      toast.error(`엑셀 다운로드는 완료 — ledger 기록 실패: ${(e as Error).message}`);
    }
  }

  function handleExport() {
    const dailyRows = daily.map((r) => ({
      companyCode: r.companyCode,
      date: r.date,
      txCount: r.txCount,
      deposit: r.deposit,
      withdraw: r.withdraw,
      netChange: r.netChange,
      endBalance: r.endBalance,
      depoSubjects: r.depoSubjects,
      drawSubjects: r.drawSubjects,
    }));
    const ledger = bankTx.filter((t) => {
      // 일자별집계 시트와 동일 필터 — CMS 구성건 제외 + 기간·회사 (안 하면 거래원장 시트만 전기간·전회사)
      if (t.settlementRole === 'item') return false;
      const day = (t.txDate ?? '').slice(0, 10);
      if (!day || !inPeriod(day)) return false;
      const co = t.companyCode || (t.matchedContractId && contractById.get(t.matchedContractId)?.company) || '(미지정)';
      if (companyFilter !== 'all' && co !== companyFilter) return false;
      return true;
    }).map((t) => {
      const c = t.matchedContractId ? contractById.get(t.matchedContractId) : undefined;
      return {
        txDate: t.txDate ?? '',
        companyCode: t.companyCode || c?.company || '(미지정)',
        account: t.account ?? '',
        subject: t.subject ?? '',
        counterparty: t.counterparty ?? '',
        memo: t.memo ?? '',
        deposit: t.amount ?? 0,
        withdraw: t.withdraw ?? 0,
        balance: t.balance ?? 0,
        matchedContractNo: c?.contractNo ?? '',
        matchedScheduleSeq: t.matchedScheduleSeq ?? ('' as const),
      };
    });
    downloadDailyLedgerExcel(dailyRows, ledger, { title: '자금일보' });
  }

  return (
    <MasterPageShell
      title="자금일보"
      icon={<ChartBar size={16} weight="fill" style={{ color: 'var(--orange-text, #c2410c)' }} />}
      subNav={FINANCE_SUB}
      stats={
        <>
          <span>일자<strong>{daily.length}</strong></span>
          <span className="sep" />
          <span style={{ color: 'var(--green-text)' }}>입금<strong className="mono">₩{formatCurrency(totals.inSum)}</strong></span>
          <span style={{ color: 'var(--red-text)' }}>출금<strong className="mono">₩{formatCurrency(totals.outSum)}</strong></span>
          <span>순증감<strong className="mono" style={{ color: totals.inSum - totals.outSum < 0 ? 'var(--red-text)' : 'var(--text-main)' }}>₩{formatCurrency(totals.inSum - totals.outSum)}</strong></span>
        </>
      }
      bottomBar={
        <BottomBar
          left={
            <>
              <ExcelButton count={daily.length} onClick={handleExport} title={`현재 페이지 목록 (${daily.length}건) 엑셀 다운로드 — 자금일보`} />
              <ActionButton icon={<FileXls size={14} weight="bold" />} label="세금계산서 엑셀" onClick={handleTaxInvoiceExport} title={`세금계산서 발행 엑셀 — 전자세금계산서 시스템 (smarttaxinvoice 등) 일괄 업로드용`} />
              <ActionSep />
              <ActionButton label="CMS 자동 매칭" onClick={() => void handleCmsAutoMatch()} title="미매칭 CMS 집금건 ↔ 자동이체 자동 묶음 매칭 (일자 ±3일 + 수수료 0.05~0.3%)" />
            </>
          }
          right={null}
        />
      }
    >
      {/* 필터 바 — 회사 / 기간 / 검색 */}
      <div className="filter-bar" style={{ marginBottom: 14, gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <CompanyFilter
          value={companyFilter}
          onChange={setCompanyFilter}
          options={companyOptions}
          master={companyMaster}
        />
        <span className="filter-divider" />
        <PeriodFilter mode={periodMode} onModeChange={setPeriodMode} onShift={shiftPeriod} onCurrent={gotoCurrent} label={periodLabel} />
        <span className="filter-divider" />
        <input
          className="input-compact" data-w="md"
          placeholder="입금자/적요/계정과목 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* 거래별 상세 — 메인 (회사·일자·채널·입출금·차량·거래처·계정과목·매칭) */}
      <section className="detail-section">
        <div className="detail-section-header">
          <span className="title">거래별 상세</span>
          <span className="dim" style={{ fontSize: 11, marginLeft: 'auto' }}>계정과목·매칭 dropdown 으로 직접 분개</span>
        </div>
        <div className="detail-section-body" style={{ padding: 0 }}>
          <DailyLedgerView
            bankTx={bankTx}
            cardTx={cardTx}
            contractById={contractById}
            contracts={contracts}
            companyMaster={companyMaster}
            inPeriod={inPeriod}
            search={search}
            companyFilter={companyFilter}
            onUpdateBank={(id, patch) => {
              const old = bankTx.find((t) => t.id === id);
              if (!old) return;
              void updateBankTxWithMatchSync(old, patch, contracts, updateBank, updateContract);
            }}
            onUpdateCard={(id, patch) => {
              const old = cardTx.find((t) => t.id === id);
              if (!old) return;
              void updateCardTxWithMatchSync(old, patch, contracts, updateCard, updateContract);
            }}
            onOpenTxDetail={setDetailTx}
          />
        </div>
      </section>

      {/* 일자별 집계 — 보조 (세무사 보고용) */}
      <section className="detail-section" style={{ marginTop: 18 }}>
        <div className="detail-section-header">
          <span className="title">일자별 집계 (회사 × 일자)</span>
        </div>
        <div className="detail-section-body" style={{ padding: 0 }}>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 90 }}>회사</th>
            <th style={{ width: 110 }}>일자</th>
            <th className="num" style={{ width: 80 }}>거래</th>
            <th className="num" style={{ width: 130 }}>입금합계</th>
            <th className="num" style={{ width: 130 }}>출금합계</th>
            <th className="num" style={{ width: 130 }}>순증감</th>
            <th className="num" style={{ width: 130 }}>잔액</th>
            <th>계정과목 소계</th>
          </tr>
        </thead>
        <tbody>
          {dataLoading ? (
            <EmptyRow colSpan={8}>거래 내역 불러오는 중…</EmptyRow>
          ) : daily.length === 0 ? (
            <EmptyRow colSpan={8}>거래 내역 없음 — 입출금관리에서 등록</EmptyRow>
          ) : daily.map((r) => (
            <tr
              key={r.key}
              onDoubleClick={() => setBucketDetail({ companyCode: r.companyCode, date: r.date })}
              style={{ cursor: 'pointer' }}
              title="더블클릭 — 그 날 구성 거래 상세"
            >
              <td className="dim">{displayCompanyName(r.companyCode, companyMaster)}</td>
              <td className="mono">{r.date}</td>
              <td className="num mono">{r.txCount}</td>
              <td className="num mono" style={{ color: 'var(--green-text)' }}>{r.deposit > 0 ? `₩${formatCurrency(r.deposit)}` : '-'}</td>
              <td className="num mono" style={{ color: 'var(--red-text)' }}>{r.withdraw > 0 ? `₩${formatCurrency(r.withdraw)}` : '-'}</td>
              <td className="num mono" style={{ color: r.netChange < 0 ? 'var(--red-text)' : undefined }}>₩{formatCurrency(r.netChange)}</td>
              <td className="num mono dim">{r.endBalance ? `₩${formatCurrency(r.endBalance)}` : '-'}</td>
              <td className="dim" style={{ fontSize: 11 }}>{r.depoSubjects}{r.drawSubjects && r.depoSubjects && ' · '}{r.drawSubjects}</td>
            </tr>
          ))}
        </tbody>
      </table>
        </div>
      </section>

      <TransactionDetailDialog
        tx={detailTx}
        open={!!detailTx}
        onOpenChange={(v) => !v && setDetailTx(null)}
        contracts={contracts}
        bankTx={bankTx}
        companyMaster={companyMaster}
      />
      <DailyBucketDetailDialog
        bucket={bucketDetail}
        open={!!bucketDetail}
        onOpenChange={(v) => !v && setBucketDetail(null)}
        bankTx={bankTx}
        cardTx={cardTx}
        contracts={contracts}
        companyMaster={companyMaster}
        onOpenTx={(tx) => { setBucketDetail(null); setDetailTx(tx); }}
      />
    </MasterPageShell>
  );
}
