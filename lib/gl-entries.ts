/**
 * 총계정원장 (GL) — BankTx/CardTx 자동 분개.
 *
 *  · 모든 BankTx/CardTx 거래 1건 → 분개 2칸 (차변·대변)
 *  · 계정과목(subject) → debitAccount / creditAccount 표준 매핑
 *  · 입금 거래(amount > 0)   = 차) 현금 / 대) 수익·부채 계정
 *  · 출금 거래(withdraw > 0) = 차) 비용·자산·부채 계정 / 대) 현금
 *  · '계좌이체'·'회사간이체' 등 internal 은 GL 제외 (자본 이동, 손익 무관)
 *
 *  복식부기 원칙: 차변 합 = 대변 합. 잔액 = 차변 합 - 대변 합.
 *   · 자산·비용 계정: 잔액 > 0 = 정상 (차변 잔액)
 *   · 부채·자본·수익 계정: 잔액 < 0 = 정상 (대변 잔액)
 */

import type { BankTransaction, CardTransaction } from '@/lib/types';

export type AccountClass = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export type AccountDef = {
  code: string;
  name: string;
  class: AccountClass;
};

/** 회계 계정 표준 (한국 일반기업회계기준 약식) */
export const ACCOUNTS: Record<string, AccountDef> = {
  CASH: { code: '101', name: '현금및예금', class: 'asset' },
  AR: { code: '108', name: '매출채권', class: 'asset' },
  RECEIVABLE_RECOURSE: { code: '120', name: '구상채권', class: 'asset' },
  VEHICLE: { code: '208', name: '차량운반구', class: 'asset' },
  DEPOSIT_LIAB: { code: '301', name: '보증금부채', class: 'liability' },
  REVENUE_RENTAL: { code: '401', name: '대여료수입', class: 'revenue' },
  REVENUE_OTHER: { code: '402', name: '잡수입', class: 'revenue' },
  REVENUE_INTEREST: { code: '410', name: '이자수익', class: 'revenue' },
  REVENUE_INDEMNITY: { code: '403', name: '면책금수입', class: 'revenue' },
  REVENUE_INSURANCE: { code: '404', name: '보험금수입', class: 'revenue' },
  REVENUE_CARD: { code: '405', name: '카드매출', class: 'revenue' },
  REFUND_RECEIVED: { code: '406', name: '환불수령', class: 'revenue' },
  EXP_REPAIR: { code: '501', name: '정비비', class: 'expense' },
  EXP_SUPPLIES: { code: '502', name: '소모품비', class: 'expense' },
  EXP_INSURANCE: { code: '503', name: '보험료', class: 'expense' },
  EXP_TAX: { code: '504', name: '제세공과금', class: 'expense' },
  EXP_RENT_REFUND: { code: '505', name: '대여료환불', class: 'expense' },
  EXP_PENALTY: { code: '506', name: '과태료', class: 'expense' },
  EXP_FUEL: { code: '507', name: '연료비', class: 'expense' },
  EXP_PARKING: { code: '508', name: '주차비', class: 'expense' },
  EXP_TOLL: { code: '509', name: '통행료', class: 'expense' },
  EXP_LABOR: { code: '510', name: '인건비', class: 'expense' },
  EXP_LEASE: { code: '511', name: '임차료', class: 'expense' },
  EXP_COMM: { code: '512', name: '통신비', class: 'expense' },
  EXP_ADMIN: { code: '513', name: '관리비', class: 'expense' },
  EXP_FEE: { code: '514', name: '수수료', class: 'expense' },
  EXP_MISC: { code: '599', name: '잡지출', class: 'expense' },
  UNCLASSIFIED: { code: '999', name: '미지정', class: 'expense' },
};

/** 입금 거래 (subject → 대변 계정). 차변은 항상 CASH. */
const RECEIPT_TO_ACCOUNT: Record<string, string> = {
  '대여료수입': 'REVENUE_RENTAL',
  '보증금수령': 'DEPOSIT_LIAB',     // 부채 ↑
  '면책금수령': 'REVENUE_INDEMNITY',
  '보험금수령': 'REVENUE_INSURANCE',
  '카드매출': 'REVENUE_CARD',
  '잡수입': 'REVENUE_OTHER',
  '이자수익': 'REVENUE_INTEREST',
  '환불수령': 'REFUND_RECEIVED',
};

/** 출금 거래 (subject → 차변 계정). 대변은 항상 CASH. */
const EXPENSE_TO_ACCOUNT: Record<string, string> = {
  '차량매입': 'VEHICLE',             // 자산 ↑
  '정비비': 'EXP_REPAIR',
  '소모품비': 'EXP_SUPPLIES',
  '보험료': 'EXP_INSURANCE',
  '제세공과금': 'EXP_TAX',
  '대여료환불': 'EXP_RENT_REFUND',
  '보증금반환': 'DEPOSIT_LIAB',      // 부채 ↓
  '과태료납부': 'EXP_PENALTY',
  '연료비': 'EXP_FUEL',
  '주차비': 'EXP_PARKING',
  '통행료': 'EXP_TOLL',
  '인건비': 'EXP_LABOR',
  '임차료': 'EXP_LEASE',
  '통신비': 'EXP_COMM',
  '관리비': 'EXP_ADMIN',
  '수수료': 'EXP_FEE',
  '잡지출': 'EXP_MISC',
};

const INTERNAL_SUBJECTS_SET = new Set(['계좌이체', '회사간이체', '대표자가지급', '대표자가수금']);

export type JournalEntry = {
  /** 원본 거래 ID (BankTx / CardTx) */
  txId: string;
  source: 'bank' | 'card';
  date: string;
  amount: number;
  debitAccount: string;     // accounts key
  creditAccount: string;
  counterparty?: string;
  memo?: string;
  companyCode?: string;
  matchedContractId?: string;
};

/** BankTx 1건 → 분개 1건 또는 0건 (internal 은 skip) */
export function buildBankJournal(t: BankTransaction): JournalEntry | null {
  const subject = t.subject ?? '';
  if (INTERNAL_SUBJECTS_SET.has(subject)) return null;
  // CMS 집금: 묶음(deposit)이 대표 현금흐름 — 구성건(item)까지 분개하면 현금·수익 이중계상.
  //   payments/finance-daily/data-integrity 와 동일 규칙 (settlementRole==='item' 제외).
  if (t.settlementRole === 'item') return null;

  const isDeposit = (t.amount ?? 0) > 0;
  const isWithdraw = (t.withdraw ?? 0) > 0;
  if (!isDeposit && !isWithdraw) return null;

  if (isDeposit) {
    const account = RECEIPT_TO_ACCOUNT[subject] ?? 'UNCLASSIFIED';
    return {
      txId: t.id,
      source: 'bank',
      date: t.txDate,
      amount: t.amount ?? 0,
      debitAccount: 'CASH',
      creditAccount: account,
      counterparty: t.counterparty,
      memo: t.memo,
      companyCode: t.companyCode,
      matchedContractId: t.matchedContractId,
    };
  }
  const account = EXPENSE_TO_ACCOUNT[subject] ?? 'UNCLASSIFIED';
  return {
    txId: t.id,
    source: 'bank',
    date: t.txDate,
    amount: t.withdraw ?? 0,
    debitAccount: account,
    creditAccount: 'CASH',
    counterparty: t.counterparty,
    memo: t.memo,
    companyCode: t.companyCode,
    matchedContractId: t.matchedContractId,
  };
}

/** CardTx 1건 → 분개 1건. 매출(kind=매출) = 카드매출 수익. 법인카드 = category 비용. */
export function buildCardJournal(t: CardTransaction): JournalEntry | null {
  const isSales = (t.kind ?? '매출') === '매출';
  // 취소전표(음수 매출)는 버리지 않고 그대로 통과 — 같은 차·대변 계정에 음수로 집계돼
  // 원매출과 자동 상계(카드매출·법인카드 지출 과대 방지). 0 만 무의미하므로 제외.
  if ((t.amount ?? 0) === 0) return null;
  if (isSales) {
    return {
      txId: t.id,
      source: 'card',
      date: t.txDate,
      amount: t.amount ?? 0,
      debitAccount: 'CASH',
      creditAccount: 'REVENUE_CARD',
      counterparty: t.customerName,
      memo: t.approvalNo ? `승인 ${t.approvalNo}` : '카드매출',
      companyCode: t.companyCode,
      matchedContractId: t.matchedContractId,
    };
  }
  // 법인카드 지출 — category 또는 매핑된 expense
  const category = t.category ?? '';
  const accountKey = EXPENSE_TO_ACCOUNT[category] ?? 'EXP_MISC';
  return {
    txId: t.id,
    source: 'card',
    date: t.txDate,
    amount: t.amount ?? 0,
    debitAccount: accountKey,
    creditAccount: 'CASH',
    counterparty: t.merchant ?? t.customerName,
    memo: category || '법인카드 지출',
    companyCode: t.companyCode,
    matchedContractId: t.matchedContractId,
  };
}

export function buildAllJournals(
  bankTx: BankTransaction[],
  cardTx: CardTransaction[],
): JournalEntry[] {
  const out: JournalEntry[] = [];
  for (const t of bankTx) {
    const j = buildBankJournal(t);
    if (j) out.push(j);
  }
  for (const t of cardTx) {
    const j = buildCardJournal(t);
    if (j) out.push(j);
  }
  return out;
}

export type LedgerSummary = {
  accountKey: string;
  account: AccountDef;
  debit: number;
  credit: number;
  balance: number;             // debit - credit (자산·비용은 양수가 정상)
  normalSide: 'debit' | 'credit';
  entryCount: number;
};

/** 계정별 차변·대변·잔액 집계 */
export function summarizeByAccount(journals: JournalEntry[]): LedgerSummary[] {
  const byAccount = new Map<string, { debit: number; credit: number; count: number }>();
  for (const j of journals) {
    const d = byAccount.get(j.debitAccount) ?? { debit: 0, credit: 0, count: 0 };
    d.debit += j.amount;
    d.count += 1;
    byAccount.set(j.debitAccount, d);
    const c = byAccount.get(j.creditAccount) ?? { debit: 0, credit: 0, count: 0 };
    c.credit += j.amount;
    c.count += 1;
    byAccount.set(j.creditAccount, c);
  }
  const out: LedgerSummary[] = [];
  for (const [key, agg] of byAccount) {
    const account = ACCOUNTS[key] ?? ACCOUNTS.UNCLASSIFIED;
    const normalSide: 'debit' | 'credit' =
      account.class === 'asset' || account.class === 'expense' ? 'debit' : 'credit';
    out.push({
      accountKey: key,
      account,
      debit: agg.debit,
      credit: agg.credit,
      balance: agg.debit - agg.credit,
      normalSide,
      entryCount: agg.count,
    });
  }
  // 정렬: class 순 (asset → liability → equity → revenue → expense), 그 안에서 잔액 큰 순
  const classOrder: Record<AccountClass, number> = {
    asset: 0, liability: 1, equity: 2, revenue: 3, expense: 4,
  };
  return out.sort((a, b) => {
    const co = classOrder[a.account.class] - classOrder[b.account.class];
    if (co !== 0) return co;
    return Math.abs(b.balance) - Math.abs(a.balance);
  });
}

export const CLASS_LABEL: Record<AccountClass, string> = {
  asset: '자산',
  liability: '부채',
  equity: '자본',
  revenue: '수익',
  expense: '비용',
};
