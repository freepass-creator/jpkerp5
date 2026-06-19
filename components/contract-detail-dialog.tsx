'use client';

import { useState, useMemo, useEffect, useRef, useImperativeHandle, forwardRef, Fragment } from 'react';
import {
  User, Car, FileText, ClipboardText, ArrowsLeftRight, CurrencyKrw,
  Plus, CheckCircle, CircleNotch, Trash,
  Upload, Warning as WarningIcon, X as XIcon, X,
  Pencil,
} from '@phosphor-icons/react';
import { ReceiptPrintDialog } from '@/components/receipt-print-dialog';
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
import { COL } from '@/lib/table-cols';
import { toast } from '@/lib/toast';
import { StatusBadge } from '@/components/ui/status-badge';
import { vehicleStateTone, contractStateTone, paymentStateTone, contractStatusTone } from '@/lib/status-tones';
import { DateInput } from '@/components/ui/date-input';
import type { Contract, VehicleStatus, PaymentScheduleInline, PaymentEntry, ScheduleStatus, AdditionalDriver } from '@/lib/types';
import { formatCurrency, formatDateFull, daysSince, monthsBetween } from '@/lib/utils';
import { contractIdentMasked, birthFromIdent, inferKind } from '@/lib/ident';
import { displayCompanyName } from '@/lib/company-display';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useContracts as useContractsList } from '@/lib/firebase/contracts-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { HistoryAddDialog } from '@/components/history-add-dialog';
import { todayKr } from '@/lib/mock-data';
import {
  currentStage, stageLabel, isNearExpiry, daysToExpiry, getExpiryDate,
  getVehicleState, getContractState, getPaymentState,
  type Stage,
} from '@/lib/contract-stage';
import {
  validateDocument, summarizeIssues,
  type DocumentKind, type DocumentData, type ValidationIssue,
} from '@/lib/document-validation';
// 큰 탭 모듈 분리 (2026-06-19, 약 2000줄): 외부 호환 위해 re-export.
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

/* ─────────────── 차량 수납이력 탭 (채권탭 대응 — 차량번호 기준 통합 입금) ─────────────── */

function VehiclePaymentsTab({ c }: { c: Contract }) {
  const { contracts: allContracts } = useContractsList();

  // 같은 차량번호의 모든 계약 (현재 계약 포함)
  const vehicleContracts = useMemo(() => {
    const plate = c.vehiclePlate?.trim();
    if (!plate || plate === '미정') return [c];
    return allContracts
      .filter((x) => x.vehiclePlate?.trim() === plate)
      .sort((a, b) => a.contractDate.localeCompare(b.contractDate));
  }, [allContracts, c]);

  // 모든 payment entry flatten + 계약 정보 부착
  type Row = {
    date: string;
    chargeAmount: number;  // 청구액 = schedule.amount (회차 청구금액)
    amount: number;         // 입금액 = payment.amount
    customerName: string;
    contractDate: string;
    contractId: string;
    seq: number;
    source: PaymentEntry['source'];
    memo?: string;
    by?: string;
  };
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const con of vehicleContracts) {
      for (const s of con.schedules ?? []) {
        for (const p of s.payments ?? []) {
          out.push({
            date: p.date,
            chargeAmount: s.amount,
            amount: p.amount,
            customerName: con.customerName || '(미정)',
            contractDate: con.contractDate,
            contractId: con.id,
            seq: s.seq,
            source: p.source,
            memo: p.memo,
            by: p.by,
          });
        }
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date) || a.contractDate.localeCompare(b.contractDate));
  }, [vehicleContracts]);

  // 통계 — 누적 입금/할인, 계약자별 breakdown
  const totalPaid = rows.reduce((s, r) => s + r.amount, 0);
  const totalDiscount = vehicleContracts.reduce(
    (sum, con) => sum + (con.schedules ?? []).reduce(
      (d, s) => d + (s.discounts ?? []).reduce((dd, x) => dd + x.amount, 0),
      0,
    ),
    0,
  );
  const realIncoming = rows.filter((r) => r.source !== '정산').reduce((s, r) => s + r.amount, 0);
  const settledAmount = rows.filter((r) => r.source === '정산').reduce((s, r) => s + r.amount, 0);

  // 계약자별 그룹 — 누적 입금 + 현재 미수 (시각적 구분용)
  const customerGroups = useMemo(() => {
    const m = new Map<string, { name: string; contractDate: string; total: number; unpaid: number; contractId: string }>();
    for (const r of rows) {
      const key = `${r.customerName}|${r.contractDate}`;
      const prev = m.get(key) ?? { name: r.customerName, contractDate: r.contractDate, total: 0, unpaid: 0, contractId: r.contractId };
      prev.total += r.amount;
      m.set(key, prev);
    }
    // 현재 미수는 vehicleContracts에서 직접 가져옴
    for (const con of vehicleContracts) {
      const key = `${con.customerName || '(미정)'}|${con.contractDate}`;
      const existing = m.get(key);
      if (existing) {
        existing.unpaid = con.unpaidAmount || 0;
      } else if ((con.unpaidAmount || 0) > 0) {
        // 입금은 없지만 미수만 있는 케이스
        m.set(key, {
          name: con.customerName || '(미정)',
          contractDate: con.contractDate,
          total: 0,
          unpaid: con.unpaidAmount || 0,
          contractId: con.id,
        });
      }
    }
    return Array.from(m.values()).sort((a, b) => b.contractDate.localeCompare(a.contractDate));
  }, [rows, vehicleContracts]);

  // 행 색상 alternation — 계약자 바뀔 때마다 토글
  const rowTints = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    let prevKey = '';
    for (const r of rows) {
      const key = `${r.customerName}|${r.contractDate}`;
      if (key !== prevKey) { idx = 1 - idx; prevKey = key; }
      map.set(`${r.date}-${r.contractId}-${r.seq}`, idx);
    }
    return map;
  }, [rows]);

  return (
    <div className="detail-stack">
      {/* 차량 요약 헤더 */}
      <Section
        icon={<Car size={12} weight="duotone" />}
        title={`${c.vehiclePlate} · ${c.vehicleModel}`}
      >
        <div className="detail-grid-2" style={{ marginTop: 4 }}>
          <div>
            <Field label="계약 횟수" value={`${vehicleContracts.length}건`} mono />
            <Field label="누적 입금액" value={`₩${formatCurrency(totalPaid)}`} mono />
            <Field label="실 입금 (정산 제외)" value={`₩${formatCurrency(realIncoming)}`} mono />
          </div>
          <div>
            <Field label="누적 청구할인" value={totalDiscount > 0 ? `-₩${formatCurrency(totalDiscount)}` : <span className="muted">-</span>} mono />
            <Field label="스냅샷 정산분" value={settledAmount > 0 ? `₩${formatCurrency(settledAmount)}` : <span className="muted">-</span>} mono />
            <Field label="입금 건수" value={`${rows.length}건`} mono />
          </div>
        </div>
      </Section>

      {/* 계약자별 요약 (시각 구분 도움) */}
      {customerGroups.length > 0 && (
        <Section icon={<User size={12} weight="duotone" />} title={`계약자 ${customerGroups.length}명`}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ minWidth: 140 }}>계약자</th>
                <th style={{ width: 110 }}>계약일자</th>
                <th className="num" style={{ width: 130 }}>누적 입금액</th>
                <th className="num" style={{ width: 130 }}>현재 미수</th>
              </tr>
            </thead>
            <tbody>
              {customerGroups.map((g) => (
                <tr key={`${g.name}-${g.contractDate}`}>
                  <td>{g.name}</td>
                  <td className="mono dim">{formatDateFull(g.contractDate)}</td>
                  <td className="num mono">₩{formatCurrency(g.total)}</td>
                  <td className="num mono" style={{ color: g.unpaid > 0 ? 'var(--red-text)' : undefined }}>
                    {g.unpaid > 0 ? `₩${formatCurrency(g.unpaid)}` : <span className="muted">없음</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* 통합 수납이력 — 채권탭 대응 (청구액 + 입금액 분리) */}
      <Section icon={<CurrencyKrw size={12} weight="duotone" />} title={`수납이력 — ${rows.length}건 (최근순)`}>
        {rows.length === 0 ? (
          <div style={{ padding: 32, color: 'var(--text-weak)', textAlign: 'center', fontSize: 12 }}>
            이 차량에 입금된 내역이 없습니다.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>입금일</th>
                <th>계약자</th>
                <th className="center mono" style={{ width: 56 }}>회차</th>
                <th className="num" style={{ width: 110 }}>청구액</th>
                <th className="num" style={{ width: 110 }}>입금액</th>
                <th className="center" style={{ width: 60 }}>방식</th>
                <th>메모</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const tint = rowTints.get(`${r.date}-${r.contractId}-${r.seq}`) ?? 0;
                const partial = r.amount < r.chargeAmount;
                return (
                  <tr key={i} style={{ background: tint === 0 ? undefined : 'var(--bg-sunken)' }}>
                    <td className="mono">{formatDateFull(r.date)}</td>
                    <td style={{ fontWeight: 500 }}>{r.customerName}</td>
                    <td className="center mono dim">{r.seq}회</td>
                    <td className="num mono dim">₩{formatCurrency(r.chargeAmount)}</td>
                    <td className="num mono" style={{ fontWeight: 600, color: partial ? 'var(--orange-text)' : undefined }}>
                      ₩{formatCurrency(r.amount)}
                    </td>
                    <td className="center">
                      <span className="chip" style={{
                        height: 18, padding: '0 8px', fontSize: 10, fontWeight: 500,
                        background: r.source === '정산' ? 'var(--bg-sunken)'
                          : r.source === '계좌' ? 'var(--blue-bg)'
                          : r.source === '카드' ? 'var(--purple-bg)'
                          : 'var(--green-bg)',
                        color: r.source === '정산' ? 'var(--text-weak)'
                          : r.source === '계좌' ? 'var(--blue-text)'
                          : r.source === '카드' ? 'var(--purple-text)'
                          : 'var(--green-text)',
                      }}>{r.source}</span>
                    </td>
                    <td className="dim">{partial ? `부분납 (잔액 ₩${formatCurrency(r.chargeAmount - r.amount)})` : (r.memo || (r.by ? `(${r.by})` : '-'))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

/* ─────────────── 수납내역 탭 (스케줄 + 입금 + 추가) ─────────────── */


function HistoryListTab({ scope, c, onNavigate }: { scope: 'contract' | 'vehicle'; c: Contract; onNavigate?: (contractId: string) => void }) {
  const { contracts } = useContractsList();
  const { entries, remove: removeEntry } = useHistoryEntries();
  const [addOpen, setAddOpen] = useState(false);
  const title = scope === 'vehicle' ? '차량 조치이력' : '연락 / 분쟁 / 메모';
  const target = scope === 'vehicle' ? `차량번호 ${c.vehiclePlate}` : `계약 ${c.contractNo}`;
  const hint = scope === 'vehicle'
    ? '정비·검사·사고·세차·위반·보험·부품교체 — 차량번호에 영구 귀속 (계약 종료되어도 차량에 따라감)'
    : '연락기록·분쟁·클레임·수납이슈·메모 — 이 계약에만 귀속';

  // 같은 plate 의 모든 계약 (현재 계약 포함, 계약일 내림차순) — 계약이력 탭에서만 사용
  // 차량번호 공백·대소문자 차이로 매칭 안 잡히던 버그 → 정규화 매칭
  const allVehicleContracts = scope === 'contract' ? (() => {
    const targetPlate = (c.vehiclePlate ?? '').trim().toLowerCase();
    const matched = contracts.filter((x) => {
      const xp = (x.vehiclePlate ?? '').trim().toLowerCase();
      return xp && xp === targetPlate;
    });
    if (!matched.some((x) => x.id === c.id)) matched.push(c);
    return matched.sort((a, b) => (b.contractDate ?? '').localeCompare(a.contractDate ?? ''));
  })() : [];

  // 진짜 현재 계약 = 반납 안 됨 + 해지 안 됨 + 최신 contractDate
  // (클릭해서 다른 행으로 진입해도 ● 마커는 진짜 현재 계약에만 표시)
  const trulyCurrentId = (() => {
    if (scope !== 'contract' || allVehicleContracts.length === 0) return null;
    const active = allVehicleContracts.filter(
      (x) => !x.returnedDate && x.status !== '반납' && x.status !== '해지',
    );
    if (active.length === 0) return null;
    // active 중 가장 최근 contractDate (이미 desc sort 되어 있어서 첫 번째)
    return active[0].id;
  })();

  // 본인 이력 (scope + 매칭)
  const myEntries = entries.filter((e) =>
    scope === 'vehicle' ? e.scope === 'vehicle' && e.vehiclePlate === c.vehiclePlate
                        : e.scope === 'contract' && e.contractId === c.id,
  );
  const totalCost = myEntries.reduce((s, e) => s + (e.cost ?? 0), 0);

  return (
    <>
      {/* 계약이력 탭 — 같은 차량의 모든 계약 (임차이력) — 최상단 */}
      {scope === 'contract' && (
        <Section
          icon={<Car size={12} weight="duotone" />}
          title={`임차이력 — ${c.vehiclePlate || '(차량번호 없음)'} (${allVehicleContracts.length}건)`}
        >
          {allVehicleContracts.length === 0 && (
            <div style={{ padding: 16, color: 'var(--text-weak)', fontSize: 12 }}>
              <div style={{ marginBottom: 4 }}>이 차량에 매칭되는 계약이 없습니다.</div>
              <div style={{ fontSize: 11 }}>
                현재 계약: <span className="mono">{c.vehiclePlate || '(없음)'}</span> · 계약자: <strong>{c.customerName || '(없음)'}</strong>
              </div>
              <div style={{ fontSize: 11, marginTop: 6 }}>
                같은 차량번호의 다른 계약이 등록되어 있어야 임차이력이 보입니다.
              </div>
            </div>
          )}
          {allVehicleContracts.length > 0 && (<>
          <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 8 }}>
            이 차량의 모든 계약 — 최근 → 과거 순 (시트의 우측 = 직전 계약 순서대로)
          </div>
          <div style={{ overflow: 'auto' }}>
            <table className="table" style={{ minWidth: 1400 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 180 }}>계약자</th>
                  <th style={{ width: 90 }}>계약일자</th>
                  <th style={{ width: 90 }}>반납예정</th>
                  <th style={{ width: 90 }}>인도일</th>
                  <th style={{ width: 90 }}>반납일</th>
                  <th className="center" style={{ width: 70 }}>약정</th>
                  <th className="num" style={{ width: 100 }}>월대여료</th>
                  <th className="num" style={{ width: 100 }}>보증금</th>
                  <th className="center" style={{ width: 60 }}>결제일</th>
                  <th className="center" style={{ width: 80 }}>결제방법</th>
                  <th className="center" style={{ width: 60 }}>보험</th>
                  <th className="num" style={{ width: 100 }}>미수</th>
                  <th className="center" style={{ width: 76 }}>상태</th>
                  <th className="center" style={{ width: 60 }}>회차</th>
                  <th style={{ minWidth: 140 }}>비고</th>
                </tr>
              </thead>
              <tbody>
                {allVehicleContracts.map((p) => {
                  const isCurrent = p.id === trulyCurrentId;  // 진짜 현재 계약 (클릭한 것 아님)
                  const isOpenedHere = p.id === c.id;  // 현재 다이얼로그가 보고 있는 계약
                  // 계약자 옆 링크 — 면허번호 있으면 면허 표시, 계약서 발송했으면 계약서 표시
                  const hasLicense = !!p.customerLicenseNo;
                  const hasDocument = !!p.documentStatus && p.documentStatus !== '미발송';
                  return (
                    <tr key={p.id} style={
                      isCurrent ? { background: 'var(--brand-bg)', fontWeight: 500 }
                      : isOpenedHere ? { background: 'var(--bg-sunken)' }  // 클릭으로 진입한 행은 옅은 회색
                      : undefined
                    }>
                      <td>
                        {p.customerName ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {isCurrent && <span style={{ color: 'var(--brand)', fontWeight: 700 }}>●</span>}
                            {isOpenedHere && !isCurrent && <span style={{ color: 'var(--text-weak)' }}>▸</span>}
                            <button
                              type="button"
                              onClick={() => onNavigate?.(p.id)}
                              title={isCurrent ? '진짜 현재 계약' : (isOpenedHere ? '현재 보는 계약' : '이 계약 상세로 이동')}
                              style={{
                                background: 'transparent', border: 0, padding: 0,
                                cursor: onNavigate && !isOpenedHere ? 'pointer' : 'default',
                                color: isCurrent ? 'var(--brand)' : 'var(--text-main)',
                                textDecoration: !isCurrent && !isOpenedHere ? 'underline' : 'none',
                                textUnderlineOffset: 3,
                                fontFamily: 'inherit', fontSize: 'inherit',
                                fontWeight: isCurrent ? 700 : (isOpenedHere ? 600 : 500),
                              }}
                            >
                              {p.customerName}
                            </button>
                            {isCurrent && <span className="dim" style={{ fontWeight: 400, fontSize: 10 }}>(현재)</span>}
                            {/* 면허·계약서 링크 칩 */}
                            {hasLicense && (
                              <span
                                className="chip"
                                title={`면허번호 ${p.customerLicenseNo}${p.customerLicenseStatus ? ` (${p.customerLicenseStatus})` : ''}`}
                                style={{
                                  height: 14, padding: '0 4px', fontSize: 9, fontWeight: 500,
                                  background: p.customerLicenseStatus === '정상' ? 'var(--green-bg)' : 'var(--bg-sunken)',
                                  color: p.customerLicenseStatus === '정상' ? 'var(--green-text)' : 'var(--text-sub)',
                                }}
                              >면허</span>
                            )}
                            {hasDocument && (
                              <span
                                className="chip"
                                title={`계약서 ${p.documentStatus}${p.documentSentAt ? ` (${p.documentSentAt.slice(0, 10)})` : ''}`}
                                style={{
                                  height: 14, padding: '0 4px', fontSize: 9, fontWeight: 500,
                                  background: p.documentStatus === '서명완료' ? 'var(--green-bg)' : 'var(--blue-bg)',
                                  color: p.documentStatus === '서명완료' ? 'var(--green-text)' : 'var(--blue-text)',
                                }}
                              >계약서</span>
                            )}
                          </span>
                        ) : (
                          <span className="dim">(휴차)</span>
                        )}
                      </td>
                      <td className="mono">{formatDateFull(p.contractDate)}</td>
                      <td className="mono dim">{formatDateFull(p.returnScheduledDate) || '-'}</td>
                      <td className="mono dim">{formatDateFull(p.deliveredDate) || '-'}</td>
                      <td className="mono dim">{formatDateFull(p.returnedDate) || '-'}</td>
                      <td className="center mono dim">{p.termMonths ? `${p.termMonths}M` : '-'}</td>
                      <td className="num mono">{p.monthlyRent ? `₩${formatCurrency(p.monthlyRent)}` : '-'}</td>
                      <td className="num mono dim">{p.deposit ? `₩${formatCurrency(p.deposit)}` : '-'}</td>
                      <td className="center mono dim">{p.paymentDay ? `${p.paymentDay}일` : '-'}</td>
                      <td className="dim">{p.paymentMethod || '-'}</td>
                      <td className="center mono dim">{p.insuranceAge ? `${p.insuranceAge}세` : '-'}</td>
                      <td className="num mono" style={{ color: (p.unpaidAmount ?? 0) > 0 ? 'var(--red-text)' : undefined }}>
                        {(p.unpaidAmount ?? 0) > 0 ? `₩${formatCurrency(p.unpaidAmount!)}` : '-'}
                      </td>
                      <td className="center"><StatusBadge tone={contractStatusTone(p.status)}>{p.status}</StatusBadge></td>
                      <td className="mono dim">{p.currentSeq && p.totalSeq ? `${p.currentSeq}/${p.totalSeq}` : '-'}</td>
                      <td className="dim" style={{ whiteSpace: 'normal', wordBreak: 'keep-all', fontSize: 10 }}>{p.notes || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>)}
        </Section>
      )}

      <Section
        icon={scope === 'vehicle' ? <Car size={12} weight="duotone" /> : <ClipboardText size={12} weight="duotone" />}
        title={`${title} — ${target}`}
        action={
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setAddOpen(true)}>
            <Plus size={11} weight="bold" /> 이력 추가
          </button>
        }
      >
        <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 8 }}>{hint}</div>

        {/* 이력 본문 — 실 데이터 */}
        {myEntries.length === 0 ? (
          <div style={{ padding: 32, color: 'var(--text-weak)', textAlign: 'center', fontSize: 12 }}>
            아직 {title} 기록이 없습니다. 우측 상단 [이력 추가] 로 등록하세요.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, color: 'var(--text-weak)', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title} ({myEntries.length}건)</span>
              {totalCost > 0 && <span>누적 비용 <strong className="mono" style={{ color: 'var(--text-main)' }}>₩{formatCurrency(totalCost)}</strong></span>}
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>일자</th>
                  <th className="center" style={{ width: 70 }}>분류</th>
                  <th style={{ minWidth: 180 }}>제목 / 내용</th>
                  {scope === 'vehicle' && <th style={{ width: 120 }}>업체</th>}
                  {scope === 'vehicle' && <th className="num" style={{ width: 90 }}>주행거리</th>}
                  <th className="num" style={{ width: 100 }}>비용</th>
                  <th className="center" style={{ width: 76 }}>상태</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {myEntries.map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{e.date}</td>
                    <td className="center"><StatusBadge tone="neutral">{e.category}</StatusBadge></td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{e.title}</div>
                      {e.description && <div className="dim" style={{ fontSize: 10, marginTop: 2 }}>{e.description}</div>}
                    </td>
                    {scope === 'vehicle' && <td className="dim">{e.vendor ?? '-'}</td>}
                    {scope === 'vehicle' && <td className="num mono dim">{e.mileage ? `${e.mileage.toLocaleString('ko-KR')} km` : '-'}</td>}
                    <td className="num mono">{e.cost ? `₩${formatCurrency(e.cost)}` : '-'}</td>
                    <td className="center"><StatusBadge tone={e.status === '완료' ? 'green' : 'blue'}>{e.status}</StatusBadge></td>
                    <td className="center">
                      <button
                        className="btn btn-sm btn-ghost btn-icon"
                        type="button"
                        onClick={() => {
                          if (confirm(`이력 "${e.title}" 삭제하시겠습니까?`)) void removeEntry(e.id);
                        }}
                        title="삭제"
                      >
                        <XIcon size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Section>

      <HistoryAddDialog open={addOpen} onOpenChange={setAddOpen} scope={scope} contract={c} />
    </>
  );
}


/* ─────────────── 서류 검증 탭 ─────────────── */

type UploadedDoc = {
  id: string;
  kind: DocumentKind;
  fileName: string;
  uploadedAt: string;
  data: DocumentData;
  issues: ValidationIssue[];
};

const DOC_KINDS: { value: DocumentKind; label: string; mockData: (c: Contract) => DocumentData }[] = [
  { value: '자동차등록증', label: '자동차등록증', mockData: (c) => ({
    vehiclePlate: c.vehiclePlate,
    vehicleModel: c.vehicleModel,
    vehicleVin: 'KMHJ381ABLU' + Math.floor(100000 + Math.random() * 900000),
    vehicleYear: '2024',
    vehicleOwner: c.company,
  }) },
  { value: '보험증권', label: '보험증권', mockData: (c) => ({
    insurer: 'KB손해보험',
    insuredName: c.company,
    insuranceStart: c.contractDate,
    insuranceEnd: c.returnScheduledDate,
    insuranceAge: (c.insuranceAge ?? 26) + (Math.random() < 0.3 ? 2 : 0), // 30% 확률로 mismatch
    insuranceDriverScope: '지정1인',
  }) },
  { value: '계약서', label: '계약서/신분증', mockData: (c) => ({
    customerBirth: '1999-03-15',  // 만 26세 — 보험 26세 제한이면 OK, 28세 제한이면 fail
    vehiclePlate: c.vehiclePlate,
    vehicleModel: c.vehicleModel,
  }) },
  { value: '할부스케줄', label: '할부스케줄', mockData: (c) => ({
    installmentTotal: c.monthlyRent * c.termMonths,
    installmentMonths: c.termMonths + (Math.random() < 0.2 ? 1 : 0),
    installmentMonthly: c.monthlyRent,
    installmentStart: c.contractDate,
  }) },
];

function DocumentsTab({ c, onUpdate }: { c: Contract; onUpdate: (u: Contract) => void }) {
  const { vehicles, update: updateVehicle } = useVehicles();
  const vehicle = useMemo(
    () => vehicles.find((v) => v.plate?.trim() === c.vehiclePlate?.trim()),
    [vehicles, c.vehiclePlate],
  );
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [selectedKind, setSelectedKind] = useState<DocumentKind>('자동차등록증');
  const [busy, setBusy] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);

  /** DocumentKind → OCR API type */
  function ocrType(kind: DocumentKind): string | null {
    if (kind === '자동차등록증') return 'vehicle_reg';
    if (kind === '보험증권') return 'insurance_policy';
    if (kind === '계약서') return 'rental_contract';
    return null; // 할부스케줄/기타 — OCR 미지원
  }

  /** OCR raw → DocumentData 매핑 */
  function mapOcrToDocData(kind: DocumentKind, raw: Record<string, unknown>): DocumentData {
    const s = (k: string) => (raw[k] != null ? String(raw[k]) : undefined);
    const n = (k: string) => (raw[k] != null && !Number.isNaN(Number(raw[k])) ? Number(raw[k]) : undefined);

    if (kind === '자동차등록증') {
      return {
        vehiclePlate: s('car_number'),
        vehicleModel: s('car_name'),
        vehicleVin: s('vin'),
        vehicleYear: s('car_year_month')?.slice(0, 4),
        vehicleOwner: s('owner_name'),
        vehicleOwnerRegNo: s('owner_biz_no'),
      };
    }
    if (kind === '보험증권') {
      return {
        insurer: s('insurer'),
        insuredName: s('insured'),
        insuranceStart: s('start_date'),
        insuranceEnd: s('end_date'),
        insuranceAge: n('driver_age') ?? (s('driver_age')?.match(/(\d+)/)?.[1] ? Number(s('driver_age')!.match(/(\d+)/)![1]) : undefined),
        insuranceDriverScope: s('driver_scope'),
      };
    }
    if (kind === '계약서') {
      return {
        vehiclePlate: s('car_number'),
        vehicleModel: s('car_name'),
      };
    }
    return {};
  }

  /** OCR 결과 → Contract 필드 자동 반영 (사용자 확인 없이 채움). 비어있는 필드만 채움. */
  function applyOcrToContract(kind: DocumentKind, data: DocumentData): void {
    const patch: Partial<Contract> = {};
    if (kind === '자동차등록증') {
      // 검사만기 — vehicle_reg OCR 의 inspection_to → Contract.inspectionDueDate (없으면)
      // raw 에 inspection_to 가 있지만 DocumentData 에는 안 매핑됨. 직접 raw 에서 가져와야 함.
      // 이건 handleUpload 내에서 raw 통째로 다루므로 거기서 처리.
    }
    if (kind === '보험증권' && data.insuranceEnd && !c.insuranceExpiryDate) {
      patch.insuranceExpiryDate = data.insuranceEnd;
    }
    if (Object.keys(patch).length > 0) {
      onUpdate({ ...c, ...patch });
    }
  }

  async function handleUpload(file: File) {
    const type = ocrType(selectedKind);
    setBusy(true);
    setOcrError(null);
    try {
      let data: DocumentData = {};
      let raw: Record<string, unknown> = {};

      if (type) {
        // 실 Gemini OCR 호출
        const fd = new FormData();
        fd.append('file', file);
        fd.append('type', type);
        const { getFirebaseAuth } = await import('@/lib/firebase/client');
        const auth = getFirebaseAuth();
        const user = auth?.currentUser;
        const idToken = user ? await user.getIdToken() : '';
        const res = await fetch('/api/ocr/extract', {
          method: 'POST',
          headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
          body: fd,
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || 'OCR 실패');
        raw = json.extracted as Record<string, unknown>;
        data = mapOcrToDocData(selectedKind, raw);
      } else {
        // OCR 미지원 종류 (할부스케줄 등) — 빈 데이터로 등록만
        data = {};
      }

      const issues = validateDocument(data, c, selectedKind);
      const doc: UploadedDoc = {
        id: `doc-${Date.now()}`,
        kind: selectedKind,
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        data,
        issues,
      };
      setDocs((prev) => [doc, ...prev]);

      // ── 손님 다운로드용 Storage 영구 보관 ──
      // 등록증/보험증권 → Vehicle, 계약서 → Contract 에 URL 저장.
      // OCR 실패해도 이 단계까지 진행 (OCR은 부가 검증, Storage가 본판)
      try {
        const { uploadDocument, deleteDocumentByUrl } = await import('@/lib/firebase/storage');
        if (selectedKind === '자동차등록증' || selectedKind === '보험증권') {
          if (vehicle) {
            const kind = selectedKind === '자동차등록증' ? 'registration' : 'insurance';
            const up = await uploadDocument({ kind, ownerKey: vehicle.plate || vehicle.id, file });
            // 기존 파일 정리
            const prevUrl = selectedKind === '자동차등록증' ? vehicle.registrationCertUrl : vehicle.insuranceCertUrl;
            if (prevUrl) void deleteDocumentByUrl(prevUrl);
            const patch = selectedKind === '자동차등록증'
              ? { registrationCertUrl: up.url, registrationCertFileName: up.fileName, registrationCertUploadedAt: up.uploadedAt }
              : { insuranceCertUrl: up.url, insuranceCertFileName: up.fileName, insuranceCertUploadedAt: up.uploadedAt };
            await updateVehicle({ ...vehicle, ...patch });
          }
        } else if (selectedKind === '계약서') {
          const up = await uploadDocument({ kind: 'contract', ownerKey: c.contractNo || c.id, file });
          if (c.contractDocUrl) void deleteDocumentByUrl(c.contractDocUrl);
          onUpdate({
            ...c,
            contractDocUrl: up.url,
            contractDocFileName: up.fileName,
            contractDocUploadedAt: up.uploadedAt,
          });
        }
      } catch (storageErr) {
        console.error('[DocumentsTab] storage upload failed', storageErr);
        setOcrError(`서류는 등록됐으나 영구 보관 실패: ${(storageErr as Error).message ?? String(storageErr)}`);
      }

      // Contract 자동 반영 — 보험만기 / 검사만기 / 자동차세 등
      const patch: Partial<Contract> = {};
      if (selectedKind === '보험증권' && data.insuranceEnd && !c.insuranceExpiryDate) {
        patch.insuranceExpiryDate = data.insuranceEnd;
      }
      if (selectedKind === '자동차등록증' && raw.inspection_to && !c.inspectionDueDate) {
        patch.inspectionDueDate = String(raw.inspection_to);
      }
      if (Object.keys(patch).length > 0) {
        onUpdate({ ...c, ...patch });
      }
    } catch (e) {
      setOcrError((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function removeDoc(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }

  async function removeStoredDoc(kind: '자동차등록증' | '보험증권' | '계약서') {
    if (!confirm('영구 보관된 서류를 삭제하시겠습니까? 손님 페이지에서 더 이상 다운로드할 수 없게 됩니다.')) return;
    try {
      const { deleteDocumentByUrl } = await import('@/lib/firebase/storage');
      if (kind === '자동차등록증' && vehicle?.registrationCertUrl) {
        void deleteDocumentByUrl(vehicle.registrationCertUrl);
        await updateVehicle({ ...vehicle, registrationCertUrl: undefined, registrationCertFileName: undefined, registrationCertUploadedAt: undefined });
      } else if (kind === '보험증권' && vehicle?.insuranceCertUrl) {
        void deleteDocumentByUrl(vehicle.insuranceCertUrl);
        await updateVehicle({ ...vehicle, insuranceCertUrl: undefined, insuranceCertFileName: undefined, insuranceCertUploadedAt: undefined });
      } else if (kind === '계약서' && c.contractDocUrl) {
        void deleteDocumentByUrl(c.contractDocUrl);
        onUpdate({ ...c, contractDocUrl: undefined, contractDocFileName: undefined, contractDocUploadedAt: undefined });
      }
    } catch (e) {
      toast.error('삭제 실패: ' + ((e as Error).message ?? String(e)));
    }
  }

  /** 보관된 서류 슬롯 한 행 — 손님 페이지 노출 대상 */
  function StoredDocRow({
    kind, url, fileName, uploadedAt,
  }: { kind: '자동차등록증' | '보험증권' | '계약서'; url?: string; fileName?: string; uploadedAt?: string }) {
    const label = kind === '보험증권' ? '보험가입증명서' : kind;
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: '96px 1fr auto', alignItems: 'center',
        gap: 10, padding: '8px 12px',
        background: url ? 'var(--bg-card)' : 'var(--bg-sunken)',
        border: '1px solid var(--border-soft)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
          <FileText size={13} weight="duotone" style={{ color: url ? 'var(--green-text)' : 'var(--text-weak)' }} />
          {label}
        </div>
        <div style={{ fontSize: 11, color: url ? 'var(--text-sub)' : 'var(--text-weak)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {url ? (
            <>
              {fileName || '파일'}
              {uploadedAt && <span style={{ marginLeft: 6, color: 'var(--text-weak)' }}>· {uploadedAt.slice(0, 10)}</span>}
            </>
          ) : (
            <span>미첨부 — 아래 "서류 업로드"에서 {label === '보험가입증명서' ? '보험증권' : label} 선택 후 파일 올리면 자동 보관</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {url ? (
            <>
              <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-sm">다운로드</a>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => removeStoredDoc(kind)}>삭제</button>
            </>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--text-weak)' }}>—</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="detail-stack">
      <LicenseVerifySection c={c} onUpdate={onUpdate} />

      <Section icon={<FileText size={12} weight="duotone" />} title="보관 중인 서류 — 손님 페이지에서 다운로드 가능">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <StoredDocRow
            kind="자동차등록증"
            url={vehicle?.registrationCertUrl}
            fileName={vehicle?.registrationCertFileName}
            uploadedAt={vehicle?.registrationCertUploadedAt}
          />
          <StoredDocRow
            kind="보험증권"
            url={vehicle?.insuranceCertUrl}
            fileName={vehicle?.insuranceCertFileName}
            uploadedAt={vehicle?.insuranceCertUploadedAt}
          />
          <StoredDocRow
            kind="계약서"
            url={c.contractDocUrl}
            fileName={c.contractDocFileName}
            uploadedAt={c.contractDocUploadedAt}
          />
          {!vehicle && (
            <div style={{ fontSize: 11, color: 'var(--orange-text)', padding: '4px 12px' }}>
              ⚠ 같은 차량번호의 차량 마스터가 없습니다. 등록증/보험증명서는 차량 마스터에 저장되므로 먼저 차량을 등록해주세요.
            </div>
          )}
        </div>
      </Section>

      <Section icon={<FileText size={12} weight="duotone" />} title="서류 업로드 — 데이터와 자동 비교">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="filter-bar">
            {DOC_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                className={`chip ${selectedKind === k.value ? 'active' : ''}`}
                onClick={() => setSelectedKind(k.value)}
              >
                {k.label}
              </button>
            ))}
          </div>
          <label className="dropzone" style={{ minHeight: 100, cursor: busy ? 'wait' : 'pointer' }}>
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              disabled={busy}
              onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }}
            />
            <div className="dropzone-icon">
              {busy ? <CircleNotch weight="bold" style={{ animation: 'spin 1s linear infinite' }} /> : <Upload weight="duotone" />}
            </div>
            <div className="dropzone-title">{busy ? `${selectedKind} 분석 중...` : `${selectedKind} 업로드`}</div>
            <div className="dropzone-desc">파일 선택 또는 드래그 — OCR 추출 후 계약 데이터와 비교</div>
          </label>
        </div>
      </Section>

      <Section icon={<CheckCircle size={12} weight="duotone" />} title={`업로드된 서류 (${docs.length})`}>
        {docs.length === 0 ? (
          <div style={{ padding: '20px 12px', fontSize: 12, color: 'var(--text-weak)', textAlign: 'center' }}>
            아직 업로드된 서류가 없습니다.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {docs.map((d) => {
              const sum = summarizeIssues(d.issues);
              return (
                <div key={d.id} style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border-soft)' }}>
                    <FileText size={14} weight="duotone" style={{ color: 'var(--text-sub)' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{d.kind}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-weak)' }}>{d.fileName} · {d.uploadedAt.slice(0, 10)}</div>
                    </div>
                    {sum.ok ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--green-text)', fontWeight: 600 }}>
                        <CheckCircle size={12} weight="fill" /> 일치
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600 }}>
                        {sum.errors > 0 && <span style={{ color: 'var(--red-text)' }}><WarningIcon size={12} weight="fill" /> 오류 {sum.errors}</span>}
                        {sum.warns > 0 && <span style={{ color: 'var(--orange-text)', marginLeft: 6 }}>경고 {sum.warns}</span>}
                      </span>
                    )}
                    <button className="btn btn-sm btn-ghost btn-icon" type="button" onClick={() => removeDoc(d.id)}>
                      <XIcon />
                    </button>
                  </div>
                  {d.issues.length > 0 && (
                    <div style={{ padding: '8px 12px' }}>
                      {d.issues.map((iss, idx) => (
                        <div key={idx} style={{
                          display: 'grid',
                          gridTemplateColumns: '96px 1fr',
                          gap: 8,
                          padding: '4px 0',
                          fontSize: 11,
                          borderTop: idx > 0 ? '1px solid var(--border-soft)' : 'none',
                        }}>
                          <span style={{
                            color: iss.level === 'error' ? 'var(--red-text)' : 'var(--orange-text)',
                            fontWeight: 600,
                          }}>
                            {iss.label}
                          </span>
                          <span style={{ color: 'var(--text-sub)' }}>
                            <span style={{ color: 'var(--text-main)' }}>계약</span>: {iss.contractValue}
                            {' / '}
                            <span style={{ color: iss.level === 'error' ? 'var(--red-text)' : 'var(--orange-text)' }}>서류</span>: {iss.documentValue}
                            <span style={{ marginLeft: 8, color: 'var(--text-weak)' }}>— {iss.message}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

/* ─────────────── 면허검증 (RIMS) ─────────────── */

function LicenseVerifySection({ c, onUpdate }: { c: Contract; onUpdate: (u: Contract) => void }) {
  const [licenseNo, setLicenseNo] = useState(c.customerLicenseNo ?? '');
  const [licenseType, setLicenseType] = useState(c.customerLicenseType ?? '1종 보통');
  const [busy, setBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrInfo, setOcrInfo] = useState<{
    holderName?: string; birth?: string; licenseType?: string; expiry?: string;
    nameMatch?: boolean; birthMatch?: boolean;
  } | null>(null);
  const [result, setResult] = useState<{
    ok: boolean;
    mock?: boolean;
    status?: string;
    rtnCode?: string;
    rtnLabel?: string;
    rtnMessage?: string;
    vhclIdntyLabel?: string;
    licenseNoMasked?: string;
    error?: string;
  } | null>(null);

  const status = result?.status ?? c.customerLicenseStatus ?? '미조회';
  const checkedAt = c.customerLicenseCheckedAt;

  async function handleOcr(file: File) {
    setOcrBusy(true);
    setOcrInfo(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'license');
      const { getFirebaseAuth } = await import('@/lib/firebase/client');
      const auth = getFirebaseAuth();
      const user = auth?.currentUser;
      const idToken = user ? await user.getIdToken() : '';

      const res = await fetch('/api/ocr/extract', {
        method: 'POST',
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
        body: fd,
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'OCR 실패');

      const raw = json.extracted as Record<string, string | null>;
      const ln = (raw.license_no ?? '').trim();
      const holder = (raw.holder_name ?? '').trim();
      const birth = (raw.birth_date ?? '').trim();
      const ltype = (raw.license_type ?? '').trim();
      const expiry = (raw.expiry_date ?? '').trim();
      if (ltype) setLicenseType(ltype);

      const contractBirth = birthFromIdent(c.customerIdentNo, inferKind(c.customerIdentNo, c.customerKind))
        ?? contractBirthFromMasked(c.customerRegNoMasked);
      const nameMatch = holder && c.customerName ? norm(holder) === norm(c.customerName) : undefined;
      const birthMatch = birth && contractBirth ? birth === contractBirth : undefined;

      if (ln) setLicenseNo(ln);
      setOcrInfo({ holderName: holder, birth, licenseType: ltype, expiry, nameMatch, birthMatch });

      // 원본 파일 보관 — 보험증권 패턴. 면허증도 검증 후 영구 첨부 (RIMS 미연동 환경에서도 확인 가능)
      try {
        const { fileToDataUrl } = await import('@/lib/image-compress');
        const fileUrl = await fileToDataUrl(file);
        onUpdate({
          ...c,
          customerLicenseCertUrl: fileUrl,
          customerLicenseCertFileName: file.name,
          customerLicenseCertUploadedAt: new Date().toISOString(),
        });
      } catch (saveErr) {
        console.warn('[license OCR] 파일 보관 실패', saveErr);
      }
    } catch (e) {
      setOcrInfo({ holderName: `오류: ${(e as Error).message ?? String(e)}` });
    } finally {
      setOcrBusy(false);
    }
  }

  async function handleVerify() {
    if (!licenseNo.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const { getFirebaseAuth } = await import('@/lib/firebase/client');
      const auth = getFirebaseAuth();
      const user = auth?.currentUser;
      const idToken = user ? await user.getIdToken() : '';

      const res = await fetch('/api/license/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          licenseNo: licenseNo.trim(),
          // 법인 계약이면 주운전자명, 아니면 계약자명을 RIMS에 보냄
          customerName: c.customerKind === '법인' ? (c.driverName ?? '') : c.customerName,
          licenseType,
          vehiclePlate: c.vehiclePlate || '99임9999',
          fromDate: undefined,
          toDate: c.returnScheduledDate || undefined,
        }),
      });
      const json = await res.json();
      setResult(json);

      onUpdate({
        ...c,
        customerLicenseNo: licenseNo.trim(),
        customerLicenseType: licenseType,
        customerLicenseStatus: (json.status as Contract['customerLicenseStatus']) ?? '확인불가',
        customerLicenseCheckedAt: new Date().toISOString(),
      });
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message ?? String(e) });
    } finally {
      setBusy(false);
    }
  }

  const statusColor =
    status === '정상' ? 'var(--green-text)' :
    status === '미조회' || status === '확인불가' ? 'var(--text-weak)' :
    'var(--red-text)';

  return (
    <Section icon={<User size={12} weight="duotone" />} title="면허검증 — 한국교통안전공단 RIMS">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr 130px auto auto', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-weak)' }}>
            면허번호
            {licenseNo && (
              <span style={{
                marginLeft: 6, fontSize: 10,
                color: licenseNo.replace(/\D/g, '').length === 12 ? 'var(--green-text)' : 'var(--orange-text)',
              }}>
                {licenseNo.replace(/\D/g, '').length}/12
              </span>
            )}
          </div>
          <input
            className="input"
            placeholder="예: 11-12-345678-90 (숫자 12자리)"
            value={licenseNo}
            onChange={(e) => setLicenseNo(e.target.value)}
            disabled={busy}
            style={{
              borderColor: licenseNo && licenseNo.replace(/\D/g, '').length !== 12 ? 'var(--orange-text)' : undefined,
            }}
          />
          <select
            className="input"
            value={licenseType}
            onChange={(e) => setLicenseType(e.target.value)}
            disabled={busy}
            title="면허 종별"
          >
            <option value="1종 대형">1종 대형</option>
            <option value="1종 보통">1종 보통</option>
            <option value="1종 소형">1종 소형</option>
            <option value="대형견인차">대형견인차</option>
            <option value="구난차">구난차</option>
            <option value="소형견인차">소형견인차</option>
            <option value="2종 보통">2종 보통</option>
            <option value="2종 소형">2종 소형</option>
            <option value="2종 원동기">2종 원동기</option>
          </select>
          <label className="btn" style={{ cursor: ocrBusy ? 'wait' : 'pointer' }}>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={ocrBusy}
              onChange={(e) => { if (e.target.files?.[0]) handleOcr(e.target.files[0]); }}
            />
            {ocrBusy ? <CircleNotch weight="bold" style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={12} weight="duotone" />}
            {ocrBusy ? '추출 중...' : '면허증 OCR'}
          </label>
          <button
            className="btn btn-primary"
            type="button"
            onClick={handleVerify}
            disabled={busy || !licenseNo.trim()}
          >
            {busy ? <CircleNotch weight="bold" style={{ animation: 'spin 1s linear infinite' }} /> : null}
            {busy ? '조회 중...' : '검증'}
          </button>
        </div>

        {ocrInfo && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
            padding: 10,
            background: 'var(--bg-sunken)',
            border: '1px solid var(--border-soft)',
          }}>
            <MiniField
              label="OCR 성명"
              value={ocrInfo.holderName ?? '—'}
              valueColor={ocrInfo.nameMatch === false ? 'var(--red-text)' : ocrInfo.nameMatch ? 'var(--green-text)' : undefined}
            />
            <MiniField
              label="OCR 생년월일"
              value={ocrInfo.birth ?? '—'}
              valueColor={ocrInfo.birthMatch === false ? 'var(--red-text)' : ocrInfo.birthMatch ? 'var(--green-text)' : undefined}
            />
            <MiniField label="면허종류" value={ocrInfo.licenseType ?? '—'} />
            <MiniField label="갱신만료" value={ocrInfo.expiry ?? '—'} />
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          padding: 10,
          border: '1px solid var(--border-soft)',
          background: 'var(--bg-card)',
        }}>
          <MiniField label="상태" value={status} valueColor={statusColor} bold />
          <MiniField label="RIMS 사유" value={result?.rtnLabel ?? '—'} />
          <MiniField label="차량확인" value={result?.vhclIdntyLabel ?? '—'} />
          <MiniField label="최근조회" value={checkedAt ? checkedAt.slice(0, 16).replace('T', ' ') : '—'} />
        </div>

        {result?.mock && (
          <div style={{ fontSize: 11, color: 'var(--orange-text)', padding: '6px 10px', background: 'var(--bg-card)', border: '1px solid var(--border-soft)' }}>
            <WarningIcon size={12} weight="fill" style={{ verticalAlign: 'text-top', marginRight: 4 }} />
            RIMS env 미설정 — mock 응답입니다. .env.local 의 RIMS_AUTH_KEY / RIMS_SECRET_KEY 확인.
            {result.rtnMessage ? <span style={{ marginLeft: 6, color: 'var(--text-weak)' }}>({result.rtnMessage})</span> : null}
          </div>
        )}
        {result && !result.ok && !result.mock && result.rtnMessage && (
          <div style={{ fontSize: 11, color: 'var(--red-text)', padding: '6px 10px', background: 'var(--bg-card)', border: '1px solid var(--red-text)' }}>
            <WarningIcon size={12} weight="fill" style={{ verticalAlign: 'text-top', marginRight: 4 }} />
            {result.rtnMessage}
            {result.rtnCode ? <span style={{ marginLeft: 6, color: 'var(--text-weak)' }}>(코드 {result.rtnCode})</span> : null}
          </div>
        )}
        {result?.licenseNoMasked && (
          <div style={{ fontSize: 11, color: 'var(--text-weak)', padding: '2px 10px' }}>
            RIMS 응답 면허번호 (마스킹): <span className="mono">{result.licenseNoMasked}</span>
          </div>
        )}
      </div>
    </Section>
  );
}

function norm(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

function contractBirthFromMasked(masked?: string): string | undefined {
  if (!masked) return undefined;
  const m = masked.match(/^(\d{2})(\d{2})(\d{2})-([1-4])/);
  if (!m) return undefined;
  const [, yy, mm, dd, g] = m;
  const century = (g === '1' || g === '2') ? 1900 : 2000;
  return `${century + parseInt(yy, 10)}-${mm}-${dd}`;
}

function MiniField({ label, value, valueColor, bold }: { label: string; value: string; valueColor?: string; bold?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-weak)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: valueColor ?? 'var(--text-main)', fontWeight: bold ? 600 : 400 }}>{value}</div>
    </div>
  );
}
