import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthGate } from '@/components/auth/auth-gate';

export const metadata: Metadata = {
  title: 'jpkerp5 — 차량 렌탈 ERP',
  description: '미수·반납·수납·과태료 관리 ERP',
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
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
