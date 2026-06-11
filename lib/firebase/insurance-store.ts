'use client';

/**
 * 자동차보험증권 마스터 — `insurances/{policyId}` 노드.
 * 갱신은 새 증권 추가, 이전 증권은 endDate 로 자연 종료.
 */

import { useState } from 'react';
import { ref, set, update as rtdbUpdate, remove as rtdbRemove, push } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth, pruneUndefined } from './client';
import { audit } from './audit-store';
import { useDataContext } from '@/lib/data-context';
import type { InsurancePolicy } from '@/lib/types';

const PATH = dbPath('insurances');

export function useInsurances() {
  const { policies, policiesLoading } = useDataContext();
  const [configured] = useState(() => isFirebaseConfigured());

  return {
    policies,
    loading: policiesLoading,
    configured,
    add: async (p: Omit<InsurancePolicy, 'id'>): Promise<string> => {
      if (!configured) return `local-${Date.now()}`;
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
      if (!configured) return;
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbUpdate(ref(db, `${PATH}/${p.id}`), pruneUndefined({ ...p, updatedAt: new Date().toISOString() } as unknown as Record<string, unknown>));
      void audit.update('system', p.id, `보험증권 수정 ${p.carNumber ?? ''} ${p.policyNo ?? ''}`);
    },
    remove: async (id: string): Promise<void> => {
      if (!configured) return;
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbRemove(ref(db, `${PATH}/${id}`));
      void audit.delete('system', id, `보험증권 삭제 ${id}`);
    },
  };
}
