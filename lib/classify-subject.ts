/**
 * 입금 계정과목 자동분류 — 은행/CMS 입금행에 "무조건 대여료수입"을 주입하던 것을
 * 거래상대·적요·금액·계약매칭 신호로 추론한다.
 *
 * 원칙:
 *   · 기본값은 여전히 '대여료수입'(하위호환) — 명확한 신호가 있을 때만 재분류.
 *   · 데이터는 홀로 안 산다([[feedback_data_always_links]]): 계약 매칭 + 월대여료 근사면 대여료수입 확정,
 *     법인/회사 상대 대액이면 법인간이체 등 — 관계로 계정을 판단.
 *   · confidence 를 함께 반환 → 낮으면 사람이 확인(능동 검증).
 * 감사 지적: 보증금·정산·법인간이체까지 대여료수입으로 뭉뚱그려 회계 왜곡([[project_jpkerp5_ingestion_audit]]).
 */

export type DepositSubject =
  | '대여료수입' | '보증금' | '정산입금' | '법인간이체' | '이자입금' | '기타입금';

export interface DepositSubjectResult {
  subject: DepositSubject;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/** 회사/법인 상대 추정 힌트 — 법인간이체 판단 */
const COMPANY_HINTS = ['제이피케이', 'jpk', '오토', '캐피탈', '리스', '렌터카', '모터스', '주식회사', '(주)', '유한회사'];

export interface DepositClassifyInput {
  counterparty?: string;
  memo?: string;
  amount?: number;
  /** 후처리(enrich)에서 알 수 있으면 전달 — 관계 기반 확정 */
  matchedContractId?: string;
  monthlyRent?: number;
}

export function classifyDepositSubject(tx: DepositClassifyInput): DepositSubjectResult {
  const text = `${tx.counterparty ?? ''} ${tx.memo ?? ''}`;
  const lower = text.toLowerCase();
  const amt = tx.amount ?? 0;

  // 1) 명시 키워드 — 가장 강한 신호
  if (/보증금|디파짓|예치|deposit/i.test(text)) return { subject: '보증금', confidence: 'high', reason: '보증금 키워드' };
  if (/정산|반환|환급|환불|refund/i.test(text)) return { subject: '정산입금', confidence: 'high', reason: '정산/환급 키워드' };
  if (/이자|리워드|캐시백|cashback/i.test(text)) return { subject: '이자입금', confidence: 'medium', reason: '이자/리워드 키워드' };

  // 2) 관계 확정 — 계약 매칭 + 월대여료 근사
  if (tx.matchedContractId && tx.monthlyRent && amt > 0 &&
      Math.abs(amt - tx.monthlyRent) <= Math.max(10_000, tx.monthlyRent * 0.1)) {
    return { subject: '대여료수입', confidence: 'high', reason: '계약매칭+월대여료 근사' };
  }

  // 3) 법인/회사 상대 + 대액 → 법인간이체 의심
  const looksCompany = COMPANY_HINTS.some((h) => lower.includes(h.toLowerCase()));
  if (looksCompany && amt >= 5_000_000) return { subject: '법인간이체', confidence: 'medium', reason: '법인 상대+대액(대여료 아님 의심)' };

  // 4) 계약 미매칭 대액 라운드 → 대여료 아님 의심
  if (!tx.matchedContractId && amt >= 10_000_000 && amt % 1_000_000 === 0) {
    return { subject: '기타입금', confidence: 'low', reason: '대액 라운드+계약 미매칭(대여료 아님 의심)' };
  }

  // 5) 기본 — 대여료수입(하위호환)
  return { subject: '대여료수입', confidence: 'low', reason: '기본(입금)' };
}
