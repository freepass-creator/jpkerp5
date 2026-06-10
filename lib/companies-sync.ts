'use client';

/**
 * 회사 등록·수정 후 매칭되는 차량/계약을 자동으로 그 회사로 갱신.
 * 사용자 명시: 한 쪽 변경이 다른 쪽에 자동 전파.
 */

import type { Company, Vehicle } from '@/lib/types';

/** 숫자만 추출 (등록번호 비교용) */
function digits(s?: string): string {
  return (s ?? '').replace(/[^\d]/g, '');
}

/** 회사 매칭 — 차량의 ownerRegNo 가 회사 corpRegNo 또는 bizRegNo 와 일치 */
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

/** 회사 코드 또는 이름 (vehicle.company 필드에 저장할 식별자) */
export function companyKey(company: Company): string {
  return company.code || company.name;
}

/**
 * 회사 저장 후 매칭 차량의 company 일괄 갱신.
 * 변경 필요한 차량만 update 호출. await 결과 카운트 반환.
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
    if (v.company === key) continue;  // 이미 매칭됨
    await updateVehicle({ ...v, company: key as Vehicle['company'] });
    count += 1;
  }
  return count;
}
