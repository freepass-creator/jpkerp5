'use client';

import type { ReactNode } from 'react';

/**
 * 도메인 무관 상태 배지 — site theme `.badge` + `.badge-{tone}` 클래스 사용.
 *   <StatusBadge tone="green" icon={<CheckCircle ... />}>신규</StatusBadge>
 *   <StatusBadge tone="red"   icon={<Warning     ... />}>중복</StatusBadge>
 */
export type BadgeTone = 'neutral' | 'red' | 'orange' | 'green' | 'blue';

type Props = {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  title?: string;
};

export function StatusBadge({ tone = 'neutral', icon, children, title }: Props) {
  const cls = tone === 'neutral' ? 'badge' : `badge badge-${tone}`;
  return (
    <span className={cls} title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {icon}
      {children}
    </span>
  );
}
