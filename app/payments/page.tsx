'use client';

import { useMemo, useState } from 'react';
import {
  CurrencyKrw, CreditCard, CheckCircle, Warning, LinkSimple, MagnifyingGlass, Plus, ListChecks, ChartBar, DownloadSimple, Receipt,
} from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { CreateDialog } from '@/components/create-dialog';
import { PaymentLedgerDialog } from '@/components/payment-ledger-dialog';
import { useBankTx, useCardTx } from '@/lib/firebase/transactions-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { formatCurrency, formatDate } from '@/lib/utils';
import { displayCompanyName } from '@/lib/company-display';
import { applicableSubjects, ALL_SUBJECTS } from '@/lib/ledger-subjects';
import { autoMatchAll, applyMatch, reverseMatch, applyFifoPayment, autoMatchCardAll, applyCardMatch } from '@/lib/receipt-match';
import { ReceiptMatchDialog } from '@/components/receipt-match-dialog';
import { downloadDailyLedgerExcel } from '@/lib/ledger-export';
import { audit } from '@/lib/firebase/audit-store';
import { todayKr } from '@/lib/mock-data';
import type { BankTransaction, Contract } from '@/lib/types';

type Tab = 'ledger' | 'summary' | 'card';

/** 자금일보 분개 상태 */
function ledgerStatus(tx: BankTransaction): 'unposted' | 'posted' | 'closed' {
  if (!tx.subject) return 'unposted';                              // 계정과목 없음 → 미분개
  if (tx.subject && !tx.matchedContractId) return 'posted';        // 계정과목만 → 분개
  return 'closed';                                                   // 매칭 완료 → 마감
}

const STATUS_LABEL = { unposted: '미분개', posted: '분개', closed: '마감' } as const;

export default function PaymentsPage() {
  const [tab, setTab] = useState<Tab>('ledger');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unposted' | 'posted' | 'closed'>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [matchTarget, setMatchTarget] = useState<BankTransaction | null>(null);

  const { rows: bankTx, update: updateBankTx, updateMany: updateManyBankTx } = useBankTx();
  const { rows: cardTx, updateMany: updateManyCardTx } = useCardTx();
  const { contracts, update: updateContract, updateMany: updateManyContracts } = useContracts();
  const { companies: companyMaster } = useCompanies();

  const contractById = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts]);

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /* ─── 매칭(분개) 뷰 ─── */
  const ledgerRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bankTx
      .filter((t) => {
        const st = ledgerStatus(t);
        if (filter !== 'all' && st !== filter) return false;
        if (companyFilter !== 'all') {
          const c = t.matchedContractId ? contractById.get(t.matchedContractId) : undefined;
          const co = t.companyCode || c?.company;
          if (co !== companyFilter) return false;
        }
        if (subjectFilter !== 'all') {
          if ((t.subject ?? '(미지정)') !== subjectFilter) return false;
        }
        if (q) {
          const c = t.matchedContractId ? contractById.get(t.matchedContractId) : undefined;
          const hay = `${t.counterparty} ${t.memo ?? ''} ${t.note ?? ''} ${t.account ?? ''} ${t.subject ?? ''} ${c?.vehiclePlate ?? ''} ${c?.customerName ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.txDate.localeCompare(a.txDate));
  }, [bankTx, search, filter, companyFilter, subjectFilter, contractById]);

  /** 분개 뷰에 노출할 회사 목록 (실 데이터 기반) */
  const companyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of bankTx) {
      const c = t.matchedContractId ? contractById.get(t.matchedContractId) : undefined;
      const co = t.companyCode || c?.company;
      if (co) set.add(co);
    }
    return Array.from(set).sort();
  }, [bankTx, contractById]);

  /** 분개 뷰에 노출할 계정과목 목록 (실 데이터 기반) */
  const subjectOptions = useMemo(() => {
    const set = new Set<string>();
    let hasUnposted = false;
    for (const t of bankTx) {
      if (t.subject) set.add(t.subject);
      else hasUnposted = true;
    }
    const list = Array.from(set).sort();
    if (hasUnposted) list.unshift('(미지정)');
    return list;
  }, [bankTx]);

  const counts = useMemo(() => {
    const c = { unposted: 0, posted: 0, closed: 0 };
    for (const t of bankTx) c[ledgerStatus(t)]++;
    return c;
  }, [bankTx]);

  async function handleSubjectChange(tx: BankTransaction, subject: string) {
    await updateBankTx(tx.id, { subject: subject || undefined } as Partial<BankTransaction>);
  }

  async function handleNoteChange(tx: BankTransaction, note: string) {
    await updateBankTx(tx.id, { note: note || undefined } as Partial<BankTransaction>);
  }

  async function handleManualMatch(tx: BankTransaction, contract: Contract, scheduleSeq: number) {
    const { txPatch, contractPatch } = applyMatch(tx, contract, scheduleSeq);
    await updateBankTx(tx.id, txPatch);
    await updateContract({ ...contract, ...contractPatch });
    void audit.match('bank_tx', tx.id, `${contract.contractNo} ${scheduleSeq}회차 매칭 — 입금 ₩${formatCurrency(tx.amount)}`, {
      contractId: contract.id, scheduleSeq, amount: tx.amount, txDate: tx.txDate,
    });
  }

  async function handleReverse(tx: BankTransaction) {
    const c = tx.matchedContractId ? contractById.get(tx.matchedContractId) : undefined;
    if (!c) {
      await updateBankTx(tx.id, { matchedContractId: undefined, matchedScheduleSeq: undefined, matchedAt: undefined });
      void audit.unmatch('bank_tx', tx.id, `매칭 해제 (계약 없음) ₩${formatCurrency(tx.amount)}`);
      return;
    }
    const { txPatch, contractPatch } = reverseMatch(tx, c, todayKr());
    await updateBankTx(tx.id, txPatch);
    await updateContract({ ...c, ...contractPatch });
    void audit.unmatch('bank_tx', tx.id, `${c.contractNo} ${tx.matchedScheduleSeq ?? '?'}회차 매칭 해제 ₩${formatCurrency(tx.amount)}`, {
      contractId: c.id, scheduleSeq: tx.matchedScheduleSeq,
    });
  }

  async function handleFifo(tx: BankTransaction, contract: Contract) {
    const { txPatch, contractPatch, leftover } = applyFifoPayment(tx, contract);
    await updateBankTx(tx.id, txPatch);
    await updateContract({ ...contract, ...contractPatch });
    void audit.match('bank_tx', tx.id, `${contract.contractNo} 선입선출 ₩${formatCurrency(tx.amount)}${leftover > 0 ? ` (잉여 ${formatCurrency(leftover)})` : ''}`, {
      contractId: contract.id, amount: tx.amount, leftover,
    });
    if (leftover > 0) {
      alert(`선입선출 적용 완료 — 잉여 ₩${formatCurrency(leftover)} 원은 추가 매칭 필요`);
    }
  }

  async function handleAutoMatchCardAll() {
    const results = autoMatchCardAll(cardTx, contracts);
    if (results.length === 0) {
      alert('자동 매칭 가능한 카드 매출이 없습니다.\n(고객명·금액 모두 일치하는 미매칭 카드 매출이 없음)');
      return;
    }
    if (!confirm(`카드 매출 자동 매칭 ${results.length}건 일괄 적용하시겠습니까?`)) return;

    const txPatches: Record<string, Partial<import('@/lib/types').CardTransaction>> = {};
    const ctxByContract = new Map<string, Contract>();
    for (const r of results) {
      const current = ctxByContract.get(r.candidate.contract.id) ?? r.candidate.contract;
      const { txPatch, contractPatch } = applyCardMatch(r.tx, current, r.candidate.scheduleSeq);
      txPatches[r.tx.id] = txPatch;
      ctxByContract.set(current.id, { ...current, ...contractPatch });
    }
    await updateManyCardTx(txPatches);
    await updateManyContracts(Array.from(ctxByContract.values()));
    void audit.match('card_tx', 'batch', `카드 매출 자동매칭 일괄 ${results.length}건`, {
      count: results.length,
      total: results.reduce((s, r) => s + r.tx.amount, 0),
    });
    alert(`${results.length}건 자동 매칭 완료`);
  }

  function handleExportExcel() {
    if (daily.length === 0 && bankTx.length === 0) {
      alert('내보낼 거래가 없습니다.');
      return;
    }
    downloadDailyLedgerExcel(
      daily,
      bankTx.map((t) => {
        const c = t.matchedContractId ? contractById.get(t.matchedContractId) : undefined;
        return {
          txDate: t.txDate,
          companyCode: t.companyCode || (c?.company ?? ''),
          account: t.account ?? '',
          subject: t.subject ?? '',
          counterparty: t.counterparty ?? '',
          memo: t.memo ?? '',
          deposit: t.amount ?? 0,
          withdraw: t.withdraw ?? 0,
          balance: t.balance ?? 0,
          matchedContractNo: c?.contractNo ?? '',
          matchedScheduleSeq: t.matchedScheduleSeq ?? '',
        };
      }),
    );
  }

  async function handleAutoMatchAll() {
    const results = autoMatchAll(bankTx, contracts);
    if (results.length === 0) {
      alert('자동 매칭 가능한 입금이 없습니다.\n(거래상대명·금액 모두 일치하는 미매칭 입금이 없음)');
      return;
    }
    const preview = results.slice(0, 10).map((r) =>
      `· ${r.tx.txDate.slice(0, 10)} ${r.tx.amount.toLocaleString('ko-KR')}원 → ${r.candidate.contract.contractNo} ${r.candidate.scheduleSeq}회차`,
    ).join('\n');
    const more = results.length > 10 ? `\n... 외 ${results.length - 10}건` : '';
    if (!confirm(`자동 매칭 ${results.length}건 일괄 적용:\n\n${preview}${more}\n\n진행할까요?`)) return;

    // tx + contract 일괄 patch 준비
    const txPatches: Record<string, Partial<BankTransaction>> = {};
    const contractPatches: Record<string, Partial<Contract>> = {};
    const ctxByContract = new Map<string, Contract>();
    for (const r of results) {
      const current = ctxByContract.get(r.candidate.contract.id) ?? r.candidate.contract;
      const { txPatch, contractPatch } = applyMatch(r.tx, current, r.candidate.scheduleSeq);
      txPatches[r.tx.id] = txPatch;
      ctxByContract.set(current.id, { ...current, ...contractPatch });
    }
    for (const [id, merged] of ctxByContract) contractPatches[id] = merged;

    await updateManyBankTx(txPatches);
    await updateManyContracts(Object.values(contractPatches).map((c) => c as Contract));
    void audit.match('bank_tx', 'batch', `자동매칭 일괄 ${results.length}건`, {
      count: results.length,
      total: results.reduce((s, r) => s + r.tx.amount, 0),
    });
    alert(`${results.length}건 자동 매칭 완료`);
  }

  /* ─── 집계 뷰 ─── */
  type DailyRow = {
    key: string; companyCode: string; date: string;
    txCount: number; deposit: number; withdraw: number; netChange: number; endBalance: number;
    depoSubjects: string; drawSubjects: string;
  };
  const daily = useMemo<DailyRow[]>(() => {
    const m = new Map<string, DailyRow & { _depo: Record<string, number>; _draw: Record<string, number> }>();
    for (const t of bankTx) {
      const day = t.txDate.slice(0, 10);
      const companyCode = t.companyCode || (t.matchedContractId && contractById.get(t.matchedContractId)?.company) || '(미지정)';
      const k = `${companyCode}|${day}`;
      const cur = m.get(k) ?? {
        key: k, companyCode, date: day,
        txCount: 0, deposit: 0, withdraw: 0, netChange: 0, endBalance: 0,
        depoSubjects: '', drawSubjects: '',
        _depo: {}, _draw: {},
      };
      cur.deposit += t.amount ?? 0;
      cur.withdraw += t.withdraw ?? 0;
      cur.netChange = cur.deposit - cur.withdraw;
      cur.endBalance = t.balance ?? cur.endBalance;
      if (t.subject && (t.amount ?? 0) > 0) cur._depo[t.subject] = (cur._depo[t.subject] ?? 0) + (t.amount ?? 0);
      if (t.subject && (t.withdraw ?? 0) > 0) cur._draw[t.subject] = (cur._draw[t.subject] ?? 0) + (t.withdraw ?? 0);
      cur.txCount++;
      m.set(k, cur);
    }
    return Array.from(m.values()).map(({ _depo, _draw, ...rest }) => ({
      ...rest,
      depoSubjects: Object.entries(_depo).map(([s, v]) => `${s} ₩${v.toLocaleString('ko-KR')}`).join(' / '),
      drawSubjects: Object.entries(_draw).map(([s, v]) => `${s} ₩${v.toLocaleString('ko-KR')}`).join(' / '),
    })).sort((a, b) => b.date.localeCompare(a.date) || a.companyCode.localeCompare(b.companyCode));
  }, [bankTx, contractById]);

  const dailyTotals = useMemo(() => {
    let inSum = 0, outSum = 0;
    for (const r of daily) { inSum += r.deposit; outSum += r.withdraw; }
    return { inSum, outSum };
  }, [daily]);

  /* ─── 카드 매출 (기존 — 유지) ─── */
  const cardRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cardTx
      .map((t) => ({ ...t, contract: t.matchedContractId ? contractById.get(t.matchedContractId) : undefined }))
      .filter((r) => {
        if (q) {
          const hay = `${r.customerName ?? ''} ${r.approvalNo ?? ''} ${r.contract?.vehiclePlate ?? ''} ${r.contract?.customerName ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.txDate.localeCompare(a.txDate));
  }, [cardTx, search, contractById]);

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <CurrencyKrw size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>계좌 관리</span>
          </div>

          <div className="topbar-search">
            <MagnifyingGlass size={14} className="icon" />
            <input
              className="input"
              placeholder="거래상대 / 차량 / 고객명 / 적요 / 계정과목"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="filter-bar">
            <button type="button" className={`chip ${tab === 'ledger' ? 'active' : ''}`} onClick={() => setTab('ledger')}>
              <ListChecks /> 자금일보 — 분개
              {bankTx.length > 0 && <span className="chip-count">{bankTx.length}</span>}
            </button>
            <button type="button" className={`chip ${tab === 'summary' ? 'active' : ''}`} onClick={() => setTab('summary')}>
              <ChartBar /> 일자별 집계
              {daily.length > 0 && <span className="chip-count">{daily.length}</span>}
            </button>
            <button type="button" className={`chip ${tab === 'card' ? 'active' : ''}`} onClick={() => setTab('card')}>
              <CreditCard /> 카드 매출
              {cardTx.length > 0 && <span className="chip-count">{cardTx.length}</span>}
            </button>
            {tab === 'ledger' && (
              <>
                <span className="filter-divider" />
                <button type="button" className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>전체</button>
                <button type="button" className={`chip ${filter === 'unposted' ? 'active' : ''}`} onClick={() => setFilter('unposted')}>미분개 {counts.unposted > 0 && <span className="chip-count">{counts.unposted}</span>}</button>
                <button type="button" className={`chip ${filter === 'posted' ? 'active' : ''}`} onClick={() => setFilter('posted')}>분개 {counts.posted > 0 && <span className="chip-count">{counts.posted}</span>}</button>
                <button type="button" className={`chip ${filter === 'closed' ? 'active' : ''}`} onClick={() => setFilter('closed')}>마감 {counts.closed > 0 && <span className="chip-count">{counts.closed}</span>}</button>
                {companyOptions.length > 1 && (
                  <>
                    <span className="filter-divider" />
                    <select
                      className="input"
                      value={companyFilter}
                      onChange={(e) => setCompanyFilter(e.target.value)}
                      style={{ height: 26, fontSize: 11, padding: '0 6px', minWidth: 90 }}
                      title="회사별 필터"
                    >
                      <option value="all">회사: 전체</option>
                      {companyOptions.map((co) => (
                        <option key={co} value={co}>{displayCompanyName(co, companyMaster)}</option>
                      ))}
                    </select>
                  </>
                )}
                {subjectOptions.length > 0 && (
                  <select
                    className="input"
                    value={subjectFilter}
                    onChange={(e) => setSubjectFilter(e.target.value)}
                    style={{ height: 26, fontSize: 11, padding: '0 6px', minWidth: 110 }}
                    title="계정과목별 필터"
                  >
                    <option value="all">계정: 전체</option>
                    {subjectOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}
              </>
            )}
          </div>
        </header>

        <div className="dashboard" style={{ gridTemplateColumns: '1fr' }}>
          <div className="panel">
            <div className="panel-body">
              {tab === 'ledger' && (
                <LedgerTable
                  rows={ledgerRows}
                  contractById={contractById}
                  companyMaster={companyMaster}
                  selectedIds={selectedIds}
                  toggleRow={toggleRow}
                  setSelectedIds={setSelectedIds}
                  onSubjectChange={handleSubjectChange}
                  onNoteChange={handleNoteChange}
                  onOpenMatch={setMatchTarget}
                />
              )}
              {tab === 'summary' && (
                <SummaryTable rows={daily} companyMaster={companyMaster} />
              )}
              {tab === 'card' && (
                <CardTable rows={cardRows} />
              )}
            </div>
          </div>
        </div>

        <BottomBar
          left={
            <>
              <button className="btn btn-primary" type="button" onClick={() => setUploadOpen(true)}>
                <Plus weight="bold" /> 계좌내역 올리기
              </button>
              <button className="btn" type="button" onClick={() => setLedgerOpen(true)} title="회사 전체 수납이력 원장">
                <Receipt size={14} /> 수납 이력
              </button>
            </>
          }
          right={
            tab === 'ledger' ? (
              <>
                <span>전체 <strong>{bankTx.length}</strong></span>
                <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
                <span style={{ color: 'var(--text-weak)' }}>미분개 <strong>{counts.unposted}</strong></span>
                <span style={{ color: 'var(--green-text)' }}>분개 <strong>{counts.posted}</strong></span>
                <span style={{ color: 'var(--brand)' }}>마감 <strong>{counts.closed}</strong></span>
                <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
                <button className="btn btn-sm btn-primary" type="button" onClick={handleAutoMatchAll}>
                  자동매칭
                </button>
              </>
            ) : tab === 'summary' ? (
              <>
                <span>일자 <strong>{daily.length}</strong></span>
                <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
                <span>입금 <strong className="mono">₩{formatCurrency(dailyTotals.inSum)}</strong></span>
                <span>출금 <strong className="mono">₩{formatCurrency(dailyTotals.outSum)}</strong></span>
                <span>순증감 <strong className="mono" style={{ color: dailyTotals.inSum - dailyTotals.outSum < 0 ? 'var(--red-text)' : 'var(--text-main)' }}>₩{formatCurrency(dailyTotals.inSum - dailyTotals.outSum)}</strong></span>
                <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
                <button className="btn btn-sm" type="button" onClick={handleExportExcel} title="자금일보 엑셀 (세무사 공유용)">
                  <DownloadSimple size={12} weight="bold" /> 엑셀
                </button>
              </>
            ) : (
              <>
                <span>카드 매출 <strong>{cardTx.length}</strong></span>
                <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
                <span style={{ color: 'var(--green-text)' }}>매칭 <strong>{cardTx.filter((t) => t.matchedContractId).length}</strong></span>
                <span style={{ color: 'var(--orange-text)' }}>미매칭 <strong>{cardTx.filter((t) => !t.matchedContractId).length}</strong></span>
                <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
                <button className="btn btn-sm btn-primary" type="button" onClick={handleAutoMatchCardAll}>
                  자동매칭
                </button>
              </>
            )
          }
        />

        <CreateDialog open={uploadOpen} onOpenChange={setUploadOpen} initialMode="수납" />
        <PaymentLedgerDialog open={ledgerOpen} onOpenChange={setLedgerOpen} contracts={contracts} />
        <ReceiptMatchDialog
          open={!!matchTarget}
          onOpenChange={(v) => !v && setMatchTarget(null)}
          tx={matchTarget}
          contracts={contracts}
          companyMaster={companyMaster}
          onApply={handleManualMatch}
          onReverse={handleReverse}
          onFifo={handleFifo}
        />
      </div>
    </div>
  );
}

/* ─────────────────── 자금일보 — 분개 테이블 ─────────────────── */

function LedgerTable({
  rows, contractById, companyMaster, selectedIds, toggleRow, setSelectedIds, onSubjectChange, onNoteChange, onOpenMatch,
}: {
  rows: BankTransaction[];
  contractById: Map<string, Contract>;
  companyMaster: Parameters<typeof displayCompanyName>[1];
  selectedIds: Set<string>;
  toggleRow: (id: string) => void;
  setSelectedIds: (s: Set<string>) => void;
  onSubjectChange: (tx: BankTransaction, subject: string) => void;
  onNoteChange: (tx: BankTransaction, note: string) => void;
  onOpenMatch: (tx: BankTransaction) => void;
}) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th className="checkbox-col">
            <input
              type="checkbox"
              checked={rows.length > 0 && rows.every((r) => selectedIds.has(r.id))}
              ref={(el) => {
                if (!el) return;
                const some = rows.some((r) => selectedIds.has(r.id));
                const all = rows.every((r) => selectedIds.has(r.id));
                el.indeterminate = some && !all;
              }}
              onChange={(e) => {
                if (e.target.checked) setSelectedIds(new Set(rows.map((r) => r.id)));
                else setSelectedIds(new Set());
              }}
              aria-label="전체 선택"
            />
          </th>
          <th className="center" style={{ width: 60 }}>구분</th>
          <th style={{ width: 70 }}>회사</th>
          <th style={{ width: 90 }}>일자</th>
          <th className="num" style={{ width: 110 }}>입금</th>
          <th className="num" style={{ width: 110 }}>출금</th>
          <th className="num" style={{ width: 110 }}>잔액</th>
          <th style={{ width: 110 }}>계정과목</th>
          <th>거래상대</th>
          <th>적요</th>
          <th style={{ width: 180 }}>매칭 계약</th>
          <th>비고</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={12} className="muted center" style={{ padding: '32px 10px' }}>
              표시할 거래가 없습니다. 사이드바 → 신규 등록 → 수납 으로 계좌 엑셀 업로드.
            </td>
          </tr>
        ) : rows.map((t) => {
          const c = t.matchedContractId ? contractById.get(t.matchedContractId) : undefined;
          const status = ledgerStatus(t);
          const direction: 'deposit' | 'withdraw' = (t.withdraw ?? 0) > 0 ? 'withdraw' : 'deposit';
          return (
            <tr key={t.id} className={selectedIds.has(t.id) ? 'selected-row' : undefined}>
              <td className="checkbox-col">
                <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleRow(t.id)} aria-label="선택" />
              </td>
              <td className="center">
                <span className={`status ${status === 'closed' ? '완료' : status === 'posted' ? '예정' : ''}`}>{STATUS_LABEL[status]}</span>
              </td>
              <td className="dim">{t.companyCode || (c ? displayCompanyName(c.company, companyMaster) : '-')}</td>
              <td className="mono">{formatDate(t.txDate)}</td>
              <td className="num mono">{t.amount > 0 ? `₩${formatCurrency(t.amount)}` : '-'}</td>
              <td className="num mono" style={{ color: 'var(--red-text)' }}>{(t.withdraw ?? 0) > 0 ? `₩${formatCurrency(t.withdraw!)}` : '-'}</td>
              <td className="num mono dim">{t.balance ? `₩${formatCurrency(t.balance)}` : '-'}</td>
              <td>
                <select
                  className="input"
                  value={t.subject ?? ''}
                  onChange={(e) => onSubjectChange(t, e.target.value)}
                  style={{ width: '100%', height: 22, padding: '0 4px', fontSize: 11 }}
                  title="계정과목"
                >
                  <option value="">- 선택 -</option>
                  {applicableSubjects(direction).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
              <td>{t.counterparty || '-'}</td>
              <td className="dim" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.memo || '-'}</td>
              <td>
                {c ? (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => onOpenMatch(t)}
                    style={{ width: '100%', justifyContent: 'flex-start', gap: 6 }}
                    title="매칭 정보 / 해제"
                  >
                    <span className="plate">{c.vehiclePlate}</span>
                    <span>{c.customerName}</span>
                    {t.matchedScheduleSeq && <span className="dim">· {t.matchedScheduleSeq}회</span>}
                  </button>
                ) : (direction === 'deposit' ? (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => onOpenMatch(t)}
                    style={{ width: '100%' }}
                  >
                    <LinkSimple size={11} /> 매칭
                  </button>
                ) : (
                  <span className="dim" style={{ fontSize: 11 }}>—</span>
                ))}
              </td>
              <td>
                <input
                  className="input inline-edit"
                  defaultValue={t.note ?? ''}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (t.note ?? '')) onNoteChange(t, v);
                  }}
                  placeholder="-"
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ─────────────────── 일자별 집계 테이블 ─────────────────── */

function SummaryTable({
  rows, companyMaster,
}: {
  rows: Array<{
    key: string; companyCode: string; date: string;
    txCount: number; deposit: number; withdraw: number; netChange: number; endBalance: number;
    depoSubjects: string; drawSubjects: string;
  }>;
  companyMaster: Parameters<typeof displayCompanyName>[1];
}) {
  return (
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
          <th>주요 입금 (계정)</th>
          <th>주요 출금 (계정)</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={9} className="muted center" style={{ padding: '32px 10px' }}>
              집계할 거래가 없습니다.
            </td>
          </tr>
        ) : rows.map((r) => (
          <tr key={r.key}>
            <td className="dim">{displayCompanyName(r.companyCode, companyMaster)}</td>
            <td className="mono">{r.date}</td>
            <td className="num mono">{r.txCount}</td>
            <td className="num mono">{r.deposit > 0 ? `₩${formatCurrency(r.deposit)}` : '-'}</td>
            <td className="num mono" style={{ color: r.withdraw > 0 ? 'var(--red-text)' : undefined }}>{r.withdraw > 0 ? `₩${formatCurrency(r.withdraw)}` : '-'}</td>
            <td className="num mono" style={{ color: r.netChange < 0 ? 'var(--red-text)' : 'var(--text-main)' }}>
              {r.netChange === 0 ? '-' : `${r.netChange > 0 ? '+' : ''}₩${formatCurrency(r.netChange)}`}
            </td>
            <td className="num mono dim">{r.endBalance ? `₩${formatCurrency(r.endBalance)}` : '-'}</td>
            <td className="dim" style={{ fontSize: 11, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.depoSubjects || '-'}</td>
            <td className="dim" style={{ fontSize: 11, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.drawSubjects || '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─────────────────── 카드 매출 ─────────────────── */

function CardTable({ rows }: { rows: Array<import('@/lib/types').CardTransaction & { contract?: Contract }> }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th className="center" style={{ width: 36 }}>매칭</th>
          <th style={{ width: 110 }}>일자</th>
          <th>고객명</th>
          <th className="mono">승인번호</th>
          <th className="mono" style={{ width: 80 }}>카드4자리</th>
          <th className="num" style={{ width: 130 }}>금액</th>
          <th>매칭 계약</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={7} className="muted center" style={{ padding: '32px 10px' }}>
              표시할 카드 매출이 없습니다.
            </td>
          </tr>
        ) : rows.map((r) => (
          <tr key={r.id}>
            <td className="center">
              {r.matchedContractId ? (
                <CheckCircle size={14} weight="fill" style={{ color: 'var(--green-text)' }} />
              ) : (
                <Warning size={14} weight="fill" style={{ color: 'var(--orange-text)' }} />
              )}
            </td>
            <td className="mono">{formatDate(r.txDate)}</td>
            <td>{r.customerName || '-'}</td>
            <td className="mono dim">{r.approvalNo || '-'}</td>
            <td className="mono dim">{r.cardLast4 || '-'}</td>
            <td className="num mono">₩{formatCurrency(r.amount)}</td>
            <td>
              {r.contract ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <span className="plate">{r.contract.vehiclePlate}</span>
                  <span>{r.contract.customerName}</span>
                </span>
              ) : (
                <button className="btn btn-sm" type="button" disabled title="수동 매칭 — Phase 2">
                  <LinkSimple /> 매칭
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
