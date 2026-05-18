'use client';

/**
 * Entity inline audit 필드 — 모든 사용자 변경 가능 entity 공통.
 *
 * 변경 이력 (전체 히스토리) 은 별도 audit_logs RTDB 노드에서 append-only 로 관리 (예정).
 * 이 inline 필드는 "마지막 상태" 빠른 표시용 (entity 상세에 "최종 수정: 홍길동, 2026-05-04").
 *
 *   import { type AuditFields, stampCreate, stampUpdate, stampDelete } from '@/lib/audit-fields';
 *
 *   type Company = { code: string; name: string; ... } & AuditFields;
 *
 *   // store 의 write 시 자동 주입
 *   const next = { ...input, ...stampCreate(currentUser) };
 *   const upd  = { ...prev,  ...stampUpdate(currentUser) };
 *   const del  = { ...prev,  ...stampDelete(currentUser) };
 *
 *   // React 컴포넌트에선 useAuditStamp() 훅 — 현재 user 가 미리 바인딩됨
 *   const audit = useAuditStamp();
 *   setX((prev) => prev.map((x) => x.id === id ? { ...x, ...audit.delete() } : x));
 */

import type { User } from 'firebase/auth';
import { useAuth } from './use-auth';
import { pushAuditLog, type AuditLogInput } from './audit-log';

export type AuditActor = {
  uid: string;
  email?: string;
  name?: string;
};

export type AuditFields = {
  createdBy?: AuditActor;
  createdAt?: string;          // ISO
  updatedBy?: AuditActor;
  updatedAt?: string;
  /** soft-delete 행위자. 기존 deletedAt 과 함께. undefined 면 active. */
  deletedBy?: AuditActor;
};

function actorOf(user: User | null | undefined): AuditActor {
  if (!user) return { uid: 'system' };
  return {
    uid: user.uid,
    email: user.email ?? undefined,
    name: user.displayName ?? undefined,
  };
}

/** 신규 등록 시: createdBy/At 셋팅. */
export function stampCreate(user: User | null | undefined): Pick<AuditFields, 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt'> {
  const actor = actorOf(user);
  const at = new Date().toISOString();
  return { createdBy: actor, createdAt: at, updatedBy: actor, updatedAt: at };
}

/** 수정 시: updatedBy/At 갱신 (createdBy/At 는 보존). */
export function stampUpdate(user: User | null | undefined): Pick<AuditFields, 'updatedBy' | 'updatedAt'> {
  return { updatedBy: actorOf(user), updatedAt: new Date().toISOString() };
}

/** soft-delete 시: deletedBy + deletedAt + updatedBy/At. */
export function stampDelete(user: User | null | undefined): Pick<AuditFields, 'deletedBy' | 'updatedBy' | 'updatedAt'> & { deletedAt: string } {
  const actor = actorOf(user);
  const at = new Date().toISOString();
  return { deletedBy: actor, deletedAt: at, updatedBy: actor, updatedAt: at };
}

/** 복원 시: deletedBy/At 제거 + updatedBy/At 갱신. */
export function stampRestore(user: User | null | undefined): { deletedAt: undefined; deletedBy: undefined } & Pick<AuditFields, 'updatedBy' | 'updatedAt'> {
  return { deletedAt: undefined, deletedBy: undefined, ...stampUpdate(user) };
}

/**
 * 현재 인증된 user 를 미리 바인딩한 stamp 헬퍼 묶음 — React 컴포넌트 mutation 사이트용.
 *
 *   const audit = useAuditStamp();
 *   setAssets((prev) => prev.map((a) => a.id === id ? { ...a, ...audit.delete() } : a));
 *   setAssets((prev) => [{ ...newAsset, ...audit.create() }, ...prev]);
 *
 * append-only 히스토리 (audit_logs/) 도 같은 훅에서:
 *
 *   audit.log({ action: 'create', entityType: 'asset', entityId: id, label: plate, after: asset });
 */
export function useAuditStamp() {
  const { user } = useAuth();
  return {
    create: () => stampCreate(user),
    update: () => stampUpdate(user),
    delete: () => stampDelete(user),
    restore: () => stampRestore(user),
    log: (input: AuditLogInput) => pushAuditLog(actorOf(user), input),
  };
}
