'use client';

/**
 * 현장 입력 로그 (field_logs) — 모바일·현장에서 들어오는 모든 입력의 통합 저장소.
 *
 * 3가지 scope (이 라운드에서 확장):
 *  · contract — 이 계약 한 건에만 (조건 변경 요청 등)
 *  · vehicle  — 이 차량 (같은 차의 미래 계약에도 자동 노출) — 사고/옵션 등
 *  · customer — 이 손님 (등록번호 기준) — 성향/신뢰도/연락 패턴
 *
 * RTDB 경로 (점진적 마이그):
 *  · /field_logs/{contractId}/{logId}            ← contract scope (legacy, 그대로 사용)
 *  · /field_logs_vehicle/{vehicleId}/{logId}     ← vehicle scope (신규)
 *  · /field_logs_customer/{customerKey}/{logId}  ← customer scope (신규)
 *
 * customerKey = customerIdentNo 디지트만 추출 (주민번호 13자리 또는 사업자 10자리).
 *
 * type:
 *  · memo / delivery / return / location / call / expense / inspect
 *
 * 모든 변경에 _meta 자동 부여 (source/by/at).
 */

import { ref, push, onValue, get, remove as rtdbRemove, update as rtdbUpdate } from 'firebase/database';
import { useEffect, useState } from 'react';
import { getRtdb, dbPath, ensureAuth, pruneUndefined } from './client';
import { withMeta, type WriteMeta } from '../write-meta';

const PATH_CONTRACT = dbPath('field_logs');
const PATH_VEHICLE  = dbPath('field_logs_vehicle');
const PATH_CUSTOMER = dbPath('field_logs_customer');

export type FieldLogType = 'memo' | 'delivery' | 'return' | 'location' | 'call' | 'expense' | 'inspect';
export type FieldLogScope = 'contract' | 'vehicle' | 'customer';

export type FieldLog = {
  id: string;
  /** scope = 'contract' 이면 contractId 채움. vehicle/customer scope 도 contractId 참조용으로 같이 저장 가능 */
  contractId?: string;
  /** 차량 scope (또는 contract scope에서 차량 컨텍스트 같이 저장) */
  vehicleId?: string;
  /** 손님 scope (또는 contract scope에서 손님 컨텍스트 같이 저장) — customerIdentNo 디지트만 */
  customerKey?: string;
  /** 이 라운드 신규 — 명시적 scope */
  scope?: FieldLogScope;
  type: FieldLogType;
  body?: string;
  payload?: Record<string, string | number | boolean | undefined>;
  photoUrl?: string;
  at: string;
  by?: string;
  _meta?: WriteMeta;
};

/**
 * 계약 scope 메모 — legacy 호환 + 자동 전파.
 *
 * vehicleId / customerKey 가 같이 넘어오면 차량 노드 / 손님 노드에도 같은 log 자동 복사.
 * 사용자 의도: '계약에 입력된 거는 자동으로 차와 손님 이력에 남아야' → 1회 입력 = 3곳 노출.
 *
 * 복사된 log는 동일 id 사용 → 중복 탐지·동기화 가능.
 */
export async function addFieldLog(
  contractId: string,
  log: Omit<FieldLog, 'id' | 'contractId' | '_meta' | 'at'> & { by?: string; vehicleId?: string; customerKey?: string },
): Promise<string> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) throw new Error('Firebase 미설정');
  const newRef = push(ref(db, `${PATH_CONTRACT}/${contractId}`));
  const id = newRef.key;
  if (!id) throw new Error('Firebase push failed');
  const stamped = withMeta({
    ...log,
    id, contractId,
    scope: log.scope ?? 'contract',
    at: new Date().toISOString(),
  }, log.by);
  const data = pruneUndefined(stamped as unknown as Record<string, unknown>);
  // 1) 계약 노드
  await rtdbUpdate(ref(db, `${PATH_CONTRACT}/${contractId}/${id}`), data);
  // 2) 차량 노드 자동 전파
  if (log.vehicleId) {
    await rtdbUpdate(ref(db, `${PATH_VEHICLE}/${log.vehicleId}/${id}`), data);
  }
  // 3) 손님 노드 자동 전파
  if (log.customerKey) {
    const safeKey = log.customerKey.replace(/\D/g, '') || log.customerKey;
    await rtdbUpdate(ref(db, `${PATH_CUSTOMER}/${safeKey}/${id}`), data);
  }
  return id;
}

/** 차량 scope 메모 — /field_logs_vehicle/{vehicleId} */
export async function addVehicleFieldLog(vehicleId: string, log: Omit<FieldLog, 'id' | 'vehicleId' | '_meta' | 'at'> & { by?: string }): Promise<string> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) throw new Error('Firebase 미설정');
  const newRef = push(ref(db, `${PATH_VEHICLE}/${vehicleId}`));
  const id = newRef.key;
  if (!id) throw new Error('Firebase push failed');
  const stamped = withMeta({
    ...log,
    id, vehicleId,
    scope: 'vehicle' as FieldLogScope,
    at: new Date().toISOString(),
  }, log.by);
  await rtdbUpdate(ref(db, `${PATH_VEHICLE}/${vehicleId}/${id}`), pruneUndefined(stamped as unknown as Record<string, unknown>));
  return id;
}

/** 손님 scope 메모 — /field_logs_customer/{customerKey} */
export async function addCustomerFieldLog(customerKey: string, log: Omit<FieldLog, 'id' | 'customerKey' | '_meta' | 'at'> & { by?: string }): Promise<string> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) throw new Error('Firebase 미설정');
  const safeKey = customerKey.replace(/\D/g, '') || customerKey; // 디지트만
  const newRef = push(ref(db, `${PATH_CUSTOMER}/${safeKey}`));
  const id = newRef.key;
  if (!id) throw new Error('Firebase push failed');
  const stamped = withMeta({
    ...log,
    id, customerKey: safeKey,
    scope: 'customer' as FieldLogScope,
    at: new Date().toISOString(),
  }, log.by);
  await rtdbUpdate(ref(db, `${PATH_CUSTOMER}/${safeKey}/${id}`), pruneUndefined(stamped as unknown as Record<string, unknown>));
  return id;
}

/** 계약 scope log 삭제 */
export async function removeFieldLog(contractId: string, logId: string): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  await rtdbRemove(ref(db, `${PATH_CONTRACT}/${contractId}/${logId}`));
}

/** 계약 scope 라이브 구독 */
export function useFieldLogs(contractId: string | null | undefined): FieldLog[] {
  const [data, setData] = useState<FieldLog[]>([]);
  useEffect(() => {
    if (!contractId) { setData([]); return; }
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try { await ensureAuth(); } catch { /* silent */ }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) return;
      unsub = onValue(ref(db, `${PATH_CONTRACT}/${contractId}`), (snap) => {
        const val = snap.val() as Record<string, FieldLog> | null;
        const list = val ? Object.values(val) : [];
        list.forEach((l) => { if (!l.scope) l.scope = 'contract'; });
        list.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
        setData(list);
      });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [contractId]);
  return data;
}

/** 차량 scope 라이브 구독 */
export function useVehicleFieldLogs(vehicleId: string | null | undefined): FieldLog[] {
  const [data, setData] = useState<FieldLog[]>([]);
  useEffect(() => {
    if (!vehicleId) { setData([]); return; }
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try { await ensureAuth(); } catch { /* silent */ }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) return;
      unsub = onValue(ref(db, `${PATH_VEHICLE}/${vehicleId}`), (snap) => {
        const val = snap.val() as Record<string, FieldLog> | null;
        const list = val ? Object.values(val) : [];
        list.forEach((l) => { if (!l.scope) l.scope = 'vehicle'; });
        list.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
        setData(list);
      });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [vehicleId]);
  return data;
}

/** 손님 scope 라이브 구독 — customerKey = 디지트 normalized */
export function useCustomerFieldLogs(customerKey: string | null | undefined): FieldLog[] {
  const [data, setData] = useState<FieldLog[]>([]);
  useEffect(() => {
    const safeKey = (customerKey ?? '').replace(/\D/g, '');
    if (!safeKey) { setData([]); return; }
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try { await ensureAuth(); } catch { /* silent */ }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) return;
      unsub = onValue(ref(db, `${PATH_CUSTOMER}/${safeKey}`), (snap) => {
        const val = snap.val() as Record<string, FieldLog> | null;
        const list = val ? Object.values(val) : [];
        list.forEach((l) => { if (!l.scope) l.scope = 'customer'; });
        list.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
        setData(list);
      });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [customerKey]);
  return data;
}

/** 전체 field_logs 1회 fetch (활동피드) — 3 scope 통합 */
export async function fetchRecentFieldLogs(limit = 50): Promise<FieldLog[]> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return [];

  const all: FieldLog[] = [];
  for (const [scope, path] of [
    ['contract', PATH_CONTRACT] as const,
    ['vehicle',  PATH_VEHICLE] as const,
    ['customer', PATH_CUSTOMER] as const,
  ]) {
    const snap = await get(ref(db, path));
    const tree = (snap.val() ?? {}) as Record<string, Record<string, FieldLog>>;
    for (const sub of Object.values(tree)) {
      for (const log of Object.values(sub)) {
        if (!log.scope) log.scope = scope as FieldLogScope;
        all.push(log);
      }
    }
  }
  all.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  return all.slice(0, limit);
}

export const FIELD_LOG_LABEL: Record<FieldLogType, string> = {
  memo:     '메모',
  delivery: '인도',
  return:   '반납',
  location: '위치',
  call:     '통화',
  expense:  '비용',
  inspect:  '점검',
};

export const FIELD_LOG_TONE: Record<FieldLogType, 'brand' | 'green' | 'orange' | 'blue' | 'red' | 'amber' | 'purple'> = {
  memo:     'brand',
  delivery: 'green',
  return:   'orange',
  location: 'blue',
  call:     'blue',
  expense:  'amber',
  inspect:  'purple',
};

export const SCOPE_LABEL: Record<FieldLogScope, string> = {
  contract: '계약',
  vehicle:  '차량',
  customer: '손님',
};

export const SCOPE_TONE: Record<FieldLogScope, 'brand' | 'blue' | 'amber'> = {
  contract: 'brand',
  vehicle:  'blue',
  customer: 'amber',
};
