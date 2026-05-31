'use client';

import { createKeyedStore } from './create-keyed-store';
import type { PenaltyWorkItem } from './penalty-pdf';

/**
 * 과태료/통행료 — RTDB 영구 저장. OCR 결과(PenaltyWorkItem) 그대로 보존.
 *
 *  - id: OCR 시점에 부여 (`pen-${ts}-${i}`)
 *  - 런타임 hydration `_company` / `_asset` / `_contract` / `_saving` / `_ocrStatus` 등은
 *    write 직전 strip — page 진입 시 매번 재계산되므로 RTDB 에 넣을 필요 없고 용량만 차지.
 *  - fileDataUrl(base64) 은 그대로 저장 — OCR 원본 보존 정책에 따라 유지.
 *    추후 용량 이슈 시 Storage 이동 + URL 참조로 전환.
 *
 * 노드: penalties/{id}/{...}
 */
const RUNTIME_FIELDS = [
  '_company', '_asset', '_contract',
  '_saving', '_ocrStatus', '_ocrError',
  '_phase', '_processedAt', '_duplicate',
] as const;

function stripRuntime(item: PenaltyWorkItem): PenaltyWorkItem {
  const copy: Record<string, unknown> = { ...item };
  for (const k of RUNTIME_FIELDS) delete copy[k];
  return copy as unknown as PenaltyWorkItem;
}

const { useStore } = createKeyedStore<PenaltyWorkItem>({
  path: 'v5/penalties',
  getKey: (p) => p.id,
  storeName: 'penalty-store',
  sortBy: (a, b) => (b.issue_date ?? '').localeCompare(a.issue_date ?? ''),
  serializeItem: stripRuntime,
  alertLabel: '과태료',
});

export const usePenaltyStore = useStore;
