/**
 * Entity inline audit 필드 — 모든 사용자 변경 가능 entity 공통.
 *
 * 변경 이력(전체 히스토리)은 별도 audit_logs RTDB 노드에서 append-only로 관리.
 * 이 inline 필드는 "마지막 상태" 빠른 표시용
 * (entity 상세에 "최종 수정: 홍길동, 2026-05-04").
 *
 *   import type { AuditFields } from '@/lib/audit-fields';
 *   type Company = { code: string; name: string; ... } & AuditFields;
 *
 * 과거 stampCreate/Update/Delete/Restore + useAuditStamp 헬퍼 존재했으나
 * 실 사용 0 → 제거. 새 mutation 시 직접 createdAt/updatedAt/deletedAt 셋팅.
 */

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
