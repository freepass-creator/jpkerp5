'use client';

import { useEffect, useState } from 'react';
import { ref, onValue, set, update as rtdbUpdate, remove as rtdbRemove, push } from 'firebase/database';
import { getRtdb, icarPath, isFirebaseConfigured, ensureAuth } from './client';
import type { Company } from '@/lib/types';

const COMPANIES_PATH = icarPath('companies');

export function useCompanies(): {
  companies: Company[];
  loading: boolean;
  configured: boolean;
  add: (c: Omit<Company, 'id'>) => Promise<string>;
  update: (c: Company) => Promise<void>;
  remove: (id: string) => Promise<void>;
} {
  const [companies, setCompanies] = useState<Company[]>([]);
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
      const r = ref(db, COMPANIES_PATH);
      unsub = onValue(r, (snap) => {
        const val = snap.val();
        setCompanies(val ? Object.values<Company>(val) : []);
        setLoading(false);
      });
    })();

    return () => { cancelled = true; if (unsub) unsub(); };
  }, [configured]);

  return {
    companies,
    loading,
    configured,
    add: async (c) => {
      if (!configured) {
        const id = `local-${Date.now()}`;
        setCompanies((prev) => [...prev, { ...c, id } as Company]);
        return id;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return '';
      const newRef = push(ref(db, COMPANIES_PATH));
      const id = newRef.key!;
      await set(newRef, { ...c, id });
      return id;
    },
    update: async (c) => {
      if (!configured) {
        setCompanies((prev) => prev.map((x) => (x.id === c.id ? c : x)));
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbUpdate(ref(db, `${COMPANIES_PATH}/${c.id}`), c as unknown as Record<string, unknown>);
    },
    remove: async (id) => {
      if (!configured) {
        setCompanies((prev) => prev.filter((x) => x.id !== id));
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbRemove(ref(db, `${COMPANIES_PATH}/${id}`));
    },
  };
}
