'use client';

import { useState, Fragment } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import {
  User, Car, FileText, ClipboardText, ArrowsLeftRight, CurrencyKrw,
  Plus, CheckCircle, PauseCircle, PlayCircle, ArrowUUpLeft, CircleNotch,
  Upload, Warning as WarningIcon, X as XIcon, X, CaretRight,
} from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { DateInput } from '@/components/ui/date-input';
import type { Contract, VehicleStatus, PaymentScheduleInline, PaymentEntry, ScheduleStatus } from '@/lib/types';
import { formatCurrency, formatDateFull, daysSince } from '@/lib/utils';
import { contractIdentMasked, birthFromIdent, inferKind } from '@/lib/ident';
import { displayCompanyName } from '@/lib/company-display';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useContracts as useContractsList } from '@/lib/firebase/contracts-store';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { HistoryAddDialog } from '@/components/history-add-dialog';
import { todayKr } from '@/lib/mock-data';
import {
  validateDocument, summarizeIssues,
  type DocumentKind, type DocumentData, type ValidationIssue,
} from '@/lib/document-validation';

export function ContractDetailDialog({
  contract,
  open,
  onOpenChange,
  onUpdate,
}: {
  contract: Contract | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (updated: Contract) => void;
}) {
  if (!contract) return null;

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`상세 정보 — ${contract.vehiclePlate} · ${contract.customerName}`}>
        <DialogBody className="p-0" style={{ display: 'flex', flexDirection: 'column' }}>
          {/* HERO — 탭과 무관하게 항상 표시 */}
          <div style={{ padding: 16, paddingBottom: 0 }}>
            <DetailHero c={contract} />
          </div>

          <Tabs.Root defaultValue="vehicleStatus" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, marginTop: 14 }}>
            <Tabs.List className="tabs-list">
              <Tabs.Trigger value="vehicleStatus" className="tabs-trigger">차량상태</Tabs.Trigger>
              <Tabs.Trigger value="vehicleSpec" className="tabs-trigger">차량정보</Tabs.Trigger>
              <Tabs.Trigger value="contract" className="tabs-trigger">계약정보</Tabs.Trigger>
              <Tabs.Trigger value="payment" className="tabs-trigger">수납내역</Tabs.Trigger>
              <Tabs.Trigger value="documents" className="tabs-trigger">서류 검증</Tabs.Trigger>
              <Tabs.Trigger value="vehicleHistory" className="tabs-trigger">차량이력</Tabs.Trigger>
              <Tabs.Trigger value="contractHistory" className="tabs-trigger">계약이력</Tabs.Trigger>
            </Tabs.List>

            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              <Tabs.Content value="vehicleSpec"><VehicleSpecTab c={contract} /></Tabs.Content>
              <Tabs.Content value="vehicleStatus"><VehicleStatusTab c={contract} onUpdate={onUpdate} /></Tabs.Content>
              <Tabs.Content value="contract"><ContractInfoTab c={contract} /></Tabs.Content>
              <Tabs.Content value="payment"><PaymentTab c={contract} onUpdate={onUpdate} /></Tabs.Content>
              <Tabs.Content value="documents"><DocumentsTab c={contract} onUpdate={onUpdate} /></Tabs.Content>
              <Tabs.Content value="vehicleHistory"><HistoryListTab scope="vehicle" c={contract} /></Tabs.Content>
              <Tabs.Content value="contractHistory"><HistoryListTab scope="contract" c={contract} /></Tabs.Content>
            </div>
          </Tabs.Root>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <button className="btn">닫기</button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

/* ─────────────── HERO (항상 상단) ─────────────── */

function DetailHero({ c }: { c: Contract }) {
  const { companies } = useCompanies();
  const companyDisplay = displayCompanyName(c.company, companies);
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
    </div>
  );
}

/* ─────────────── Sub: Sections / Fields ─────────────── */

function Section({
  icon, title, action, children,
}: { icon: React.ReactNode; title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="detail-section">
      <div className="detail-section-header">
        <span className="icon">{icon}</span>
        <span className="title">{title}</span>
        {action}
      </div>
      <div className="detail-section-body">{children}</div>
    </div>
  );
}

function Field({
  label, value, mono, muted,
}: { label: string; value: React.ReactNode; mono?: boolean; muted?: boolean }) {
  return (
    <div className="detail-field">
      <div className="label">{label}</div>
      <div className={`value ${mono ? 'mono' : ''} ${muted ? 'muted' : ''}`}>{value}</div>
    </div>
  );
}

/* ─────────────── 차량정보 탭 (차량 + 라이프사이클 액션) ─────────────── */

type Stage =
  | '구매대기' | '등록대기'
  | '상품화대기' | '상품화중' | '상품대기'
  | '운행'
  | '휴차대기' | '매각대기' | '매각'
  | '휴차' | '임시배차';  // legacy (이전 데이터 호환)

function currentStage(c: Contract): Stage {
  // 명시적 vehicleStatus 우선
  switch (c.vehicleStatus) {
    case '매각': return '매각';
    case '매각대기': return '매각대기';
    case '휴차대기': return '휴차대기';
    case '상품대기': return '상품대기';
    case '상품화중': return '상품화중';
    case '상품화대기': return '상품화대기';
    case '등록대기': return '등록대기';
    case '구매대기': return '구매대기';
    case '휴차': return '휴차';
    case '임시배차': return '임시배차';
  }
  // legacy 케이스 파생
  if (c.returnedDate || c.status === '반납') return '휴차대기';
  if (c.deliveredDate && c.status === '운행') return '운행';
  if (c.vehicleStatus === '인도대기' || c.vehicleStatus === '출고대기') return '상품대기';
  return '구매대기';
}

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
    nextLabel: '계약 생성 (외부) → 운행',
    items: [],  // 새 계약 생성은 외부 액션
  },
  '운행': {
    label: '반납 검수 체크 (반납회수 시)',
    nextLabel: '반납회수 → 휴차대기',
    items: ['차량 외관 공동 검수', '내부 청소 상태 확인', '주행거리 기록', '연료 잔량 확인', '키·매뉴얼 회수', '면책금/위약금 정산'],
  },
  '휴차대기': {
    label: '재진입 결정',
    nextLabel: '매각 / 재상품화 선택',
    items: [],  // 결정 분기라 체크 없음
  },
  '매각대기': {
    label: '매각 진행 체크',
    nextLabel: '매각 완료 → 매각',
    items: ['매각 가격 산정', '매각처 확정', '대금 입금 확인', '명의 이전 서류', '말소 등록'],
  },
};

/* ─────────────── 차량정보 (스펙) — 별도 탭 ─────────────── */

function VehicleSpecTab({ c }: { c: Contract }) {
  const { companies } = useCompanies();
  return (
    <div className="detail-stack">
      <Section icon={<Car size={12} weight="duotone" />} title="차량 식별">
        <div className="detail-grid-2">
          <div>
            <Field label="차량번호" value={c.vehiclePlate} mono />
            <Field label="차종" value={c.vehicleModel} />
            <Field label="회사" value={displayCompanyName(c.company, companies)} />
            {c.isInventoryPurchase && (
              <Field label="구분" value={<span style={{ color: 'var(--purple-text)', fontWeight: 600 }}>선도구매 (재고)</span>} />
            )}
          </div>
          <div>
            <Field label="계약번호" value={c.contractNo} mono />
            <Field label="계약일" value={formatDateFull(c.contractDate)} mono />
          </div>
        </div>
      </Section>

      <Section icon={<Car size={12} weight="duotone" />} title="제조사·등록증 정보">
        <div className="detail-grid-2">
          <div>
            <Field label="차대번호" value={<span className="muted">-</span>} mono />
            <Field label="연식" value={<span className="muted">-</span>} mono />
            <Field label="색상" value={<span className="muted">-</span>} />
            <Field label="연료" value={<span className="muted">-</span>} />
          </div>
          <div>
            <Field label="배기량" value={<span className="muted">-</span>} mono />
            <Field label="등록일" value={<span className="muted">-</span>} mono />
            <Field label="용도" value={<span className="muted">-</span>} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-weak)', marginTop: 8 }}>
          ↑ OCR로 자동차등록증 스캔 시 자동 입력 — 현재 mock에 미포함
        </div>
      </Section>

      <Section icon={<Car size={12} weight="duotone" />} title="보험·옵션">
        <div className="detail-grid-2">
          <div>
            <Field label="보험연령" value={c.insuranceAge ? `${c.insuranceAge}세 이상` : '-'} />
            <Field label="자차여부" value={c.selfInsured ? '가입' : '미가입'} />
          </div>
          <div>
            <Field label="거리한도" value={c.distanceLimitKm ? `${c.distanceLimitKm.toLocaleString()}km` : '-'} mono />
          </div>
        </div>
      </Section>
    </div>
  );
}

/* ─────────────── 차량상태 — 라이프사이클 + 액션 + 체크리스트 ─────────────── */

function VehicleStatusTab({ c, onUpdate }: { c: Contract; onUpdate: (u: Contract) => void }) {
  const stage = currentStage(c);
  const [actionDate, setActionDate] = useState<string>(todayKr());
  const [idlePicker, setIdlePicker] = useState(false);
  const [idleSubReason, setIdleSubReason] = useState<IdleReason>('정비');
  const [idleMemo, setIdleMemo] = useState('');
  const [tempPicker, setTempPicker] = useState(false);
  const [tempPlate, setTempPlate] = useState('');
  const [tempModel, setTempModel] = useState('');
  const [tempReason, setTempReason] = useState('');
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
    onUpdate({ ...c, vehicleStatus: '반납', status: '반납', returnedDate: actionDate });
  }

  function commitIdle() {
    const fullReason = `${idleSubReason}${idleMemo ? ' — ' + idleMemo : ''}`;
    onUpdate({ ...c, vehicleStatus: '휴차', idleSince: actionDate, idleReason: fullReason });
    setIdlePicker(false);
    setIdleMemo('');
  }

  function commitTemp() {
    if (!tempPlate || !tempReason) {
      alert('대체 차량번호와 사유를 입력해주세요.');
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

  /** 되돌리기 — 한 단계 이전으로 (실수 정정용) */
  function revertStage() {
    if (!window.confirm(`현재 단계(${stage})를 이전 단계로 되돌립니다. 계속하시겠습니까?`)) return;
    switch (stage) {
      case '매각':
        onUpdate({ ...c, vehicleStatus: '매각대기' });
        break;
      case '매각대기':
        onUpdate({ ...c, vehicleStatus: '휴차대기' });
        break;
      case '휴차대기':
        // 반납회수 취소 → 운행 복귀
        onUpdate({ ...c, vehicleStatus: '운행', status: '운행', returnedDate: undefined });
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
      {/* 상태 전환 */}
      <Section
        icon={<ArrowsLeftRight size={12} weight="duotone" />}
        title={`현재 ${stage}`}
        action={<span className={`status ${stage}`}>{stage}{stage === '휴차' && c.idleReason ? ` (${c.idleReason.split(' — ')[0]})` : ''}</span>}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--text-weak)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            처리일
          </span>
          <DateInput
            value={actionDate}
            onChange={setActionDate}
            style={{ width: 200 }}
          />
        </div>

        {/* 임시배차 picker */}
        {tempPicker && (
          <div style={{ padding: 12, background: 'var(--bg-sunken)', borderRadius: 6, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 8, fontWeight: 500 }}>
              임시배차 — 원본 차량 ({c.vehiclePlate} {c.vehicleModel}) 대신 출고할 차량
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '8px 12px', alignItems: 'center', marginBottom: 10 }}>
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
          <div style={{ padding: 12, background: 'var(--bg-sunken)', borderRadius: 6, marginBottom: 12 }}>
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

        {/* 체크리스트 — 단계 진행 항목 */}
        {checklist && (
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
              영업 가능 — 다음 임차인이 정해지면 [+ 신규생성 → 계약생성]에서 매칭 후 운행으로 전환됩니다.
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
                  onUpdate({ ...c, vehicleStatus: '휴차대기', status: '반납', returnedDate: actionDate });
                }}
                title={allChecked ? '반납 검수 완료 — 처리 진행' : '체크리스트 모두 완료 후 가능'}
              >
                <ArrowUUpLeft size={14} /> 반납회수 → 휴차대기
              </button>
            </>
          )}
          {stage === '휴차대기' && (
            <>
              <button
                className="btn"
                onClick={() => {
                  if (!window.confirm('이 차량을 매각 대상으로 전환합니다. 계속하시겠습니까?')) return;
                  onUpdate({ ...c, vehicleStatus: '매각대기' });
                }}
              >
                매각 결정 → 매각대기
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
          {stage === '매각대기' && (
            <button
              className="btn btn-primary"
              disabled={!allChecked}
              onClick={() => {
                onUpdate({ ...c, vehicleStatus: '매각' });
              }}
            >
              <CheckCircle size={14} /> 매각완료 → 매각
            </button>
          )}
          {stage === '매각' && (
            <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>
              매각 완료 — fleet에서 제외됨 (terminal)
            </div>
          )}
          {/* legacy 휴차/임시배차 */}
          {stage === '휴차' && (
            <>
              <button className="btn btn-primary" onClick={resumeFromIdle}>
                <PlayCircle size={14} weight="fill" /> 운행 복귀
              </button>
              <button className="btn" onClick={processReturn}>
                <ArrowUUpLeft size={14} /> 반납회수 → 휴차대기
              </button>
            </>
          )}
          {stage === '임시배차' && (
            <>
              <button className="btn btn-primary" onClick={clearTemp}>
                <PlayCircle size={14} weight="fill" /> 원본 복귀 → 운행
              </button>
              <button className="btn" onClick={processReturn}>
                <ArrowUUpLeft size={14} /> 반납회수 → 휴차대기
              </button>
            </>
          )}

          {/* 되돌리기 — 잘못 누른 경우 정정 */}
          {canRevert && (
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
          <div style={{ marginTop: 14, padding: 10, background: 'var(--amber-bg)', borderRadius: 6, fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: 'var(--amber-text)', marginBottom: 4 }}>임시배차 중</div>
            <div style={{ color: 'var(--text-main)' }}>
              원본 <span className="plate">{c.vehiclePlate}</span> {c.vehicleModel} →
              현재 <span className="plate">{c.tempReplacementPlate}</span> {c.tempReplacementModel || ''}
            </div>
            {c.tempReason && <div style={{ color: 'var(--text-sub)', marginTop: 4 }}>{c.tempReason}</div>}
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

      {c.idleSince && (
        <Section icon={<PauseCircle size={12} weight="duotone" />} title="휴차 기간">
          <Field label="시작일" value={formatDateFull(c.idleSince)} mono />
          <Field label="종료예정" value={formatDateFull(c.idleUntil) || <span className="muted">미정</span>} mono />
          <Field label="사유" value={c.idleReason || '-'} />
          <Field label="휴차 일수" value={`${daysSince(c.idleSince, todayKr())}일`} mono />
        </Section>
      )}
    </div>
  );
}

/* ─────────────── 계약정보 탭 (고객 + 조건 + 비고) ─────────────── */

function ContractInfoTab({ c }: { c: Contract }) {
  const identMasked = contractIdentMasked(c);
  return (
    <div className="detail-stack">
      <Section icon={<User size={12} weight="duotone" />} title="고객">
        <div className="detail-grid-2">
          <div>
            <Field label="이름" value={c.customerName} />
            <Field label="구분" value={c.customerKind || '-'} />
            <Field label="등록번호" value={identMasked || '-'} mono />
            <Field label="연락처" value={c.customerPhone1} mono />
            <Field label="연락처2" value={c.customerPhone2 || '-'} mono />
          </div>
          <div>
            <Field label="지역" value={c.customerRegion || '-'} />
            <Field label="행정구" value={c.customerDistrict || '-'} />
          </div>
        </div>
      </Section>

      <Section icon={<ClipboardText size={12} weight="duotone" />} title="계약 조건">
        <div className="detail-grid-2">
          <div>
            <Field label="계약번호" value={c.contractNo} mono />
            <Field label="계약일" value={formatDateFull(c.contractDate)} mono />
            <Field label="인도일" value={formatDateFull(c.deliveredDate) || '-'} mono />
            <Field label="반납예정" value={formatDateFull(c.returnScheduledDate) || '-'} mono />
            <Field label="약정기간" value={`${c.termMonths}개월 ${c.longTerm ? '(장기)' : '(단기)'}`} />
          </div>
          <div>
            <Field label="월 대여료" value={`₩${formatCurrency(c.monthlyRent)}`} mono />
            <Field label="보증금" value={`₩${formatCurrency(c.deposit)}`} mono />
            <Field label="결제방법" value={c.paymentMethod} />
            <Field label="결제일" value={`매월 ${c.paymentDay}일`} mono />
            <Field label="담당자" value={c.manager || '-'} />
          </div>
        </div>
      </Section>

      <Section icon={<FileText size={12} weight="duotone" />} title="비고">
        <div style={{ fontSize: 12, color: c.notes ? 'var(--text-main)' : 'var(--text-weak)', whiteSpace: 'pre-wrap' }}>
          {c.notes || '메모 없음'}
        </div>
      </Section>
    </div>
  );
}

/* ─────────────── 수납내역 탭 (스케줄 + 입금 + 추가) ─────────────── */

function PaymentTab({ c, onUpdate }: { c: Contract; onUpdate: (u: Contract) => void }) {
  const totalDiscount = (c.schedules ?? []).reduce(
    (sum, s) => sum + ((s.discounts ?? []).reduce((d, x) => d + x.amount, 0)),
    0,
  );
  const totalPaid = (c.schedules ?? []).reduce(
    (sum, s) => sum + ((s.payments ?? []).reduce((p, x) => p + x.amount, 0)),
    0,
  );
  return (
    <div className="detail-stack">
      <Section
        icon={<CurrencyKrw size={12} weight="duotone" />}
        title={`수납 현황 — ${c.currentSeq}/${c.totalSeq}회 · 월 ₩${formatCurrency(c.monthlyRent)}`}
      >
        <div className="detail-grid-2" style={{ marginTop: 4 }}>
          <div>
            <Field label="현재 회차" value={`${c.currentSeq} / ${c.totalSeq}`} mono />
            <Field label="누적 청구할인" value={
              totalDiscount > 0
                ? <span style={{ color: 'var(--red-text)' }}>-₩{formatCurrency(totalDiscount)}</span>
                : <span className="muted">없음</span>
            } mono />
            <Field label="누적 납부액" value={totalPaid > 0 ? `₩${formatCurrency(totalPaid)}` : <span className="muted">-</span>} mono />
            <Field label="최근 결제일" value={formatDateFull(c.lastPaidDate) || <span className="muted">-</span>} mono />
          </div>
          <div>
            <Field
              label="미수금"
              value={
                c.unpaidAmount > 0
                  ? <span style={{ color: 'var(--red-text)', fontWeight: 600 }}>₩{formatCurrency(c.unpaidAmount)}</span>
                  : <span className="muted">없음</span>
              }
              mono
            />
            <Field label="미납 회차" value={c.unpaidSeqCount > 0 ? `${c.unpaidSeqCount}회` : <span className="muted">없음</span>} mono />
            <Field label="결제방법" value={c.paymentMethod} />
          </div>
        </div>
      </Section>

      <Section icon={<CurrencyKrw size={12} weight="duotone" />} title="회차별 스케줄">
        <ScheduleTable c={c} onUpdate={onUpdate} />
      </Section>

      <Section icon={<CurrencyKrw size={12} weight="duotone" />} title={`입금 이력 — ${generatePaymentHistory(c).length}건`}>
        <PaymentHistoryTable c={c} />
      </Section>
    </div>
  );
}

/** 입금 이력 (회차별 payments 배열 flatten) — 시간순 정렬 */
type PaymentLog = {
  date: string;
  seq: number;
  amount: number;
  source: PaymentEntry['source'];
  memo?: string;
  by?: string;
};

function generatePaymentHistory(c: Contract): PaymentLog[] {
  const logs: PaymentLog[] = [];

  if (c.schedules && c.schedules.length > 0) {
    for (const s of c.schedules) {
      const pays = s.payments ?? [];
      // legacy: payments 없는 회차의 paidAmount → 정산 entry 1건으로 환원
      if (pays.length === 0 && s.paidAmount > 0) {
        logs.push({
          date: s.paidAt ?? s.dueDate, seq: s.seq, amount: s.paidAmount, source: '정산',
          memo: '스냅샷 자동 정리',
        });
        continue;
      }
      for (const p of pays) {
        logs.push({ date: p.date, seq: s.seq, amount: p.amount, source: p.source, memo: p.memo, by: p.by });
      }
    }
    return logs.sort((a, b) => b.date.localeCompare(a.date) || a.seq - b.seq);
  }

  // Legacy fallback — schedules 자체가 없을 때
  for (let seq = 1; seq < c.currentSeq; seq++) {
    logs.push({
      date: addMonths(c.contractDate, seq - 1, c.paymentDay),
      seq, amount: c.monthlyRent, source: '정산', memo: 'legacy',
    });
  }
  return logs.sort((a, b) => b.date.localeCompare(a.date));
}

function PaymentHistoryTable({ c }: { c: Contract }) {
  const logs = generatePaymentHistory(c);
  if (logs.length === 0) {
    return (
      <div style={{ padding: 32, color: 'var(--text-weak)', textAlign: 'center', fontSize: 12 }}>
        아직 입금 이력이 없습니다.
      </div>
    );
  }
  const total = logs.reduce((s, l) => s + l.amount, 0);
  const realIncoming = logs.filter((l) => l.source !== '정산').reduce((s, l) => s + l.amount, 0);
  return (
    <>
      <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span>누적 입금 <span className="mono" style={{ color: 'var(--text-main)', fontWeight: 600 }}>₩{formatCurrency(total)}</span></span>
        <span>실 입금 <span className="mono" style={{ color: 'var(--green-text)', fontWeight: 600 }}>₩{formatCurrency(realIncoming)}</span></span>
        <span className="dim">최근순 · 정산 = 스냅샷 자동 정리</span>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 110 }}>입금일</th>
            <th className="center" style={{ width: 60 }}>회차</th>
            <th className="num" style={{ width: 120 }}>금액</th>
            <th className="center" style={{ width: 70 }}>출처</th>
            <th>메모</th>
            <th className="mono dim" style={{ width: 160 }}>등록자</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l, i) => (
            <tr key={i}>
              <td className="mono">{formatDateFull(l.date)}</td>
              <td className="center mono">{l.seq}회</td>
              <td className="num mono">₩{formatCurrency(l.amount)}</td>
              <td className="center">
                <span className="chip" style={{
                  height: 18, padding: '0 8px', fontSize: 10, fontWeight: 500,
                  background: l.source === '정산' ? 'var(--bg-sunken)'
                    : l.source === '계좌' ? 'var(--blue-bg)'
                    : l.source === '카드' ? 'var(--purple-bg)'
                    : 'var(--green-bg)',
                  color: l.source === '정산' ? 'var(--text-weak)'
                    : l.source === '계좌' ? 'var(--blue-text)'
                    : l.source === '카드' ? 'var(--purple-text)'
                    : 'var(--green-text)',
                }}>{l.source}</span>
              </td>
              <td className="dim">{l.memo || '-'}</td>
              <td className="mono dim">{l.by ?? (l.source === '정산' ? '(자동)' : '-')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

type AddMode = 'payment' | 'discount';
type DiscountReason = '자가조치' | '보상' | '사은품' | '캠페인' | '기타';

function ScheduleTable({ c, onUpdate }: { c: Contract; onUpdate: (u: Contract) => void }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [addOpenSeq, setAddOpenSeq] = useState<number | null>(null);
  const [addMode, setAddMode] = useState<AddMode>('payment');
  const [addDate, setAddDate] = useState(todayKr());
  const [addAmount, setAddAmount] = useState('');
  const [addMemo, setAddMemo] = useState('');
  const [addReason, setAddReason] = useState<DiscountReason>('자가조치');

  // legacy 회차 (payments 없음, paidAmount만 있음) → migrate-on-read
  const schedulesNorm: PaymentScheduleInline[] = (c.schedules && c.schedules.length > 0)
    ? c.schedules.map((s) => {
        if (s.payments && s.payments.length > 0) return s;
        if (s.paidAmount > 0) {
          return { ...s, payments: [{ date: s.paidAt ?? s.dueDate, amount: s.paidAmount, source: '정산', memo: '스냅샷 자동 정리' }] };
        }
        return { ...s, payments: [] };
      })
    : Array.from({ length: c.totalSeq }, (_, i) => {
        const seq = i + 1;
        const isPaid = seq < c.currentSeq;
        const dueDate = addMonths(c.contractDate, i, c.paymentDay);
        return {
          seq, dueDate, amount: c.monthlyRent,
          status: (isPaid ? '완료' : '예정') as ScheduleStatus,
          paidAmount: isPaid ? c.monthlyRent : 0,
          payments: isPaid ? [{ date: dueDate, amount: c.monthlyRent, source: '정산' as const, memo: 'legacy' }] : [],
        };
      });

  function persist(sched: PaymentScheduleInline[]) {
    // 미수 = 실청구(amount - discount) - 납부합
    const totalUnpaidNow = sched.reduce((sum, s) => {
      const disc = (s.discounts ?? []).reduce((d, x) => d + x.amount, 0);
      const effective = Math.max(0, s.amount - disc);
      if (s.status === '연체') return sum + effective;
      if (s.status === '부분납') return sum + Math.max(0, effective - s.paidAmount);
      return sum;
    }, 0);
    const unpaidSeqCount = sched.filter((s) => s.status === '연체' || s.status === '부분납').length;
    const overdue = sched.filter((s) => s.status === '연체' || s.status === '부분납').sort((a, b) => a.seq - b.seq);
    const currentSeq = overdue[0]?.seq
      ?? sched.find((s) => s.status === '예정')?.seq
      ?? sched.length;
    const last = sched.flatMap((s) => s.payments ?? []).sort((a, b) => b.date.localeCompare(a.date))[0];
    onUpdate({
      ...c,
      schedules: sched,
      unpaidAmount: totalUnpaidNow,
      unpaidSeqCount,
      currentSeq,
      lastPaidDate: last?.date,
      lastPaidAmount: last?.amount,
    });
  }

  function recalcRow(s: PaymentScheduleInline, today: string): PaymentScheduleInline {
    if (s.status === '면제') {
      const paid = (s.payments ?? []).reduce((sum, p) => sum + p.amount, 0);
      const disc = (s.discounts ?? []).reduce((sum, d) => sum + d.amount, 0);
      return { ...s, paidAmount: paid, discountAmount: disc };
    }
    const paid = (s.payments ?? []).reduce((sum, p) => sum + p.amount, 0);
    const disc = (s.discounts ?? []).reduce((sum, d) => sum + d.amount, 0);
    const effective = Math.max(0, s.amount - disc);
    const lastDate = (s.payments ?? []).reduce<string>((mx, p) => p.date > mx ? p.date : mx, '');
    let status: ScheduleStatus;
    if (effective === 0 && disc > 0) status = '완료';
    else if (paid >= effective) status = '완료';
    else if (paid > 0 || disc > 0) status = '부분납';
    else status = s.dueDate < today ? '연체' : '예정';
    return { ...s, paidAmount: paid, discountAmount: disc, paidAt: lastDate || undefined, status };
  }

  function toggleExpand(seq: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq); else next.add(seq);
      return next;
    });
  }

  function startAdd(seq: number, mode: AddMode) {
    const s = schedulesNorm.find((x) => x.seq === seq);
    if (!s) return;
    const existingDisc = (s.discounts ?? []).reduce((sum, d) => sum + d.amount, 0);
    const effective = Math.max(0, s.amount - existingDisc);
    const owed = Math.max(0, effective - s.paidAmount);
    setAddOpenSeq(seq);
    setAddMode(mode);
    setAddDate(todayKr());
    setAddAmount(String(mode === 'payment' ? owed : Math.max(0, effective)));
    setAddMemo('');
    setAddReason('자가조치');
    setExpanded((prev) => new Set([...prev, seq]));
  }

  function commitAdd() {
    if (addOpenSeq == null) return;
    const amt = parseInt(addAmount.replace(/[^0-9]/g, ''), 10);
    if (!amt || amt <= 0) { alert('금액을 입력하세요.'); return; }
    const today = todayKr();

    if (addMode === 'discount') {
      // 할인 — 해당 회차에만 적용 (다음 회차로 흘리지 않음)
      const next = schedulesNorm.map((s) => {
        if (s.seq !== addOpenSeq) return { ...s };
        const existing = (s.discounts ?? []).reduce((sum, d) => sum + d.amount, 0);
        const cap = Math.max(0, s.amount - existing);
        const applied = Math.min(amt, cap);
        if (applied <= 0) return { ...s };
        const list = [...(s.discounts ?? []), {
          date: addDate || today,
          amount: applied,
          reason: addReason,
          memo: addMemo || undefined,
          at: new Date().toISOString(),
        }];
        return recalcRow({ ...s, discounts: list }, today);
      });
      persist(next);
    } else {
      // 입금 — 선납 자동 분배 (해당 회차부터 시작해서 초과분은 다음 회차로)
      let remaining = amt;
      const next = schedulesNorm.map((s) => ({ ...s, payments: [...(s.payments ?? [])] }));
      const startIdx = next.findIndex((s) => s.seq === addOpenSeq);
      for (let i = startIdx; i < next.length && remaining > 0; i++) {
        const s = next[i];
        if (s.status === '면제') continue;
        const discSum = (s.discounts ?? []).reduce((sum, d) => sum + d.amount, 0);
        const effective = Math.max(0, s.amount - discSum);
        const paidSum = s.payments.reduce((sum, p) => sum + p.amount, 0);
        const owed = Math.max(0, effective - paidSum);
        if (owed <= 0) continue;
        const apply = Math.min(owed, remaining);
        s.payments.push({
          date: addDate || today,
          amount: apply,
          source: '수동',
          memo: i > startIdx ? `${addMemo || '선납'} (선납 from ${addOpenSeq}회차)` : (addMemo || undefined),
          at: new Date().toISOString(),
        });
        const next2 = recalcRow(s, today);
        Object.assign(s, next2);
        remaining -= apply;
      }
      persist(next);
    }

    setAddOpenSeq(null);
    setAddAmount('');
    setAddMemo('');
  }

  function removePayment(seq: number, idx: number) {
    if (!confirm(`이 입금 기록을 삭제하시겠습니까?`)) return;
    const today = todayKr();
    const next = schedulesNorm.map((s) => {
      if (s.seq !== seq) return { ...s };
      const payments = [...(s.payments ?? [])];
      payments.splice(idx, 1);
      return recalcRow({ ...s, payments }, today);
    });
    persist(next);
  }

  function removeDiscount(seq: number, idx: number) {
    if (!confirm(`이 할인 기록을 삭제하시겠습니까?`)) return;
    const today = todayKr();
    const next = schedulesNorm.map((s) => {
      if (s.seq !== seq) return { ...s };
      const discounts = [...(s.discounts ?? [])];
      discounts.splice(idx, 1);
      return recalcRow({ ...s, discounts }, today);
    });
    persist(next);
  }

  function handleExempt(seq: number) {
    if (!confirm(`${seq}회차를 '면제'로 처리하시겠습니까?\n(미수에서 제외됨)`)) return;
    const next = schedulesNorm.map((s) => s.seq === seq ? { ...s, status: '면제' as ScheduleStatus, paidAmount: s.amount } : { ...s });
    persist(next);
  }

  function handleRevert(seq: number) {
    if (!confirm(`${seq}회차의 모든 입금·할인·면제 처리를 취소하시겠습니까?`)) return;
    const today = todayKr();
    const next = schedulesNorm.map((s) => {
      if (s.seq !== seq) return { ...s };
      return { ...s, payments: [], discounts: [], paidAmount: 0, discountAmount: 0, paidAt: undefined, status: (s.dueDate < today ? '연체' : '예정') as ScheduleStatus };
    });
    persist(next);
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th className="center" style={{ width: 36 }}></th>
          <th className="center" style={{ width: 50 }}>회차</th>
          <th>예정일</th>
          <th className="num">청구금액</th>
          <th className="num" style={{ color: 'var(--red-text)' }}>청구할인</th>
          <th className="num">납부금액</th>
          <th className="num">잔액</th>
          <th className="mono" style={{ width: 100 }}>최종입금일</th>
          <th className="center" style={{ width: 70 }}>상태</th>
          <th className="center" style={{ width: 200 }}>액션</th>
        </tr>
      </thead>
      <tbody>
        {schedulesNorm.map((r) => {
          const isExpanded = expanded.has(r.seq);
          const pays = r.payments ?? [];
          const discs = r.discounts ?? [];
          const discSum = discs.reduce((sum, d) => sum + d.amount, 0);
          const effective = Math.max(0, r.amount - discSum);
          const bal = Math.max(0, effective - r.paidAmount);
          const hasEntries = pays.length > 0 || discs.length > 0;
          const owed = r.status === '면제' ? 0 : bal;
          return (
            <Fragment key={r.seq}>
              <tr style={{ cursor: hasEntries ? 'pointer' : undefined }} onClick={() => hasEntries && toggleExpand(r.seq)}>
                <td className="center">
                  {hasEntries ? (
                    <CaretRight size={10} weight="bold" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: 'var(--text-weak)' }} />
                  ) : null}
                </td>
                <td className="center mono">{r.seq}</td>
                <td className="mono">{formatDateFull(r.dueDate)}</td>
                <td className="num mono">{formatCurrency(r.amount)}</td>
                <td className="num mono" style={{ color: discSum > 0 ? 'var(--red-text)' : 'var(--text-weak)' }}>
                  {discSum > 0 ? `-${formatCurrency(discSum)}` : '-'}
                </td>
                <td className="num mono">{formatCurrency(r.paidAmount)}</td>
                <td className={`num mono ${owed > 0 ? 'danger' : ''}`}>
                  {formatCurrency(bal)}
                </td>
                <td className="mono dim">{r.paidAt ? formatDateFull(r.paidAt) : '-'}</td>
                <td className="center"><span className={`status ${r.status}`}>{r.status}</span></td>
                <td className="center" onClick={(e) => e.stopPropagation()}>
                  {r.status !== '면제' && owed > 0 ? (
                    <span style={{ display: 'inline-flex', gap: 4 }}>
                      <button className="btn btn-sm btn-primary" type="button" onClick={() => startAdd(r.seq, 'payment')} title="분할/일부 입금 기록">
                        <Plus size={10} weight="bold" /> 입금
                      </button>
                      <button className="btn btn-sm" type="button" onClick={() => startAdd(r.seq, 'discount')} title="청구할인 (자가조치 등)" style={{ color: 'var(--red-text)' }}>
                        <Plus size={10} weight="bold" /> 할인
                      </button>
                      <button className="btn btn-sm" type="button" onClick={() => handleExempt(r.seq)} title="면제 (미수 제외)">면제</button>
                    </span>
                  ) : (r.status === '완료' || r.status === '면제') ? (
                    <span style={{ display: 'inline-flex', gap: 4 }}>
                      {r.status === '완료' && owed === 0 && (
                        <button className="btn btn-sm" type="button" onClick={() => startAdd(r.seq, 'payment')} title="선납 추가">
                          <Plus size={10} weight="bold" /> 선납
                        </button>
                      )}
                      <button className="btn btn-sm btn-ghost" type="button" onClick={() => handleRevert(r.seq)} title="모든 입금·할인·면제 취소">되돌리기</button>
                    </span>
                  ) : null}
                </td>
              </tr>

              {/* 입금/할인 추가 입력 행 */}
              {addOpenSeq === r.seq && (
                <tr>
                  <td colSpan={10} style={{ background: addMode === 'discount' ? 'var(--red-bg)' : 'var(--bg-sunken)', padding: 10 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: addMode === 'discount' ? 'var(--red-text)' : 'var(--text-sub)' }}>
                        {addMode === 'discount' ? '청구할인 추가' : '입금 추가'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>{addMode === 'discount' ? '할인일' : '입금일'}</span>
                      <DateInput value={addDate} onChange={setAddDate} style={{ width: 150 }} />
                      <span style={{ fontSize: 11, color: 'var(--text-sub)', marginLeft: 6 }}>금액</span>
                      <input
                        type="text" className="input mono" placeholder="원 단위"
                        value={addAmount}
                        onChange={(e) => setAddAmount(e.target.value.replace(/[^0-9]/g, ''))}
                        style={{ width: 140 }}
                        autoFocus
                      />
                      {addMode === 'discount' && (
                        <>
                          <span style={{ fontSize: 11, color: 'var(--text-sub)', marginLeft: 6 }}>사유</span>
                          <select className="input" value={addReason} onChange={(e) => setAddReason(e.target.value as DiscountReason)} style={{ width: 110 }}>
                            <option value="자가조치">자가조치</option>
                            <option value="보상">보상</option>
                            <option value="사은품">사은품</option>
                            <option value="캠페인">캠페인</option>
                            <option value="기타">기타</option>
                          </select>
                        </>
                      )}
                      <span style={{ fontSize: 11, color: 'var(--text-sub)', marginLeft: 6 }}>메모</span>
                      <input
                        type="text" className="input" placeholder={addMode === 'discount' ? '예: 타이어 자가교체 차감' : '현금/외부결제 등'}
                        value={addMemo} onChange={(e) => setAddMemo(e.target.value)}
                        style={{ width: 200 }}
                      />
                      <button className="btn btn-sm btn-primary" type="button" onClick={commitAdd}>
                        <CheckCircle size={11} /> 저장
                      </button>
                      <button className="btn btn-sm" type="button" onClick={() => setAddOpenSeq(null)}>취소</button>
                      <span style={{ fontSize: 10, color: 'var(--text-weak)' }}>
                        {addMode === 'discount'
                          ? '※ 청구할인 — 청구금액에서 차감 (미수 X). 이번 회차에만 적용'
                          : '※ 회차 금액 초과분은 다음 회차로 자동 선납 처리'}
                      </span>
                    </div>
                  </td>
                </tr>
              )}

              {/* 펼침 — 분납 + 할인 내역 통합 (날짜순) */}
              {isExpanded && hasEntries && (
                <tr>
                  <td colSpan={10} style={{ background: 'var(--bg-sunken)', padding: 8 }}>
                    <table className="table" style={{ fontSize: 11, margin: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 100 }}>일자</th>
                          <th className="center" style={{ width: 60 }}>구분</th>
                          <th className="num" style={{ width: 110 }}>금액</th>
                          <th className="center" style={{ width: 70 }}>출처/사유</th>
                          <th>메모</th>
                          <th className="mono dim" style={{ width: 140 }}>등록자</th>
                          <th className="center" style={{ width: 50 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ...pays.map((p, idx) => ({ kind: 'payment' as const, idx, date: p.date, amount: p.amount, label: p.source, memo: p.memo, by: p.by, source: p.source })),
                          ...discs.map((d, idx) => ({ kind: 'discount' as const, idx, date: d.date, amount: d.amount, label: d.reason ?? '할인', memo: d.memo, by: d.by, source: '할인' as const })),
                        ]
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .map((e, i) => (
                            <tr key={`${e.kind}-${e.idx}-${i}`}>
                              <td className="mono">{formatDateFull(e.date)}</td>
                              <td className="center">
                                {e.kind === 'discount'
                                  ? <span className="chip" style={{ height: 16, padding: '0 6px', fontSize: 10, background: 'var(--red-bg)', color: 'var(--red-text)' }}>할인</span>
                                  : <span className="chip" style={{ height: 16, padding: '0 6px', fontSize: 10, background: 'var(--green-bg)', color: 'var(--green-text)' }}>입금</span>}
                              </td>
                              <td className="num mono" style={{ color: e.kind === 'discount' ? 'var(--red-text)' : undefined }}>
                                {e.kind === 'discount' ? '-' : ''}₩{formatCurrency(e.amount)}
                              </td>
                              <td className="center">
                                <span className="chip" style={{
                                  height: 16, padding: '0 6px', fontSize: 10,
                                  background: e.kind === 'discount' ? 'var(--bg-sunken)'
                                    : e.source === '정산' ? 'var(--bg-sunken)'
                                    : e.source === '계좌' ? 'var(--blue-bg)'
                                    : e.source === '카드' ? 'var(--purple-bg)'
                                    : 'var(--green-bg)',
                                  color: e.kind === 'discount' ? 'var(--text-weak)'
                                    : e.source === '정산' ? 'var(--text-weak)'
                                    : e.source === '계좌' ? 'var(--blue-text)'
                                    : e.source === '카드' ? 'var(--purple-text)'
                                    : 'var(--green-text)',
                                }}>{e.label}</span>
                              </td>
                              <td className="dim">{e.memo || '-'}</td>
                              <td className="mono dim">{e.by ?? (e.kind === 'payment' && e.source === '정산' ? '(자동)' : '-')}</td>
                              <td className="center">
                                {e.kind === 'discount' ? (
                                  <button className="btn btn-sm btn-ghost btn-icon" type="button" onClick={() => removeDiscount(r.seq, e.idx)} title="삭제">
                                    <X size={10} />
                                  </button>
                                ) : (e.source !== '계좌' && e.source !== '카드') ? (
                                  <button className="btn btn-sm btn-ghost btn-icon" type="button" onClick={() => removePayment(r.seq, e.idx)} title="삭제">
                                    <X size={10} />
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function HistoryListTab({ scope, c }: { scope: 'contract' | 'vehicle'; c: Contract }) {
  const { contracts } = useContractsList();
  const { entries, remove: removeEntry } = useHistoryEntries();
  const [addOpen, setAddOpen] = useState(false);
  const title = scope === 'vehicle' ? '차량 이력' : '계약 이력';
  const target = scope === 'vehicle' ? `차량번호 ${c.vehiclePlate}` : `계약 ${c.contractNo}`;
  const hint = scope === 'vehicle'
    ? '정비·검사·사고·세차·위반·보험·부품교체 — 차량번호에 영구 귀속 (계약 종료되어도 차량에 따라감)'
    : '연락기록·분쟁·클레임·수납이슈·메모 — 이 계약에만 귀속';

  // 차량 이력 — 같은 plate 의 다른 계약 (현재 계약 제외, 계약일 내림차순)
  const sameVehicleContracts = scope === 'vehicle'
    ? contracts
        .filter((x) => x.vehiclePlate === c.vehiclePlate && x.id !== c.id)
        .sort((a, b) => b.contractDate.localeCompare(a.contractDate))
    : [];

  // 본인 이력 (scope + 매칭)
  const myEntries = entries.filter((e) =>
    scope === 'vehicle' ? e.scope === 'vehicle' && e.vehiclePlate === c.vehiclePlate
                        : e.scope === 'contract' && e.contractId === c.id,
  );
  const totalCost = myEntries.reduce((s, e) => s + (e.cost ?? 0), 0);

  return (
    <>
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

        {/* 차량 이력 탭일 때 — 같은 차량의 다른 계약 노출 */}
        {scope === 'vehicle' && sameVehicleContracts.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-weak)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              같은 차량 과거/현재 계약 ({sameVehicleContracts.length}건)
            </div>
            <table className="table" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>계약번호</th>
                  <th>계약자</th>
                  <th>회사</th>
                  <th className="mono">계약기간</th>
                  <th className="num">월대여료</th>
                  <th className="num">미수</th>
                  <th className="center">상태</th>
                </tr>
              </thead>
              <tbody>
                {sameVehicleContracts.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.contractNo}</td>
                    <td>{p.customerName}</td>
                    <td className="dim">{p.company}</td>
                    <td className="mono dim">
                      {p.contractDate?.slice(2)}{p.returnScheduledDate ? ` ~ ${p.returnScheduledDate.slice(2)}` : ''}
                    </td>
                    <td className="num mono">₩{formatCurrency(p.monthlyRent ?? 0)}</td>
                    <td className="num mono" style={{ color: (p.unpaidAmount ?? 0) > 0 ? 'var(--red-text)' : undefined }}>
                      {(p.unpaidAmount ?? 0) > 0 ? `₩${formatCurrency(p.unpaidAmount!)}` : '-'}
                    </td>
                    <td className="center"><span className={`status ${p.status}`}>{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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
            <table className="table" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>일자</th>
                  <th className="center" style={{ width: 80 }}>분류</th>
                  <th>제목 / 내용</th>
                  {scope === 'vehicle' && <th style={{ width: 120 }}>업체</th>}
                  {scope === 'vehicle' && <th className="num" style={{ width: 80 }}>주행거리</th>}
                  <th className="num" style={{ width: 100 }}>비용</th>
                  <th className="center" style={{ width: 64 }}>상태</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {myEntries.map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{e.date}</td>
                    <td className="center"><span className="chip" style={{ height: 18, padding: '0 8px', fontSize: 10 }}>{e.category}</span></td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{e.title}</div>
                      {e.description && <div className="dim" style={{ fontSize: 10, marginTop: 2 }}>{e.description}</div>}
                    </td>
                    {scope === 'vehicle' && <td className="dim">{e.vendor ?? '-'}</td>}
                    {scope === 'vehicle' && <td className="num mono dim">{e.mileage ? `${e.mileage.toLocaleString('ko-KR')} km` : '-'}</td>}
                    <td className="num mono">{e.cost ? `₩${formatCurrency(e.cost)}` : '-'}</td>
                    <td className="center"><span className={`status ${e.status === '완료' ? '완료' : e.status === '진행' ? '예정' : '예정'}`}>{e.status}</span></td>
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

function addMonths(yyyymmdd: string, months: number, day: number): string {
  const d = new Date(yyyymmdd);
  d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, 28));
  return d.toISOString().slice(0, 10);
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

  return (
    <div className="detail-stack">
      <LicenseVerifySection c={c} onUpdate={onUpdate} />

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
                          gridTemplateColumns: '100px 1fr',
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
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 130px auto auto', gap: 8, alignItems: 'center' }}>
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
