'use client';

import { useState } from 'react';
import { Upload, CircleNotch, CheckCircle } from '@phosphor-icons/react';

/**
 * 도메인 무관 OCR 업로드 드롭존 — 클릭 또는 드래그&드롭, 진행 카운터 표시.
 * 자산·과태료·회사 OCR 흐름 공통 사용 (use-ocr-batch 훅과 짝).
 *
 *   <OcrUploadStage
 *     progress={ocr.progress}
 *     busy={ocr.busy}
 *     onFiles={ocr.handleFiles}
 *     idleTitle="자동차등록증 업로드 — 클릭 또는 드래그&드롭"
 *     idleSubtitle="JPG / PNG / PDF — 업로드 즉시 OCR 시작"
 *   />
 */
type Progress = { done: number; total: number };

type Props = {
  /** 진행 상태 — null 이면 idle */
  progress: Progress | null;
  /** 처리 중 (입력 disable 용) */
  busy?: boolean;
  /** 파일 추가 콜백 — 즉시 OCR 시작하는 흐름 */
  onFiles: (files: FileList | File[]) => void;
  /** idle 안내 */
  idleTitle: string;
  idleSubtitle?: string;
  /** progress 보조 안내 */
  progressSubtitle?: string;
  /** input accept (default: image/*,.pdf) */
  accept?: string;
};

export function OcrUploadStage({
  progress,
  busy = false,
  onFiles,
  idleTitle,
  idleSubtitle,
  progressSubtitle = 'Gemini가 문서를 읽고 있습니다',
  accept = 'image/*,.pdf',
}: Props) {
  const [dragging, setDragging] = useState(false);

  return (
    <label
      className={`dropzone block ${dragging ? 'dragging' : ''} ${busy ? 'busy' : ''}`}
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); if (!busy) setDragging(true); }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!busy) setDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); }}
      onDrop={(e) => {
        e.preventDefault(); e.stopPropagation();
        setDragging(false);
        if (busy) return;
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) onFiles(files);
      }}
    >
      <input
        type="file"
        accept={accept}
        multiple
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />
      {progress ? (
        progress.done >= progress.total && progress.total > 0 ? (
          <>
            <CheckCircle size={26} className="mx-auto" style={{ color: 'var(--alert-green-text)' }} />
            <div className="mt-2 text-medium">완료 <strong>{progress.done}</strong> / {progress.total}</div>
            <div className="mt-1 text-weak">분석 결과 확인 후 등록하세요</div>
          </>
        ) : (
          <>
            <CircleNotch size={26} className="mx-auto spin" style={{ color: 'var(--brand)' }} />
            <div className="mt-2 text-medium">OCR 진행 중... <strong>{progress.done}</strong> / {progress.total}</div>
            <div className="mt-1 text-weak">{progressSubtitle}</div>
          </>
        )
      ) : dragging ? (
        <>
          <Upload size={26} className="mx-auto" style={{ color: 'var(--brand)' }} />
          <div className="mt-2 text-medium">여기에 놓기</div>
        </>
      ) : (
        <>
          <Upload size={26} className="mx-auto text-weak" />
          <div className="mt-2 text-medium">{idleTitle}</div>
          {idleSubtitle && <div className="mt-1 text-weak">{idleSubtitle}</div>}
        </>
      )}
    </label>
  );
}
