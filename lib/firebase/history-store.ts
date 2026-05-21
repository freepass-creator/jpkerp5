'use client';

import { useEffect, useState } from 'react';
import { ref, onValue, set, update as rtdbUpdate, remove as rtdbRemove, push } from 'firebase/database';
import { getRtdb, icarPath, isFirebaseConfigured, ensureAuth, getFirebaseAuth, pruneUndefined } from './client';
import { audit } from './audit-store';
import type { HistoryEntry } from '@/lib/types';

const PATH = icarPath('history_entries');

/**
 * 차량·계약 이력 — 정비·사고·검사·세차·위반·보험·부품교체 (vehicle scope)
 *                    + 분쟁·클레임·수납이슈·메모·연락기록 (contract scope)
 *
 *   /icar001/history_entries/{id}
 */
export function useHistoryEntries(): {
  entries: HistoryEntry[];
  loading: boolean;
  configured: boolean;
  add: (e: Omit<HistoryEntry, 'id' | 'createdAt'>) => Promise<string>;
  update: (e: HistoryEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
} {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
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
      const r = ref(db, PATH);
      unsub = onValue(r, (snap) => {
        const val = snap.val();
        const list = val ? Object.values<HistoryEntry>(val) : [];
        // 최근순
        list.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
        setEntries(list);
        setLoading(false);
      });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [configured]);

  return {
    entries,
    loading,
    configured,
    add: async (e) => {
      const createdBy = getFirebaseAuth()?.currentUser?.email ?? undefined;
      const createdAt = new Date().toISOString();
      if (!configured) {
        const id = `local-${Date.now()}`;
        setEntries((prev) => [{ ...e, id, createdAt, createdBy } as HistoryEntry, ...prev]);
        return id;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return '';
      const newRef = push(ref(db, PATH));
      const id = newRef.key;
      if (!id) throw new Error('Firebase push failed: no key');
      const full = { ...e, id, createdAt, createdBy } as HistoryEntry;
      await set(newRef, pruneUndefined(full));
      void audit.create('document', id, `${e.scope === 'vehicle' ? '차량이력' : '계약이력'} ${e.category} — ${e.title}`);
      return id;
    },
    update: async (e) => {
      if (!configured) {
        setEntries((prev) => prev.map((x) => (x.id === e.id ? e : x)));
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbUpdate(ref(db, `${PATH}/${e.id}`), pruneUndefined(e as unknown as Record<string, unknown>));
      void audit.update('document', e.id, `이력 수정 ${e.title}`);
    },
    remove: async (id) => {
      const target = entries.find((e) => e.id === id);
      if (!configured) {
        setEntries((prev) => prev.filter((x) => x.id !== id));
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbRemove(ref(db, `${PATH}/${id}`));
      void audit.delete('document', id, `이력 삭제 ${target?.title ?? id}`);
    },
  };
}
