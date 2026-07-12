'use client';

/**
 * 차량 간편 상태 배지 — 2축(차량 준비 × 계약)을 조합한 헤드라인 상태를 한 배지로.
 * 세부 19단계는 title(툴팁)으로. lib/vehicle-state SSOT.
 */
import { StatusBadge } from '@/components/ui/status-badge';
import { resolveVehicleState, simpleVehicleState } from '@/lib/vehicle-state';
import type { Vehicle, Contract, VehicleStatus, ContractStatus } from '@/lib/types';

/** 차량 + 계약목록으로 자동 해석. contract 를 미리 넘기면(목록 인덱스) per-row 스캔 생략. */
export function VehicleStateBadge({ vehicle, contracts, contract }: {
  vehicle: Pick<Vehicle, 'status' | 'plate'>;
  contracts?: readonly Contract[];
  contract?: Contract | null;
}) {
  const s = contract !== undefined
    ? simpleVehicleState(vehicle.status, contract ?? null)
    : resolveVehicleState(vehicle, contracts ?? []);
  return (
    <StatusBadge tone={s.tone} title={`세부: ${s.detailStatus} · 준비 ${s.prep} · 계약 ${s.sale}`}>
      {s.label}
    </StatusBadge>
  );
}

/** 이미 status·계약상태를 아는 경우 (계약목록 없이) */
export function VehicleStateBadgeLite({ status, contractStatus }: { status: VehicleStatus; contractStatus?: ContractStatus | null }) {
  const s = simpleVehicleState(status, contractStatus ? { status: contractStatus } : null);
  return (
    <StatusBadge tone={s.tone} title={`세부: ${s.detailStatus} · 준비 ${s.prep} · 계약 ${s.sale}`}>
      {s.label}
    </StatusBadge>
  );
}
