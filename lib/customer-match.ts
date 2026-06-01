/**
 * 손님 자가조회 — 차량번호 + 등록번호 매칭 + PII 마스킹.
 *
 * jpkerp5 Contract 타입 호환:
 *   - vehiclePlate (v4의 plate)
 *   - customerIdentNo (v4의 customerIdent)
 *   - customerPhone1 (v4의 customerPhone)
 *   - contractDate (v4의 startDate)
 *   - status: '대기'|'운행'|'반납'|'해지'|'채권'
 */

import type { Contract } from './types';

/** 차량번호 정규화 — 공백 제거 */
export function normalizePlate(plate: string): string {
  return (plate ?? '').replace(/\s/g, '').trim();
}

/** 식별번호 정규화 — 하이픈/공백 제거 후 숫자만 */
export function normalizeIdent(ident: string): string {
  return (ident ?? '').replace(/[\s-]/g, '').trim();
}

/**
 * 입력 ident가 계약과 매칭? — 4가지 중 하나라도 일치하면 OK.
 *
 *  · 생년월일 6자리 (YYMMDD) — 주민번호 앞 6자리와 비교
 *  · 사업자번호 10자리 — 정확 일치
 *  · 법인등록번호 13자리 — 정확 일치
 *  · 전화번호 — 정확 일치 (하이픈/공백 제거 후)
 */
export function matchesIdent(
  contract: Pick<Contract, 'customerIdentNo' | 'customerPhone1' | 'customerPhone2'>,
  input: string,
): boolean {
  const i = normalizeIdent(input);
  if (!i) return false;

  const ci = normalizeIdent(contract.customerIdentNo ?? '');
  const cp1 = normalizeIdent(contract.customerPhone1 ?? '');
  const cp2 = normalizeIdent(contract.customerPhone2 ?? '');

  // 정확 일치
  if (ci && ci === i) return true;
  if (cp1 && cp1 === i) return true;
  if (cp2 && cp2 === i) return true;

  // 생년월일 6자리 = 주민번호 앞 6자리
  if (i.length === 6 && ci.length === 13 && ci.slice(0, 6) === i) return true;

  return false;
}

/**
 * 차량번호 + 식별번호로 손님 계약 찾기.
 *
 * - vehiclePlate 정확 일치 + matchesIdent
 * - 운행 우선, 없으면 가장 최근 contractDate
 */
export function findCustomerContract(
  contracts: readonly Contract[],
  plate: string,
  ident: string,
): Contract | null {
  const p = normalizePlate(plate);
  const i = normalizeIdent(ident);
  if (!p || !i) return null;

  const matches = contracts.filter((c) => {
    if (normalizePlate(c.vehiclePlate ?? '') !== p) return false;
    return matchesIdent(c, ident);
  });
  if (matches.length === 0) return null;

  const STATUS_PRIORITY: Record<string, number> = {
    '운행': 0, '대기': 1, '반납': 2, '해지': 3, '채권': 4,
  };
  matches.sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 99;
    const pb = STATUS_PRIORITY[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    return (b.contractDate ?? '').localeCompare(a.contractDate ?? '');
  });
  return matches[0];
}

/* ───────── 마스킹 ───────── */

/** 등록번호 마스킹 — 주민번호 13자리: '880101-1******' / 사업자 10자리: 그대로 / 외 끝 4자리만 */
export function maskIdent(ident?: string): string {
  if (!ident) return '';
  const digits = normalizeIdent(ident);
  if (digits.length === 13) return `${digits.slice(0, 6)}-${digits.slice(6, 7)}******`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  if (digits.length <= 4) return digits;
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

/** 면허번호 마스킹 — 11-12-345678-90 → 11-12-******-90 */
export function maskLicense(license?: string): string {
  if (!license) return '';
  const parts = license.split('-');
  if (parts.length === 4) {
    return `${parts[0]}-${parts[1]}-******-${parts[3]}`;
  }
  if (license.length >= 8) {
    return `${license.slice(0, 4)}******${license.slice(-2)}`;
  }
  return license;
}

/** 전화번호 마스킹 — 010-1234-5678 → 010-****-5678 */
export function maskPhone(phone?: string): string {
  if (!phone) return '';
  const d = normalizeIdent(phone);
  if (d.length === 11) return `${d.slice(0, 3)}-****-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-***-${d.slice(6)}`;
  return phone.length >= 6 ? `${phone.slice(0, 3)}***${phone.slice(-2)}` : phone;
}

/** 주소 마스킹 — 시/도 + 시/군/구까지만 노출 */
export function maskAddress(address?: string): string {
  if (!address) return '';
  // 첫 두 토큰만 (시/도 + 시/군/구) 노출
  const tokens = address.split(/\s+/).filter(Boolean);
  if (tokens.length <= 2) return address;
  return `${tokens.slice(0, 2).join(' ')} ${'*'.repeat(6)}`;
}

/** 이름 마스킹 — 한글 첫 글자 + ** (예: 홍길동 → 홍**) */
export function maskName(name?: string): string {
  if (!name) return '';
  if (name.length <= 1) return name;
  return `${name[0]}${'*'.repeat(name.length - 1)}`;
}
