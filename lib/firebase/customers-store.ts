'use client';

/**
 * 고객 마스터 store (#R5) — 계약에서 파생된 Customer 마스터 upsert/조회.
 * 결정적 id(dedup 키) 라 재실행 멱등. live 구독은 v6/후속에서 필요 시 data-context 에 추가.
 */

import { ref, update as rtdbUpdate, get } from 'firebase/database';
import { getRtdb, dbPath, ensureAuth, pruneUndefined } from './client';
import type { Customer } from '@/lib/types';

const CUSTOMERS_PATH = dbPath('customers');

/** 고객 마스터 일괄 upsert (결정적 id 기준 병합). createdAt 은 최초만, updatedAt 갱신. */
export async function upsertCustomers(customers: Customer[]): Promise<number> {
  if (customers.length === 0) return 0;
  await ensureAuth();
  const db = getRtdb();
  if (!db) return 0;
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {};
  for (const c of customers) {
    updates[c.id] = pruneUndefined({ ...c, createdAt: c.createdAt ?? now, updatedAt: now });
  }
  await rtdbUpdate(ref(db, CUSTOMERS_PATH), updates);
  return customers.length;
}

/** 고객 마스터 전체 조회 (soft delete 제외). */
export async function fetchCustomers(): Promise<Customer[]> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return [];
  const snap = await get(ref(db, CUSTOMERS_PATH));
  const val = snap.val();
  return val ? (Object.values(val) as Customer[]).filter((c) => !c.deletedAt) : [];
}
