'use client';

import { useRef, useState } from 'react';
import { runWithConcurrency } from './parallel';
import { getFirebaseAuth } from './firebase/client';

/**
 * 도메인 무관 OCR 배치 훅 — 자산·과태료·회사 등 공통 사용.
 *
 * 흐름: handleFiles → (옵션) PDF 분할 → placeholder 행 추가 → /api/ocr/extract 병렬 호출
 *      → applyResult 로 도메인 데이터 채우기 → 행 _status: 'done' | 'failed'
 *
 *   const ocr = useOcrBatch<MyWorkItem>({
 *     docType: 'vehicle_reg',
 *     createPlaceholder: (file, id) => ({ id, fileName: file.name, _status: 'pending', data: {} }),
 *     applyResult: (prev, raw, allItems) => ({ ...prev, data: mapResult(raw) }),
 *   });
 *   <OcrUploadStage progress={ocr.progress} onFiles={ocr.handleFiles} ... />
 */

export type OcrBatchStatus = 'pending' | 'done' | 'failed';

/** 모든 도메인 WorkItem이 충족해야 하는 최소 형태. */
export interface OcrBatchItem {
  id: string;
  fileName: string;
  _status: OcrBatchStatus;
  _error?: string;
}

type Options<W extends OcrBatchItem> = {
  /** /api/ocr/extract 의 type 파라미터 (vehicle_reg / penalty / business_reg ...) */
  docType: string;
  /** placeholder 행 생성 — 파일 + 고유 ID 받아 초기 WorkItem 반환 (status는 항상 'pending').
   *  PDF→이미지 변환 등 비동기 전처리가 필요하면 Promise 반환. */
  createPlaceholder: (file: File, id: string) => W | Promise<W>;
  /** OCR 성공 시 prev WorkItem + raw + 동일 배치 다른 항목들 → 새 WorkItem 반환 */
  applyResult: (prev: W, raw: Record<string, unknown>, allItems: ReadonlyArray<W>) => W;
  /** 동시성 (default 30) */
  concurrency?: number;
  /** 파일 expand (예: PDF 페이지별 분할). 없으면 file 그대로 1:1. */
  expandFile?: (file: File) => Promise<File[]>;
  /** OCR 보내기 직전 PDF를 이미지로 변환 (선택). Gemini Vision 이 PDF 의 특정 페이지를
   *  놓치는 케이스 대응. 단일 페이지 문서 (자동차등록증·보험증권 1쪽) 에 권장. */
  preconvertPdfToImage?: (file: File) => Promise<File>;
};

export function useOcrBatch<W extends OcrBatchItem>(opts: Options<W>) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const [items, setItems] = useState<W[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  function reset() { setItems([]); setBusy(false); setProgress(null); }
  function removeItem(id: string) { setItems((p) => p.filter((i) => i.id !== id)); }

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    const O = optsRef.current;
    setBusy(true);
    // 즉시 진행 카운터 표시 — createPlaceholder 가 PDF 렌더링 등으로 ~1-2초 걸려도
    // 드롭존이 "먹통" 처럼 보이지 않도록 추정 total 로 progress 먼저 셋팅.
    setProgress((p) => ({ done: p?.done ?? 0, total: (p?.total ?? 0) + arr.length }));

    // 1) PDF 분할 등 파일 확장 (선택)
    const expanded: File[] = [];
    if (O.expandFile) {
      for (const f of arr) {
        try { expanded.push(...await O.expandFile(f)); }
        catch { expanded.push(f); }
      }
    } else {
      expanded.push(...arr);
    }

    // expandFile 후 실제 개수가 다르면 progress.total 보정
    if (expanded.length !== arr.length) {
      setProgress((p) => p ? { done: p.done, total: p.total - arr.length + expanded.length } : { done: 0, total: expanded.length });
    }

    // 2) placeholder 행을 한꺼번에 추가 (createPlaceholder 가 async 인 경우도 지원)
    const stamp = Date.now();
    const placeholders: W[] = await Promise.all(
      expanded.map((f, i) => Promise.resolve(O.createPlaceholder(f, `p-${stamp}-${i}-${Math.random().toString(36).slice(2, 5)}`))),
    );
    setItems((prev) => [...prev, ...placeholders]);

    // 3) 동시성 제한 병렬 OCR
    try {
      await runWithConcurrency(expanded, O.concurrency ?? 30, async (file, i) => {
        const id = placeholders[i].id;
        try {
          let toSend = file;
          if (O.preconvertPdfToImage && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
            try { toSend = await O.preconvertPdfToImage(file); }
            catch { /* 변환 실패 시 원본 PDF 그대로 fallback */ }
          }
          const fd = new FormData();
          fd.append('file', toSend);
          fd.append('type', O.docType);
          const auth = getFirebaseAuth();
          const user = auth?.currentUser;
          const idToken = user ? await user.getIdToken() : '';
          const res = await fetch('/api/ocr/extract', {
            method: 'POST',
            headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
            body: fd,
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'OCR 실패');
          const raw = json.extracted as Record<string, unknown>;
          setItems((prev) => prev.map((it) => {
            if (it.id !== id) return it;
            const applied = optsRef.current.applyResult(it, raw, prev);
            return { ...applied, _status: 'done' as const };
          }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[ocr-batch:${O.docType}]`, err);
          setItems((prev) => prev.map((it) => it.id === id ? { ...it, _status: 'failed' as const, _error: msg } : it));
        } finally {
          setProgress((p) => p ? { done: p.done + 1, total: p.total } : null);
        }
      });
    } finally {
      setBusy(false);
      // batch 끝난 후 "N/N 완료" 표시를 잠깐 유지 — 진행감 확보 (1.5s).
      // 단일 파일이거나 이미 변환된 케이스는 OCR 이 빨라서 progress 가 깜빡 사라지면
      // 사용자가 "작업이 됐는지" 인지하기 어려움. 다음 업로드 시작 시 즉시 갱신되니
      // 이 타이머는 '여운' 용도.
      setTimeout(() => setProgress(null), 1500);
    }
  }

  return { items, setItems, busy, progress, handleFiles, removeItem, reset };
}
