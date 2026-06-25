'use client';

/**
 * 모듈-level subscription cache — RTDB 노드를 1번만 subscribe 하고 모든 hook 호출자에게 공유.
 *
 *  · 페이지 이동·재진입 시에도 cache 유지 → "데이터 없음" 깜빡임 0
 *  · 동일 path 에 대해 onValue 1회만 등록 (중복 listener 방지)
 *  · 변경 알림: cache 갱신 → 등록된 listener 들에게 notify → rerender
 *
 * DataProvider 에 통합되지 않은 작은 store 들 (penalty, todos, intake 등) 의 SSOT.
 */

import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { getRtdb, isFirebaseConfigured, ensureAuth } from './client';

type CacheEntry<T> = {
  rows: T[];
  loading: boolean;
  subscribed: boolean;
  listeners: Set<() => void>;
};

const registry = new Map<string, CacheEntry<unknown>>();

function getEntry<T>(path: string): CacheEntry<T> {
  let c = registry.get(path) as CacheEntry<T> | undefined;
  if (!c) {
    c = { rows: [], loading: true, subscribed: false, listeners: new Set() };
    registry.set(path, c as CacheEntry<unknown>);
  }
  return c;
}

function notifyAll<T>(c: CacheEntry<T>): void {
  for (const fn of c.listeners) fn();
}

async function ensureSubscribed<T>(
  path: string,
  transform?: (val: unknown) => T[],
): Promise<void> {
  const c = getEntry<T>(path);
  if (c.subscribed) return;
  c.subscribed = true;
  if (!isFirebaseConfigured()) { c.loading = false; notifyAll(c); return; }
  try { await ensureAuth(); }
  catch { c.loading = false; notifyAll(c); return; }
  const db = getRtdb();
  if (!db) { c.loading = false; notifyAll(c); return; }
  onValue(ref(db, path), (snap) => {
    const val = snap.val();
    c.rows = transform ? transform(val) : (val ? Object.values<T>(val) : []);
    c.loading = false;
    notifyAll(c);
  });
}

/**
 * Hook: path 의 cache 에서 rows + loading 반환. 페이지 이동에도 unmount X.
 *
 * transform: optional — RTDB val(snapshot.val()) → T[] 변환 (정렬·필터·normalize 등).
 *   stable reference 필요 — 모듈 상수 또는 useCallback 으로 정의할 것.
 *   (deps 에 포함되지 않음 — 첫 호출 시 등록한 transform 만 사용)
 */
export function useCachedSnapshot<T>(
  path: string,
  transform?: (val: unknown) => T[],
): { rows: T[]; loading: boolean } {
  const c = getEntry<T>(path);
  const [, force] = useState(0);
  useEffect(() => {
    const rerender = () => force((x) => x + 1);
    c.listeners.add(rerender);
    void ensureSubscribed<T>(path, transform);
    return () => { c.listeners.delete(rerender); };
  }, [c, path, transform]);
  return { rows: c.rows, loading: c.loading };
}

/** Mutation 시 cache 직접 갱신 (offline / configured=false 케이스). RTDB 사용 시엔 onValue 가 자동 갱신. */
export function setCacheRows<T>(path: string, fn: (prev: T[]) => T[]): void {
  const c = getEntry<T>(path);
  c.rows = fn(c.rows);
  notifyAll(c);
}
