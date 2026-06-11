'use client';

/**
 * usePersistentState — 페이지 이동 후에도 필터/UI state 유지.
 *
 *  · 페이지 이동(다른 페이지 갔다 돌아옴) 시 마지막 값 복원
 *  · 새로고침에도 유지 (localStorage)
 *  · 초기화 = setValue(initial) 호출
 *
 *  설계 — setter wrap 패턴:
 *  · localStorage 쓰기는 setter 호출 시점에만 (매 렌더 X)
 *  · useEffect 없음 → React StrictMode 의 dev 2회 실행 영향 X
 *  · 매 렌더 setItem 누적 차단 회피 (37개 필터 × 매 렌더 → 0 호출)
 *
 *  사용:
 *    const [quickFilter, setQuickFilter] = usePersistentState('filter:asset:quick', 'all');
 *    // 초기화: setQuickFilter('all')
 */

import { useCallback, useState } from 'react';

export function usePersistentState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  // setter 호출 시점에만 localStorage 쓰기 — 매 렌더 setItem 누적 회피
  const persistentSetter = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      try {
        if (typeof window !== 'undefined') localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        // 저장 실패는 무시 — quota 등
      }
      return resolved;
    });
  }, [key]);

  return [value, persistentSetter];
}
