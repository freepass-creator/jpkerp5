/**
 * 계약 반납 처리 API — ERP #31 업무 단위 endpoint.
 *
 * POST /api/contracts/{id}/return
 *   body: { returnedDate: 'YYYY-MM-DD' }
 *
 * 클라이언트에서 c.status = '반납' 직접 셋팅 X.
 * 이 endpoint 호출 시:
 *  1. 권한 검증 (인증 필수)
 *  2. 회계기간 마감 검사 (#18)
 *  3. Lost Update 보호 (lockedUpdate)
 *  4. markReturned() 로직 적용 (일할 자동 정산)
 *  5. Vehicle 마스터 status 동기화
 *  6. audit log
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getAdminRtdb } from '@/lib/firebase/admin';
import { markReturned } from '@/lib/contract-actions';
import { isDateInClosedPeriod, type ClosedPeriodsMap } from '@/lib/firebase/closed-periods-store';
import type { Contract, Vehicle } from '@/lib/types';

export const runtime = 'nodejs';

const TENANT = process.env.NEXT_PUBLIC_FIREBASE_DB_TENANT ?? 'jpkerp5';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const actor = authResult;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, error: 'contract id required' }, { status: 400 });

  let body: { returnedDate?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 }); }

  const returnedDate = body.returnedDate;
  if (!returnedDate || !/^\d{4}-\d{2}-\d{2}$/.test(returnedDate)) {
    return NextResponse.json({ ok: false, error: 'returnedDate (YYYY-MM-DD) required' }, { status: 400 });
  }

  try {
    const db = getAdminRtdb();

    // 회계기간 마감 검사 (#18)
    const closedSnap = await db.ref(`${TENANT}/closed_periods`).get();
    const closedMap = (closedSnap.val() as ClosedPeriodsMap | null) ?? {};
    if (isDateInClosedPeriod(closedMap, returnedDate)) {
      return NextResponse.json({
        ok: false, error: 'period_closed',
        message: `회계기간 마감 — ${returnedDate.slice(0, 7)}월 거래 등록 불가`,
      }, { status: 409 });
    }

    // 계약 + 차량 마스터 fetch
    const cRef = db.ref(`${TENANT}/contracts/${id}`);
    const cSnap = await cRef.get();
    const contract = cSnap.val() as Contract | null;
    if (!contract) return NextResponse.json({ ok: false, error: 'contract not found' }, { status: 404 });
    if (contract.returnedDate) {
      return NextResponse.json({ ok: false, error: 'already returned', returnedDate: contract.returnedDate }, { status: 409 });
    }

    // markReturned 적용 (상태 SSOT)
    const updated = markReturned(contract, returnedDate);

    // Optimistic Lock (#22) — c.updatedAt 비교 transaction
    const txResult = await cRef.transaction((current: Contract | null) => {
      if (!current) return current;
      if (current.updatedAt && contract.updatedAt && current.updatedAt !== contract.updatedAt) {
        return; // abort — 다른 사용자 먼저 수정
      }
      return { ...updated, updatedAt: new Date().toISOString(), updatedBy: actor.email };
    });
    if (!txResult.committed) {
      return NextResponse.json({ ok: false, error: 'lock_conflict', message: '다른 사용자가 먼저 수정했습니다' }, { status: 409 });
    }

    // Vehicle 마스터 status sync
    if (updated.vehiclePlate) {
      const vehiclesSnap = await db.ref(`${TENANT}/vehicles`).get();
      const vMap = (vehiclesSnap.val() as Record<string, Vehicle> | null) ?? {};
      const vehicle = Object.values(vMap).find((v) => (v.plate ?? '').trim() === updated.vehiclePlate!.trim());
      if (vehicle && vehicle.status !== '반납') {
        await db.ref(`${TENANT}/vehicles/${vehicle.id}`).update({
          status: '반납', updatedAt: new Date().toISOString(), updatedBy: actor.email,
        });
      }
    }

    // audit log — AuditLog 스키마 필드명 준수(entityType/label/by). entity·description 은 감사화면서 빈칸으로 뜸.
    const auditRef = db.ref(`${TENANT}/audit_logs`).push();
    await auditRef.set({
      at: new Date().toISOString(),
      by: actor.email,
      userId: actor.uid,
      action: 'update',
      entityType: 'contract',
      entityId: id,
      label: `계약 반납 API ${contract.contractNo} ${contract.vehiclePlate} ${contract.customerName} → ${returnedDate}`,
    });

    return NextResponse.json({ ok: true, returnedDate });
  } catch (e) {
    console.error('[contracts/return]', e);
    return NextResponse.json({ ok: false, error: (e as Error).message ?? String(e) }, { status: 500 });
  }
}
