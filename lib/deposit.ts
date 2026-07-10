/**
 * 보증금 원장 (#반납 보증금 처리) — 받은 보증금에서 차감(미납/손상/과태료)·환불을 추적, 미반환 잔액 산출.
 *
 * 정책(만기 알람 D-N, 반환기한 N일 등)은 나중에 설정에서. 여기선 사실(받음·차감·환불)만 계산.
 * 반납/해지되면 미반환 잔액이 남아있는 계약을 "보증금 미반환"으로 표시 → 나중에 처리(차감/환불).
 */

import type { Contract, DepositDeduction } from './types';
import { isContractEnded } from './contract-lifecycle';

export type DepositLedger = {
  contractual: number;   // 계약상 보증금(청구액)
  received: number;      // 실제 받은 보증금
  deducted: number;      // 차감 합계(미납·손상·과태료 등)
  refunded: number;      // 환불 합계
  unrefunded: number;    // 미반환 잔액 = received − deducted − refunded (음수 방지)
};

export function depositLedger(c: Contract): DepositLedger {
  const received = c.depositReceived ?? 0;
  const deducted = (c.depositDeductions ?? []).reduce((s, d) => s + (d.amount ?? 0), 0);
  const refunded = c.depositRefunded ?? 0;
  return {
    contractual: c.deposit ?? 0,
    received,
    deducted,
    refunded,
    unrefunded: Math.max(0, received - deducted - refunded),
  };
}

/** 미반환 잔액(받은 보증금 중 아직 차감·환불 안 된 금액). */
export function unrefundedDeposit(c: Contract): number {
  return depositLedger(c).unrefunded;
}

/** 반납/해지됐는데 미반환 보증금이 남아있음 → 처리 대상. */
export function hasUnrefundedDeposit(c: Contract): boolean {
  return isContractEnded(c) && unrefundedDeposit(c) > 0;
}

/** 차감 1건 추가한 계약 patch (원장 필드만). */
export function addDepositDeduction(c: Contract, d: Omit<DepositDeduction, 'id'>): Pick<Contract, 'depositDeductions'> {
  const deduction: DepositDeduction = { ...d, id: `dd-${d.date}-${Math.round(d.amount)}-${(c.depositDeductions?.length ?? 0)}` };
  return { depositDeductions: [...(c.depositDeductions ?? []), deduction] };
}
