/**
 * 계약 1건의 연동·완전성 — "이 계약이 무엇과 물려 있고, 뭐가 빠졌나".
 *
 * 전역 점검(data-integrity.ts)이 데이터셋 전체의 이상을 잡는다면,
 * 여기는 계약 상세에서 그 한 건의 연결 상태(차량·수납거래·과태료·보험·회차)와
 * 결손 필드를 보여주기 위한 순수 함수. 읽기 전용.
 */

import type { Contract, Vehicle, BankTransaction, CardTransaction, InsurancePolicy } from './types';
import type { PenaltyWorkItem } from './penalty-pdf';
import { findVehicleByPlate, normPlate } from './entity-sync';
import { isContractEnded } from './contract-lifecycle';

export type ContractLinkage = {
  links: {
    vehicle: Vehicle | null;
    incomeCount: number;     // 이 계약에 매칭된 수납 거래(계좌+카드) 건수
    incomeAmount: number;    // 매칭된 수납 금액 합
    penaltyCount: number;    // 같은 차량 과태료(미삭제) 건수
    insurance: InsurancePolicy | null;
    scheduleCount: number;   // 생성된 회차 수
  };
  missing: string[];         // 빠진(연동·완전성) 라벨
};

function samePlate(a?: string, b?: string): boolean {
  const ka = normPlate(a);
  return !!ka && ka === normPlate(b);
}

export function computeContractLinkage(
  c: Contract,
  data: {
    vehicles: Vehicle[];
    bankTx: BankTransaction[];
    cardTx: CardTransaction[];
    penalties: PenaltyWorkItem[];
    insurances: InsurancePolicy[];
  },
): ContractLinkage {
  const vehicle = findVehicleByPlate(data.vehicles, c.vehiclePlate) ?? null;

  let incomeCount = 0;
  let incomeAmount = 0;
  for (const t of data.bankTx) {
    if (t.matchedContractId === c.id) { incomeCount += 1; incomeAmount += t.amount ?? 0; }
  }
  for (const t of data.cardTx) {
    if (t.matchedContractId === c.id) { incomeCount += 1; incomeAmount += t.amount ?? 0; }
  }

  const penaltyCount = data.penalties.filter(
    (p) => !p.deletedAt && samePlate(p.car_number, c.vehiclePlate),
  ).length;
  const insurance = data.insurances.find((ins) => samePlate(ins.carNumber, c.vehiclePlate)) ?? null;
  const scheduleCount = c.schedules?.length ?? 0;

  const missing: string[] = [];
  const ended = isContractEnded(c);
  if (!vehicle) missing.push('차량 마스터');
  if (!ended && c.deliveredDate && (c.monthlyRent ?? 0) > 0 && scheduleCount === 0) missing.push('수납 회차');
  if (!ended && (c.monthlyRent ?? 0) <= 0) missing.push('월대여료');
  if (!ended && !c.customerPhone1) missing.push('연락처');

  return {
    links: { vehicle, incomeCount, incomeAmount, penaltyCount, insurance, scheduleCount },
    missing,
  };
}
