'use client';

/**
 * 근태 신청 (attendance_requests) — 웹·모바일 공유 단일 노드.
 *
 * RTDB 경로: /attendance_requests/{requestId}
 *
 * 종류 (type):
 *  · vacation    — 연차/휴가
 *  · half-day-am — 오전 반차
 *  · half-day-pm — 오후 반차
 *  · early-leave — 조퇴
 *  · sick        — 병가
 *  · other       — 기타
 *
 * 상태 흐름:
 *   pending → approved | rejected | cancelled
 *
 * 추후 전자결재 확장 대비:
 *  · approvalChain[] — 다단계 결재자 어레이 (현재는 단일 status 만)
 *  · 데스크탑 /attendance 페이지 (다음 라운드)에서 승인·반려
 */

import { ref, push, onValue, update as rtdbUpdate, get } from 'firebase/database';
import { useEffect, useState } from 'react';
import { getRtdb, dbPath, ensureAuth, pruneUndefined } from './client';
import { withMeta, type WriteMeta } from '../write-meta';
import { todayKr } from '../mock-data';

const PATH = dbPath('attendance_requests');

export type AttendanceType =
  | 'vacation' | 'half-day-am' | 'half-day-pm'
  | 'early-leave' | 'sick' | 'other';

export type AttendanceStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type AttendanceRequest = {
  id: string;
  applicantUid: string;
  applicantEmail?: string;
  applicantName?: string;
  type: AttendanceType;
  /** 휴가/병가: 시작일, 반차/조퇴: 해당일 */
  fromDate: string;       // YYYY-MM-DD
  /** 휴가/병가만 — 종료일 */
  toDate?: string;
  /** 조퇴 — 출발 시간 (HH:MM) */
  earlyLeaveAt?: string;
  reason?: string;
  status: AttendanceStatus;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  /** 추후 전자결재 — 결재자 어레이 (현재 미사용) */
  approvalChain?: Array<{ uid: string; email?: string; status: AttendanceStatus; at?: string; reason?: string }>;
  _meta?: WriteMeta;
};

export const ATTENDANCE_LABEL: Record<AttendanceType, string> = {
  vacation:      '연차/휴가',
  'half-day-am': '오전 반차',
  'half-day-pm': '오후 반차',
  'early-leave': '조퇴',
  sick:          '병가',
  other:         '기타',
};

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  pending:   '대기',
  approved:  '승인',
  rejected:  '반려',
  cancelled: '취소',
};

export const STATUS_TONE: Record<AttendanceStatus, 'orange' | 'green' | 'red' | 'gray'> = {
  pending:   'orange',
  approved:  'green',
  rejected:  'red',
  cancelled: 'gray',
};

export async function submitAttendanceRequest(
  req: Omit<AttendanceRequest, 'id' | 'status' | '_meta'>,
): Promise<string> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) throw new Error('Firebase 미설정');
  const newRef = push(ref(db, PATH));
  const id = newRef.key;
  if (!id) throw new Error('Firebase push failed');
  const stamped = withMeta(
    { ...req, id, status: 'pending' as AttendanceStatus },
    req.applicantEmail,
  );
  await rtdbUpdate(ref(db, `${PATH}/${id}`), pruneUndefined(stamped as unknown as Record<string, unknown>));
  return id;
}

export async function updateAttendanceStatus(
  requestId: string,
  patch: { status: AttendanceStatus; approvedBy?: string; rejectionReason?: string },
): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  await rtdbUpdate(
    ref(db, `${PATH}/${requestId}`),
    pruneUndefined({
      ...patch,
      approvedAt: new Date().toISOString(),
    }),
  );
}

/**
 * 오늘 휴무자 수 라이브 구독 — 오늘 날짜가 fromDate ~ toDate 범위 안 & status=approved.
 *
 *  · am   — 오전반차
 *  · pm   — 오후반차 + 조퇴 (둘 다 오후 부재)
 *  · full — 연차/병가/기타 (종일 부재)
 *  · count — 전체 합
 */
export function useTodayOnLeaveCount(): {
  am: number; pm: number; full: number; count: number; types: AttendanceType[];
} {
  const [state, setState] = useState<{
    am: number; pm: number; full: number; count: number; types: AttendanceType[];
  }>({ am: 0, pm: 0, full: 0, count: 0, types: [] });
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try { await ensureAuth(); } catch { /* silent */ }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) return;
      unsub = onValue(ref(db, PATH), (snap) => {
        const val = (snap.val() ?? {}) as Record<string, AttendanceRequest>;
        const today = todayKr();   // KST — UTC toISOString 은 0~9시에 전날로 판정됨
        const filtered = Object.values(val).filter((r) => {
          if (r.status !== 'approved') return false;
          const from = r.fromDate ?? '';
          const to = r.toDate ?? from;
          return from <= today && today <= to;
        });
        let am = 0, pm = 0, full = 0;
        for (const r of filtered) {
          if (r.type === 'half-day-am') am += 1;
          else if (r.type === 'half-day-pm' || r.type === 'early-leave') pm += 1;
          else full += 1;
        }
        setState({
          am, pm, full,
          count: filtered.length,
          types: Array.from(new Set(filtered.map((r) => r.type))),
        });
      });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, []);
  return state;
}

/** 본인 신청만 라이브 구독 — 모바일 근태관리 페이지에서 사용 */
export function useMyAttendanceRequests(uid: string | null | undefined): AttendanceRequest[] {
  const [data, setData] = useState<AttendanceRequest[]>([]);
  useEffect(() => {
    if (!uid) { setData([]); return; }
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try { await ensureAuth(); } catch { /* silent */ }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) return;
      unsub = onValue(ref(db, PATH), (snap) => {
        const val = (snap.val() ?? {}) as Record<string, AttendanceRequest>;
        const list = Object.values(val).filter((r) => r.applicantUid === uid);
        list.sort((a, b) => (b.fromDate ?? '').localeCompare(a.fromDate ?? ''));
        setData(list);
      });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [uid]);
  return data;
}

/** 전체 (관리자/결재자용) — 데스크탑 승인 화면에서 사용 */
export async function fetchAllAttendanceRequests(): Promise<AttendanceRequest[]> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return [];
  const snap = await get(ref(db, PATH));
  const val = (snap.val() ?? {}) as Record<string, AttendanceRequest>;
  return Object.values(val).sort((a, b) => (b.fromDate ?? '').localeCompare(a.fromDate ?? ''));
}
