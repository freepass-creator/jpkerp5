'use client';

import { useEffect, useState, useCallback } from 'react';
import { ref, set, onValue, get } from 'firebase/database';
import { getRtdb, ensureAuth } from './firebase/client';
import { stripUndef } from './store-utils';

/**
 * RTDB keyed-object store factory — 도메인 무관 공용.
 *
 * 6개 store (회사·차량·계약·보험·일지·거래원장) 가 같은 패턴 반복.
 * 이 팩토리는 그 공통을:
 *   · 모듈 레벨 cache + listeners
 *   · onValue 구독 (legacy array / keyed object 둘 다 지원)
 *   · setX → keyed object 로 변환 후 write + 콘솔 로깅
 *   · React 훅 useStore() 노출
 *
 *   const { useStore } = createKeyedStore<Company>({
 *     path: 'companies',
 *     getKey: (c) => c.code,
 *     storeName: 'company-store',
 *     sortBy: (a, b) => (a.code ?? '').localeCompare(b.code ?? ''),
 *   });
 *   export const useCompanyStore = useStore;
 *
 * 중첩 배열 (보험 installments / 계약 events) 정규화는 normalizeItem 옵션으로.
 */

type Options<T> = {
  /** RTDB 경로 (예: 'companies', 'assets'). */
  path: string;
  /** 항목 → key. 키가 없으면 (false) write 시 제외. */
  getKey: (item: T) => string | undefined;
  /** 로깅 prefix (예: 'company-store'). */
  storeName: string;
  /** UI 표시 시 정렬. 안 주면 RTDB 순서. */
  sortBy?: (a: T, b: T) => number;
  /** read 후 항목별 정규화 (예: nested 객체→배열). 없으면 그대로. */
  normalizeItem?: (item: T) => T;
  /**
   * write 직전 항목별 직렬화 (예: 런타임 hydration `_*` 필드 strip).
   * undefined 반환하면 그대로 (스킵 X).
   */
  serializeItem?: (item: T) => T;
  /** write 실패 시 alert 메시지 prefix. */
  alertLabel?: string;
};

export function createKeyedStore<T>(opts: Options<T>) {
  const { path, getKey, storeName, sortBy, normalizeItem, serializeItem, alertLabel } = opts;

  let cache: T[] = [];
  const listeners = new Set<(v: T[]) => void>();
  let subscribed = false;

  function fromRtdb(val: unknown): T[] {
    if (!val || typeof val !== 'object') return [];
    const arr = Array.isArray(val)
      ? val.filter((x): x is T => x != null && typeof x === 'object')
      : Object.values(val as Record<string, T>).filter((x): x is T => x != null && typeof x === 'object');
    const normalized = normalizeItem ? arr.map(normalizeItem) : arr;
    return sortBy ? normalized.sort(sortBy) : normalized;
  }

  function toRtdb(arr: T[]): Record<string, T> {
    const out: Record<string, T> = {};
    for (const item of arr) {
      const k = getKey(item);
      if (k) out[k] = serializeItem ? serializeItem(item) : item;
    }
    return out;
  }

  /** 첫 onValue fire 후 true. 그 전엔 setItems 가 RTDB write 거부 (레이스 컨디션 데이터 손실 방지). */
  let initialized = false;

  async function ensureSubscription() {
    if (subscribed || typeof window === 'undefined') return;
    subscribed = true;
    const db = getRtdb();
    if (!db) {
      initialized = true;
      listeners.forEach((l) => l(cache));
      return;
    }

    // 1) auth 대기 (RTDB Rules 가 auth 요구)
    try { await ensureAuth(); } catch (e) {
      console.warn(`[${storeName}] auth not ready`, e);
    }

    // 2) get() 으로 첫 로드 — initialized 보장. 에러여도 통과.
    try {
      const snap = await get(ref(db, path));
      cache = fromRtdb(snap.val());
    } catch (e) {
      console.warn(`[${storeName}] initial get failed`, e);
    }
    initialized = true;
    listeners.forEach((l) => l(cache));

    // 3) 실시간 업데이트는 onValue
    try {
      onValue(ref(db, path), (snap) => {
        const v = fromRtdb(snap.val());
        cache = v;
        listeners.forEach((l) => l(v));
      }, (err) => {
        console.warn(`[${storeName}] onValue error`, err);
      });
    } catch (e) {
      console.warn(`[${storeName}] subscribe failed`, e);
    }
  }

  function useStore() {
    const [items, setLocal] = useState<T[]>(() => cache);
    const [ready, setReady] = useState<boolean>(() => initialized);

    useEffect(() => {
      void ensureSubscription();
      const fn = (v: T[]) => { setLocal(v); setReady(true); };
      listeners.add(fn);
      setLocal(cache);
      if (initialized) setReady(true);
      return () => { listeners.delete(fn); };
    }, []);

    const setItems = useCallback((updater: T[] | ((prev: T[]) => T[])) => {
      // 초기 로드 전 write 거부 — RTDB 가 비어있다고 오해해서 통째 덮어쓰는 사고 방지
      if (!initialized) {
        console.warn(`[${storeName}] write rejected — RTDB initial load 미완료. 사용자 액션 재시도 필요`);
        if (typeof window !== 'undefined') {
          alert(`${alertLabel ?? path} 저장 보류 — 데이터 로딩 중입니다. 1초 후 다시 시도해주세요.`);
        }
        return;
      }
      const prev = cache;
      const next = typeof updater === 'function' ? (updater as (p: T[]) => T[])(prev) : updater;
      cache = next;
      listeners.forEach((l) => l(next));
      const obj = toRtdb(next);
      console.log(`[${storeName}] writing ${next.length} items to RTDB ${path}/...`);
      const db = getRtdb();
      if (!db) {
        console.warn(`[${storeName}] no RTDB — keeping in-memory only`);
        return;
      }
      set(ref(db, path), stripUndef(obj))
        .then(() => console.log(`[${storeName}] ✓ RTDB write OK (${next.length} items)`))
        .catch((e) => {
          console.error(`[${storeName}] ✗ write failed`, e);
          if (typeof window !== 'undefined') {
            alert(`${alertLabel ?? path} 저장 실패: ${e?.message ?? e}\n\nFirebase Console → Realtime Database → Rules 확인 필요.`);
          }
        });
    }, []);

    return [items, setItems, ready] as const;
  }

  return { useStore, getCache: () => cache };
}
