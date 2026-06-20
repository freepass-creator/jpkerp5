/**
 * 계약 상태 변경 SSOT — ERP #4 상태값 함수 통제.
 *
 * 직접 `c.status = '반납'` 같은 인라인 할당 금지.
 * 모든 상태 변경은 이 파일의 함수를 통해서만.
 *
 * 이유:
 *  · 상태 변경은 항상 부수효과를 동반 (vehicleStatus sync · audit · 일할 정산 · 회차 update)
 *  · 정책 변경 시 한 곳만 수정
 *  · 누가 호출했는지 매번 audit log 필요
 *
 * 사용 (UI):
 *   import { markReturned } from '@/lib/contract-actions';
 *   const updated = markReturned(c, today);
 *   await safeUpdate(() => syncContractAndVehicleStatus(updated, vehicles, updateContract, updateVehicleMaster));
 *
 * 이 파일은 pure (Firebase 호출 X). 호출자가 sync 함수에 넘김.
 */

import type { Contract } from './types';
import { applyReturnedProration } from './returned-proration';

/** 인도 — 운행 시작 */
export function markDelivered(c: Contract, deliveredDate: string): Contract {
  return {
    ...c,
    deliveredDate,
    status: '운행' as const,
    vehicleStatus: '운행' as const,
  };
}

/** 반납 — 운행 종료. 일할 자동 정산 (마지막 회차 prorate). */
export function markReturned(c: Contract, returnedDate: string): Contract {
  const prorated = applyReturnedProration(c, returnedDate);
  return {
    ...prorated,
    returnedDate,
    status: '반납' as const,
    vehicleStatus: '반납' as const,
  };
}

/** 해지 — 계약 비정상 종료. endReason='중도해지'. */
export function markTerminated(c: Contract, terminatedDate?: string): Contract {
  return {
    ...c,
    returnedDate: terminatedDate ?? c.returnedDate ?? new Date().toISOString().slice(0, 10),
    status: '해지' as const,
    endReason: '중도해지',
  };
}

/** 채권화 — 회수 불가 판정. endReason='채권보전'. */
export function markAsDebt(c: Contract): Contract {
  return {
    ...c,
    status: '채권' as const,
    endReason: '채권보전',
  };
}

/** 채권 해제 — 정상 운행으로 복귀 (잘못 채권 처리한 경우). */
export function cancelDebt(c: Contract): Contract {
  return {
    ...c,
    status: '운행' as const,
    endReason: undefined,
  };
}

/** 운행 복귀 — 종료(반납/해지) 후 잘못 종료 처리한 경우 되돌리기. */
export function revertToOperating(c: Contract): Contract {
  return {
    ...c,
    status: '운행' as const,
    vehicleStatus: '운행' as const,
    returnedDate: undefined,
    endReason: undefined,
  };
}
