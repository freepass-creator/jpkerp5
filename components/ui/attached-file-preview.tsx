'use client';

/**
 * 첨부 파일 미리보기 — OCR/업로드된 원본 파일을 detail dialog 안에서 노출.
 * 보험증권 detail dialog 패턴을 공용으로 추출.
 *
 *   <AttachedFilePreview title="보험증권" url={p.fileUrl} fileName={p.fileName} uploadedAt={p.uploadedAt} />
 *
 * - 이미지 (.png/.jpg/.webp/.gif 또는 data:image) → <img>
 * - PDF 등 → <embed type="application/pdf">
 * - url 비었으면 안내 placeholder (showPlaceholder=true 일 때)
 */

export type AttachedFilePreviewProps = {
  /** 섹션 헤더 표기 (예: '보험증권', '자동차등록증', '할부계약서') */
  title: string;
  /** 파일 URL — data URL 또는 Firebase Storage URL */
  url?: string;
  fileName?: string;
  uploadedAt?: string;
  /** url 없을 때 안내 박스 표시 — default false (섹션 숨김) */
  showPlaceholder?: boolean;
  /** 미리보기 최대 높이 — default 600 */
  maxHeight?: number;
};

export function AttachedFilePreview({
  title, url, fileName, uploadedAt, showPlaceholder = false, maxHeight = 600,
}: AttachedFilePreviewProps) {
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
      <div className="detail-section-body">
        {isImage ? (
          <img
            src={url}
            alt={fileName ?? title}
            style={{
              maxWidth: '100%', maxHeight,
              border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-sm)',
            }}
          />
        ) : (
          <embed
            src={url}
            type="application/pdf"
            style={{
              width: '100%', height: maxHeight,
              border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-sm)',
            }}
          />
        )}
        {uploadedAt && (
          <div className="dim" style={{ fontSize: 10, marginTop: 6 }}>
            업로드 {uploadedAt.slice(0, 16).replace('T', ' ')}
          </div>
        )}
      </div>
    </section>
  );
}
