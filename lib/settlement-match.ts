/**
 * CMS·카드 집금 정산 매칭.
 *
 * 시나리오:
 *   · CMS집금: 통장에 "CMS집금" 1건 들어옴 = 그날 출금된 개별 CMS 거래 N건 합계 - CMS 수수료
 *   · 카드집금: 통장에 "카드사 입금" 1건 = 카드 매출 N건 합계 - PG 수수료
 *
 * 정산건(Deposit BankTransaction) ↔ 묶음(개별 BankTx 또는 CardTx) 1:N 매칭.
 * 묶음 총액 - 실 입금액 = 수수료.
 *
 * 매칭 후보 식별:
 *   · 정산 입금건: counterparty/memo/source 에 'CMS' / '집금' / '카드' / 'PG사명' 포함
 *   · 묶음 후보: 같은 회사 + 같은 일자(±1일) + 미정산 + source 일치
 *
 * 매칭 허용 오차:
 *   · 기본 수수료율 0% ~ 5% (gross > deposit, fee >= 0)
 *   · 음수 fee (deposit > gross) 는 매칭 안 함
 */

import type { BankTransaction, CardTransaction } from './types';

export type SettlementKind = 'cms' | 'card';

export type SettlementMatch = {
  kind: SettlementKind;
  depositTx: BankTransaction;          // 통장 정산 입금건
  bundleBankTxs: BankTransaction[];    // CMS 묶음 (kind='cms' 일 때)
  bundleCardTxs: CardTransaction[];    // 카드 묶음 (kind='card' 일 때)
  grossAmount: number;                 // 묶음 총액
  netAmount: number;                   // 실 입금액
  feeAmount: number;                   // 수수료 = gross - net
  feeRate: number;                     // 수수료율
};

function daysDiff(a: string, b: string): number {
  const da = new Date(a.slice(0, 10)).getTime();
  const db = new Date(b.slice(0, 10)).getTime();
  return Math.abs((da - db) / (1000 * 60 * 60 * 24));
}

/** counterparty/memo/source 합쳐 키워드 포함 여부 */
function hayMatches(t: BankTransaction, ...keywords: string[]): boolean {
  const hay = `${t.counterparty ?? ''} ${t.memo ?? ''} ${t.source ?? ''} ${t.method ?? ''}`.toLowerCase();
  return keywords.some((k) => hay.includes(k.toLowerCase()));
}

/** 통장 입금건이 CMS 집금처럼 보이는가 */
export function isCmsSettlementDeposit(t: BankTransaction): boolean {
  if ((t.amount ?? 0) <= 0) return false;
  return hayMatches(t, 'CMS', '집금');
}

/** 통장 입금건이 카드 집금처럼 보이는가 */
export function isCardSettlementDeposit(t: BankTransaction): boolean {
  if ((t.amount ?? 0) <= 0) return false;
  return hayMatches(t, 'PG', '카드사', '카드매출', '신용카드', 'VAN', '비씨카드', 'KB카드', '신한카드', '현대카드', '롯데카드', '삼성카드');
}

/** BankTransaction 이 개별 CMS 거래인가 (정산 후보) */
export function isCmsItemTx(t: BankTransaction): boolean {
  if (t.settlementId) return false; // 이미 정산
  if ((t.amount ?? 0) <= 0) return false;
  return hayMatches(t, 'CMS', '자동이체');
}

/**
 * CMS 집금 정산 후보 매칭 — 단순 그리디.
 *  · 같은 회사 + 같은 날(±maxDaysDiff) 의 미정산 CMS 거래 전부 묶음 후보로
 *  · 묶음 총액 >= 입금액 && (총액 - 입금액) / 총액 <= maxFeeRate 면 OK
 */
export function findCmsSettlement(
  deposit: BankTransaction,
  allBankTx: readonly BankTransaction[],
  opts: { maxDaysDiff?: number; maxFeeRate?: number } = {},
): SettlementMatch | null {
  if (!isCmsSettlementDeposit(deposit)) return null;
  const maxDays = opts.maxDaysDiff ?? 1;
  const maxFeeRate = opts.maxFeeRate ?? 0.05;

  const candidates = allBankTx.filter((t) =>
    t.id !== deposit.id
    && isCmsItemTx(t)
    && (!deposit.companyCode || !t.companyCode || t.companyCode === deposit.companyCode)
    && daysDiff(t.txDate, deposit.txDate) <= maxDays,
  );
  if (candidates.length === 0) return null;

  const gross = candidates.reduce((s, t) => s + (t.amount ?? 0), 0);
  const net = deposit.amount ?? 0;
  const fee = gross - net;
  const feeRate = gross > 0 ? fee / gross : 0;

  if (fee < 0 || feeRate > maxFeeRate) return null;

  return {
    kind: 'cms',
    depositTx: deposit,
    bundleBankTxs: candidates,
    bundleCardTxs: [],
    grossAmount: gross,
    netAmount: net,
    feeAmount: fee,
    feeRate,
  };
}

/**
 * 카드 집금 정산 후보 매칭.
 *  · 같은 회사(companyCode 일치 또는 둘 중 하나가 없음) + 같은 날(±maxDaysDiff) 의 미정산 카드 매출 전부 묶음
 *  · 묶음 총액 >= 입금액 && 수수료율 <= maxFeeRate
 */
export function findCardSettlement(
  deposit: BankTransaction,
  allCardTx: readonly CardTransaction[],
  opts: { maxDaysDiff?: number; maxFeeRate?: number } = {},
): SettlementMatch | null {
  if (!isCardSettlementDeposit(deposit)) return null;
  const maxDays = opts.maxDaysDiff ?? 3;       // 카드는 영업일 기준 D+2~3 보통
  const maxFeeRate = opts.maxFeeRate ?? 0.05;

  const candidates = allCardTx.filter((t) =>
    (t.kind ?? '매출') === '매출'
    && !t.settlementId
    && (t.amount ?? 0) > 0
    && (!deposit.companyCode || !t.companyCode || t.companyCode === deposit.companyCode)
    && daysDiff(t.txDate, deposit.txDate) <= maxDays,
  );
  if (candidates.length === 0) return null;

  const gross = candidates.reduce((s, t) => s + (t.amount ?? 0), 0);
  const net = deposit.amount ?? 0;
  const fee = gross - net;
  const feeRate = gross > 0 ? fee / gross : 0;

  if (fee < 0 || feeRate > maxFeeRate) return null;

  return {
    kind: 'card',
    depositTx: deposit,
    bundleBankTxs: [],
    bundleCardTxs: candidates,
    grossAmount: gross,
    netAmount: net,
    feeAmount: fee,
    feeRate,
  };
}

/**
 * 전체 일괄 — 모든 정산 후보 deposit 에 대해 매칭 시도.
 * 결과 = 적용 가능한 매칭 리스트.
 */
export function findAllSettlements(
  allBankTx: readonly BankTransaction[],
  allCardTx: readonly CardTransaction[],
  opts: { maxDaysDiff?: number; maxFeeRate?: number } = {},
): SettlementMatch[] {
  const result: SettlementMatch[] = [];
  // 이미 정산 처리된 deposit 은 제외
  const deposits = allBankTx.filter((t) =>
    t.settlementRole !== 'deposit'
    && !t.settlementId
    && (isCmsSettlementDeposit(t) || isCardSettlementDeposit(t)),
  );

  // 매칭 결과로 이미 사용된 item 들을 추적 (한 묶음에 1번만)
  const usedBankIds = new Set<string>();
  const usedCardIds = new Set<string>();

  for (const d of deposits) {
    if (isCmsSettlementDeposit(d)) {
      const m = findCmsSettlement(
        d,
        allBankTx.filter((t) => !usedBankIds.has(t.id)),
        opts,
      );
      if (m) {
        m.bundleBankTxs.forEach((t) => usedBankIds.add(t.id));
        result.push(m);
      }
    } else if (isCardSettlementDeposit(d)) {
      const m = findCardSettlement(
        d,
        allCardTx.filter((t) => !usedCardIds.has(t.id)),
        opts,
      );
      if (m) {
        m.bundleCardTxs.forEach((t) => usedCardIds.add(t.id));
        result.push(m);
      }
    }
  }

  return result;
}

/** SettlementMatch → DB patch (한 번에 update 할 수 있게 분리) */
export function buildSettlementPatch(m: SettlementMatch, settlementId: string): {
  bankPatches: Record<string, Partial<BankTransaction>>;
  cardPatches: Record<string, Partial<CardTransaction>>;
} {
  const bankPatches: Record<string, Partial<BankTransaction>> = {};
  const cardPatches: Record<string, Partial<CardTransaction>> = {};

  // 집금건(deposit)
  bankPatches[m.depositTx.id] = {
    settlementId,
    settlementRole: 'deposit',
    settlementGrossAmount: m.grossAmount,
    settlementFeeAmount: m.feeAmount,
    settlementItemCount: m.bundleBankTxs.length + m.bundleCardTxs.length,
    // 수수료가 있으면 입금건의 적요에 표시 (선택)
    subject: m.depositTx.subject ?? (m.kind === 'cms' ? 'CMS집금' : '카드매출'),
  };

  // 묶음 CMS items
  for (const t of m.bundleBankTxs) {
    bankPatches[t.id] = { settlementId, settlementRole: 'item' };
  }
  // 묶음 카드 items
  for (const t of m.bundleCardTxs) {
    cardPatches[t.id] = { settlementId };
  }

  return { bankPatches, cardPatches };
}
