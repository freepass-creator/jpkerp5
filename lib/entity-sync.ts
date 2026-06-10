'use client';

/**
 * [BACKLOG — 다음 라운드 작업용 placeholder]
 *
 * 엔티티 자동 프로비저닝 + 캐시 동기화 (SSoT 정책).
 *
 * 세계관:
 *   "어디서 입력하든 다른 곳에 자동으로 entity가 생긴다. 단 계약은 명시적 별개."
 *
 *   · 보험증권을 등록하면 → 같은 plate 차량이 자동 자산 등록되고 운영현황에 노출
 *   · 계약에 차량번호만 적어 올리면 → 자산도 함께 자동 생성
 *   · 차량 먼저 등록하고 보험 등록해도 OK (순서 무관)
 *
 * 구현 예정 (TODO):
 *   export async function upsertVehicleFromPolicy(policy, ctx)
 *   export async function upsertVehicleFromContract(contract, ctx)
 *   export function findVehicleByPlate(vehicles, plate)
 *   export function findCompanyForPolicy(policy, companies)
 */

export {};
