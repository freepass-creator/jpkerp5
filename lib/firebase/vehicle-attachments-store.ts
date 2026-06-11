'use client';

/**
 * 차량 첨부파일 별도 노드 — vehicles 마스터의 base64 폭증 차단.
 *
 *  · `vehicles` 노드는 메타데이터만 (리스트 다운로드 빠름)
 *  · 첨부 base64 (등록증/보험증명/할부계약서 등) = `vehicle_attachments/{vehicleId}` 별도 노드
 *  · 자산 리스트는 vehicles 만 구독 → 매우 빠름
 *  · detail 다이얼로그 진입 시 해당 차량 attachments 만 별도 fetch
 */

import { ref, onValue, get, set, update as rtdbUpdate, remove } from 'firebase/database';
import { getRtdb, dbPath, ensureAuth, pruneUndefined } from './client';

const PATH = dbPath('vehicle_attachments');

export type VehicleAttachments = {
  registrationCertUrl?: string;
  registrationCertFileName?: string;
  registrationCertUploadedAt?: string;
  insuranceCertUrl?: string;
  insuranceCertFileName?: string;
  insuranceCertUploadedAt?: string;
  loanContractUrl?: string;
  loanContractFileName?: string;
  loanContractUploadedAt?: string;
};

/** vehicleId 1건의 첨부 묶음 fetch (detail dialog 진입 시) */
export async function fetchVehicleAttachments(vehicleId: string): Promise<VehicleAttachments | null> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return null;
  const snap = await get(ref(db, `${PATH}/${vehicleId}`));
  const val = snap.val() as VehicleAttachments | null;
  return val ?? null;
}

/** vehicleId 1건의 첨부 묶음 set/update */
export async function setVehicleAttachments(vehicleId: string, attachments: VehicleAttachments): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  await set(ref(db, `${PATH}/${vehicleId}`), pruneUndefined(attachments as unknown as Record<string, unknown>));
}

/** vehicleId 1건의 첨부 묶음 remove */
export async function removeVehicleAttachments(vehicleId: string): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  await remove(ref(db, `${PATH}/${vehicleId}`));
}
