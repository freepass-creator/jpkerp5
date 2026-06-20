'use client';

/**
 * 전역 확인 다이얼로그 SSOT — window.confirm 대체.
 *
 * **원칙: window.confirm() 금지. showConfirm() 사용.**
 *
 * 사용:
 *   const ok = await showConfirm({ title: '삭제할까요?' });
 *   if (!ok) return;
 *
 *   // 위험 작업 — danger 톤 + 확인 라벨 커스텀
 *   const ok = await showConfirm({
 *     title: '계약 영구 삭제',
 *     description: '복구 불가능합니다.',
 *     confirmLabel: '삭제',
 *     danger: true,
 *   });
 *
 * 구현: ConfirmDialogHost 가 app/layout.tsx 에 mount 되어 있어야 함.
 * showConfirm() 은 Promise + EventTarget 패턴.
 */

export type ConfirmOptions = {
  title: string;
  /** 본문 (옵션) — 줄바꿈 그대로 표시 */
  description?: string;
  /** 확인 버튼 라벨 (기본 '확인') */
  confirmLabel?: string;
  /** 취소 버튼 라벨 (기본 '취소') */
  cancelLabel?: string;
  /** 위험 작업 — 확인 버튼 빨강 (삭제·force·forever) */
  danger?: boolean;
};

type Pending = {
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
};

let listener: ((p: Pending) => void) | null = null;

export function showConfirm(options: ConfirmOptions): Promise<boolean> {
  // SSR / 미마운트 시 fallback — 그냥 window.confirm.
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (!listener) {
    const text = options.title + (options.description ? `\n\n${options.description}` : '');
    return Promise.resolve(window.confirm(text));
  }
  return new Promise((resolve) => {
    listener!({ options, resolve });
  });
}

/** ConfirmDialogHost 가 mount 시 호출 — 외부에서 사용 X. */
export function _setConfirmListener(fn: ((p: Pending) => void) | null): void {
  listener = fn;
}
