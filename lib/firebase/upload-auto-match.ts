'use client';

/**
 * 업로드 자동 매칭 — 외부 API 없이 가능한 자동 매칭 로직.
 *
 * 매칭 단서:
 *  · audio: 파일명에서 추출한 전화번호 → customer.phone1/phone2 매칭
 *  · image: (Phase B-2) OCR로 차량번호/면허번호 추출 후 매칭 — 추후
 *  · document: 파일명 단서 (차량번호 등) — 추후
 *
 * 매칭 신뢰도:
 *  · high — 전화번호 완전 일치 (digit-only 비교)
 *  · medium — 일부 일치 (앞자리만)
 *  · none — 매칭 실패 → pending에 그대로
 */

import type { Contract, Vehicle } from '../types';
import { match as intakeMatch } from '@/lib/intake/match';

export type AutoMatchResult = {
  contractId: string;
  vehicleId?: string;
  customerKey?: string;
  confidence: 'high' | 'medium';
  reason: string;
};

/** 전화번호 → 디지트만 (010-1234-5678 → 01012345678) */
export function normalizePhone(s?: string): string {
  return (s ?? '').replace(/\D/g, '');
}

/**
 * 자동 매칭 시도 — lib/intake/match 위임 (Phase 1).
 *
 * 외부 API 시그니처·기본 동작 보존:
 *  · 'high' 일 때만 결과 반환 (medium/low 는 null — 기존 호출자가 pending 으로 보냄)
 *  · contractId required
 */
export function tryAutoMatch(opts: {
  kind: 'image' | 'audio' | 'document' | 'other';
  detectedPhone?: string;
  detectedPlate?: string;
  contracts: Contract[];
  vehicles: Array<{ id: string; plate?: string; plateHistory?: string[] }>;
}): AutoMatchResult | null {
  const { kind, detectedPhone, detectedPlate, contracts, vehicles } = opts;
  void kind; // 향후 분류별 추가 단서용

  const result = intakeMatch(
    { phone: detectedPhone, plate: detectedPlate },
    contracts,
    vehicles as Vehicle[],
  );
  if (result.confidence !== 'high' || !result.contractId) return null;
  return {
    contractId: result.contractId,
    vehicleId: result.vehicleId,
    customerKey: result.customerKey,
    confidence: 'high',
    reason: result.reason,
  };
}

/**
 * 이미지 OCR 호출 + 차량번호/면허번호 추출 — Phase B-2.
 *
 * subCategory → OCR kind 매핑:
 *  · license       → 'license' (면허번호, holder_name, resident_no)
 *  · registration  → 'vehicle_reg' (plate, vin, etc.)
 *  · insurance     → 'insurance_policy' (plate)
 *
 * 반환: { plate?, licenseNo?, holderName?, residentNo? } 또는 null.
 *
 * OCR 호출은 async + 시간 걸림 (3-5초). 호출자가 적절히 대기.
 */
export async function extractOcrHints(
  dataUrl: string,
  mimeType: string,
  subCategory: string,
): Promise<{ plate?: string; licenseNo?: string; holderName?: string; residentNo?: string } | null> {
  const kindMap: Record<string, string> = {
    license:      'license',
    registration: 'vehicle_reg',
    insurance:    'insurance_policy',
  };
  const ocrKind = kindMap[subCategory];
  if (!ocrKind) return null;

  // base64 부분만 추출
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  try {
    const res = await fetch('/api/ocr/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: ocrKind, imageBase64: base64, mimeType }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const fields = data?.fields ?? data ?? {};

    const plate = fields.plate ?? fields.vehicle_plate ?? fields.car_number;
    const licenseNo = fields.license_no;
    const holderName = fields.holder_name;
    const residentNo = fields.resident_no;
    if (!plate && !licenseNo) return null;
    return {
      plate: plate ? String(plate).trim() : undefined,
      licenseNo: licenseNo ? String(licenseNo).trim() : undefined,
      holderName: holderName ? String(holderName).trim() : undefined,
      residentNo: residentNo ? String(residentNo).trim() : undefined,
    };
  } catch {
    return null;
  }
}

/** 면허번호 → customer 매칭 */
export function findCustomerByLicenseNo(
  licenseNo: string,
  contracts: Contract[],
  vehicles: Array<{ id: string; plate?: string; plateHistory?: string[] }>,
): AutoMatchResult | null {
  const target = licenseNo.replace(/\D/g, '');
  if (target.length < 10) return null;
  const exact = contracts.find((c) => (c.customerLicenseNo ?? '').replace(/\D/g, '') === target);
  if (!exact) return null;
  const v = vehicles.find((vh) =>
    (vh.plate ?? '').trim() === (exact.vehiclePlate ?? '').trim()
    || (vh.plateHistory ?? []).some((p) => (p ?? '').trim() === (exact.vehiclePlate ?? '').trim()),
  );
  return {
    contractId: exact.id,
    vehicleId: v?.id,
    customerKey: (exact.customerIdentNo ?? '').replace(/\D/g, '') || undefined,
    confidence: 'high',
    reason: `면허번호 OCR ${licenseNo} 일치`,
  };
}
