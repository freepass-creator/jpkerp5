'use client';

import { useEffect, useState } from 'react';
import { ref, onValue, set, update as rtdbUpdate, remove as rtdbRemove, push } from 'firebase/database';
import { getRtdb, icarPath, isFirebaseConfigured, ensureAuth } from './client';
import { audit } from './audit-store';
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
  updateMany: (rows: Contract[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  add: (c: Omit<Contract, 'id'>) => Promise<string>;
  addMany: (rows: Array<Omit<Contract, 'id'>>) => Promise<number>;
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
      void audit.update('contract', c.id, `계약 수정 ${c.contractNo ?? ''} ${c.vehiclePlate} ${c.customerName}`);
    },
    remove: async (id: string) => {
      const target = contracts.find((c) => c.id === id);
      if (!configured) {
        setContracts((prev) => prev.filter((x) => x.id !== id));
        return;
      }
      await ensureAuth();
      const db = getRtdb();
      if (!db) return;
      await rtdbRemove(ref(db, `${CONTRACTS_PATH}/${id}`));
      void audit.delete('contract', id, `계약 삭제 ${target?.contractNo ?? id} ${target?.vehiclePlate ?? ''} ${target?.customerName ?? ''}`);
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
      const id = newRef.key;
      if (!id) throw new Error('Firebase push failed: no key');
      const full = { ...c, id } as Contract;
      await set(newRef, full);
      void audit.create('contract', id, `계약 등록 ${full.contractNo ?? ''} ${full.vehiclePlate} ${full.customerName}`);
      return id;
    },
    addMany: async (rows: Array<Omit<Contract, 'id'>>) => {
      if (rows.length === 0) return 0;
      if (!configured) {
        const stamped = rows.map((c) => ({
          ...c,
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        })) as Contract[];
        setContracts((prev) => [...prev, ...stamped]);
        return stamped.length;
      }
      await ensureAuth();
      const db = getRtdb();
      if (!db) return 0;
      const batch: Record<string, Contract> = {};
      for (const row of rows) {
        const newRef = push(ref(db, CONTRACTS_PATH));
        const id = newRef.key;
      if (!id) throw new Error('Firebase push failed: no key');
        batch[id] = { ...row, id } as Contract;
      }
      await rtdbUpdate(ref(db, CONTRACTS_PATH), batch as unknown as Record<string, unknown>);
      void audit.import('contract', `계약 일괄 등록 ${rows.length}건`, { count: rows.length });
      return rows.length;
    },
    updateMany: async (rows: Contract[]) => {
      if (rows.length === 0) return;
      if (!configured) {
        setContracts((prev) => {
          const m = new Map(prev.map((c) => [c.id, c]));
          for (const r of rows) m.set(r.id, r);
          return Array.from(m.values());
        });
        return;
      }
      await ensureAuth();
      const db = getRtdb();
      if (!db) return;
      const batch: Record<string, Contract> = {};
      for (const r of rows) batch[r.id] = r;
      await rtdbUpdate(ref(db, CONTRACTS_PATH), batch as unknown as Record<string, unknown>);
      void audit.update('contract', 'batch', `계약 일괄 수정 ${rows.length}건`);
    },
  };
}
