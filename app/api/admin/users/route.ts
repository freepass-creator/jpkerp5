/**
 * 가입된 전체 사용자(직원) 리스트 — admin 전용.
 *
 * GET /api/admin/users
 *   → { ok, users: [{ uid, email, displayName, createdAt, lastSignInAt, disabled }] }
 *
 * 호출자가 admin 이메일이 아니면 403.
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getFirebaseAuth } from '@/lib/firebase/admin-auth';
import { getAdminRtdb } from '@/lib/firebase/admin';
import { isAdmin, isSuperAdmin } from '@/lib/admin-emails';
import { RTDB_ROOT } from '@/lib/firebase/client';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(): Promise<NextResponse> {
  const actor = await requireAuth();
  if (actor instanceof NextResponse) return actor;
  if (!isAdmin(actor.email)) {
    return NextResponse.json({ ok: false, error: 'forbidden — admin only' }, { status: 403 });
  }

  try {
    const auth = getFirebaseAuth();
    const rtdb = getAdminRtdb();
    type Row = {
      uid: string;
      email: string;
      displayName: string;
      createdAt: string;
      lastSignInAt: string;
      disabled: boolean;
      provider: string;
      role: 'master' | 'admin' | 'staff';
    };
    const all: Row[] = [];

    // RTDB users 노드 일괄 조회 (한 번에 N개 role 가져옴)
    const rolesSnap = await rtdb.ref(`${RTDB_ROOT}/users`).once('value');
    const rolesMap = (rolesSnap.val() ?? {}) as Record<string, { role?: string }>;

    let pageToken: string | undefined = undefined;
    do {
      const res = await auth.listUsers(1000, pageToken);
      for (const u of res.users) {
        const email = u.email ?? '';
        const rtdbRole = rolesMap[u.uid]?.role;
        const role: Row['role'] = isSuperAdmin(email) ? 'master' : (rtdbRole === 'admin' ? 'admin' : 'staff');
        all.push({
          uid: u.uid,
          email,
          displayName: u.displayName ?? '',
          createdAt: u.metadata.creationTime ?? '',
          lastSignInAt: u.metadata.lastSignInTime ?? '',
          disabled: u.disabled,
          provider: (u.providerData[0]?.providerId ?? 'password').replace('.com', ''),
          role,
        });
      }
      pageToken = res.pageToken;
    } while (pageToken);

    all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    return NextResponse.json({ ok: true, count: all.length, users: all });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message ?? String(e) },
      { status: 500 },
    );
  }
}
