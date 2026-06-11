'use client';

import { useEffect, useState } from 'react';
import { ref, onValue, set, update as rtdbUpdate, remove as rtdbRemove, push } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth, pruneUndefined } from './client';
import type { Company } from '@/lib/types';

import { genCode } from '@/lib/code';

const COMPANIES_PATH = dbPath('companies');

/** 새 회사 코드 — 6자 영문·숫자 난수 (prefix 없음). 기존과 충돌 시 재시도. */
export function nextCompanyCode(existing: Company[]): string {
  const used = new Set(existing.map((c) => c.code).filter(Boolean));
  return genCode(6, used);
}

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
      // 코드 미지정 시 자동 부여 (CP01 ~)
      const code = c.code && c.code.trim() ? c.code : nextCompanyCode(companies);
      const payload = { ...c, code };
      if (!configured) {
        const id = `local-${Date.now()}`;
        setCompanies((prev) => [...prev, { ...payload, id } as Company]);
        return id;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return '';
      const newRef = push(ref(db, COMPANIES_PATH));
      const id = newRef.key;
      if (!id) throw new Error('Firebase push failed: no key');
      await set(newRef, pruneUndefined({ ...payload, id }));
      return id;
    },
    update: async (c) => {
      if (!configured) {
        setCompanies((prev) => prev.map((x) => (x.id === c.id ? c : x)));
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbUpdate(ref(db, `${COMPANIES_PATH}/${c.id}`), pruneUndefined(c as unknown as Record<string, unknown>));
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
