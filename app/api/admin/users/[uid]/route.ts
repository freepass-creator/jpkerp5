/**
 * 단일 사용자 관리 — admin 전용.
 *
 * PATCH  /api/admin/users/{uid}     body: { disabled?: boolean, displayName?: string }
 * DELETE /api/admin/users/{uid}     → 계정 영구 삭제 (위험)
 *
 * 자기 자신의 비활성/삭제는 차단.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getFirebaseAuth } from '@/lib/firebase/admin-auth';
import { isAdmin } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const maxDuration = 30;

async function guard(actorEmail: string, targetUid: string): Promise<NextResponse | null> {
  if (!isAdmin(actorEmail)) {
    return NextResponse.json({ ok: false, error: 'forbidden — admin only' }, { status: 403 });
  }
  if (!targetUid) {
    return NextResponse.json({ ok: false, error: 'invalid uid' }, { status: 400 });
  }
  return null;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ uid: string }> }): Promise<NextResponse> {
  const actor = await requireAuth();
  if (actor instanceof NextResponse) return actor;
  const { uid } = await ctx.params;
  const err = await guard(actor.email, uid);
  if (err) return err;

  const body = await req.json().catch(() => ({})) as { disabled?: boolean; displayName?: string };

  // 자기 자신 비활성 차단
  if (body.disabled === true && actor.uid === uid) {
    return NextResponse.json({ ok: false, error: '자기 자신은 비활성화할 수 없습니다.' }, { status: 400 });
  }

  try {
    const auth = getFirebaseAuth();
    const updates: { disabled?: boolean; displayName?: string } = {};
    if (typeof body.disabled === 'boolean') updates.disabled = body.disabled;
    if (typeof body.displayName === 'string') updates.displayName = body.displayName.trim();
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: '변경할 항목 없음' }, { status: 400 });
    }
    const user = await auth.updateUser(uid, updates);
    return NextResponse.json({ ok: true, uid: user.uid, disabled: user.disabled, displayName: user.displayName ?? '' });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message ?? String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ uid: string }> }): Promise<NextResponse> {
  const actor = await requireAuth();
  if (actor instanceof NextResponse) return actor;
  const { uid } = await ctx.params;
  const err = await guard(actor.email, uid);
  if (err) return err;

  // 자기 자신 삭제 차단
  if (actor.uid === uid) {
    return NextResponse.json({ ok: false, error: '자기 자신은 삭제할 수 없습니다.' }, { status: 400 });
  }
  // admin 이메일 보호 — 화이트리스트의 계정은 코드에서 분리해야 안전. 1차 가드만.
  try {
    const auth = getFirebaseAuth();
    const target = await auth.getUser(uid);
    if (isAdmin(target.email ?? '')) {
      return NextResponse.json({ ok: false, error: '관리자 계정은 코드에서 ADMIN_EMAILS 제거 후 삭제하세요.' }, { status: 400 });
    }
    await auth.deleteUser(uid);
    return NextResponse.json({ ok: true, uid });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message ?? String(e) }, { status: 500 });
  }
}
