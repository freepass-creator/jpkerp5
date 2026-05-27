/**
 * 친화적 에러 메시지 — Firebase / 네트워크 / 일반 에러 → 사용자 친화적 한글.
 *
 *   try { ... } catch (e) { toast.error(friendlyError(e)); }
 */

const PATTERNS: Array<[RegExp, string]> = [
  // Firebase Auth
  [/invalid.credential|wrong-password|invalid.password/i, '이메일 또는 비밀번호가 잘못되었습니다'],
  [/user-not-found/i, '등록되지 않은 계정입니다'],
  [/email-already-in-use/i, '이미 가입된 이메일입니다'],
  [/weak-password/i, '비밀번호가 너무 약합니다 (6자 이상)'],
  [/invalid-email/i, '이메일 형식이 잘못되었습니다'],
  [/too-many-requests/i, '시도 너무 많음 — 잠시 후 다시 시도하세요'],
  [/user-disabled/i, '이 계정은 비활성화되었습니다'],
  // Firebase RTDB / Storage
  [/permission_?denied|permission.denied/i, '권한이 없어 접근할 수 없습니다 (관리자에게 문의)'],
  [/network.error|network.request.failed/i, '네트워크 오류 — 인터넷 연결 확인 후 다시 시도'],
  [/quota.exceeded/i, '저장 용량 초과 — 관리자에게 문의'],
  [/timeout/i, '요청 시간 초과 — 잠시 후 다시 시도'],
  // 파일 / 파싱
  [/excel|xlsx|sheet/i, '엑셀 파일 처리 중 오류'],
  [/unexpected.token|json.parse/i, '데이터 형식 오류'],
  // Firebase 미설정
  [/firebase.auth.미설정|firebase.미설정/i, 'Firebase 미설정 — 환경변수 확인 필요'],
];

/** Error / string / unknown → 사용자 친화적 한글 메시지 */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
  for (const [re, friendly] of PATTERNS) {
    if (re.test(msg)) return friendly;
  }
  // 매칭 안 됨 — 원 메시지 반환 (최대 200자)
  return msg.length > 200 ? msg.slice(0, 200) + '…' : msg;
}
