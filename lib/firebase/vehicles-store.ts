'use client';

import { useEffect, useState } from 'react';
import { ref, onValue, set, update as rtdbUpdate, remove as rtdbRemove, push } from 'firebase/database';
import { getRtdb, icarPath, isFirebaseConfigured, ensureAuth } from './client';
import type { Vehicle } from '@/lib/types';

const VEHICLES_PATH = icarPath('vehicles');

export function useVehicles(): {
  vehicles: Vehicle[];
  loading: boolean;
  configured: boolean;
  add: (v: Omit<Vehicle, 'id'>) => Promise<string>;
  addMany: (rows: Array<Omit<Vehicle, 'id'>>) => Promise<number>;
  update: (v: Vehicle) => Promise<void>;
  remove: (id: string) => Promise<void>;
} {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
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
      const r = ref(db, VEHICLES_PATH);
      unsub = onValue(r, (snap) => {
        const val = snap.val();
        setVehicles(val ? Object.values<Vehicle>(val) : []);
        setLoading(false);
      });
    })();

    return () => { cancelled = true; if (unsub) unsub(); };
  }, [configured]);

  return {
    vehicles,
    loading,
    configured,
    add: async (v) => {
      if (!configured) {
        const id = `local-${Date.now()}`;
        setVehicles((prev) => [...prev, { ...v, id } as Vehicle]);
        return id;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return '';
      const newRef = push(ref(db, VEHICLES_PATH));
      const id = newRef.key;
      if (!id) throw new Error('Firebase push failed: no key');
      await set(newRef, { ...v, id });
      return id;
    },
    addMany: async (rows) => {
      if (rows.length === 0) return 0;
      if (!configured) {
        const stamped = rows.map((v) => ({ ...v, id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })) as Vehicle[];
        setVehicles((prev) => [...prev, ...stamped]);
        return stamped.length;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return 0;
      const batch: Record<string, Vehicle> = {};
      for (const row of rows) {
        const newRef = push(ref(db, VEHICLES_PATH));
        const id = newRef.key;
      if (!id) throw new Error('Firebase push failed: no key');
        batch[id] = { ...row, id } as Vehicle;
      }
      await rtdbUpdate(ref(db, VEHICLES_PATH), batch as unknown as Record<string, unknown>);
      return rows.length;
    },
    update: async (v) => {
      if (!configured) {
        setVehicles((prev) => prev.map((x) => (x.id === v.id ? v : x)));
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbUpdate(ref(db, `${VEHICLES_PATH}/${v.id}`), v as unknown as Record<string, unknown>);
    },
    remove: async (id) => {
      if (!configured) {
        setVehicles((prev) => prev.filter((x) => x.id !== id));
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbRemove(ref(db, `${VEHICLES_PATH}/${id}`));
    },
  };
}
