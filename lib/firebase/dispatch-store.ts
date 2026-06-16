'use client';

/**
 * 요청받은 업무 (dispatch_orders) — 사무→현장 지시 단일 노드.
 *
 * RTDB 경로: /dispatch_orders/{orderId}
 *
 * 흐름:
 *  · 사무가 등록 (status='pending', createdBy)
 *  · 현장이 모바일에서 확인 (status='acknowledged', acknowledgedAt)
 *  · 현장이 완료 (status='done', doneAt)
 *
 * 종류:
 *  · inspection — 점검
 *  · delivery   — 인도 처리
 *  · return     — 반납 처리
 *  · memo       — 일반 메모
 *  · other      — 기타
 *
 * 추후 데스크탑 사무 페이지 (/dispatch 또는 /m/orders 신규 신청 UI)에서 등록.
 */

import { ref, push, onValue, update as rtdbUpdate, get } from 'firebase/database';
import { useEffect, useState } from 'react';
import { getRtdb, dbPath, ensureAuth, pruneUndefined } from './client';
import { withMeta, type WriteMeta } from '../write-meta';

const PATH = dbPath('dispatch_orders');

export type DispatchKind = 'inspection' | 'delivery' | 'return' | 'memo' | 'other';
export type DispatchStatus = 'pending' | 'acknowledged' | 'in_progress' | 'done' | 'cancelled';
/** 우선순위 — 긴급(즉시)/오늘(today, default)/이번주/이번달 */
export type DispatchPriority = 'urgent' | 'today' | 'thisWeek' | 'thisMonth';
export const DISPATCH_PRIORITY_LABEL: Record<DispatchPriority, string> = {
  urgent: '긴급',
  today: '오늘',
  thisWeek: '이번주',
  thisMonth: '이번달',
};
/** 정렬 우선순위 — 작을수록 위 */
export const DISPATCH_PRIORITY_ORDER: Record<DispatchPriority, number> = {
  urgent: 0,
  today: 1,
  thisWeek: 2,
  thisMonth: 3,
};

export type DispatchOrder = {
  id: string;
  /** 대상 직원 uid (개인 발송). 비어있으면 팀/부 또는 전체 */
  assignedToUid?: string;
  assignedToName?: string;
  /** 대상 팀 (팀 단위 발송) — UserProfile.department 매칭 */
  assignedToTeam?: string;
  /** 대상 부 (부 단위 발송) — 산하 모든 팀의 직원 */
  assignedToDivision?: string;
  title: string;
  body?: string;
  contractId?: string;
  vehicleId?: string;
  kind: DispatchKind;
  /** 우선순위 — 긴급/보통/시간될때. 미설정 시 'normal' 로 간주 */
  priority?: DispatchPriority;
  /** 마감 일자 (선택) — YYYY-MM-DD */
  dueDate?: string;
  status: DispatchStatus;
  createdBy?: string;
  acknowledgedAt?: string;
  startedAt?: string;
  doneAt?: string;
  _meta?: WriteMeta;
};

export const DISPATCH_LABEL: Record<DispatchKind, string> = {
  inspection: '점검',
  delivery:   '인도',
  return:     '반납',
  memo:       '메모',
  other:      '기타',
};

export const DISPATCH_TONE: Record<DispatchKind, 'brand' | 'green' | 'orange' | 'amber' | 'gray'> = {
  inspection: 'amber',
  delivery:   'green',
  return:     'orange',
  memo:       'brand',
  other:      'gray',
};

export async function createDispatchOrder(
  order: Omit<DispatchOrder, 'id' | 'status' | '_meta'>,
): Promise<string> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) throw new Error('Firebase 미설정');
  const newRef = push(ref(db, PATH));
  const id = newRef.key;
  if (!id) throw new Error('Firebase push failed');
  const stamped = withMeta(
    { ...order, id, status: 'pending' as DispatchStatus },
    order.createdBy,
  );
  await rtdbUpdate(ref(db, `${PATH}/${id}`), pruneUndefined(stamped as unknown as Record<string, unknown>));
  return id;
}

export async function updateDispatchStatus(
  orderId: string,
  patch: { status: DispatchStatus; acknowledgedAt?: string; startedAt?: string; doneAt?: string },
): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  await rtdbUpdate(ref(db, `${PATH}/${orderId}`), pruneUndefined(patch));
}

/** 본인 요청받은 업무 라이브 구독 — 모바일 홈/orders 페이지에서 사용
 *
 *  매칭 조건 (OR):
 *   1) assignedToUid === 본인 uid (개인 지정)
 *   2) assignedToTeam === 본인 팀
 *   3) assignedToDivision === 본인 부
 *   4) 모든 assigned 비어있음 (전체 broadcast)
 */
export function useMyDispatchOrders(
  uid: string | null | undefined,
  myTeam?: string,
  myDivision?: string,
): DispatchOrder[] {
  const [data, setData] = useState<DispatchOrder[]>([]);
  useEffect(() => {
    if (uid === undefined) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try { await ensureAuth(); } catch { /* silent */ }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) return;
      unsub = onValue(ref(db, PATH), (snap) => {
        const val = (snap.val() ?? {}) as Record<string, DispatchOrder>;
        const list = Object.values(val).filter((o) => {
          const broadcast = !o.assignedToUid && !o.assignedToTeam && !o.assignedToDivision;
          return broadcast
            || (o.assignedToUid && o.assignedToUid === uid)
            || (o.assignedToTeam && myTeam && o.assignedToTeam === myTeam)
            || (o.assignedToDivision && myDivision && o.assignedToDivision === myDivision);
        });
        list.sort((a, b) => (b._meta?.at ?? '').localeCompare(a._meta?.at ?? ''));
        setData(list);
      });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [uid, myTeam, myDivision]);
  return data;
}

/** 본인 미확인(pending) 요청 카운트 — 홈 카드용 */
export function useMyPendingDispatchCount(uid: string | null | undefined): number {
  const orders = useMyDispatchOrders(uid);
  return orders.filter((o) => o.status === 'pending').length;
}

/** 본인이 보낸 업무 라이브 구독 — createdBy 매치 */
export function useSentDispatchOrders(email: string | null | undefined): DispatchOrder[] {
  const [data, setData] = useState<DispatchOrder[]>([]);
  useEffect(() => {
    if (!email) { setData([]); return; }
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try { await ensureAuth(); } catch { /* silent */ }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) return;
      unsub = onValue(ref(db, PATH), (snap) => {
        const val = (snap.val() ?? {}) as Record<string, DispatchOrder>;
        const list = Object.values(val).filter((o) => o.createdBy === email);
        list.sort((a, b) => (b._meta?.at ?? '').localeCompare(a._meta?.at ?? ''));
        setData(list);
      });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [email]);
  return data;
}

/** 전체 요청 1회 fetch — 사무/관리자 페이지 */
export async function fetchAllDispatchOrders(): Promise<DispatchOrder[]> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return [];
  const snap = await get(ref(db, PATH));
  const val = (snap.val() ?? {}) as Record<string, DispatchOrder>;
  return Object.values(val).sort((a, b) => (b._meta?.at ?? '').localeCompare(a._meta?.at ?? ''));
}
