import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/**
 * apple-touch-icon — 홈스크린 추가 / 모바일 작업표시줄.
 * 웹 favicon (app/icon.tsx) 과 동일 디자인: 네이비 + 흰색 Phosphor Car (옆모습).
 * 사이드바 자산관리 메뉴 아이콘과 동일.
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
        <svg viewBox="0 0 256 256" width="130" height="130" fill="#fff">
          <path d="M240,112H229.2L210.78,75.16A16,16,0,0,0,196.42,66.27H59.58A16,16,0,0,0,45.22,75.16L26.8,112H16a8,8,0,0,0,0,16h8v64a16,16,0,0,0,16,16H64a16,16,0,0,0,16-16V184h96v8a16,16,0,0,0,16,16h24a16,16,0,0,0,16-16V128h8a8,8,0,0,0,0-16ZM59.58,82.27H196.42L211.05,112H44.94ZM64,192H40V168H64Zm128,0V168h24v24ZM216,152H40V128H216ZM56,144a8,8,0,0,1,8-8H80a8,8,0,0,1,0,16H64A8,8,0,0,1,56,144Zm112,0a8,8,0,0,1,8-8h16a8,8,0,0,1,0,16H176A8,8,0,0,1,168,144Z" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
