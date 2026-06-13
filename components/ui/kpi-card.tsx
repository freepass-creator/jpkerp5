'use client';

/**
 * KPI 카드 — 다이얼로그/페이지 상단 요약 숫자 표시.
 *
 *  · 자산 상세 손익 KPI
 *  · 법인 상세 보유차량/진행계약/미수 KPI
 *  · 미수금 페이지 상단 누적 KPI
 *  · 대시보드 미수율/가동률 KPI
 *
 *  사용:
 *    <KpiCard label="누적 입금" value="₩12,345,678" hint="3년 누적" />
 *    <KpiCard label="미수금" value="₩1,200,000" positive={false} />
 *    <KpiCard label="순익" value="₩5,000,000" positive={true} hint="ROI 12%" />
 */

import type { ReactNode } from 'react';

export function KpiCard({
  label, value, hint, positive,
}: {
  label: ReactNode;
  value: ReactNode;
  /** 보조 설명 (작은 글씨) */
  hint?: ReactNode;
  /** true=녹색(좋음) / false=빨강(나쁨) / undefined=기본 (text-main) */
  positive?: boolean;
}) {
  return (
    <div style={{
      padding: '10px 12px',
      background: 'var(--bg-soft)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-weak)' }}>{label}</div>
      <div style={{
        fontSize: 16,
        fontWeight: 700,
        color: positive === undefined ? 'var(--text-main)' : positive ? 'var(--green-text)' : 'var(--red-text)',
      }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: 'var(--text-weak)' }}>{hint}</div>}
    </div>
  );
}

/**
 * KpiGrid — KpiCard들을 가로 배치 (반응형, 최소 폭 100px).
 * 자식에 <KpiCard /> 여러 개 넣으면 자동 균등 분할.
 */
export function KpiGrid({ children }: { children: ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
      gap: 10,
    }}>
      {children}
    </div>
  );
}
