import 'server-only';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getFirebaseAuth } from './firebase/admin-auth';

/**
 * 공용 API 인증 — Authorization: Bearer <Firebase ID token>.
 *
 * 사용:
 *   const actor = await requireAuth();
 *   if (actor instanceof NextResponse) return actor; // 401 단축
 *   const { uid, email } = actor;
 *
 * 로컬 dev에서 FIREBASE_ADMIN_KEY 가 없을 때는 graceful skip — token 없이도 통과
 * (production 배포 시 반드시 FIREBASE_ADMIN_KEY env 설정 필요).
 */

export type AuthedActor = { uid: string; email: string };

const HAS_ADMIN_KEY = !!process.env.FIREBASE_ADMIN_KEY || !!process.env.GOOGLE_APPLICATION_CREDENTIALS;

export async function requireAuth(): Promise<AuthedActor | NextResponse> {
  const h = await headers();
  const auth = h.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  // 로컬 dev: admin SDK 자격 없음 → token 미검증, 통과 (NEXT_PUBLIC_* 만으로 동작).
  // 단 프로덕션에서 admin key 누락은 오설정 — graceful skip 하면 전 API 무인증 통과라 차단 (fail-closed).
  if (!HAS_ADMIN_KEY) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ ok: false, error: 'server auth misconfigured (FIREBASE_ADMIN_KEY)' }, { status: 500 });
    }
    return { uid: 'local-dev', email: 'local@dev' };
  }

  if (!token) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  try {
    const decoded = await getFirebaseAuth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email ?? '' };
  } catch {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
}
