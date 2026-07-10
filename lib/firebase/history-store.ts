'use client';

import { useState } from 'react';
import { ref, set, update as rtdbUpdate, remove as rtdbRemove, push } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth, getFirebaseAuth, pruneUndefined } from './client';
import { audit } from './audit-store';
import { useDataContext } from '@/lib/data-context';
import { findVehicleByPlate } from '@/lib/entity-sync';
import type { HistoryEntry } from '@/lib/types';

const PATH = dbPath('history_entries');

/**
 * 차량·계약 이력 — 정비·사고·검사·세차·위반·보험·부품교체 (vehicle scope)
 *                    + 분쟁·클레임·수납이슈·메모·연락기록 (contract scope)
 *
 *   /jpkerp5/history_entries/{id}
 */
export function useHistoryEntries(): {
  entries: HistoryEntry[];
  loading: boolean;
  configured: boolean;
  add: (e: Omit<HistoryEntry, 'id' | 'createdAt'>) => Promise<string>;
  update: (e: HistoryEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
} {
  const { history, historyLoading, vehicles, contracts } = useDataContext();
  const [configured] = useState(() => isFirebaseConfigured());

  return {
    entries: history,
    loading: historyLoading,
    configured,
    add: async (e) => {
      const createdBy = getFirebaseAuth()?.currentUser?.email ?? undefined;
      const createdAt = new Date().toISOString();
      if (!configured) return `local-${Date.now()}`;
      await ensureAuth();
      const db = getRtdb(); if (!db) return '';
      const newRef = push(ref(db, PATH));
      const id = newRef.key;
      if (!id) throw new Error('Firebase push failed: no key');
      // 회사코드 자동 해석(#R3) — 계약(contractId)/차량(vehiclePlate) 경유로 확정. 이력 노드가 스스로 소속을 알게 → v6 테넌트 격리.
      let companyCode = e.companyCode;
      if (!companyCode && e.contractId) companyCode = contracts.find((c) => c.id === e.contractId)?.company;
      if (!companyCode && e.vehiclePlate) companyCode = findVehicleByPlate(vehicles, e.vehiclePlate)?.company;
      const full = { ...e, companyCode, id, createdAt, createdBy } as HistoryEntry;
      await set(newRef, pruneUndefined(full));
      void audit.create('document', id, `${e.scope === 'vehicle' ? '차량이력' : '계약이력'} ${e.category} — ${e.title}`);
      return id;
    },
    update: async (e) => {
      if (!configured) return;
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbUpdate(ref(db, `${PATH}/${e.id}`), pruneUndefined(e as unknown as Record<string, unknown>));
      void audit.update('document', e.id, `이력 수정 ${e.title}`);
    },
    remove: async (id) => {
      const target = history.find((e) => e.id === id);
      if (!configured) return;
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbRemove(ref(db, `${PATH}/${id}`));
      void audit.delete('document', id, `이력 삭제 ${target?.title ?? id}`);
    },
  };
}
