/**
 * 직원 권한 토글 — 마스터(SUPER_ADMIN) 전용.
 *
 * PATCH /api/admin/users/{uid}/role   body: { role: 'admin' | 'staff' }
 *   → RTDB /users/{uid}/role 저장
 *
 * 자기 자신의 권한 변경은 차단 (마스터 자신은 코드 화이트리스트라 어차피 무관).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getAdminRtdb } from '@/lib/firebase/admin';
import { isSuperAdmin } from '@/lib/admin-emails';
import { RTDB_ROOT } from '@/lib/firebase/client';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ uid: string }> }): Promise<NextResponse> {
  const actor = await requireAuth();
  if (actor instanceof NextResponse) return actor;
  if (!isSuperAdmin(actor.email)) {
    return NextResponse.json({ ok: false, error: 'forbidden — master only' }, { status: 403 });
  }
  const { uid } = await ctx.params;
  if (!uid) return NextResponse.json({ ok: false, error: 'invalid uid' }, { status: 400 });
  if (uid === actor.uid) {
    return NextResponse.json({ ok: false, error: '자기 자신의 권한은 변경할 수 없습니다.' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({})) as { role?: 'admin' | 'staff' };
  if (body.role !== 'admin' && body.role !== 'staff') {
    return NextResponse.json({ ok: false, error: 'role은 admin 또는 staff' }, { status: 400 });
  }

  try {
    const rtdb = getAdminRtdb();
    const refPath = `${RTDB_ROOT}/users/${uid}`;
    // staff 로 내릴 때는 role 노드 자체 삭제 (기본값으로 복귀)
    if (body.role === 'staff') {
      await rtdb.ref(`${refPath}/role`).remove();
    } else {
      await rtdb.ref(refPath).update({
        role: 'admin',
        grantedBy: actor.email,
        grantedByUid: actor.uid,
        grantedAt: new Date().toISOString(),
      });
    }
    return NextResponse.json({ ok: true, uid, role: body.role });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message ?? String(e) }, { status: 500 });
  }
}
