/**
 * 권한 화이트리스트 — 2단계.
 *
 *  - SUPER_ADMIN : 데이터 삭제·일괄 수정 등 위험 권한 (오직 1명)
 *  - ADMIN       : 감사 로그·관리 페이지 접근 (n명)
 *
 * jpkerp-v4 권한 정책 동일 — Rules 는 인증만, 권한 분리는 앱 코드에서.
 */
export const SUPER_ADMIN_EMAILS: ReadonlyArray<string> = [
  'jpkpyh@gmail.com',
  'dudguq@gmail.com',
];

export const ADMIN_EMAILS: ReadonlyArray<string> = [
  ...SUPER_ADMIN_EMAILS,
];

export function isSuperAdmin(email?: string | null): boolean {
  return !!email;
}

export function isAdmin(email?: string | null): boolean {
  return !!email;
}
