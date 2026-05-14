'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from '@phosphor-icons/react';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const DialogRoot = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export function DialogContent({
  children,
  title,
  className,
}: {
  children: ReactNode;
  title: string;
  /** @deprecated 크기는 CSS에서 고정 — 호환성 위해 유지하되 사용 안 함 */
  width?: number;
  className?: string;
}) {
  return (
    <DialogPortal>
      <DialogPrimitive.Overlay className="dialog-overlay" />
      <DialogPrimitive.Content className={cn('dialog-content', className)}>
        <div className="dialog-header">
          <DialogPrimitive.Title className="dialog-title">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close className="dialog-close" aria-label="닫기">
            <X size={16} />
          </DialogPrimitive.Close>
        </div>
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
