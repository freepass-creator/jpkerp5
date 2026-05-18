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
 */

export type AuthedActor = { uid: string; email: string };

export async function requireAuth(): Promise<AuthedActor | NextResponse> {
  const h = await headers();
  const auth = h.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  try {
    const decoded = await getFirebaseAuth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email ?? '' };
  } catch {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
}
