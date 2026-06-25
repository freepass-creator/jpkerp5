import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/**
 * favicon — 네이비 사각형 + 흰색 정면 자동차.
 * Phosphor 의 Car/Truck 은 측면이라 직접 SVG 작성.
 */
export default function Icon() {
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
          borderRadius: 6,
        }}
      >
        <svg viewBox="0 0 32 32" width="24" height="24">
          {/* 차체 — 사다리꼴 (정면 시각: 윗부분 좁고 아래 넓음) */}
          <path d="M5 13 L9 6 H23 L27 13 V25 H5 Z" fill="#fff" />
          {/* 윈드쉴드 — 배경색으로 잘라내기 */}
          <path d="M10.5 8 H21.5 L24 13 H8 Z" fill="#1B2A4A" />
          {/* 헤드라이트 좌우 */}
          <rect x="6.5" y="18" width="4" height="3" rx="1" fill="#1B2A4A" />
          <rect x="21.5" y="18" width="4" height="3" rx="1" fill="#1B2A4A" />
          {/* 그릴 (가운데) */}
          <rect x="12" y="18.5" width="8" height="2" rx="0.5" fill="#1B2A4A" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
