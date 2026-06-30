/**
 * CMS 집금 ↔ 자동이체 묶음 자동 매칭.
 *
 *  · CMS 사업자(농협CMS·뱅킹CMS 등)는 N건 자동이체를 1건 통장 입금으로 묶어서 들어옴.
 *  · 수수료가 빠진 금액이 통장에 찍힘 (예: 합계 1,000만원 - 수수료 14,850원 = 9,985,150원 입금).
 *
 * 매칭 기준:
 *   1) 같은 회사
 *   2) 입금건(deposit) 일자 ± dateTolerance 안의 미매칭 자동이체(item) 모음
 *   3) sum(items) 와 deposit 의 차이가 추정 수수료 범위 (0.05% ~ 0.3%) 안
 *   4) 단일 회사 같은 일자에 자동이체 전체 합치는 게 1차 후보
 *
 * 매칭 후 BankTx 일괄 update:
 *   - 입금건: settlementRole='deposit', settlementGrossAmount, settlementFeeAmount, settlementItemCount, settlementId
 *   - 자동이체들: settlementRole='item', settlementId
 */

import type { BankTransaction } from './types';

export type CmsMatchCandidate = {
  /** settlementId 후보 — 매칭 확정 시 입금건 ID 사용 */
  depositId: string;
  depositDate: string;
  depositAmount: number;
  companyCode: string;
  /** 묶음 후보 자동이체들 */
  items: BankTransaction[];
  itemsSum: number;
  estimatedFee: number;        // = itemsSum - depositAmount
  feeRate: number;             // = estimatedFee / itemsSum
  confidence: 'high' | 'medium' | 'low';  // feeRate 가 0.1%±0.05% 면 high
};

const DATE_TOLERANCE_DAYS = 7;  // 영업일+4일 기준 — 주말 낀 경우 최대 7일 달력일
const MIN_FEE_RATE = 0.0005;   // 0.05%
const MAX_FEE_RATE = 0.003;    // 0.3%

function ymd(date: string): string { return (date ?? '').slice(0, 10); }

function dayDiff(a: string, b: string): number {
  const ta = new Date(ymd(a)).getTime();
  const tb = new Date(ymd(b)).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Infinity;
  return Math.abs(ta - tb) / 86400_000;
}

/**
 * 자금일보의 미매칭 거래내역에서 CMS 묶음 매칭 후보 찾기.
 */
export function findCmsMatchCandidates(bankTx: BankTransaction[]): CmsMatchCandidate[] {
  // 단일 패스로 deposit/item 분리 + 회사별 item 색인 — O(N)
  const depositCandidates: BankTransaction[] = [];
  const itemsByCompany = new Map<string, BankTransaction[]>();
  for (const t of bankTx) {
    if (t.settlementId) continue;
    if ((t.amount ?? 0) > 0 && /CMS|집금|cms/i.test(`${t.counterparty ?? ''} ${t.memo ?? ''}`)) {
      depositCandidates.push(t);
    }
    // CMS 개별건 — 전통적인 자동이체 채널 + 계좌 채널로 들어왔지만 계약에 매칭된 입금건도 포함
    // (은행 계좌명세에 CMS 개별건이 계좌 채널로 함께 들어오는 경우 대응)
    const isCmsItem =
      t.source === '자동이체' ||
      (t.source === '계좌' && !!t.matchedContractId && (t.amount ?? 0) > 0);
    if (isCmsItem) {
      const co = t.companyCode ?? '';
      const arr = itemsByCompany.get(co);
      if (arr) arr.push(t);
      else itemsByCompany.set(co, [t]);
    }
  }

  const out: CmsMatchCandidate[] = [];

  for (const dep of depositCandidates) {
    const co = dep.companyCode ?? '';
    const pool = itemsByCompany.get(co);
    if (!pool || pool.length === 0) continue;
    // 일자 ±3일 안의 자동이체 묶음 (회사별 pool 안에서만)
    const sameWindow = pool.filter((it) => dayDiff(it.txDate, dep.txDate) <= DATE_TOLERANCE_DAYS);
    if (sameWindow.length === 0) continue;

    // 1차 후보: 그 window 의 전체 자동이체
    const itemsSum = sameWindow.reduce((s, x) => s + (x.amount ?? 0), 0);
    const fee = itemsSum - (dep.amount ?? 0);
    if (fee <= 0) continue;   // 수수료 음수 = 합계가 입금보다 작음, 매칭 X
    const feeRate = fee / itemsSum;
    if (feeRate < MIN_FEE_RATE / 4 || feeRate > MAX_FEE_RATE * 2) continue;   // 너무 동떨어진 비율 제외

    const confidence: CmsMatchCandidate['confidence'] =
      feeRate >= MIN_FEE_RATE && feeRate <= MAX_FEE_RATE
        ? (Math.abs(feeRate - 0.001) < 0.0005 ? 'high' : 'medium')
        : 'low';

    out.push({
      depositId: dep.id,
      depositDate: ymd(dep.txDate),
      depositAmount: dep.amount ?? 0,
      companyCode: co,
      items: sameWindow,
      itemsSum,
      estimatedFee: fee,
      feeRate,
      confidence,
    });
  }

  // confidence high → medium → low 순
  const order = { high: 0, medium: 1, low: 2 } as const;
  return out.sort((a, b) => order[a.confidence] - order[b.confidence]);
}

/**
 * 매칭 확정 — settlementId 일괄 set.
 *   - 입금건 (role='deposit'): settlementGrossAmount, settlementFeeAmount, settlementItemCount
 *   - items (role='item'): settlementId 만
 */
export function buildSettlementPatches(
  candidate: CmsMatchCandidate,
): { id: string; patch: Partial<BankTransaction> }[] {
  const settlementId = `cms_${candidate.depositId}`;
  const patches: { id: string; patch: Partial<BankTransaction> }[] = [];
  const feeLabel = candidate.estimatedFee > 0
    ? ` (수수료 ${candidate.estimatedFee.toLocaleString('ko-KR')}원 = 총액 ${candidate.itemsSum.toLocaleString('ko-KR')} - 집금액 ${candidate.depositAmount.toLocaleString('ko-KR')})`
    : '';
  patches.push({
    id: candidate.depositId,
    patch: {
      settlementId,
      settlementRole: 'deposit',
      settlementGrossAmount: candidate.itemsSum,
      settlementFeeAmount: candidate.estimatedFee,
      settlementItemCount: candidate.items.length,
      source: 'CMS집금',
      // ★ 세무 중복 방지 — 개별 건에서 이미 대여료수입 인식됨.
      //   집금건은 "수수료비용" 계정으로 전환 (실제 이체금은 채권 정산, 추가 수익 아님).
      subject: 'CMS수수료',
      memo: `CMS집금 정산${feeLabel}`,
    },
  });
  for (const item of candidate.items) {
    patches.push({
      id: item.id,
      patch: {
        settlementId,
        settlementRole: 'item',
      },
    });
  }
  return patches;
}
