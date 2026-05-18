'use client';

import { useEffect, useState } from 'react';
import { ref, onValue, set, update as rtdbUpdate, push } from 'firebase/database';
import { getRtdb, icarPath, isFirebaseConfigured, ensureAuth } from './client';
import type { BankTransaction, CardTransaction } from '@/lib/types';

const BANK_PATH = icarPath('bank_tx');
const CARD_PATH = icarPath('card_tx');

export function useBankTx() {
  return useTxStore<BankTransaction>(BANK_PATH);
}

export function useCardTx() {
  return useTxStore<CardTransaction>(CARD_PATH);
}

function useTxStore<T extends { id: string }>(path: string) {
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
      const id = newRef.key!;
      await set(newRef, { ...row, id });
      return id;
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
      for (const row of items) {
        const newRef = push(ref(db, path));
        const id = newRef.key!;
        const full = { ...row, id } as unknown as T;
        batch[id] = full;
        stamped.push(full);
      }
      await rtdbUpdate(ref(db, path), batch as unknown as Record<string, unknown>);
      return stamped;
    },
  };
}
