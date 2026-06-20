'use client';

/**
 * 자산상세 dialog 안 「계약사실확인서」 섹션.
 *
 *  · 미첨부: [📎 파일 선택] 드롭존 — OCR 자동 호출
 *  · 첨부됨: 파일명 + 매도인/매수인/계약일/매매가 + 액션 (재OCR · 삭제)
 *  · OCR 결과 차량번호가 현재 차량과 다르면 경고
 *  · vehicle 마스터 inline 필드 (contractDocXxx) 자동 업데이트 + audit_log
 *
 * Phase 1: OCR 메타만 저장 (파일 자체는 Firebase Storage 업로드 — Phase 2).
 *          → contractDocFileName 만 기록 + 사용자가 다시 다운로드 X (재첨부로 대체).
 */

import { useRef, useState } from 'react';
import { Paperclip, CircleNotch, CheckCircle, X, Camera, Warning } from '@phosphor-icons/react';
import { DateInput } from '@/components/ui/date-input';
import type { Vehicle } from '@/lib/types';
import { normalizePlateLoose as normalizePlate } from '@/lib/customer-match';
import { fileToDataUrl } from '@/lib/image-compress';
import { showConfirm } from '@/lib/confirm';

type Extracted = {
  car_number?: string;
  vin?: string;
  car_name?: string;
  seller?: string;
  buyer?: string;
  contract_date?: string;
  price?: number;
  notes?: string;
};

export function ContractDocSection({
  vehicle, onUpdate,
}: {
  vehicle: Vehicle;
  onUpdate: (v: Vehicle) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string>('');
  const [pendingFileDataUrl, setPendingFileDataUrl] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Vehicle>(vehicle);

  const hasDoc = !!vehicle.contractDocFileName || !!vehicle.contractDocSeller;

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setExtracted(null);
    setPendingFileName(file.name);
    try {
      // 원본 파일 data URL 보존 — 첨부 보존 (보험증권·자동차등록증 패턴)
      try { setPendingFileDataUrl(await fileToDataUrl(file)); } catch { /* fallback */ }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'contract_doc');

      const { getFirebaseAuth } = await import('@/lib/firebase/client');
      const auth = getFirebaseAuth();
      const user = auth?.currentUser;
      if (!user) throw new Error('로그인이 필요합니다.');
      const idToken = await user.getIdToken();

      const res = await fetch('/api/ocr/extract', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: fd,
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'OCR 실패');
      const raw = json.extracted as Record<string, unknown>;
      setExtracted({
        car_number: (raw.car_number as string) || undefined,
        vin: (raw.vin as string) || undefined,
        car_name: (raw.car_name as string) || undefined,
        seller: (raw.seller as string) || undefined,
        buyer: (raw.buyer as string) || undefined,
        contract_date: (raw.contract_date as string) || undefined,
        price: typeof raw.price === 'number' ? raw.price : undefined,
        notes: (raw.notes as string) || undefined,
      });
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function applyExtracted() {
    if (!extracted) return;
    const now = new Date().toISOString();
    const updated: Vehicle = {
      ...vehicle,
      contractDocFileName: pendingFileName || vehicle.contractDocFileName,
      contractDocUrl: pendingFileDataUrl || vehicle.contractDocUrl,
      contractDocUploadedAt: vehicle.contractDocUploadedAt ?? now,
      contractDocOcrAt: now,
      contractDocSeller: extracted.seller ?? vehicle.contractDocSeller,
      contractDocBuyer: extracted.buyer ?? vehicle.contractDocBuyer,
      contractDocDate: extracted.contract_date ?? vehicle.contractDocDate,
      contractDocPrice: extracted.price ?? vehicle.contractDocPrice,
      contractDocNotes: extracted.notes ?? vehicle.contractDocNotes,
    };
    onUpdate(updated);
    setExtracted(null);
    setPendingFileName('');
    setPendingFileDataUrl('');
  }

  async function clearDoc() {
    if (!await showConfirm({ title: '계약사실확인서 정보를 삭제하시겠습니까?', danger: true })) return;
    onUpdate({
      ...vehicle,
      contractDocFileName: undefined,
      contractDocUploadedAt: undefined,
      contractDocOcrAt: undefined,
      contractDocSeller: undefined,
      contractDocBuyer: undefined,
      contractDocDate: undefined,
      contractDocPrice: undefined,
      contractDocNotes: undefined,
    });
  }

  function saveEdit() {
    onUpdate(draft);
    setEditing(false);
  }

  // 차량번호 미스매치 경고
  const plateMismatch = extracted?.car_number
    && vehicle.plate
    && normalizePlate(extracted.car_number) !== normalizePlate(vehicle.plate);

  return (
    <section className="detail-section">
      <div className="detail-section-header">
        <span className="title">계약사실확인서</span>
        {hasDoc && !editing && !extracted && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button className="btn btn-sm" type="button" onClick={() => { setDraft(vehicle); setEditing(true); }}>
              수정
            </button>
            <button className="btn btn-sm" type="button" onClick={() => fileRef.current?.click()}>
              <Camera size={11} /> 재OCR
            </button>
            <button className="btn btn-sm" type="button" onClick={clearDoc} style={{ color: 'var(--red-text)' }}>
              <X size={11} /> 삭제
            </button>
          </span>
        )}
      </div>
      <div className="detail-section-body">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf"
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files?.[0]) void handleFile(e.target.files[0]); }}
        />

        {/* 미첨부 + OCR 결과 없음 → 드롭존 */}
        {!hasDoc && !extracted && !busy && (
          <div
            className="dropzone"
            style={{ minHeight: 120, cursor: 'pointer' }}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void handleFile(f); }}
          >
            <Paperclip size={20} weight="duotone" style={{ color: 'var(--text-weak)' }} />
            <div style={{ fontSize: 12, marginTop: 8, fontWeight: 500 }}>계약사실확인서 첨부</div>
            <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 4 }}>
              JPG / PNG / PDF — Gemini OCR로 매도인·매수인·계약일·금액 자동 추출
            </div>
          </div>
        )}

        {/* OCR 처리 중 */}
        {busy && (
          <div style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-sub)' }}>
            <CircleNotch size={16} weight="bold" style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 12 }}>OCR 처리 중 — Gemini가 계약사실확인서를 분석 중입니다 (약 2~3초)</span>
          </div>
        )}

        {/* OCR 결과 확인 */}
        {extracted && !busy && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--green-text)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle size={12} weight="duotone" /> OCR 추출 완료 — 확인 후 저장
            </div>
            {plateMismatch && (
              <div style={{
                padding: '6px 10px', background: 'var(--orange-bg)', color: 'var(--orange-text)',
                fontSize: 11, borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Warning size={12} weight="duotone" />
                차량번호 불일치 — 문서: <strong>{extracted.car_number}</strong>, 현재 차량: <strong>{vehicle.plate}</strong>
              </div>
            )}
            <div className="detail-grid-2">
              <div className="detail-field"><div className="label">차량번호</div><div className="value mono">{extracted.car_number ?? '-'}</div></div>
              <div className="detail-field"><div className="label">차대번호</div><div className="value mono">{extracted.vin ?? '-'}</div></div>
              <div className="detail-field"><div className="label">차명</div><div className="value">{extracted.car_name ?? '-'}</div></div>
              <div className="detail-field"><div className="label">계약일</div><div className="value mono">{extracted.contract_date ?? '-'}</div></div>
              <div className="detail-field"><div className="label">매도인</div><div className="value">{extracted.seller ?? '-'}</div></div>
              <div className="detail-field"><div className="label">매수인</div><div className="value">{extracted.buyer ?? '-'}</div></div>
              <div className="detail-field">
                <div className="label">매매가</div>
                <div className="value mono">{extracted.price != null ? `₩${extracted.price.toLocaleString()}` : '-'}</div>
              </div>
              <div className="detail-field"><div className="label">파일명</div><div className="value mono">{pendingFileName}</div></div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button className="btn btn-sm btn-primary" type="button" onClick={applyExtracted}>
                <CheckCircle size={11} /> 이 정보로 저장
              </button>
              <button className="btn btn-sm" type="button" onClick={() => { setExtracted(null); setPendingFileName(''); }}>
                취소
              </button>
            </div>
          </div>
        )}

        {/* 첨부됨 + 편집 X — 정보 표시 */}
        {hasDoc && !editing && !extracted && !busy && (
          <div className="detail-grid-2">
            <div className="detail-field"><div className="label">파일명</div><div className="value mono">{vehicle.contractDocFileName ?? '-'}</div></div>
            <div className="detail-field"><div className="label">계약일</div><div className="value mono">{vehicle.contractDocDate ?? '-'}</div></div>
            <div className="detail-field"><div className="label">매도인</div><div className="value">{vehicle.contractDocSeller ?? '-'}</div></div>
            <div className="detail-field"><div className="label">매수인</div><div className="value">{vehicle.contractDocBuyer ?? '-'}</div></div>
            <div className="detail-field">
              <div className="label">매매가</div>
              <div className="value mono">{vehicle.contractDocPrice != null ? `₩${vehicle.contractDocPrice.toLocaleString()}` : '-'}</div>
            </div>
            <div className="detail-field">
              <div className="label">업로드</div>
              <div className="value mono">{vehicle.contractDocUploadedAt?.slice(0, 10) ?? '-'}</div>
            </div>
            {vehicle.contractDocNotes && (
              <div className="detail-field" style={{ gridColumn: '1 / -1' }}>
                <div className="label">비고</div><div className="value">{vehicle.contractDocNotes}</div>
              </div>
            )}
          </div>
        )}

        {/* 편집 모드 */}
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="detail-grid-2">
              <div className="detail-field">
                <div className="label">매도인</div>
                <input className="input" value={draft.contractDocSeller ?? ''} onChange={(e) => setDraft({ ...draft, contractDocSeller: e.target.value || undefined })} />
              </div>
              <div className="detail-field">
                <div className="label">매수인</div>
                <input className="input" value={draft.contractDocBuyer ?? ''} onChange={(e) => setDraft({ ...draft, contractDocBuyer: e.target.value || undefined })} />
              </div>
              <div className="detail-field">
                <div className="label">계약일</div>
                <DateInput value={draft.contractDocDate ?? ''} onChange={(v) => setDraft({ ...draft, contractDocDate: v || undefined })} style={{ width: 180 }} />
              </div>
              <div className="detail-field">
                <div className="label">매매가</div>
                <input className="input mono" value={draft.contractDocPrice?.toString() ?? ''} onChange={(e) => setDraft({ ...draft, contractDocPrice: parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || undefined })} />
              </div>
              <div className="detail-field" style={{ gridColumn: '1 / -1' }}>
                <div className="label">비고</div>
                <input className="input" value={draft.contractDocNotes ?? ''} onChange={(e) => setDraft({ ...draft, contractDocNotes: e.target.value || undefined })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-sm btn-primary" type="button" onClick={saveEdit}>
                <CheckCircle size={11} /> 저장
              </button>
              <button className="btn btn-sm" type="button" onClick={() => setEditing(false)}>취소</button>
            </div>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 10, padding: 8, background: 'var(--red-bg)', color: 'var(--red-text)', fontSize: 11, borderRadius: 'var(--radius)' }}>
            ❌ {error}
          </div>
        )}
      </div>
    </section>
  );
}
