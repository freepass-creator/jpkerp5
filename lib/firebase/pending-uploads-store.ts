'use client';

/**
 * 임시·미매칭 업로드 (pending_uploads) — 사진/문서/음성 일단 업로드 후 나중에 매칭.
 *
 * RTDB 경로: /pending_uploads/{uploadId}
 *
 * 흐름:
 *  1. 사용자 파일 선택 + 종류·분류 + (선택) 차량/계약 매칭
 *  2. base64로 노드에 저장 (status='pending' 또는 'matched')
 *  3. 매칭 안 됨 → pending 리스트에서 나중에 매칭
 *  4. 매칭 됨 → 적절한 노드 (vehicle_attachments / contracts / contact_logs)로 옮기고 pending 삭제
 *
 * 파일 크기: base64 인코딩 후 RTDB 1MB 권장 (5MB 까지는 OK). 큰 파일은 Firebase Storage 권장 (추후).
 */

import { ref, push, onValue, remove as rtdbRemove, update as rtdbUpdate } from 'firebase/database';
import { useEffect, useState } from 'react';
import { getRtdb, dbPath, ensureAuth, pruneUndefined } from './client';
import { withMeta, type WriteMeta } from '../write-meta';

const PATH = dbPath('pending_uploads');

export type UploadKind = 'image' | 'document' | 'audio' | 'other';
export type UploadStatus = 'pending' | 'matched';

export type PendingUpload = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** base64 데이터 URL (작은 파일) 또는 Firebase Storage URL (추후) */
  dataUrl: string;
  /** 종류 — image/document/audio/other */
  kind: UploadKind;
  /** 분류 — 상품화/출고전/반납/면허증/등록증/견적서 등. 자유 텍스트 키 */
  subCategory?: string;
  /** 자동 추출 — 파일명에서 전화번호 (audio), OCR로 차량번호 (image) */
  detectedPhone?: string;
  detectedPlate?: string;
  /** 매칭 결과 (status='matched' 인 경우) */
  matchedVehicleId?: string;
  matchedContractId?: string;
  matchedCustomerKey?: string;
  matchedAt?: string;
  matchedBy?: string;
  status: UploadStatus;
  uploadedAt: string;
  uploadedBy?: string;
  _meta?: WriteMeta;
};

/** 분류 키 — 모든 종류의 sub 라벨 매핑 */
export const SUB_CATEGORY_LABEL: Record<string, string> = {
  // image
  product: '상품화', delivery: '출고전', return: '반납',
  license: '면허증', identity: '신분증', vehicle_id: '차량 식별',
  // document
  registration: '자동차등록증', estimate: '견적서',
  insurance: '보험증권', contract: '계약서',
  receipt: '영수증', loan: '할부계약서',
  // audio
  call: '통화녹음', voice_memo: '메모녹음',
  // common
  general: '일반', other: '기타',
};

/** 종류별 분류 옵션 */
export const SUB_CATEGORIES_BY_KIND: Record<UploadKind, string[]> = {
  image:    ['product', 'delivery', 'return', 'license', 'identity', 'general'],
  document: ['registration', 'estimate', 'insurance', 'contract', 'loan', 'receipt', 'other'],
  audio:    ['call', 'voice_memo', 'other'],
  other:    ['general', 'other'],
};

/** 파일 MIME 타입에서 종류 자동 감지 */
export function detectKind(mimeType: string): UploadKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf' || mimeType.startsWith('text/')) return 'document';
  return 'other';
}

/** 파일명에서 전화번호 추출 (통화녹음) */
export function extractPhone(fileName: string): string | undefined {
  const m = fileName.match(/(\d{2,3})-?(\d{3,4})-?(\d{4})/);
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** File → base64 데이터 URL */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsDataURL(file);
  });
}

/** 임시 업로드 (status='pending') */
export async function addPendingUpload(input: Omit<PendingUpload, 'id' | 'status' | 'uploadedAt' | '_meta'>): Promise<string> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) throw new Error('Firebase 미설정');
  const newRef = push(ref(db, PATH));
  const id = newRef.key;
  if (!id) throw new Error('Firebase push failed');
  const stamped = withMeta({
    ...input, id,
    status: 'pending' as UploadStatus,
    uploadedAt: new Date().toISOString(),
  }, input.uploadedBy);
  await rtdbUpdate(ref(db, `${PATH}/${id}`), pruneUndefined(stamped as unknown as Record<string, unknown>));
  return id;
}

/** 매칭 처리 — pending_upload 의 메타 갱신 (실제 노드 이관은 추후) */
export async function matchUpload(
  uploadId: string,
  match: {
    matchedVehicleId?: string;
    matchedContractId?: string;
    matchedCustomerKey?: string;
    matchedBy?: string;
    subCategory?: string;
  },
): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  await rtdbUpdate(ref(db, `${PATH}/${uploadId}`), pruneUndefined({
    ...match,
    status: 'matched' as UploadStatus,
    matchedAt: new Date().toISOString(),
  }));
}

/** 업로드 삭제 — 매칭 후 적절한 노드로 이관됐을 때 호출 (현재는 그냥 삭제만) */
export async function removePendingUpload(uploadId: string): Promise<void> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  await rtdbRemove(ref(db, `${PATH}/${uploadId}`));
}

/** 라이브 구독 — pending(미매칭) 만 또는 전체 */
export function usePendingUploads(opts?: { onlyPending?: boolean }): PendingUpload[] {
  const [data, setData] = useState<PendingUpload[]>([]);
  const onlyPending = opts?.onlyPending ?? true;
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try { await ensureAuth(); } catch { /* silent */ }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) return;
      unsub = onValue(ref(db, PATH), (snap) => {
        const val = (snap.val() ?? {}) as Record<string, PendingUpload>;
        let list = Object.values(val);
        if (onlyPending) list = list.filter((u) => u.status === 'pending');
        list.sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''));
        setData(list);
      });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [onlyPending]);
  return data;
}
