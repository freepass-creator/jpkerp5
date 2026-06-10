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
export function findVehicleByPlate(vehicles: Vehicle[], plate?: string): Vehicle | undefined {
  if (!plate) return undefined;
  const key = normPlate(plate);
  if (!key) return undefined;
  return vehicles.find((v) => normPlate(v.plate) === key);
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

  const isActive = contract.status === '운행' || contract.status === '대기';
  const existing = findVehicleByPlate(ctx.vehicles, plate);

  if (existing) {
    const next: Vehicle = {
      ...existing,
      currentContractId: contract.id,
      status: isActive ? '운행' : existing.status,
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
    status: isActive ? '운행' : '상품대기',
    currentContractId: contract.id,
    createdAt: new Date().toISOString(),
  };
  const id = await ctx.addVehicle(draft);
  return { vehicleId: id, created: true };
}
