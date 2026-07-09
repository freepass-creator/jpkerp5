'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  User, Car, FileText, CurrencyKrw, Plus, X,
} from '@phosphor-icons/react';
import { DetailDialogShell } from '@/components/ui/detail-dialog-shell';
import { type EditableTabHandle } from '@/components/ui/edit-buttons';
import { VehiclePhotosByKind } from '@/components/vehicle-photos-section';
import { Field as SharedField } from '@/components/ui/editable-field';
import { Section } from '@/components/ui/detail-primitives';
import { StatusBadge } from '@/components/ui/status-badge';
import { toast } from '@/lib/toast';
import { vehicleStateTone, contractStateTone, paymentStateTone, contractStatusTone } from '@/lib/status-tones';
import type { Contract, VehicleStatus } from '@/lib/types';
import { formatCurrency, formatDateFull } from '@/lib/utils';
import { displayCompanyName } from '@/lib/company-display';
import { useCompanies } from '@/lib/firebase/companies-store';
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
import { VehicleSpecTab } from '@/components/contract-detail/vehicle-spec-tab';
import { ContractInfoTab } from '@/components/contract-detail/contract-info-tab';
import { ContractHealthStrip } from '@/components/contract-detail/contract-health-strip';
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
  const today = todayKr();   // KST — UTC toISOString 은 0~9시에 전날이라 D-day 하루 밀림
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
        { value: 'status', label: '상태', content: (
          <>
            {contract.customerName?.trim() && <ContractHealthStrip c={contract} />}
            <VehicleStatusTab c={contract} onUpdate={onUpdate} />
          </>
        ) },
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




