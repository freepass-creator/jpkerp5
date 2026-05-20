/**
 * 일일 면허번호 자동 재검증 cron.
 *
 * 호출 방식:
 *   GET /api/cron/license-verify           (Vercel Cron 또는 수동 호출)
 *   GET /api/cron/license-verify?dry=1     (RTDB 미갱신, 결과만 리턴)
 *
 * 보호:
 *   Vercel Cron 호출은 헤더 `x-vercel-cron-signature` 검증 (배포 시).
 *   로컬/수동 호출은 Bearer Firebase ID token (관리자 가드는 라우트가 아닌 호출 페이지에서).
 *
 * 동작:
 *   1. /icar001/contracts 전체 읽기
 *   2. customerLicenseNo 있는 계약만 RIMS 조회
 *   3. status/expiry 변경되면 RTDB 갱신
 *   4. 정지/취소/만료 발견 시 알림 list 리턴 (UI 에서 SMS 발송 트리거 가능)
 *
 * Vercel 설정 (vercel.json):
 *   { "crons": [{ "path": "/api/cron/license-verify", "schedule": "0 9 * * *" }] }
 *   매일 오전 9시 (UTC 0시 = KST 9시 차이는 별도 조정)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getAdminRtdb } from '@/lib/firebase/admin';
import type { Contract } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5분 — 100건+ 처리

type RimsResult = {
  ok: boolean;
  status?: '정상' | '정지' | '취소' | '만료' | '결격' | '확인불가';
  licenseType?: string;
  expiryDate?: string;
  holderName?: string;
  mock?: boolean;
  raw?: Record<string, unknown>;
};

type Outcome = {
  contractId: string;
  contractNo: string;
  customerName: string;
  licenseNo: string;
  before?: string;
  after?: string;
  changed: boolean;
  alert: boolean;     // 정지/취소/만료/결격 → 운영 알림 필요
  error?: string;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1';

  // Vercel Cron 시그니처 또는 수동 토큰 — production 배포 시 강화
  const cronSig = req.headers.get('x-vercel-cron-signature');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && !cronSig && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized cron' }, { status: 401 });
  }

  let contracts: Record<string, Contract>;
  try {
    const snap = await getAdminRtdb().ref('icar001/contracts').once('value');
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

  // RIMS 호출 — 순차 (rate limit 보호). 동시성 필요하면 RIMS 명세 받은 후 batch 모드 사용.
  for (const [id, c] of targets) {
    const result = await callVerify({
      licenseNo: c.customerLicenseNo!,
      customerName: c.customerName,
      birth: c.customerRegNoMasked,
    });

    const before = c.customerLicenseStatus;
    const after = result.status ?? '확인불가';
    const changed = before !== after;
    const alert = ['정지', '취소', '만료', '결격'].includes(after);

    outcomes.push({
      contractId: id,
      contractNo: c.contractNo,
      customerName: c.customerName,
      licenseNo: c.customerLicenseNo!,
      before,
      after,
      changed,
      alert,
      error: result.ok ? undefined : (result.raw?.error as string | undefined),
    });

    if (alert) alerts++;

    if (changed && !dry && !result.mock) {
      try {
        await getAdminRtdb().ref(`icar001/contracts/${id}`).update({
          customerLicenseStatus: after,
          customerLicenseCheckedAt: new Date().toISOString(),
          customerLicenseExpiry: result.expiryDate ?? c.customerLicenseExpiry ?? null,
          customerLicenseType: result.licenseType ?? c.customerLicenseType ?? null,
        });
        updated++;
      } catch (e) {
        console.error('[license cron]', id, e);
      }
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

async function callVerify(p: { licenseNo: string; customerName: string; birth?: string }): Promise<RimsResult> {
  const apiKey = process.env.RIMS_API_KEY;
  const secret = process.env.RIMS_SECRET_KEY;
  const verifyUrl = process.env.RIMS_VERIFY_URL;

  if (!apiKey || !secret || !verifyUrl) {
    return { ok: false, mock: true, status: '확인불가', raw: { error: 'RIMS env/endpoint 미설정' } };
  }

  try {
    const res = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-Secret-Key': secret,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ license_no: p.licenseNo, name: p.customerName, birth: p.birth }),
    });
    const raw = await res.json().catch(() => ({}));
    return {
      ok: res.ok && (raw.code === 0 || raw.code === '0' || raw.result === 'SUCCESS'),
      status: mapStatus(raw),
      licenseType: raw.license_type ?? raw.licenseType,
      expiryDate: raw.expiry_date ?? raw.expiryDate,
      holderName: raw.holder_name ?? raw.holderName,
      raw,
    };
  } catch (e) {
    return { ok: false, status: '확인불가', raw: { error: (e as Error).message ?? String(e) } };
  }
}

function mapStatus(raw: Record<string, unknown>): RimsResult['status'] {
  const s = String(raw.status ?? raw.license_status ?? '').toLowerCase();
  if (s.includes('정상') || s === 'valid' || s === 'active') return '정상';
  if (s.includes('정지') || s === 'suspended') return '정지';
  if (s.includes('취소') || s === 'cancelled' || s === 'canceled') return '취소';
  if (s.includes('만료') || s === 'expired') return '만료';
  if (s.includes('결격')) return '결격';
  return '확인불가';
}
