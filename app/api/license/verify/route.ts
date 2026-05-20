/**
 * 면허번호 정상여부 조회 — 한국교통안전공단 운전자격확인시스템 (RIMS).
 *
 * POST /api/license/verify
 *   { licenseNo, customerName, birth?(YYYY-MM-DD) }
 *   → { ok, status, expiryDate, licenseType, raw }
 *
 * Env:
 *   RIMS_API_KEY       인증키 (필수)
 *   RIMS_SECRET_KEY    비밀키 (필수)
 *   RIMS_VERIFY_URL    실제 RIMS 조회 endpoint (RIMS 로그인 후 받은 API 명세 URL).
 *                      비어 있으면 mock 응답 — 코드 흐름은 막지 않음.
 *
 * 정식 명세를 받을 때까지는 mock 모드로 동작.
 * 명세 입수 후 callRimsApi() 본문의 URL/헤더/바디만 교체하면 됨.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const maxDuration = 30;

type Body = {
  licenseNo?: string;     // 면허번호 (예: 11-12-345678-90)
  customerName?: string;  // 본인확인용 — RIMS 명의와 비교
  birth?: string;         // YYYY-MM-DD (선택, 본인확인 강화용)
};

type RimsResult = {
  ok: boolean;
  status?: '정상' | '정지' | '취소' | '만료' | '결격' | '확인불가';
  licenseType?: string;   // 1종 보통 / 2종 보통 등
  expiryDate?: string;    // YYYY-MM-DD
  issueDate?: string;
  holderName?: string;    // RIMS 명의 (마스킹 가능)
  mock?: boolean;
  raw?: Record<string, unknown>;
  error?: string;
};

export async function POST(req: NextRequest) {
  const actor = await requireAuth();
  if (actor instanceof NextResponse) return actor;

  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 }); }

  const licenseNo = (body.licenseNo ?? '').replace(/[^\dA-Z]/gi, '');
  const customerName = (body.customerName ?? '').trim();

  if (!licenseNo) {
    return NextResponse.json({ ok: false, error: 'licenseNo required' }, { status: 400 });
  }

  const apiKey = process.env.RIMS_API_KEY;
  const secret = process.env.RIMS_SECRET_KEY;
  const verifyUrl = process.env.RIMS_VERIFY_URL;

  if (!apiKey || !secret) {
    console.warn('[license] RIMS_* env 미설정 — mock 응답');
    return NextResponse.json(mockResponse(licenseNo, customerName, 'RIMS_API_KEY/SECRET 미설정'));
  }

  if (!verifyUrl) {
    console.warn('[license] RIMS_VERIFY_URL 미설정 — mock 응답 (API 명세 입수 후 endpoint 입력 필요)');
    return NextResponse.json(mockResponse(licenseNo, customerName, 'RIMS API 명세 endpoint 미설정'));
  }

  try {
    const result = await callRimsApi({ apiKey, secret, verifyUrl, licenseNo, customerName, birth: body.birth });
    return NextResponse.json(result);
  } catch (e) {
    console.error('[license verify]', e);
    return NextResponse.json({ ok: false, error: (e as Error).message ?? String(e) });
  }
}

/**
 * RIMS API 호출 — 실 명세 입수 후 endpoint/헤더/바디 형식만 교체.
 * 공공기관 API 표준 패턴 추정 (Authorization + JSON body).
 */
async function callRimsApi(p: {
  apiKey: string; secret: string; verifyUrl: string;
  licenseNo: string; customerName: string; birth?: string;
}): Promise<RimsResult> {
  const res = await fetch(p.verifyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': p.apiKey,
      'X-Secret-Key': p.secret,
      Authorization: `Bearer ${p.apiKey}`,
    },
    body: JSON.stringify({
      license_no: p.licenseNo,
      name: p.customerName,
      birth: p.birth,
    }),
  });
  const raw = await res.json().catch(() => ({}));

  return {
    ok: res.ok && (raw.code === 0 || raw.code === '0' || raw.result === 'SUCCESS'),
    status: mapStatus(raw),
    licenseType: raw.license_type ?? raw.licenseType,
    expiryDate: raw.expiry_date ?? raw.expiryDate,
    issueDate: raw.issue_date ?? raw.issueDate,
    holderName: raw.holder_name ?? raw.holderName,
    raw,
  };
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

function mockResponse(licenseNo: string, name: string, reason: string): RimsResult {
  return {
    ok: false,
    mock: true,
    status: '확인불가',
    error: reason,
    raw: { licenseNo, name, hint: 'RIMS API 명세 입수 후 .env.local 의 RIMS_VERIFY_URL 채우면 실제 조회됨' },
  };
}
