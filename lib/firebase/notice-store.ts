'use client';

/**
 * 공지사항 store — 누구나 작성·댓글, 작성자만 삭제.
 *
 *   /notices/{noticeId} = Notice (body + comments 인라인)
 */

import { ref, push, update as rtdbUpdate, remove as rtdbRemove } from 'firebase/database';
import { getRtdb, dbPath, ensureAuth, pruneUndefined } from './client';
import { useCachedSnapshot } from './cached-subscribe';

const PATH = dbPath('notices');

export type NoticeComment = {
  id: string;
  body: string;
  createdBy: string;       // email
  createdByName?: string;
  createdAt: string;       // ISO
};

export type Notice = {
  id: string;
  title: string;
  body: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  /** inline 댓글 dictionary (id → NoticeComment) */
  comments?: Record<string, NoticeComment>;
};

export async function createNotice(input: Omit<Notice, 'id' | 'createdAt'>): Promise<string> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) throw new Error('Firebase 미설정');
  const newRef = push(ref(db, PATH));
  const id = newRef.key;
  if (!id) throw new Error('Firebase push failed');
  const stamped: Notice = {
    ...input,
    id,
    createdAt: new Date().toISOString(),
  };
  await rtdbUpdate(ref(db, `${PATH}/${id}`), pruneUndefined(stamped as unknown as Record<string, unknown>));
  return id;
}

export async function updateNotice(noticeId: string, patch: Partial<Notice>): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  await rtdbUpdate(ref(db, `${PATH}/${noticeId}`), pruneUndefined(patch as unknown as Record<string, unknown>));
}

export async function removeNotice(noticeId: string): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  await rtdbRemove(ref(db, `${PATH}/${noticeId}`));
}

export async function addComment(
  noticeId: string,
  input: Omit<NoticeComment, 'id' | 'createdAt'>,
): Promise<string> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) throw new Error('Firebase 미설정');
  const newRef = push(ref(db, `${PATH}/${noticeId}/comments`));
  const id = newRef.key;
  if (!id) throw new Error('Firebase push failed');
  const stamped: NoticeComment = {
    ...input,
    id,
    createdAt: new Date().toISOString(),
  };
  await rtdbUpdate(ref(db, `${PATH}/${noticeId}/comments/${id}`), pruneUndefined(stamped as unknown as Record<string, unknown>));
  return id;
}

export async function removeComment(noticeId: string, commentId: string): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  await rtdbRemove(ref(db, `${PATH}/${noticeId}/comments/${commentId}`));
}

// 모듈 상수 — stable transform reference
function noticesTransform(val: unknown): Notice[] {
  if (!val) return [];
  return Object.values<Notice>(val as Record<string, Notice>)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

/** 모든 공지사항 실시간 구독 (최신순) — 모듈-cache 공유 */
export function useNotices(): { notices: Notice[]; loading: boolean } {
  const { rows: notices, loading } = useCachedSnapshot<Notice>(PATH, noticesTransform);
  return { notices, loading };
}
