'use client';

/**
 * 모바일 레이아웃 — /m/* 별도 트리.
 *  · 메인 탭 페이지: 하단 6탭 (홈/운영/리스크/입력/업로드/설정)
 *  · 상세 페이지: 하단 풀폭 '이전' 바 (탭 대신)
 *  · safe-area 대응 (iOS 노치/홈바)
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { House, Car, Warning, NotePencil, UploadSimple, GearSix } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

type Tab = {
  href: string;
  label: string;
  icon: (p: { size: number; weight: 'duotone' | 'bold' }) => JSX.Element;
  match: (p: string) => boolean;
  /** 활성 색 — 페이지 상단 라인과 매칭 */
  activeColor: string;
};

const TABS: Tab[] = [
  { href: '/m',        label: '홈',     icon: ({ size, weight }) => <House size={size} weight={weight} />,
    match: (p) => p === '/m', activeColor: 'var(--green-text)' },
  { href: '/m/ops',    label: '운영',   icon: ({ size, weight }) => <Car size={size} weight={weight} />,
    match: (p) => p.startsWith('/m/ops') || p.startsWith('/m/contract'), activeColor: 'var(--brand)' },
  { href: '/m/risk',   label: '리스크', icon: ({ size, weight }) => <Warning size={size} weight={weight} />,
    match: (p) => p.startsWith('/m/risk'), activeColor: 'var(--red-text)' },
  { href: '/m/entry',  label: '입력',   icon: ({ size, weight }) => <NotePencil size={size} weight={weight} />,
    match: (p) => p.startsWith('/m/entry'), activeColor: 'var(--indigo-text)' },
  { href: '/m/upload', label: '업로드', icon: ({ size, weight }) => <UploadSimple size={size} weight={weight} />,
    match: (p) => p.startsWith('/m/upload'), activeColor: 'var(--amber-text)' },
  { href: '/m/me',     label: '설정',   icon: ({ size, weight }) => <GearSix size={size} weight={weight} />,
    match: (p) => p.startsWith('/m/me'), activeColor: 'var(--text-sub)' },
];

/** 상세 페이지 패턴 — 진입 시 탭바 대신 풀폭 '이전' 바 노출. */
/**
 * 서브 페이지 패턴 — 탭바 자리에 '이전' 바 노출.
 *
 * 모바일 규격:
 *  · 탭 페이지(6개: 홈/운영/리스크/입력/업로드/설정) → 탭바
 *  · 서브 페이지(상세/스케줄/액션 폼 등) → 이전 바 (하단)
 *  · 저장 폼 페이지 → [취소][저장] 바 (SaveFooter — 이전 바 위로 덮음)
 */
function isDetailRoute(path: string): boolean {
  if (path === '/m') return false;
  // 6개 탭 페이지는 탭바 유지
  const tabPaths = ['/m/ops', '/m/risk', '/m/entry', '/m/upload', '/m/me'];
  if (tabPaths.includes(path)) return false;
  // 그 외 모든 /m/* 는 서브 페이지로 간주 → 이전 바
  return path.startsWith('/m/');
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
            position: 'relative',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 2, textDecoration: 'none',
            color: active ? t.activeColor : 'var(--text-sub)',
            fontSize: active ? 11 : 10, fontWeight: active ? 800 : 500,
            touchAction: 'manipulation', minHeight: 44,
          }}>
            {/* 활성 탭 상단 indicator — 페이지 상단 색과 매칭 */}
            {active && (
              <span style={{
                position: 'absolute', top: 0, left: '25%', right: '25%',
                height: 2.5, background: t.activeColor, borderRadius: '0 0 4px 4px',
              }} />
            )}
            {t.icon({ size: active ? 22 : 20, weight: active ? 'duotone' : 'bold' })}
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
      paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)',
      paddingLeft: 16, paddingRight: 16, paddingTop: 10,
      background: 'var(--bg-card)', borderTop: '1px solid var(--border)',
      zIndex: 100, boxShadow: '0 -2px 8px rgba(0,0,0,0.04)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <button
        type="button"
        onClick={() => router.back()}
        style={{
          width: '100%', height: 48,
          background: 'var(--brand-bg)', color: 'var(--brand)',
          border: '1.5px solid var(--brand)', borderRadius: 'var(--radius)',
          fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
          letterSpacing: '0.02em',
          cursor: 'pointer', touchAction: 'manipulation',
        }}
      >
        이전
      </button>
    </nav>
  );
}
