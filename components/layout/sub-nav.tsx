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
  /** true 면 이 항목 앞에 시각 구분선 (입력 vs 파생 등 그룹 분리) */
  separator?: boolean;
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

// '계약자'(/contract/customer)·'종료'(/contract/ended) 는 실제 라우트가 없어
// [contractId] 동적 라우트에 걸려 무한 로딩 → 제거 (2026-07-03 감사).
export const CONTRACT_SUB: SubNavItem[] = [
  { href: '/contract', label: '전체' },
  { href: '/contract/expire', label: '만기임박' },
  { href: '/contract/return', label: '반납' },
  { href: '/contract/overdue', label: '미수금' },
  { href: '/contract/schedule', label: '계약스케줄' },
  { href: '/contract/idle', label: '휴차' },
];

// 입출금 관리 sub-nav — 입력 4 (계좌·자동이체·카드매출·법인카드) │ 파생 4 (자금일보·거래처·임차인·총계정원장)
// "원장 하나, 투영 여럿" — 좌측은 입력 창구(사실), 우측은 자동 구현(파생)
// 계좌·자동이체·카드매출·법인카드는 /finance 한 페이지의 viewMode(우상단 칩)로 전환.
// /finance/autopay·/card·/corpcard 는 라우트가 없어 404 → sub-nav에서 제거하고
// '입출금(계좌·자동이체·카드)' 단일 진입점만 노출 (2026-07-03 감사).
export const FINANCE_SUB: SubNavItem[] = [
  { href: '/finance', label: '입출금·카드' },
  { href: '/finance/daily', label: '자금일보', separator: true },
  { href: '/finance/vendor', label: '거래처' },
  { href: '/finance/customer', label: '임차인' },
  { href: '/finance/gl', label: '총계정원장' },
];

export function SubNav({ items }: { items: SubNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="tabs-list">
      {items.map((it) => {
        const isActive = pathname === it.href;
        return (
          <span key={it.href} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {it.separator && (
              <span aria-hidden="true" style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                margin: '0 8px 0 16px',
                padding: '2px 10px',
                borderLeft: '2px solid var(--border-strong, var(--text-weak))',
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--text-sub)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}>
                자동 집계
              </span>
            )}
            <Link
              href={it.href}
              className="tabs-trigger"
              data-state={isActive ? 'active' : undefined}
            >
              <span>{it.label}</span>
              {it.count !== undefined && it.count > 0 && (
                <span className="count">{it.count}</span>
              )}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
