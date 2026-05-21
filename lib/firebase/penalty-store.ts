'use client';

import { useEffect, useState } from 'react';
import { ref, onValue, set, update as rtdbUpdate, remove as rtdbRemove, push } from 'firebase/database';
import { getRtdb, icarPath, isFirebaseConfigured, ensureAuth, pruneUndefined } from './client';
import { audit } from './audit-store';
import type { Penalty } from '@/lib/types-penalty';

const PATH = icarPath('penalties');

export function usePenalties(): {
  penalties: Penalty[];
  loading: boolean;
  configured: boolean;
  add: (p: Omit<Penalty, 'id'>) => Promise<string>;
  update: (p: Penalty) => Promise<void>;
  remove: (id: string) => Promise<void>;
} {
  const [penalties, setPenalties] = useState<Penalty[]>([]);
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
      try { await ensureAuth(); } catch { setLoading(false); return; }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) { setLoading(false); return; }
      const r = ref(db, PATH);
      unsub = onValue(r, (snap) => {
        const val = snap.val();
        if (!val) setPenalties([]);
        else setPenalties(Object.values<Penalty>(val).sort((a, b) => (b.issueDate ?? '').localeCompare(a.issueDate ?? '')));
        setLoading(false);
      });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [configured]);

  return {
    penalties, loading, configured,
    add: async (p) => {
      if (!configured) {
        const id = `local-pen-${Date.now()}`;
        setPenalties((prev) => [{ ...p, id } as Penalty, ...prev]);
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
        setPenalties((prev) => prev.map((x) => (x.id === p.id ? p : x)));
        return;
      }
      await ensureAuth();
      const db = getRtdb();
      if (!db) return;
      await rtdbUpdate(ref(db, `${PATH}/${p.id}`), pruneUndefined(p as unknown as Record<string, unknown>));
      void audit.update('penalty', p.id, `과태료 수정 ${p.noticeNo ?? ''} ${p.carNumber}`);
    },
    remove: async (id) => {
      const target = penalties.find((p) => p.id === id);
      if (!configured) {
        setPenalties((prev) => prev.filter((x) => x.id !== id));
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
