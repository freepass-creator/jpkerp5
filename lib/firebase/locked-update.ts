'use client';

/**
 * Optimistic Lock SSOT — Firebase RTDB 동시편집 보호.
 *
 * ERP 30원칙 #22: 영업+회계 동시에 같은 계약 수정 시 한쪽 손실 방지.
 *
 * 동작:
 *   1) 클라이언트가 read 시점의 `updatedAt` 을 갖고 update 요청
 *   2) RTDB transaction() 안에서 서버 현재값의 `updatedAt` 비교
 *   3) 다르면 → 다른 사용자가 먼저 수정함 → throw LockConflictError
 *   4) 같으면 → 새 `updatedAt` 으로 commit
 *
 * 사용:
 *   await lockedUpdate(`contracts/${c.id}`, c.updatedAt, (current) => ({
 *     ...current, ...patch, updatedAt: new Date().toISOString(),
 *   }));
 *
 *   catch:
 *     try { await update(c); }
 *     catch (e) {
 *       if (e instanceof LockConflictError) {
 *         toast.error('다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도');
 *         return;
 *       }
 *       throw e;
 *     }
 *
 * 미적용 케이스 (의도적으로 그냥 update):
 *   · 신규 add (충돌 없음)
 *   · batch import (사용자 의도된 덮어씀)
 *   · audit log (append-only)
 */

import { ref, runTransaction } from 'firebase/database';
import { getRtdb, pruneUndefined } from './client';

export class LockConflictError extends Error {
  constructor(public refPath: string) {
    super(`동시편집 충돌 — 다른 사용자가 먼저 수정했습니다 (${refPath})`);
    this.name = 'LockConflictError';
  }
}

export type Lockable = { updatedAt?: string };

/**
 * Optimistic lock 으로 RTDB 노드 업데이트.
 *
 * @param refPath  업데이트할 노드 경로
 * @param expectedUpdatedAt  클라이언트가 본 read 시점의 updatedAt (undefined 면 lock 검사 skip)
 * @param patcher  서버 현재값을 받아 새 값 반환 (반드시 updatedAt 새로 셋팅)
 * @throws LockConflictError 다른 사용자가 먼저 수정함
 */
export async function lockedUpdate<T extends Lockable>(
  refPath: string,
  expectedUpdatedAt: string | undefined,
  patcher: (current: T) => T,
): Promise<void> {
  const db = getRtdb();
  if (!db) throw new Error('Firebase RTDB 미설정');
  const r = ref(db, refPath);
  const result = await runTransaction(r, (current: T | null) => {
    if (current == null) return current; // 부재 → transaction abort (null 반환)
    // 충돌 검사 — expectedUpdatedAt 가 명시되었고 서버값과 다르면 abort
    if (expectedUpdatedAt && current.updatedAt && current.updatedAt !== expectedUpdatedAt) {
      return; // undefined 반환 → abort
    }
    return pruneUndefined(patcher(current)) as T;
  });
  if (!result.committed) {
    throw new LockConflictError(refPath);
  }
}
