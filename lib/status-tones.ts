/**
 * 도메인 상태 → StatusBadge tone 매핑 — 모든 페이지 동일.
 *
 * 기능 통일: 같은 의미는 같은 색.
 *   ContractStatus '운행' / VehicleStatus '운행'  →  green (활성)
 *   ContractStatus '채권' / '해지'                →  red (문제·종료)
 *   VehicleStatus '매각' / '매각대기'              →  gray (terminal)
 *
 * 사용:
 *   <StatusBadge tone={contractStatusTone(c.status)}>{c.status}</StatusBadge>
 */

import type { ContractStatus, VehicleStatus, ScheduleStatus } from '@/lib/types';
import type { VehicleState, ContractState, PaymentState } from '@/lib/contract-stage';
import type { BadgeTone } from '@/components/ui/status-badge';

export function contractStatusTone(status: ContractStatus | undefined): BadgeTone {
  switch (status) {
    case '운행':   return 'green';
    case '대기':   return 'blue';
    case '반납':   return 'gray';
    case '해지':   return 'gray';
    case '채권':   return 'red';
    default:       return 'neutral';
  }
}

/** 운영현황 3종 도메인 state — contract-stage.ts 의 getVehicleState/Contract/Payment 결과 */

export function vehicleStateTone(name: VehicleState | undefined): BadgeTone {
  switch (name) {
    case '운행중':       return 'green';
    case '구매대기':
    case '등록대기':
    case '상품화중':
    case '인도대기':     return 'blue';
    case '매각검토':     return 'orange';
    case '휴차대기':
    case '휴차':
    case '매각대기':
    case '매각완료':
    case '반납':         return 'gray';
    default:             return 'neutral';
  }
}

export function contractStateTone(name: ContractState | undefined): BadgeTone {
  switch (name) {
    case '계약중':       return 'green';
    case '만기임박':
    case '연장대기':
    case '종료대기':     return 'orange';
    case '만기경과':
    case '미수검':
    case '위반':         return 'red';
    case '무계약':       return 'gray';
    default:             return 'neutral';
  }
}

export function paymentStateTone(name: PaymentState | undefined): BadgeTone {
  switch (name) {
    case '정상':         return 'green';
    case '미납':         return 'red';
    case '휴차':
    case '종결':         return 'gray';
    default:             return 'neutral';
  }
}

/** 수납 회차 status — schedule.status */
export function scheduleStatusTone(status: ScheduleStatus | undefined): BadgeTone {
  switch (status) {
    case '완료':   return 'green';
    case '예정':   return 'blue';
    case '부분납': return 'orange';
    case '연체':   return 'red';
    case '면제':   return 'gray';
    default:       return 'neutral';
  }
}

export function vehicleStatusTone(status: VehicleStatus | undefined): BadgeTone {
  switch (status) {
    // 활성/운행 — 녹색
    case '운행':            return 'green';
    case '상품대기':        return 'green';
    // 진행중 (대기·검토·진행) — 파랑
    case '구매대기':        return 'blue';
    case '등록대기':        return 'blue';
    case '상품화대기':      return 'blue';
    case '상품화중':        return 'blue';
    case '인도대기':        return 'blue';
    case '출고대기':        return 'blue';
    case '임시배차':        return 'blue';
    // 만기·반납 임박 — 주황
    case '연장대기':        return 'orange';
    case '종료대기':        return 'orange';
    case '매각검토':        return 'orange';
    // 문제/사고 — 빨강
    case '사고':            return 'red';
    case '정비':            return 'red';
    // 휴차·종료 — 회색
    case '휴차대기':        return 'gray';
    case '휴차':            return 'gray';
    case '재고':            return 'gray';
    case '반납':            return 'gray';
    case '매각대기':        return 'gray';
    case '매각':            return 'gray';
    default:                return 'neutral';
  }
}
