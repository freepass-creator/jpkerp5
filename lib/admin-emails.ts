/**
 * 관리자 이메일 화이트리스트.
 * jpkerp-v4 와 동일 패턴 — Rules 는 인증만 체크, 권한 분리는 앱 코드.
 *
 * 추가/제거 시 코드 수정 + 배포 필요. 향후 RTDB users/{uid}/role 로 확장 가능.
 */
export const ADMIN_EMAILS: ReadonlyArray<string> = [
  'dudguq@gmail.com',
  'jpkpyh@gmail.com',
];

export function isAdmin(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}
