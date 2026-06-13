'use client';

/**
 * 모바일 레이아웃 — /m/* 별도 트리. 4탭 하단 고정.
 *  · 데스크탑 사이드바·검색바 안 씀
 *  · Firebase store / auth / DataProvider 는 root 에서 상속
 *  · safe-area 대응 (iOS 노치/홈바)
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, MagnifyingGlass, NotePencil, UploadSimple, GearSix } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

const TABS: { href: string; label: string; icon: (p: { size: number; weight: 'duotone' | 'bold' }) => JSX.Element; match: (p: string) => boolean }[] = [
  { href: '/m',         label: '홈',     icon: ({ size, weight }) => <House size={size} weight={weight} />,
    match: (p) => p === '/m' },
  { href: '/m/search',  label: '조회',   icon: ({ size, weight }) => <MagnifyingGlass size={size} weight={weight} />,
    match: (p) => p.startsWith('/m/search') || p.startsWith('/m/contract') },
  { href: '/m/entry',   label: '입력',   icon: ({ size, weight }) => <NotePencil size={size} weight={weight} />,
    match: (p) => p.startsWith('/m/entry') },
  { href: '/m/upload',  label: '업로드', icon: ({ size, weight }) => <UploadSimple size={size} weight={weight} />,
    match: (p) => p.startsWith('/m/upload') },
  { href: '/m/me',      label: '설정',   icon: ({ size, weight }) => <GearSix size={size} weight={weight} />,
    match: (p) => p.startsWith('/m/me') },
];

export default function MobileLayout({ children }: { children: ReactNode }) {
  const path = usePathname() ?? '';
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-main)',
      display: 'flex', flexDirection: 'column',
      paddingBottom: 'calc(60px + env(safe-area-inset-bottom))',
    }}>
      <main style={{ flex: 1, paddingTop: 'env(safe-area-inset-top)' }}>{children}</main>
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: 'calc(60px + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
        background: 'var(--bg-card)', borderTop: '1px solid var(--border)',
        display: 'grid', gridTemplateColumns: `repeat(${TABS.length}, 1fr)`,
        zIndex: 100, boxShadow: '0 -2px 8px rgba(0,0,0,0.04)',
      }}>
        {TABS.map((t) => {
          const active = t.match(path);
          return (
            <Link key={t.href} href={t.href} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 3, textDecoration: 'none',
              color: active ? 'var(--brand)' : 'var(--text-sub)',
              fontSize: 11, fontWeight: active ? 700 : 500,
              touchAction: 'manipulation', minHeight: 44,
            }}>
              {t.icon({ size: 24, weight: active ? 'duotone' : 'bold' })}
              <span>{t.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
