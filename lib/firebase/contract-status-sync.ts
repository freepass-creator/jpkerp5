'use client';

/**
 * 계약 + 차량 마스터 상태 동기화 헬퍼.
 *
 * 웹·모바일 어디서 호출하든 동일 동작 보장:
 *  · contract.vehicleStatus 가 바뀌면 Vehicle 마스터(자산) status 도 자동 일치
 *
 * SSOT 정책 — feedback_jpkerp5_web_mobile_parity 에 명시된 "상태값 변경 양립" 구현체.
 *
 * 사용 예:
 *   const { vehicles, update: updateVehicleMaster } = useVehicles();
 *   const { update: updateContract } = useContracts();
 *   await syncContractAndVehicleStatus(updatedContract, vehicles, updateContract, updateVehicleMaster);
 */

import type { Contract, Vehicle } from '@/lib/types';
import { applyReturnedProration } from '@/lib/returned-proration';

export async function syncContractAndVehicleStatus(
  contract: Contract,
  vehicles: Vehicle[],
  updateContract: (c: Contract) => Promise<void> | void,
  updateVehicleMaster: (v: Vehicle) => Promise<void> | void,
): Promise<void> {
  // 반납 처리 시 마지막 회차 일할 자동 차감 — 어디서 반납하든(웹/모바일/dispatch) 동일하게 자동 적용
  let toWrite = contract;
  if (contract.returnedDate && (contract.status === '반납' || contract.vehicleStatus === '반납')) {
    toWrite = applyReturnedProration(contract, contract.returnedDate);
  }
  await updateContract(toWrite);
  if (!toWrite.vehiclePlate || !toWrite.vehicleStatus) return;
  const plate = toWrite.vehiclePlate.trim();
  const v = vehicles.find((x) => (x.plate ?? '').trim() === plate);
  if (v && v.status !== toWrite.vehicleStatus) {
    await updateVehicleMaster({ ...v, status: toWrite.vehicleStatus });
  }
}

// 역방향 (Vehicle → Contract) 동기화는 lib/entity-sync.ts 의
// syncContractStatusFromVehicle 이 이미 처리 (자산 페이지/매각/구매 사용 중).
