/**
 * 권한 화이트리스트 — 2단계.
 *
 *  - SUPER_ADMIN : 데이터 삭제·일괄 수정 등 위험 권한 (오직 1명)
 *  - ADMIN       : 감사 로그·관리 페이지 접근 (n명)
 *
 * jpkerp-v4 권한 정책 동일 — Rules 는 인증만, 권한 분리는 앱 코드에서.
 */
export const SUPER_ADMIN_EMAILS: ReadonlyArray<string> = [
  'pyh@teamjpk.com',
];

export const ADMIN_EMAILS: ReadonlyArray<string> = [
  ...SUPER_ADMIN_EMAILS,
];

/**
 * ★ 활성화 (2026-06-19) — strict 화이트리스트.
 *
 *  · isSuperAdmin: SUPER_ADMIN_EMAILS 만 통과 — 위험 작업·관리 페이지 gate
 *  · isAdmin:      SUPER_ADMIN_EMAILS + ADMIN_EMAILS 통과 — 일반 관리 페이지
 *
 * 페이지 접근 (운영 페이지) 은 use-role.ts 의 isMaster (permissive — !!user) 로 분리.
 * 위 두 함수는 위험 작업 (일괄 삭제·migration·dev-tools·role 부여 API) 전용.
 */
export function isSuperAdmin(email?: string | null): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return SUPER_ADMIN_EMAILS.some((x) => x.toLowerCase() === e);
}

export function isAdmin(email?: string | null): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return ADMIN_EMAILS.some((x) => x.toLowerCase() === e);
}

/**
 * 개발도구 (/admin/dev-tools) 전용 가드 — 위 두 함수와 달리 화이트리스트만 통과.
 * 데이터 삭제·일괄 마이그레이션 등 위험 기능이라 마스터 본인 한정.
 */
export function isDevToolUser(email?: string | null): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return SUPER_ADMIN_EMAILS.some((x) => x.toLowerCase() === e);
}
