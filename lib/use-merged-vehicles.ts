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
import type { Vehicle } from './types';

export function useMergedVehicles(): { vehicles: Vehicle[]; rawVehicles: Vehicle[]; loading: boolean } {
  const { vehicles: rawVehicles, loading: vehicleLoading } = useVehicles();
  const { contracts, loading: contractLoading } = useContracts();

  const vehicles = useMemo<Vehicle[]>(() => {
    const byPlate = new Map<string, Vehicle>();
    for (const v of rawVehicles) {
      const p = v.plate?.trim();
      if (p) byPlate.set(p, v);
    }
    for (const c of contracts) {
      const p = c.vehiclePlate?.trim();
      if (!p || byPlate.has(p)) continue;
      byPlate.set(p, {
        id: `contract-derived-${c.id}`,
        plate: p,
        model: c.vehicleModel ?? '',
        company: c.company,
        status: (c.vehicleStatus ?? '운행') as Vehicle['status'],
        createdAt: c.contractDate ?? '',
        notes: '계약에서 자동 인식 — 등록증 정보 미입력',
      } as Vehicle);
    }
    return Array.from(byPlate.values());
  }, [rawVehicles, contracts]);

  return { vehicles, rawVehicles, loading: vehicleLoading || contractLoading };
}
