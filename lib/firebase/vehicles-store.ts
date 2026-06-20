'use client';

import { useState } from 'react';
import { ref, set, update as rtdbUpdate, remove as rtdbRemove, push } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth, pruneUndefined } from './client';
import { audit } from './audit-store';
import { mergePlateAttachmentsToVehicle } from './vehicle-attachments-store';
import { useDataContext } from '@/lib/data-context';
import type { Vehicle } from '@/lib/types';
import { lockedUpdate } from './locked-update';

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
  // 데이터는 DataProvider 에서 한 번만 subscribe — 페이지 이동 시 "번쩍" 없음
  const { vehicles, vehiclesLoading } = useDataContext();
  const [configured] = useState(() => isFirebaseConfigured());

  return {
    vehicles,
    loading: vehiclesLoading,
    configured,
    add: async (v) => {
      if (!configured) {
        return `local-${Date.now()}`;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return '';
      const newRef = push(ref(db, VEHICLES_PATH));
      const id = newRef.key;
      if (!id) throw new Error('Firebase push failed: no key');
      const now = new Date().toISOString();
      await set(newRef, pruneUndefined({ ...v, id, createdAt: now, updatedAt: now }));
      // plate-키로 임시 저장돼있던 사진/첨부가 있으면 신규 vehicleId 로 흡수
      if (v.plate) {
        void mergePlateAttachmentsToVehicle(v.plate, id);
      }
      void audit.create('vehicle', id, `차량 등록 ${v.plate} ${v.model}`);
      return id;
    },
    addMany: async (rows) => {
      if (rows.length === 0) return 0;
      if (!configured) return rows.length;
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
      const vIds = Object.keys(batch);
      void audit.import('vehicle', `차량 일괄 등록 ${rows.length}대`, {
        count: rows.length,
        ids: vIds.slice(0, 100),
        truncated: vIds.length > 100,
      });
      return rows.length;
    },
    update: async (v) => {
      if (!configured) return;
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      // plate 변경 감지 → 이전 plate 를 plateHistory 에 누적 + plate-키 첨부 흡수
      const prev = vehicles.find((x) => x.id === v.id);
      let next = v;
      const prevPlate = (prev?.plate ?? '').trim();
      const newPlate = (v.plate ?? '').trim();
      if (prev && prevPlate && newPlate && prevPlate !== newPlate) {
        const history = prev.plateHistory ?? [];
        if (!history.includes(prevPlate)) {
          next = { ...v, plateHistory: [...history, prevPlate] };
        }
        // 새 plate 로 임시 등록돼있던 사진이 있을 수 있으니 흡수 (드물지만 가능)
        void mergePlateAttachmentsToVehicle(newPlate, v.id);
        void audit.update('vehicle', v.id, `차량번호 변경 ${prevPlate} → ${newPlate}`);
      }
      // Optimistic Lock (ERP #22) — v.updatedAt 가 서버값과 다르면 LockConflictError.
      await lockedUpdate<Vehicle>(`${VEHICLES_PATH}/${v.id}`, v.updatedAt, () => ({
        ...next, updatedAt: new Date().toISOString(),
      }));
      void audit.update('vehicle', v.id, `차량 수정 ${v.plate} ${v.model}`);
    },
    remove: async (id) => {
      const target = vehicles.find((v) => v.id === id);
      if (!configured) return;
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbRemove(ref(db, `${VEHICLES_PATH}/${id}`));
      void audit.delete('vehicle', id, `차량 삭제 ${target?.plate ?? id} ${target?.model ?? ''}`);
    },
  };
}
