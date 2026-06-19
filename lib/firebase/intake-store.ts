'use client';

/**
 * intake/ RTDB 노드 — 단일 입구 inbox.
 *
 * 모든 데이터 입력이 일단 여기로 들어옴. classify + match → 결과에 따라:
 *   high confidence → 자동 commit (도메인 노드에 write, status='committed')
 *   medium/low → status='pending' (사용자가 /inbox 에서 확인·수정·승인)
 *   분류 실패 → status='pending' (사용자가 수동 분류)
 *
 * RTDB 경로: /intake/{itemId}
 *
 * Phase 2.0 (현재) — store 만 신설. 아무도 안 부름. UI 영향 0.
 * Phase 2.1+ — 기존 입구가 점차 이 store 통과하도록 마이그레이션.
 */

import { ref, push, onValue, remove as rtdbRemove, update as rtdbUpdate } from 'firebase/database';
import { useEffect, useState } from 'react';
import { getRtdb, dbPath, ensureAuth, pruneUndefined } from './client';
import { withMeta, type WriteMeta } from '../write-meta';
import type {
  IntakeItem, IntakeRaw, IntakeSource, IntakeStatus,
  ClassifyResult, MatchResult,
} from '@/lib/intake/types';

const PATH = dbPath('intake');

export type IntakeItemRecord = IntakeItem & { _meta?: WriteMeta };

/** 신규 intake item — 분류·매칭 전 raw 만. status='classifying' 으로 시작. */
export async function addIntakeItem(input: {
  source: IntakeSource;
  raw: IntakeRaw;
  createdBy?: string;
}): Promise<string> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) throw new Error('Firebase 미설정');
  const newRef = push(ref(db, PATH));
  const id = newRef.key;
  if (!id) throw new Error('Firebase push failed');
  const item: IntakeItem = {
    id,
    source: input.source,
    status: 'classifying',
    raw: input.raw,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };
  const stamped = withMeta(item, input.createdBy);
  await rtdbUpdate(ref(db, `${PATH}/${id}`), pruneUndefined(stamped as unknown as Record<string, unknown>));
  return id;
}

/** classify 결과 부착 — 그 다음 match 단계로. */
export async function setIntakeClassify(itemId: string, classify: ClassifyResult, actorEmail?: string): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  await rtdbUpdate(ref(db, `${PATH}/${itemId}`), pruneUndefined({
    classify,
    status: 'matching' as IntakeStatus,
    updatedAt: new Date().toISOString(),
    _meta: { updatedBy: actorEmail, updatedAt: new Date().toISOString() },
  }));
}

/** match 결과 부착. high 면 호출자가 곧 commit 호출 예정. */
export async function setIntakeMatch(
  itemId: string,
  match: MatchResult,
  nextStatus: Extract<IntakeStatus, 'matched' | 'pending'>,
  actorEmail?: string,
): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  await rtdbUpdate(ref(db, `${PATH}/${itemId}`), pruneUndefined({
    match,
    status: nextStatus,
    updatedAt: new Date().toISOString(),
    _meta: { updatedBy: actorEmail, updatedAt: new Date().toISOString() },
  }));
}

/** 사용자 수동 보정 — kind 직접 지정 */
export async function setIntakeOverrideKind(itemId: string, overrideKind: IntakeItem['overrideKind'], actorEmail?: string): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  await rtdbUpdate(ref(db, `${PATH}/${itemId}`), pruneUndefined({
    overrideKind,
    updatedAt: new Date().toISOString(),
    _meta: { updatedBy: actorEmail, updatedAt: new Date().toISOString() },
  }));
}

/** 사용자 수동 보정 — match 직접 지정 (계약 ID 등) */
export async function setIntakeOverrideMatch(itemId: string, overrideMatch: Partial<MatchResult>, actorEmail?: string): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  await rtdbUpdate(ref(db, `${PATH}/${itemId}`), pruneUndefined({
    overrideMatch,
    updatedAt: new Date().toISOString(),
    _meta: { updatedBy: actorEmail, updatedAt: new Date().toISOString() },
  }));
}

/** commit 처리 — 도메인 노드에 write 끝났을 때. committed[] 에 어디 들어갔는지 기록. */
export async function markIntakeCommitted(
  itemId: string,
  committed: NonNullable<IntakeItem['committed']>,
  actorEmail?: string,
): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  await rtdbUpdate(ref(db, `${PATH}/${itemId}`), pruneUndefined({
    committed,
    status: 'committed' as IntakeStatus,
    updatedAt: new Date().toISOString(),
    _meta: { updatedBy: actorEmail, updatedAt: new Date().toISOString() },
  }));
}

/** 거부 — 사용자가 명시적으로 '이 입력은 안 받음' 선택. */
export async function markIntakeRejected(itemId: string, rejectReason: string, actorEmail?: string): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  await rtdbUpdate(ref(db, `${PATH}/${itemId}`), pruneUndefined({
    rejectReason,
    status: 'rejected' as IntakeStatus,
    updatedAt: new Date().toISOString(),
    _meta: { updatedBy: actorEmail, updatedAt: new Date().toISOString() },
  }));
}

/** 영구 삭제 — committed/rejected 된 오래된 항목 청소용. 보통은 호출 X. */
export async function removeIntakeItem(itemId: string): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  await rtdbRemove(ref(db, `${PATH}/${itemId}`));
}

/** 라이브 구독 — 기본은 처리 진행중 (pending/classifying/matching/matched) 만. */
export function useIntakeItems(opts?: {
  status?: IntakeStatus | 'active';
  limit?: number;
}): { items: IntakeItem[]; loading: boolean } {
  const [items, setItems] = useState<IntakeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const wantStatus = opts?.status ?? 'active';
  const limit = opts?.limit;

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try { await ensureAuth(); } catch { /* silent */ }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) { setLoading(false); return; }
      unsub = onValue(ref(db, PATH), (snap) => {
        const val = (snap.val() ?? {}) as Record<string, IntakeItem>;
        let list = Object.values(val);
        if (wantStatus === 'active') {
          list = list.filter((i) => i.status !== 'committed' && i.status !== 'rejected');
        } else {
          list = list.filter((i) => i.status === wantStatus);
        }
        list.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
        if (limit) list = list.slice(0, limit);
        setItems(list);
        setLoading(false);
      }, () => setLoading(false));
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [wantStatus, limit]);

  return { items, loading };
}

/** intake 단건 구독 — /inbox 디테일 패널용 */
export function useIntakeItem(itemId: string | null | undefined): { item: IntakeItem | null; loading: boolean } {
  const [item, setItem] = useState<IntakeItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!itemId) { setItem(null); setLoading(false); return; }
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try { await ensureAuth(); } catch { /* silent */ }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) { setLoading(false); return; }
      unsub = onValue(ref(db, `${PATH}/${itemId}`), (snap) => {
        setItem((snap.val() ?? null) as IntakeItem | null);
        setLoading(false);
      }, () => setLoading(false));
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [itemId]);

  return { item, loading };
}
