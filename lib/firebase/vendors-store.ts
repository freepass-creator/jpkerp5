'use client';

/**
 * 거래처 마스터 — 계약자 외 정비공장·공급사·외주업체 등.
 * 자금일보에서 거래처 dropdown 클릭 시 즉시 등록 가능.
 */

import { useState } from 'react';
import { ref, set, remove as rtdbRemove, push } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth, pruneUndefined } from './client';
import { audit } from './audit-store';
import type { Vendor } from '@/lib/types';
import { lockedUpdate } from './locked-update';
import { useCachedSnapshot, setCacheRows } from './cached-subscribe';

const PATH = dbPath('vendors');

export function useVendors() {
  const { rows: vendors, loading } = useCachedSnapshot<Vendor>(PATH);
  const [configured] = useState(() => isFirebaseConfigured());

  return {
    vendors,
    loading,
    configured,
    add: async (v: Omit<Vendor, 'id'>) => {
      if (!configured) {
        const id = `local-${Date.now()}`;
        setCacheRows<Vendor>(PATH, (prev) => [...prev, { ...v, id } as Vendor]);
        return id;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return '';
      const newRef = push(ref(db, PATH));
      const id = newRef.key;
      if (!id) throw new Error('Firebase push failed');
      await set(newRef, pruneUndefined({ ...v, id } as Record<string, unknown>));
      void audit.create('system', id, `거래처 등록 ${v.name}`);
      return id;
    },
    update: async (v: Vendor) => {
      if (!configured) {
        setCacheRows<Vendor>(PATH, (prev) => prev.map((x) => (x.id === v.id ? v : x)));
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      // Optimistic Lock (ERP #22)
      await lockedUpdate<Vendor>(`${PATH}/${v.id}`, v.updatedAt, () => ({
        ...v, updatedAt: new Date().toISOString(),
      }));
      void audit.update('system', v.id, `거래처 수정 ${v.name}`);
    },
    remove: async (id: string) => {
      if (!configured) {
        setCacheRows<Vendor>(PATH, (prev) => prev.filter((x) => x.id !== id));
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbRemove(ref(db, `${PATH}/${id}`));
      void audit.delete('system', id, `거래처 삭제 ${id}`);
    },
  };
}
