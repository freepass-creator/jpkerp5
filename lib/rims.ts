/**
 * 한국교통안전공단 RIMS — 운전자격확인 API 클라이언트.
 *
 * 공식 통신규약: 운전자격확인시스템(RIMS) Ver.1.21 (2024.11.08).
 *
 * 흐름:
 *   1. 인증키 + Basic Auth 로 OAuth2 토큰 발급 (3시간 유효)
 *   2. Secret Key 로 요청 바디 AES/ECB/PKCS5 암호화 → Base64 → { encryptedData: "..." }
 *   3. Bearer 토큰 헤더로 운전자격확인 API 호출
 *
 * Env (.env.local):
 *   RIMS_AUTH_KEY        인증키 (토큰 발급용 Basic Auth)
 *   RIMS_SECRET_KEY      비밀키 (Body AES 암호화)
 *   RIMS_BASE_URL        기본값 https://rims.kotsa.or.kr:8114
 *   RIMS_USER_ID         사용자ID (bizinfo, 선택)
 */

import 'server-only';
import crypto from 'node:crypto';

const DEFAULT_BASE = 'https://rims.kotsa.or.kr:8114';

const TOKEN_TTL_MS = 3 * 60 * 60 * 1000 - 5 * 60 * 1000; // 3시간 - 5분 안전 마진

let cachedToken: { token: string; issuedAt: number } | null = null;

export type RimsEnv = {
  authKey: string;
  secretKey: string;
  baseUrl: string;
  userId?: string;
};

export function getRimsEnv(): RimsEnv | null {
  const authKey = process.env.RIMS_AUTH_KEY ?? process.env.RIMS_API_KEY; // 호환
  const secretKey = process.env.RIMS_SECRET_KEY;
  const baseUrl = process.env.RIMS_BASE_URL ?? DEFAULT_BASE;
  const userId = process.env.RIMS_USER_ID;
  if (!authKey || !secretKey) return null;
  return { authKey, secretKey, baseUrl, userId };
}

/* ──────────────── 토큰 ──────────────── */

export async function getRimsToken(env: RimsEnv, force = false): Promise<string> {
  if (!force && cachedToken && Date.now() - cachedToken.issuedAt < TOKEN_TTL_MS) {
    return cachedToken.token;
  }

  const url = `${env.baseUrl}/col/oauth2?grantType=password`;
  const basic = Buffer.from(env.authKey, 'utf8').toString('base64');

  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Basic ${basic}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`RIMS 토큰 발급 실패 — HTTP ${res.status} ${text.slice(0, 200)}`);
  }

  // Authorization 헤더에 "Bearer <토큰>" 형태로 돌아옴
  const authHeader = res.headers.get('authorization') ?? res.headers.get('Authorization') ?? '';
  let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();

  // Body 에 들어 있는 경우도 대비 (스펙 외 호환)
  if (!token) {
    try {
      const body = await res.json();
      token = body.access_token ?? body.token ?? body.Authorization ?? '';
      if (typeof token === 'string' && token.startsWith('Bearer ')) token = token.slice(7).trim();
    } catch {}
  }

  if (!token) throw new Error('RIMS 토큰 발급 응답에서 토큰을 추출할 수 없음');

  cachedToken = { token, issuedAt: Date.now() };
  return token;
}

/* ──────────────── AES/ECB/PKCS5 암호화 ──────────────── */

/**
 * Secret Key 의 UTF-8 바이트를 32바이트로 패딩/잘라 AES-256 키로 사용.
 * Java 예시: Arrays.copyOf(secretKey.getBytes(UTF_8), 32) — 부족하면 0 패딩, 넘치면 잘라냄.
 */
function deriveAesKey(secretKey: string): Buffer {
  const out = Buffer.alloc(32);
  const src = Buffer.from(secretKey, 'utf8');
  src.copy(out, 0, 0, Math.min(src.length, 32));
  return out;
}

export function encryptBody(plaintextJson: string, secretKey: string): string {
  const key = deriveAesKey(secretKey);
  const cipher = crypto.createCipheriv('aes-256-ecb', key, null);
  cipher.setAutoPadding(true); // PKCS5 = PKCS7 in Node
  const encrypted = Buffer.concat([
    cipher.update(plaintextJson, 'utf8'),
    cipher.final(),
  ]);
  return encrypted.toString('base64');
}

export function decryptBody(base64Cipher: string, secretKey: string): string {
  const key = deriveAesKey(secretKey);
  const decipher = crypto.createDecipheriv('aes-256-ecb', key, null);
  decipher.setAutoPadding(true);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(base64Cipher, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/* ──────────────── 코드 매핑 ──────────────── */

/** 면허 종별 코드 (4.4) */
export const LICENSE_TYPE_CODES = {
  '1종대형': '11',
  '1종보통': '12',
  '1종소형': '13',
  '대형견인차': '14',
  '구난차': '15',
  '소형견인차': '16',
  '2종보통': '32',
  '2종소형': '33',
  '2종원동기': '38',
  '2종원자': '38',
} as const;

/** OCR 결과 ("1종 보통", "2종 보통") → "12" / "32" 변환 */
export function licenseTypeToCode(typeText?: string): string | undefined {
  if (!typeText) return undefined;
  const normalized = typeText.replace(/\s+/g, '');
  for (const [label, code] of Object.entries(LICENSE_TYPE_CODES)) {
    if (normalized.includes(label)) return code;
  }
  // 직접 코드 입력한 경우
  if (/^\d{2}$/.test(normalized)) return normalized;
  return undefined;
}

/** 지역 코드 (4.5) */
export const REGION_CODES: Record<string, string> = {
  '서울': '11', '부산': '12', '경기': '13', '경기남부': '13', '강원': '14',
  '충북': '15', '충남': '16', '전북': '17', '전남': '18', '경북': '19',
  '경남': '20', '제주': '21', '대구': '22', '인천': '23', '광주': '24',
  '대전': '25', '울산': '26', '경기북부': '28',
};

/**
 * 면허번호 정규화 — 12자리 숫자만 반환.
 * "11-12-345678-90" → "111234567890"
 * "서울 11-12-345678-90" → "111234567890" (지역명이 이미 코드에 반영돼 있음)
 * "11 12345678 90" → "111234567890"
 */
export function normalizeLicenseNo(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();
  // 지역명이 앞에 있으면 코드로 치환 (그래도 12자리 채우려면 원래 11번부터 시작해야 함)
  for (const [name, code] of Object.entries(REGION_CODES)) {
    if (s.startsWith(name)) {
      s = code + s.slice(name.length);
      break;
    }
  }
  return s.replace(/\D/g, '').slice(0, 12);
}

/** 면허정보 응답 코드 (4.2) → 한글 사유 */
export const LICENSE_RTN_LABELS: Record<string, string> = {
  '00': '정상',
  '01': '면허번호 없음',
  '02': '재발급된 면허',
  '03': '분실 면허',
  '04': '사망취소 면허',
  '11': '취소 면허',
  '12': '정지 면허',
  '13': '기간 중 취소',
  '14': '기간 중 정지',
  '21': '정보불일치(이름)',
  '22': '정보불일치(생년월일)',
  '23': '정보불일치(암호일련번호)',
  '24': '정보불일치(종별)',
  '25': '필수값 누락(대여기간)',
  '31': '암호화 안 된 면허',
};

/** 요청처리 응답 코드 (4.3) → 한글 사유 */
export const REQUEST_RTN_LABELS: Record<string, string> = {
  '0': '처리 완료',
  '1': '인증 정보 없음',
  '2': '잘못된 인증 정보',
  '3': '인증 실패',
  '4': '만료된 토큰',
  '10': '잘못된 경로 (IP 미등록)',
  '20': '복호화 키 없음',
  '21': '메시지 복호화 실패',
  '22': '메시지 암호화 실패',
  '40': '수수료 결제 정보 없음',
  '41': '수수료 결제 오류',
  '97': '자동 검증 시스템 작업 장애',
  '98': '경찰청 운전면허 조회 장애',
  '99': '자동 검증 시스템 장애',
};

/** f_rtn_code → 우리 시스템의 status */
export function mapLicenseStatus(rtnCode: string): '정상' | '정지' | '취소' | '만료' | '결격' | '확인불가' {
  if (rtnCode === '00') return '정상';
  if (rtnCode === '12' || rtnCode === '14') return '정지';
  if (rtnCode === '11' || rtnCode === '13' || rtnCode === '04') return '취소';
  if (rtnCode === '01') return '결격'; // 면허번호 없음
  if (rtnCode === '02' || rtnCode === '03') return '결격'; // 재발급/분실
  return '확인불가';
}

/* ──────────────── 운전자격확인 단건 ──────────────── */

export type VerifyRequest = {
  licenseNo: string;        // 12자리
  residentName: string;
  licnConCode: string;      // "12" 등 면허종별 코드
  fromDate: string;         // YYYYMMDD (오늘 이후)
  toDate: string;
  vhclRegNo: string;        // 차량번호 또는 "99임9999"
  bizinfo?: string;
};

export type VerifyResponse = {
  ok: boolean;
  status: '정상' | '정지' | '취소' | '만료' | '결격' | '확인불가';
  rtnCode?: string;
  rtnLabel?: string;
  rtnMessage?: string;
  vhclIdntyCd?: string;
  vhclIdntyLabel?: string;
  licenseNoMasked?: string;
  raw?: unknown;
};

export async function verifyLicense(
  env: RimsEnv,
  req: VerifyRequest,
): Promise<VerifyResponse> {
  const token = await getRimsToken(env);

  const bodyObj: Record<string, string> = {
    f_license_no: req.licenseNo,
    f_resident_name: req.residentName,
    f_licn_con_code: req.licnConCode,
    f_from_date: req.fromDate,
    f_to_date: req.toDate,
    vhcl_reg_no: req.vhclRegNo,
  };
  if (req.bizinfo) bodyObj.bizinfo = req.bizinfo;

  const encryptedData = encryptBody(JSON.stringify(bodyObj), env.secretKey);

  const url = `${env.baseUrl}/licenseVerification`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ encryptedData }),
    cache: 'no-store',
  });

  // 401 → 토큰 만료 가능성, 한 번 재발급 후 재시도
  if (res.status === 401) {
    const fresh = await getRimsToken(env, true);
    const retry = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${fresh}`,
      },
      body: JSON.stringify({ encryptedData }),
      cache: 'no-store',
    });
    return parseVerifyResponse(retry);
  }

  return parseVerifyResponse(res);
}

async function parseVerifyResponse(res: Response): Promise<VerifyResponse> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return {
      ok: false,
      status: '확인불가',
      rtnMessage: `HTTP ${res.status} ${text.slice(0, 200)}`,
    };
  }
  let raw: Record<string, unknown> = {};
  try { raw = await res.json(); } catch { /* noop */ }

  // 공통 오류 (respCode/errorMsg) 우선 처리
  if (typeof raw.respCode === 'number' && raw.respCode < 0) {
    return {
      ok: false,
      status: '확인불가',
      rtnMessage: `${raw.respCode} ${raw.errorMsg ?? ''}`.trim(),
      raw,
    };
  }

  const header = (raw.header ?? {}) as Record<string, string>;
  const body = (raw.body ?? {}) as Record<string, string>;

  const f_rtn_cd = String(header.f_rtn_cd ?? '');
  if (f_rtn_cd !== '0') {
    return {
      ok: false,
      status: '확인불가',
      rtnMessage: REQUEST_RTN_LABELS[f_rtn_cd] ?? header.f_rtn_msg ?? `요청처리 ${f_rtn_cd}`,
      raw,
    };
  }

  const f_rtn_code = String(body.f_rtn_code ?? '');
  const status = mapLicenseStatus(f_rtn_code);
  return {
    ok: f_rtn_code === '00',
    status,
    rtnCode: f_rtn_code,
    rtnLabel: LICENSE_RTN_LABELS[f_rtn_code] ?? `코드 ${f_rtn_code}`,
    vhclIdntyCd: body.vhcl_idnty_cd,
    vhclIdntyLabel: body.vhcl_idnty_cd === '1' ? '차량 확인' : body.vhcl_idnty_cd === '2' ? '차량 미확인' : undefined,
    licenseNoMasked: body.f_license_no,
    raw,
  };
}

/** YYYYMMDD (오늘) */
export function todayYYYYMMDD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

/** YYYY-MM-DD → YYYYMMDD */
export function isoToYYYYMMDD(iso: string): string {
  return (iso ?? '').replace(/-/g, '').slice(0, 8);
}
