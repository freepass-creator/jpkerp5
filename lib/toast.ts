/**
 * 토스트 알림 — 우상단 띄움. 글로벌 imperative API.
 *
 *   toast.success('저장 완료');
 *   toast.error('네트워크 오류');
 *   toast.warning('주의');
 *   toast.info('알림');
 *
 * 컴포넌트는 `<ToastContainer />` 를 app/layout.tsx 에 마운트.
 */

'use client';

import { useEffect, useState } from 'react';

export type ToastKind = 'success' | 'warning' | 'error' | 'info';

export type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
  createdAt: number;
};

const DEFAULT_TIMEOUT_MS = 3500;
const listeners = new Set<(toasts: Toast[]) => void>();
let queue: Toast[] = [];

function emit(): void {
  for (const fn of listeners) fn(queue);
}

function push(kind: ToastKind, message: string, timeoutMs = DEFAULT_TIMEOUT_MS): void {
  if (typeof window === 'undefined') return;
  const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const t: Toast = { id, kind, message, createdAt: Date.now() };
  queue = [...queue, t];
  emit();
  if (timeoutMs > 0) {
    setTimeout(() => dismiss(id), timeoutMs);
  }
}

export function dismiss(id: string): void {
  queue = queue.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (msg: string, ms?: number) => push('success', msg, ms),
  warning: (msg: string, ms?: number) => push('warning', msg, ms),
  error: (msg: string, ms?: number) => push('error', msg, ms ?? 5000),  // 에러는 5초
  info: (msg: string, ms?: number) => push('info', msg, ms),
};

/** Container 컴포넌트에서 토스트 리스트 구독 */
export function useToasts(): Toast[] {
  const [list, setList] = useState<Toast[]>(queue);
  useEffect(() => {
    const fn = (toasts: Toast[]) => setList(toasts);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return list;
}
