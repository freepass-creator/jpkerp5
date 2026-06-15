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

export async function syncContractAndVehicleStatus(
  contract: Contract,
  vehicles: Vehicle[],
  updateContract: (c: Contract) => Promise<void> | void,
  updateVehicleMaster: (v: Vehicle) => Promise<void> | void,
): Promise<void> {
  await updateContract(contract);
  if (!contract.vehiclePlate || !contract.vehicleStatus) return;
  const plate = contract.vehiclePlate.trim();
  const v = vehicles.find((x) => (x.plate ?? '').trim() === plate);
  if (v && v.status !== contract.vehicleStatus) {
    await updateVehicleMaster({ ...v, status: contract.vehicleStatus });
  }
}
