'use client';

import { useEffect, useState } from 'react';
import { ref, onValue, set, update as rtdbUpdate, push, remove as rtdbRemove } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth, pruneUndefined } from './client';
import { audit } from './audit-store';
import type { BankTransaction, CardTransaction, AuditEntityType } from '@/lib/types';
import { lockedUpdate } from './locked-update';

const BANK_PATH = dbPath('bank_tx');
const CARD_PATH = dbPath('card_tx');

export function useBankTx() {
  return useTxStore<BankTransaction>(BANK_PATH, 'bank_tx');
}

export function useCardTx() {
  return useTxStore<CardTransaction>(CARD_PATH, 'card_tx');
}

function useTxStore<T extends { id: string }>(path: string, auditType: AuditEntityType) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured] = useState(() => isFirebaseConfigured());

  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    let unsub: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try { await ensureAuth(); } catch { setLoading(false); return; }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) { setLoading(false); return; }
      const r = ref(db, path);
      unsub = onValue(r, (snap) => {
        const val = snap.val();
        setRows(val ? Object.values<T>(val) : []);
        setLoading(false);
      });
    })();

    return () => { cancelled = true; if (unsub) unsub(); };
  }, [configured, path]);

  return {
    rows,
    loading,
    configured,
    add: async (row: Omit<T, 'id'>) => {
      if (!configured) {
        const id = `local-${Date.now()}`;
        setRows((prev) => [...prev, { ...row, id } as unknown as T]);
        return id;
      }
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
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      // patch 형식 update — updatedAt 자동 갱신.
      // 동시편집 보호: patch 는 expectedUpdatedAt 모르므로 raw rtdbUpdate (BankTx/CardTx 는 매칭 작업 위주, 충돌 거의 없음).
      await rtdbUpdate(ref(db, `${path}/${id}`),
        pruneUndefined({ ...patch, updatedAt: new Date().toISOString() } as unknown as Record<string, unknown>));
    },
    updateMany: async (patches: Record<string, Partial<T>>) => {
      const ids = Object.keys(patches);
      if (ids.length === 0) return;
      if (!configured) {
        setRows((prev) => prev.map((r) => (patches[r.id] ? { ...r, ...patches[r.id] } : r)));
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      const updates: Record<string, unknown> = {};
      for (const [id, patch] of Object.entries(patches)) {
        for (const [k, v] of Object.entries(patch ?? {})) {
          updates[`${id}/${k}`] = v;
        }
      }
      await rtdbUpdate(ref(db, path), pruneUndefined(updates));
    },
    addMany: async (items: Array<Omit<T, 'id'>>) => {
      if (items.length === 0) return [] as T[];
      if (!configured) {
        const stamped = items.map((r) => ({
          ...r,
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        })) as unknown as T[];
        setRows((prev) => [...prev, ...stamped]);
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
        setRows((prev) => prev.filter((r) => r.id !== id));
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbRemove(ref(db, `${path}/${id}`));
      void audit.delete(auditType, id, `${auditType === 'bank_tx' ? '계좌' : '카드'} 거래 삭제`);
    },
    removeMany: async (ids: string[]) => {
      if (ids.length === 0) return 0;
      if (!configured) {
        setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
        return ids.length;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return 0;
      const updates: Record<string, null> = {};
      for (const id of ids) updates[id] = null;
      await rtdbUpdate(ref(db, path), updates);
      void audit.delete(auditType, '', `${auditType === 'bank_tx' ? '계좌' : '카드'} 거래 일괄 삭제 ${ids.length}건`, {
        count: ids.length,
        ids: ids.slice(0, 100),
        truncated: ids.length > 100,
      });
      return ids.length;
    },
  };
}
