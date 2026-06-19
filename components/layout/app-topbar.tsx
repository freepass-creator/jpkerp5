'use client';

/**
 * 공통 페이지 topbar — 모든 페이지가 동일 규격.
 *
 *   <AppTopbar
 *     menuKey="receivables"        ← MENU_LABELS 에서 자동 라벨
 *     icon={<Warning size={16} weight="fill" style={{ color: 'var(--red-text)' }} />}
 *     search={{ value, onChange, placeholder }}
 *     filter={<>...</>}
 *     chips={<>...</>}
 *     right={<>날짜·정보</>}
 *   />
 *
 * 또는 title 직접:
 *   <AppTopbar title="리스크 현황 — 상세" ... />
 */

import { type ReactNode } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { MENU_LABELS, type MenuKey } from '@/components/layout/sidebar';
import { APP_VERSION } from '@/lib/version';

export type AppTopbarProps = {
  /** 메뉴 키 — MENU_LABELS 에서 자동 라벨 */
  menuKey?: MenuKey;
  /** 명시 라벨 — menuKey 없을 때 또는 sub-title 표시용 */
  title?: string;
  /** 보조 라벨 — 메뉴명 옆 "› 상세" 같은 */
  subTitle?: string;
  icon?: ReactNode;
  /** 가운데 검색 input */
  search?: {
    placeholder: string;
    value: string;
    onChange: (v: string) => void;
  };
  /** 검색 우측 filter 영역 (회사 dropdown, 상태 chip 등) */
  filter?: ReactNode;
  /** filter 우측 chip 그룹 (보조 chip — 기간 등) */
  chips?: ReactNode;
  /** 우측 끝 — 날짜·count·정보 */
  right?: ReactNode;
};

export function AppTopbar({
  menuKey, title, subTitle, icon,
  search, filter, chips, right,
}: AppTopbarProps) {
  const label = title ?? (menuKey ? MENU_LABELS[menuKey] : '');
  return (
    <header className="topbar">
      <div className="topbar-title">
        {icon}
        <span>{label}</span>
        {subTitle && (
          <>
            <span style={{ color: 'var(--text-weak)', margin: '0 6px', fontSize: 11 }}>›</span>
            <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{subTitle}</span>
          </>
        )}
      </div>
      {search && (
        <div className="topbar-search">
          <MagnifyingGlass size={14} className="icon" />
          <input
            className="input"
            placeholder={search.placeholder}
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
          />
        </div>
      )}
      {filter && <div className="filter-bar">{filter}</div>}
      {chips && <div className="filter-bar">{chips}</div>}
      <div style={{ flex: 1 }} />
      <div className="topbar-right">
        {right}
        <span className="topbar-version" title={`렌터카매니저 v${APP_VERSION}`}>v{APP_VERSION}</span>
      </div>
    </header>
  );
}
