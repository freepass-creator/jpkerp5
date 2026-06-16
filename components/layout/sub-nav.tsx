'use client';

/**
 * 자산/계약/재무 내부 sub-page 네비게이션 — v4 .tabs / .tab 스타일.
 *
 *   <SubNav items={ASSET_SUB} />
 *
 * usePathname 으로 현재 활성 탭 자동 표시. master 전용 페이지에서만 사용.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type SubNavItem = {
  href: string;
  label: string;
  count?: number;
};

/** v4 ASSET_SUBTABS 와 라벨/href 동일 */
export const ASSET_SUB: SubNavItem[] = [
  { href: '/asset',            label: '차량등록현황' },
  { href: '/asset/purchase',   label: '차량구매' },
  { href: '/asset/insurance',  label: '보험내역' },
  { href: '/asset/loan',       label: '할부스케줄' },
  { href: '/asset/inspection', label: '검사내역' },
  { href: '/asset/repair',     label: '차량수선' },
  { href: '/asset/gps',        label: 'GPS관리' },
  { href: '/asset/disposal',   label: '자산처분' },
];

export const CONTRACT_SUB: SubNavItem[] = [
  { href: '/contract', label: '전체' },
  { href: '/contract/customer', label: '계약자' },
  { href: '/contract/expire', label: '만기임박' },
  { href: '/contract/return', label: '반납' },
  { href: '/contract/overdue', label: '미수금' },
  { href: '/contract/schedule', label: '계약스케줄' },
  { href: '/contract/idle', label: '휴차' },
  { href: '/contract/ended', label: '종료' },
];

// 입출금 관리 (구 재무관리) sub-nav — 계좌·자동이체·카드매출·법인카드
export const FINANCE_SUB: SubNavItem[] = [
  { href: '/finance', label: '계좌' },
  { href: '/finance/autopay', label: '자동이체' },
  { href: '/finance/card', label: '카드매출' },
  { href: '/finance/corpcard', label: '법인카드' },
  { href: '/finance/daily', label: '자금일보' },
];

export function SubNav({ items }: { items: SubNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="tabs-list">
      {items.map((it) => {
        const isActive = pathname === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            className="tabs-trigger"
            data-state={isActive ? 'active' : undefined}
          >
            <span>{it.label}</span>
            {it.count !== undefined && it.count > 0 && (
              <span className="count">{it.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
