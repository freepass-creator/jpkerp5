'use client';

/**
 * 페이지 로딩 표시 SSOT — 모든 list 페이지가 동일 형태로.
 *
 * 이전: 6+ 페이지가 인라인으로
 *   `<div className="layout"><Sidebar /><div className="app">
 *      <div style={{ padding: 40, fontSize: 12, color: 'var(--text-weak)' }}>로딩 중…</div>
 *    </div></div>`
 * 반복.
 *
 * 사용:
 *   if (loading) return <PageLoading />;
 *   if (loading) return <PageLoading message="자산 불러오는 중…" />;
 *
 * 더 두꺼운 wrap (sidebar 포함) 필요 시 wrap prop.
 */

import { Sidebar } from '@/components/layout/sidebar';
import { CircleNotch } from '@phosphor-icons/react';

export function PageLoading({
  message = '로딩 중…',
  wrap = true,
}: {
  message?: string;
  /** sidebar 포함된 layout wrap 여부. 페이지 단위 = true, sub-content = false */
  wrap?: boolean;
}) {
  const inner = (
    <div style={{
      padding: 40, fontSize: 12, color: 'var(--text-weak)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>
      <CircleNotch size={14} weight="bold" style={{ animation: 'spin 1s linear infinite' }} />
      {message}
    </div>
  );
  if (!wrap) return inner;
  return (
    <div className="layout">
      <Sidebar />
      <div className="app">{inner}</div>
    </div>
  );
}

// 빈 테이블 행은 components/ui/empty-row.tsx (EmptyRow) 사용.
// loading 분기는 children 으로:
//   <EmptyRow colSpan={N}>{loading ? '데이터 불러오는 중…' : '등록된 항목 없음'}</EmptyRow>
