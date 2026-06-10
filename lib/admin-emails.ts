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

/**
 * ⚠️ 현재 모드 — 모든 인증 사용자에게 마스터 권한 부여 (개발/초기 운영).
 * 정식 권한 분리 시 화이트리스트 검사로 복원:
 *   return !!email && SUPER_ADMIN_EMAILS.some((x) => x.toLowerCase() === email.toLowerCase());
 */
export function isSuperAdmin(email?: string | null): boolean {
  return !!email;
}

export function isAdmin(email?: string | null): boolean {
  return !!email;
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
