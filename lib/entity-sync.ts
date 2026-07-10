'use client';

/**
 * 엔티티 자동 프로비저닝 + 캐시 동기화 — SSoT 정책.
 *
 *  세계관 (사용자 비전):
 *    "어디서 입력하든 다른 곳에 자동으로 entity가 생긴다. 단 계약은 명시적 별개."
 *
 *    · 보험증권을 등록하면 → 같은 plate 차량이 자동 자산 등록되고 운영현황에 노출
 *    · 계약에 차량번호만 적어 올리면 → 자산도 함께 자동 생성
 *    · 차량 먼저 등록하고 보험 등록해도 OK (순서 무관 — upsert 패턴)
 *
 *  Vehicle = single source of truth (마스터).
 *  Insurance/Contract → Vehicle 자동 upsert + 캐시 sync.
 */

import type { InsurancePolicy, Vehicle, Contract, Company } from '@/lib/types';
import { deriveVehicleStatusFromContract } from '@/lib/plate-rules';

/** plate 정규화 — 공백/제로폭/하이픈 제거. O→0, I→1 OCR 보정 */
export function normPlate(s?: string): string {
  if (!s) return '';
  return s
    .replace(/\s+/g, '')
    .replace(/[​‌‍﻿]/g, '')   // zero-width 문자
    .replace(/[-_/\\.]/g, '')                     // 하이픈/언더스코어/슬래시/점
    .replace(/O/g, '0')
    .replace(/I/g, '1')
    .toUpperCase()
    .replace(/[^0-9가-힣A-Z]/g, '')
    .trim();
}

/** 숫자만 (사업자/법인등록번호 비교용) */
function digits(s?: string): string {
  return (s ?? '').replace(/[^\d]/g, '');
}

/** 사업자/법인등록번호 raw → 회사 마스터 매칭 (자등증·보험·기타 OCR 공용) */
export function findCompanyByRegNo(regNo: string | undefined, companies: Company[]): Company | undefined {
  const norm = digits(regNo);
  if (!norm) return undefined;
  return companies.find((c) => {
    const corp = digits(c.corpRegNo);
    const biz = digits(c.bizRegNo);
    return (corp && corp === norm) || (biz && biz === norm);
  });
}

/** 회사 식별자 (vehicle.company / contract.company 에 저장할 값) — code 우선, 없으면 name */
export function companyKey(company: Company): string {
  return company.code || company.name;
}

/** 회사 매칭 — Vehicle.ownerRegNo 가 Company.corpRegNo/bizRegNo 와 일치 */
export function vehiclesMatchingCompany(vehicles: Vehicle[], company: Company): Vehicle[] {
  const corp = digits(company.corpRegNo);
  const biz = digits(company.bizRegNo);
  if (!corp && !biz) return [];
  return vehicles.filter((v) => {
    const reg = digits(v.ownerRegNo);
    if (!reg) return false;
    return (corp && corp === reg) || (biz && biz === reg);
  });
}

/**
 * 회사 등록·수정 후 호출 — 매칭되는 차량의 company 필드 일괄 재할당.
 * 사용자 명시: 한 쪽 변경이 다른 쪽에 자동 전파 (SSoT).
 */
export async function reassignVehiclesToCompany(
  vehicles: Vehicle[],
  company: Company,
  updateVehicle: (v: Vehicle) => Promise<void>,
): Promise<number> {
  const target = vehiclesMatchingCompany(vehicles, company);
  const key = companyKey(company);
  if (!key) return 0;
  let count = 0;
  for (const v of target) {
    if (v.company === key) continue;
    await updateVehicle({ ...v, company: key as Vehicle['company'] });
    count += 1;
  }
  return count;
}

/** plate 기준 차량 찾기 (정규화 비교) */
/**
 * 차량 ↔ 차량번호 매칭 SSOT — normPlate 정규화 + 번호변경 이력(plateHistory) 포함.
 * 페이지마다 raw trim 비교를 재구현하면 표기 차이·번호변경 케이스에서
 * 같은 차가 2행 생기거나 sync 가 조용히 빠짐 → 반드시 이 헬퍼 사용.
 */
export function vehicleMatchesPlate(
  v: Pick<Vehicle, 'plate' | 'plateHistory'>,
  plate?: string,
): boolean {
  const key = normPlate(plate);
  if (!key) return false;
  if (normPlate(v.plate) === key) return true;
  return (v.plateHistory ?? []).some((h) => normPlate(h) === key);
}

export function findVehicleByPlate(vehicles: Vehicle[], plate?: string): Vehicle | undefined {
  if (!plate) return undefined;
  const key = normPlate(plate);
  if (!key) return undefined;
  // 현재 plate 정확 일치 우선, 없으면 번호변경 이력에서 탐색
  return vehicles.find((v) => normPlate(v.plate) === key)
    ?? vehicles.find((v) => (v.plateHistory ?? []).some((h) => normPlate(h) === key));
}

/**
 * 안정 FK 우선 차량 조회 — vehicleId(push-id) 있으면 그것으로 확정 조회, 없으면 plate 폴백.
 * plate 문자열 링크(OCR 오보정·번호변경에 취약)를 대체하는 정본 참조. Contract·Penalty·Insurance 공용.
 */
export function findVehicleForContract(
  vehicles: Vehicle[],
  ref: { vehicleId?: string; vehiclePlate?: string },
): Vehicle | undefined {
  if (ref.vehicleId) {
    const byId = vehicles.find((v) => v.id === ref.vehicleId);
    if (byId) return byId;
  }
  return findVehicleByPlate(vehicles, ref.vehiclePlate);
}

/** 보험증권의 회사 식별자 (companyCode 또는 bizNo) → 회사 마스터 매칭 */
export function findCompanyForPolicy(
  policy: InsurancePolicy,
  companies: Company[],
): Company | undefined {
  if (policy.companyCode) {
    const hit = companies.find((c) => c.code === policy.companyCode || c.name === policy.companyCode);
    if (hit) return hit;
  }
  return findCompanyByRegNo(policy.bizNo, companies);
}

/** 계약의 회사 식별자 → 회사 마스터 매칭 */
function findCompanyForContract(contract: Contract, companies: Company[]): Company | undefined {
  if (!contract.company) return undefined;
  return companies.find((c) => c.code === contract.company || c.name === contract.company);
}

type UpsertContext = {
  vehicles: Vehicle[];
  companies: Company[];
  addVehicle: (v: Omit<Vehicle, 'id'>) => Promise<string>;
  updateVehicle: (v: Vehicle) => Promise<void>;
};

type UpsertResult = {
  vehicleId: string;
  created: boolean;
};

/**
 * 보험증권 저장 후 호출 — Vehicle upsert + 캐시 동기.
 *
 *  1. 같은 plate Vehicle 있음 → 캐시 갱신 (insuranceCompany/policyNo/expiryDate)
 *  2. 없음 → 신규 Vehicle 자동 생성 (보험증권 OCR 데이터로 plate/model/회사/상태 채움)
 */
export async function upsertVehicleFromPolicy(
  policy: InsurancePolicy,
  ctx: UpsertContext,
): Promise<UpsertResult | null> {
  const plate = policy.carNumber;
  if (!plate) return null;

  const existing = findVehicleByPlate(ctx.vehicles, plate);
  if (existing) {
    const synced: Vehicle = {
      ...existing,
      insuranceCompany: policy.insurer ?? existing.insuranceCompany,
      insurancePolicyNo: policy.policyNo ?? existing.insurancePolicyNo,
      insuranceExpiryDate: policy.endDate ?? existing.insuranceExpiryDate,
    };
    const changed =
      synced.insuranceCompany !== existing.insuranceCompany ||
      synced.insurancePolicyNo !== existing.insurancePolicyNo ||
      synced.insuranceExpiryDate !== existing.insuranceExpiryDate;
    if (changed) await ctx.updateVehicle(synced);
    return { vehicleId: existing.id, created: false };
  }

  // 신규 Vehicle 자동 생성 — 보험증권 데이터로 최소 필드 채움
  const company = findCompanyForPolicy(policy, ctx.companies);
  const draft: Omit<Vehicle, 'id'> = {
    plate: plate.trim(),
    model: policy.carName ?? '',
    vehicleModelLine: policy.carName,
    company: (company?.code || company?.name || '') as Vehicle['company'],
    status: '상품대기',
    insuranceCompany: policy.insurer,
    insurancePolicyNo: policy.policyNo,
    insuranceExpiryDate: policy.endDate,
    displacementCc: policy.displacement,
    seatingCapacity: policy.seats,
    createdAt: new Date().toISOString(),
  };
  const id = await ctx.addVehicle(draft);
  return { vehicleId: id, created: true };
}

/**
 * 계약 저장 후 호출 — Vehicle upsert + 현재계약/상태 동기.
 *
 *  1. 같은 plate Vehicle 있음 → currentContractId + status 갱신
 *      · 활성 계약 ('운행'/'대기') → Vehicle.status = '운행'
 *      · 종료 계약 ('반납'/'해지'/'채권') → currentContractId 만 갱신
 *  2. 없음 → 신규 Vehicle 자동 생성 (계약 임베드 정보로 plate/model/회사 채움)
 */
export async function upsertVehicleFromContract(
  contract: Contract,
  ctx: UpsertContext,
): Promise<UpsertResult | null> {
  const plate = contract.vehiclePlate;
  if (!plate || plate === '미정') return null;

  // plate 정규성 기반 자동 status — 빈/임판/정상 → 구매대기/등록대기/휴차
  const autoStatus = deriveVehicleStatusFromContract(plate);
  const isActive = contract.status === '운행' || contract.status === '대기';
  const existing = findVehicleByPlate(ctx.vehicles, plate);

  // 자동 계산 가능한 status (사용자 명시 처리는 보존)
  const autoCalculable: Vehicle['status'][] = ['구매대기', '등록대기', '휴차'];

  if (existing) {
    // 기존 status 가 자동 계산 가능 (구매대기/등록대기/휴차) 면 plate 변화 따라 갱신.
    // 사용자가 명시한 status (운행/매각/정비/사고/반납 등) 는 보존.
    const canAutoUpdate = autoCalculable.includes(existing.status);
    const nextStatus = isActive && canAutoUpdate ? autoStatus : existing.status;
    const next: Vehicle = {
      ...existing,
      currentContractId: contract.id,
      status: nextStatus,
      // 빈 필드만 계약 임베드로 보강 — 기존 값 보존
      vehicleModelLine: existing.vehicleModelLine || contract.vehicleModelLine,
      model: existing.model || contract.vehicleModel,
      vehicleMaker: existing.vehicleMaker || contract.vehicleMaker,
      vehicleSubModel: existing.vehicleSubModel || contract.vehicleSubModel,
      vehicleVariant: existing.vehicleVariant || contract.vehicleVariant,
      vehicleTrim: existing.vehicleTrim || contract.vehicleTrim,
    };
    const changed =
      next.currentContractId !== existing.currentContractId ||
      next.status !== existing.status ||
      next.vehicleModelLine !== existing.vehicleModelLine ||
      next.model !== existing.model ||
      next.vehicleMaker !== existing.vehicleMaker ||
      next.vehicleSubModel !== existing.vehicleSubModel ||
      next.vehicleVariant !== existing.vehicleVariant ||
      next.vehicleTrim !== existing.vehicleTrim;
    if (changed) await ctx.updateVehicle(next);
    return { vehicleId: existing.id, created: false };
  }

  // 신규 Vehicle 자동 생성 — 계약 임베드 정보
  const company = findCompanyForContract(contract, ctx.companies);
  const draft: Omit<Vehicle, 'id'> = {
    plate: plate.trim(),
    model: contract.vehicleModel ?? '',
    vehicleModelLine: contract.vehicleModelLine,
    vehicleMaker: contract.vehicleMaker,
    vehicleSubModel: contract.vehicleSubModel,
    vehicleVariant: contract.vehicleVariant,
    vehicleTrim: contract.vehicleTrim,
    company: (company?.code || company?.name || contract.company || '') as Vehicle['company'],
    // 신규 차량 — plate 정규성 기반 자동 status
    status: autoStatus,
    currentContractId: contract.id,
    createdAt: new Date().toISOString(),
  };
  const id = await ctx.addVehicle(draft);
  return { vehicleId: id, created: true };
}

/**
 * 자산 마스터 status 변경 후 호출 — 같은 plate 의 모든 계약 vehicleStatus 갱신.
 *
 * SoT 는 Vehicle.status. 사용자가 /asset 에서 status 를 바꿔도
 * 운영현황(계약 기준 화면)에 즉시 반영되어야 한다.
 *
 * 호출:
 *   await syncContractStatusFromVehicle(vehicle, contracts, updateContract)
 *
 * 반환: 갱신된 계약 수 (toast 노출용)
 */
export async function syncContractStatusFromVehicle(
  vehicle: Vehicle,
  contracts: Contract[],
  updateContract: (c: Contract) => Promise<void>,
): Promise<{ updatedCount: number }> {
  if (!(vehicle.plate ?? '').trim() || !vehicle.status) return { updatedCount: 0 };
  // 활성 계약만 sync — 종료 계약(반납/해지/채권)의 vehicleStatus 는 종료 시점 기록이므로 보존
  // (기존엔 과거 계약까지 현재 자산 상태로 덮여 종료 기록이 파괴됨)
  // plate 매칭 SSOT(vehicleMatchesPlate: normPlate+plateHistory) — raw trim 은 표기차·번호변경 차량을 놓침
  const targets = contracts.filter((c) =>
    vehicleMatchesPlate(vehicle, c.vehiclePlate) &&
    (c.status === '운행' || c.status === '대기') &&
    c.vehicleStatus !== vehicle.status,
  );
  for (const c of targets) {
    await updateContract({ ...c, vehicleStatus: vehicle.status });
  }
  return { updatedCount: targets.length };
}
