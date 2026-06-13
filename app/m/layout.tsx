'use client';

/**
 * 모바일 레이아웃 — /m/* 별도 트리.
 *  · 메인 탭 페이지: 하단 6탭 (홈/운영/리스크/입력/업로드/설정)
 *  · 상세 페이지: 하단 풀폭 '이전' 바 (탭 대신)
 *  · safe-area 대응 (iOS 노치/홈바)
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { House, ListChecks, Warning, NotePencil, UploadSimple, GearSix } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

const TABS: { href: string; label: string; icon: (p: { size: number; weight: 'duotone' | 'bold' }) => JSX.Element; match: (p: string) => boolean }[] = [
  { href: '/m',         label: '홈',     icon: ({ size, weight }) => <House size={size} weight={weight} />,
    match: (p) => p === '/m' },
  { href: '/m/ops',     label: '운영',   icon: ({ size, weight }) => <ListChecks size={size} weight={weight} />,
    match: (p) => p.startsWith('/m/ops') || p.startsWith('/m/contract') },
  { href: '/m/risk',    label: '리스크', icon: ({ size, weight }) => <Warning size={size} weight={weight} />,
    match: (p) => p.startsWith('/m/risk') },
  { href: '/m/entry',   label: '입력',   icon: ({ size, weight }) => <NotePencil size={size} weight={weight} />,
    match: (p) => p.startsWith('/m/entry') },
  { href: '/m/upload',  label: '업로드', icon: ({ size, weight }) => <UploadSimple size={size} weight={weight} />,
    match: (p) => p.startsWith('/m/upload') },
  { href: '/m/me',      label: '설정',   icon: ({ size, weight }) => <GearSix size={size} weight={weight} />,
    match: (p) => p.startsWith('/m/me') },
];

/** 상세 페이지 패턴 — 진입 시 탭바 대신 풀폭 '이전' 바 노출. */
function isDetailRoute(path: string): boolean {
  return path.startsWith('/m/contract/')
    || path.startsWith('/m/entry/memo')
    || path.startsWith('/m/entry/license')
    || (path.startsWith('/m/me/') && path !== '/m/me');
}

export default function MobileLayout({ children }: { children: ReactNode }) {
  const path = usePathname() ?? '';
  const detail = isDetailRoute(path);
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-main)',
      display: 'flex', flexDirection: 'column',
      paddingBottom: 'calc(58px + env(safe-area-inset-bottom))',
    }}>
      <main style={{ flex: 1, paddingTop: 'env(safe-area-inset-top)' }}>{children}</main>
      {detail ? <BackBar /> : <TabBar path={path} />}
    </div>
  );
}

function TabBar({ path }: { path: string }) {
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      height: 'calc(58px + env(safe-area-inset-bottom))',
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
            gap: 2, textDecoration: 'none',
            color: active ? 'var(--brand)' : 'var(--text-sub)',
            fontSize: 10, fontWeight: active ? 700 : 500,
            touchAction: 'manipulation', minHeight: 44,
          }}>
            {t.icon({ size: 20, weight: active ? 'duotone' : 'bold' })}
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function BackBar() {
  const router = useRouter();
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      height: 'calc(58px + env(safe-area-inset-bottom))',
      paddingBottom: 'env(safe-area-inset-bottom)',
      background: 'var(--bg-card)', borderTop: '1px solid var(--border)',
      zIndex: 100, boxShadow: '0 -2px 8px rgba(0,0,0,0.04)',
    }}>
      <button
        type="button"
        onClick={() => router.back()}
        style={{
          width: '100%', height: 58, background: 'transparent', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-main)', fontSize: 17, fontWeight: 700, fontFamily: 'inherit',
          letterSpacing: '0.02em',
          cursor: 'pointer', touchAction: 'manipulation',
        }}
      >
        이전
      </button>
    </nav>
  );
}
