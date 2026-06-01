import 'server-only';
import { headers } from 'next/headers';

/**
 * 간단한 인메모리 rate limiter (싱글 서버용).
 * Vercel 같은 멀티 인스턴스 환경에서는 분산 키스토어(Redis) 필요.
 *
 *   if (!checkRateLimit(`customer-lookup:${ip}`, { max: 10, windowMs: 60_000 })) {
 *     return 429;
 *   }
 */

type Window = { count: number; resetAt: number };
const store = new Map<string, Window>();
const MAX_KEYS = 5000;

export function checkRateLimit(key: string, opts: { max: number; windowMs: number }): boolean {
  const now = Date.now();
  const cur = store.get(key);
  if (!cur || cur.resetAt <= now) {
    // 새 window
    if (store.size > MAX_KEYS) {
      // 오래된 키 정리
      for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
    }
    store.set(key, { count: 1, resetAt: now + opts.windowMs });
    return true;
  }
  if (cur.count >= opts.max) return false;
  cur.count += 1;
  return true;
}

/** 클라이언트 IP — Vercel·proxy 헤더 우선 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return h.get('x-real-ip') ?? h.get('cf-connecting-ip') ?? 'unknown';
}
