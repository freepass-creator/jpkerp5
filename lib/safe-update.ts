'use client';

/**
 * Update mutator 호출을 LockConflictError·일반 에러 모두 잡아 토스트로 처리.
 *
 * ERP 30원칙 #22 (동시편집) + #16 (멱등성) 통합 진입점.
 *
 * 사용:
 *   await safeUpdate(() => updateContract(c), {
 *     onConflict: () => 새로고침 권유 + UI 닫기,
 *   });
 *
 *   // 또는 그냥:
 *   const ok = await safeUpdate(() => updateContract(c));
 *   if (!ok) return; // 충돌·실패 시 토스트는 이미 떴음
 */

import { LockConflictError } from './firebase/locked-update';
import { toast } from './toast';
import { friendlyError } from './friendly-error';

export type SafeUpdateOptions = {
  /** LockConflictError 발생 시 추가 처리 (예: 다이얼로그 닫기) */
  onConflict?: () => void;
  /** 충돌 시 사용자에게 보일 메시지 (기본: 표준 문구) */
  conflictMessage?: string;
  /** 일반 에러 시 사용자에게 보일 prefix */
  errorPrefix?: string;
};

export async function safeUpdate<T>(
  fn: () => Promise<T>,
  opts: SafeUpdateOptions = {},
): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof LockConflictError) {
      toast.error(opts.conflictMessage ?? '다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요.');
      opts.onConflict?.();
      return null;
    }
    toast.error(`${opts.errorPrefix ?? '저장 실패'} — ${friendlyError(e)}`);
    return null;
  }
}
