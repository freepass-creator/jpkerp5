'use client';

/**
 * 모바일 업로드 — 사진/문서/통화녹음 등 일단 업로드 후 매칭 (Phase A).
 *
 * 흐름:
 *  1. 파일 선택 (이미지/PDF/오디오/기타) — 자동 종류 감지
 *  2. 파일별 분류 선택 (상품화/등록증/견적서/통화녹음 등)
 *  3. (선택) 차량/계약 매칭
 *  4. 업로드:
 *      · 매칭 됐으면 vehicle_attachments / contact_logs 등 적절한 노드로
 *      · 매칭 안 됐으면 pending_uploads 로 (수동 매칭 대기)
 *
 * Phase B (다음): STT 자동, OCR 자동 매칭, 신뢰도 기반 자동/추천/미매칭 분류.
 */

import { useMemo, useRef, useState } from 'react';
import {
  UploadSimple, Image as ImageIcon, FilePdf, MicrophoneStage, File as FileIcon,
  MagnifyingGlass, X, Plus,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/use-auth';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import {
  usePendingUploads, addPendingUpload, matchUpload, removePendingUpload,
  detectKind, extractPhone, fileToDataUrl,
  SUB_CATEGORY_LABEL, SUB_CATEGORIES_BY_KIND,
  type UploadKind, type PendingUpload,
} from '@/lib/firebase/pending-uploads-store';
import { addFieldLog } from '@/lib/firebase/field-logs-store';
import { addVehiclePhoto, type VehiclePhotoKind } from '@/lib/firebase/vehicle-attachments-store';
import { tryAutoMatch, extractOcrHints, findCustomerByLicenseNo } from '@/lib/firebase/upload-auto-match';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';
// Phase 2.1 — intake 평행 기록 (기존 흐름 유지)
import {
  addIntakeItem, setIntakeClassify, setIntakeMatch, markIntakeCommitted,
} from '@/lib/firebase/intake-store';
import { classify as intakeClassify } from '@/lib/intake/classify';
import type { ClassifyResult, MatchResult } from '@/lib/intake/types';

type DraftFile = {
  id: string;
  file: File;
  kind: UploadKind;
  subCategory: string;
  contractId?: string;
  detectedPhone?: string;
  uploading?: boolean;
};

export default function MobileUpload() {
  const { user } = useAuth();
  const { contracts } = useContracts();
  const { vehicles } = useVehicles();
  const [drafts, setDrafts] = useState<DraftFile[]>([]);
  const pendingList = usePendingUploads({ onlyPending: true });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const next: DraftFile[] = Array.from(files).map((f) => {
      const k = detectKind(f.type);
      const subs = SUB_CATEGORIES_BY_KIND[k];
      // 디폴트 분류: audio=call / image=product / document=registration / 기타=general
      const defaultSub =
        k === 'audio'    ? 'call'
        : k === 'image'  ? 'product'
        : k === 'document' ? 'registration'
        : (subs[0] ?? 'other');
      return {
        id: `d-${Math.random().toString(36).slice(2, 10)}`,
        file: f, kind: k, subCategory: defaultSub,
        detectedPhone: k === 'audio' ? extractPhone(f.name) : undefined,
      };
    });
    setDrafts((d) => [...d, ...next]);
  }

  function updateDraft(id: string, patch: Partial<DraftFile>) {
    setDrafts((arr) => arr.map((d) => d.id === id ? { ...d, ...patch } : d));
  }
  function removeDraft(id: string) {
    setDrafts((arr) => arr.filter((d) => d.id !== id));
  }

  /**
   * 1건 업로드 — 자동 매칭 시도 → 매칭되면 즉시 destination 으로 / 실패면 pending.
   *
   * Phase B-2: image + 분류(license/registration/insurance) → OCR 자동 호출 → 차량번호/면허번호 추출.
   */
  async function uploadOne(draft: DraftFile): Promise<{ matched: boolean }> {
    const dataUrl = await fileToDataUrl(draft.file);
    const by = user?.email ?? undefined;

    // ─── Phase 2.1 intake 평행 기록 (시작) ───
    // 모든 모바일 업로드를 intake/ 에 audit 로그 → 차후 /inbox 페이지·worker 가
    // 이걸 source-of-truth 로 사용. 기존 pending_uploads / vehicle_photos /
    // field_logs 흐름은 그대로 유지 (regression 0).
    let intakeId: string | null = null;
    try {
      intakeId = await addIntakeItem({
        source: 'mobile-upload',
        raw: {
          mode: 'file',
          file: { name: draft.file.name, type: draft.file.type, size: draft.file.size },
          dataUrl,
        },
        createdBy: by,
      });
    } catch (e) {
      console.warn('[intake] addIntakeItem 실패 (기존 흐름 계속 진행)', e);
    }
    // ─── intake 평행 기록 (끝) ───

    // OCR 자동 추출 (image + 분류가 OCR 지원 종류일 때만)
    let ocrPlate: string | undefined;
    let ocrLicenseNo: string | undefined;
    if (draft.kind === 'image' && ['license', 'registration', 'insurance'].includes(draft.subCategory)) {
      const ocr = await extractOcrHints(dataUrl, draft.file.type, draft.subCategory);
      if (ocr) {
        ocrPlate = ocr.plate;
        ocrLicenseNo = ocr.licenseNo;
      }
    }

    // intake classify — 파일 메타 + OCR fields 로 정밀 분류
    if (intakeId) {
      const ocrFields = (ocrPlate || ocrLicenseNo) ? {
        ...(ocrPlate ? { plate: ocrPlate } : {}),
        ...(ocrLicenseNo ? { license_no: ocrLicenseNo } : {}),
      } : undefined;
      const classifyResult: ClassifyResult = intakeClassify({
        mode: 'file',
        file: { name: draft.file.name, type: draft.file.type, size: draft.file.size },
        ocrFields,
      });
      try { await setIntakeClassify(intakeId, classifyResult, by); }
      catch (e) { console.warn('[intake] setIntakeClassify 실패', e); }
    }

    // 1차: 전화번호 / 차량번호 매칭
    let autoMatch = tryAutoMatch({
      kind: draft.kind,
      detectedPhone: draft.detectedPhone,
      detectedPlate: ocrPlate,
      contracts,
      vehicles,
    });

    // 2차: 면허번호 매칭 (Phase B-2)
    if (!autoMatch && ocrLicenseNo) {
      autoMatch = findCustomerByLicenseNo(ocrLicenseNo, contracts, vehicles);
    }

    // intake 에 매칭 결과 부착
    if (intakeId) {
      const matchResult: MatchResult = autoMatch
        ? {
            contractId: autoMatch.contractId,
            vehicleId: autoMatch.vehicleId,
            customerKey: autoMatch.customerKey,
            confidence: 'high',
            reason: autoMatch.reason,
          }
        : { confidence: 'none', reason: '자동 매칭 실패' };
      try { await setIntakeMatch(intakeId, matchResult, autoMatch ? 'matched' : 'pending', by); }
      catch (e) { console.warn('[intake] setIntakeMatch 실패', e); }
    }

    if (autoMatch && autoMatch.confidence === 'high') {
      // 자동 매칭 성공 → 분류별 destination 으로 직접 저장 (pending 안 거침)
      const committedRefs: NonNullable<import('@/lib/intake/types').IntakeItem['committed']> = [];
      if (draft.kind === 'image' && autoMatch.vehicleId) {
        const photoKind: VehiclePhotoKind =
          draft.subCategory === 'product' ? 'product'
          : draft.subCategory === 'delivery' ? 'delivery'
          : draft.subCategory === 'return' ? 'return'
          : 'product';
        const vpId = `vp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await addVehiclePhoto(autoMatch.vehicleId, {
          id: vpId,
          kind: photoKind,
          url: dataUrl,
          fileName: draft.file.name,
          uploadedAt: new Date().toISOString(),
          uploadedBy: by,
          contractId: autoMatch.contractId,
          eventDate: new Date().toISOString().slice(0, 10),
        });
        committedRefs.push({ node: `vehicle_attachments/${autoMatch.vehicleId}`, id: vpId });
      } else if (autoMatch.contractId) {
        await addFieldLog(autoMatch.contractId, {
          type: draft.kind === 'audio' ? 'call' : 'memo',
          body: `${SUB_CATEGORY_LABEL[draft.subCategory] ?? draft.subCategory} — ${draft.file.name}\n${autoMatch.reason}`,
          payload: { dataUrl, sizeBytes: draft.file.size, mimeType: draft.file.type },
          vehicleId: autoMatch.vehicleId,
          customerKey: autoMatch.customerKey,
          by,
        });
        committedRefs.push({ node: `field_logs/${autoMatch.contractId}`, id: '(addFieldLog 반환 미사용)' });
      }
      if (intakeId && committedRefs.length > 0) {
        try { await markIntakeCommitted(intakeId, committedRefs, by); }
        catch (e) { console.warn('[intake] markIntakeCommitted 실패', e); }
      }
      return { matched: true };
    }

    // 매칭 실패 → pending 으로 (기존 흐름 유지)
    await addPendingUpload({
      fileName: draft.file.name,
      mimeType: draft.file.type,
      sizeBytes: draft.file.size,
      dataUrl,
      kind: draft.kind,
      subCategory: draft.subCategory,
      detectedPhone: draft.detectedPhone,
      uploadedBy: user?.email ?? undefined,
    });
    return { matched: false };
  }

  async function handleUploadAll() {
    if (drafts.length === 0) return;
    let matched = 0;
    let pending = 0;
    const failedIds = new Set<string>();
    for (const d of drafts) {
      updateDraft(d.id, { uploading: true });
      try {
        const r = await uploadOne(d);
        if (r.matched) matched++;
        else pending++;
      } catch (e) {
        failedIds.add(d.id);
        toast.error(`${d.file.name} 실패: ${(e as Error).message}`);
      }
    }
    // 실패한 파일은 draft 에 남겨 재시도 가능하게 (기존엔 전멸시켜 재선택 강제)
    setDrafts((arr) => arr.filter((d) => failedIds.has(d.id)).map((d) => ({ ...d, uploading: false })));
    const fail = failedIds.size;
    const parts: string[] = [];
    if (matched > 0) parts.push(`${matched}개 자동 매칭`);
    if (pending > 0) parts.push(`${pending}개 미매칭 (수동)`);
    if (fail > 0) parts.push(`${fail}개 실패`);
    toast.success(parts.join(' · '));
  }

  return (
    <div>
      <div style={{ height: 3, background: 'var(--amber-text)' }} />{/* 탭색 = 업로드 amber */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 파일 선택 zone */}
      <label htmlFor="upload-input" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        padding: 28, background: 'var(--brand-bg)', color: 'var(--brand)',
        border: '2px dashed var(--brand)', borderRadius: 'var(--radius-lg)',
        cursor: 'pointer', touchAction: 'manipulation',
      }}>
        <UploadSimple size={32} weight="bold" />
        <div style={{ fontSize: 14, fontWeight: 700 }}>탭해서 파일 선택</div>
        <div style={{ fontSize: 11, opacity: 0.85 }}>
          사진 · 통화녹음 · PDF · 등록증 · 견적서 등 (여러 개)
        </div>
        <input
          ref={fileInputRef}
          id="upload-input" type="file" multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      {/* 업로드 대기 (drafts) */}
      {drafts.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-sub)' }}>
            업로드 대기 ({drafts.length})
          </div>
          {drafts.map((d) => (
            <DraftCard key={d.id} draft={d} onChange={(p) => updateDraft(d.id, p)} onRemove={() => removeDraft(d.id)} />
          ))}
          <button type="button" onClick={handleUploadAll} disabled={drafts.some((d) => d.uploading)}
            style={{
              height: 48, fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
              background: 'var(--brand)', color: '#fff', border: 'none',
              borderRadius: 'var(--radius)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <UploadSimple size={16} weight="bold" />
            {drafts.length}개 업로드
          </button>
        </section>
      )}

      {/* 미매칭 (pending) — 수동 매칭 대기 */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-sub)' }}>
          미매칭 ({pendingList.length})
        </div>
        {pendingList.length === 0 ? (
          <div style={{
            padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-weak)',
            background: 'var(--bg-sunken)', borderRadius: 'var(--radius-lg)',
          }}>
            미매칭 파일 없음
          </div>
        ) : (
          pendingList.map((p) => (
            <PendingCard key={p.id} item={p} userEmail={user?.email ?? undefined} />
          ))
        )}
      </section>
      </div>
    </div>
  );
}

/* ─────────── 업로드 대기 카드 (Draft) ─────────── */

function DraftCard({ draft, onChange, onRemove }: {
  draft: DraftFile;
  onChange: (patch: Partial<DraftFile>) => void;
  onRemove: () => void;
}) {
  const KindIcon = draft.kind === 'image' ? ImageIcon
    : draft.kind === 'audio' ? MicrophoneStage
    : draft.kind === 'document' ? FilePdf : FileIcon;
  const subs = SUB_CATEGORIES_BY_KIND[draft.kind];
  return (
    <div style={{
      padding: 12, background: 'var(--bg-card)',
      border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <KindIcon size={20} weight="duotone" style={{ color: 'var(--brand)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {draft.file.name}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-weak)' }}>
            {(draft.file.size / 1024).toFixed(0)} KB
            {draft.detectedPhone && <> · 📞 <span className="mono">{draft.detectedPhone}</span></>}
          </div>
        </div>
        <button type="button" onClick={onRemove} style={{
          padding: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-weak)',
        }} aria-label="제거"><X size={14} weight="bold" /></button>
      </div>

      {/* 종류 (auto-detected, override possible) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {(['image', 'document', 'audio', 'other'] as UploadKind[]).map((k) => (
          <button key={k} type="button" onClick={() => onChange({ kind: k, subCategory: SUB_CATEGORIES_BY_KIND[k][0] })} style={{
            padding: '4px 10px', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
            background: draft.kind === k ? 'var(--brand)' : 'var(--bg-sunken)',
            color: draft.kind === k ? '#fff' : 'var(--text-sub)',
            border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          }}>
            {k === 'image' ? '사진' : k === 'document' ? '문서' : k === 'audio' ? '음성' : '기타'}
          </button>
        ))}
      </div>

      {/* 분류 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {subs.map((s) => (
          <button key={s} type="button" onClick={() => onChange({ subCategory: s })} style={{
            padding: '4px 10px', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
            background: draft.subCategory === s ? 'var(--brand-bg)' : 'transparent',
            color: draft.subCategory === s ? 'var(--brand)' : 'var(--text-sub)',
            border: `1px solid ${draft.subCategory === s ? 'var(--brand)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          }}>
            {SUB_CATEGORY_LABEL[s] ?? s}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────── 미매칭 카드 (Pending) — 수동 매칭 ─────────── */

function PendingCard({ item, userEmail }: { item: PendingUpload; userEmail?: string }) {
  const [matching, setMatching] = useState(false);
  const KindIcon = item.kind === 'image' ? ImageIcon
    : item.kind === 'audio' ? MicrophoneStage
    : item.kind === 'document' ? FilePdf : FileIcon;

  async function handleDelete() {
    if (!await showConfirm({ title: '이 업로드를 삭제할까요?', danger: true })) return;
    try {
      await removePendingUpload(item.id);
      toast.success('삭제됨');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div style={{
      padding: 12, background: 'var(--bg-card)',
      border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {item.kind === 'image' && item.dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.dataUrl} alt="" style={{
            width: 44, height: 44, objectFit: 'cover',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-soft)',
          }} />
        ) : (
          <div style={{
            width: 44, height: 44, background: 'var(--bg-sunken)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--brand)',
          }}>
            <KindIcon size={22} weight="regular" />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.fileName}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-weak)' }}>
            <span className={`badge-base badge-brand`} style={{ fontSize: 9, marginRight: 4 }}>
              {SUB_CATEGORY_LABEL[item.subCategory ?? 'other'] ?? '기타'}
            </span>
            {item.detectedPhone && <>📞 <span className="mono">{item.detectedPhone}</span> · </>}
            {item.uploadedAt.slice(5, 16).replace('T', ' ')}
          </div>
        </div>
        <button type="button" onClick={handleDelete} style={{
          padding: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-weak)',
        }} aria-label="삭제"><X size={14} weight="bold" /></button>
      </div>

      {!matching ? (
        <button type="button" onClick={() => setMatching(true)} style={{
          padding: '8px 12px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
          background: 'var(--brand)', color: '#fff',
          border: 'none', borderRadius: 'var(--radius)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          cursor: 'pointer',
        }}>
          <Plus size={13} weight="bold" /> 매칭하기
        </button>
      ) : (
        <ContractMatcher
          phoneHint={item.detectedPhone}
          onCancel={() => setMatching(false)}
          onMatch={async (contractId, vehicleId, customerKey) => {
            try {
              // 목적지 write 를 먼저 — matchUpload(status='matched')를 먼저 쓰면
              // 중간 실패 시 미매칭 목록에서 사라지는데 파일은 어디에도 없는 유실 창구가 됨
              if (item.kind === 'image' && vehicleId) {
                const photoKind: VehiclePhotoKind =
                  item.subCategory === 'product' ? 'product'
                  : item.subCategory === 'delivery' ? 'delivery'
                  : item.subCategory === 'return' ? 'return'
                  : 'product';
                await addVehiclePhoto(vehicleId, {
                  id: `vp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  kind: photoKind,
                  url: item.dataUrl,
                  fileName: item.fileName,
                  uploadedAt: item.uploadedAt,
                  uploadedBy: item.uploadedBy,
                  contractId,
                  eventDate: item.uploadedAt.slice(0, 10),
                });
              } else if (contractId) {
                await addFieldLog(contractId, {
                  type: item.kind === 'audio' ? 'call' : 'memo',
                  body: `${SUB_CATEGORY_LABEL[item.subCategory ?? 'other']} — ${item.fileName}`,
                  payload: { dataUrl: item.dataUrl, sizeBytes: item.sizeBytes, mimeType: item.mimeType },
                  vehicleId, customerKey,
                  by: userEmail,
                });
              }
              // 목적지 저장 성공 후에만 매칭 마킹 + pending 제거
              await matchUpload(item.id, {
                matchedContractId: contractId,
                matchedVehicleId: vehicleId,
                matchedCustomerKey: customerKey,
                matchedBy: userEmail,
                subCategory: item.subCategory,
              });
              await removePendingUpload(item.id);
              toast.success('매칭 완료');
            } catch (e) {
              toast.error(`매칭 실패: ${(e as Error).message}`);
            }
          }}
        />
      )}
    </div>
  );
}

/* ─────────── 차량/계약 매칭 검색기 ─────────── */

function ContractMatcher({ phoneHint, onCancel, onMatch }: {
  phoneHint?: string;
  onCancel: () => void;
  onMatch: (contractId: string, vehicleId?: string, customerKey?: string) => Promise<void>;
}) {
  const { contracts } = useContracts();
  const { vehicles } = useVehicles();
  const initialQ = phoneHint ?? '';
  const [q, setQ] = useState(initialQ);

  const matches = useMemo(() => {
    const query = q.trim().toLowerCase().replace(/[^\w가-힣]/g, '');
    if (!query) return [];
    return contracts.filter((c) =>
      `${c.vehiclePlate ?? ''}${c.customerName ?? ''}${c.customerPhone1 ?? ''}${c.customerPhone2 ?? ''}`
        .toLowerCase().replace(/[^\w가-힣]/g, '').includes(query),
    ).slice(0, 7);
  }, [contracts, q]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', background: 'var(--bg-sunken)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      }}>
        <MagnifyingGlass size={14} weight="bold" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="차량번호 / 고객명 / 전화번호" autoFocus
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontFamily: 'inherit' }}
        />
        <button type="button" onClick={onCancel} style={{
          background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-weak)', padding: 2,
        }}><X size={14} weight="bold" /></button>
      </div>
      {matches.map((c) => {
        const vehicleId = vehicles.find((v) =>
          (v.plate ?? '').trim() === (c.vehiclePlate ?? '').trim()
          || (v.plateHistory ?? []).some((p) => (p ?? '').trim() === (c.vehiclePlate ?? '').trim())
        )?.id;
        const customerKey = (c.customerIdentNo ?? '').replace(/\D/g, '') || undefined;
        return (
          <button key={c.id} type="button" onClick={() => void onMatch(c.id, vehicleId, customerKey)} style={{
            padding: '10px 12px', background: 'var(--bg-sunken)',
            border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-sm)',
            cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.vehiclePlate}</strong>
                <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>{c.customerName}</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-weak)' }}>{c.customerPhone1 ?? ''}</div>
            </div>
            <Plus size={14} weight="bold" style={{ color: 'var(--brand)' }} />
          </button>
        );
      })}
    </div>
  );
}
