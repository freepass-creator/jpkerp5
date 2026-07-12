'use client';

import { getFirebaseAuth } from './firebase/client';
import { crosscheckOcr, type CrosscheckResult } from './ocr-crosscheck';
import type { OcrOriginal } from './types';

/**
 * 단일 OCR 호출 헬퍼 — /api/ocr/extract(멀티파트 + Bearer)의 **유일한** 클라이언트 진입점.
 *
 * 모든 OCR 호출부(배치 훅 useOcrBatch, 단건 업로드, 모바일)는 이 함수만 부른다.
 * 손롤 fetch 금지 — 규격(FormData(file,type) + Authorization + json.extracted) 통일 +
 * 원본보존(_ocrOriginal)·검산(crosscheck) 자동 산출을 여기서 보장.
 */
export type OcrExtractResult = {
  /** 추출 원본 JSON */
  raw: Record<string, unknown>;
  /** 영구보존 스냅샷 (저장 레코드에 _ocrOriginal 로 실림) */
  ocrOriginal: OcrOriginal;
  /** 내부정합 검산 (낮은 confidence → UI ⚠) */
  crosscheck: CrosscheckResult;
};

export async function callOcrExtract(file: File, docType: string): Promise<OcrExtractResult> {
  const auth = getFirebaseAuth();
  const user = auth?.currentUser;
  if (!user) throw new Error('로그인이 필요합니다. 우측 상단에서 로그인 후 다시 시도하세요.');
  const idToken = await user.getIdToken();

  const fd = new FormData();
  fd.append('file', file);
  fd.append('type', docType);

  const res = await fetch('/api/ocr/extract', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
    body: fd,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'OCR 실패');

  const raw = (json.extracted ?? {}) as Record<string, unknown>;
  return {
    raw,
    ocrOriginal: { raw, at: new Date().toISOString(), source: docType },
    crosscheck: crosscheckOcr(docType, raw),
  };
}
