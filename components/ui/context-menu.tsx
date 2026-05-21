'use client';

import { useEffect, useRef } from 'react';

/**
 * 경량 우클릭 컨텍스트 메뉴.
 * 외부 클릭/Esc/우클릭 다른 곳 → 자동 닫힘.
 *
 * 사용:
 *   <ContextMenu open={open} x={x} y={y} onClose={() => setOpen(false)} items={items} />
 */

export type ContextMenuItem =
  | { type?: 'item'; label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }
  | { type: 'separator' };

export function ContextMenu({
  open, x, y, onClose, items,
}: {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  items: ContextMenuItem[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    // 다음 이벤트 루프부터 등록 — 메뉴 열린 직후 같은 클릭이 닫지 않게
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDoc);
      document.addEventListener('contextmenu', onDoc);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('contextmenu', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  // 화면 오른쪽/아래 끝에서 잘리지 않게 좌표 보정
  const maxX = typeof window !== 'undefined' ? window.innerWidth - 200 : x;
  const maxY = typeof window !== 'undefined' ? window.innerHeight - 250 : y;
  const left = Math.min(x, maxX);
  const top = Math.min(y, maxY);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed', left, top, zIndex: 9999,
        minWidth: 180, padding: 4,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        fontSize: 12, color: 'var(--text-main)',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => {
        if ('type' in it && it.type === 'separator') {
          return <div key={i} style={{ height: 1, background: 'var(--border-soft)', margin: '4px 0' }} />;
        }
        const item = it as Extract<ContextMenuItem, { onClick: () => void }>;
        return (
          <button
            key={i}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              onClose();
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '6px 10px',
              background: 'transparent', border: 'none',
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              textAlign: 'left', fontSize: 12,
              color: item.danger ? 'var(--red-text)' : item.disabled ? 'var(--text-weak)' : 'var(--text-main)',
              borderRadius: 'var(--radius-sm)',
            }}
            onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            {item.icon && <span style={{ display: 'flex', color: 'var(--text-sub)' }}>{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
