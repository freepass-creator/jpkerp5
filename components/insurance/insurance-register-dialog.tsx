'use client';

/**
 * 자동차보험증권 등록 — OCR 1회 클릭 워크플로:
 *
 *   1) 파일 선택 (PDF/PNG/JPG) → /api/ocr/extract?type=insurance_policy
 *   2) raw → buildInsurancePolicyFromOcr (**1회차 자동 산출 — 총보험료 - 2~N회차 합**)
 *   3) 미리보기에서 보험기간/회차/보험료 확인 (수정 가능)
 *   4) [등록] → insurances RTDB + audit
 */

import { useRef, useState } from 'react';
import { Paperclip, CircleNotch, CheckCircle, Warning, Plus } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useInsurances } from '@/lib/firebase/insurance-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { buildInsurancePolicyFromOcr, installmentSum, installmentMatchesTotal, daysToExpiry } from '@/lib/insurance-calc';
import type { InsurancePolicy } from '@/lib/types';
import { toast } from '@/lib/toast';

const fmt = (n: number | undefined): string =>
  n == null ? '-' : `₩${n.toLocaleString('ko-KR')}`;

export function InsuranceRegisterDialog({
  open,
  onOpenChange,
  vehicleId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 선택 차량 ID — vehicleId 매칭 시 InsurancePolicy.vehicleId 자동 set */
  vehicleId?: string;
  onSaved?: (policy: InsurancePolicy) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<InsurancePolicy | null>(null);
  const [fileName, setFileName] = useState<string>('');

  const { add: addPolicy } = useInsurances();
  const { vehicles } = useVehicles();

  async function handleFile(file: File): Promise<void> {
    setBusy(true);
    setError(null);
    setDraft(null);
    setFileName(file.name);
    try {
      const { getFirebaseAuth } = await import('@/lib/firebase/client');
      const auth = getFirebaseAuth();
      const user = auth?.currentUser;
      if (!user) throw new Error('로그인 필요');
      const idToken = await user.getIdToken();

      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'insurance_policy');

      const res = await fetch('/api/ocr/extract', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: fd,
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'OCR 실패');

      const raw = json.extracted as Record<string, unknown>;
      // 차량 매칭 (carNumber → Vehicle.plate)
      const carNumber = String(raw.car_number ?? '').replace(/\s/g, '');
      const matchedVehicle = carNumber
        ? vehicles.find((v) => (v.plate ?? '').replace(/\s/g, '') === carNumber)
        : undefined;

      const policy = buildInsurancePolicyFromOcr(raw, {
        vehicleId: vehicleId ?? matchedVehicle?.id,
        companyCode: matchedVehicle?.company,
      });
      setDraft(policy);
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(): Promise<void> {
    if (!draft) return;
    setBusy(true);
    try {
      const { id: _drop, ...rest } = draft;
      const newId = await addPolicy({ ...rest, fileName });
      toast.success(`보험증권 등록 — ${draft.carNumber ?? '?'} ${draft.insurer ?? ''}`);
      onSaved?.({ ...draft, id: newId, fileName });
      onOpenChange(false);
      setDraft(null);
      setFileName('');
    } catch (e) {
      toast.error(`등록 실패: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const expiry = draft ? daysToExpiry(draft) : null;
  const totalMatch = draft ? installmentMatchesTotal(draft) : true;

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent title="보험증권 등록 — OCR">
        <DialogBody>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf"
            style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files?.[0]) void handleFile(e.target.files[0]); }}
          />

          {!draft && !busy && (
            <div
              className="dropzone"
              style={{ minHeight: 140, cursor: 'pointer', padding: 20 }}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void handleFile(f); }}
            >
              <Paperclip size={22} weight="duotone" style={{ color: 'var(--text-weak)' }} />
              <div style={{ fontSize: 13, marginTop: 8, fontWeight: 500 }}>보험증권 파일 첨부</div>
              <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 4 }}>
                PDF / JPG / PNG — Gemini OCR 로 보험사·기간·차량·담보·보험료·분납회차 자동 추출.
                <br />1회차 보험료는 <strong>총보험료 − 2~N회차 합</strong> 으로 자동 산출.
              </div>
            </div>
          )}

          {busy && (
            <div style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-sub)' }}>
              <CircleNotch size={18} weight="bold" style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 13 }}>OCR 처리 중 — Gemini 가 증권을 분석 중 (약 3~5초)</span>
            </div>
          )}

          {error && (
            <div style={{ padding: 12, background: 'var(--red-bg)', color: 'var(--red-text)', fontSize: 12, borderRadius: 'var(--radius)' }}>
              {error}
            </div>
          )}

          {draft && !busy && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--green-text)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle size={12} weight="duotone" /> OCR 추출 완료 — 확인 후 등록
              </div>

              <section className="detail-section">
                <div className="detail-section-header"><span className="title">보험사·기간</span></div>
                <div className="detail-section-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Field label="보험사" value={draft.insurer} onChange={(v) => setDraft({ ...draft, insurer: v })} />
                  <Field label="상품명" value={draft.productName} onChange={(v) => setDraft({ ...draft, productName: v })} />
                  <Field label="증권번호" value={draft.policyNo} onChange={(v) => setDraft({ ...draft, policyNo: v })} mono />
                  <Field label="계약자" value={draft.contractor} onChange={(v) => setDraft({ ...draft, contractor: v })} />
                  <Field label="피보험자" value={draft.insured} onChange={(v) => setDraft({ ...draft, insured: v })} />
                  <Field label="사업자번호" value={draft.bizNo} onChange={(v) => setDraft({ ...draft, bizNo: v })} mono />
                  <Field label="보험 시작" value={draft.startDate} onChange={(v) => setDraft({ ...draft, startDate: v })} mono placeholder="YYYY-MM-DD" />
                  <Field label="보험 만기" value={draft.endDate} onChange={(v) => setDraft({ ...draft, endDate: v })} mono placeholder="YYYY-MM-DD" />
                </div>
                {expiry != null && (
                  <div style={{ padding: '6px 14px', fontSize: 11, color: expiry < 30 ? 'var(--orange-text)' : 'var(--text-sub)' }}>
                    {expiry > 0 ? `만기까지 ${expiry}일` : expiry === 0 ? '오늘 만기' : `${-expiry}일 전 만기 (만료됨)`}
                  </div>
                )}
              </section>

              <section className="detail-section">
                <div className="detail-section-header"><span className="title">차량 / 운전 조건</span></div>
                <div className="detail-section-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Field label="차량번호" value={draft.carNumber} onChange={(v) => setDraft({ ...draft, carNumber: v })} mono />
                  <Field label="차명" value={draft.carName} onChange={(v) => setDraft({ ...draft, carName: v })} />
                  <Field label="연식" value={draft.carYear ? String(draft.carYear) : undefined} onChange={(v) => setDraft({ ...draft, carYear: Number(v) || undefined })} mono />
                  <Field label="배기량(cc)" value={draft.displacement ? String(draft.displacement) : undefined} onChange={(v) => setDraft({ ...draft, displacement: Number(v) || undefined })} mono />
                  <Field label="운전자 범위" value={draft.driverScope} onChange={(v) => setDraft({ ...draft, driverScope: v })} />
                  <Field label="운전자 연령" value={draft.driverAge} onChange={(v) => setDraft({ ...draft, driverAge: v })} />
                </div>
              </section>

              <section className="detail-section">
                <div className="detail-section-header">
                  <span className="title">보험료 — 1회차 자동 산출</span>
                  {!totalMatch && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--orange-text)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Warning size={11} weight="duotone" /> 분납합계 vs 총보험료 불일치
                    </span>
                  )}
                </div>
                <div className="detail-section-body">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <Stat label="총보험료" value={fmt(draft.totalPremium)} accent="brand" />
                    <Stat label="납입한 보험료 (OCR)" value={fmt(draft.paidPremium)} />
                    <Stat label="분납 합계 (검산)" value={fmt(installmentSum(draft))} accent={totalMatch ? 'green' : 'orange'} />
                  </div>
                  <table className="table" style={{ fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 48 }}>회차</th>
                        <th style={{ width: 110 }}>출금일</th>
                        <th className="num">금액</th>
                        <th className="center" style={{ width: 64 }}>납부</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(draft.installments ?? []).map((it, i) => (
                        <tr key={i} style={{ background: it.cycle === 1 ? 'var(--brand-bg)' : undefined }}>
                          <td className="mono center">{it.cycle}{it.cycle === 1 ? ' (산출)' : ''}</td>
                          <td className="mono">{it.dueDate || '-'}</td>
                          <td className="num mono">{fmt(it.amount)}</td>
                          <td className="center">{it.paid ? '✓' : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="detail-section">
                <div className="detail-section-header"><span className="title">가입 담보 (요약)</span></div>
                <div className="detail-section-body" style={{ fontSize: 11, color: 'var(--text-sub)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {draft.covPersonal1 && <div>대인배상Ⅰ: {draft.covPersonal1}</div>}
                  {draft.covPersonal2 && <div>대인배상Ⅱ: {draft.covPersonal2}</div>}
                  {draft.covProperty && <div>대물배상: {draft.covProperty}</div>}
                  {draft.covSelfAccident && <div>자기신체사고: {draft.covSelfAccident}</div>}
                  {draft.covUninsured && <div>무보험차상해: {draft.covUninsured}</div>}
                  {draft.covSelfVehicle && <div>자기차량손해: {draft.covSelfVehicle}</div>}
                  {draft.covEmergency && <div>긴급출동: {draft.covEmergency}</div>}
                </div>
              </section>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <button className="btn" type="button">취소</button>
          </DialogClose>
          {draft && (
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void handleSave()}>
              <Plus size={14} weight="bold" /> 보험증권 등록
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

function Field({ label, value, onChange, mono, placeholder }: {
  label: string; value: string | undefined; onChange: (v: string | undefined) => void; mono?: boolean; placeholder?: string;
}) {
  return (
    <div className="detail-field">
      <label className="detail-field-label">{label}</label>
      <input
        type="text"
        className={`input input-compact ${mono ? 'mono' : ''}`}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'brand' | 'green' | 'orange' }) {
  const color = accent === 'brand' ? 'var(--brand)'
    : accent === 'green' ? 'var(--green-text)'
    : accent === 'orange' ? 'var(--orange-text)'
    : 'var(--text-main)';
  return (
    <div style={{ padding: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
      <div style={{ fontSize: 10, color: 'var(--text-sub)' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
