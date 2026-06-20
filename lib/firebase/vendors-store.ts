'use client';

/**
 * 거래처 마스터 — 계약자 외 정비공장·공급사·외주업체 등.
 * 자금일보에서 거래처 dropdown 클릭 시 즉시 등록 가능.
 */

import { useEffect, useState } from 'react';
import { ref, onValue, set, update as rtdbUpdate, remove as rtdbRemove, push } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth, pruneUndefined } from './client';
import { audit } from './audit-store';
import type { Vendor } from '@/lib/types';
import { lockedUpdate } from './locked-update';

const PATH = dbPath('vendors');

export function useVendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
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
        setVendors(val ? Object.values<Vendor>(val) : []);
        setLoading(false);
      });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [configured]);

  return {
    vendors,
    loading,
    configured,
    add: async (v: Omit<Vendor, 'id'>) => {
      if (!configured) {
        const id = `local-${Date.now()}`;
        setVendors((prev) => [...prev, { ...v, id } as Vendor]);
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
        setVendors((prev) => prev.map((x) => (x.id === v.id ? v : x)));
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
        setVendors((prev) => prev.filter((x) => x.id !== id));
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbRemove(ref(db, `${PATH}/${id}`));
      void audit.delete('system', id, `거래처 삭제 ${id}`);
    },
  };
}
