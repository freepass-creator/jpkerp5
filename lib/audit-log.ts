'use client';

/**
 * Append-only 감사 로그 — RTDB `audit_logs/` 노드에 push.
 *
 * Entity inline audit-fields 는 "마지막 변경자/시각" 만 보존.
 * 이 모듈은 모든 mutation 을 시계열로 누적해 "누가 언제 무엇을 했는가" 전체 히스토리.
 *
 * 호출은 fire-and-forget — 실패해도 entity write 는 성공해야 함.
 *
 *   const audit = useAuditStamp();
 *   const stamped = { ...company, ...audit.create() };
 *   setCompanies((prev) => [...prev, stamped]);
 *   audit.log({ action: 'create', entityType: 'company', entityId: stamped.code, label: stamped.name, after: stamped });
 *
 * RTDB 권장 인덱스 (Firebase Console > Database > Rules):
 *   "audit_logs": { ".indexOn": ["at", "entityType", "entityId"] }
 */

import { ref, push } from 'firebase/database';
import { getRtdb } from './firebase/client';
import { stripUndef } from './store-utils';
import type { AuditActor } from './audit-fields';
import { collectAuditMeta } from './audit-meta';

export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'login' | 'logout' | 'bulk_delete';
export type AuditEntityType =
  | 'asset'
  | 'contract'
  | 'customer'
  | 'company'
  | 'insurance'
  | 'journal'
  | 'ledger'
  | 'auth'
  | 'system';

export type AuditMeta = {
  /** 클라이언트 IP — 서버사이드 `/api/whoami` 에서 받아 세션당 캐시. */
  ip?: string;
  /** 브라우저/OS — navigator.userAgent. */
  userAgent?: string;
  /** 세션 식별자 — sessionStorage 발급 UUID. 같은 탭 내 모든 audit 묶음. */
  sessionId?: string;
  /** 작업 일어난 페이지 경로 (예: /asset, /admin/audit). */
  pagePath?: string;
  /** document.referrer (있으면). */
  referrer?: string;
  /** navigator.language. */
  locale?: string;
  /** 타임존 오프셋 (분, JS 부호 — 한국은 -540). */
  tzOffset?: number;
  /** 빌드 버전 — Vercel commit SHA 등 (선택). */
  appVersion?: string;
};

export type AuditLogEntry = {
  at: string;                 // ISO timestamp
  actor: AuditActor;          // 변경 행위자
  action: AuditAction;        // create | update | delete | restore | login | logout
  entityType: AuditEntityType;
  entityId: string;           // asset.id, contract.id, company.code, insurance.id, journal.id, auth=actor.uid
  /** 사람이 읽기 쉬운 식별자 — 자산은 plate, 계약은 contractNo, 회사는 name 등. */
  label?: string;
  /** update/delete 시 이전 상태 스냅샷 (선택). */
  before?: unknown;
  /** create/update/restore 시 새 상태 스냅샷 (선택). */
  after?: unknown;
  /** 통상 메타 — IP·UA·세션·페이지 등. 13c 단계에서 추가. */
  meta?: AuditMeta;
};

const RTDB_PATH = 'audit_logs';

export type AuditLogInput = Omit<AuditLogEntry, 'at' | 'actor' | 'meta'>;

/**
 * audit_logs/ 에 push. 실패는 console.warn 만 — 호출자에게 전파하지 않음 (mutation 본흐름 차단 X).
 * 표준 meta (IP·UA·세션·페이지 등) 자동 수집해서 entry 에 병합.
 */
export function pushAuditLog(actor: AuditActor, input: AuditLogInput): void {
  if (typeof window === 'undefined') return;
  const entry: AuditLogEntry = {
    at: new Date().toISOString(),
    actor,
    ...input,
    meta: collectAuditMeta(),
  };
  const db = getRtdb();
  if (!db) return;
  push(ref(db, RTDB_PATH), stripUndef(entry)).catch((e) => {
    console.warn('[audit-log] push failed', e);
  });
}
