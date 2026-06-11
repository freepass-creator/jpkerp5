'use client';

import { useEffect, useState } from 'react';
import { ref, onValue, set, update as rtdbUpdate, remove as rtdbRemove, push } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth, pruneUndefined } from './client';
import { audit } from './audit-store';
import type { Vehicle } from '@/lib/types';

const VEHICLES_PATH = dbPath('vehicles');

export function useVehicles(): {
  vehicles: Vehicle[];
  loading: boolean;
  configured: boolean;
  add: (v: Omit<Vehicle, 'id'>) => Promise<string>;
  addMany: (rows: Array<Omit<Vehicle, 'id'>>) => Promise<number>;
  update: (v: Vehicle) => Promise<void>;
  remove: (id: string) => Promise<void>;
} {
  // localStorage 캐시 — 새로고침 즉시 마지막 데이터 표시, Firebase 신선 데이터 받으면 갱신
  const CACHE_KEY = 'cache:vehicles';
  const [vehicles, setVehicles] = useState<Vehicle[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) return JSON.parse(raw) as Vehicle[];
    } catch {}
    return [];
  });
  const [loading, setLoading] = useState(() => vehicles.length === 0);
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
        const arr = val ? Object.values<Vehicle>(val) : [];
        setVehicles(arr);
        setLoading(false);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(arr)); } catch {}
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
      await set(newRef, pruneUndefined({ ...v, id }));
      void audit.create('vehicle', id, `차량 등록 ${v.plate} ${v.model}`);
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
      await rtdbUpdate(ref(db, VEHICLES_PATH), pruneUndefined(batch as unknown as Record<string, unknown>));
      void audit.import('vehicle', `차량 일괄 등록 ${rows.length}대`, { count: rows.length });
      return rows.length;
    },
    update: async (v) => {
      if (!configured) {
        setVehicles((prev) => prev.map((x) => (x.id === v.id ? v : x)));
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbUpdate(ref(db, `${VEHICLES_PATH}/${v.id}`), pruneUndefined(v as unknown as Record<string, unknown>));
      void audit.update('vehicle', v.id, `차량 수정 ${v.plate} ${v.model}`);
    },
    remove: async (id) => {
      const target = vehicles.find((v) => v.id === id);
      if (!configured) {
        setVehicles((prev) => prev.filter((x) => x.id !== id));
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbRemove(ref(db, `${VEHICLES_PATH}/${id}`));
      void audit.delete('vehicle', id, `차량 삭제 ${target?.plate ?? id} ${target?.model ?? ''}`);
    },
  };
}
