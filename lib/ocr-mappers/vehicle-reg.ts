/**
 * 자동차등록증 OCR raw → Vehicle 매핑 — Pure function.
 *
 *  v4 의 mapVehicleRegToAsset 와 동일 책임 (jpkerp-v4/components/asset/asset-register-dialog.tsx).
 *  OCR raw (`/api/ocr/extract` 응답의 `extracted`) → Partial<Vehicle> 변환.
 *  side effect 없음 — 회사 매칭은 외부 헬퍼(matchCompany) 주입.
 */

import type { Vehicle, CompanyCode } from '@/lib/types';
import { normPlate } from '@/lib/entity-sync';
import { deriveVehicleStatusFromContract } from '@/lib/plate-rules';

export function mapVehicleRegToVehicle(
  raw: Record<string, unknown>,
  matchCompany: (ownerRegNo?: string) => string | undefined,
): Partial<Vehicle> {
  const s = (k: string): string | undefined => (raw[k] != null ? String(raw[k]) : undefined);
  const n = (k: string): number | undefined => {
    const v = raw[k];
    if (v == null) return undefined;
    const num = typeof v === 'number' ? v : Number(String(v).replace(/[,\s]/g, ''));
    return Number.isFinite(num) ? num : undefined;
  };

  const plateRaw = s('car_number');
  const plate = normPlate(plateRaw);
  const ownerReg = s('owner_biz_no');
  const matchedCompany = matchCompany(ownerReg);

  return {
    company: (matchedCompany as CompanyCode | undefined) ?? ('기타' as CompanyCode),
    plate: plate || plateRaw || '',
    model: s('car_name') ?? '',
    vehicleType: s('category_hint'),
    vehicleUsage: s('usage_type'),
    vehicleFormat: s('type_number'),
    manufacturedDate: s('car_year_month'),
    firstRegisteredDate: s('first_registration_date'),
    vin: s('vin'),
    engineFormat: s('engine_type'),
    garage: s('address'),
    ownerName: s('owner_name'),
    ownerRegNo: ownerReg,
    specMgmtNo: s('approval_number'),
    vehicleLength: n('length_mm'),
    vehicleWidth: n('width_mm'),
    vehicleHeight: n('height_mm'),
    totalWeight: n('gross_weight_kg'),
    seatingCapacity: n('seats'),
    displacementCc: n('displacement'),
    fuelType: s('fuel_type'),
    purchasePrice: n('acquisition_price'),
    // 정상 plate → 휴차 / 임판 → 등록대기 / 빈 → 구매대기 (사용자 명시 도메인 룰)
    status: deriveVehicleStatusFromContract(plate),
  };
}
