/**
 * 운전자격확인 단건 조회 — 한국교통안전공단 RIMS (통신규약 v1.21).
 *
 * POST /api/license/verify
 *   {
 *     licenseNo: "11-12-345678-90",   // 12자리, 하이픈 무관
 *     customerName: "홍길동",
 *     licenseType: "1종 보통",          // 또는 코드 "12"
 *     vehiclePlate: "01도9893",        // 미정이면 "99임9999"
 *     fromDate?: "2026-05-20",         // 기본: 오늘
 *     toDate?: "2026-05-20",           // 기본: 오늘 또는 계약 종료일
 *   }
 *   → { ok, status, rtnCode, rtnLabel, vhclIdntyCd, raw, ... }
 *
 * 인증 후 lib/rims.ts 의 verifyLicense 위임.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import {
  getRimsEnv,
  verifyLicense,
  normalizeLicenseNo,
  licenseTypeToCode,
  todayYYYYMMDD,
  isoToYYYYMMDD,
} from '@/lib/rims';

export const runtime = 'nodejs';
export const maxDuration = 30;

type Body = {
  licenseNo?: string;
  customerName?: string;
  licenseType?: string;
  vehiclePlate?: string;
  fromDate?: string;
  toDate?: string;
};

export async function POST(req: NextRequest) {
  const actor = await requireAuth();
  if (actor instanceof NextResponse) return actor;

  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 }); }

  const licenseNo = normalizeLicenseNo(body.licenseNo ?? '');
  const customerName = (body.customerName ?? '').trim();
  const vehiclePlate = (body.vehiclePlate ?? '').trim() || '99임9999';
  const licnConCode = licenseTypeToCode(body.licenseType);

  if (licenseNo.length !== 12) {
    return NextResponse.json({ ok: false, error: '면허번호는 12자리여야 합니다 (현재 ' + licenseNo.length + '자리)' }, { status: 400 });
  }
  if (!customerName) {
    return NextResponse.json({ ok: false, error: '계약자 이름(customerName) 필수' }, { status: 400 });
  }
  if (!licnConCode) {
    return NextResponse.json({ ok: false, error: '면허종별(licenseType) 필수 — 1종보통/2종보통 등 또는 코드' }, { status: 400 });
  }

  const fromDate = body.fromDate ? isoToYYYYMMDD(body.fromDate) : todayYYYYMMDD();
  const toDate = body.toDate ? isoToYYYYMMDD(body.toDate) : fromDate;

  const env = getRimsEnv();
  if (!env) {
    console.warn('[license] RIMS env 미설정 — mock 응답');
    return NextResponse.json({
      ok: false,
      mock: true,
      status: '확인불가',
      rtnMessage: 'RIMS_AUTH_KEY / RIMS_SECRET_KEY 미설정',
    });
  }

  try {
    const result = await verifyLicense(env, {
      licenseNo,
      residentName: customerName,
      licnConCode,
      fromDate,
      toDate,
      vhclRegNo: vehiclePlate,
      bizinfo: env.userId,
    });

    return NextResponse.json({
      ...result,
      // 화면에서 쓰기 좋게 추가 필드
      requested: { licenseNo, customerName, licnConCode, fromDate, toDate, vhclRegNo: vehiclePlate },
    });
  } catch (e) {
    console.error('[license verify]', e);
    return NextResponse.json({
      ok: false,
      status: '확인불가',
      error: (e as Error).message ?? String(e),
    });
  }
}
