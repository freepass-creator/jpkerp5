'use client';

/**
 * master 전용 디테일 페이지의 공용 쉘 — Sidebar + topbar + SubNav + body.
 *
 *   <MasterPageShell
 *     title="정비 이력"
 *     icon={<Wrench size={16} weight="fill" />}
 *     subNav={ASSET_SUB}
 *   >
 *     <PageBody>{...}</PageBody>
 *   </MasterPageShell>
 *
 * master 가 아니면 / 로 리다이렉트.
 */

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { SubNav, type SubNavItem } from '@/components/layout/sub-nav';
import { useRole } from '@/lib/use-role';

export function MasterPageShell({
  title, icon, subNav, search, stats, children, bottomBar,
}: {
  title: string;
  icon?: ReactNode;
  subNav: SubNavItem[];
  /** 우측 검색창/필터 영역 (optional) */
  search?: ReactNode;
  /** 상단바 우측 끝 — 통계 요약 (전체/표시/카운트 등). 하단바는 버튼 전용. */
  stats?: ReactNode;
  children: ReactNode;
  bottomBar?: ReactNode;
}) {
  const router = useRouter();
  const { isMaster: master, loading: roleLoading } = useRole();
  useEffect(() => {
    if (!roleLoading && !master) router.replace('/');
  }, [master, roleLoading, router]);

  if (roleLoading || !master) {
    return (
      <div className="layout">
        <Sidebar />
        <div className="app">
          <div style={{ padding: 40, fontSize: 12, color: 'var(--text-weak)' }}>로딩 중…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            {icon}
            <span>{title}</span>
          </div>
          {search}
          {stats && <div className="topbar-stats">{stats}</div>}
        </header>
        <SubNav items={subNav} />
        <div className="dashboard" style={{ gridTemplateColumns: '1fr' }}>
          <div className="panel">
            <div className="panel-body">
              {children}
            </div>
          </div>
        </div>
        {bottomBar}
      </div>
    </div>
  );
}
