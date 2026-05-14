'use client';

import { useEffect, useState } from 'react';
import { ref, onValue, set, update as rtdbUpdate, remove as rtdbRemove, push } from 'firebase/database';
import { getRtdb, icarPath, isFirebaseConfigured, ensureAuth } from './client';
import type { Contract } from '@/lib/types';
import { MOCK_CONTRACTS } from '@/lib/mock-data';

const CONTRACTS_PATH = icarPath('contracts');

/**
 * 계약 리스트 훅 — Firebase 연결되면 RTDB 실시간 구독, 안 됐으면 mock 로컬.
 */
export function useContracts(): {
  contracts: Contract[];
  loading: boolean;
  configured: boolean;
  update: (c: Contract) => Promise<void>;
  remove: (id: string) => Promise<void>;
  add: (c: Omit<Contract, 'id'>) => Promise<string>;
} {
  const [contracts, setContracts] = useState<Contract[]>(MOCK_CONTRACTS);
  const [loading, setLoading] = useState(true);
  const [configured] = useState(() => isFirebaseConfigured());

  useEffect(() => {
    if (!configured) {
      // Firebase 미설정 — local mock 사용
      setLoading(false);
      return;
    }
    let unsub: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        await ensureAuth();
      } catch {
        setLoading(false);
        return;
      }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) {
        setLoading(false);
        return;
      }
      const r = ref(db, CONTRACTS_PATH);
      let seeded = false;
      unsub = onValue(r, async (snap) => {
        const val = snap.val();
        if (!val || Object.keys(val).length === 0) {
          if (!seeded) {
            seeded = true;
            const seedMap: Record<string, Contract> = {};
            for (const c of MOCK_CONTRACTS) seedMap[c.id] = c;
            await set(r, seedMap);
          }
          return;
        }
        const list: Contract[] = Object.values(val);
        setContracts(list);
        setLoading(false);
      });
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [configured]);

  return {
    contracts,
    loading,
    configured,
    update: async (c: Contract) => {
      if (!configured) {
        setContracts((prev) => prev.map((x) => (x.id === c.id ? c : x)));
        return;
      }
      await ensureAuth();
      const db = getRtdb();
      if (!db) return;
      await rtdbUpdate(ref(db, `${CONTRACTS_PATH}/${c.id}`), c as unknown as Record<string, unknown>);
    },
    remove: async (id: string) => {
      if (!configured) {
        setContracts((prev) => prev.filter((x) => x.id !== id));
        return;
      }
      await ensureAuth();
      const db = getRtdb();
      if (!db) return;
      await rtdbRemove(ref(db, `${CONTRACTS_PATH}/${id}`));
    },
    add: async (c: Omit<Contract, 'id'>) => {
      if (!configured) {
        const id = `local-${Date.now()}`;
        setContracts((prev) => [...prev, { ...c, id } as Contract]);
        return id;
      }
      await ensureAuth();
      const db = getRtdb();
      if (!db) return '';
      const newRef = push(ref(db, CONTRACTS_PATH));
      const id = newRef.key!;
      const full = { ...c, id } as Contract;
      await set(newRef, full);
      return id;
    },
  };
}
