'use client';

/**
 * 클라이언트 사이드 audit meta 수집 — IP 외 모든 표준 필드.
 *
 * - userAgent / locale / tzOffset / pagePath / referrer — navigator + location 에서 즉시 추출
 * - sessionId — sessionStorage 에 UUID 발급 (탭 단위, 새로고침에도 유지)
 * - ip — `/api/whoami` 1번 fetch 후 모듈 캐시 (세션 재사용)
 * - appVersion — NEXT_PUBLIC_APP_VERSION env 또는 빌드시점 Vercel commit SHA
 *
 * collectAuditMeta() 는 동기 — IP 가 아직 fetch 전이면 빠진 채로 push 됨 (audit 본흐름 막지 않음).
 * 앱 부팅 시 primeAuditIp() 한 번 호출해두면 그 다음부터 IP 포함됨.
 */

import type { AuditMeta } from './audit-log';

const SESSION_KEY = 'jpkerp-v4:audit-session-id';

let cachedIp: string | undefined;
let ipPromise: Promise<string | undefined> | null = null;

function getOrCreateSessionId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

/** 페이지 부팅 시 1번 호출 — IP 미리 fetch 해서 모듈 캐시. 이후 audit 들이 IP 포함하게 됨. */
export async function primeAuditIp(): Promise<void> {
  if (typeof window === 'undefined' || cachedIp) return;
  if (!ipPromise) {
    ipPromise = fetch('/api/whoami', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const ip = j?.ip;
        if (typeof ip === 'string') cachedIp = ip;
        return cachedIp;
      })
      .catch(() => undefined);
  }
  await ipPromise;
}

/** audit log 에 첨부할 meta 동기 수집. IP 는 primeAuditIp 후에야 채워짐. */
export function collectAuditMeta(): AuditMeta {
  if (typeof window === 'undefined') return {};
  return {
    ip: cachedIp,
    userAgent: navigator.userAgent,
    sessionId: getOrCreateSessionId(),
    pagePath: location.pathname + location.search,
    referrer: document.referrer || undefined,
    locale: navigator.language,
    tzOffset: new Date().getTimezoneOffset(),
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
  };
}
