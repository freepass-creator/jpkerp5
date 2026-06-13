'use client';

/**
 * 모바일 업로드 — 사진 + 통화녹음 통합 일괄 업로드.
 *
 * 파일 종류 자동 분기:
 *  · image/* → 사진 (차량 선택 → 카테고리 → vehicle_attachments/{id}/photos)
 *  · audio/* → 통화녹음 (파일명에서 전화번호 → contracts.customerPhone 매칭 → contact_logs)
 *
 * 파일명 전화번호 자동 추출:
 *  · `010-1234-5678_2026-06-13_14-30.amr` 같은 형식 매칭
 *  · 매칭된 Contract.customerPhone1/2 → contact_logs/{contractId} 자동 push
 *  · STT (Google Cloud Speech) 비동기 처리
 *
 * Phase 1 (이번 라운드): 업로드 zone + 파일 목록 placeholder
 * Phase 2: 실제 업로드 처리 + 전화번호 매칭 + STT 큐
 */

import { useState } from 'react';
import { UploadSimple, Image as ImageIcon, MicrophoneStage, FileX } from '@phosphor-icons/react';

type QueuedFile = {
  id: string;
  file: File;
  kind: 'image' | 'audio' | 'unknown';
  detectedPhone?: string;
  matchedContractId?: string;
  status: 'pending' | 'uploading' | 'done' | 'failed';
};

const PHONE_REGEX = /(\d{2,3})-?(\d{3,4})-?(\d{4})/;

function detectKind(file: File): 'image' | 'audio' | 'unknown' {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'unknown';
}

function extractPhone(fileName: string): string | undefined {
  const m = fileName.match(PHONE_REGEX);
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export default function MobileUpload() {
  const [queue, setQueue] = useState<QueuedFile[]>([]);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const next: QueuedFile[] = Array.from(files).map((f) => ({
      id: `q-${Math.random().toString(36).slice(2, 10)}`,
      file: f,
      kind: detectKind(f),
      detectedPhone: extractPhone(f.name),
      status: 'pending',
    }));
    setQueue((q) => [...q, ...next]);
  }

  const counts = {
    image: queue.filter((q) => q.kind === 'image').length,
    audio: queue.filter((q) => q.kind === 'audio').length,
    unknown: queue.filter((q) => q.kind === 'unknown').length,
  };

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <UploadSimple size={22} weight="duotone" />
          업로드
        </h1>
      </header>

      <label htmlFor="upload-input" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        padding: 28, background: 'var(--brand-bg)', color: 'var(--brand)',
        border: '2px dashed var(--brand)', borderRadius: 'var(--radius-lg)',
        cursor: 'pointer', touchAction: 'manipulation',
      }}>
        <UploadSimple size={32} weight="bold" />
        <div style={{ fontSize: 14, fontWeight: 700 }}>탭해서 파일 선택</div>
        <div style={{ fontSize: 11, opacity: 0.85 }}>사진 또는 통화녹음 (여러 개 가능)</div>
        <input
          id="upload-input"
          type="file"
          multiple
          accept="image/*,audio/*"
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      {queue.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <SummaryBox icon={<ImageIcon size={16} weight="duotone" />} label="사진" count={counts.image} tone="green" />
            <SummaryBox icon={<MicrophoneStage size={16} weight="duotone" />} label="녹음" count={counts.audio} tone="blue" />
            <SummaryBox icon={<FileX size={16} weight="duotone" />} label="알 수 없음" count={counts.unknown} tone="orange" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {queue.map((q) => (
              <FileRow key={q.id} item={q} onRemove={(id) => setQueue((qs) => qs.filter((x) => x.id !== id))} />
            ))}
          </div>

          <button
            type="button"
            className="btn btn-primary"
            style={{ height: 48, fontSize: 14, fontWeight: 700 }}
            onClick={() => {
              alert('다음 라운드: 실제 업로드 + 전화번호 매칭 + STT');
            }}
          >
            {queue.length}개 업로드 시작
          </button>
        </>
      )}
    </div>
  );
}

function SummaryBox({ icon, label, count, tone }: { icon: React.ReactNode; label: string; count: number; tone: 'green' | 'blue' | 'orange' }) {
  const tones = {
    green:  { bg: 'var(--green-bg)',  fg: 'var(--green-text)' },
    blue:   { bg: 'var(--blue-bg)',   fg: 'var(--blue-text)' },
    orange: { bg: 'var(--orange-bg)', fg: 'var(--orange-text)' },
  } as const;
  const c = tones[tone];
  return (
    <div style={{
      padding: 10, background: c.bg, color: c.fg,
      borderRadius: 'var(--radius-md)', textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    }}>
      {icon}
      <div style={{ fontSize: 18, fontWeight: 700 }}>{count}</div>
      <div style={{ fontSize: 10, opacity: 0.85 }}>{label}</div>
    </div>
  );
}

function FileRow({ item, onRemove }: { item: QueuedFile; onRemove: (id: string) => void }) {
  const kindIcon = item.kind === 'image' ? <ImageIcon size={18} weight="duotone" />
    : item.kind === 'audio' ? <MicrophoneStage size={18} weight="duotone" />
    : <FileX size={18} weight="duotone" />;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: 10, background: 'var(--bg-card)',
      border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-md)',
    }}>
      {kindIcon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.file.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-weak)' }}>
          {(item.file.size / 1024).toFixed(0)} KB
          {item.detectedPhone && (
            <> · 📞 <span className="mono">{item.detectedPhone}</span></>
          )}
        </div>
      </div>
      <button type="button" onClick={() => onRemove(item.id)} style={{
        padding: 6, background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--text-weak)',
      }} aria-label="제거">✕</button>
    </div>
  );
}
