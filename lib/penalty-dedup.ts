/**
 * 과태료 도메인 중복 키 정의 + dedup 통합 헬퍼.
 *
 * 키 우선순위:
 *   1) 고지서번호 (notice_no) — 가장 확실. 일치하면 100% 동일 고지서.
 *   2) 차량번호 + 위반일시 (car_number + date) — 보조. notice_no 없는 경우 폴백.
 *
 * 공통 dedup 엔진 (lib/dedup.ts) 위에 도메인 키만 얹은 얇은 wrapper.
 */
import { dedupAgainst, type DedupResult, type KeyFn } from './dedup';
import type { PenaltyWorkItem } from './penalty-pdf';

export const penaltyKeyFn: KeyFn<PenaltyWorkItem> = (item) => [
  item.notice_no ? `NO:${item.notice_no}` : null,
  item.car_number && item.date ? `CD:${item.car_number}|${item.date}` : null,
];

/** 신규 batch 를 기존 항목 (처리중 + 처리완료 모두) 와 비교 */
export function dedupPenalties(
  newItems: PenaltyWorkItem[],
  existing: PenaltyWorkItem[],
): DedupResult<PenaltyWorkItem> {
  return dedupAgainst(newItems, existing, penaltyKeyFn);
}

/** 사용자에게 보여줄 중복 사유 한 줄 요약 */
export function describeDuplicate(matchedKey: string, source: 'existing' | 'batch'): string {
  const where = source === 'existing' ? '기존' : '같은 배치';
  if (matchedKey.startsWith('NO:')) {
    return `${where}에 동일 고지서번호 (${matchedKey.slice(3)}) 가 있음`;
  }
  if (matchedKey.startsWith('CD:')) {
    return `${where}에 동일 차량+위반일시 (${matchedKey.slice(3)}) 가 있음`;
  }
  return `${where}에 중복 항목 있음`;
}
