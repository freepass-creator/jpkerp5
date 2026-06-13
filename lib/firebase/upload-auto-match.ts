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

import type { Contract } from '../types';

export type AutoMatchResult = {
  contractId: string;
  vehicleId?: string;
  customerKey?: string;
  confidence: 'high' | 'medium';
  reason: string;
};

/** 전화번호 → 디지트만 (010-1234-5678 → 01012345678) */
function normalizePhone(s?: string): string {
  return (s ?? '').replace(/\D/g, '');
}

/**
 * 자동 매칭 시도.
 *  · audio + 전화번호 추출 → 정확 일치하는 customer.phone1/phone2 찾음
 *  · 매칭되면 contractId 반환
 */
export function tryAutoMatch(opts: {
  kind: 'image' | 'audio' | 'document' | 'other';
  detectedPhone?: string;
  detectedPlate?: string;
  contracts: Contract[];
  vehicles: Array<{ id: string; plate?: string; plateHistory?: string[] }>;
}): AutoMatchResult | null {
  const { kind, detectedPhone, detectedPlate, contracts, vehicles } = opts;

  // 1. 전화번호 매칭 (audio + 파일명에서 추출됨)
  if (detectedPhone) {
    const target = normalizePhone(detectedPhone);
    if (target.length >= 7) {
      // 완전 일치 (high confidence)
      const exact = contracts.find((c) =>
        normalizePhone(c.customerPhone1) === target
        || normalizePhone(c.customerPhone2) === target,
      );
      if (exact) {
        const v = vehicles.find((vh) =>
          (vh.plate ?? '').trim() === (exact.vehiclePlate ?? '').trim()
          || (vh.plateHistory ?? []).some((p) => (p ?? '').trim() === (exact.vehiclePlate ?? '').trim()),
        );
        return {
          contractId: exact.id,
          vehicleId: v?.id,
          customerKey: (exact.customerIdentNo ?? '').replace(/\D/g, '') || undefined,
          confidence: 'high',
          reason: `전화번호 ${detectedPhone} 완전 일치`,
        };
      }
    }
  }

  // 2. 차량번호 매칭 (image OCR로 추출 시 — Phase B-2)
  if (detectedPlate) {
    const target = detectedPlate.trim();
    const matchedC = contracts.find((c) => (c.vehiclePlate ?? '').trim() === target);
    if (matchedC) {
      const v = vehicles.find((vh) =>
        (vh.plate ?? '').trim() === target
        || (vh.plateHistory ?? []).some((p) => (p ?? '').trim() === target),
      );
      return {
        contractId: matchedC.id,
        vehicleId: v?.id,
        customerKey: (matchedC.customerIdentNo ?? '').replace(/\D/g, '') || undefined,
        confidence: 'high',
        reason: `차량번호 ${target} 일치`,
      };
    }
  }

  void kind; // 추후 image/document 분류별 추가 매칭 단서
  return null;
}
