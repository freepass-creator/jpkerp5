import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthGate } from '@/components/auth/auth-gate';
import { SettingsInit } from '@/components/settings-init';
import { GlobalSearch } from '@/components/global-search';
import { OnboardingTour } from '@/components/onboarding/onboarding-tour';
import { ToastContainer } from '@/components/toast-container';
import { DataProvider } from '@/lib/data-context';
import { GlobalDialogsProvider } from '@/lib/global-dialogs';

/** 제품(프로젝트) 정체성 — 사용 회사명·도메인과 무관 */
const SITE_NAME = '렌터카매니저';
const SITE_DESCRIPTION = '차량 · 계약 · 수납 · 미수 · 과태료를 한 곳에서 관리하는 렌터카 운영 ERP.';

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} — 렌터카 운영 ERP`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: ['렌터카', '렌터카 ERP', '차량 관리', '계약 관리', '수납 관리', '미수 관리', '과태료', '렌터카매니저', 'Rentcar Manager'],
  applicationName: SITE_NAME,
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: SITE_NAME,
    title: `${SITE_NAME} — 렌터카 운영 ERP`,
    description: SITE_DESCRIPTION,
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — 렌터카 운영 ERP`,
    description: SITE_DESCRIPTION,
    images: ['/opengraph-image'],
  },
  robots: {
    index: false,   // 내부 운영 ERP라 검색엔진 노출 차단
    follow: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1B2A4A',
};

// CDN 캐시 차단은 middleware 의 Vercel-CDN-Cache-Control: no-store 로 처리.
// (force-dynamic 을 layout 에 두면 dev 서버 turbopack 이 stale 자주 빠지는 부작용)

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css"
        />
        {/* 모바일 자동 리다이렉트 안전망 — middleware UA 매칭 실패(사파리 "데스크탑 사이트 요청" 등) 케이스 백업.
            매우 빠른 inline 스크립트로 첫 paint 전에 location.replace → 깜빡임 최소. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  try {
    var p = location.pathname;
    if (p.indexOf('/m') === 0 || p.indexOf('/api') === 0 || p.indexOf('/customer') === 0) return;
    if (document.cookie.indexOf('force-desktop=1') !== -1) return;

    var ua = navigator.userAgent || '';
    var mobileUa = /Mobile|Android|iPhone|iPod|iPad|Windows Phone|BlackBerry|Opera Mini/i.test(ua);
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var narrow = window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
    var screenNarrow = window.screen && window.screen.width <= 1024;

    // 사파리 "데스크탑 사이트 요청"이면 UA·viewport는 데스크탑이지만
    // pointer는 coarse, screen.width는 폰 폭 그대로 → 둘 중 하나라도 잡힘.
    if (mobileUa || coarse || narrow || screenNarrow) location.replace('/m');
  } catch(e) { /* silent */ }
})();
            `.trim(),
          }}
        />
      </head>
      <body>
        <SettingsInit />
        <AuthGate>
          <DataProvider>
            <GlobalDialogsProvider>
              {children}
              <GlobalSearch />
              <OnboardingTour />
            </GlobalDialogsProvider>
          </DataProvider>
        </AuthGate>
        <ToastContainer />
      </body>
    </html>
  );
}
