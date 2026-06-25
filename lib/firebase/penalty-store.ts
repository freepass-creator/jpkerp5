'use client';

import { useState } from 'react';
import { ref, set, remove as rtdbRemove, push } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth, pruneUndefined } from './client';
import { audit } from './audit-store';
import type { Penalty } from '@/lib/types-penalty';
import { lockedUpdate } from './locked-update';
import { useCachedSnapshot, setCacheRows } from './cached-subscribe';

const PATH = dbPath('penalties');

// 모듈 상수 — stable transform reference (재마운트마다 새 subscribe 방지)
function penaltyTransform(val: unknown): Penalty[] {
  if (!val) return [];
  return Object.values<Penalty>(val as Record<string, Penalty>)
    .sort((a, b) => (b.issueDate ?? '').localeCompare(a.issueDate ?? ''));
}

export function usePenalties(): {
  penalties: Penalty[];
  loading: boolean;
  configured: boolean;
  add: (p: Omit<Penalty, 'id'>) => Promise<string>;
  update: (p: Penalty) => Promise<void>;
  remove: (id: string) => Promise<void>;
} {
  const { rows: penalties, loading } = useCachedSnapshot<Penalty>(PATH, penaltyTransform);
  const [configured] = useState(() => isFirebaseConfigured());

  return {
    penalties, loading, configured,
    add: async (p) => {
      if (!configured) {
        const id = `local-pen-${Date.now()}`;
        setCacheRows<Penalty>(PATH, (prev) => [{ ...p, id } as Penalty, ...prev]);
        return id;
      }
      await ensureAuth();
      const db = getRtdb();
      if (!db) return '';
      const newRef = push(ref(db, PATH));
      const id = newRef.key;
      if (!id) throw new Error('Firebase push failed: no key');
      await set(newRef, pruneUndefined({ ...p, id }));
      void audit.create('penalty', id, `과태료 등록 ${p.noticeNo ?? ''} ${p.carNumber} ${p.amount}원`);
      return id;
    },
    update: async (p) => {
      if (!configured) {
        setCacheRows<Penalty>(PATH, (prev) => prev.map((x) => (x.id === p.id ? p : x)));
        return;
      }
      await ensureAuth();
      const db = getRtdb();
      if (!db) return;
      // Optimistic Lock (ERP #22)
      await lockedUpdate<Penalty>(`${PATH}/${p.id}`, p.updatedAt, () => ({
        ...p, updatedAt: new Date().toISOString(),
      }));
      void audit.update('penalty', p.id, `과태료 수정 ${p.noticeNo ?? ''} ${p.carNumber}`);
    },
    remove: async (id) => {
      const target = penalties.find((p) => p.id === id);
      if (!configured) {
        setCacheRows<Penalty>(PATH, (prev) => prev.filter((x) => x.id !== id));
        return;
      }
      await ensureAuth();
      const db = getRtdb();
      if (!db) return;
      await rtdbRemove(ref(db, `${PATH}/${id}`));
      void audit.delete('penalty', id, `과태료 삭제 ${target?.noticeNo ?? id} ${target?.carNumber ?? ''}`);
    },
  };
}
