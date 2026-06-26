'use client';

/**
 * 첨부 파일 — OCR/업로드된 원본 파일을 detail dialog 안에서 노출.
 * 보험증권 detail dialog 패턴을 공용으로 추출.
 *
 *   <AttachedFilePreview title="보험증권" url={p.fileUrl} fileName={p.fileName} uploadedAt={p.uploadedAt} />
 *
 * 기본은 버튼만 표시 (페이지가 이미지/PDF로 지저분해지는 것 방지) — 누르면 원본을 lightbox로 확대 표시.
 * - 이미지 (.png/.jpg/.webp/.gif 또는 data:image) → <img>
 * - PDF 등 → <embed type="application/pdf">
 * - url 비었으면 안내 placeholder (showPlaceholder=true 일 때)
 */

import { useState } from 'react';
import { Eye, X } from '@phosphor-icons/react';

export type AttachedFilePreviewProps = {
  /** 섹션 헤더 표기 (예: '보험증권', '자동차등록증', '할부계약서') */
  title: string;
  /** 파일 URL — data URL 또는 Firebase Storage URL */
  url?: string;
  fileName?: string;
  uploadedAt?: string;
  /** url 없을 때 안내 박스 표시 — default false (섹션 숨김) */
  showPlaceholder?: boolean;
};

export function AttachedFilePreview({
  title, url, fileName, uploadedAt, showPlaceholder = false,
}: AttachedFilePreviewProps) {
  const [open, setOpen] = useState(false);

  if (!url) {
    if (!showPlaceholder) return null;
    return (
      <section className="detail-section">
        <div className="detail-section-header">
          <span>{title}</span>
        </div>
        <div className="detail-section-body">
          <div className="dim" style={{ fontSize: 12, padding: 12, textAlign: 'center' }}>
            첨부 파일 없음 — OCR 등록 시 자동 보관
          </div>
        </div>
      </section>
    );
  }

  const isImage = url.startsWith('data:image') || /\.(png|jpe?g|webp|gif)$/i.test(fileName ?? '');

  return (
    <section className="detail-section">
      <div className="detail-section-header">
        <span>{title}</span>
        {fileName && <span className="dim" style={{ marginLeft: 'auto', fontSize: 10 }}>{fileName}</span>}
      </div>
      <div className="detail-section-body" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
          <Eye size={14} weight="bold" /> 원본 보기
        </button>
        {uploadedAt && (
          <span className="dim" style={{ fontSize: 10 }}>
            업로드 {uploadedAt.slice(0, 16).replace('T', ' ')}
          </span>
        )}
      </div>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: isImage ? 'zoom-out' : 'default',
          }}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="닫기"
            style={{
              position: 'absolute', top: 16, right: 16,
              background: 'rgba(255,255,255,0.12)', border: 0, borderRadius: '50%',
              width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', cursor: 'pointer',
            }}
          >
            <X size={18} weight="bold" />
          </button>
          {isImage ? (
            <img
              src={url}
              alt={fileName ?? title}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '94vw', maxHeight: '94vh', objectFit: 'contain', cursor: 'default' }}
            />
          ) : (
            <embed
              src={url}
              type="application/pdf"
              onClick={(e) => e.stopPropagation()}
              style={{ width: '90vw', height: '90vh', border: 0, borderRadius: 'var(--radius-sm)', background: '#fff' }}
            />
          )}
        </div>
      )}
    </section>
  );
}
