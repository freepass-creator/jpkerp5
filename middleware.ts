import { NextResponse, type NextRequest } from 'next/server';

/**
 * 미들웨어 — 2가지 처리:
 *
 *  1. URL 대소문자 정규화: `/M/...` → `/m/...` (308)
 *     사용자가 카톡/문자 링크에서 폰 자동완성으로 M 대문자 들어가도 같은 페이지로.
 *     Next.js 라우팅은 기본 case-sensitive.
 *
 *  2. 모바일 UA 자동 리다이렉트: 핸드폰에서 `/` (또는 데스크탑 라우트) 접속 시 `/m`으로.
 *     쿠키 `force-desktop=1` 이 있으면 무시 (사용자가 데스크탑 모드 강제 시).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. /M → /m 정규화
  if (pathname.startsWith('/M')) {
    const url = req.nextUrl.clone();
    url.pathname = '/m' + pathname.slice(2);
    return NextResponse.redirect(url, 308);
  }

  // 2. 모바일 UA 감지 → /m 리다이렉트
  //   - 이미 /m/* 또는 /api/* /_next/* 등이면 그대로
  //   - 데스크탑 모드 강제 쿠키 있으면 그대로
  if (
    pathname !== '/m' &&
    !pathname.startsWith('/m/') &&
    !pathname.startsWith('/api') &&
    !pathname.startsWith('/_next') &&
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/signup') &&
    !pathname.startsWith('/reset') &&
    !pathname.startsWith('/customer') &&
    pathname !== '/manifest.webmanifest' &&
    !pathname.match(/\.(png|jpg|jpeg|svg|ico|webp|webmanifest)$/)
  ) {
    const ua = req.headers.get('user-agent') ?? '';
    const isMobile = /Mobile|Android|iPhone|iPod|iPad|Windows Phone|BlackBerry|Opera Mini/i.test(ua);
    const forceDesktop = req.cookies.get('force-desktop')?.value === '1';
    if (isMobile && !forceDesktop) {
      const url = req.nextUrl.clone();
      url.pathname = '/m';
      url.search = '';
      return NextResponse.redirect(url, 307);
    }
  }

  // HTML 응답은 캐시 금지 — Vercel CDN + 브라우저 둘 다.
  // 일반 Cache-Control 만으론 Vercel CDN이 stale-while-revalidate로 옛 응답 계속 서빙함.
  // Vercel-CDN-Cache-Control 로 CDN 단계에서 캐시 자체 차단.
  const res = NextResponse.next();
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.headers.set('CDN-Cache-Control', 'no-store');
  res.headers.set('Vercel-CDN-Cache-Control', 'no-store');
  return res;
}

export const config = {
  // 정적/이미지/api 제외 — 페이지 라우트만 처리
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image).*)'],
};
