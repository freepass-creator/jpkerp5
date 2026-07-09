'use client';

import { useEffect, useState } from 'react';
import { ref, onValue, push, query, orderByChild, limitToLast } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth, getFirebaseAuth } from './client';
import type { AuditLog } from '@/lib/types';

const PATH = dbPath('audit_logs');

/** 감사 로그 — 최근 N건 구독 (기본 500) */
export function useAuditLogs(limit = 500) {
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured] = useState(() => isFirebaseConfigured());

  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try { await ensureAuth(); } catch { setLoading(false); return; }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) { setLoading(false); return; }
      const r = query(ref(db, PATH), orderByChild('at'), limitToLast(limit));
      unsub = onValue(r, (snap) => {
        const val = snap.val() as Record<string, AuditLog> | null;
        const list = val ? Object.values(val) : [];
        // 최근순
        list.sort((a, b) => b.at.localeCompare(a.at));
        setRows(list);
        setLoading(false);
      });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [configured, limit]);

  return { rows, loading, configured };
}

/**
 * 감사 로그 1건 기록 — 어디서든 호출 가능.
 * 인증 안 됐으면 by 없이 기록 (anonymous).
 * 실패해도 throw 안 함 — audit 실패가 본 동작을 막으면 안 됨.
 */
export async function logAudit(entry: Omit<AuditLog, 'id' | 'at' | 'userId'> & { at?: string }): Promise<void> {
  try {
    if (!isFirebaseConfigured()) return;
    await ensureAuth();
    const db = getRtdb();
    if (!db) return;
    const auth = getFirebaseAuth();
    const user = auth?.currentUser;
    const newRef = push(ref(db, PATH));
    const id = newRef.key;
    if (!id) return;
    const full: AuditLog = {
      id,
      at: entry.at ?? new Date().toISOString(),
      by: entry.by ?? user?.email ?? undefined,
      byUid: entry.byUid ?? user?.uid ?? undefined,
      // Rules .validate 가 필수로 요구하는 필드 — 항상 문자열 보장(익명/시스템도 기록되게). 미기록 시 규칙 배포하면 전 감사 유실.
      userId: entry.byUid ?? user?.uid ?? 'system',
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      label: entry.label,
      before: entry.before,
      after: entry.after,
    };
    // newRef 에 set (push는 ref 자체에 push)
    const { set } = await import('firebase/database');
    const { pruneUndefined } = await import('./client');
    await set(newRef, pruneUndefined(full));
  } catch {
    // silent — audit 실패가 본 동작 막지 않음. Rules 누락 등 흔한 케이스라 console 도 비움.
  }
}

/** 편의 헬퍼들 */
export const audit = {
  create: (entityType: AuditLog['entityType'], entityId: string, label: string, after?: Record<string, unknown>) =>
    logAudit({ action: 'create', entityType, entityId, label, after }),
  update: (entityType: AuditLog['entityType'], entityId: string, label: string, before?: Record<string, unknown>, after?: Record<string, unknown>) =>
    logAudit({ action: 'update', entityType, entityId, label, before, after }),
  delete: (entityType: AuditLog['entityType'], entityId: string, label: string, before?: Record<string, unknown>) =>
    logAudit({ action: 'delete', entityType, entityId, label, before }),
  match: (entityType: AuditLog['entityType'], entityId: string, label: string, after?: Record<string, unknown>) =>
    logAudit({ action: 'match', entityType, entityId, label, after }),
  unmatch: (entityType: AuditLog['entityType'], entityId: string, label: string, before?: Record<string, unknown>) =>
    logAudit({ action: 'unmatch', entityType, entityId, label, before }),
  import: (entityType: AuditLog['entityType'], label: string, after?: Record<string, unknown>) =>
    logAudit({ action: 'import', entityType, label, after }),
};
