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
import { findVehicleByPlate } from '@/lib/entity-sync';
import { audit } from './audit-store';

/**
 * Multi-entity update — contract → vehicle 순서.
 *
 * ERP #11 (Transaction 원자성) 부분 보호:
 *  · contract 성공 + vehicle 실패 시 → audit log 로 inconsistency 추적
 *  · contract 실패 시 → vehicle 안 건드림 (rollback 효과)
 *  · 두 entity 모두 LockConflictError 발생 시 호출자 측 safeUpdate 가 토스트
 *
 * 완전 atomic 은 Firebase Cloud Functions 트리거에서 처리 (TODO).
 */
export async function syncContractAndVehicleStatus(
  contract: Contract,
  vehicles: Vehicle[],
  updateContract: (c: Contract) => Promise<void> | void,
  updateVehicleMaster: (v: Vehicle) => Promise<void> | void,
): Promise<void> {
  // 반납 처리 시 마지막 회차 일할 자동 차감 — 어디서 반납하든(웹/모바일/dispatch) 동일하게 자동 적용.
  // ※ status==='반납'(정상반납)만 환급. 해지/채권(회수)은 vehicleStatus='반납'이어도 환급 X (사용자 정책).
  //   과거 `|| vehicleStatus==='반납'` 조건은 markTerminated(해지, vehicleStatus='반납')를 잘못 환급시키는 함정이었음.
  let toWrite = contract;
  if (contract.returnedDate && contract.status === '반납') {
    toWrite = applyReturnedProration(contract, contract.returnedDate);
  }
  await updateContract(toWrite); // throw 가능 — 호출자 catch
  if (!toWrite.vehiclePlate || !toWrite.vehicleStatus) return;
  // plate 매칭 SSOT — raw trim 비교면 표기차이·번호변경 차량의 sync 가 조용히 빠짐
  const v = findVehicleByPlate(vehicles, toWrite.vehiclePlate);
  if (v && v.status !== toWrite.vehicleStatus) {
    try {
      await updateVehicleMaster({ ...v, status: toWrite.vehicleStatus });
    } catch (e) {
      // contract 는 성공했는데 vehicle 실패 — 데이터 불일치 (ERP #11 부분 위반)
      // audit 로 기록 → 운영자가 수동 정합성 회복 가능 + 향후 Cloud Function 트리거 도입
      void audit.update('vehicle', v.id,
        `[INCONSISTENCY] contract ${toWrite.contractNo} status=${toWrite.vehicleStatus} 적용 후 vehicle.status sync 실패`,
        { status: v.status },
        { status: toWrite.vehicleStatus, error: String((e as Error)?.message ?? e) },
      );
      throw e;
    }
  }
}

// 역방향 (Vehicle → Contract) 동기화는 lib/entity-sync.ts 의
// syncContractStatusFromVehicle 이 이미 처리 (자산 페이지/매각/구매 사용 중).
