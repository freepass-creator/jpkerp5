'use client';

/**
 * 모든 detail dialog 탭이 따르는 표준 wrapper.
 *
 *  - flex column gap 10 (탭 내부 자식 간격 통일)
 *  - 상단 요약 line 슬롯 (총 N건 · ₩X 등) — 빈 데이터에서는 emptySummary 자동 표시
 *  - 빈 데이터에서도 섹션 구성(헤더+표) 유지 — 정책상 EmptyRow 패턴은 자식이 책임
 *
 *  사용:
 *    <DetailTabContent
 *      isEmpty={contracts.length === 0}
 *      summary={`총 ${contracts.length}건 · 현재 미수 ₩${totalUnpaid.toLocaleString()}`}
 *      emptySummary="총 0건 — 운영현황에서 계약 추가"
 *    >
 *      <table className="table">...</table>
 *    </DetailTabContent>
 */

import type { ReactNode } from 'react';

export type DetailTabContentProps = {
  /** 상단 요약 — "총 N건 · ₩X" 형태. 빈 데이터에서도 표시 (또는 emptySummary로 교체) */
  summary?: ReactNode;
  /** 빈 데이터일 때 summary 대신 표시할 안내 */
  emptySummary?: ReactNode;
  /** 빈 데이터 여부 — true 면 emptySummary 사용 */
  isEmpty?: boolean;
  /** 자식 콘텐츠 — table/grid/Section/Stack 등 */
  children: ReactNode;
  /** 자식 간 간격 (px) — 기본 10 */
  gap?: number;
};

export function DetailTabContent({
  summary, emptySummary, isEmpty, children, gap = 10,
}: DetailTabContentProps) {
  const headerLine = isEmpty && emptySummary !== undefined ? emptySummary : summary;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {headerLine !== undefined && (
        <div style={{ fontSize: 12, color: 'var(--text-weak)' }}>{headerLine}</div>
      )}
      {children}
    </div>
  );
}
