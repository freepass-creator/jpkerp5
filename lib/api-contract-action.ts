import 'server-only';

/**
 * 업무 단위 API 공용 helper — ERP #31.
 *
 * /api/contracts/[id]/{action} endpoint 들이 공유:
 *  · 회계기간 마감 검사 (#18)
 *  · 계약 fetch + 부재 검사
 *  · markX() 적용 (#4 SSOT)
 *  · Optimistic Lock — transaction() (#22)
 *  · Vehicle 마스터 status sync (#11 부분)
 *  · audit log
 *
 * 사용:
 *   return performContractAction(req, ctx, {
 *     action: 'deliver',
 *     dateField: 'deliveredDate',
 *     transform: (c, date) => markDelivered(c, date),
 *     alreadyDone: (c) => !!c.deliveredDate,
 *     description: (c, date) => `계약 인도 ${c.contractNo} → ${date}`,
 *   });
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from './api-auth';
import { getAdminRtdb } from './firebase/admin';
import { isDateInClosedPeriod, type ClosedPeriodsMap } from './firebase/closed-periods-store';
import type { Contract, Vehicle } from './types';

const TENANT = process.env.NEXT_PUBLIC_FIREBASE_DB_TENANT ?? 'jpkerp5';

export type ContractActionConfig = {
  /** 액션 이름 — audit log 용 */
  action: string;
  /** body 에서 받을 날짜 필드 ('deliveredDate' | 'returnedDate' | null) */
  dateField: string | null;
  /** 날짜 받으면 회계기간 마감 검사 적용 (#18) */
  checkClosed?: boolean;
  /** Contract → 변경된 Contract 변환 (#4 SSOT markX 호출) */
  transform: (c: Contract, date: string | undefined) => Contract;
  /** 이미 처리된 상태 검사 (멱등성) */
  alreadyDone?: (c: Contract) => boolean;
  /** audit log description 생성 */
  description: (c: Contract, date: string | undefined) => string;
  /** Vehicle 마스터 sync 시 적용할 새 vehicleStatus (null 이면 sync skip) */
  newVehicleStatus?: Contract['vehicleStatus'];
};

export async function performContractAction(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
  config: ContractActionConfig,
): Promise<NextResponse> {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const actor = authResult;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, error: 'contract id required' }, { status: 400 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); }
  catch { /* body 없어도 허용 */ }

  let date: string | undefined;
  if (config.dateField) {
    const raw = body[config.dateField];
    if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return NextResponse.json({ ok: false, error: `${config.dateField} (YYYY-MM-DD) required` }, { status: 400 });
    }
    date = raw;
  }

  try {
    const db = getAdminRtdb();

    // 회계기간 마감 (#18)
    if (config.checkClosed && date) {
      const closedSnap = await db.ref(`${TENANT}/closed_periods`).get();
      const closedMap = (closedSnap.val() as ClosedPeriodsMap | null) ?? {};
      if (isDateInClosedPeriod(closedMap, date)) {
        return NextResponse.json({
          ok: false, error: 'period_closed',
          message: `회계기간 마감 — ${date.slice(0, 7)}월 거래 등록 불가`,
        }, { status: 409 });
      }
    }

    // 계약 fetch
    const cRef = db.ref(`${TENANT}/contracts/${id}`);
    const cSnap = await cRef.get();
    const contract = cSnap.val() as Contract | null;
    if (!contract) return NextResponse.json({ ok: false, error: 'contract not found' }, { status: 404 });

    // 멱등성 — 이미 처리된 경우
    if (config.alreadyDone?.(contract)) {
      return NextResponse.json({ ok: false, error: 'already done', message: '이미 처리된 액션입니다' }, { status: 409 });
    }

    // 변환 (#4 SSOT)
    const updated = config.transform(contract, date);

    // Optimistic Lock (#22)
    const txResult = await cRef.transaction((current: Contract | null) => {
      if (!current) return current;
      if (current.updatedAt && contract.updatedAt && current.updatedAt !== contract.updatedAt) {
        return; // abort
      }
      return { ...updated, updatedAt: new Date().toISOString(), updatedBy: actor.email };
    });
    if (!txResult.committed) {
      return NextResponse.json({ ok: false, error: 'lock_conflict', message: '다른 사용자가 먼저 수정했습니다' }, { status: 409 });
    }

    // Vehicle 마스터 sync (#11 부분)
    if (config.newVehicleStatus && updated.vehiclePlate) {
      try {
        const vehiclesSnap = await db.ref(`${TENANT}/vehicles`).get();
        const vMap = (vehiclesSnap.val() as Record<string, Vehicle> | null) ?? {};
        const vehicle = Object.values(vMap).find((v) => (v.plate ?? '').trim() === updated.vehiclePlate!.trim());
        if (vehicle && vehicle.status !== config.newVehicleStatus) {
          await db.ref(`${TENANT}/vehicles/${vehicle.id}`).update({
            status: config.newVehicleStatus,
            updatedAt: new Date().toISOString(),
            updatedBy: actor.email,
          });
        }
      } catch (e) {
        // contract 는 성공했는데 vehicle 실패 — inconsistency audit (Cloud Function 전 단계 보호)
        console.error('[performContractAction vehicle sync]', e);
        const auditRef = db.ref(`${TENANT}/audit_logs`).push();
        await auditRef.set({
          at: new Date().toISOString(),
          userId: actor.email,
          action: 'update',
          entity: 'vehicle',
          entityId: 'unknown',
          description: `[INCONSISTENCY] ${config.action} 후 vehicle sync 실패 — ${String((e as Error)?.message ?? e)}`,
        });
      }
    }

    // audit log
    const auditRef = db.ref(`${TENANT}/audit_logs`).push();
    await auditRef.set({
      at: new Date().toISOString(),
      userId: actor.email,
      action: 'update',
      entity: 'contract',
      entityId: id,
      description: config.description(contract, date),
    });

    return NextResponse.json({ ok: true, action: config.action, [config.dateField ?? 'date']: date });
  } catch (e) {
    console.error(`[contracts/${config.action}]`, e);
    return NextResponse.json({ ok: false, error: (e as Error).message ?? String(e) }, { status: 500 });
  }
}
