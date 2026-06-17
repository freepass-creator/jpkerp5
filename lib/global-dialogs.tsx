'use client';

/**
 * 글로벌 dialog provider — 어디서든 차량 클릭 시 같은 자산 dialog.
 *
 *   layout 에 한 번만 <GlobalDialogsProvider> wrap.
 *   호출:
 *     const { openVehicle } = useVehicleDialog();
 *     openVehicle(plate, 'risk');   // 차량번호 + 진입 탭
 *
 *   plate 로 vehicles store 에서 찾고, 없으면 toast 알림.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { syncContractStatusFromVehicle } from '@/lib/entity-sync';
import { VehicleDetailDialog, type VehicleDialogTab } from '@/components/asset/vehicle-detail-dialog';
import { toast } from '@/lib/toast';
import type { Vehicle } from '@/lib/types';

type Ctx = {
  openVehicle: (plate: string, initialTab?: VehicleDialogTab) => void;
};

const VehicleDialogContext = createContext<Ctx | null>(null);

export function useVehicleDialog(): Ctx {
  const ctx = useContext(VehicleDialogContext);
  if (!ctx) return { openVehicle: () => toast.error('GlobalDialogsProvider 미등록') };
  return ctx;
}

export function GlobalDialogsProvider({ children }: { children: ReactNode }) {
  const { vehicles, update: updateVehicle } = useVehicles();
  const { contracts, update: updateContract } = useContracts();
  const { entries: history } = useHistoryEntries();
  const [openState, setOpenState] = useState<{ vehicle: Vehicle; initialTab?: VehicleDialogTab } | null>(null);

  const openVehicle = useCallback((plate: string, initialTab?: VehicleDialogTab) => {
    const v = vehicles.find((x) => x.plate === plate || (x.plateHistory ?? []).includes(plate));
    if (!v) {
      toast.warning(`자산 마스터에 차량번호 [${plate}] 없음 — 자산관리에서 등록 필요`);
      return;
    }
    setOpenState({ vehicle: v, initialTab });
  }, [vehicles]);

  const value = useMemo(() => ({ openVehicle }), [openVehicle]);

  // 이 차량의 계약·history 필터 (이미 store 에 다 있음)
  const vehicleContracts = useMemo(() => {
    if (!openState) return [];
    const v = openState.vehicle;
    const plates = new Set<string>([v.plate, ...(v.plateHistory ?? [])]);
    return contracts.filter((c) => plates.has(c.vehiclePlate));
  }, [openState, contracts]);

  const vehicleHistory = useMemo(() => {
    if (!openState) return [];
    const v = openState.vehicle;
    const plates = new Set<string>([v.plate, ...(v.plateHistory ?? [])]);
    return history.filter((h) => h.vehiclePlate && plates.has(h.vehiclePlate));
  }, [openState, history]);

  return (
    <VehicleDialogContext.Provider value={value}>
      {children}
      {openState && (
        <VehicleDetailDialog
          vehicle={openState.vehicle}
          history={vehicleHistory}
          contracts={vehicleContracts}
          view="status"
          initialTab={openState.initialTab}
          onUpdate={async (v) => {
            await updateVehicle(v);
            // Vehicle 상태 변경 시 linked Contract.vehicleStatus 도 동기화 (자산 페이지 패턴 일치).
            await syncContractStatusFromVehicle(v, contracts, updateContract);
          }}
          onClose={() => setOpenState(null)}
        />
      )}
    </VehicleDialogContext.Provider>
  );
}
