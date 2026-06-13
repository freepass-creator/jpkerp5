'use client';

/**
 * 활동 피드 — 여러 노드의 변경(write)을 시간 역순 통합 노출.
 *
 * 단일 RTDB + _meta 태깅 전략의 가시화:
 *   · field_logs (현장 입력: 메모/면허증/위치 등)
 *   · attendance_requests (근태 신청)
 *
 * 추후 확장: contracts/vehicles audit_logs 도 흡수 가능.
 *
 * source 필터: 'all' / 'mobile' / 'web' → 모바일 입력만 따로 보기 등.
 */

import { ref, onValue } from 'firebase/database';
import { useEffect, useState } from 'react';
import { getRtdb, dbPath, ensureAuth } from './client';
import type { FieldLog } from './field-logs-store';
import { FIELD_LOG_LABEL, FIELD_LOG_TONE } from './field-logs-store';
import type { AttendanceRequest } from './attendance-store';
import { ATTENDANCE_LABEL } from './attendance-store';
import type { DataSource } from '../write-meta';

export type ActivityKind = 'field_log' | 'attendance';

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  /** 표시 라벨 (예: '메모', '연차/휴가') */
  label: string;
  /** 본문 한 줄 요약 */
  summary: string;
  /** 연결 대상 — 어떤 계약/신청인지 */
  contractId?: string;
  attendanceId?: string;
  applicantName?: string;
  /** _meta 에서 가져온 actor/source/at */
  by?: string;
  source: DataSource;
  at: string;
  /** UI 색조 */
  tone: 'brand' | 'green' | 'orange' | 'blue' | 'red' | 'amber' | 'purple';
};

function fieldLogToActivity(log: FieldLog): ActivityItem {
  const summary = log.body?.split('\n')[0]?.slice(0, 120) ?? '(내용 없음)';
  return {
    id: `field-${log.id}`,
    kind: 'field_log',
    label: FIELD_LOG_LABEL[log.type] ?? log.type,
    summary,
    contractId: log.contractId,
    by: log._meta?.by ?? log.by,
    source: log._meta?.source ?? 'system',
    at: log._meta?.at ?? log.at,
    tone: FIELD_LOG_TONE[log.type] ?? 'brand',
  };
}

function attendanceToActivity(req: AttendanceRequest): ActivityItem {
  const summary = `${req.fromDate}${req.toDate && req.toDate !== req.fromDate ? ` ~ ${req.toDate}` : ''}`
    + (req.reason ? ` · ${req.reason.slice(0, 60)}` : '');
  return {
    id: `att-${req.id}`,
    kind: 'attendance',
    label: ATTENDANCE_LABEL[req.type] ?? req.type,
    summary,
    attendanceId: req.id,
    applicantName: req.applicantName ?? req.applicantEmail,
    by: req._meta?.by ?? req.applicantEmail,
    source: req._meta?.source ?? 'system',
    at: req._meta?.at ?? req.fromDate,
    tone: req.status === 'approved' ? 'green'
      : req.status === 'rejected' ? 'red'
      : req.status === 'cancelled' ? 'orange'
      : 'amber',
  };
}

/**
 * 활동 피드 라이브 구독 — field_logs + attendance_requests 합치고 _meta.at 역순 정렬.
 * limit 적용 (기본 100건).
 */
export function useActivityFeed(limit = 100): { items: ActivityItem[]; loading: boolean } {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubField: (() => void) | undefined;
    let unsubAtt: (() => void) | undefined;
    let cancelled = false;
    let fieldLogs: ActivityItem[] = [];
    let attendance: ActivityItem[] = [];

    function merge() {
      if (cancelled) return;
      const all = [...fieldLogs, ...attendance];
      all.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
      setItems(all.slice(0, limit));
      setLoading(false);
    }

    (async () => {
      try { await ensureAuth(); } catch { /* silent */ }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) return;

      // field_logs: /field_logs/{contractId}/{logId}
      unsubField = onValue(ref(db, dbPath('field_logs')), (snap) => {
        const tree = (snap.val() ?? {}) as Record<string, Record<string, FieldLog>>;
        const arr: ActivityItem[] = [];
        for (const contractLogs of Object.values(tree)) {
          for (const log of Object.values(contractLogs)) {
            arr.push(fieldLogToActivity(log));
          }
        }
        fieldLogs = arr;
        merge();
      });

      // attendance_requests: /attendance_requests/{requestId}
      unsubAtt = onValue(ref(db, dbPath('attendance_requests')), (snap) => {
        const val = (snap.val() ?? {}) as Record<string, AttendanceRequest>;
        attendance = Object.values(val).map(attendanceToActivity);
        merge();
      });
    })();

    return () => {
      cancelled = true;
      if (unsubField) unsubField();
      if (unsubAtt) unsubAtt();
    };
  }, [limit]);

  return { items, loading };
}

/** 상대 시간 표시 — '방금', '5분 전', '2시간 전', '어제', 'YYYY-MM-DD' */
export function relativeTime(iso: string): string {
  if (!iso) return '-';
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const min = 60_000, hr = 60 * min, day = 24 * hr;
  if (diff < 60_000) return '방금';
  if (diff < hr) return `${Math.floor(diff / min)}분 전`;
  if (diff < day) return `${Math.floor(diff / hr)}시간 전`;
  if (diff < 2 * day) return '어제';
  if (diff < 7 * day) return `${Math.floor(diff / day)}일 전`;
  return iso.slice(0, 10);
}
