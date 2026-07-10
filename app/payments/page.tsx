'use client';

import { useMemo, useState } from 'react';
import {
  CurrencyKrw, CreditCard, CheckCircle, Warning, LinkSimple, MagnifyingGlass, Plus, ListChecks, ChartBar, FileXls,
} from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { NewButton, ExcelButton, ActionButton, ActionSep } from '@/components/ui/page-actions';
import { CreateDialog } from '@/components/create-dialog';
import { useBankTx, useCardTx } from '@/lib/firebase/transactions-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { formatCurrency, formatDate } from '@/lib/utils';
import { displayCompanyName } from '@/lib/company-display';
import { CompanyCell } from '@/components/ui/company-cell';
import { applicableSubjects } from '@/lib/ledger-subjects';
import { autoMatchAll, applyMatch, reverseMatch, applyFifoPayment, autoMatchCardAll, applyCardMatch, reverseCardMatch, applyFifoCardPayment } from '@/lib/receipt-match';
import { updateBankTxWithMatchSync, detectDuplicateManualPayment } from '@/lib/firebase/tx-contract-sync';
import { findAllSettlements, buildSettlementPatch } from '@/lib/settlement-match';
import { buildCompanyOptions, matchesCompanyFilter, resolveCompanyKey } from '@/lib/filter-helpers';
import { ReceiptMatchDialog, CardMatchDialog } from '@/components/receipt-match-dialog';
import { downloadDailyLedgerExcel } from '@/lib/ledger-export';
import { audit } from '@/lib/firebase/audit-store';
import { todayKr } from '@/lib/mock-data';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';
import type { BankTransaction, Contract } from '@/lib/types';
import { StatusBadge } from '@/components/ui/status-badge';
import { FilterSelect } from '@/components/ui/filter-select';
import { usePersistentState } from '@/lib/use-persistent-state';
import { useTableSelection } from '@/lib/use-table-selection';

type Tab = 'all' | 'autodebit' | 'summary' | 'card' | 'corpcard';

/** 자동이체로 분류되는 source 값들 — CMS / 자동이체 / 자동이체-CMS 등 */
function isAutoDebit(t: BankTransaction): boolean {
  const s = (t.source ?? '').toUpperCase();
  const m = (t.method ?? '').toUpperCase();
  return s.includes('CMS') || s.includes('자동이체') || m.includes('CMS') || m.includes('자동이체');
}

/** 자금일보 분개 상태 */
function ledgerStatus(tx: BankTransaction): 'unposted' | 'posted' | 'closed' {
  if (!tx.subject) return 'unposted';                              // 계정과목 없음 → 미분개
  if (tx.subject && !tx.matchedContractId) return 'posted';        // 계정과목만 → 분개
  return 'closed';                                                   // 매칭 완료 → 마감
}

const STATUS_LABEL = { unposted: '미분개', posted: '분개', closed: '마감' } as const;

/**
 * 거래의 계좌 표시 라벨 — 별명 우선, 없으면 계좌번호 전체.
 * BankTransaction.account(계좌번호) 가 회사 마스터의 BankAccount와 매칭되면 별명 노출.
 * 일치 안 되면 t.account 그대로 (계좌번호 전체).
 */
function formatAccountLabel(
  t: BankTransaction,
  companyMaster: Parameters<typeof displayCompanyName>[1],
  contract: Contract | undefined,
): string {
  const accountNo = (t.account ?? '').trim();
  // 회사 추론 — t.companyCode → contract.company → fallback
  const companyKey = t.companyCode || contract?.company;
  if (companyKey && companyMaster) {
    const company = companyMaster.find((co) => co.code === companyKey || co.name === companyKey);
    if (company?.accounts) {
      // 계좌번호 정규화(숫자만) 비교
      const norm = (s: string) => s.replace(/[^0-9]/g, '');
      const matched = company.accounts.find((a) => norm(a.accountNo) === norm(accountNo) && norm(accountNo).length > 0);
      if (matched) {
        return matched.nickname?.trim() || matched.accountNo || accountNo || '-';
      }
    }
  }
  return accountNo || '-';
}

export default function PaymentsPage() {
  const [tab, setTab] = usePersistentState<Tab>('filter:payments:tab', 'all');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = usePersistentState<'all' | 'unposted' | 'posted' | 'closed'>('filter:payments:quick', 'all');
  /** 계좌내역(all) 탭에서의 입출금 방향 퀵필터 — 다른 탭에서는 무시 */
  const [direction, setDirection] = usePersistentState<'all' | 'deposit' | 'withdraw'>('filter:payments:direction', 'all');
  const [companyFilter, setCompanyFilter] = usePersistentState<string>('filter:payments:company', 'all');
  const [subjectFilter, setSubjectFilter] = usePersistentState<string>('filter:payments:subject', 'all');
  const [uploadOpen, setUploadOpen] = useState(false);
  // 행 선택 — lib/use-table-selection SSOT
  const sel = useTableSelection();
  const { selectedIds, setSelectedIds } = sel;
  const [matchTarget, setMatchTarget] = useState<BankTransaction | null>(null);
  const [cardMatchTarget, setCardMatchTarget] = useState<import('@/lib/types').CardTransaction | null>(null);

  const { rows: bankTx, loading: bankTxLoading, update: updateBankTx, updateMany: updateManyBankTx } = useBankTx();
  const { rows: cardTx, loading: cardTxLoading, updateMany: updateManyCardTx, update: updateCard } = useCardTx();
  const { contracts, update: updateContract, updateMany: updateManyContracts } = useContracts();
  const { companies: companyMaster } = useCompanies();

  const contractById = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts]);

  const toggleRow = sel.toggleRow;

  /* ─── 매칭(분개) 뷰 ─── */
  const ledgerRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bankTx
      .filter((t) => {
        // 자동이체 탭 — CMS/자동이체 source 만 통과
        if (tab === 'autodebit' && !isAutoDebit(t)) return false;
        // 계좌내역(all) 에서만 입출금 방향 dropdown 적용. summary/card 는 별도 처리.
        if (tab === 'all') {
          if (direction === 'deposit' && !((t.amount ?? 0) > 0)) return false;
          if (direction === 'withdraw' && !((t.withdraw ?? 0) > 0)) return false;
        }
        const st = ledgerStatus(t);
        if (filter !== 'all' && st !== filter) return false;
        if (!matchesCompanyFilter(resolveCompanyKey(t, contractById), companyFilter)) return false;
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
  }, [bankTx, search, filter, companyFilter, subjectFilter, contractById, tab, direction]);

  /** 분개 뷰에 노출할 회사 목록 (실 데이터 기반) */
  const companyOptions = useMemo(
    () => buildCompanyOptions(bankTx, (t) => resolveCompanyKey(t, contractById)),
    [bankTx, contractById],
  );

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

  /** 직접수납 후 계좌매칭 시 이중차감 방지 — 같은 금액 수동/현금 수납이 ±3일 내 있으면 확인. */
  async function confirmIfDuplicate(tx: BankTransaction, contract: Contract): Promise<boolean> {
    const dup = detectDuplicateManualPayment(contract, tx.txDate ?? todayKr(), tx.amount);
    if (!dup.found) return true;
    return showConfirm({
      title: '중복 입금 의심 — 계속 매칭할까요?',
      description: `${contract.vehiclePlate ?? ''} ${contract.customerName ?? ''}의 ${dup.matchSeq}회차에 같은 금액 ₩${formatCurrency(tx.amount)} 직접 수납(${dup.matchDate})이 이미 있습니다.\n계속 매칭하면 미수금이 두 번 차감됩니다.`,
      danger: true,
    });
  }

  async function handleManualMatch(tx: BankTransaction, contract: Contract, scheduleSeq: number) {
    if (!await confirmIfDuplicate(tx, contract)) return;
    const { txPatch, contractPatch } = applyMatch(tx, contract, scheduleSeq);
    await updateBankTx(tx.id, txPatch);
    await updateContract({ ...contract, ...contractPatch });
    void audit.match('bank_tx', tx.id, `${contract.contractNo} ${scheduleSeq}회차 매칭 — 입금 ₩${formatCurrency(tx.amount)}`, {
      contractId: contract.id, scheduleSeq, amount: tx.amount, txDate: tx.txDate,
    });
  }

  async function handleReverse(tx: BankTransaction) {
    // 분할매칭(matches[]) 포함 모든 매칭을 원복 — 기존엔 matchedContractId 한 계약만 reverse 해
    // 분할의 2번째 이후 계약에 유령 payment 가 남고 미수가 영구히 안 돌아왔음. sync 가 전부 해제 + collapse.
    const splitCount = tx.matches?.length ?? 0;
    await updateBankTxWithMatchSync(tx, { matchedContractId: undefined }, contracts, updateBankTx, updateContract);
    const c = tx.matchedContractId ? contractById.get(tx.matchedContractId) : undefined;
    void audit.unmatch('bank_tx', tx.id, `${c?.contractNo ?? ''} 매칭 해제 ₩${formatCurrency(tx.amount)}${splitCount > 0 ? ` (분할 ${splitCount}건 전체 해제)` : ''}`.trim(), {
      contractId: tx.matchedContractId, scheduleSeq: tx.matchedScheduleSeq, splitCount,
    });
  }

  async function handleFifo(tx: BankTransaction, contract: Contract) {
    if (!await confirmIfDuplicate(tx, contract)) return;
    const { txPatch, contractPatch, leftover } = applyFifoPayment(tx, contract);
    await updateBankTx(tx.id, txPatch);
    await updateContract({ ...contract, ...contractPatch });
    void audit.match('bank_tx', tx.id, `${contract.contractNo} 선입선출 ₩${formatCurrency(tx.amount)}${leftover > 0 ? ` (잉여 ${formatCurrency(leftover)})` : ''}`, {
      contractId: contract.id, amount: tx.amount, leftover,
    });
    if (leftover > 0) {
      toast.info(`선입선출 적용 — 잉여 ₩${formatCurrency(leftover)} 원 추가 매칭 필요`);
    }
  }

  async function handleCardManualMatch(tx: import('@/lib/types').CardTransaction, contract: Contract, scheduleSeq: number) {
    const { txPatch, contractPatch } = applyCardMatch(tx, contract, scheduleSeq);
    await updateCard(tx.id, txPatch);
    await updateContract({ ...contract, ...contractPatch });
    void audit.match('card_tx', tx.id, `${contract.contractNo} ${scheduleSeq}회차 카드 매칭 — 매출 ₩${formatCurrency(tx.amount)}`, {
      contractId: contract.id, scheduleSeq, amount: tx.amount, txDate: tx.txDate,
    });
  }

  async function handleCardReverse(tx: import('@/lib/types').CardTransaction) {
    const c = tx.matchedContractId ? contractById.get(tx.matchedContractId) : undefined;
    if (!c) {
      await updateCard(tx.id, { matchedContractId: undefined, matchedScheduleSeq: undefined });
      void audit.unmatch('card_tx', tx.id, `카드 매칭 해제 (계약 없음) ₩${formatCurrency(tx.amount)}`);
      return;
    }
    const { txPatch, contractPatch } = reverseCardMatch(tx, c, todayKr());
    await updateCard(tx.id, txPatch);
    await updateContract({ ...c, ...contractPatch });
    void audit.unmatch('card_tx', tx.id, `${c.contractNo} 카드 매칭 해제 ₩${formatCurrency(tx.amount)}`, { contractId: c.id });
  }

  async function handleCardFifo(tx: import('@/lib/types').CardTransaction, contract: Contract) {
    const { txPatch, contractPatch, leftover } = applyFifoCardPayment(tx, contract);
    await updateCard(tx.id, txPatch);
    await updateContract({ ...contract, ...contractPatch });
    void audit.match('card_tx', tx.id, `${contract.contractNo} 카드 선입선출 ₩${formatCurrency(tx.amount)}${leftover > 0 ? ` (잉여 ${formatCurrency(leftover)})` : ''}`, {
      contractId: contract.id, amount: tx.amount, leftover,
    });
    if (leftover > 0) toast.info(`선입선출 적용 — 잉여 ₩${formatCurrency(leftover)} 원 추가 매칭 필요`);
  }

  async function handleAutoMatchCardAll() {
    const results = autoMatchCardAll(cardTx, contracts);
    if (results.length === 0) {
      toast.info('자동 매칭 가능한 카드 매출이 없습니다 (고객명·금액 일치 미매칭 없음)');
      return;
    }
    if (!await showConfirm({ title: `카드 매출 자동 매칭 ${results.length}건 일괄 적용하시겠습니까?` })) return;

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
    toast.success(`${results.length}건 자동 매칭 완료`);
  }

  function handleExportExcel() {
    if (daily.length === 0 && bankTx.length === 0) {
      toast.info('내보낼 거래 없음');
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
      toast.info('자동 매칭 가능한 입금이 없습니다 (거래상대명·금액 일치 미매칭 없음)');
      return;
    }
    const preview = results.slice(0, 10).map((r) =>
      `· ${r.tx.txDate.slice(0, 10)} ${r.tx.amount.toLocaleString('ko-KR')}원 → ${r.candidate.contract.contractNo} ${r.candidate.scheduleSeq}회차`,
    ).join('\n');
    const more = results.length > 10 ? `\n... 외 ${results.length - 10}건` : '';
    if (!await showConfirm({ title: `자동 매칭 ${results.length}건 일괄 적용:\n\n${preview}${more}\n\n진행할까요?` })) return;

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
    toast.success(`${results.length}건 자동 매칭 완료`);
  }

  /** CMS·카드 집금 정산 자동매칭 — 1 입금 ↔ N 묶음 + 수수료 산출 */
  async function handleSettlementMatchAll() {
    const matches = findAllSettlements(bankTx, cardTx);
    if (matches.length === 0) {
      toast.warning('정산 매칭 가능한 집금 입금이 없습니다.\n(CMS·카드 집금건 + 같은날 미정산 묶음 후보 필요)');
      return;
    }
    const preview = matches.slice(0, 8).map((m) => {
      const kindLabel = m.kind === 'cms' ? 'CMS집금' : '카드집금';
      const count = m.bundleBankTxs.length + m.bundleCardTxs.length;
      const feePct = (m.feeRate * 100).toFixed(2);
      return `· ${m.depositTx.txDate.slice(0, 10)} ${kindLabel} ₩${m.netAmount.toLocaleString('ko-KR')}\n   ↳ 묶음 ${count}건 (총액 ₩${m.grossAmount.toLocaleString('ko-KR')}, 수수료 ₩${m.feeAmount.toLocaleString('ko-KR')} / ${feePct}%)`;
    }).join('\n');
    const more = matches.length > 8 ? `\n... 외 ${matches.length - 8}건` : '';
    if (!await showConfirm({ title: `정산 매칭 ${matches.length}건 일괄 적용:\n\n${preview}${more}\n\n진행할까요?` })) return;

    // 일괄 patch
    const bankPatches: Record<string, Partial<BankTransaction>> = {};
    const cardPatches: Record<string, Partial<import('@/lib/types').CardTransaction>> = {};
    for (const m of matches) {
      const settlementId = `stl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const { bankPatches: bp, cardPatches: cp } = buildSettlementPatch(m, settlementId);
      Object.assign(bankPatches, bp);
      Object.assign(cardPatches, cp);
    }
    if (Object.keys(bankPatches).length > 0) await updateManyBankTx(bankPatches);
    if (Object.keys(cardPatches).length > 0) await updateManyCardTx(cardPatches);
    void audit.match('bank_tx', 'batch', `정산 매칭 일괄 ${matches.length}건`, {
      count: matches.length,
      totalFee: matches.reduce((s, m) => s + m.feeAmount, 0),
    });
    toast.success(`${matches.length}건 정산 매칭 완료 — 수수료 총 ₩${matches.reduce((s, m) => s + m.feeAmount, 0).toLocaleString('ko-KR')}`);
  }

  /* ─── 집계 뷰 ─── */
  type DailyRow = {
    key: string; companyCode: string; date: string;
    txCount: number; deposit: number; withdraw: number; netChange: number; endBalance: number;
    depoSubjects: string; drawSubjects: string;
  };
  /**
   * 자금일보 = 계좌(BankTx) + 자동이체(BankTx with CMS source) + 카드매출(CardTx) 3개 소스 통합.
   * 회사·일자 기준으로 입금/출금/순증감/계정과목 소계 집계 → 세무사 전달용.
   * 자동이체는 이미 BankTransaction 으로 들어와 있어 bankTx 안에 포함됨.
   */
  const daily = useMemo<DailyRow[]>(() => {
    const m = new Map<string, DailyRow & { _depo: Record<string, number>; _draw: Record<string, number> }>();

    function bucket(companyCode: string, day: string) {
      const k = `${companyCode}|${day}`;
      let cur = m.get(k);
      if (!cur) {
        cur = {
          key: k, companyCode, date: day,
          txCount: 0, deposit: 0, withdraw: 0, netChange: 0, endBalance: 0,
          depoSubjects: '', drawSubjects: '',
          _depo: {}, _draw: {},
        };
        m.set(k, cur);
      }
      return cur;
    }

    // 1) 계좌 + 자동이체 (BankTransaction)
    for (const t of bankTx) {
      // CMS 묶음: 집금 입금(deposit)과 구성 자동이체(item)가 같은 돈 — item 은 집계 제외 (이중집계 방지)
      if (t.settlementRole === 'item') continue;
      const day = t.txDate.slice(0, 10);
      const companyCode = t.companyCode || (t.matchedContractId && contractById.get(t.matchedContractId)?.company) || '(미지정)';
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

    // 2) 카드 (CardTransaction) — 매출은 입금, 법인카드는 지출 (기존엔 법인카드 지출까지 입금으로 합산됐음)
    for (const t of cardTx) {
      const day = t.txDate.slice(0, 10);
      const companyCode = t.companyCode || (t.matchedContractId && contractById.get(t.matchedContractId)?.company) || '(미지정)';
      const cur = bucket(companyCode, day);
      if ((t.kind ?? '매출') === '매출') {
        cur.deposit += t.amount ?? 0;
        cur._depo['카드매출'] = (cur._depo['카드매출'] ?? 0) + (t.amount ?? 0);
      } else {
        cur.withdraw += t.amount ?? 0;
        cur._draw['법인카드'] = (cur._draw['법인카드'] ?? 0) + (t.amount ?? 0);
      }
      cur.netChange = cur.deposit - cur.withdraw;
      cur.txCount++;
    }

    return Array.from(m.values()).map(({ _depo, _draw, ...rest }) => ({
      ...rest,
      depoSubjects: Object.entries(_depo).map(([s, v]) => `${s} ₩${v.toLocaleString('ko-KR')}`).join(' / '),
      drawSubjects: Object.entries(_draw).map(([s, v]) => `${s} ₩${v.toLocaleString('ko-KR')}`).join(' / '),
    })).sort((a, b) => b.date.localeCompare(a.date) || a.companyCode.localeCompare(b.companyCode));
  }, [bankTx, cardTx, contractById]);

  const dailyTotals = useMemo(() => {
    let inSum = 0, outSum = 0;
    for (const r of daily) { inSum += r.deposit; outSum += r.withdraw; }
    return { inSum, outSum };
  }, [daily]);

  /* ─── 카드 매출 (kind='매출' 만) ─── */
  const cardRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cardTx
      .filter((t) => (t.kind ?? '매출') === '매출')
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

  /* ─── 법인카드 (kind='법인카드' — 직원 지출) ─── */
  const corpCardRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cardTx
      .filter((t) => t.kind === '법인카드')
      .filter((t) => {
        if (q) {
          const hay = `${t.merchant ?? ''} ${t.category ?? ''} ${t.usedBy ?? ''} ${t.source ?? ''} ${t.cardLast4 ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.txDate.localeCompare(a.txDate));
  }, [cardTx, search]);

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <CurrencyKrw size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>입출금 관리</span>
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
            {/* 회사 — 검색창 우측 맨 앞 */}
            {companyOptions.length > 0 && (
              <FilterSelect
                value={companyFilter}
                onChange={setCompanyFilter}
                dataW="md"
                title="회사별 필터"
                options={[
                  { value: 'all', label: '회사: 전체' },
                  ...companyOptions.map((co) => ({ value: co, label: displayCompanyName(co, companyMaster) })),
                ]}
              />
            )}
            <span className="filter-divider" />
            {/* 뷰 chip 그룹 — chip 명은 신규등록 dialog tab 과 동일하게 통일 */}
            <button type="button" className={`chip ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
              <ListChecks /> 입출금
              {bankTx.length > 0 && <span className="chip-count">{bankTx.length}</span>}
            </button>
            <button type="button" className={`chip ${tab === 'autodebit' ? 'active' : ''}`} onClick={() => setTab('autodebit')}>
              자동이체
              {bankTx.filter(isAutoDebit).length > 0 && (
                <span className="chip-count">{bankTx.filter(isAutoDebit).length}</span>
              )}
            </button>
            <button type="button" className={`chip ${tab === 'card' ? 'active' : ''}`} onClick={() => setTab('card')}>
              <CreditCard /> 카드매출
              {cardTx.filter((t) => (t.kind ?? '매출') === '매출').length > 0 && (
                <span className="chip-count">{cardTx.filter((t) => (t.kind ?? '매출') === '매출').length}</span>
              )}
            </button>
            <button type="button" className={`chip ${tab === 'corpcard' ? 'active' : ''}`} onClick={() => setTab('corpcard')}>
              <CreditCard /> 법인카드
              {cardTx.filter((t) => t.kind === '법인카드').length > 0 && (
                <span className="chip-count">{cardTx.filter((t) => t.kind === '법인카드').length}</span>
              )}
            </button>
            <button
              type="button"
              className={`chip chip-tone-amber ${tab === 'summary' ? 'active' : ''}`}
              onClick={() => setTab('summary')}
              title="회사·일자별 입출금 집계 — 세무사 전달용"
            >
              <ChartBar /> 자금일보
              {daily.length > 0 && <span className="chip-count">{daily.length}</span>}
            </button>
            {/* 보조 dropdown 그룹 — 맨 뒤. tab === 'all' 일 때만 노출 */}
            {tab === 'all' && (
              <>
                <span className="filter-divider" />
                <FilterSelect
                  value={direction}
                  onChange={(v) => setDirection(v as 'all' | 'deposit' | 'withdraw')}
                  dataW="md"
                  title="입출금 방향"
                  options={[
                    { value: 'all', label: '입출금 전체' },
                    { value: 'deposit', label: '입금만' },
                    { value: 'withdraw', label: '출금만' },
                  ]}
                />
                <FilterSelect
                  value={filter}
                  onChange={(v) => setFilter(v as 'all' | 'unposted' | 'posted' | 'closed')}
                  dataW="md"
                  title="분개 상태"
                  options={[
                    { value: 'all', label: '상태: 전체' },
                    { value: 'unposted', label: '미분개', hint: counts.unposted > 0 ? `(${counts.unposted})` : undefined },
                    { value: 'posted', label: '분개', hint: counts.posted > 0 ? `(${counts.posted})` : undefined },
                    { value: 'closed', label: '마감', hint: counts.closed > 0 ? `(${counts.closed})` : undefined },
                  ]}
                />
                {subjectOptions.length > 0 && (
                  <FilterSelect
                    value={subjectFilter}
                    onChange={setSubjectFilter}
                    dataW="md"
                    title="계정과목별 필터"
                    options={[
                      { value: 'all', label: '계정: 전체' },
                      ...subjectOptions.map((s) => ({ value: s, label: s })),
                    ]}
                  />
                )}
              </>
            )}
          </div>
        </header>

        <div className="dashboard" style={{ gridTemplateColumns: '1fr' }}>
          <div className="panel">
            <div className="panel-body">
              {(tab === 'all' || tab === 'autodebit') && (
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
                  loading={bankTxLoading}
                />
              )}
              {tab === 'summary' && (
                <SummaryTable rows={daily} companyMaster={companyMaster} />
              )}
              {tab === 'card' && (
                <CardTable rows={cardRows} loading={cardTxLoading} onOpenMatch={setCardMatchTarget} />
              )}
              {tab === 'corpcard' && (
                <CorpCardTable rows={corpCardRows} loading={cardTxLoading} />
              )}
            </div>
          </div>
        </div>

        <BottomBar
          left={
            <>
              <NewButton label="수납 등록" onClick={() => setUploadOpen(true)} />
              {tab === 'all' && (
                <>
                  <ActionSep />
                  <ActionButton label="자동매칭" onClick={handleAutoMatchAll} title="입금 ↔ 계약 자동 매칭" />
                  <ActionButton label="집금 정산" onClick={handleSettlementMatchAll} title="CMS·카드 집금 ↔ 묶음 매칭 + 수수료 자동 계산" />
                </>
              )}
              {tab === 'summary' && (
                <>
                  <ActionSep />
                  <ExcelButton count={daily.length} onClick={handleExportExcel} title={`현재 페이지 목록 (${daily.length}건) 엑셀 다운로드 — 자금일보`} />
                </>
              )}
              {tab === 'card' && (
                <>
                  <ActionSep />
                  <ActionButton label="자동매칭" onClick={handleAutoMatchCardAll} title="카드 매출 ↔ 계약 자동 매칭" />
                </>
              )}
            </>
          }
          right={
            tab === 'all' ? (
              <>
                <span>표시 <strong>{ledgerRows.length}</strong></span>
                <ActionSep />
                {direction !== 'withdraw' && (
                  <span style={{ color: 'var(--green-text)' }}>입금 <strong className="mono">₩{formatCurrency(ledgerRows.reduce((s, r) => s + (r.amount ?? 0), 0))}</strong></span>
                )}
                {direction !== 'deposit' && (
                  <span style={{ color: 'var(--red-text)' }}>출금 <strong className="mono">₩{formatCurrency(ledgerRows.reduce((s, r) => s + (r.withdraw ?? 0), 0))}</strong></span>
                )}
              </>
            ) : tab === 'summary' ? (
              <>
                <span>일자 <strong>{daily.length}</strong></span>
                <ActionSep />
                <span>입금 <strong className="mono">₩{formatCurrency(dailyTotals.inSum)}</strong></span>
                <span>출금 <strong className="mono">₩{formatCurrency(dailyTotals.outSum)}</strong></span>
                <span>순증감 <strong className="mono" style={{ color: dailyTotals.inSum - dailyTotals.outSum < 0 ? 'var(--red-text)' : 'var(--text-main)' }}>₩{formatCurrency(dailyTotals.inSum - dailyTotals.outSum)}</strong></span>
              </>
            ) : tab === 'card' ? (
              <>
                <span>카드 매출 <strong>{cardRows.length}</strong></span>
                <ActionSep />
                <span style={{ color: 'var(--green-text)' }}>매칭 <strong>{cardRows.filter((t) => t.matchedContractId).length}</strong></span>
                <span style={{ color: 'var(--orange-text)' }}>미매칭 <strong>{cardRows.filter((t) => !t.matchedContractId).length}</strong></span>
              </>
            ) : (
              <>
                <span>법인카드 사용 <strong>{corpCardRows.length}</strong></span>
                <ActionSep />
                <span>총액 <strong className="mono">₩{formatCurrency(corpCardRows.reduce((s, t) => s + (t.amount ?? 0), 0))}</strong></span>
                <ActionSep />
                <span style={{ color: 'var(--green-text)' }}>결재 완료 <strong>{corpCardRows.filter((t) => t.approved).length}</strong></span>
                <span style={{ color: 'var(--orange-text)' }}>미결재 <strong>{corpCardRows.filter((t) => !t.approved).length}</strong></span>
              </>
            )
          }
        />

        <CreateDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          visibleModes={['입출금', '자동이체', '카드매출', '법인카드']}
          initialMode={
            tab === 'autodebit' ? '자동이체'
            : tab === 'card' ? '카드매출'
            : tab === 'corpcard' ? '법인카드'
            : '입출금'
          }
        />
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
        <CardMatchDialog
          open={!!cardMatchTarget}
          onOpenChange={(v) => !v && setCardMatchTarget(null)}
          tx={cardMatchTarget}
          contracts={contracts}
          companyMaster={companyMaster}
          onApply={handleCardManualMatch}
          onReverse={handleCardReverse}
          onFifo={handleCardFifo}
        />
      </div>
    </div>
  );
}

/* ─────────────────── 자금일보 — 분개 테이블 ─────────────────── */

function LedgerTable({
  rows, contractById, companyMaster, selectedIds, toggleRow, setSelectedIds, onSubjectChange, onNoteChange, onOpenMatch, loading,
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
  loading?: boolean;
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
          <th style={{ width: 80 }}>회사</th>
          <th style={{ width: 140 }}>계좌</th>
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
            <td colSpan={13} className="muted center" style={{ padding: '32px 10px' }}>
              {loading
                ? '데이터 불러오는 중…'
                : '표시할 거래가 없습니다. 사이드바 → 신규 등록 → 입출금 등록 으로 계좌 엑셀 업로드.'}
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
                <StatusBadge tone={status === 'closed' ? 'green' : status === 'posted' ? 'blue' : 'neutral'}>{STATUS_LABEL[status]}</StatusBadge>
              </td>
              <td className="dim">{t.companyCode ? t.companyCode : (c ? <CompanyCell raw={c.company} master={companyMaster} /> : <CompanyCell raw={undefined} master={companyMaster} />)}</td>
              <td className="mono" style={{ fontSize: 11 }}>{formatAccountLabel(t, companyMaster, c)}</td>
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

function CardTable({ rows, loading, onOpenMatch }: { rows: Array<import('@/lib/types').CardTransaction & { contract?: Contract }>; loading?: boolean; onOpenMatch: (tx: import('@/lib/types').CardTransaction) => void }) {
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
              {loading ? '데이터 불러오는 중…' : '표시할 카드 매출이 없습니다.'}
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
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() => onOpenMatch(r)}
                  title="매칭 확인 / 해제"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11 }}
                >
                  <span className="plate">{r.contract.vehiclePlate}</span>
                  <span>{r.contract.customerName}</span>
                </button>
              ) : (
                <button className="btn btn-sm" type="button" onClick={() => onOpenMatch(r)} title="계약·회차 수동 매칭">
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

/* ─────────────────── 법인카드 (직원 지출) ─────────────────── */

function CorpCardTable({ rows, loading }: { rows: import('@/lib/types').CardTransaction[]; loading?: boolean }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th className="center" style={{ width: 36 }}>결재</th>
          <th style={{ width: 110 }}>사용일</th>
          <th style={{ width: 100 }}>카드사</th>
          <th className="mono" style={{ width: 80 }}>카드4자리</th>
          <th>가맹점</th>
          <th style={{ width: 100 }}>용도</th>
          <th style={{ width: 100 }}>사용자</th>
          <th className="num" style={{ width: 130 }}>금액</th>
          <th style={{ width: 100 }}>승인자</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={9} className="muted center" style={{ padding: '32px 10px' }}>
              {loading
                ? '데이터 불러오는 중…'
                : '등록된 법인카드 사용 내역이 없습니다. 사이드바 → 신규 등록 → 법인카드 등록.'}
            </td>
          </tr>
        ) : rows.map((r) => (
          <tr key={r.id}>
            <td className="center">
              {r.approved ? (
                <CheckCircle size={14} weight="fill" style={{ color: 'var(--green-text)' }} />
              ) : (
                <Warning size={14} weight="fill" style={{ color: 'var(--orange-text)' }} />
              )}
            </td>
            <td className="mono">{formatDate(r.txDate)}</td>
            <td>{r.source || '-'}</td>
            <td className="mono dim">{r.cardLast4 || '-'}</td>
            <td>{r.merchant || '-'}</td>
            <td className="dim">{r.category || '-'}</td>
            <td>{r.usedBy || '-'}</td>
            <td className="num mono">₩{formatCurrency(r.amount)}</td>
            <td className="dim">{r.approver || '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
