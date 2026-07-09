'use client';

import { useState } from 'react';
import { ref, set, update as rtdbUpdate, push, get } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth, pruneUndefined, getFirebaseAuth } from './client';
import { audit } from './audit-store';
import { useDataContext } from '@/lib/data-context';
import { recalcContract } from '@/lib/payment-schedule';
import { todayKr } from '@/lib/mock-data';
import type { Contract } from '@/lib/types';
import { lockedUpdate } from './locked-update';

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
      // Optimistic Lock (ERP #22) — c.updatedAt 가 서버값과 다르면 LockConflictError throw.
      await lockedUpdate<Contract>(`${CONTRACTS_PATH}/${c.id}`, c.updatedAt, () => ({
        ...recalced, updatedAt: new Date().toISOString(),
      }));
      void audit.update('contract', c.id, `계약 수정 ${c.contractNo ?? ''} ${c.vehiclePlate} ${c.customerName}`);
    },
    remove: async (id: string) => {
      const target = contracts.find((c) => c.id === id);
      if (!configured) return;
      await ensureAuth();
      const db = getRtdb();
      if (!db) return;
      // Soft delete (#6·#15) — 계약·입금 이력은 물리삭제 X. deletedAt 스탬프로 목록·집계에서만
      // 제외(원본 RTDB 보존 → 감사·복원·소명). 낙관적 락(#22)으로 동시편집 충돌 시 중단.
      const now = new Date().toISOString();
      const by = getFirebaseAuth()?.currentUser?.email ?? undefined;
      await lockedUpdate<Contract>(`${CONTRACTS_PATH}/${id}`, target?.updatedAt, (cur) => ({
        ...cur, deletedAt: now, deletedBy: by, updatedAt: now,
      }));
      void audit.delete('contract', id, `계약 삭제(soft) ${target?.contractNo ?? id} ${target?.vehiclePlate ?? ''} ${target?.customerName ?? ''}`);
    },
    add: async (c: Omit<Contract, 'id'>) => {
      if (!configured) return `local-${Date.now()}`;
      await ensureAuth();
      const db = getRtdb();
      if (!db) return '';
      const newRef = push(ref(db, CONTRACTS_PATH));
      const id = newRef.key;
      if (!id) throw new Error('Firebase push failed: no key');
      const now = new Date().toISOString();
      const full = recalcContract({ ...c, id, createdAt: now, updatedAt: now } as Contract, todayKr());
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
      const today = todayKr();
      // 낙관적 락 (#22) — 계약별 updatedAt 대조. blind 배치는 동시편집분을 클로버했음.
      //   충돌 계약은 건너뛰고 집계(무충돌이면 기존과 동일 결과, 충돌 시 클로버 방지).
      let ok = 0;
      const conflicts: string[] = [];
      for (const r of rows) {
        try {
          await lockedUpdate<Contract>(`${CONTRACTS_PATH}/${r.id}`, r.updatedAt, () => ({
            ...recalcContract(r, today), updatedAt: new Date().toISOString(),
          }));
          ok++;
        } catch (e) {
          conflicts.push(r.id);
          console.warn('[contracts.updateMany conflict skipped]', r.id, e);
        }
      }
      void audit.update('contract', 'batch', `계약 일괄 수정 ${ok}/${rows.length}건${conflicts.length ? ` (동시편집 충돌 ${conflicts.length} 건너뜀)` : ''}`, undefined, {
        count: ok,
        conflicts: conflicts.length,
        ids: rows.map((r) => r.id).slice(0, 100),
        truncated: rows.length > 100,
      });
    },
  };
}

/**
 * soft-deleted(=deletedAt 스탬프된) 계약만 1회 조회 — 복원 화면용.
 * data-context 구독은 삭제분을 걸러내므로 별도 raw 조회.
 */
export async function fetchDeletedContracts(): Promise<Contract[]> {
  if (!isFirebaseConfigured()) return [];
  await ensureAuth();
  const db = getRtdb();
  if (!db) return [];
  const snap = await get(ref(db, CONTRACTS_PATH));
  const val = snap.val();
  if (!val) return [];
  return Object.values<Contract>(val)
    .filter((c) => !!c.deletedAt)
    .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
}

/** soft-deleted 계약 복원 — deletedAt/deletedBy 제거. 낙관적 락(#22). */
export async function restoreContract(id: string, expectedUpdatedAt?: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  const now = new Date().toISOString();
  await lockedUpdate<Contract>(`${CONTRACTS_PATH}/${id}`, expectedUpdatedAt, (cur) => ({
    ...cur, deletedAt: undefined, deletedBy: undefined, updatedAt: now,
  }));
  void audit.update('contract', id, `계약 복원(soft delete 취소)`);
}
