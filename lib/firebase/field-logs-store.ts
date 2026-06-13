'use client';

/**
 * 현장 입력 로그 (field_logs) — 모바일·현장에서 들어오는 모든 입력의 통합 저장소.
 *
 * RTDB 경로: /field_logs/{contractId}/{logId}
 *
 * 종류 (type):
 *  · memo      — 자유 메모
 *  · delivery  — 인도 처리
 *  · return    — 반납 처리
 *  · location  — 차량 위치 등록
 *  · call      — 통화 메모
 *  · expense   — 비용 (주유/세차/통행료)
 *  · inspect   — 점검 결과
 *
 * 모든 변경에 _meta 자동 부여 (source/by/at) → 활동피드/감사추적 단일 소스.
 */

import { ref, push, onValue, get, remove as rtdbRemove, update as rtdbUpdate } from 'firebase/database';
import { useEffect, useState } from 'react';
import { getRtdb, dbPath, ensureAuth, pruneUndefined } from './client';
import { withMeta, type WriteMeta } from '../write-meta';

const PATH = dbPath('field_logs');

export type FieldLogType = 'memo' | 'delivery' | 'return' | 'location' | 'call' | 'expense' | 'inspect';

export type FieldLog = {
  id: string;
  contractId: string;
  type: FieldLogType;
  /** 본문 (메모 텍스트, 점검 결과 등) */
  body?: string;
  /** 인도/반납/위치 보조 정보 — 자유 형식. 위치=좌표, 비용=금액·항목, 점검=항목별 결과 등 */
  payload?: Record<string, string | number | boolean | undefined>;
  /** 사진 첨부 1장 (모바일 즉시 촬영 시) — base64 데이터 URL 또는 storage URL */
  photoUrl?: string;
  at: string;          // ISO
  by?: string;
  _meta?: WriteMeta;
};

/** field_logs/{contractId} 1건 push. _meta 자동 부여. */
export async function addFieldLog(contractId: string, log: Omit<FieldLog, 'id' | 'contractId' | '_meta' | 'at'> & { by?: string }): Promise<string> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) throw new Error('Firebase 미설정');
  const newRef = push(ref(db, `${PATH}/${contractId}`));
  const id = newRef.key;
  if (!id) throw new Error('Firebase push failed');
  const stamped = withMeta({
    ...log,
    id,
    contractId,
    at: new Date().toISOString(),
  }, log.by);
  await rtdbUpdate(ref(db, `${PATH}/${contractId}/${id}`), pruneUndefined(stamped as unknown as Record<string, unknown>));
  return id;
}

/** field_logs/{contractId} 1건 삭제 */
export async function removeFieldLog(contractId: string, logId: string): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  await rtdbRemove(ref(db, `${PATH}/${contractId}/${logId}`));
}

/** field_logs/{contractId} 라이브 구독 — 계약 상세에서 사용 */
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
      unsub = onValue(ref(db, `${PATH}/${contractId}`), (snap) => {
        const val = snap.val() as Record<string, FieldLog> | null;
        const list = val ? Object.values(val) : [];
        list.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
        setData(list);
      });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [contractId]);
  return data;
}

/** 전체 field_logs 1회 fetch — 활동피드용 (시간 역순 N건) */
export async function fetchRecentFieldLogs(limit = 50): Promise<FieldLog[]> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return [];
  const snap = await get(ref(db, PATH));
  const tree = (snap.val() ?? {}) as Record<string, Record<string, FieldLog>>;
  const all: FieldLog[] = [];
  for (const contractLogs of Object.values(tree)) {
    for (const log of Object.values(contractLogs)) {
      all.push(log);
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
