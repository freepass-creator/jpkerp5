'use client';

/**
 * 계약 detail dialog 의 차량 상태 탭 — VehicleStatusTab + StatusInlineEdit
 * + EndInfoSection + AttachmentList + VehicleLocationEditor.
 *
 * 원래 contract-detail-dialog.tsx 안에 인라인이었으나 거대화 → 분리 (2026-06-19).
 * 동일 export 로 외부 임포트 호환.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  ArrowUUpLeft, ArrowsLeftRight, Car, CheckCircle, FileText,
  PauseCircle, PlayCircle, Warning as WarningIcon,
} from '@phosphor-icons/react';
import { Section } from '@/components/ui/detail-primitives';
import { DepositSection } from '@/components/contract-detail/deposit-section';
import { isContractEnded } from '@/lib/contract-lifecycle';
import { Field as SharedField } from '@/components/ui/editable-field';
import { MissingBadge, MissingText } from '@/components/ui/missing-badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { DateInput } from '@/components/ui/date-input';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';
import { formatCurrency, formatDateFull, daysSince, monthsBetween } from '@/lib/utils';
import { todayKr } from '@/lib/mock-data';
import { markReturned, revertToOperating } from '@/lib/contract-actions';
import {
  currentStage, stageLabel, daysToExpiry, getExpiryDate,
  getVehicleState, getContractState, getPaymentState,
  type Stage,
} from '@/lib/contract-stage';
import { extendSchedules } from '@/lib/payment-schedule';
import {
  vehicleStateTone, contractStateTone, paymentStateTone,
} from '@/lib/status-tones';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import type { Contract, VehicleStatus } from '@/lib/types';

const Field = SharedField;

const IDLE_REASONS = ['사고', '정비', '검수', '대기'] as const;
type IdleReason = typeof IDLE_REASONS[number];

/** 단계별 진행 체크리스트 — 항목은 운영하면서 조정 */
const STAGE_CHECKLISTS: Partial<Record<Stage, { label: string; nextLabel: string; items: string[] }>> = {
  '구매대기': {
    label: '구매 진행 체크',
    nextLabel: '구매 완료 → 등록대기',
    items: ['차량 매입 계약 체결', '매입 대금 결제', '차량 인수 (탁송 포함)', '차대번호 확인'],
  },
  '등록대기': {
    label: '등록 진행 체크',
    nextLabel: '등록 완료 → 상품화대기',
    items: ['번호판 발급', '자동차 등록증 수령', '책임/자차 보험 가입', '취득세·등록세 납부', '차고지 증명'],
  },
  '상품화대기': {
    label: '상품화 착수 준비',
    nextLabel: '상품화 착수 → 상품화중',
    items: ['정비소 일정 확인', '필요 부품 발주', '작업 견적 확정'],
  },
  '상품화중': {
    label: '상품화 진행 체크',
    nextLabel: '상품화 완료 → 상품대기',
    items: ['외관 클리닝', '내부 디테일링', '엔진/하부 점검', '블랙박스 설치', '하이패스 설치', '사진 촬영 (외/내/주요 결함)'],
  },
  '상품대기': {
    label: '영업 가능 — 다음 임차 대기',
    nextLabel: '계약 생성 (외부) → 계약중',
    items: [],
  },
  '운행': {
    label: '반납 검수 체크 (반납회수 시)',
    nextLabel: '반납회수 → 휴차대기',
    items: ['차량 외관 공동 검수', '내부 청소 상태 확인', '주행거리 기록', '연료 잔량 확인', '키·매뉴얼 회수', '면책금/위약금 정산'],
  },
  '만기임박': {
    label: '만기 협의 — 통화 후 결정',
    nextLabel: '연장 / 종료 결정',
    items: [],
  },
  '만기경과': {
    label: '만기 경과 — 즉시 협의',
    nextLabel: '연장 / 종료 결정',
    items: [],
  },
  '연장대기': {
    label: '연장 협의 — 새 조건 협상',
    nextLabel: '연장 처리 (새 반납예정일) → 운행',
    items: [],
  },
  '종료대기': {
    label: '반납 검수 체크 (반납 약속일 도래 시)',
    nextLabel: '반납회수 → 휴차대기',
    items: ['차량 외관 공동 검수', '내부 청소 상태 확인', '주행거리 기록', '연료 잔량 확인', '키·매뉴얼 회수', '면책금/위약금 정산'],
  },
  '휴차대기': {
    label: '재진입 결정',
    nextLabel: '재상품화 / 매각검토 선택',
    items: [],
  },
  '매각검토': {
    label: '매각 여부 검토',
    nextLabel: '매각 결정 / 보류 (휴차대기 복귀)',
    items: ['시세 조사', '주행거리·연식 평가', '잔존가치 산정', '매입처 사전 견적'],
  },
  '매각대기': {
    label: '매각 진행 체크',
    nextLabel: '매각완료',
    items: ['매각 가격 산정', '매각처 확정', '대금 입금 확인', '명의 이전 서류', '말소 등록'],
  },
};

/* ─────────────── 차량상태 — 라이프사이클 + 액션 + 체크리스트 ─────────────── */

/** 클릭하여 편집 — 평소 텍스트, 클릭 시 input, blur/Enter 저장, ESC 취소 */
function StatusInlineEdit({
  label, value, placeholder, hint, onSave,
}: {
  label: string;
  value: string | undefined;
  /** input 안 placeholder (편집 모드) */
  placeholder?: string;
  /** read-only 모드에서 값 없을 때 보일 안내 (작업 상태 컨텍스트 등) */
  hint?: string;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => { setDraft(value ?? ''); }, [value]);

  const persist = () => {
    if (draft !== (value ?? '')) onSave(draft);
    setEditing(false);
  };
  const cancel = () => { setDraft(value ?? ''); setEditing(false); };

  if (!editing) {
    return (
      <div
        className="detail-field detail-field-clickable"
        onClick={() => setEditing(true)}
        title="클릭하여 수정"
        style={{ cursor: 'text' }}
      >
        <div className="label">{label}</div>
        <div className="value">
          {value
            ? value
            : <span className="muted">{hint || placeholder || '클릭하여 입력'}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="detail-field is-editing">
      <div className="label">{label}</div>
      <input
        className="detail-field-input"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={persist}
        onKeyDown={(e) => {
          if (e.key === 'Enter') persist();
          if (e.key === 'Escape') cancel();
        }}
        placeholder={placeholder}
      />
    </div>
  );
}

export function VehicleStatusTab({ c, onUpdate }: { c: Contract; onUpdate: (u: Contract) => void }) {
  const stage = currentStage(c);
  const vs = getVehicleState(c);
  const cs = getContractState(c);
  const ps = getPaymentState(c);

  // 현재 작업 상태 — 위치 + stage 기반 합성 문장
  const workingContext = (() => {
    const s = c.vehicleStatus;
    const loc = c.idleLocation;
    if (s === '구매대기') return loc ? `${loc}에서 구매 진행` : '구매 대기 중';
    if (s === '등록대기') return loc ? `${loc}에서 등록 진행` : '등록 대기 중';
    if (s === '상품화중' || s === '상품화대기') return loc ? `${loc}에서 상품화 작업` : '상품화 작업 중';
    if (s === '인도대기' || s === '출고대기') return loc ? `${loc}에서 인도 준비` : '인도 준비 중';
    if (s === '휴차' || s === '휴차대기') {
      const reason = c.idleReason?.split(' — ')[0] ?? '대기';
      return loc ? `${loc}에서 ${reason}` : `${reason} 중`;
    }
    if (s === '정비') return loc ? `${loc}에서 정비 작업` : '정비 중';
    if (s === '사고') return loc ? `${loc}에서 사고 수리` : '사고 수리 중';
    if (s === '매각검토') return loc ? `${loc}에서 매각 검토` : '매각 검토 중';
    if (s === '매각대기') return loc ? `${loc}에서 매각 진행` : '매각 진행 중';
    if (s === '운행') return c.customerName ? `${c.customerName} 인도 — 운행 중` : '운행 중';
    if (s === '임시배차') return c.tempReplacementPlate ? `${c.tempReplacementPlate} 임시 배차 중` : '임시 배차 중';
    return stageLabel(stage);
  })();
  const [actionDate, setActionDate] = useState<string>(todayKr());
  const [idlePicker, setIdlePicker] = useState(false);
  const [idleSubReason, setIdleSubReason] = useState<IdleReason>('정비');
  const [idleMemo, setIdleMemo] = useState('');
  const [tempPicker, setTempPicker] = useState(false);
  const [tempPlate, setTempPlate] = useState('');
  const [tempModel, setTempModel] = useState('');
  const [tempReason, setTempReason] = useState('');
  const [renewPicker, setRenewPicker] = useState(false);
  const [renewNewReturn, setRenewNewReturn] = useState('');
  const [renewNewRent, setRenewNewRent] = useState('');
  const [renewMemo, setRenewMemo] = useState('');
  const [endPicker, setEndPicker] = useState(false);
  const [endPromisedDate, setEndPromisedDate] = useState('');
  const [endMemo, setEndMemo] = useState('');
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  const checklist = STAGE_CHECKLISTS[stage];
  const checkedCount = checklist ? checklist.items.filter((_, i) => checks[`${stage}-${i}`]).length : 0;
  const allChecked = !checklist || checkedCount === checklist.items.length;

  function toggleCheck(i: number) {
    const k = `${stage}-${i}`;
    setChecks((prev) => ({ ...prev, [k]: !prev[k] }));
  }

  function advance(to: VehicleStatus, dateField?: keyof Contract) {
    const updated: Contract = { ...c, vehicleStatus: to };
    if (dateField) {
      (updated as Record<string, unknown>)[dateField] = actionDate;
    }
    if (to === '운행' && dateField === 'deliveredDate') {
      updated.status = '운행';
      updated.currentSeq = 1;
    }
    onUpdate(updated);
  }

  function resumeFromIdle() {
    onUpdate({ ...c, vehicleStatus: '운행', idleSince: undefined, idleUntil: undefined, idleReason: undefined });
  }

  function processReturn() {
    onUpdate({ ...c, vehicleStatus: '반납', status: '반납', returnedDate: actionDate, ...deriveEndPatch(c, actionDate) });
  }

  /** 종료 사유 자동 결정 — unpaid > 0 → 채권보전, returnedDate < returnScheduledDate → 중도해지, 그 외 정상종료 */
  function deriveEndPatch(curr: Contract, endDate: string): Partial<Contract> {
    const unpaid = curr.unpaidAmount ?? 0;
    let endReason: '정상종료' | '중도해지' | '채권보전';
    if (unpaid > 0) endReason = '채권보전';
    else if (curr.returnScheduledDate && endDate < curr.returnScheduledDate) endReason = '중도해지';
    else endReason = '정상종료';
    return {
      endReason,
      endedAt: endDate,
      unpaidAtEnd: unpaid,
    };
  }

  function commitIdle() {
    const fullReason = `${idleSubReason}${idleMemo ? ' — ' + idleMemo : ''}`;
    onUpdate({ ...c, vehicleStatus: '휴차', idleSince: actionDate, idleReason: fullReason });
    setIdlePicker(false);
    setIdleMemo('');
  }

  function commitTemp() {
    if (!tempPlate || !tempReason) {
      toast.error('대체 차량번호와 사유를 입력해주세요');
      return;
    }
    onUpdate({
      ...c,
      vehicleStatus: '임시배차',
      tempReplacementPlate: tempPlate,
      tempReplacementModel: tempModel,
      tempReason,
      tempSince: actionDate,
      // 원본 차량이 복귀하면 알림 (Phase 2 — 데이터만 기록)
      notifyOnAvailable: [c.vehiclePlate],
    });
    setTempPicker(false);
    setTempPlate('');
    setTempModel('');
    setTempReason('');
  }

  function clearTemp() {
    onUpdate({
      ...c,
      vehicleStatus: '운행',
      tempReplacementPlate: undefined,
      tempReplacementModel: undefined,
      tempReason: undefined,
      tempSince: undefined,
      notifyOnAvailable: undefined,
    });
  }

  /** 연장 처리 — 새 반납예정일 + (선택) 월대여료 갱신, 운행 복귀 */
  function commitRenewal() {
    if (!renewNewReturn) { toast.error('새 반납예정일을 입력하세요'); return; }
    // 연장이므로 현재 만기 이후여야 함 (계약일 기준이면 단축을 연장으로 통과시켜 기간 drift 유발)
    const currentExpiry = getExpiryDate(c) ?? c.contractDate;
    if (renewNewReturn <= currentExpiry) { toast.error(`새 반납예정일은 현재 만기(${currentExpiry}) 이후여야 합니다`); return; }
    const newRent = renewNewRent ? parseInt(renewNewRent.replace(/[^0-9]/g, ''), 10) || c.monthlyRent : c.monthlyRent;
    // 새 종료일까지 약정개월 재계산 — calendar months (나누기 X)
    const newTerm = Math.max(c.termMonths, monthsBetween(c.contractDate, renewNewReturn));
    onUpdate({
      ...c,
      vehicleStatus: '운행',
      returnScheduledDate: renewNewReturn,
      termMonths: newTerm,
      monthlyRent: newRent,
      totalSeq: newTerm,
      schedules: extendSchedules({ ...c, monthlyRent: newRent }, newTerm),   // 연장분 회차 append
      notes: [c.notes, `[${actionDate}] 연장 처리 — 새 반납예정일 ${renewNewReturn}${renewMemo ? ' / ' + renewMemo : ''}`].filter(Boolean).join('\n'),
    });
    setRenewPicker(false); setRenewNewReturn(''); setRenewNewRent(''); setRenewMemo('');
  }

  /** 종료 결정 — 반납 약속일 기록, 종료대기 전환 */
  function commitEndPromise() {
    if (!endPromisedDate) { toast.error('반납 약속일을 입력하세요'); return; }
    onUpdate({
      ...c,
      vehicleStatus: '종료대기',
      returnScheduledDate: endPromisedDate,
      notes: [c.notes, `[${actionDate}] 종료 결정 — 반납 약속 ${endPromisedDate}${endMemo ? ' / ' + endMemo : ''}`].filter(Boolean).join('\n'),
    });
    setEndPicker(false); setEndPromisedDate(''); setEndMemo('');
  }

  /** 연장대기 / 종료대기 → 운행 복귀 (결정 취소) */
  async function revertToRunning() {
    if (!await showConfirm({ title: '결정을 취소하고 계약중(운행)로 되돌립니다. 계속하시겠습니까?' })) return;
    onUpdate({ ...c, vehicleStatus: '운행' });
  }

  /** 되돌리기 — 한 단계 이전으로 (실수 정정용) */
  async function revertStage() {
    if (!await showConfirm({ title: `현재 단계(${stage})를 이전 단계로 되돌립니다. 계속하시겠습니까?` })) return;
    switch (stage) {
      case '매각':
        onUpdate({ ...c, vehicleStatus: '매각대기' });
        break;
      case '매각대기':
        onUpdate({ ...c, vehicleStatus: '휴차대기' });
        break;
      case '휴차대기':
        // 반납회수 취소 → 운행 복귀 (SSOT — 면제회차·반납일할·종료정보 정리 포함)
        onUpdate(revertToOperating(c));
        break;
      case '운행':
        // 인도 취소 → 상품대기
        onUpdate({ ...c, vehicleStatus: '상품대기', status: '대기', deliveredDate: undefined, currentSeq: 0 });
        break;
      case '상품대기':
        onUpdate({ ...c, vehicleStatus: '상품화중', readiedDate: undefined });
        break;
      case '상품화중':
        onUpdate({ ...c, vehicleStatus: '상품화대기' });
        break;
      case '상품화대기':
        onUpdate({ ...c, vehicleStatus: '등록대기', registeredDate: undefined });
        break;
      case '등록대기':
        onUpdate({ ...c, vehicleStatus: '구매대기', purchasedDate: undefined });
        break;
      case '휴차':
        resumeFromIdle();
        break;
      case '임시배차':
        clearTemp();
        break;
    }
  }

  const canRevert = stage !== '구매대기';

  return (
    <div className="detail-stack">
      {/* 현재 상태 — 1행 상태 칩 3개 + 2행 위치/작업/비고 (inline 편집) */}
      <Section
        icon={<Car size={12} weight="duotone" />}
        title="현재 상태"
      >
        <div className="detail-grid-3">
          <Field label="차량 상태" value={<StatusBadge tone={vehicleStateTone(vs.name)}>{vs.name}</StatusBadge>} />
          <Field label="계약 상태" value={<StatusBadge tone={contractStateTone(cs.name)}>{cs.name}</StatusBadge>} />
          <Field label="수납 상태" value={<StatusBadge tone={paymentStateTone(ps.name)}>{ps.name}</StatusBadge>} />
        </div>
        <div className="detail-grid-3" style={{ marginTop: 8 }}>
          <StatusInlineEdit
            label="현재 위치"
            value={c.idleLocation}
            placeholder="예: 김포 주차장 B-12"
            onSave={(v) => onUpdate({ ...c, idleLocation: v || undefined })}
          />
          <StatusInlineEdit
            label="작업 상태"
            value={c.idleReason}
            placeholder={workingContext}
            onSave={(v) => onUpdate({ ...c, idleReason: v || undefined })}
          />
          <StatusInlineEdit
            label="비고"
            value={c.notes}
            placeholder="메모"
            onSave={(v) => onUpdate({ ...c, notes: v || undefined })}
          />
        </div>
      </Section>

      {/* 차량 사진은 별도 '사진' 탭으로 분리됨 (상태 탭에서 제거) */}

      {/* 처리·진행 — 단계별 액션 + 체크리스트 + picker (현재 상태 바로 밑) */}
      <Section
        icon={<ArrowsLeftRight size={12} weight="duotone" />}
        title="처리·진행"
        action={null}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-weak)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            처리일
          </span>
          <DateInput
            value={actionDate}
            onChange={setActionDate}
            style={{ width: 200 }}
          />
          {/* 빠른 상태 변경 — dropdown 으로 직접 전환 (흐름 거치지 않고). 부수효과는 sync 헬퍼가 처리 */}
          <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-weak)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            상태 직접 변경
          </span>
          <select
            className="input"
            value=""
            onChange={async (e) => {
              const next = e.target.value as VehicleStatus;
              if (!next) return;
              // '반납' 은 상태값만 바꾸면 계약이 운영중으로 남아 청구가 계속됨 → 반납 SSOT(markReturned)
              // 로 라우팅해 status='반납'+returnedDate+일할 자동정산까지 처리(정상 '반납회수' 흐름과 동일).
              if (next === '반납') {
                if (!await showConfirm({ title: `${c.vehiclePlate} 반납 처리합니다 (반납일=오늘, 일할 자동정산). 진행할까요?` })) return;
                onUpdate(markReturned(c, todayKr()));
                toast.success(`반납 처리: ${c.vehiclePlate}`);
                return;
              }
              if (!await showConfirm({ title: `차량 상태를 '${next}' 로 변경합니다.\n진행할까요?` })) return;
              onUpdate({ ...c, vehicleStatus: next });
              toast.success(`상태 변경: ${c.vehicleStatus} → ${next}`);
            }}
            style={{ width: 160 }}
          >
            <option value="">선택…</option>
            <optgroup label="운영 라이프사이클">
              <option value="구매대기">구매대기</option>
              <option value="등록대기">등록대기</option>
              <option value="상품화대기">상품화대기</option>
              <option value="상품화중">상품화중</option>
              <option value="상품대기">상품대기</option>
              <option value="운행">운행 (계약중)</option>
            </optgroup>
            <optgroup label="만기·반납">
              <option value="연장대기">연장대기</option>
              <option value="종료대기">종료대기</option>
              <option value="반납">반납</option>
            </optgroup>
            <optgroup label="휴차·매각">
              <option value="휴차대기">휴차대기</option>
              <option value="휴차">휴차</option>
              <option value="매각검토">매각검토</option>
              <option value="매각대기">매각대기</option>
              <option value="매각">매각</option>
            </optgroup>
            <optgroup label="기타">
              <option value="정비">정비</option>
              <option value="사고">사고</option>
              <option value="인도대기">인도대기</option>
              <option value="출고대기">출고대기</option>
              <option value="임시배차">임시배차</option>
            </optgroup>
          </select>
        </div>

        {/* 임시배차 picker */}
        {tempPicker && (
          <div style={{ padding: 12, background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 8, fontWeight: 500 }}>
              임시배차 — 원본 차량 ({c.vehiclePlate} {c.vehicleModel}) 대신 출고할 차량
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: '8px 12px', alignItems: 'center', marginBottom: 10 }}>
              <label className="form-label">대체 차량번호 *</label>
              <input className="input" placeholder="예: 109호5678" value={tempPlate} onChange={(e) => setTempPlate(e.target.value)} style={{ width: 240 }} />
              <label className="form-label">대체 차종</label>
              <input className="input" placeholder="예: K8" value={tempModel} onChange={(e) => setTempModel(e.target.value)} />
              <label className="form-label">사유 *</label>
              <input className="input" placeholder="예: K5 정비입고로 K8 임시 배차" value={tempReason} onChange={(e) => setTempReason(e.target.value)} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-weak)', marginBottom: 10 }}>
              원본 차량({c.vehiclePlate})이 휴차/반납으로 복귀하면 자동 알림 — Phase 2
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-primary" onClick={commitTemp}>
                <CheckCircle size={14} /> 임시배차 등록
              </button>
              <button className="btn" onClick={() => setTempPicker(false)}>취소</button>
            </div>
          </div>
        )}

        {/* 휴차 사유 picker */}
        {idlePicker && (
          <div style={{ padding: 12, background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 8, fontWeight: 500 }}>휴차 사유</div>
            <div className="filter-bar" style={{ marginBottom: 10 }}>
              {IDLE_REASONS.map((r) => (
                <button type="button" key={r} className={`chip ${idleSubReason === r ? 'active' : ''}`} onClick={() => setIdleSubReason(r)}>
                  {r}
                </button>
              ))}
            </div>
            <input
              className="input"
              placeholder="상세 메모 (선택) — 예: 우측 펜더 파손, 5/20 출고 예정"
              value={idleMemo}
              onChange={(e) => setIdleMemo(e.target.value)}
              style={{ width: '100%', marginBottom: 10 }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-primary" onClick={commitIdle}>
                <PauseCircle size={14} weight="fill" /> {idleSubReason} 사유로 휴차 전환
              </button>
              <button className="btn" onClick={() => setIdlePicker(false)}>취소</button>
            </div>
          </div>
        )}

        {/* 체크리스트 — 단계 진행 항목. items 비어있으면 박스 자체 렌더 X (만기경과 stage 등) */}
        {checklist && checklist.items.length > 0 && (
          <div className="checklist" style={{ marginBottom: 12 }}>
            <div className="checklist-header">
              <span>{checklist.label}</span>
              <span className={`checklist-progress ${allChecked ? 'complete' : ''}`}>
                {checkedCount}/{checklist.items.length} 완료
              </span>
            </div>
            {checklist.items.map((item, i) => {
              const k = `${stage}-${i}`;
              const checked = !!checks[k];
              return (
                <label key={k} className={`checklist-item ${checked ? 'checked' : ''}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleCheck(i)} />
                  <span>{item}</span>
                </label>
              );
            })}
          </div>
        )}

        {/* 만기임박 배너 — 운행 + 만기 D-90 이내 자동 표시 */}
        {(stage === '만기임박' || stage === '만기경과') && !renewPicker && !endPicker && (() => {
          const d = daysToExpiry(c, todayKr()) ?? 0;
          const tone = d < 0 ? 'red' : d <= 7 ? 'red' : d <= 30 ? 'orange' : 'yellow';
          const bg = tone === 'red' ? 'var(--red-bg)' : tone === 'orange' ? 'var(--orange-bg)' : '#fef9c3';
          const text = tone === 'red' ? 'var(--red-text)' : tone === 'orange' ? 'var(--orange-text)' : '#854d0e';
          const label = d < 0 ? `만기 경과 D+${-d}일` : d === 0 ? '오늘 만기' : `만기 D-${d}일`;
          return (
            <div style={{
              padding: 14, marginBottom: 12, background: bg, color: text,
              borderRadius: 'var(--radius-lg)', border: `1px solid ${text}`,
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                ⚠ 계약 만기 임박 — {label}
              </div>
              <div style={{ fontSize: 12, marginBottom: 12, opacity: 0.85 }}>
                반납예정일 <strong>{c.returnScheduledDate}</strong> · 월대여료 ₩{formatCurrency(c.monthlyRent)}
                <br />고객과 통화하여 연장 / 종료 의사를 확인하세요.
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => {
                  setRenewPicker(true);
                  setRenewNewReturn(c.returnScheduledDate || '');
                  setRenewNewRent(String(c.monthlyRent));
                }}>
                  <PlayCircle size={14} /> 연장 처리
                </button>
                <button className="btn" onClick={() => {
                  setEndPicker(true);
                  setEndPromisedDate(c.returnScheduledDate || todayKr());
                }}>
                  <ArrowUUpLeft size={14} /> 종료 결정
                </button>
                <button className="btn btn-ghost" onClick={() => {
                  onUpdate({ ...c, vehicleStatus: '연장대기' });
                }} title="협의 중 — 결정 보류">
                  <PauseCircle size={14} /> 연장대기 (협의 중)
                </button>
              </div>
            </div>
          );
        })()}

        {/* 연장 picker */}
        {renewPicker && (
          <div style={{ padding: 12, background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 8, fontWeight: 500 }}>연장 처리 — 새 반납예정일 / 월대여료</div>
            <div className="form-grid-2" style={{ marginBottom: 16 }}>
              <label className="form-label">새 반납예정일 *</label>
              <DateInput value={renewNewReturn} onChange={setRenewNewReturn} style={{ width: 200 }} />
              <label className="form-label">월대여료 (선택)</label>
              <input className="input mono" placeholder={`현재 ₩${formatCurrency(c.monthlyRent)}`}
                value={renewNewRent} onChange={(e) => setRenewNewRent(e.target.value.replace(/[^0-9]/g, ''))}
                style={{ width: 200 }} />
              <label className="form-label">메모</label>
              <input className="input" placeholder="예: 12개월 연장, 동일 조건"
                value={renewMemo} onChange={(e) => setRenewMemo(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-primary" onClick={commitRenewal}>
                <CheckCircle size={14} /> 연장 처리 완료 → 운행 복귀
              </button>
              <button className="btn" onClick={() => setRenewPicker(false)}>취소</button>
            </div>
          </div>
        )}

        {/* 종료 picker */}
        {endPicker && (
          <div style={{ padding: 12, background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 8, fontWeight: 500 }}>종료 결정 — 반납 약속일</div>
            <div className="form-grid-2" style={{ marginBottom: 16 }}>
              <label className="form-label">반납 약속일 *</label>
              <DateInput value={endPromisedDate} onChange={setEndPromisedDate} style={{ width: 200 }} />
              <label className="form-label">메모</label>
              <input className="input" placeholder="예: 5/30 본사 반납, 검수 약속"
                value={endMemo} onChange={(e) => setEndMemo(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-primary" onClick={commitEndPromise}>
                <CheckCircle size={14} /> 종료대기 전환
              </button>
              <button className="btn" onClick={() => setEndPicker(false)}>취소</button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {stage === '구매대기' && (
            <button className="btn btn-primary" disabled={!allChecked} onClick={() => advance('등록대기', 'purchasedDate')}>
              <CheckCircle size={14} /> 구매완료 → 등록대기
            </button>
          )}
          {stage === '등록대기' && (
            <button className="btn btn-primary" disabled={!allChecked} onClick={() => advance('상품화대기', 'registeredDate')}>
              <CheckCircle size={14} /> 등록완료 → 상품화대기
            </button>
          )}
          {stage === '상품화대기' && (
            <button className="btn btn-primary" disabled={!allChecked} onClick={() => advance('상품화중')}>
              <CheckCircle size={14} /> 상품화 착수 → 상품화중
            </button>
          )}
          {stage === '상품화중' && (
            <button className="btn btn-primary" disabled={!allChecked} onClick={() => advance('상품대기', 'readiedDate')}>
              <CheckCircle size={14} /> 상품화완료 → 상품대기
            </button>
          )}
          {stage === '상품대기' && (
            <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>
              영업 가능 — 다음 임차인이 정해지면 [+ 신규생성 → 계약생성]에서 매칭 후 계약중로 전환됩니다.
            </div>
          )}
          {stage === '운행' && !idlePicker && !tempPicker && (
            <>
              <button className="btn" onClick={() => setIdlePicker(true)} title="사고/정비 일시 정지">
                <PauseCircle size={14} weight="fill" /> 휴차 전환
              </button>
              <button className="btn" onClick={() => setTempPicker(true)} title="원본 차량 대신 다른 차량 임시 출고">
                <ArrowsLeftRight size={14} /> 임시배차
              </button>
              <button
                className="btn btn-primary"
                disabled={!allChecked}
                onClick={() => {
                  onUpdate({ ...c, vehicleStatus: '휴차대기', status: '반납', returnedDate: actionDate, ...deriveEndPatch(c, actionDate) });
                }}
                title={allChecked ? '반납 검수 완료 — 처리 진행' : '체크리스트 모두 완료 후 가능'}
              >
                <ArrowUUpLeft size={14} /> 반납회수 → 휴차대기
              </button>
            </>
          )}
          {stage === '연장대기' && !renewPicker && !endPicker && (
            <>
              <button className="btn btn-primary" onClick={() => {
                setRenewPicker(true);
                setRenewNewReturn(c.returnScheduledDate || '');
                setRenewNewRent(String(c.monthlyRent));
              }}>
                <PlayCircle size={14} /> 연장 처리 → 운행 복귀
              </button>
              <button className="btn" onClick={() => {
                setEndPicker(true);
                setEndPromisedDate(c.returnScheduledDate || todayKr());
              }}>
                <ArrowUUpLeft size={14} /> 종료로 변경
              </button>
              <button className="btn btn-ghost" onClick={revertToRunning}>
                결정 취소
              </button>
            </>
          )}
          {stage === '종료대기' && !endPicker && (
            <>
              <button
                className="btn btn-primary"
                disabled={!allChecked}
                onClick={() => {
                  onUpdate({ ...c, vehicleStatus: '휴차대기', status: '반납', returnedDate: actionDate, ...deriveEndPatch(c, actionDate) });
                }}
                title={allChecked ? '반납 검수 완료 — 처리 진행' : '체크리스트 모두 완료 후 가능'}
              >
                <ArrowUUpLeft size={14} /> 반납회수 → 휴차대기
              </button>
              <button className="btn" onClick={() => {
                setRenewPicker(true);
                setRenewNewReturn(c.returnScheduledDate || '');
                setRenewNewRent(String(c.monthlyRent));
              }}>
                <PlayCircle size={14} /> 연장으로 변경
              </button>
              <button className="btn btn-ghost" onClick={revertToRunning}>
                결정 취소
              </button>
            </>
          )}
          {stage === '휴차대기' && (
            <>
              <button
                className="btn"
                onClick={() => {
                  onUpdate({ ...c, vehicleStatus: '매각검토' });
                }}
              >
                매각 검토 시작 → 매각검토
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  onUpdate({ ...c, vehicleStatus: '상품화대기' });
                }}
              >
                <PlayCircle size={14} /> 재상품화 결정 → 상품화대기
              </button>
            </>
          )}
          {stage === '매각검토' && (
            <>
              <button
                className="btn btn-primary"
                disabled={!allChecked}
                onClick={async () => {
                  if (!await showConfirm({ title: '매각 진행을 결정합니다. 매각대기 상태로 전환됩니다.' })) return;
                  onUpdate({ ...c, vehicleStatus: '매각대기' });
                }}
              >
                <CheckCircle size={14} /> 매각 결정 → 매각대기
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  onUpdate({ ...c, vehicleStatus: '휴차대기' });
                }}
              >
                <ArrowUUpLeft size={14} /> 검토 보류 → 휴차대기
              </button>
            </>
          )}
          {stage === '매각대기' && (
            <>
              <button
                className="btn btn-primary"
                disabled={!allChecked}
                onClick={() => {
                  onUpdate({ ...c, vehicleStatus: '매각' });
                }}
              >
                <CheckCircle size={14} /> 매각 처리 → 매각완료
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  onUpdate({ ...c, vehicleStatus: '매각검토' });
                }}
              >
                <ArrowUUpLeft size={14} /> 매각 보류 → 매각검토
              </button>
            </>
          )}
          {stage === '매각' && (
            <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>
              매각완료 — fleet에서 제외됨 (terminal)
            </div>
          )}
          {/* legacy 휴차/임시배차 */}
          {stage === '휴차' && (
            <>
              <button className="btn btn-primary" onClick={resumeFromIdle}>
                <PlayCircle size={14} weight="fill" /> 계약중 복귀
              </button>
              <button className="btn" onClick={processReturn}>
                <ArrowUUpLeft size={14} /> 반납회수 → 휴차대기
              </button>
            </>
          )}
          {stage === '임시배차' && (
            <>
              <button className="btn btn-primary" onClick={clearTemp}>
                <PlayCircle size={14} weight="fill" /> 원본 복귀 → 계약중
              </button>
              <button className="btn" onClick={processReturn}>
                <ArrowUUpLeft size={14} /> 반납회수 → 휴차대기
              </button>
            </>
          )}

          {/* 되돌리기 — 잘못 누른 경우 정정. 단, 만기임박/만기경과 stage 는 진행 버튼이 없어 혼자 떠 보이므로 숨김 */}
          {canRevert && stage !== '만기임박' && stage !== '만기경과' && (
            <button
              className="btn btn-ghost"
              onClick={revertStage}
              style={{ marginLeft: 'auto', color: 'var(--text-sub)' }}
              title="실수로 잘못 처리한 경우 한 단계 이전으로 되돌립니다"
            >
              <ArrowUUpLeft size={12} style={{ transform: 'scaleX(-1)' }} /> 되돌리기
            </button>
          )}
        </div>

        {/* 임시배차 정보 (해당 시) */}
        {stage === '임시배차' && c.tempReplacementPlate && (
          <div style={{ marginTop: 14, padding: 10, background: 'var(--amber-bg)', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: 'var(--amber-text)', marginBottom: 4 }}>임시배차 중</div>
            <div style={{ color: 'var(--text-main)' }}>
              원본 <span className="plate">{c.vehiclePlate}</span> {c.vehicleModel} →
              현재 <span className="plate">{c.tempReplacementPlate}</span> {c.tempReplacementModel || ''}
            </div>
            {c.tempReason && <div style={{ color: 'var(--text-sub)', marginTop: 4 }}>{c.tempReason}</div>}
          </div>
        )}
      </Section>

      {/* 운영 기본 — 인도/반납/만기/회차/금액 (운영 정보 한눈에) */}
      <Section icon={<FileText size={12} weight="duotone" />} title="운영 기본">
        <div className="detail-grid-2">
          <Field label="인도일" value={formatDateFull(c.deliveredDate) || <span className="muted">미인도</span>} mono />
          <Field label="반납 예정" value={formatDateFull(c.returnScheduledDate) || <span className="muted">미정</span>} mono />
          <Field
            label="회차"
            value={c.currentSeq && c.totalSeq ? `${c.currentSeq} / ${c.totalSeq}` : <span className="muted">-</span>}
            mono
          />
          <Field
            label="월 대여료"
            value={c.monthlyRent ? `₩${formatCurrency(c.monthlyRent)}` : <span className="muted">-</span>}
            mono
          />
          <Field
            label="보증금"
            value={c.deposit ? `₩${formatCurrency(c.deposit)}` : <span className="muted">-</span>}
            mono
          />
          <Field label="결제일" value={c.paymentDay ? `매월 ${c.paymentDay}일` : <span className="muted">-</span>} mono />
          <Field label="장단기" value={c.longTerm ? '장기' : '단기'} />
          <Field label="담당자" value={c.manager || <span className="muted">-</span>} />
        </div>
      </Section>

      {/* 리스크 관리 — 미비한 것·체크해줘야할 것 한눈에 */}
      <Section icon={<WarningIcon size={12} weight="duotone" />} title="리스크 관리">
        <div className="detail-grid-2">
          <Field
            label="현재 미수"
            value={(c.unpaidAmount ?? 0) > 0
              ? <span style={{ color: 'var(--red-text)', fontWeight: 600 }}>₩{formatCurrency(c.unpaidAmount ?? 0)}</span>
              : <span className="muted">없음</span>}
            mono
          />
          <Field
            label="미납 회차"
            value={(c.unpaidSeqCount ?? 0) > 0
              ? <span style={{ color: 'var(--red-text)', fontWeight: 600 }}>{c.unpaidSeqCount}회</span>
              : <span className="muted">없음</span>}
            mono
          />
          <Field
            label="시동제어"
            value={c.engineDisabled
              ? <StatusBadge tone="red">ON</StatusBadge>
              : <span className="muted">정상</span>}
          />
          <Field
            label="위반 사항"
            value={c.hasViolations
              ? <StatusBadge tone="red">있음</StatusBadge>
              : <span className="muted">없음</span>}
          />
          <Field
            label="면허"
            value={c.customerLicenseStatus && c.customerLicenseStatus !== '정상' && c.customerLicenseStatus !== '미조회'
              ? <StatusBadge tone="red">{c.customerLicenseStatus}</StatusBadge>
              : <span className="muted">{c.customerLicenseStatus || '미조회'}</span>}
          />
          <Field
            label="정기검사"
            value={c.inspectionDueDate && c.inspectionDueDate < todayKr()
              ? <StatusBadge tone="red">만기 경과</StatusBadge>
              : c.inspectionDueDate ? formatDateFull(c.inspectionDueDate) : <span className="muted">-</span>}
            mono
          />
        </div>
      </Section>

      {/* 현재 위치 + 작업 상태 + 휴차 정보 */}
      <Section icon={<Car size={12} weight="duotone" />} title="현재 위치">
        <VehicleLocationEditor c={c} onUpdate={onUpdate} workingContext={workingContext} />
        {c.idleSince && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-soft)' }}>
            <div className="detail-grid-2">
              <Field label="휴차 시작" value={formatDateFull(c.idleSince)} mono />
              <Field label="종료 예정" value={formatDateFull(c.idleUntil) || <span className="muted">미정</span>} mono />
              <Field label="사유" value={c.idleReason || '-'} />
              <Field label="휴차 일수" value={`${daysSince(c.idleSince, todayKr())}일`} mono />
            </div>
          </div>
        )}
      </Section>

      {/* 라이프사이클 타임라인 */}
      <Section icon={<ArrowsLeftRight size={12} weight="duotone" />} title="라이프사이클">
        <div className="detail-grid-2">
          <div>
            <Field label="계약일" value={formatDateFull(c.contractDate)} mono />
            <Field label="매입완료" value={formatDateFull(c.purchasedDate) || <span className="muted">-</span>} mono />
            <Field label="등록완료" value={formatDateFull(c.registeredDate) || <span className="muted">-</span>} mono />
            <Field label="상품화완료" value={formatDateFull(c.readiedDate) || <span className="muted">-</span>} mono />
          </div>
          <div>
            <Field label="출고예정" value={formatDateFull(c.deliveryScheduledDate) || <span className="muted">-</span>} mono />
            <Field label="인도(출고)" value={formatDateFull(c.deliveredDate) || <span className="muted">미인도</span>} mono />
            <Field label="반납예정" value={formatDateFull(c.returnScheduledDate) || <span className="muted">-</span>} mono />
            <Field label="반납완료" value={formatDateFull(c.returnedDate) || <span className="muted">미반납</span>} mono />
          </div>
        </div>
      </Section>

      {/* 종료 정보 — 종료된 계약 또는 endReason 있을 때만 */}
      {(isContractEnded(c) || c.endReason) && (
        <EndInfoSection c={c} onUpdate={onUpdate} />
      )}

      {/* 보증금 처리 — 반납/해지/회수 시 미반환 보증금 차감·환불 */}
      <DepositSection c={c} onUpdate={onUpdate} />

      {/* 첨부 파일 — 첨부 상태 + 다운로드 (미리보기 없음) */}
      <AttachmentList c={c} />

    </div>
  );
}

/**
 * 종료 정보 — 계약 라이프사이클 끝. status='반납'/'해지'/'채권' 또는 endReason 있을 때 표시.
 *
 *   · 종료 사유 (inline select — 정상종료/중도해지/채권보전)
 *   · 종료일
 *   · 종료 시 미수 잔액 (자동 캡처 — 수정 가능)
 *   · 중도해지 위약금 (중도해지 일 때만)
 *   · 비고 (담당자 메모, 추심 단계 등)
 */
function EndInfoSection({ c, onUpdate }: { c: Contract; onUpdate: (u: Contract) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Contract>>({});
  useEffect(() => { if (!editing) setDraft({}); }, [c, editing]);

  const v = (k: keyof Contract) => (editing && k in draft ? draft[k] : c[k]) as unknown;
  const set = (k: keyof Contract, val: unknown) => setDraft((p) => ({ ...p, [k]: val }));

  const toneFor = (r?: Contract['endReason']) =>
    r === '정상종료' ? 'green' : r === '중도해지' ? 'amber' : r === '채권보전' ? 'red' : 'gray';

  function handleSave() {
    onUpdate({ ...c, ...draft });
    setEditing(false);
    setDraft({});
  }
  function handleCancel() {
    setEditing(false);
    setDraft({});
  }

  const action = editing ? (
    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
      <button className="btn btn-sm" onClick={handleCancel}>취소</button>
      <button className="btn btn-sm btn-primary" onClick={handleSave}>저장</button>
    </div>
  ) : (
    <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setEditing(true)}>
      수정
    </button>
  );

  const curEndReason = v('endReason') as Contract['endReason'] | undefined;

  return (
    <Section icon={<ArrowUUpLeft size={12} weight="duotone" />} title="종료 정보" action={action}>
      {!editing ? (
        // ─── 보기 모드 — read-only Field
        <div className="detail-grid-2">
          <div>
            <Field
              label="종료 사유"
              value={c.endReason ? <StatusBadge tone={toneFor(c.endReason)}>{c.endReason}</StatusBadge> : <span className="muted">미지정</span>}
            />
            <Field label="종료일" value={formatDateFull(c.endedAt) || <span className="muted">-</span>} mono />
          </div>
          <div>
            <Field
              label="종료 시 미수"
              value={c.unpaidAtEnd != null ? `₩${c.unpaidAtEnd.toLocaleString()}` : <span className="muted">-</span>}
              mono
            />
            {c.endReason === '중도해지' && (
              <Field
                label="중도해지 위약금"
                value={c.earlyTerminationFee != null ? `₩${c.earlyTerminationFee.toLocaleString()}` : <span className="muted">미산정</span>}
                mono
              />
            )}
          </div>
          {c.endNotes && (
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="비고" value={c.endNotes} />
            </div>
          )}
        </div>
      ) : (
        // ─── 수정 모드 — input
        <>
          <div className="detail-grid-2">
            <div>
              <div className="detail-field is-editing">
                <div className="label">종료 사유</div>
                <select
                  className="detail-field-input"
                  value={(curEndReason ?? '')}
                  onChange={(e) => set('endReason', e.target.value || undefined)}
                >
                  <option value="">미지정</option>
                  <option value="정상종료">정상종료</option>
                  <option value="중도해지">중도해지</option>
                  <option value="채권보전">채권보전</option>
                </select>
              </div>
              <div className="detail-field is-editing">
                <div className="label">종료일</div>
                <input
                  type="date"
                  className="detail-field-input mono"
                  value={(v('endedAt') as string | undefined) ?? ''}
                  onChange={(e) => set('endedAt', e.target.value || undefined)}
                />
              </div>
            </div>
            <div>
              <div className="detail-field is-editing">
                <div className="label">종료 시 미수 잔액 (채권보전 근거)</div>
                <input
                  type="number"
                  className="detail-field-input mono"
                  value={(v('unpaidAtEnd') as number | undefined) ?? ''}
                  onChange={(e) => set('unpaidAtEnd', e.target.value === '' ? undefined : Number(e.target.value))}
                  placeholder="자동 캡처 — 수정 가능"
                />
              </div>
              {curEndReason === '중도해지' && (
                <div className="detail-field is-editing">
                  <div className="label">중도해지 위약금</div>
                  <input
                    type="number"
                    className="detail-field-input mono"
                    value={(v('earlyTerminationFee') as number | undefined) ?? ''}
                    onChange={(e) => set('earlyTerminationFee', e.target.value === '' ? undefined : Number(e.target.value))}
                    placeholder="약정 잔여 회차 × 월대여료 등"
                  />
                </div>
              )}
            </div>
          </div>
          <div className="detail-field is-editing" style={{ marginTop: 6 }}>
            <div className="label">비고 (담당자 메모 · 추심 단계 등)</div>
            <textarea
              className="detail-field-input"
              rows={2}
              value={(v('endNotes') as string | undefined) ?? ''}
              onChange={(e) => set('endNotes', e.target.value || undefined)}
              style={{ resize: 'vertical' }}
              placeholder="채권 추심 진행 단계 · 변호사 위임 · 위약금 협상 등"
            />
          </div>
        </>
      )}
    </Section>
  );
}

/** 첨부 파일 목록 — 운영현황 상세 맨 아래. 첨부 여부 + 파일명 + 다운로드만 (미리보기 없음). */
function AttachmentList({ c }: { c: Contract }) {
  // 같은 plate Vehicle 마스터에서 자등증/보험증명서/할부계약서/정기검사증/GPS설치/매각계약서 첨부 확인
  const { vehicles } = useVehicles();
  const vehicle = useMemo(
    () => vehicles.find((v) => v.plate?.trim() === c.vehiclePlate?.trim()),
    [vehicles, c.vehiclePlate]
  );

  const items: { label: string; url?: string; fileName?: string; uploadedAt?: string }[] = [
    { label: '계약서',           url: c.contractDocUrl,              fileName: c.contractDocFileName,              uploadedAt: c.contractDocUploadedAt },
    { label: '자동차등록증',     url: vehicle?.registrationCertUrl,  fileName: vehicle?.registrationCertFileName,  uploadedAt: vehicle?.registrationCertUploadedAt },
    { label: '보험가입증명서',   url: vehicle?.insuranceCertUrl,     fileName: vehicle?.insuranceCertFileName,     uploadedAt: vehicle?.insuranceCertUploadedAt },
    { label: '할부계약서',       url: vehicle?.loanContractUrl,      fileName: vehicle?.loanContractFileName,      uploadedAt: vehicle?.loanContractUploadedAt },
    { label: '정기검사증',       url: vehicle?.inspectionCertUrl,    fileName: vehicle?.inspectionCertFileName,    uploadedAt: vehicle?.inspectionCertUploadedAt },
    { label: 'GPS 설치 증빙',    url: vehicle?.gpsInstallUrl,        fileName: vehicle?.gpsInstallFileName,        uploadedAt: vehicle?.gpsInstallUploadedAt },
    { label: '매도증·매각계약서', url: vehicle?.disposalCertUrl,      fileName: vehicle?.disposalCertFileName,      uploadedAt: vehicle?.disposalCertUploadedAt },
    { label: '면허증 사본',      url: c.customerLicenseCertUrl,      fileName: c.customerLicenseCertFileName,      uploadedAt: c.customerLicenseCertUploadedAt },
  ];
  const attached = items.filter((it) => !!it.url).length;
  const [backing, setBacking] = useState(false);

  // Drive 미러 백업 — 계약서·면허증 + 차량 서류 전체. Firebase 원본, Drive 백업본(non-blocking).
  async function handleDriveBackup() {
    if (attached === 0) { toast.info('백업할 첨부 파일이 없습니다'); return; }
    setBacking(true);
    try {
      const { getCurrentIdToken } = await import('@/lib/firebase/client');
      const idToken = await getCurrentIdToken();
      if (!idToken) { toast.error('로그인 세션 만료 — 다시 로그인해주세요'); return; }
      const { driveMirrorContractDocs, driveMirrorVehicleDocs } = await import('@/lib/google/drive-mirror');
      const companyName = c.company ?? '미상';
      const r1 = await driveMirrorContractDocs({ contract: c, companyName, idToken });
      const r2 = vehicle ? await driveMirrorVehicleDocs({ vehicle, companyName, idToken }) : null;
      const uploaded = r1.uploaded + (r2?.uploaded ?? 0);
      const failed = r1.failed + (r2?.failed ?? 0);
      if (uploaded > 0 && failed === 0) toast.success(`Drive 백업 완료 — ${uploaded}건`);
      else if (uploaded > 0) toast.info(`${uploaded}건 백업, ${failed}건 실패`);
      else {
        const firstErr = [...r1.details, ...(r2?.details ?? [])].find((d) => !d.result.ok)?.result.error ?? '실패';
        toast.error(`Drive 백업 실패: ${firstErr}`);
      }
    } catch (e) {
      toast.error(`Drive 백업 오류: ${(e as Error).message ?? String(e)}`);
    } finally {
      setBacking(false);
    }
  }

  return (
    <Section
      icon={<FileText size={12} weight="duotone" />}
      title="첨부 파일"
      action={
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-weak)' }}>{attached}/{items.length}</span>
          <button
            className="btn btn-sm"
            type="button"
            onClick={handleDriveBackup}
            disabled={backing || attached === 0}
            title="계약서·면허증·차량 서류를 Google Drive 공유드라이브에 미러 백업 (Firebase가 원본)"
          >
            {backing ? '백업 중…' : 'Drive 백업'}
          </button>
        </div>
      }
    >
      <div className="detail-grid-2">
        {items.map((it) => (
          <div key={it.label} className="detail-field" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="label" style={{ minWidth: 110 }}>{it.label}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              {it.url ? (
                <a
                  href={it.url}
                  download={it.fileName ?? `${it.label}.pdf`}
                  style={{ color: 'var(--brand)', fontSize: 12, textDecoration: 'none' }}
                  title={it.uploadedAt ? `업로드 ${it.uploadedAt.slice(0, 10)}` : undefined}
                >
                  📎 {it.fileName ?? '다운로드'}
                </a>
              ) : (
                <span className="muted">미첨부</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

/**
 * 차량 현재 위치 인라인 에디터 — 차량상태 탭에 노출.
 * 휴차 차량은 보관 장소, 운행 차량도 임시 보관/정비 입고 등 위치 메모 가능.
 * v4 IOC 패턴 — 위치 변경 시 차량 이력에 자동 기록.
 */
function VehicleLocationEditor({ c, onUpdate, workingContext }: { c: Contract; onUpdate: (u: Contract) => void; workingContext?: string }) {
  const { entries, add: addHistory } = useHistoryEntries();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    idleLocation: c.idleLocation ?? '',
    idleContact: c.idleContact ?? '',
    note: '',
  });

  const moveHistory = useMemo(() => {
    return entries
      .filter((h) => h.scope === 'vehicle' && h.vehiclePlate === c.vehiclePlate && (h.meta as Record<string, unknown>)?.kind === 'move')
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .slice(0, 3);
  }, [entries, c.vehiclePlate]);

  const oldLocation = (c.idleLocation ?? '').trim();
  const newLocation = draft.idleLocation.trim();
  const changed = oldLocation !== newLocation;

  async function handleSave() {
    onUpdate({
      ...c,
      idleLocation: newLocation || undefined,
      idleContact: draft.idleContact.trim() || undefined,
    });
    if (changed && newLocation && c.vehiclePlate) {
      const from = oldLocation || '(미입력)';
      await addHistory({
        scope: 'vehicle',
        vehiclePlate: c.vehiclePlate,
        contractId: c.id,
        date: todayKr(),
        category: '기타',
        title: `위치 이동: ${from} → ${newLocation}`,
        description: draft.note.trim() || undefined,
        status: '완료',
        meta: { kind: 'move', from, to: newLocation },
      });
    }
    setEditing(false);
    setDraft({ ...draft, note: '' });
  }

  if (!editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: '8px 12px', fontSize: 12, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-weak)' }}>현재 위치</span>
          <span>
            {oldLocation ? <strong>{oldLocation}</strong> : <MissingText label="이전 위치" />}
            {workingContext && <span style={{ marginLeft: 8, color: 'var(--text-sub)' }}>/ {workingContext}</span>}
            {c.idleContact && <span className="dim mono" style={{ marginLeft: 8, fontSize: 11 }}>({c.idleContact})</span>}
          </span>
          <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
            {oldLocation ? '위치 이동' : '위치 입력'}
          </button>
        </div>
        {moveHistory.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-weak)', paddingLeft: 102 }}>
            최근 이동: {moveHistory.map((h) => `${(h.meta as Record<string, unknown>)?.to ?? ''}`).join(' ← ')}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {oldLocation && (
        <div style={{ padding: '6px 10px', background: 'var(--bg-sunken)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-weak)' }}>이전</span> <strong>{oldLocation}</strong>
          {changed && newLocation && <><span className="dim">→</span> <strong style={{ color: 'var(--brand)' }}>{newLocation}</strong> <span style={{ fontSize: 10, color: 'var(--orange-text, #c2410c)' }}>이력 자동 기록</span></>}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: '6px 10px', fontSize: 12 }}>
        <label style={{ alignSelf: 'center', color: 'var(--text-weak)' }}>{oldLocation ? '이동 위치' : '현재 위치'}</label>
        <input className="input" autoFocus placeholder="예: 본사 차고지 B-12 / 분당 주차장 / 정비소" value={draft.idleLocation} onChange={(e) => setDraft({ ...draft, idleLocation: e.target.value })} />
        <label style={{ alignSelf: 'center', color: 'var(--text-weak)' }}>담당 연락처</label>
        <input className="input mono" placeholder="010-0000-0000 (선택)" value={draft.idleContact} onChange={(e) => setDraft({ ...draft, idleContact: e.target.value })} />
        {changed && newLocation && (
          <>
            <label style={{ alignSelf: 'center', color: 'var(--text-weak)' }}>이동 사유</label>
            <input className="input" placeholder="이동 메모 (선택)" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button type="button" className="btn btn-sm" onClick={() => { setEditing(false); setDraft({ idleLocation: c.idleLocation ?? '', idleContact: c.idleContact ?? '', note: '' }); }}>취소</button>
        <button type="button" className="btn btn-sm btn-primary" onClick={handleSave}>저장</button>
      </div>
    </div>
  );
}
