import { NextResponse, type NextRequest } from 'next/server';

/**
 * URL 대소문자 정규화 — 모바일 라우트 `/M/...` → `/m/...` 자동 리다이렉트.
 *
 * 사용자가 카카오톡 / 문자 등에서 받은 링크에 폰 자동완성으로 `M` 대문자가 들어가도
 * 같은 페이지로 이동되도록.
 *
 * Next.js 라우팅은 기본적으로 대소문자 구분(case-sensitive)임.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/M')) {
    const url = req.nextUrl.clone();
    url.pathname = '/m' + pathname.slice(2);
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/M/:path*', '/M'],
};
