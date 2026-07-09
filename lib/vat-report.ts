/**
 * 부가세 신고 기초자료 (H16) — GL 은 그대로 두고 별도 산출.
 *
 * 관례(코드 전반 일치): 대여료·카드매출은 VAT 포함가(공급대가). 공급가액 = round(total / 1.1), 세액 = total - 공급가액.
 * GL 분개(buildBankJournal/buildCardJournal)를 재사용해 손익 화면과 과세매출 인식을 일치시킴.
 *
 * ⚠ 매입세액은 "세금계산서 수취 가능성 높은 비용"만 화이트리스트로 추정 — 면세(보험료·제세공과금·인건비),
 *   불공제(과태료), 공제여부 복잡(차량매입)은 제외. 실제 신고는 세무 검토 필요 = 기초자료.
 */

import type { BankTransaction, CardTransaction } from '@/lib/types';
import { buildBankJournal, buildCardJournal, ACCOUNTS } from '@/lib/gl-entries';

/** VAT 포함가 → 공급가액/세액 분리 (÷1.1 반올림). tax-invoice-export 와 동일 관례. */
export function splitVat(total: number): { supply: number; vat: number } {
  const supply = Math.round(total / 1.1);
  return { supply, vat: total - supply };
}

/** 과세매출 계정 — 대여료·카드매출(둘 다 대여료 성격, VAT 포함). 면책금·보험금·이자·잡수입은 성격상 제외. */
export const TAXABLE_SALES_ACCOUNTS = new Set(['REVENUE_RENTAL', 'REVENUE_CARD']);
/** 과세매입 화이트리스트 — 세금계산서 수취 통상. 면세/불공제/복잡 계정 제외. */
export const TAXABLE_PURCHASE_ACCOUNTS = new Set([
  'EXP_REPAIR', 'EXP_SUPPLIES', 'EXP_FUEL', 'EXP_TOLL', 'EXP_PARKING',
  'EXP_LEASE', 'EXP_COMM', 'EXP_ADMIN', 'EXP_FEE',
]);

export type VatLine = { account: string; accountName: string; total: number; supply: number; vat: number; count: number };
export type VatReport = {
  from: string;
  to: string;
  salesLines: VatLine[];
  purchaseLines: VatLine[];
  salesTotal: number;
  salesSupply: number;
  salesVat: number;
  purchaseTotal: number;
  purchaseSupply: number;
  purchaseVat: number;
  /** 납부예상세액 = 매출세액 − 매입세액(추정). 양수 = 납부, 음수 = 환급. */
  netVatPayable: number;
};

function aggToLines(agg: Map<string, { total: number; count: number }>): VatLine[] {
  const lines: VatLine[] = [];
  for (const [account, { total, count }] of agg) {
    const { supply, vat } = splitVat(total);
    lines.push({ account, accountName: ACCOUNTS[account]?.name ?? account, total, supply, vat, count });
  }
  return lines.sort((a, b) => b.total - a.total);
}

/** 기간 [from, to] (YYYY-MM-DD, 양끝 포함) 의 부가세 신고 기초자료 산출. */
export function computeVatReport(
  bankTx: BankTransaction[],
  cardTx: CardTransaction[],
  from: string,
  to: string,
): VatReport {
  const inRange = (d?: string) => !!d && d >= from && d <= to;
  const salesAgg = new Map<string, { total: number; count: number }>();
  const purchaseAgg = new Map<string, { total: number; count: number }>();
  const bump = (m: Map<string, { total: number; count: number }>, key: string, amt: number) => {
    const cur = m.get(key) ?? { total: 0, count: 0 };
    cur.total += amt;
    cur.count += 1;
    m.set(key, cur);
  };

  const classify = (debit: string, credit: string, amount: number) => {
    // 과세매출: CASH 차변 ↔ 과세 수익 대변
    if (debit === 'CASH' && TAXABLE_SALES_ACCOUNTS.has(credit)) bump(salesAgg, credit, amount);
    // 과세매입: 과세 비용 차변 ↔ CASH 대변 (실 현금지출분만)
    if (credit === 'CASH' && TAXABLE_PURCHASE_ACCOUNTS.has(debit)) bump(purchaseAgg, debit, amount);
  };

  for (const t of bankTx) {
    if (!inRange(t.txDate)) continue;
    for (const j of buildBankJournal(t)) classify(j.debitAccount, j.creditAccount, j.amount);
  }
  for (const t of cardTx) {
    if (!inRange(t.txDate)) continue;
    const j = buildCardJournal(t);
    if (j) classify(j.debitAccount, j.creditAccount, j.amount);
  }

  const salesLines = aggToLines(salesAgg);
  const purchaseLines = aggToLines(purchaseAgg);
  const sum = (lines: VatLine[], k: 'total' | 'supply' | 'vat') => lines.reduce((s, l) => s + l[k], 0);

  const salesVat = sum(salesLines, 'vat');
  const purchaseVat = sum(purchaseLines, 'vat');

  return {
    from,
    to,
    salesLines,
    purchaseLines,
    salesTotal: sum(salesLines, 'total'),
    salesSupply: sum(salesLines, 'supply'),
    salesVat,
    purchaseTotal: sum(purchaseLines, 'total'),
    purchaseSupply: sum(purchaseLines, 'supply'),
    purchaseVat,
    netVatPayable: salesVat - purchaseVat,
  };
}

/** 연·분기 → [from, to] 기간. 1기=1~6월, 2기=7~12월 (부가세 신고 기준). 분기별도 지원. */
export function vatPeriodRange(year: number, period: '1기' | '2기' | '1분기' | '2분기' | '3분기' | '4분기'): { from: string; to: string } {
  const p = (m: number) => String(m).padStart(2, '0');
  const last = (y: number, m: number) => new Date(y, m, 0).getDate(); // m: 1-based month → 말일
  const map: Record<string, [number, number]> = {
    '1기': [1, 6], '2기': [7, 12],
    '1분기': [1, 3], '2분기': [4, 6], '3분기': [7, 9], '4분기': [10, 12],
  };
  const [sm, em] = map[period];
  return { from: `${year}-${p(sm)}-01`, to: `${year}-${p(em)}-${p(last(year, em))}` };
}
