'use client';

/**
 * 메인 페이지 공용 shell — Sidebar + topbar + content(dashboard 1fr + panel) + BottomBar.
 *
 *  · 자산관리 패턴을 기준으로 모든 list 페이지에 적용.
 *  · 운영현황·계약·자산·리스크·입출금·과태료 등 메인 페이지 통일.
 *
 * 사용:
 *   <PageShell
 *     title="자산 관리"
 *     icon={<Car size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
 *     topbarSearch={{ placeholder: '차량번호 / 차종', value: search, onChange: setSearch }}
 *     topbarFilter={<>...</>}
 *     topbarRight={<>...</>}
 *     bottomBarLeft={<>...</>}
 *     bottomBarRight={null}
 *   >
 *     <table className="table">...</table>
 *   </PageShell>
 */

import { type ReactNode } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { MENU_LABELS, type MenuKey } from '@/components/layout/sidebar';

export type PageShellProps = {
  /** topbar title — 명시 (legacy/sub-page). menuKey 와 함께 쓰면 sub-title 처럼 작동 */
  title?: string;
  /** 메뉴 키 — MENU_LABELS 자동 라벨 (메인 페이지는 이것만 쓰면 통일) */
  menuKey?: MenuKey;
  icon?: ReactNode;
  /** topbar 검색창 (옵션). 없으면 표시 X */
  topbarSearch?: {
    placeholder: string;
    value: string;
    onChange: (v: string) => void;
  };
  /** topbar filter-bar 영역 — CompanyFilter / 추가 dropdown 등 */
  topbarFilter?: ReactNode;
  /** topbar 우측 — stats / 정렬 모드 / 날짜 등 */
  topbarRight?: ReactNode;
  /** chip 영역 (filter-bar 와 별도 — view chip / 기간 chip 등) */
  topbarChips?: ReactNode;
  /** 본문 — table 또는 multi panel */
  children: ReactNode;
  /** 본문 dashboard grid (기본 '1fr'. 멀티 panel 페이지면 별도 지정) */
  dashboardGrid?: string;
  /** BottomBar 좌측 — [+ 신규] [엑셀] [선택 삭제] 등 */
  bottomBarLeft?: ReactNode;
  /** BottomBar 우측 (대부분 null) */
  bottomBarRight?: ReactNode;
  /** BottomBar 자체 안 그림 — children 이 자체 BottomBar 가질 때 (운영현황 등 복잡 페이지) */
  noBottomBar?: boolean;
  /** dashboard/panel/panel-body wrap 안 함 — children 이 자체 layout 가질 때 */
  bare?: boolean;
};

export function PageShell({
  title, menuKey, icon,
  topbarSearch, topbarFilter, topbarRight, topbarChips,
  children, dashboardGrid = '1fr',
  bottomBarLeft, bottomBarRight = null,
  noBottomBar = false, bare = false,
}: PageShellProps) {
  const headline = menuKey ? MENU_LABELS[menuKey] : (title ?? '');
  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            {icon}
            <span>{headline}</span>
            {menuKey && title && title !== headline && (
              <>
                <span style={{ color: 'var(--text-weak)', margin: '0 6px', fontSize: 11 }}>›</span>
                <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{title}</span>
              </>
            )}
          </div>
          {topbarSearch && (
            <div className="topbar-search">
              <MagnifyingGlass size={14} className="icon" />
              <input
                className="input"
                placeholder={topbarSearch.placeholder}
                value={topbarSearch.value}
                onChange={(e) => topbarSearch.onChange(e.target.value)}
              />
            </div>
          )}
          {topbarFilter && <div className="filter-bar">{topbarFilter}</div>}
          {topbarChips && <div className="quick-filters">{topbarChips}</div>}
          <div style={{ flex: 1 }} />
          <div className="topbar-right">
            {topbarRight}
          </div>
        </header>

        {bare ? (
          children
        ) : (
          <div className="dashboard" style={{ gridTemplateColumns: dashboardGrid }}>
            <div className="panel">
              <div className="panel-body">
                {children}
              </div>
            </div>
          </div>
        )}

        {!noBottomBar && <BottomBar left={bottomBarLeft ?? null} right={bottomBarRight} />}
      </div>
    </div>
  );
}
