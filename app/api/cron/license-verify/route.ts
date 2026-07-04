/**
 * 일일 면허번호 자동 재검증 cron — RIMS 통신규약 v1.21.
 *
 * GET /api/cron/license-verify
 *   ?dry=1   RTDB 미갱신, 결과만 리턴
 *
 * 매일 자정 자동 실행 (vercel.json).
 * 등록된 면허번호 전체를 RIMS 에 순차 호출 → 상태 변경 시 RTDB 갱신.
 * 정지/취소/만료/결격 발견 시 outcomes[].alert = true.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getAdminRtdb } from '@/lib/firebase/admin';
import type { Contract } from '@/lib/types';
import {
  getRimsEnv,
  verifyLicense,
  normalizeLicenseNo,
  licenseTypeToCode,
  todayYYYYMMDD,
  isoToYYYYMMDD,
} from '@/lib/rims';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5분

type Outcome = {
  contractId: string;
  contractNo: string;
  customerName: string;
  licenseNo: string;
  before?: string;
  after?: string;
  rtnCode?: string;
  rtnLabel?: string;
  changed: boolean;
  alert: boolean;
  error?: string;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1';

  // cron 인증 — CRON_SECRET 설정 시 Bearer 값 대조 (헤더 존재만 확인하던 우회 제거).
  // 미설정이면 Vercel cron 헤더 존재 시 허용(현행 유지 — 운영 cron 이 매일 돌고 있어 차단 시 장애)
  // + 경고 로그. env 등록 후 이 fallback 을 제거할 것.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ ok: false, error: 'unauthorized cron' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.error('[cron] CRON_SECRET 미설정 — 서명 검증 없이 동작 중. Vercel env 등록 필요.');
    if (!req.headers.get('x-vercel-cron-signature')) {
      return NextResponse.json({ ok: false, error: 'unauthorized cron' }, { status: 401 });
    }
  }

  const env = getRimsEnv();
  if (!env) {
    return NextResponse.json({
      ok: false,
      error: 'RIMS env 미설정 — RIMS_AUTH_KEY / RIMS_SECRET_KEY 등록 필요',
    });
  }

  let contracts: Record<string, Contract>;
  try {
    const snap = await getAdminRtdb().ref('v5/contracts').once('value');
    contracts = snap.val() ?? {};
  } catch (e) {
    return NextResponse.json({ ok: false, error: `RTDB 읽기 실패: ${(e as Error).message}` }, { status: 500 });
  }

  const targets = Object.entries(contracts).filter(
    ([, c]) => c.customerLicenseNo && c.status !== '해지',
  );

  const outcomes: Outcome[] = [];
  let updated = 0;
  let alerts = 0;
  const today = todayYYYYMMDD();

  // 순차 호출 (RIMS 호출량 보호)
  for (const [id, c] of targets) {
    const licenseNo = normalizeLicenseNo(c.customerLicenseNo!);
    const licnConCode = licenseTypeToCode(c.customerLicenseType);

    if (licenseNo.length !== 12) {
      outcomes.push({
        contractId: id,
        contractNo: c.contractNo,
        customerName: c.customerName,
        licenseNo: c.customerLicenseNo!,
        before: c.customerLicenseStatus,
        after: '확인불가',
        changed: false,
        alert: false,
        error: `면허번호 자릿수 오류 (${licenseNo.length}자리)`,
      });
      continue;
    }
    if (!licnConCode) {
      outcomes.push({
        contractId: id,
        contractNo: c.contractNo,
        customerName: c.customerName,
        licenseNo: c.customerLicenseNo!,
        before: c.customerLicenseStatus,
        after: '확인불가',
        changed: false,
        alert: false,
        error: '면허종별 미설정 (customerLicenseType)',
      });
      continue;
    }

    // 검증 기간: 오늘 ~ 계약 종료일 (없으면 오늘)
    const toDate = c.returnScheduledDate ? isoToYYYYMMDD(c.returnScheduledDate) : today;
    const vhclRegNo = c.vehiclePlate || '99임9999';

    try {
      // 법인 계약이면 주운전자명, 아니면 계약자명
      const residentName = c.customerKind === '법인' ? (c.driverName ?? '') : c.customerName;

      const result = await verifyLicense(env, {
        licenseNo,
        residentName,
        licnConCode,
        fromDate: today,
        toDate: toDate >= today ? toDate : today,
        vhclRegNo,
        bizinfo: env.userId,
      });

      const before = c.customerLicenseStatus;
      const after = result.status;
      const changed = before !== after;
      const alert = ['정지', '취소', '만료', '결격'].includes(after);

      outcomes.push({
        contractId: id,
        contractNo: c.contractNo,
        customerName: c.customerName,
        licenseNo: c.customerLicenseNo!,
        before,
        after,
        rtnCode: result.rtnCode,
        rtnLabel: result.rtnLabel,
        changed,
        alert,
        error: result.rtnMessage,
      });

      if (alert) alerts++;

      if (changed && !dry) {
        await getAdminRtdb().ref(`v5/contracts/${id}`).update({
          customerLicenseStatus: after,
          customerLicenseCheckedAt: new Date().toISOString(),
        });
        updated++;
      }
    } catch (e) {
      outcomes.push({
        contractId: id,
        contractNo: c.contractNo,
        customerName: c.customerName,
        licenseNo: c.customerLicenseNo!,
        before: c.customerLicenseStatus,
        after: '확인불가',
        changed: false,
        alert: false,
        error: (e as Error).message ?? String(e),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    dry,
    targets: targets.length,
    updated,
    alerts,
    outcomes,
    ranAt: new Date().toISOString(),
  });
}
