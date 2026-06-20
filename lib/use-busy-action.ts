'use client';

/**
 * 멱등성 SSOT — 더블탭·중복실행 방지.
 *
 * ERP 30원칙 #16: 같은 작업을 두 번 눌러도 결과 같아야.
 *   결제 더블클릭 = 입금 2건 X.
 *
 * 사용:
 *   const [busy, run] = useBusyAction();
 *   <button disabled={busy} onClick={() => run(async () => { await saveStuff(); })}>
 *     저장
 *   </button>
 *
 *   // 또는 mutator 자체에서:
 *   await run(async () => {
 *     await updatePayment(...);
 *     await updateContract(...);
 *   });
 *
 * 가드:
 *   - run() 이 이미 실행 중이면 중복 호출 즉시 무시 (resolved void).
 *   - 함수 throw 시 busy=false 로 복귀.
 *   - 같은 컴포넌트 내 여러 액션은 액션별 인스턴스 분리.
 */

import { useRef, useState, useCallback } from 'react';

export type BusyAction = readonly [
  busy: boolean,
  run: <T>(fn: () => Promise<T>) => Promise<T | void>,
];

export function useBusyAction(): BusyAction {
  const [busy, setBusy] = useState(false);
  const inflight = useRef(false);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | void> => {
    if (inflight.current) return; // 더블탭 차단 — 첫 호출 끝나기 전 무시
    inflight.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }, []);

  return [busy, run] as const;
}
