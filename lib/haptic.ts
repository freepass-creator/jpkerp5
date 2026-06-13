'use client';

/**
 * 햅틱 피드백 — 모바일 터치 시 짧은 진동.
 *
 * Web Vibration API 기반. 데스크탑·미지원 브라우저는 silent.
 *
 *  · light(): 8ms — 일반 탭/선택
 *  · medium(): 18ms — 저장/완료/확정
 *  · heavy(): 35ms — 삭제/경고
 *  · success(): [10,40,10] — 처리 성공 (긴 진동 + 짧은 끝)
 *  · error(): [60,30,60] — 실패
 */

function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    /* silent */
  }
}

export const haptic = {
  light:   () => vibrate(8),
  medium:  () => vibrate(18),
  heavy:   () => vibrate(35),
  success: () => vibrate([10, 40, 10]),
  error:   () => vibrate([60, 30, 60]),
};
