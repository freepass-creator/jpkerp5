'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from '@phosphor-icons/react';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const DialogRoot = DialogPrimitive.Root;
/** v4 호환 alias */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

type Size = 'sm' | 'md' | 'lg' | 'xl';

export function DialogContent({
  children,
  title,
  size = 'md',
  className,
  mode = 'view',
}: {
  children: ReactNode;
  /** 헤더 타이틀. 없으면 헤더 표시 안함 */
  title?: ReactNode;
  /** 크기 — md 기본 (jpkerp5 표준). lg/xl 은 동일 (이미 큼) */
  size?: Size;
  width?: number;
  className?: string;
  /** 시각 모드 — view 기본 / edit 편집 중 / new 신규 등록.
   * dialog-content / dialog-title 에 mode-* 클래스 자동 적용 + 타이틀 옆 모드 태그. */
  mode?: 'view' | 'edit' | 'new';
}) {
  return (
    <DialogPortal>
      <DialogPrimitive.Overlay className="dialog-overlay" />
      <DialogPrimitive.Content className={cn('dialog-content', `mode-${mode}`, size === 'sm' && 'dialog-sm', className)}>
        {title !== undefined && (
          <div className={cn('dialog-header', `mode-${mode}`)}>
            <DialogPrimitive.Title className="dialog-title">
              {title}
              {mode === 'edit' && <span className="detail-mode-tag mode-edit">편집 중</span>}
              {mode === 'new'  && <span className="detail-mode-tag mode-new">신규 등록</span>}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="dialog-close" aria-label="닫기">
              <X size={16} />
            </DialogPrimitive.Close>
          </div>
        )}
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogBody({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={cn('dialog-body', className)} style={style}>{children}</div>;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="dialog-footer">{children}</div>;
}
