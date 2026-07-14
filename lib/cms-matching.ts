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

const DATE_TOLERANCE_DAYS = 7;  // 정산일→집금 영업일+며칠. 주말 낀 경우 최대 7일 달력일
// 실 CMS/PG 수수료대(스위치플랜 실측: 집금 2~3%). 은행CMS는 0.1%대. 정액/면제(0%)도 허용.
const MIN_FEE_RATE = 0;        // 수수료 0(정액·면제)도 허용 — 숫자만 맞으면
const MAX_FEE_RATE = 0.035;    // 3.5% (실 CMS 2~3% + 여유)
const TYPICAL_FEE_LO = 0.005;  // 전형 CMS 수수료대(신뢰도 판정용)
const TYPICAL_FEE_HI = 0.035;

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
    // 집금 입금 후보 — 실계좌엔 "CMS" 라벨이 없고 입금자명이 가상계좌식(예 616에서868)이라
    // 라벨에 의존하지 않고 금액으로 매칭. 라벨 있거나, 계약 미매칭 계좌입금(집금은 개별계약에 안 붙는 묶음).
    const labeled = /CMS|집금|cms/i.test(`${t.counterparty ?? ''} ${t.memo ?? ''}`);
    if ((t.amount ?? 0) > 0 && !t.matchedContractId && (labeled || t.source === '계좌' || t.source === 'CMS집금')) {
      depositCandidates.push(t);
    }
    // CMS 개별건 — 명시적 자동이체 채널만. (계좌채널 매칭입금은 정상 대여료 입금과 구분 불가라
    //   CMS item 으로 오인 시 재실행에서 그 수익이 집금 gross 로 흡수·오귀속됨 → 제외.)
    const isCmsItem = t.source === '자동이체' || t.source === 'CMS';   // 'CMS'=자동이체 업로드 SSOT(create-dialog)
    if (isCmsItem) {
      const co = t.companyCode ?? '';
      const arr = itemsByCompany.get(co);
      if (arr) arr.push(t);
      else itemsByCompany.set(co, [t]);
    }
  }

  const out: CmsMatchCandidate[] = [];
  // 이미 다른 집금에 귀속된 item 은 재사용 금지 — 오버랩 윈도우(집금 2건이 14일내)에서
  //   같은 자동이체가 양쪽 gross 에 이중계상되던 것(수익 과대) 방지.
  const claimedItems = new Set<string>();

  for (const dep of depositCandidates) {
    const co = dep.companyCode ?? '';
    const pool = itemsByCompany.get(co);
    if (!pool || pool.length === 0) continue;
    // 일자 ±윈도우 안의 미귀속 자동이체 묶음 (회사별 pool 안에서만)
    const sameWindow = pool.filter((it) => !claimedItems.has(it.id) && dayDiff(it.txDate, dep.txDate) <= DATE_TOLERANCE_DAYS);
    if (sameWindow.length === 0) continue;

    // 1차 후보: 그 window 의 전체 자동이체
    const itemsSum = sameWindow.reduce((s, x) => s + (x.amount ?? 0), 0);
    const fee = itemsSum - (dep.amount ?? 0);
    if (fee < 0) continue;    // 입금이 합계보다 큼 = 집금 아님(수수료는 차감분이라 입금 ≤ 합계)
    const feeRate = itemsSum > 0 ? fee / itemsSum : 1;
    if (feeRate > MAX_FEE_RATE) continue;   // 수수료율 상한(3.5%) 초과 = 집금 아님
    void MIN_FEE_RATE;

    // 이 집금이 이 item 들을 확정 소비 — 이후 집금이 재사용 못 하게 claim
    for (const it of sameWindow) claimedItems.add(it.id);

    // 신뢰도 — 전형 CMS 수수료대(0.5~3.5%) + 2건 이상 묶음이면 high(실 집금 패턴).
    // 수수료 매우 낮음(≤0.5%)은 우연 일치(법인이체 등) 가능 → medium 이하로.
    const confidence: CmsMatchCandidate['confidence'] =
      (feeRate >= TYPICAL_FEE_LO && feeRate <= TYPICAL_FEE_HI && sameWindow.length >= 2) ? 'high'
      : (sameWindow.length >= 2 || feeRate >= TYPICAL_FEE_LO) ? 'medium'
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
