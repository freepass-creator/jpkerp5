'use client';

/**
 * 계약 detail dialog 의 자산 정보 탭 — VehicleSpecTab.
 *
 * 차량 (자산) 등록증 정보 + 보험증권 정보 표시 + 편집.
 * 원래 contract-detail-dialog.tsx 안에 인라인이었으나 분할 (2026-06-19).
 */

import { useState, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import {
  Car, ClipboardText, Pencil,
} from '@phosphor-icons/react';
import { Section } from '@/components/ui/detail-primitives';
import { Field as SharedField, EditableField as SharedEditableField } from '@/components/ui/editable-field';
import { KpiCard, KpiGrid } from '@/components/ui/kpi-card';
import { type EditableTabHandle } from '@/components/ui/edit-buttons';
import { VehicleRegRegisterDialog } from '@/components/asset/vehicle-reg-register-dialog';
import { InsuranceRegisterDialog } from '@/components/insurance/insurance-register-dialog';
import { useInsurances } from '@/lib/firebase/insurance-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useContracts as useContractsList } from '@/lib/firebase/contracts-store';
import { normPlate } from '@/lib/entity-sync';
import { toast } from '@/lib/toast';
import { formatCurrency, formatDateFull, daysSince } from '@/lib/utils';
import { displayCompanyName } from '@/lib/company-display';
import type { Contract, InsurancePolicy, Vehicle } from '@/lib/types';

const Field = SharedField;
const EditableField = SharedEditableField;

export const VehicleSpecTab = forwardRef<EditableTabHandle, { c: Contract; onUpdate: (u: Contract) => void; onEditingChange?: (e: boolean) => void }>(function VehicleSpecTab({ c, onUpdate, onEditingChange }, ref) {
  const { companies } = useCompanies();
  const { vehicles } = useVehicles();
  const { contracts: allContracts } = useContractsList();
  const [editing, setEditing] = useState(false);
  const [regOpen, setRegOpen] = useState(false);     // 자동차등록증 OCR 다이얼로그 inline
  const [insOpen, setInsOpen] = useState(false);     // 보험증권 OCR 다이얼로그 inline
  const { policies } = useInsurances();
  const currentPolicy = useMemo(() => {
    const key = normPlate(c.vehiclePlate);
    if (!key) return undefined;
    return policies.find((p) => p.carNumber && normPlate(p.carNumber) === key);
  }, [policies, c.vehiclePlate]);
  const [draft, setDraft] = useState<Contract>(c);
  useEffect(() => { if (!editing) setDraft(c); }, [c, editing]);
  useEffect(() => { onEditingChange?.(editing); }, [editing, onEditingChange]);
  const startEdit = () => { setDraft(c); setEditing(true); };
  const cancel = () => { setDraft(c); setEditing(false); };
  const save = () => { onUpdate(draft); setEditing(false); };
  const set = <K extends keyof Contract>(k: K, v: Contract[K]) => setDraft((d) => ({ ...d, [k]: v }));
  useImperativeHandle(ref, () => ({ startEdit, save, cancel, isEditing: () => editing }), [editing, c, draft]);

  // 같은 plate 차량 마스터 (있으면 매입·등록·상품화 일자 가져옴)
  const vehicle = useMemo(
    () => vehicles.find((v) => v.plate?.trim() === c.vehiclePlate?.trim()),
    [vehicles, c.vehiclePlate]
  );

  // 같은 차량의 모든 계약 — 누적 통계 계산용
  const vehicleContracts = useMemo(() => {
    const plate = c.vehiclePlate?.trim();
    if (!plate || plate === '미정') return [c];
    return allContracts.filter((x) => x.vehiclePlate?.trim() === plate);
  }, [allContracts, c]);

  // 누적 입금액
  const totalPaid = vehicleContracts.reduce(
    (sum, con) => sum + (con.schedules ?? []).reduce(
      (s, sch) => s + (sch.payments ?? []).reduce((p, x) => p + x.amount, 0),
      0,
    ), 0,
  );

  return (
    <div className="detail-stack">
{/* KPI — 계약 한 화면 핵심 수치 */}
      <KpiGrid>
        <KpiCard label="월 대여료" value={`₩${(c.monthlyRent ?? 0).toLocaleString()}`} />
        <KpiCard label="보증금" value={`₩${(c.deposit ?? 0).toLocaleString()}`} hint={c.deposit ? undefined : '미입력'} />
        <KpiCard label="누적 미수" value={`₩${(c.unpaidAmount ?? 0).toLocaleString()}`} positive={(c.unpaidAmount ?? 0) === 0 ? undefined : false} hint={c.unpaidSeqCount ? `${c.unpaidSeqCount}회차` : undefined} />
        <KpiCard label="회차" value={`${c.currentSeq ?? 0}/${c.totalSeq ?? 0}`} />
      </KpiGrid>

{/* 기본 식별 */}
      <Section icon={<Car size={12} weight="duotone" />} title="차량 식별">
        <div className="detail-grid-2">
          <div>
            <Field label="차량번호" value={c.vehiclePlate} mono />
            <EditableField label="차종" value={editing ? draft.vehicleModel : c.vehicleModel} editing={editing} onChange={(v) => set('vehicleModel', v)} />
            <Field label="회사" value={displayCompanyName(c.company, companies)} />
            {c.isInventoryPurchase && (
              <Field label="구분" value={<span style={{ color: 'var(--purple-text)', fontWeight: 600 }}>선도구매 (재고)</span>} />
            )}
          </div>
          <div>
            <Field label="계약번호" value={c.contractNo || <span className="muted">-</span>} mono />
            <Field label="현재 계약자" value={c.customerName || <span className="muted">-</span>} />
            <Field label="총 임차 횟수" value={`${vehicleContracts.length}건`} mono />
          </div>
        </div>
      </Section>

      {/* 관련 페이지 바로가기 — 다른 도메인으로 즉시 점프 (실무자 워크플로우) */}
      <Section icon={<Car size={12} weight="duotone" />} title="관련 페이지 바로가기">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 12, marginBottom: 6 }}>
          <a href={`/asset?q=${encodeURIComponent(c.vehiclePlate ?? '')}`} className="btn btn-sm" style={{ textDecoration: 'none' }}>자산 상세 →</a>
          <a href={`/asset/insurance?q=${encodeURIComponent(c.vehiclePlate ?? '')}`} className="btn btn-sm" style={{ textDecoration: 'none' }}>보험증권 →</a>
          <a href={`/asset/loan?q=${encodeURIComponent(c.vehiclePlate ?? '')}`} className="btn btn-sm" style={{ textDecoration: 'none' }}>구매방식 →</a>
          <a href={`/asset/gps?q=${encodeURIComponent(c.vehiclePlate ?? '')}`} className="btn btn-sm" style={{ textDecoration: 'none' }}>GPS →</a>
          <a href={`/asset/repair?q=${encodeURIComponent(c.vehiclePlate ?? '')}`} className="btn btn-sm" style={{ textDecoration: 'none' }}>수선 →</a>
          <a href={`/receivables?q=${encodeURIComponent(c.vehiclePlate ?? '')}`} className="btn btn-sm" style={{ textDecoration: 'none', color: (c.unpaidAmount ?? 0) > 0 ? 'var(--red-text)' : undefined }}>미수 →</a>
          <a href={`/penalty?q=${encodeURIComponent(c.vehiclePlate ?? '')}`} className="btn btn-sm" style={{ textDecoration: 'none' }}>과태료 →</a>
        </div>
        {/* 손님 자가조회 페이지 링크 복사 — 한 링크 (모든 손님 공용, 설정 페이지에서도 복사 가능) */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, paddingTop: 6, borderTop: '1px dashed var(--border-soft)' }}>
          <span className="dim" style={{ fontSize: 11 }}>손님 자가조회 페이지:</span>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => {
              const url = `${window.location.origin}/customer`;
              navigator.clipboard.writeText(url).then(
                () => toast.success('손님 페이지 링크 복사됨 — 카톡/SMS 로 전송'),
                () => prompt('수동 복사', url),
              );
            }}
            title="모든 손님이 같은 링크 사용. 손님이 차량번호 + 주민번호 입력 후 본인 계약 조회."
          >
            📋 손님 페이지 링크 복사
          </button>
          <a href={`/customer`} target="_blank" rel="noopener noreferrer" className="btn btn-sm" style={{ textDecoration: 'none' }}>
            미리보기 →
          </a>
        </div>
      </Section>

      {/* 라이프사이클 일자 — vehicles 마스터에서 가져옴 */}
      <Section icon={<Car size={12} weight="duotone" />} title="차량 라이프사이클">
        <div className="detail-grid-2">
          <div>
            <Field label="매입일" value={formatDateFull(vehicle?.purchasedDate ?? c.purchasedDate) || <span className="muted">-</span>} mono />
            <Field label="등록일" value={formatDateFull(vehicle?.registeredDate ?? c.registeredDate) || <span className="muted">-</span>} mono />
            <Field label="상품화일" value={formatDateFull(vehicle?.readiedDate ?? c.readiedDate) || <span className="muted">-</span>} mono />
          </div>
          <div>
            <Field label="인도일 (현재 계약)" value={formatDateFull(c.deliveredDate) || <span className="muted">-</span>} mono />
            <Field label="반납예정일" value={formatDateFull(c.returnScheduledDate) || <span className="muted">-</span>} mono />
            <Field label="반납일" value={formatDateFull(c.returnedDate) || <span className="muted">-</span>} mono />
          </div>
        </div>
      </Section>

      {/* 계약 조건 — 운영 데이터 */}
      <Section icon={<Car size={12} weight="duotone" />} title="계약 조건 (현재 계약)">
        <div className="detail-grid-2">
          <div>
            <Field label="계약일" value={formatDateFull(c.contractDate) || <span className="muted">-</span>} mono />
            <Field label="약정 개월" value={c.termMonths ? `${c.termMonths}개월` : <span className="muted">-</span>} mono />
            <Field label="장단기" value={c.longTerm ? '장기' : '단기'} />
            <Field label="결제일" value={c.paymentDay ? `매월 ${c.paymentDay}일` : <span className="muted">-</span>} mono />
          </div>
          <div>
            <Field label="월 대여료" value={c.monthlyRent ? `₩${formatCurrency(c.monthlyRent)}` : <span className="muted">-</span>} mono />
            <Field label="보증금" value={c.deposit ? `₩${formatCurrency(c.deposit)}` : <span className="muted">-</span>} mono />
            <Field label="결제방법" value={c.paymentMethod || <span className="muted">-</span>} />
            <Field label="누적 입금액" value={`₩${formatCurrency(totalPaid)}`} mono />
          </div>
        </div>
      </Section>

      {/* 보험·옵션 */}
      <Section icon={<Car size={12} weight="duotone" />} title="보험·옵션">
        <div className="detail-grid-2">
          <div>
            <EditableField label="보험연령(세)" value={editing ? String(draft.insuranceAge ?? '') : (c.insuranceAge ? `${c.insuranceAge}세 이상` : '-')} editing={editing} mono onChange={(v) => set('insuranceAge', Number(v) || undefined)} />
            {editing ? (
              <div className="detail-field is-editing">
                <div className="label">자차여부</div>
                <select
                  value={draft.selfInsured === undefined ? '' : draft.selfInsured ? 'true' : 'false'}
                  onChange={(e) => set('selfInsured', e.target.value === '' ? undefined : e.target.value === 'true')}
                  className="detail-field-input"
                >
                  <option value="">-</option>
                  <option value="true">가입</option>
                  <option value="false">미가입</option>
                </select>
              </div>
            ) : (
              <Field label="자차여부" value={c.selfInsured ? '가입' : (c.selfInsured === false ? '미가입' : <span className="muted">-</span>)} />
            )}
          </div>
          <div>
            <EditableField label="거리한도(km)" value={editing ? String(draft.distanceLimitKm ?? '') : (c.distanceLimitKm ? `${c.distanceLimitKm.toLocaleString()}km` : '-')} editing={editing} mono onChange={(v) => set('distanceLimitKm', Number(v.replace(/[,\s]/g, '')) || undefined)} />
            <EditableField label="보험만기" value={editing ? (draft.insuranceExpiryDate ?? '') : (formatDateFull(c.insuranceExpiryDate) || '-')} editing={editing} mono onChange={(v) => set('insuranceExpiryDate', v || undefined)} placeholder="YYYY-MM-DD" />
          </div>
        </div>
      </Section>

      {/* 컴플라이언스 — 검사·세금·위반 */}
      <Section icon={<Car size={12} weight="duotone" />} title="검사·세금·위반">
        <div className="detail-grid-2">
          <div>
            <Field label="정기검사 만기" value={formatDateFull(c.inspectionDueDate) || <span className="muted">-</span>} mono />
            <Field label="자동차세 납부일" value={formatDateFull(c.vehicleTaxDueDate) || <span className="muted">-</span>} mono />
          </div>
          <div>
            <Field
              label="위반 사항"
              value={c.hasViolations
                ? <span style={{ color: 'var(--red-text)', fontWeight: 600 }}>있음</span>
                : <span className="muted">-</span>}
            />
            <Field label="위반 발생일" value={formatDateFull(c.violationSince) || <span className="muted">-</span>} mono />
          </div>
        </div>
      </Section>

      {/* 비고 */}
      {(c.notes || vehicle?.notes) && (
        <Section icon={<ClipboardText size={12} weight="duotone" />} title="비고">
          <div style={{ fontSize: 12, color: 'var(--text-main)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {c.notes && <div>{c.notes}</div>}
            {vehicle?.notes && vehicle.notes !== c.notes && (
              <div style={{ marginTop: c.notes ? 8 : 0, color: 'var(--text-sub)' }}>
                <span className="dim" style={{ fontSize: 11 }}>차량 마스터: </span>
                {vehicle.notes}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* 등록증 정보 — Vehicle 마스터에서 직접. 미보유 시 inline [등록증 등록] 버튼 */}
      <Section
        icon={<Car size={12} weight="duotone" />}
        title="자동차등록증"
        action={
          vehicle ? (
            <button className="btn btn-sm" type="button" onClick={() => setRegOpen(true)}>
              <Pencil size={11} weight="bold" /> {vehicle.vin ? '등록증 수정' : '등록증 등록'}
            </button>
          ) : null
        }
      >
        <div className="detail-grid-2">
          <div>
            <Field label="차대번호" value={vehicle?.vin || <span className="muted">-</span>} mono />
            <Field label="제조연월" value={vehicle?.manufacturedDate || <span className="muted">-</span>} mono />
            <Field label="외장 색상" value={vehicle?.exteriorColor || <span className="muted">-</span>} />
            <Field label="연료" value={vehicle?.fuelType || <span className="muted">-</span>} />
          </div>
          <div>
            <Field label="배기량" value={vehicle?.displacementCc ? `${vehicle.displacementCc}cc` : <span className="muted">-</span>} mono />
            <Field label="용도" value={vehicle?.vehicleUsage || <span className="muted">-</span>} />
            <Field label="제조사" value={vehicle?.vehicleMaker || <span className="muted">-</span>} />
            <Field label="형식" value={vehicle?.vehicleFormat || <span className="muted">-</span>} />
          </div>
        </div>
        {(!vehicle?.vin) && (
          <div style={{ fontSize: 11, color: 'var(--text-weak)', marginTop: 8 }}>
            ↑ {vehicle ? '자동차등록증 OCR 등록으로 자동 채움' : '같은 차량번호의 자산이 아직 없음 — 운영현황 저장 시 자동 생성됨'}
          </div>
        )}
      </Section>
      <VehicleRegRegisterDialog
        open={regOpen}
        onOpenChange={setRegOpen}
        prefillVehicle={vehicle ?? null}
        onSaved={() => setRegOpen(false)}
      />

      {/* 보험증권 — Vehicle 캐시 또는 InsurancePolicy 마스터에서. 미보유 시 inline [등록] */}
      <Section
        icon={<Car size={12} weight="duotone" />}
        title="보험증권"
        action={
          <button className="btn btn-sm" type="button" onClick={() => setInsOpen(true)}>
            <Pencil size={11} weight="bold" /> {currentPolicy ? '보험증권 수정' : '보험증권 등록'}
          </button>
        }
      >
        <div className="detail-grid-2">
          <div>
            <Field label="보험사" value={currentPolicy?.insurer || vehicle?.insuranceCompany || <span className="muted">-</span>} />
            <Field label="증권번호" value={currentPolicy?.policyNo || vehicle?.insurancePolicyNo || <span className="muted">-</span>} mono />
            <Field label="시작일" value={currentPolicy?.startDate || <span className="muted">-</span>} mono />
            <Field label="만기일" value={currentPolicy?.endDate || vehicle?.insuranceExpiryDate || <span className="muted">-</span>} mono />
          </div>
          <div>
            <Field label="계약자" value={currentPolicy?.contractor || <span className="muted">-</span>} />
            <Field label="피보험자" value={currentPolicy?.insured || <span className="muted">-</span>} />
            <Field label="운전자 범위" value={currentPolicy?.driverScope || <span className="muted">-</span>} />
            <Field label="총보험료" value={currentPolicy?.totalPremium ? `₩${currentPolicy.totalPremium.toLocaleString()}` : <span className="muted">-</span>} mono />
          </div>
        </div>
        {!currentPolicy && (
          <div style={{ fontSize: 11, color: 'var(--text-weak)', marginTop: 8 }}>
            ↑ 보험증권 OCR 등록으로 자동 채움
          </div>
        )}
      </Section>
      <InsuranceRegisterDialog
        open={insOpen}
        onOpenChange={setInsOpen}
        vehicleId={vehicle?.id}
        prefillPolicy={currentPolicy ?? null}
        onSaved={() => setInsOpen(false)}
      />
    </div>
  );
});
