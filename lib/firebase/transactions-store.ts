'use client';

import { useEffect, useState } from 'react';
import { ref, onValue, set, update as rtdbUpdate, push } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth, pruneUndefined, getFirebaseAuth } from './client';
import { audit } from './audit-store';
import type { BankTransaction, CardTransaction, AuditEntityType } from '@/lib/types';
import { lockedUpdate } from './locked-update';
import { useClosedPeriods, isDateInClosedPeriod, PeriodClosedError } from './closed-periods-store';

// 회계마감(#18) — 금융 사실(금액·일자) 편집·삭제만 마감월 잠금. 매칭(metadata)은 마감 무관 허용.
const FINANCIAL_KEYS = ['amount', 'withdraw', 'txDate'];
function touchesFinancial(patch: Record<string, unknown>): boolean {
  return FINANCIAL_KEYS.some((k) => k in patch);
}

const BANK_PATH = dbPath('bank_tx');
const CARD_PATH = dbPath('card_tx');

/**
 * patch → RTDB update 인자 변환.
 * undefined 값은 "필드 삭제" 의도이므로 null 로 변환 (RTDB 는 null 로 필드를 지움).
 * pruneUndefined(JSON round-trip)를 patch 전체에 쓰면 키가 사라져 삭제가 무시된다.
 */
function patchToRtdb(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v === undefined ? null : pruneUndefined(v);
  }
  return out;
}

/**
 * 모듈-level singleton 캐시 — 첫 hook 호출 시 1번만 subscribe.
 * 페이지 이동·재진입 시에도 캐시 유지 → "거래 없음" 깜빡임 0.
 *
 * Listeners pattern: 각 hook 이 listener 등록 → 데이터 변경 시 모두 알림.
 */
type StoreCache<T> = {
  rows: T[];
  loading: boolean;
  subscribed: boolean;
  listeners: Set<() => void>;
};
const cache = new Map<string, StoreCache<unknown>>();

function getOrInitCache<T>(path: string): StoreCache<T> {
  let c = cache.get(path) as StoreCache<T> | undefined;
  if (!c) {
    c = { rows: [], loading: true, subscribed: false, listeners: new Set() };
    cache.set(path, c as StoreCache<unknown>);
  }
  return c;
}

function notifyAll<T>(c: StoreCache<T>): void {
  for (const fn of c.listeners) fn();
}

async function ensureSubscribed<T>(path: string): Promise<void> {
  const c = getOrInitCache<T>(path);
  if (c.subscribed) return;
  c.subscribed = true;
  if (!isFirebaseConfigured()) { c.loading = false; notifyAll(c); return; }
  try { await ensureAuth(); }
  catch { c.loading = false; notifyAll(c); return; }
  const db = getRtdb();
  if (!db) { c.loading = false; notifyAll(c); return; }
  onValue(ref(db, path), (snap) => {
    const val = snap.val();
    // soft delete(#6) — deletedAt 스탬프된 거래는 화면에서 제외. 원본은 RTDB 에 보존(복원·감사).
    c.rows = val ? (Object.values<T>(val) as T[]).filter((r) => !(r as { deletedAt?: string }).deletedAt) : [];
    c.loading = false;
    notifyAll(c);
  });
}

export function useBankTx() {
  return useTxStore<BankTransaction>(BANK_PATH, 'bank_tx');
}

export function useCardTx() {
  return useTxStore<CardTransaction>(CARD_PATH, 'card_tx');
}

function useTxStore<T extends { id: string }>(path: string, auditType: AuditEntityType) {
  const c = getOrInitCache<T>(path);
  const [, force] = useState(0);
  const [configured] = useState(() => isFirebaseConfigured());
  // 회계마감(#18) — 맵 캡처. 거래일이 마감월이면 금융편집·삭제 차단(매칭은 허용).
  const { closedPeriods } = useClosedPeriods();
  const txDateOf = (id: string): string | undefined => (c.rows.find((r) => r.id === id) as { txDate?: string } | undefined)?.txDate;
  const closedFor = (id: string): string | null => {
    const d = txDateOf(id);
    return d && isDateInClosedPeriod(closedPeriods, d) ? d.slice(0, 7) : null;
  };

  useEffect(() => {
    const rerender = () => force((x) => x + 1);
    c.listeners.add(rerender);
    void ensureSubscribed<T>(path);
    return () => { c.listeners.delete(rerender); };
  }, [c, path]);

  return {
    rows: c.rows,
    loading: c.loading,
    configured,
    add: async (row: Omit<T, 'id'>) => {
      if (!configured) {
        const id = `local-${Date.now()}`;
        c.rows = [...c.rows, { ...row, id } as unknown as T];
        notifyAll(c);
        return id;
      }
      // #18 — 마감월에 신규 금융 거래 추가 차단 (정정은 신규 분개로). 대량 import(addMany)는 사실기록이라 허용.
      const rowDate = (row as { txDate?: string }).txDate;
      if (rowDate && isDateInClosedPeriod(closedPeriods, rowDate)) throw new PeriodClosedError(rowDate.slice(0, 7));
      await ensureAuth();
      const db = getRtdb(); if (!db) return '';
      const newRef = push(ref(db, path));
      const id = newRef.key;
      if (!id) throw new Error('Firebase push failed: no key');
      const now = new Date().toISOString();
      // 회계일자(#17): importedAt = 시스템 등록 시점, createdAt 도 동일.
      await set(newRef, pruneUndefined({ ...row, id, importedAt: now, createdAt: now, updatedAt: now }));
      return id;
    },
    update: async (id: string, patch: Partial<T>) => {
      if (!configured) {
        c.rows = c.rows.map((r: T) => (r.id === id ? { ...r, ...patch } : r));
        notifyAll(c);
        return;
      }
      // #18 — 마감월 거래의 금융편집(금액·일자) 차단. 매칭(matchedContractId 등 metadata)은 허용.
      if (touchesFinancial(patch as Record<string, unknown>)) {
        const newDate = (patch as { txDate?: string }).txDate;
        const closedM = closedFor(id) ?? (newDate && isDateInClosedPeriod(closedPeriods, newDate) ? newDate.slice(0, 7) : null);
        if (closedM) throw new PeriodClosedError(closedM);
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      // patch 형식 update — updatedAt 자동 갱신.
      // 동시편집 보호: patch 는 expectedUpdatedAt 모르므로 raw rtdbUpdate (BankTx/CardTx 는 매칭 작업 위주, 충돌 거의 없음).
      // ⚠ patch 의 undefined 는 "필드 삭제" 의도 — RTDB 삭제는 null 이어야 함.
      //   pruneUndefined(JSON round-trip)로 키를 지우면 아무것도 안 써져서
      //   매칭 해제(matchedContractId: undefined)가 DB에 영속되지 않던 결함 수정.
      await rtdbUpdate(ref(db, `${path}/${id}`), patchToRtdb({ ...patch, updatedAt: new Date().toISOString() }));
    },
    updateMany: async (patches: Record<string, Partial<T>>) => {
      const ids = Object.keys(patches);
      if (ids.length === 0) return;
      if (!configured) {
        c.rows = c.rows.map((r: T) => (patches[r.id] ? { ...r, ...patches[r.id] } : r));
        notifyAll(c);
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      const updates: Record<string, unknown> = {};
      let closedSkip = 0;
      for (const [id, patch] of Object.entries(patches)) {
        // #18 — 마감월 거래의 금융편집 patch 만 제외(매칭 등 metadata 는 통과)
        if (patch && touchesFinancial(patch as Record<string, unknown>) && closedFor(id)) { closedSkip++; continue; }
        for (const [k, v] of Object.entries(patch ?? {})) {
          // undefined = 필드 삭제 의도 → RTDB null (키 제거하면 아무것도 안 써짐)
          updates[`${id}/${k}`] = v === undefined ? null : pruneUndefined(v);
        }
      }
      if (closedSkip > 0) console.warn(`[tx.updateMany] 마감월 금융편집 ${closedSkip}건 제외(#18)`);
      await rtdbUpdate(ref(db, path), updates);
    },
    addMany: async (items: Array<Omit<T, 'id'>>) => {
      if (items.length === 0) return [] as T[];
      if (!configured) {
        const stamped = items.map((r) => ({
          ...r,
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        })) as unknown as T[];
        c.rows = [...c.rows, ...stamped];
        notifyAll(c);
        return stamped;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return [] as T[];
      const batch: Record<string, T> = {};
      const stamped: T[] = [];
      const now = new Date().toISOString();
      for (const row of items) {
        const newRef = push(ref(db, path));
        const id = newRef.key;
      if (!id) throw new Error('Firebase push failed: no key');
        // 회계일자(#17): import 시점 stamped
        const full = { ...row, id, importedAt: now, createdAt: now, updatedAt: now } as unknown as T;
        batch[id] = full;
        stamped.push(full);
      }
      await rtdbUpdate(ref(db, path), pruneUndefined(batch as unknown as Record<string, unknown>));
      const txIds = Object.keys(batch);
      void audit.import(auditType, `${auditType === 'bank_tx' ? '계좌' : '카드'} 거래 일괄 등록 ${items.length}건`, {
        count: items.length,
        ids: txIds.slice(0, 100),
        truncated: txIds.length > 100,
      });
      return stamped;
    },
    remove: async (id: string) => {
      if (!configured) {
        c.rows = c.rows.filter((r: T) => r.id !== id);
        notifyAll(c);
        return;
      }
      // #18 — 마감월 거래 삭제 차단
      const closedM = closedFor(id);
      if (closedM) throw new PeriodClosedError(closedM);
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      // soft delete(#6) — 물리삭제 대신 deletedAt/deletedBy 스탬프. 재무 사실기록 원본 보존.
      const by = getFirebaseAuth()?.currentUser?.email ?? undefined;
      const now = new Date().toISOString();
      await rtdbUpdate(ref(db, `${path}/${id}`), patchToRtdb({ deletedAt: now, deletedBy: by, updatedAt: now }));
      void audit.delete(auditType, id, `${auditType === 'bank_tx' ? '계좌' : '카드'} 거래 삭제(soft)`);
    },
    removeMany: async (ids: string[]) => {
      if (ids.length === 0) return 0;
      if (!configured) {
        c.rows = c.rows.filter((r: T) => !ids.includes(r.id));
        notifyAll(c);
        return ids.length;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return 0;
      // #18 — 마감월 거래는 삭제 제외(나머지만 삭제). soft delete(#6) — deletedAt 스탬프.
      const updates: Record<string, unknown> = {};
      const removed: string[] = [];
      const by = getFirebaseAuth()?.currentUser?.email ?? null;
      const now = new Date().toISOString();
      for (const id of ids) {
        if (closedFor(id)) continue;
        updates[`${id}/deletedAt`] = now;
        updates[`${id}/deletedBy`] = by;
        updates[`${id}/updatedAt`] = now;
        removed.push(id);
      }
      if (removed.length === 0) return 0;
      await rtdbUpdate(ref(db, path), updates);
      const closedSkip = ids.length - removed.length;
      void audit.delete(auditType, '', `${auditType === 'bank_tx' ? '계좌' : '카드'} 거래 일괄 삭제 ${removed.length}건${closedSkip ? ` (마감월 ${closedSkip} 제외)` : ''}`, {
        count: removed.length,
        closedSkipped: closedSkip,
        ids: removed.slice(0, 100),
        truncated: removed.length > 100,
      });
      return removed.length;
    },
  };
}
