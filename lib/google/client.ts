/**
 * Google Workspace API 클라이언트 — Service Account 기반.
 *
 *  · Drive / Calendar / Gmail 공용 인증 헬퍼
 *  · 서버 측에서만 사용 (Service Account 키는 클라이언트 노출 X)
 *
 * 환경변수 (.env.local):
 *   GOOGLE_SERVICE_ACCOUNT_KEY    Service Account JSON 키 (전체 JSON 을 한 줄 base64 또는 raw JSON 문자열)
 *   GOOGLE_WORKSPACE_DOMAIN       teamjpk.com (도메인 위임 시 사용)
 *   GOOGLE_IMPERSONATE_USER       (선택) Domain-Wide Delegation 으로 대행할 계정 이메일
 *                                 — Drive/Gmail/Calendar 를 그 사용자 권한으로 호출 시
 *
 * 인증 모드:
 *  1) Service Account 단독 — 자체 권한 (공유된 폴더·캘린더만 접근)
 *  2) Domain-Wide Delegation — Workspace 관리자가 위임. impersonate=user 로 그 사용자 권한 행사.
 *     · Drive 백업: impersonate=erp@teamjpk.com → 그 계정의 My Drive 에 파일 저장
 *     · Gmail 발송: impersonate=erp@teamjpk.com → 그 계정으로 메일 발송
 *     · Calendar 이벤트: impersonate=대상자 → 그 캘린더에 등록
 */

import { google } from 'googleapis';

/** Service Account JSON 키 로드 — env 에서 raw JSON 또는 base64 디코드 */
function loadServiceAccountKey(): Record<string, unknown> | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  try {
    // base64 인코딩 시도 (한 줄 env 보관용)
    if (!raw.trim().startsWith('{')) {
      const decoded = Buffer.from(raw, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('[google-client] GOOGLE_SERVICE_ACCOUNT_KEY parse 실패:', e);
    return null;
  }
}

const SCOPES_BY_SERVICE = {
  drive:    ['https://www.googleapis.com/auth/drive'],
  calendar: ['https://www.googleapis.com/auth/calendar'],
  gmail:    ['https://www.googleapis.com/auth/gmail.send'],
} as const;

export type GoogleService = keyof typeof SCOPES_BY_SERVICE;

/** JWT 클라이언트 생성 — Service Account + 선택적 impersonate(subject).
 *  googleapis 와 google-auth-library 간 타입 충돌 회피 위해 returnType 추론 사용 (as 캐스팅). */
function buildJwtClient(service: GoogleService, impersonateUser?: string) {
  const key = loadServiceAccountKey();
  if (!key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY 미설정 — .env.local 에 Service Account JSON 필요');
  }
  const subject = impersonateUser || process.env.GOOGLE_IMPERSONATE_USER || undefined;
  return new google.auth.JWT({
    email:   String(key.client_email),
    key:     String(key.private_key),
    scopes:  [...SCOPES_BY_SERVICE[service]],
    subject, // Domain-Wide Delegation 시 그 사용자로 임퍼소네이트
  });
}

/** 서비스별 인증된 client 반환. JWT ↔ OAuth2Client 타입 호환은 런타임에 google.options 가 통일해줌. */
export function getDriveClient(impersonateUser?: string) {
  const auth = buildJwtClient('drive', impersonateUser);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return google.drive({ version: 'v3', auth: auth as any });
}

export function getCalendarClient(impersonateUser?: string) {
  const auth = buildJwtClient('calendar', impersonateUser);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return google.calendar({ version: 'v3', auth: auth as any });
}

export function getGmailClient(impersonateUser?: string) {
  const auth = buildJwtClient('gmail', impersonateUser);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return google.gmail({ version: 'v1', auth: auth as any });
}

/** 연동 가능 상태 빠른 체크 (env 만 본다, 실 API 호출 X) */
export function workspaceConfigured(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) missing.push('GOOGLE_SERVICE_ACCOUNT_KEY');
  return { ok: missing.length === 0, missing };
}
