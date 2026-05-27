'use client';

import { CheckCircle, Warning, XCircle, Info, X } from '@phosphor-icons/react';
import { useToasts, dismiss, type ToastKind } from '@/lib/toast';

const ICONS: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle size={16} weight="fill" />,
  warning: <Warning size={16} weight="fill" />,
  error: <XCircle size={16} weight="fill" />,
  info: <Info size={16} weight="fill" />,
};

const COLORS: Record<ToastKind, string> = {
  success: 'var(--green-text)',
  warning: 'var(--orange-text)',
  error: 'var(--red-text)',
  info: 'var(--brand)',
};

export function ToastContainer() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div
      role="region"
      aria-label="알림"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 2000,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.kind}`}
          role="status"
          style={{ pointerEvents: 'auto' }}
        >
          <span style={{ color: COLORS[t.kind], display: 'flex' }}>{ICONS[t.kind]}</span>
          <span style={{ flex: 1 }}>{t.message}</span>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="닫기"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-weak)',
              display: 'flex',
              alignItems: 'center',
              padding: 2,
              marginLeft: 4,
            }}
          >
            <X size={12} weight="bold" />
          </button>
        </div>
      ))}
    </div>
  );
}
