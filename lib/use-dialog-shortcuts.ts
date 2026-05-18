'use client';

import { useEffect } from 'react';

/**
 * 다이얼로그 키보드 단축키 — Esc 닫기 / Ctrl+S 저장.
 *
 * 다이얼로그 컴포넌트 내부에서 호출. open=true 일 때만 활성화.
 *
 *   useDialogShortcuts({
 *     open,
 *     onClose: () => setOpen(false),
 *     onSave: canSave ? handleSave : undefined,
 *   });
 *
 * Esc — onClose
 * Ctrl/Cmd+S — onSave (있을 때만, 폼 default submit 차단)
 */

type Options = {
  open: boolean;
  onClose?: () => void;
  /** 저장 핸들러 — 있으면 Ctrl+S 활성화. undefined 면 Ctrl+S 무시 (브라우저 기본 동작 X) */
  onSave?: () => void;
};

export function useDialogShortcuts({ open, onClose, onSave }: Options) {
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      // Esc — 다이얼로그 닫기 (Radix 가 이미 처리하기도 하지만 명시적으로 추가)
      if (e.key === 'Escape' && onClose) {
        e.preventDefault();
        onClose();
        return;
      }
      // Ctrl+S / Cmd+S — 저장 (브라우저 페이지 저장 다이얼로그 차단 + 우리 저장)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (onSave) {
          e.preventDefault();
          onSave();
        }
        return;
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, onSave]);
}

/**
 * 변경 감지 — 두 객체 얕은 비교 후 다른 키 갯수 반환. JSON 직렬화 비교 (간단·정확).
 * 미저장 변경 indicator + 닫기 confirm 용.
 */
export function countChanges<T extends Record<string, unknown>>(initial: T, current: T): number {
  let count = 0;
  const keys = new Set([...Object.keys(initial), ...Object.keys(current)]);
  for (const k of keys) {
    const a = (initial as Record<string, unknown>)[k];
    const b = (current as Record<string, unknown>)[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) count++;
  }
  return count;
}
