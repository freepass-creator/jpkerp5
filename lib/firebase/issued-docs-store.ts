'use client';

/**
 * issued_documents/ RTDB 노드 — 회사 표준 문서 발급 이력.
 *
 *  · 발급 시점에 1건 push (문서번호·양식·대상·입력값·발급자·발급일)
 *  · 재발급 시 새 entry (이전 거 무효화 X — 발급 히스토리는 영구 보존)
 *  · Drive 저장 성공 시 driveFileId · driveWebViewLink 부착
 *
 * lib/doc-templates.ts 의 양식 시스템과 짝.
 */

import { ref, push, update as rtdbUpdate, remove as rtdbRemove } from 'firebase/database';
import { useMemo } from 'react';
import { getRtdb, dbPath, ensureAuth, pruneUndefined } from './client';
import { useCachedSnapshot } from './cached-subscribe';
import type { DocTargetType, DocCategory } from '@/lib/doc-templates';

const PATH = dbPath('issued_documents');

export type IssuedDocument = {
  id: string;
  templateId: string;
  templateTitle: string;
  category: DocCategory;
  /** JPK-{prefix}-{YYMM}-{seq} */
  docNo: string;
  targetType: DocTargetType;
  /** staff uid 또는 partner company id (free 일 땐 빈 문자열) */
  targetId?: string;
  targetName?: string;
  /** 양식 fields 입력값 */
  data: Record<string, string>;
  /** 발급 시점 회사 정보 스냅샷 (회사 정보가 추후 바뀌어도 발급문서는 보존) */
  issuerCompanyId?: string;
  issuerCompanyName: string;
  issuedAt: string;
  issuedBy: string;
  /** Drive 저장 — 성공 시만 채워짐 */
  driveFileId?: string;
  driveWebViewLink?: string;
};

/** 발급 — 신규 entry push 후 id 반환. */
export async function addIssuedDocument(input: Omit<IssuedDocument, 'id'>): Promise<string> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) throw new Error('Firebase 미설정');
  const newRef = push(ref(db, PATH));
  const id = newRef.key;
  if (!id) throw new Error('push failed');
  const stamped: IssuedDocument = { ...input, id };
  await rtdbUpdate(ref(db, `${PATH}/${id}`), pruneUndefined(stamped as unknown as Record<string, unknown>));
  return id;
}

/** Drive 저장 결과 추가 부착 — 발급 후 비동기로 Drive 업로드 성공 시. */
export async function attachDriveInfo(docId: string, driveFileId: string, driveWebViewLink?: string): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  await rtdbUpdate(ref(db, `${PATH}/${docId}`), pruneUndefined({ driveFileId, driveWebViewLink }));
}

/** 삭제 — 발급 취소 또는 정비용 (보통은 호출 X). */
export async function removeIssuedDocument(docId: string): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  await rtdbRemove(ref(db, `${PATH}/${docId}`));
}

// 모듈 상수 — stable transform (정렬만, limit 은 hook 내부에서)
function issuedDocsTransform(val: unknown): IssuedDocument[] {
  if (!val) return [];
  return Object.values<IssuedDocument>(val as Record<string, IssuedDocument>)
    .sort((a, b) => (b.issuedAt ?? '').localeCompare(a.issuedAt ?? ''));
}

/** 라이브 구독 — 최신순 (모듈-cache 공유). */
export function useIssuedDocuments(opts?: { limit?: number }): {
  items: IssuedDocument[];
  loading: boolean;
} {
  const limit = opts?.limit;
  const { rows, loading } = useCachedSnapshot<IssuedDocument>(PATH, issuedDocsTransform);
  const items = useMemo(() => (limit ? rows.slice(0, limit) : rows), [rows, limit]);
  return { items, loading };
}

/**
 * 같은 prefix 의 이번 달 발급 건수 + 1 = 다음 일련번호.
 * docNo = JPK-{prefix}-{YYMM}-{seq}
 */
export function computeNextSeq(items: IssuedDocument[], prefix: string, when: Date = new Date()): number {
  const yy = String(when.getFullYear()).slice(-2);
  const mm = String(when.getMonth() + 1).padStart(2, '0');
  const monthPrefix = `JPK-${prefix}-${yy}${mm}`;
  const sameMonth = items.filter((d) => d.docNo.startsWith(monthPrefix));
  return sameMonth.length + 1;
}
