'use client';

/**
 * useLocalStorageState — 페이지 이동 후에도 필터/UI state 유지.
 *
 *  · 페이지 이동(다른 페이지 갔다 돌아옴) 시 마지막 값 복원
 *  · 새로고침에도 유지 (localStorage)
 *  · 초기화 = setValue(initial) 호출
 *
 *  사용:
 *    const [quickFilter, setQuickFilter] = usePersistentState('filter:asset:quick', 'all');
 *    // 초기화: setQuickFilter('all')
 */

import { useEffect, useState } from 'react';

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 저장 실패는 무시 — quota 등
    }
  }, [key, value]);

  return [value, setValue];
}
