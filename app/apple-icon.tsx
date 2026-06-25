import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/**
 * apple-touch-icon — 홈스크린 추가 / 모바일 작업표시줄.
 * 웹 favicon (app/icon.tsx) 과 동일 디자인: 네이비 + 흰색 정면 자동차.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#1B2A4A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 40,
        }}
      >
        <svg viewBox="0 0 32 32" width="130" height="130">
          {/* 차체 — 사다리꼴 (정면) */}
          <path d="M5 13 L9 6 H23 L27 13 V25 H5 Z" fill="#fff" />
          {/* 윈드쉴드 */}
          <path d="M10.5 8 H21.5 L24 13 H8 Z" fill="#1B2A4A" />
          {/* 헤드라이트 */}
          <rect x="6.5" y="18" width="4" height="3" rx="1" fill="#1B2A4A" />
          <rect x="21.5" y="18" width="4" height="3" rx="1" fill="#1B2A4A" />
          {/* 그릴 */}
          <rect x="12" y="18.5" width="8" height="2" rx="0.5" fill="#1B2A4A" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
