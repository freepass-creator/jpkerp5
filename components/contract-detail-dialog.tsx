'use client';

import { useState, useMemo, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import {
  User, Car, FileText, ClipboardText, ArrowsLeftRight, CurrencyKrw,
  Plus, CheckCircle, CircleNotch, Trash,
  Upload, X as XIcon, X,
  Pencil,
} from '@phosphor-icons/react';
import { DetailDialogShell } from '@/components/ui/detail-dialog-shell';
import { type EditableTabHandle } from '@/components/ui/edit-buttons';
import { VehicleRegRegisterDialog } from '@/components/asset/vehicle-reg-register-dialog';
import { InsuranceRegisterDialog } from '@/components/insurance/insurance-register-dialog';
import { VehiclePhotosByKind } from '@/components/vehicle-photos-section';
import { useInsurances } from '@/lib/firebase/insurance-store';
import { normPlate } from '@/lib/entity-sync';
import { Field as SharedField, EditableField as SharedEditableField } from '@/components/ui/editable-field';
import { Section } from '@/components/ui/detail-primitives';
import { KpiCard, KpiGrid } from '@/components/ui/kpi-card';
import { toast } from '@/lib/toast';
import { StatusBadge } from '@/components/ui/status-badge';
import { vehicleStateTone, contractStateTone, paymentStateTone, contractStatusTone } from '@/lib/status-tones';
import { DateInput } from '@/components/ui/date-input';
import type { Contract, VehicleStatus, AdditionalDriver } from '@/lib/types';
import { formatCurrency, formatDateFull, daysSince, monthsBetween } from '@/lib/utils';
import { contractIdentMasked, birthFromIdent, inferKind } from '@/lib/ident';
import { displayCompanyName } from '@/lib/company-display';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useContracts as useContractsList } from '@/lib/firebase/contracts-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { todayKr } from '@/lib/mock-data';
import {
  currentStage, stageLabel, isNearExpiry, daysToExpiry, getExpiryDate,
  getVehicleState, getContractState, getPaymentState,
  type Stage,
} from '@/lib/contract-stage';
// 큰 탭 모듈 분리 (2026-06-19): 외부 호환 위해 re-export.
import { PaymentTab } from '@/components/contract-detail/payment-tab';
import { VehicleStatusTab } from '@/components/contract-detail/vehicle-status-tab';
export { PaymentTab };

export function ContractDetailDialog({
  contract,
  open,
  onOpenChange,
  onUpdate,
  onNavigate,
}: {
  contract: Contract | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (updated: Contract) => void;
  /** 같은 차량의 다른 계약으로 점프 (계약이력에서 클릭 시) */
  onNavigate?: (contractId: string) => void;
}) {
  if (!contract) return null;

  return (
    <ContractDetailShell contract={contract} open={open} onOpenChange={onOpenChange} onUpdate={onUpdate} />
  );
}

/** 가장 임박한 (가장 작은, 또는 가장 음수인) D-day. 모두 비어있거나 30 초과 면 null. */
function earliestDday(c: Contract, fields: Array<'insuranceExpiryDate' | 'inspectionDueDate' | 'returnScheduledDate'>): number | null {
  const today = new Date().toISOString().slice(0, 10);
  const tT = new Date(today).getTime();
  let best: number | null = null;
  for (const f of fields) {
    const v = c[f] as string | undefined;
    if (!v) continue;
    const d = Math.round((new Date(v).getTime() - tT) / 86400000);
    if (d > 30) continue;        // D-30 초과는 배지 X (위험 임박만)
    if (best === null || d < best) best = d;
  }
  return best;
}

/** 탭 라벨에 D-N 배지 (만기 임박/경과 강조). */
/**
 * 탭 라벨에 이슈 점 — 우측 상단 absolute dot. 다른 탭과 높이/너비 영향 없음.
 *  · D-day < 0  → 빨간 (만료/지연)
 *  · D-day 0~7 → 주황 (임박)
 *  · D-day > 7 → 점 없음
 */
function tabLabelWithDday(label: string, dday: number | null) {
  if (dday === null || dday > 7) return label;
  const color = dday < 0 ? 'var(--red-text)' : 'var(--orange-text, #c2410c)';
  const tip = dday < 0 ? `D+${-dday} 경과` : dday === 0 ? '오늘 만료' : `D-${dday} 임박`;
  // 라벨 폭 그대로 + dot 만 우상단에 살짝 겹쳐 표시 (다른 탭과 정렬 영향 0)
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      {label}
      <span title={tip} style={{
        position: 'absolute', top: -2, right: -6,
        width: 6, height: 6, borderRadius: '50%',
        background: color,
        pointerEvents: 'none',
      }} />
    </span>
  );
}

/** 탭 라벨에 미납 회차 점 — 라벨 폭 영향 0. */
function tabLabelWithUnpaid(label: string, unpaidSeq: number) {
  if (unpaidSeq === 0) return label;
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      {label}
      <span title={`미납 ${unpaidSeq}회차`} style={{
        position: 'absolute', top: -2, right: -6,
        width: 6, height: 6, borderRadius: '50%',
        background: 'var(--red-text)',
        pointerEvents: 'none',
      }} />
    </span>
  );
}

/** Shell wrapping — DetailDialogShell 에 props 전달. */
function ContractDetailShell({
  contract, open, onOpenChange, onUpdate,
}: {
  contract: Contract;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUpdate: (u: Contract) => void;
}) {
  const { companies } = useCompanies();
  const companyDisplay = displayCompanyName(contract.company, companies);
  const vs = getVehicleState(contract);
  const cs = getContractState(contract);
  const ps = getPaymentState(contract);

  // 활성 탭 + 편집 가능한 탭의 ref dispatch.
  // 공용 DetailDialogShell footer 패턴 그대로:
  //   [수정][닫기] ⟷ [취소][저장][닫기]
  // 자식 inline 편집 state 를 부모로 lift — 자식 onEditingChange 콜백으로 부모에 알림.
  const [activeTab, setActiveTab] = useState<string>('status');
  const [editingTab, setEditingTab] = useState<string | null>(null);
  const assetRef = useRef<EditableTabHandle>(null);
  const contractRef = useRef<EditableTabHandle>(null);
  const editable: Record<string, React.RefObject<EditableTabHandle | null>> = {
    asset: assetRef,
    contract: contractRef,
  };
  const isEditing = editingTab !== null && editingTab === activeTab;
  // [수정] — 어떤 탭에서든 노출. editable 아닌 탭에서 누르면 'asset' 으로 자동 전환 + 편집
  const handleEdit = () => {
    const target = activeTab in editable ? activeTab : 'asset';
    if (target !== activeTab) setActiveTab(target);
    queueMicrotask(() => editable[target].current?.startEdit());
  };
  const handleSave = () => {
    editable[activeTab]?.current?.save();
    toast.success('저장되었습니다');
  };
  const handleCancel = () => {
    editable[activeTab]?.current?.cancel();
    toast.info('변경사항을 버렸습니다');
  };

  return (
    <DetailDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={`상세 정보 — ${contract.vehiclePlate} · ${contract.customerName || '(무계약)'}`}
      heroName={contract.customerName?.trim() || contract.vehicleModelLine || contract.vehicleModel || contract.vehiclePlate || '-'}
      heroMeta={
        <>
          <span className="plate">{contract.vehiclePlate}</span>
          {/* customerName 있을 때만 차종 — 없으면 차종이 heroName 이라 중복 회피 */}
          {contract.customerName?.trim() && (
            <span>{contract.vehicleModel}</span>
          )}
          <span>·</span>
          <span>{companyDisplay}</span>
          {contract.contractNo && (
            <>
              <span>·</span>
              <span>{contract.contractNo}</span>
            </>
          )}
          {/* 담당 — 계약(customer) 있을 때만, 차량만 있는 무계약은 자산 hero 와 일관되게 생략 */}
          {contract.customerName?.trim() && (
            <>
              <span>·</span>
              <span>담당 {contract.manager || '-'}</span>
            </>
          )}
        </>
      }
      heroRight={null}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      // 수납·상태 탭은 인라인 직접 편집 — 다이얼로그 [수정] 버튼 없음. 자산/계약 탭에서만 노출.
      onEdit={activeTab === 'asset' || activeTab === 'contract' ? handleEdit : undefined}
      editing={isEditing}
      editingTab={editingTab}
      onSave={handleSave}
      onCancel={handleCancel}
      tabs={[
        { value: 'status', label: '상태', content: <VehicleStatusTab c={contract} onUpdate={onUpdate} /> },
        {
          value: 'asset',
          label: tabLabelWithDday('자산', earliestDday(contract, ['insuranceExpiryDate', 'inspectionDueDate'])),
          content: <VehicleSpecTab ref={assetRef} c={contract} onUpdate={onUpdate} onEditingChange={(e) => setEditingTab(e ? 'asset' : null)} />,
        },
        {
          value: 'contract',
          label: tabLabelWithDday('계약', earliestDday(contract, ['returnScheduledDate'])),
          content: <ContractInfoTab ref={contractRef} c={contract} onUpdate={onUpdate} onEditingChange={(e) => setEditingTab(e ? 'contract' : null)} />,
        },
        {
          value: 'payment',
          // 수납 탭 라벨에 미납 회차 수 배지 — 한눈에 위험 식별
          label: tabLabelWithUnpaid('수납', contract.unpaidSeqCount ?? 0),
          content: <PaymentTab c={contract} onUpdate={onUpdate} />,
        },
        {
          value: 'photos',
          label: '사진',
          content: <VehiclePhotosTab c={contract} />,
        },
      ]}
    />
  );
}

/* ─────────────── HERO (항상 상단) ─────────────── */

function DetailHero({ c }: { c: Contract }) {
  const { companies } = useCompanies();
  const companyDisplay = displayCompanyName(c.company, companies);
  const vs = getVehicleState(c);
  const cs = getContractState(c);
  const ps = getPaymentState(c);
  return (
    <div className="detail-hero">
      <div className="detail-hero-main">
        <div className="detail-hero-name">{c.customerName}</div>
        <div className="detail-hero-meta">
          <span className="plate">{c.vehiclePlate}</span>
          <span>·</span>
          <span>{c.vehicleModel}</span>
          <span>·</span>
          <span>{companyDisplay}</span>
          <span>·</span>
          <span>{c.contractNo}</span>
          <span>·</span>
          <span>담당 {c.manager || '-'}</span>
        </div>
      </div>
      <div className="detail-hero-badges" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="dim" style={{ fontSize: 10 }}>차량</span>
        <StatusBadge tone={vehicleStateTone(vs.name)}>{vs.name}</StatusBadge>
        <span className="dim" style={{ fontSize: 10, marginLeft: 6 }}>계약</span>
        <StatusBadge tone={contractStateTone(cs.name)}>{cs.name}</StatusBadge>
        <span className="dim" style={{ fontSize: 10, marginLeft: 6 }}>수납</span>
        <StatusBadge tone={paymentStateTone(ps.name)}>{ps.name}</StatusBadge>
      </div>
    </div>
  );
}

/* ─────────────── Sub: Sections / Fields ─────────────── */


const Field = SharedField;

/* ─────────────── 차량정보 탭 (차량 + 라이프사이클 액션) ─────────────── */

// Stage / currentStage / stageLabel / isNearExpiry / getExpiryDate / daysToExpiry
// → lib/contract-stage.ts 로 이관 (목록·다이얼로그 양쪽에서 동일 stage 값 사용)

/* ─────────────── 사진 — 별도 탭 (반납·인도전·상품화 3섹션 스택) ─────────────── */

/**
 * 사진 저장소 키 우선순위:
 *  1. 자산 등록된 차량 → vehicleId 그대로 (vehicle_attachments/{vehicleId})
 *  2. 자산 미등록 → 'plate:{차량번호}' (vehicle_attachments/plate:12가3456)
 *  → 추후 자산 등록 시 admin/migrate-sheet 에서 plate: 키 → vehicleId 키 이관 가능
 *  → 자산현황 페이지는 vehicleId 키만 보므로, 자산 등록 후엔 plate: 키 사진은 따로 합쳐줘야 함 (TODO)
 */
function VehiclePhotosTab({ c }: { c: Contract }) {
  const { vehicles } = useVehicles();
  // 차량 매칭: 현재 plate 우선, 없으면 plateHistory[] 도 확인 (번호 변경 차량 추적)
  const matched = useMemo(() => {
    const plate = (c.vehiclePlate ?? '').trim();
    if (!plate) return null;
    return vehicles.find((v) =>
      (v.plate ?? '').trim() === plate
      || (v.plateHistory ?? []).some((p) => (p ?? '').trim() === plate)
    ) ?? null;
  }, [vehicles, c.vehiclePlate]);

  // 저장 키: 등록된 차량은 vehicleId (자체코드 역할, 불변), 미등록은 plate fallback
  const storageId = useMemo(() => {
    if (matched?.id) return matched.id;
    const plate = (c.vehiclePlate ?? '').trim();
    return plate ? `plate:${plate}` : null;
  }, [matched, c.vehiclePlate]);

  if (!storageId) {
    return (
      <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-weak)' }}>
        차량번호가 없어 사진을 저장할 수 없음 — 계약 탭에서 차량번호 입력 후 사용
      </div>
    );
  }

  // 라이프사이클 역순 (최근 단계부터): 반납 → 인도전(출고) → 상품화
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <VehiclePhotosByKind vehicleId={storageId} kind="return"   contractId={c.id} title="최근 반납 사진" />
      <VehiclePhotosByKind vehicleId={storageId} kind="delivery" contractId={c.id} title="최근 인도전 사진" />
      <VehiclePhotosByKind vehicleId={storageId} kind="product"  contractId={c.id} title="최근 상품화 사진" />
    </div>
  );
}

/* ─────────────── 차량정보 (스펙) — 별도 탭 ─────────────── */

const VehicleSpecTab = forwardRef<EditableTabHandle, { c: Contract; onUpdate: (u: Contract) => void; onEditingChange?: (e: boolean) => void }>(function VehicleSpecTab({ c, onUpdate, onEditingChange }, ref) {
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


/* ─────────────── 추가운전자 편집기 ─────────────── */

function AdditionalDriversEditor({
  editing, drivers, onChange,
}: {
  editing: boolean;
  drivers: AdditionalDriver[];
  onChange: (next: AdditionalDriver[]) => void;
}) {
  function patch(i: number, p: Partial<AdditionalDriver>) {
    onChange(drivers.map((d, idx) => idx === i ? { ...d, ...p } : d));
  }
  function add() {
    onChange([...drivers, { name: '', identNo: '', relation: '', registeredAt: new Date().toISOString() }]);
  }
  function remove(i: number) {
    onChange(drivers.filter((_, idx) => idx !== i));
  }

  if (!editing && drivers.length === 0) {
    return (
      <div style={{ fontSize: 11, color: 'var(--text-weak)', padding: '6px 0' }}>
        추가운전자 없음
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-sub)' }}>
        추가운전자 ({drivers.length}) — 보험연령 검증 대상
      </div>
      {drivers.length === 0 ? null : (
        <div style={{ display: 'grid', gap: 4 }}>
          {drivers.map((d, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr auto', gap: 6,
              alignItems: 'center', padding: '4px 0',
            }}>
              {editing ? (
                <>
                  <input
                    className="detail-field-input" placeholder="이름"
                    value={d.name ?? ''} onChange={(e) => patch(i, { name: e.target.value })}
                  />
                  <input
                    className="detail-field-input" placeholder="주민번호 (YYMMDD-XXXXXXX)" style={{ fontFamily: 'var(--font-mono)' }}
                    value={d.identNo ?? ''} onChange={(e) => patch(i, { identNo: e.target.value })}
                  />
                  <input
                    className="detail-field-input" placeholder="관계 (배우자/자녀 등)"
                    value={d.relation ?? ''} onChange={(e) => patch(i, { relation: e.target.value })}
                  />
                  <button
                    type="button" className="btn-ghost"
                    onClick={() => remove(i)}
                    title="삭제"
                    style={{ padding: '4px 6px', cursor: 'pointer', color: 'var(--red-text)' }}
                  >
                    <Trash size={12} weight="bold" />
                  </button>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 12 }}>{d.name || <span className="muted">-</span>}</span>
                  <span className="mono" style={{ fontSize: 11 }}>
                    {d.identNo ? maskIdentDisplay(d.identNo) : <span className="muted">-</span>}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>{d.relation || <span className="muted">-</span>}</span>
                  <span />
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && (
        <button type="button" className="btn btn-sm" onClick={add} style={{ alignSelf: 'flex-start' }}>
          <Plus size={11} weight="bold" /> 추가운전자
        </button>
      )}
    </div>
  );
}

/** 주민번호 13자리 → '900315-1******' 마스킹 (이미 마스킹된 거면 그대로) */
function maskIdentDisplay(s: string): string {
  const digits = s.replace(/\D/g, '');
  if (digits.length < 13) return s;
  return `${digits.slice(0, 6)}-${digits.slice(6, 7)}******`;
}

/* ─────────────── 계약정보 탭 (고객 + 조건 + 비고) ─────────────── */

const ContractInfoTab = forwardRef<EditableTabHandle, { c: Contract; onUpdate: (u: Contract) => void; onEditingChange?: (e: boolean) => void }>(function ContractInfoTab({ c, onUpdate, onEditingChange }, ref) {
  const identMasked = contractIdentMasked(c);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Contract>(c);

  // 다른 계약으로 네비게이션되면 draft 리셋
  useEffect(() => {
    if (!editing) setDraft(c);
  }, [c, editing]);

  useEffect(() => { onEditingChange?.(editing); }, [editing, onEditingChange]);

  const startEdit = () => { setDraft(c); setEditing(true); };
  const cancel = () => { setDraft(c); setEditing(false); };
  const save = () => { onUpdate(draft); setEditing(false); };

  const set = <K extends keyof Contract>(k: K, v: Contract[K]) => setDraft((d) => ({ ...d, [k]: v }));

  useImperativeHandle(ref, () => ({ startEdit, save, cancel, isEditing: () => editing }), [editing, c, draft]);

  return (
    <div className="detail-stack">
      <Section icon={<User size={12} weight="duotone" />} title="고객">
        <div className="detail-grid-2">
          <div>
            <EditableField label="이름" value={editing ? draft.customerName : c.customerName} editing={editing} onChange={(v) => set('customerName', v)} />
            {/* 입금자 별칭 — 가족·법인 계좌처럼 customerName 과 다른 이름으로 입금 시 자동 매칭에 포함 */}
            <EditableField
              label="입금자 별칭"
              value={editing ? (draft.payerAliases ?? []).join(', ') : (c.payerAliases ?? []).join(', ')}
              editing={editing}
              onChange={(v) => set('payerAliases', v.split(',').map((s) => s.trim()).filter(Boolean))}
              placeholder="쉼표로 구분 (예: 박영희, ABC주식회사)"
            />
            <Field label="구분" value={c.customerKind || '-'} />
            <Field label="등록번호" value={identMasked || '-'} mono />
            <EditableField label="연락처" value={editing ? draft.customerPhone1 : c.customerPhone1} editing={editing} mono onChange={(v) => set('customerPhone1', v)} />
            <EditableField label="연락처2" value={editing ? (draft.customerPhone2 ?? '') : (c.customerPhone2 ?? '')} editing={editing} mono onChange={(v) => set('customerPhone2', v || undefined)} placeholder="-" />
          </div>
          <div>
            <EditableField label="지역" value={editing ? (draft.customerRegion ?? '') : (c.customerRegion ?? '')} editing={editing} onChange={(v) => set('customerRegion', v || undefined)} placeholder="-" />
            <EditableField label="행정구" value={editing ? (draft.customerDistrict ?? '') : (c.customerDistrict ?? '')} editing={editing} onChange={(v) => set('customerDistrict', v || undefined)} placeholder="-" />
          </div>
        </div>
      </Section>

      <Section icon={<User size={12} weight="duotone" />} title="운전자">
        <div className="detail-grid-2">
          <div>
            <EditableField label="주운전자명" value={editing ? (draft.driverName ?? '') : (c.driverName ?? '')} editing={editing} onChange={(v) => set('driverName', v || undefined)} placeholder="-" />
            <EditableField label="주운전자 주민번호" value={editing ? (draft.driverIdentNo ?? '') : (c.driverIdentNo ?? '')} editing={editing} mono onChange={(v) => set('driverIdentNo', v || undefined)} placeholder="-" />
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-weak)', padding: '4px 0' }}>
            법인 계약은 주운전자 식별번호로 보험연령 검증.
            개인 계약은 계약자 등록번호 우선 (주운전자 미입력 시 폴백).
          </div>
        </div>
        {/* 추가운전자 리스트 — 보험 미커버 위험 사전 차단 */}
        <AdditionalDriversEditor
          editing={editing}
          drivers={editing ? (draft.additionalDrivers ?? []) : (c.additionalDrivers ?? [])}
          onChange={(list) => set('additionalDrivers', list.length > 0 ? list : undefined)}
        />
      </Section>

      <Section icon={<ClipboardText size={12} weight="duotone" />} title="계약 조건">
        <div className="detail-grid-2">
          <div>
            <Field label="계약번호" value={c.contractNo} mono />
            <EditableField label="계약일" value={editing ? (draft.contractDate ?? '') : (formatDateFull(c.contractDate) || '-')} editing={editing} mono onChange={(v) => set('contractDate', v || '')} placeholder="YYYY-MM-DD" />
            <EditableField label="인도일" value={editing ? (draft.deliveredDate ?? '') : (formatDateFull(c.deliveredDate) || '-')} editing={editing} mono onChange={(v) => set('deliveredDate', v || undefined)} placeholder="YYYY-MM-DD" />
            <EditableField label="반납예정(종료일)" value={editing ? (draft.returnScheduledDate ?? '') : (formatDateFull(c.returnScheduledDate) || '-')} editing={editing} mono onChange={(v) => set('returnScheduledDate', v || undefined)} placeholder="YYYY-MM-DD" />
            <EditableField label="약정기간(개월)" value={editing ? String(draft.termMonths) : `${c.termMonths}개월 ${c.longTerm ? '(장기)' : '(단기)'}`} editing={editing} mono onChange={(v) => set('termMonths', Number(v) || 0)} />
          </div>
          <div>
            <EditableField label="월 대여료" value={editing ? String(draft.monthlyRent ?? 0) : `₩${formatCurrency(c.monthlyRent)}`} editing={editing} mono onChange={(v) => set('monthlyRent', Number(v.replace(/[,\s]/g, '')) || 0)} />
            <EditableField label="보증금" value={editing ? String(draft.deposit ?? 0) : `₩${formatCurrency(c.deposit)}`} editing={editing} mono onChange={(v) => set('deposit', Number(v.replace(/[,\s]/g, '')) || 0)} />
            <EditableField label="결제방법" value={editing ? (draft.paymentMethod ?? '') : (c.paymentMethod ?? '-')} editing={editing} onChange={(v) => set('paymentMethod', v)} placeholder="이체 / 카드 / CMS 등" />
            {/* 결제시기 — 선불(1일 인출) vs 후불(말일 결제). 사용자 명시 요구. */}
            {editing ? (
              <div className="detail-field is-editing">
                <div className="label">결제시기</div>
                <select
                  className="detail-field-input"
                  value={draft.paymentTiming ?? '선불'}
                  onChange={(e) => set('paymentTiming', e.target.value as '선불' | '후불')}
                >
                  <option value="선불">선불</option>
                  <option value="후불">후불</option>
                </select>
              </div>
            ) : (
              <Field label="결제시기" value={c.paymentTiming ?? '선불'} />
            )}
            <EditableField label="결제일(1-31)" value={editing ? String(draft.paymentDay ?? '') : `매월 ${c.paymentDay}일`} editing={editing} mono onChange={(v) => set('paymentDay', Number(v) || 0)} />
            <EditableField label="담당자" value={editing ? (draft.manager ?? '') : (c.manager ?? '-')} editing={editing} onChange={(v) => set('manager', v || undefined)} />
          </div>
        </div>
      </Section>

      <Section
        icon={<FileText size={12} weight="duotone" />}
        title="계약서"
        action={c.contractDocUrl ? (
          <a
            href={c.contractDocUrl}
            download={c.contractDocFileName ?? 'contract.pdf'}
            style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--brand)' }}
          >
            📎 다운로드
          </a>
        ) : null}
      >
        <div className="detail-grid-2">
          <Field
            label="파일"
            value={c.contractDocUrl
              ? <a href={c.contractDocUrl} download={c.contractDocFileName ?? 'contract.pdf'} style={{ color: 'var(--brand)' }}>
                  {c.contractDocFileName ?? 'contract.pdf'}
                </a>
              : <span className="muted">미첨부</span>}
          />
          <Field
            label="업로드"
            value={c.contractDocUploadedAt ? c.contractDocUploadedAt.slice(0, 10) : <span className="muted">-</span>}
            mono
          />
          <Field
            label="발송 상태"
            value={c.documentStatus
              ? <StatusBadge tone={c.documentStatus === '서명완료' ? 'green' : c.documentStatus === '거절' ? 'red' : c.documentStatus === '미발송' ? 'neutral' : 'blue'}>{c.documentStatus}</StatusBadge>
              : <span className="muted">-</span>}
          />
        </div>
      </Section>

      <Section icon={<FileText size={12} weight="duotone" />} title="비고">
        {editing ? (
          <textarea
            value={draft.notes ?? ''}
            onChange={(e) => set('notes', e.target.value || undefined)}
            rows={4}
            style={{ width: '100%', fontSize: 12, padding: 8, border: '1px solid var(--border)', borderRadius: 'var(--radius)', resize: 'vertical' }}
            placeholder="메모"
          />
        ) : (
          <div style={{ fontSize: 12, color: c.notes ? 'var(--text-main)' : 'var(--text-weak)', whiteSpace: 'pre-wrap' }}>
            {c.notes || '메모 없음'}
          </div>
        )}
      </Section>
    </div>
  );
});

/** 보기/편집 겸용 필드 — editing=true 면 input, 아니면 Field 표시. */
const EditableField = SharedEditableField;

