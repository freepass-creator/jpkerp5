/**
 * 자산코드 발급 — 회사별 sequence (CP{회사코드}VH{4자리}).
 *
 * 정책 ([[feedback_v4_code_policy]]):
 *   · 회사 scope 영구·재발급 금지. 한번 받으면 그 차량 끝까지.
 *   · 신규 차량 add 시 자동 부여 (vehicles-store 에서 사용 가능).
 *
 * 표시 fallback:
 *   · Vehicle.assetCode 가 비어있으면 deriveAssetCode 가 안정적인 표시용 코드 반환.
 *   · 단, 실제 데이터에 쓰지는 말 것 — assetCode 컬럼은 별도 발급 액션으로만 set.
 */

import type { Vehicle } from './types';

/**
 * 신규 자산코드 발급 — 같은 회사 차량들의 최대 seq + 1.
 * 예: 회사 'JPK', 기존 'JPKVH0001', 'JPKVH0007' → 다음 'JPKVH0008'
 */
export function issueAssetCode(company: string, allVehicles: readonly Vehicle[]): string {
  const prefix = `${company}VH`;
  let maxSeq = 0;
  for (const v of allVehicles) {
    if (!v.assetCode) continue;
    if (!v.assetCode.startsWith(prefix)) continue;
    const seq = Number(v.assetCode.slice(prefix.length));
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

/**
 * 표시용 코드 derive — 실제 assetCode 가 있으면 그것, 없으면 안정적 fallback.
 *
 * Fallback 규칙:
 *   · 회사 + 차량 생성순(createdAt) 인덱스 기반 → 화면에서 안정적이고 정렬 가능
 *   · '미발급' 같은 표시 회피 — 사용자가 한 눈에 식별
 */
export function deriveAssetCode(vehicle: Vehicle, allVehicles: readonly Vehicle[]): string {
  if (vehicle.assetCode) return vehicle.assetCode;
  const company = vehicle.company ?? '';
  // 회사별 createdAt 정렬 후 인덱스 — 같은 회사 안에서 vehicle 순서
  const sameCo = allVehicles
    .filter((v) => v.company === company)
    .slice()
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id));
  const idx = sameCo.findIndex((v) => v.id === vehicle.id);
  if (idx < 0) return `${company}VH????`;
  return `${company}VH${String(idx + 1).padStart(4, '0')}`;
}
