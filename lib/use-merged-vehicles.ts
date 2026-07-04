'use client';

/**
 * 자산 페이지에서 사용하는 통합 vehicle list — vehicles 마스터 + 계약 derived.
 *
 *  · rawVehicles: vehicles 마스터 노드 (등록증 입력된 자산)
 *  · contracts: 차량번호 있는 계약 중 vehicles 에 없는 것은 'contract-derived-{id}' 로 임시 생성
 *  · 운영현황·자산·보험·구매방식·수선·GPS·처분 모두 같은 list 봄.
 */

import { useMemo } from 'react';
import { useVehicles } from './firebase/vehicles-store';
import { useContracts } from './firebase/contracts-store';
import { normPlate } from './entity-sync';
import type { Vehicle } from './types';

export function useMergedVehicles(): { vehicles: Vehicle[]; rawVehicles: Vehicle[]; loading: boolean } {
  const { vehicles: rawVehicles, loading: vehicleLoading } = useVehicles();
  const { contracts, loading: contractLoading } = useContracts();

  const vehicles = useMemo<Vehicle[]>(() => buildMergedVehicles(rawVehicles, contracts), [rawVehicles, contracts]);

  return { vehicles, rawVehicles, loading: vehicleLoading || contractLoading };
}

/**
 * 병합 로직 SSOT — 자산 페이지의 인라인 복제 제거용 export.
 *  · 키 = normPlate ('01도 9893' vs '01도9893' 표기 차이로 같은 차 2행 생기던 것 방지)
 *  · 마스터의 번호변경 이력(plateHistory)도 등록으로 간주 — 구번호 계약이 유령 합성행 안 만듦
 *  · 같은 plate 계약 여러 건이면 계약일 최신 계약이 합성행 대표 (배열 순서 의존 제거)
 */
export function buildMergedVehicles(
  rawVehicles: Vehicle[],
  contracts: Array<{ id: string; vehiclePlate?: string; vehicleModel?: string; company?: Vehicle['company']; vehicleStatus?: string; contractDate?: string }>,
): Vehicle[] {
  const byPlate = new Map<string, Vehicle>();
  for (const v of rawVehicles) {
    const p = normPlate(v.plate);
    if (p) byPlate.set(p, v);
    for (const h of v.plateHistory ?? []) {
      const hp = normPlate(h);
      if (hp && !byPlate.has(hp)) byPlate.set(hp, v);   // 구번호도 이 차량으로 매핑
    }
  }
  // 계약일 최신 우선 — 같은 plate 재계약 시 최신 계약이 합성행 대표
  const sorted = [...contracts].sort((a, b) => (b.contractDate ?? '').localeCompare(a.contractDate ?? ''));
  for (const c of sorted) {
    const p = normPlate(c.vehiclePlate);
    if (!p || byPlate.has(p)) continue;
    byPlate.set(p, {
      id: `contract-derived-${c.id}`,
      plate: (c.vehiclePlate ?? '').trim(),
      model: c.vehicleModel ?? '',
      company: c.company,
      status: (c.vehicleStatus ?? '운행') as Vehicle['status'],
      createdAt: c.contractDate ?? '',
      notes: '계약에서 자동 인식 — 등록증 정보 미입력',
    } as Vehicle);
  }
  // 이력 매핑으로 같은 Vehicle 이 여러 키에 걸린 경우 id 기준 dedup
  const seen = new Set<string>();
  const out: Vehicle[] = [];
  for (const v of byPlate.values()) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    out.push(v);
  }
  return out;
}
