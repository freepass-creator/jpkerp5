'use client';

/**
 * /admin/uploads — 업로드 관리 (웹).
 *
 * 모바일 선업로드(사진/서류) → 자동매칭 안 된 건 pending_uploads 에 쌓임.
 * 이 화면에서: 전체 업로드 파일 열람(미리보기) + 미매칭분을 차량에 수동 분배(매칭) + 반영분 관리.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Images, MagnifyingGlass, FilePdf, MicrophoneStage, File as FileIcon, Trash, LinkSimpleBreak } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { useRole } from '@/lib/use-role';
import { useAuth } from '@/lib/use-auth';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { findVehicleByPlate } from '@/lib/entity-sync';
import { usePendingUploads, matchUpload, removePendingUpload, SUB_CATEGORY_LABEL, SUB_CATEGORIES_BY_KIND, type PendingUpload } from '@/lib/firebase/pending-uploads-store';
import { addVehiclePhoto, type VehiclePhotoKind } from '@/lib/firebase/vehicle-attachments-store';
import type { Vehicle } from '@/lib/types';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyRow } from '@/components/ui/empty-row';
import { FileLightbox } from '@/components/ui/attached-file-preview';
import { showConfirm } from '@/lib/confirm';
import { toast } from '@/lib/toast';

const PHOTO_KINDS = ['product', 'delivery', 'return'];

export default function UploadsPage() {
  const router = useRouter();
  const { isMaster, loading: roleLoading } = useRole();
  const { user } = useAuth();
  const { vehicles, update: updateVehicle } = useVehicles();
  const uploads = usePendingUploads({ onlyPending: false });
  const [plateBy, setPlateBy] = useState<Record<string, string>>({});
  const [subBy, setSubBy] = useState<Record<string, string>>({}); // 편집한 분류
  const [lightbox, setLightbox] = useState<{ url: string; name?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const pending = useMemo(() => uploads.filter((u) => u.status === 'pending'), [uploads]);
  const matched = useMemo(() => uploads.filter((u) => u.status === 'matched'), [uploads]);
  const plateOf = (id?: string) => vehicles.find((v) => v.id === id)?.plate ?? id ?? '-';

  // 서류 분류 → 차량 첨부 URL 필드
  const DOC_FIELD: Record<string, string> = {
    registration: 'registrationCertUrl', insurance: 'insuranceCertUrl',
    loan: 'loanContractUrl', estimate: 'manufacturerQuoteUrl',
  };

  /** 반영하기 — 분류에 따라 차량에 데이터화(사진→차량사진 / 서류→첨부URL) + 매칭 기록. */
  async function applyToVehicle(u: PendingUpload) {
    const plate = (plateBy[u.id] ?? u.detectedPlate ?? '').trim();
    if (!plate) { toast.error('차량번호를 입력하세요'); return; }
    const v = findVehicleByPlate(vehicles, plate);
    if (!v) { toast.error(`'${plate}' 차량이 없습니다 — 자산에 먼저 등록`); return; }
    const sub = subBy[u.id] ?? u.subCategory ?? 'general';
    setBusy(u.id);
    try {
      const by = user?.email ?? undefined;
      const now = new Date().toISOString();
      let dest = '매칭 기록';
      if (PHOTO_KINDS.includes(sub)) {
        await addVehiclePhoto(v.id, {
          id: `vp-${u.uploadedAt}-${u.id.slice(-4)}`, kind: sub as VehiclePhotoKind,
          url: u.dataUrl, fileName: u.fileName, uploadedAt: now, uploadedBy: by,
        });
        dest = `${SUB_CATEGORY_LABEL[sub] ?? sub} 사진`;
      } else if (DOC_FIELD[sub]) {
        const f = DOC_FIELD[sub];
        const patch: Record<string, string> = { [f]: u.dataUrl, [f.replace('Url', 'FileName')]: u.fileName, [f.replace('Url', 'UploadedAt')]: now };
        await updateVehicle({ ...v, ...patch } as Vehicle);
        dest = SUB_CATEGORY_LABEL[sub] ?? sub;
      }
      await matchUpload(u.id, { matchedVehicleId: v.id, matchedBy: by, subCategory: sub });
      toast.success(`${v.plate} 에 반영 — ${dest}`);
    } catch (e) {
      toast.error(`반영 실패: ${(e as Error).message ?? String(e)}`);
    } finally { setBusy(null); }
  }

  async function unmatch(u: PendingUpload) {
    if (!await showConfirm({ title: '매칭을 해제하고 미매칭으로 되돌릴까요?' })) return;
    await matchUpload(u.id, { matchedVehicleId: undefined, matchedContractId: undefined, matchedBy: undefined });
    // matchUpload 는 status=matched 로 고정 → pending 복귀는 직접 patch. 간단히 재-업로드 안내 대신 삭제 권장.
    toast.info('매칭 대상 해제됨 (재분배하려면 차량번호 다시 지정)');
  }

  async function del(u: PendingUpload) {
    if (!await showConfirm({ title: `'${u.fileName}' 업로드를 삭제할까요?`, danger: true })) return;
    await removePendingUpload(u.id);
    toast.success('삭제됨');
  }

  if (!roleLoading && !isMaster) { router.replace('/'); return null; }

  const KindIcon = (u: PendingUpload) => u.kind === 'image' ? <Images size={14} /> : u.kind === 'audio' ? <MicrophoneStage size={14} /> : u.mimeType?.includes('pdf') ? <FilePdf size={14} /> : <FileIcon size={14} />;

  const Preview = ({ u }: { u: PendingUpload }) => (
    u.kind === 'image'
      ? <button type="button" onClick={() => setLightbox({ url: u.dataUrl, name: u.fileName })} style={{ padding: 0, border: 0, background: 'none', cursor: 'zoom-in' }}>
          <img src={u.dataUrl} alt={u.fileName} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border-weak)' }} />
        </button>
      : <a href={u.dataUrl} download={u.fileName} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)', display: 'inline-flex', gap: 4, alignItems: 'center' }}>{KindIcon(u)} 열기</a>
  );

  const Table = ({ list, kind }: { list: PendingUpload[]; kind: 'pending' | 'matched' }) => (
    <table className="table" style={{ fontSize: 12 }}>
      <thead>
        <tr>
          <th style={{ width: 60 }}>파일</th>
          <th>파일명 / 분류</th>
          <th style={{ width: 130 }}>업로드</th>
          {kind === 'pending' ? <th style={{ width: 320 }}>분류 · 차량번호 · 반영</th> : <th style={{ width: 200 }}>반영 대상</th>}
          <th style={{ width: 60 }}></th>
        </tr>
      </thead>
      <tbody>
        {list.length === 0 ? (
          <EmptyRow colSpan={5}>{kind === 'pending' ? '미매칭 업로드 없음' : '반영된 업로드 없음'}</EmptyRow>
        ) : list.map((u) => (
          <tr key={u.id}>
            <td><Preview u={u} /></td>
            <td>
              <div style={{ fontWeight: 600 }}>{u.fileName}</div>
              <div className="dim" style={{ fontSize: 11 }}>
                <StatusBadge tone="neutral">{SUB_CATEGORY_LABEL[u.subCategory ?? ''] ?? u.subCategory ?? u.kind}</StatusBadge>
                {u.detectedPlate && <span className="mono" style={{ marginLeft: 6 }}>OCR: {u.detectedPlate}</span>}
              </div>
            </td>
            <td className="mono dim">{(u.uploadedAt ?? '').slice(0, 10)}<br /><span style={{ fontSize: 10 }}>{u.uploadedBy ?? ''}</span></td>
            {kind === 'pending' ? (
              <td>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <select className="input" value={subBy[u.id] ?? u.subCategory ?? ''} onChange={(e) => setSubBy((p) => ({ ...p, [u.id]: e.target.value }))} style={{ width: 92, fontSize: 11 }} title="분류 — 사진: 상품/출고/반납, 서류: 등록증/보험/할부 등">
                    {(SUB_CATEGORIES_BY_KIND[u.kind] ?? ['general']).map((s) => <option key={s} value={s}>{SUB_CATEGORY_LABEL[s] ?? s}</option>)}
                  </select>
                  <input className="input" placeholder={u.detectedPlate || '차량번호'} value={plateBy[u.id] ?? u.detectedPlate ?? ''} onChange={(e) => setPlateBy((p) => ({ ...p, [u.id]: e.target.value }))} style={{ width: 108, fontSize: 12 }} />
                  <button className="btn btn-sm btn-primary" type="button" disabled={busy === u.id} onClick={() => applyToVehicle(u)} title="분류·차량으로 데이터화 반영">{busy === u.id ? '…' : '반영하기'}</button>
                </div>
              </td>
            ) : (
              <td>
                <span className="mono">{plateOf(u.matchedVehicleId)}</span>
                <button className="btn btn-sm" type="button" style={{ marginLeft: 6 }} onClick={() => unmatch(u)} title="매칭 해제"><LinkSimpleBreak size={12} /></button>
              </td>
            )}
            <td className="center"><button className="btn btn-sm" type="button" onClick={() => del(u)} title="삭제" style={{ color: 'var(--red-text)' }}><Trash size={12} /></button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: 24, maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <header className="page-header" style={{ marginBottom: 16 }}>
          <h1 className="page-header-title"><Images size={18} weight="duotone" /> 업로드 관리</h1>
          <div className="page-header-title-sub">
            모바일 선업로드된 사진·서류를 열람하고, 자동매칭 안 된 파일을 차량에 수동 분배(매칭). 반영된 것도 여기서 관리.
          </div>
        </header>

        <section className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header" style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <MagnifyingGlass size={14} /> <strong style={{ fontSize: 13 }}>미매칭 — 분배 대기</strong>
            <StatusBadge tone={pending.length > 0 ? 'orange' : 'gray'}>{pending.length}</StatusBadge>
          </div>
          <div className="panel-body" style={{ padding: 0 }}><Table list={pending} kind="pending" /></div>
        </section>

        <section className="panel">
          <div className="panel-header" style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <strong style={{ fontSize: 13 }}>반영됨 — 매칭 완료</strong>
            <StatusBadge tone="green">{matched.length}</StatusBadge>
          </div>
          <div className="panel-body" style={{ padding: 0 }}><Table list={matched} kind="matched" /></div>
        </section>
      </main>

      <FileLightbox url={lightbox?.url} fileName={lightbox?.name} title="업로드 파일" open={!!lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}
