'use client';

import { createKeyedStore } from './create-keyed-store';
import type { PenaltyWorkItem } from './penalty-pdf';

/**
 * 과태료/통행료 — RTDB 영구 저장. OCR 결과(PenaltyWorkItem) 그대로 보존.
 *
 *  - id: OCR 시점에 부여 (`pen-${ts}-${i}`)
 *  - 순수 파생 `_company`(partner_code 재조회) / `_asset` / `_saving` / `_ocrStatus` / `_duplicate` 는
 *    write 직전 strip — page 진입 시 재계산(re-hydrate).
 *  - 반면 **사실·스냅샷 데이터는 영구 저장**:
 *    · `_phase`(처리중/처리완료) · `_processedAt`(처리일시)
 *    · `_contract`(처리 시점 임차인 스냅샷 — 임차인명/식별번호/주소/계약기간/회사코드).
 *      다른 노드에 사본이 없어 strip 하면 새로고침 시 완료탭 임차인 정보가 통째로 소실됨.
 *    (2026-07-03 감사 수정)
 *  - fileDataUrl(base64) 은 그대로 저장 — OCR 원본 보존 정책에 따라 유지.
 *    추후 용량 이슈 시 Storage 이동 + URL 참조로 전환.
 *
 * 노드: penalties/{id}/{...}
 */
const RUNTIME_FIELDS = [
  '_company', '_asset',
  '_saving', '_ocrStatus', '_ocrError',
  '_duplicate',
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
