'use client';

import { useEffect, useState } from 'react';
import { ref, onValue, set, update as rtdbUpdate, remove as rtdbRemove, push } from 'firebase/database';
import { getRtdb, icarPath, isFirebaseConfigured, ensureAuth } from './client';
import type { Contract } from '@/lib/types';

const CONTRACTS_PATH = icarPath('contracts');

/**
 * 계약 리스트 훅 — Firebase RTDB 실시간 구독.
 * 빈 상태로 시작 — 실데이터는 신규생성/import로 채워짐.
 */
export function useContracts(): {
  contracts: Contract[];
  loading: boolean;
  configured: boolean;
  update: (c: Contract) => Promise<void>;
  remove: (id: string) => Promise<void>;
  add: (c: Omit<Contract, 'id'>) => Promise<string>;
} {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured] = useState(() => isFirebaseConfigured());

  useEffect(() => {
    if (!configured) {
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
      unsub = onValue(r, (snap) => {
        const val = snap.val();
        setContracts(val ? Object.values<Contract>(val) : []);
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
