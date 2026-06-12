'use client';

import { useState } from 'react';
import { ref, set, update as rtdbUpdate, remove as rtdbRemove, push } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth, pruneUndefined } from './client';
import { audit } from './audit-store';
import { useDataContext } from '@/lib/data-context';
import { recalcContract } from '@/lib/payment-schedule';
import { todayKr } from '@/lib/mock-data';
import type { Contract } from '@/lib/types';

const CONTRACTS_PATH = dbPath('contracts');

/**
 * 계약 리스트 훅 — Firebase RTDB 실시간 구독.
 * 빈 상태로 시작 — 실데이터는 신규생성/import로 채워짐.
 */
export function useContracts(): {
  contracts: Contract[];
  loading: boolean;
  configured: boolean;
  update: (c: Contract) => Promise<void>;
  updateMany: (rows: Contract[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  add: (c: Omit<Contract, 'id'>) => Promise<string>;
  addMany: (rows: Array<Omit<Contract, 'id'>>) => Promise<number>;
} {
  // DataProvider 에서 한 번만 subscribe — 페이지 이동 시 유지
  const { contracts, contractsLoading } = useDataContext();
  const [configured] = useState(() => isFirebaseConfigured());

  return {
    contracts,
    loading: contractsLoading,
    configured,
    update: async (c: Contract) => {
      if (!configured) return;
      await ensureAuth();
      const db = getRtdb();
      if (!db) return;
      // write 시점 recalc — 캐시(unpaidAmount/currentSeq) 즉시 정확. UX 깜빡임 차단.
      const recalced = recalcContract(c, todayKr());
      await rtdbUpdate(ref(db, `${CONTRACTS_PATH}/${c.id}`), pruneUndefined(recalced) as unknown as Record<string, unknown>);
      void audit.update('contract', c.id, `계약 수정 ${c.contractNo ?? ''} ${c.vehiclePlate} ${c.customerName}`);
    },
    remove: async (id: string) => {
      const target = contracts.find((c) => c.id === id);
      if (!configured) return;
      await ensureAuth();
      const db = getRtdb();
      if (!db) return;
      await rtdbRemove(ref(db, `${CONTRACTS_PATH}/${id}`));
      void audit.delete('contract', id, `계약 삭제 ${target?.contractNo ?? id} ${target?.vehiclePlate ?? ''} ${target?.customerName ?? ''}`);
    },
    add: async (c: Omit<Contract, 'id'>) => {
      if (!configured) return `local-${Date.now()}`;
      await ensureAuth();
      const db = getRtdb();
      if (!db) return '';
      const newRef = push(ref(db, CONTRACTS_PATH));
      const id = newRef.key;
      if (!id) throw new Error('Firebase push failed: no key');
      const full = recalcContract({ ...c, id } as Contract, todayKr());
      await set(newRef, pruneUndefined(full));
      void audit.create('contract', id, `계약 등록 ${full.contractNo ?? ''} ${full.vehiclePlate} ${full.customerName}`);
      return id;
    },
    addMany: async (rows: Array<Omit<Contract, 'id'>>) => {
      if (rows.length === 0) return 0;
      if (!configured) return rows.length;
      await ensureAuth();
      const db = getRtdb();
      if (!db) return 0;
      const batch: Record<string, Contract> = {};
      const today = todayKr();
      for (const row of rows) {
        const newRef = push(ref(db, CONTRACTS_PATH));
        const id = newRef.key;
      if (!id) throw new Error('Firebase push failed: no key');
        batch[id] = pruneUndefined(recalcContract({ ...row, id } as Contract, today));
      }
      await rtdbUpdate(ref(db, CONTRACTS_PATH), batch as unknown as Record<string, unknown>);
      // batch import — 요약 + 세부 ID 목록 (감사 추적용)
      const ids = Object.keys(batch);
      void audit.import('contract', `계약 일괄 등록 ${rows.length}건`, {
        count: rows.length,
        ids: ids.slice(0, 100), // 100건 초과 시 처음 100개만 (RTDB 부담 방지)
        truncated: ids.length > 100,
      });
      return rows.length;
    },
    updateMany: async (rows: Contract[]) => {
      if (rows.length === 0) return;
      if (!configured) return;
      await ensureAuth();
      const db = getRtdb();
      if (!db) return;
      const batch: Record<string, Contract> = {};
      const today = todayKr();
      for (const r of rows) batch[r.id] = pruneUndefined(recalcContract(r, today));
      await rtdbUpdate(ref(db, CONTRACTS_PATH), batch as unknown as Record<string, unknown>);
      // batch update — 요약 + 세부 ID 목록 (감사 추적용, after 슬롯에 기록)
      void audit.update('contract', 'batch', `계약 일괄 수정 ${rows.length}건`, undefined, {
        count: rows.length,
        ids: rows.map((r) => r.id).slice(0, 100),
        truncated: rows.length > 100,
      });
    },
  };
}
