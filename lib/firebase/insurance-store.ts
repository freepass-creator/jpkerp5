'use client';

/**
 * 자동차보험증권 마스터 — `insurances/{policyId}` 노드.
 * 갱신은 새 증권 추가, 이전 증권은 endDate 로 자연 종료.
 */

import { useEffect, useState } from 'react';
import { ref, onValue, set, update as rtdbUpdate, remove as rtdbRemove, push } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth, pruneUndefined } from './client';
import { audit } from './audit-store';
import type { InsurancePolicy } from '@/lib/types';

const PATH = dbPath('insurances');

export function useInsurances() {
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured] = useState(() => isFirebaseConfigured());

  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try { await ensureAuth(); } catch { setLoading(false); return; }
      if (cancelled) return;
      const db = getRtdb(); if (!db) { setLoading(false); return; }
      const r = ref(db, PATH);
      unsub = onValue(r, (snap) => {
        const val = snap.val();
        // installments 가 RTDB 에서 객체로 저장된 경우 배열로 정규화
        const normalize = (p: InsurancePolicy & { installments?: unknown }): InsurancePolicy => {
          if (p.installments && !Array.isArray(p.installments) && typeof p.installments === 'object') {
            return { ...p, installments: Object.values(p.installments) as InsurancePolicy['installments'] };
          }
          return p;
        };
        setPolicies(val ? Object.values<InsurancePolicy>(val).map(normalize) : []);
        setLoading(false);
      });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [configured]);

  return {
    policies,
    loading,
    configured,
    add: async (p: Omit<InsurancePolicy, 'id'>): Promise<string> => {
      if (!configured) {
        const id = `local-${Date.now()}`;
        setPolicies((prev) => [...prev, { ...p, id } as InsurancePolicy]);
        return id;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return '';
      const newRef = push(ref(db, PATH));
      const id = newRef.key;
      if (!id) throw new Error('Firebase push failed');
      await set(newRef, pruneUndefined({ ...p, id } as Record<string, unknown>));
      void audit.create('system', id, `보험증권 등록 ${p.insurer ?? ''} ${p.carNumber ?? ''} ${p.policyNo ?? ''}`);
      return id;
    },
    update: async (p: InsurancePolicy): Promise<void> => {
      if (!configured) {
        setPolicies((prev) => prev.map((x) => (x.id === p.id ? p : x)));
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbUpdate(ref(db, `${PATH}/${p.id}`), pruneUndefined({ ...p, updatedAt: new Date().toISOString() } as unknown as Record<string, unknown>));
      void audit.update('system', p.id, `보험증권 수정 ${p.carNumber ?? ''} ${p.policyNo ?? ''}`);
    },
    remove: async (id: string): Promise<void> => {
      if (!configured) {
        setPolicies((prev) => prev.filter((x) => x.id !== id));
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbRemove(ref(db, `${PATH}/${id}`));
      void audit.delete('system', id, `보험증권 삭제 ${id}`);
    },
  };
}
