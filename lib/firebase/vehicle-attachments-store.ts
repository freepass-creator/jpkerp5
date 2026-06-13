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
import { useEffect, useState } from 'react';
import { getRtdb, dbPath, ensureAuth, pruneUndefined } from './client';

const PATH = dbPath('vehicle_attachments');

/** 차량 사진 종류 — 상품화(출고 전 상품 상태) / 출고(고객 인도 시) / 반납(고객 반납 시) */
export type VehiclePhotoKind = 'product' | 'delivery' | 'return';

export type VehiclePhoto = {
  id: string;            // 'vp-<ts>-<rand>'
  kind: VehiclePhotoKind;
  url: string;           // base64 data URL (fileToDataUrl)
  fileName?: string;
  uploadedAt: string;    // ISO
  uploadedBy?: string;   // user email
  /** delivery/return 만 — 어느 계약 시점인지 */
  contractId?: string;
  /** delivery/return 일자 YYYY-MM-DD (없으면 uploadedAt 시점) */
  eventDate?: string;
  note?: string;
};

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
  /** 차량 사진 — 상품화/출고/반납 단일 어레이로 보존, kind 로 분류 */
  photos?: VehiclePhoto[];
};

export const PHOTO_KIND_LABEL: Record<VehiclePhotoKind, string> = {
  product: '상품화',
  delivery: '출고',
  return: '반납',
};
export const PHOTO_KIND_TONE: Record<VehiclePhotoKind, string> = {
  product: 'brand',
  delivery: 'green',
  return: 'orange',
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

/** 차량 사진 1장 추가 — vehicle_attachments/{vehicleId}/photos 어레이에 append. */
export async function addVehiclePhoto(vehicleId: string, photo: VehiclePhoto): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  const existing = (await fetchVehicleAttachments(vehicleId)) ?? {};
  const next: VehicleAttachments = {
    ...existing,
    photos: [...(existing.photos ?? []), photo],
  };
  await set(ref(db, `${PATH}/${vehicleId}`), pruneUndefined(next as unknown as Record<string, unknown>));
}

/** 차량 사진 1장 삭제 — photo.id 기준. */
export async function removeVehiclePhoto(vehicleId: string, photoId: string): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  const existing = (await fetchVehicleAttachments(vehicleId)) ?? {};
  const next: VehicleAttachments = {
    ...existing,
    photos: (existing.photos ?? []).filter((p) => p.id !== photoId),
  };
  await set(ref(db, `${PATH}/${vehicleId}`), pruneUndefined(next as unknown as Record<string, unknown>));
}

/**
 * 차량 첨부 묶음 live 구독 — vehicle 상세/사진 탭에서 사용.
 * vehicleId 변경 시 자동 unsubscribe + 재구독.
 */
export function useVehicleAttachments(vehicleId: string | null | undefined): VehicleAttachments | null {
  const [data, setData] = useState<VehicleAttachments | null>(null);
  useEffect(() => {
    if (!vehicleId) { setData(null); return; }
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try { await ensureAuth(); } catch { /* silent */ }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) return;
      unsub = onValue(ref(db, `${PATH}/${vehicleId}`), (snap) => {
        setData((snap.val() as VehicleAttachments | null) ?? null);
      });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [vehicleId]);
  return data;
}
