import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthGate } from '@/components/auth/auth-gate';
import { SettingsInit } from '@/components/settings-init';
import { GlobalSearch } from '@/components/global-search';
import { OnboardingTour } from '@/components/onboarding/onboarding-tour';
import { ToastContainer } from '@/components/toast-container';
import { DataProvider } from '@/lib/data-context';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css"
        />
      </head>
      <body>
        <SettingsInit />
        <AuthGate>
          <DataProvider>
            {children}
            <GlobalSearch />
            <OnboardingTour />
          </DataProvider>
        </AuthGate>
        <ToastContainer />
      </body>
    </html>
  );
}
