'use client';

/**
 * 공지사항 store — 누구나 작성·댓글, 작성자만 삭제.
 *
 *   /notices/{noticeId} = Notice (body + comments 인라인)
 */

import { ref, push, onValue, update as rtdbUpdate, remove as rtdbRemove } from 'firebase/database';
import { useEffect, useState } from 'react';
import { getRtdb, dbPath, ensureAuth, pruneUndefined } from './client';

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

/** 모든 공지사항 실시간 구독 (최신순) */
export function useNotices(): { notices: Notice[]; loading: boolean } {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try { await ensureAuth(); } catch { setLoading(false); return; }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) { setLoading(false); return; }
      unsub = onValue(ref(db, PATH), (snap) => {
        const val = (snap.val() ?? {}) as Record<string, Notice>;
        const list = Object.values(val).sort((a, b) =>
          (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
        );
        setNotices(list);
        setLoading(false);
      });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, []);
  return { notices, loading };
}
