'use client';

/**
 * 상세 다이얼로그 공용 primitives — Section, Field, KV.
 *
 * 모든 detail dialog 내부 콘텐츠가 같은 layout primitive 를 import.
 * 자금일보·자산·계약·리스크·세금계산서 등 어디서든 동일 외관.
 */

import type { ReactNode } from 'react';

/** Section — 카드 박스. detail-section CSS 자동 적용 (운영현황·자산 dialog 동일) */
export function Section({
  title, icon, action, children, bodyPadding,
}: {
  title: ReactNode;
  icon?: ReactNode;
  /** 헤더 우측 action 영역 — 버튼/요약 등 */
  action?: ReactNode;
  /** body padding override — table 직렬 시 0 권장 */
  bodyPadding?: number | string;
  children: ReactNode;
}) {
  return (
    <section className="detail-section">
      <div className="detail-section-header">
        {icon && <span className="icon">{icon}</span>}
        <span className="title">{title}</span>
        {action}
      </div>
      <div
        className="detail-section-body"
        style={bodyPadding !== undefined ? { padding: bodyPadding } : undefined}
      >
        {children}
      </div>
    </section>
  );
}

/** Field — 한 줄 라벨/값 (96px label + 1fr value). detail-field CSS 자동 적용 */
export function Field({
  label, value, mono = false, muted = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="detail-field">
      <div className="label">{label}</div>
      <div className={`value ${mono ? 'mono' : ''} ${muted ? 'muted' : ''}`}>{value}</div>
    </div>
  );
}

/** KV — Field 와 동일. legacy alias (asset/page.tsx 에서 사용) */
export const KV = Field;

/** Grid2 — 좌·우 컬럼 분리 (detail-grid-2). Field 들을 좌·우 컬럼에 나눠 배치할 때 */
export function Grid2({ children }: { children: ReactNode }) {
  return <div className="detail-grid-2">{children}</div>;
}

/** Stack — 세로 stack (detail-stack class. gap 14px). */
export function Stack({ children }: { children: ReactNode }) {
  return <div className="detail-stack">{children}</div>;
}
