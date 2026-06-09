'use client';

/**
 * 자산 관리 공용 topbar — 메인(/asset) + sub-page(/asset/insurance, loan, repair, gps) 동일 규격.
 *
 *   <AssetTopbar currentPage="insurance" />
 *   <AssetTopbar
 *     currentPage="status"
 *     search={search} onSearchChange={setSearch}
 *     companyFilter={companyFilter} onCompanyFilterChange={setCompanyFilter}
 *     companyOptions={...} companyMaster={...}
 *   />
 *
 * currentPage 값에 따라 우측 chip-nav 중 하나가 active 처리됨.
 *  · 'status' / 'registered' — 자산 메인 페이지 (view 토글)
 *  · 'insurance' | 'loan' | 'repair' | 'gps' — sub-page
 */

import Link from 'next/link';
import { Car, MagnifyingGlass } from '@phosphor-icons/react';
import { displayCompanyName } from '@/lib/company-display';
import type { Company } from '@/lib/types';

export type AssetTopbarPage = 'status' | 'registered' | 'insurance' | 'loan' | 'repair' | 'gps' | 'disposal';

export function AssetTopbar({
  currentPage,
  search,
  onSearchChange,
  searchPlaceholder,
  companyFilter = 'all',
  onCompanyFilterChange,
  companyOptions = [],
  companyMaster = [],
  onViewChange,
  extraFilters,
}: {
  currentPage: AssetTopbarPage;
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  companyFilter?: string;
  onCompanyFilterChange?: (v: string) => void;
  companyOptions?: string[];
  companyMaster?: Company[];
  onViewChange?: (v: 'status' | 'registered') => void;
  /** 검색창 우측에 추가 filter dropdown 등 (정비구분 등) */
  extraFilters?: React.ReactNode;
}) {
  const isMain = currentPage === 'status' || currentPage === 'registered';

  return (
    <header className="topbar">
      <div className="topbar-title">
        <Car size={16} weight="fill" style={{ color: 'var(--brand)' }} />
        <span>자산 관리</span>
      </div>
      {onSearchChange !== undefined && (
        <div className="topbar-search">
          <MagnifyingGlass size={14} className="icon" />
          <input
            className="input"
            placeholder={searchPlaceholder ?? '차량번호 / 차종 / 제조사'}
            value={search ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      )}
      {extraFilters && <div className="filter-bar">{extraFilters}</div>}

      {onCompanyFilterChange && (
        <div className="filter-bar">
          <select
            className="input-compact" data-w="md"
            value={companyFilter}
            onChange={(e) => onCompanyFilterChange(e.target.value)}
            title="회사별 필터"
          >
            <option value="all">회사: 전체</option>
            {companyOptions.map((co) => (
              <option key={co} value={co}>{displayCompanyName(co, companyMaster)}</option>
            ))}
          </select>
        </div>
      )}

      <div className="topbar-right">
        {/* view 토글 (메인) — sub-page 에서는 Link */}
        {isMain && onViewChange ? (
          <>
            <button type="button" className={`chip chip-nav ${currentPage === 'status' ? 'active' : ''}`} onClick={() => onViewChange('status')} title="자산 운영 현황 — 상태·계약·만기 중심">자산현황</button>
            <button type="button" className={`chip chip-nav ${currentPage === 'registered' ? 'active' : ''}`} onClick={() => onViewChange('registered')} title="등록자산 — 자동차등록증 정보 중심">등록자산</button>
          </>
        ) : (
          <>
            <Link href="/asset?view=status" className="chip chip-nav" title="자산 운영 현황">자산현황</Link>
            <Link href="/asset?view=registered" className="chip chip-nav" title="등록자산">등록자산</Link>
          </>
        )}
        <Link href="/asset/insurance" className={`chip chip-nav ${currentPage === 'insurance' ? 'active' : ''}`} title="보험증권 — 회사·차량별 보험 현황, 만기 임박 알림">보험증권</Link>
        <Link href="/asset/loan" className={`chip chip-nav ${currentPage === 'loan' ? 'active' : ''}`} title="구매방식 — 할부/현금/리스 + 할부사·잔여원금·월납입 회차">구매방식</Link>
        <Link href="/asset/repair" className={`chip chip-nav ${currentPage === 'repair' ? 'active' : ''}`} title="수선내역 — 정비공장·이력·비용">수선내역</Link>
        <Link href="/asset/gps" className={`chip chip-nav ${currentPage === 'gps' ? 'active' : ''}`} title="GPS설치 — 공급사·단말번호·상태">GPS설치</Link>
        <Link href="/asset/disposal" className={`chip chip-nav ${currentPage === 'disposal' ? 'active' : ''}`} title="처분자산 — 매각·이전·폐차">처분자산</Link>
      </div>
    </header>
  );
}
