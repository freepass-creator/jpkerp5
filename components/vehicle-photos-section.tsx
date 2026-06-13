'use client';

/**
 * 차량 사진 섹션 — 상품화 / 출고 / 반납 사진 업로드·갤러리.
 *
 * 데이터: vehicle_attachments/{vehicleId}/photos[] (kind 로 분류)
 *
 * 운영현황 상세 다이얼로그 / 자산 상세 다이얼로그 양쪽에서 동일 컴포넌트 사용.
 * vehicleId(자산이 있는 경우) 또는 vehiclePlate(자산이 없는 자동 인식 케이스)
 * 둘 다 받지만 photo 저장은 실제 vehicleId 필요.
 *
 * 사용:
 *   <VehiclePhotosSection vehicleId={v.id} contractId={c?.id} />
 */

import { useMemo, useRef, useState } from 'react';
import { Camera, Trash, ImageSquare } from '@phosphor-icons/react';
import {
  useVehicleAttachments, addVehiclePhoto, removeVehiclePhoto,
  PHOTO_KIND_LABEL, PHOTO_KIND_TONE,
  type VehiclePhoto, type VehiclePhotoKind,
} from '@/lib/firebase/vehicle-attachments-store';
import { fileToDataUrl } from '@/lib/image-compress';
import { useAuth } from '@/lib/use-auth';
import { toast } from '@/lib/toast';

type Props = {
  vehicleId: string | null | undefined;
  /** 출고/반납 사진은 어느 계약 시점인지 — 없으면 상품화만 업로드 가능 */
  contractId?: string;
  /** 디폴트 kind — 운영현황(출고/반납 흐름) 에서 사용 */
  defaultKind?: VehiclePhotoKind;
  /** 보기 전용 (운영자 아님) — 업로드/삭제 숨김 */
  readonly?: boolean;
};

export function VehiclePhotosSection({ vehicleId, contractId, defaultKind = 'product', readonly = false }: Props) {
  const { user } = useAuth();
  const attachments = useVehicleAttachments(vehicleId);
  const photos = useMemo(() => attachments?.photos ?? [], [attachments]);
  const [activeKind, setActiveKind] = useState<VehiclePhotoKind>(defaultKind);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<VehiclePhoto | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    return photos.filter((p) => p.kind === activeKind)
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }, [photos, activeKind]);

  const countByKind = useMemo(() => {
    const m: Record<VehiclePhotoKind, number> = { product: 0, delivery: 0, return: 0 };
    for (const p of photos) m[p.kind] = (m[p.kind] ?? 0) + 1;
    return m;
  }, [photos]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !vehicleId) return;
    if (activeKind !== 'product' && !contractId) {
      toast.error('출고/반납 사진은 계약 정보가 있어야 업로드 가능');
      return;
    }
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const url = await fileToDataUrl(f);
        const photo: VehiclePhoto = {
          id: `vp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          kind: activeKind,
          url,
          fileName: f.name,
          uploadedAt: new Date().toISOString(),
          uploadedBy: user?.email ?? undefined,
          contractId: activeKind === 'product' ? undefined : contractId,
          eventDate: new Date().toISOString().slice(0, 10),
        };
        await addVehiclePhoto(vehicleId, photo);
      }
      toast.success(`${files.length}장 업로드 완료`);
    } catch (e) {
      toast.error('업로드 실패: ' + ((e as Error).message ?? String(e)));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDelete(p: VehiclePhoto) {
    if (!vehicleId) return;
    if (!window.confirm(`이 사진을 삭제할까요?\n\n${p.fileName ?? p.id}`)) return;
    try {
      await removeVehiclePhoto(vehicleId, p.id);
      toast.success('삭제됨');
      if (preview?.id === p.id) setPreview(null);
    } catch (e) {
      toast.error('삭제 실패: ' + ((e as Error).message ?? String(e)));
    }
  }

  if (!vehicleId) {
    return (
      <div style={{ padding: 16, color: 'var(--text-weak)', fontSize: 12, textAlign: 'center' }}>
        자산 등록(차량) 이 먼저 필요 — 자산 페이지에서 차량 등록 후 사진 업로드 가능
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 카테고리 chip — 갯수 같이 표시 */}
      <div className="filter-bar" style={{ flexWrap: 'wrap' }}>
        {(['product', 'delivery', 'return'] as VehiclePhotoKind[]).map((k) => {
          const tone = PHOTO_KIND_TONE[k];
          return (
            <button
              key={k}
              type="button"
              className={`chip chip-tone-${tone} ${activeKind === k ? 'active' : ''}`}
              onClick={() => setActiveKind(k)}
            >
              {PHOTO_KIND_LABEL[k]}
              {countByKind[k] > 0 && <span className="chip-count">{countByKind[k]}</span>}
            </button>
          );
        })}
        {!readonly && (
          <>
            <span className="filter-divider" />
            <button
              type="button"
              className="btn btn-sm"
              disabled={uploading || (activeKind !== 'product' && !contractId)}
              onClick={() => fileInputRef.current?.click()}
              title={activeKind !== 'product' && !contractId ? '계약 정보 필요' : `${PHOTO_KIND_LABEL[activeKind]} 사진 업로드`}
            >
              <Camera size={12} weight="bold" /> {uploading ? '업로드 중…' : `+ ${PHOTO_KIND_LABEL[activeKind]} 사진`}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => void handleFiles(e.target.files)}
            />
          </>
        )}
      </div>

      {/* 갤러리 grid */}
      {filtered.length === 0 ? (
        <div style={{
          padding: 32, textAlign: 'center', fontSize: 12, color: 'var(--text-weak)',
          background: 'var(--bg-sunken)', borderRadius: 'var(--radius-sm)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        }}>
          <ImageSquare size={24} weight="duotone" />
          {PHOTO_KIND_LABEL[activeKind]} 사진 없음
          {readonly && <span style={{ fontSize: 10 }}>운영자가 업로드하면 여기서 확인 가능</span>}
        </div>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6,
        }}>
          {filtered.map((p) => (
            <div
              key={p.id}
              style={{
                position: 'relative',
                aspectRatio: '4 / 3',
                background: 'var(--bg-sunken)',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden', cursor: 'pointer',
              }}
              onClick={() => setPreview(p)}
              title={`${p.fileName ?? p.id}\n${p.uploadedAt.slice(0, 16).replace('T', ' ')}${p.uploadedBy ? ` · ${p.uploadedBy}` : ''}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.fileName ?? '사진'}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              {!readonly && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={(e) => { e.stopPropagation(); void handleDelete(p); }}
                  style={{
                    position: 'absolute', top: 4, right: 4,
                    background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none',
                    width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  title="삭제"
                  aria-label="삭제"
                >
                  <Trash size={11} weight="bold" />
                </button>
              )}
              {p.eventDate && (
                <span style={{
                  position: 'absolute', bottom: 4, left: 4,
                  background: 'rgba(0,0,0,0.55)', color: '#fff',
                  padding: '1px 6px', fontSize: 9.5, fontFamily: 'var(--font-mono)',
                  borderRadius: 'var(--radius-sm)',
                }}>{p.eventDate}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 사진 미리보기 모달 (간단) */}
      {preview && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40,
            cursor: 'zoom-out',
          }}
          onClick={() => setPreview(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.url}
            alt={preview.fileName ?? '사진'}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            onClick={(e) => e.stopPropagation()}
          />
          <div style={{
            position: 'absolute', bottom: 16, left: 16, right: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            color: '#fff', fontSize: 11,
          }}>
            <span>
              {PHOTO_KIND_LABEL[preview.kind]} · {preview.fileName ?? preview.id}
              {preview.eventDate && ` · ${preview.eventDate}`}
              {preview.uploadedBy && ` · ${preview.uploadedBy}`}
            </span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setPreview(null)}
              style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }}
            >닫기 (Esc)</button>
          </div>
        </div>
      )}
    </div>
  );
}
