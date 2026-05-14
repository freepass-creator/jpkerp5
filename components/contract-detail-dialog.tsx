'use client';

import { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import {
  User, Car, FileText, ClipboardText, ArrowsLeftRight, CurrencyKrw,
  Plus, CheckCircle, PauseCircle, PlayCircle, ArrowUUpLeft,
} from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import type { Contract, VehicleStatus } from '@/lib/types';
import { formatCurrency, formatDateFull, daysSince } from '@/lib/utils';
import { TODAY } from '@/lib/mock-data';

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
              <Tabs.Trigger value="vehicleHistory" className="tabs-trigger">차량이력</Tabs.Trigger>
              <Tabs.Trigger value="contractHistory" className="tabs-trigger">계약이력</Tabs.Trigger>
            </Tabs.List>

            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              <Tabs.Content value="vehicleSpec"><VehicleSpecTab c={contract} /></Tabs.Content>
              <Tabs.Content value="vehicleStatus"><VehicleStatusTab c={contract} onUpdate={onUpdate} /></Tabs.Content>
              <Tabs.Content value="contract"><ContractInfoTab c={contract} /></Tabs.Content>
              <Tabs.Content value="payment"><PaymentTab c={contract} onUpdate={onUpdate} /></Tabs.Content>
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
  return (
    <div className="detail-hero">
      <div className="detail-hero-main">
        <div className="detail-hero-name">{c.customerName}</div>
        <div className="detail-hero-meta">
          <span className="plate">{c.vehiclePlate}</span>
          <span>·</span>
          <span>{c.vehicleModel}</span>
          <span>·</span>
          <span>{c.company}</span>
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
        <span style={{ flex: 1 }}>{title}</span>
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
  return (
    <div className="detail-stack">
      <Section icon={<Car size={12} weight="duotone" />} title="차량 식별">
        <div className="detail-grid-2">
          <div>
            <Field label="차량번호" value={c.vehiclePlate} mono />
            <Field label="차종" value={c.vehicleModel} />
            <Field label="회사" value={c.company} />
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
  const [actionDate, setActionDate] = useState<string>(TODAY);
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
          <input
            type="date"
            className="input"
            value={actionDate}
            onChange={(e) => setActionDate(e.target.value)}
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
          <Field label="휴차 일수" value={`${daysSince(c.idleSince, TODAY)}일`} mono />
        </Section>
      )}
    </div>
  );
}

/* ─────────────── 계약정보 탭 (고객 + 조건 + 비고) ─────────────── */

function ContractInfoTab({ c }: { c: Contract }) {
  return (
    <div className="detail-stack">
      <Section icon={<User size={12} weight="duotone" />} title="고객">
        <div className="detail-grid-2">
          <div>
            <Field label="이름" value={c.customerName} />
            <Field label="등록번호" value={c.customerRegNoMasked || '-'} mono />
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
  const [addOpen, setAddOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(TODAY);

  function submitPayment() {
    const amt = parseInt(payAmount.replace(/[^0-9]/g, ''), 10);
    if (!amt || amt <= 0) {
      alert('금액을 입력해주세요.');
      return;
    }
    const newUnpaid = Math.max(0, c.unpaidAmount - amt);
    const newSeqCount = newUnpaid === 0 ? 0 : c.unpaidSeqCount;
    onUpdate({
      ...c,
      unpaidAmount: newUnpaid,
      unpaidSeqCount: newSeqCount,
      lastPaidDate: payDate,
      lastPaidAmount: amt,
      currentSeq: newUnpaid === 0 ? Math.min(c.currentSeq + 1, c.totalSeq) : c.currentSeq,
    });
    setPayAmount('');
    setAddOpen(false);
  }

  return (
    <div className="detail-stack">
      <Section
        icon={<CurrencyKrw size={12} weight="duotone" />}
        title={`수납 현황 — ${c.currentSeq}/${c.totalSeq}회 · 월 ₩${formatCurrency(c.monthlyRent)}`}
        action={
          <button className="btn btn-sm btn-primary" onClick={() => setAddOpen((v) => !v)}>
            <Plus size={12} weight="bold" /> 입금 추가
          </button>
        }
      >
        {addOpen && (
          <div style={{ padding: 12, background: 'var(--bg-sunken)', borderRadius: 6, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>일자</span>
              <input type="date" className="input" value={payDate} onChange={(e) => setPayDate(e.target.value)} style={{ width: 160 }} />
              <span style={{ fontSize: 11, color: 'var(--text-sub)', marginLeft: 8 }}>금액</span>
              <input
                type="text"
                className="input"
                placeholder="원 단위"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9]/g, ''))}
                style={{ width: 180 }}
                autoFocus
              />
              <button className="btn btn-primary" onClick={submitPayment}>
                <CheckCircle size={14} /> 저장
              </button>
              <button className="btn" onClick={() => setAddOpen(false)}>취소</button>
            </div>
            {c.unpaidAmount > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-weak)', marginTop: 8 }}>
                현재 미수금 ₩{formatCurrency(c.unpaidAmount)} · 월 대여료 ₩{formatCurrency(c.monthlyRent)}
              </div>
            )}
          </div>
        )}

        <div className="detail-grid-2" style={{ marginTop: 4 }}>
          <div>
            <Field label="현재 회차" value={`${c.currentSeq} / ${c.totalSeq}`} mono />
            <Field label="최근 결제일" value={formatDateFull(c.lastPaidDate) || <span className="muted">-</span>} mono />
            <Field label="최근 결제액" value={c.lastPaidAmount ? `₩${formatCurrency(c.lastPaidAmount)}` : <span className="muted">-</span>} mono />
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
        <ScheduleTable c={c} />
      </Section>

      <Section icon={<CurrencyKrw size={12} weight="duotone" />} title={`입금 이력 — ${generatePaymentHistory(c).length}건`}>
        <PaymentHistoryTable c={c} />
      </Section>
    </div>
  );
}

/** 입금 이력 (실제 트랜잭션) — 회차별 스케줄과 무관하게 시간순 누적 */
type PaymentLog = {
  date: string;
  seq: number;
  amount: number;
  method: string;
  source: '계좌' | '카드' | '현금' | '수동';
  counterparty: string;
  status: '완료' | '부분' | '예약';
};

function generatePaymentHistory(c: Contract): PaymentLog[] {
  const logs: PaymentLog[] = [];
  // 완료된 회차 (currentSeq - 1 까지 모두 완납)
  for (let seq = 1; seq < c.currentSeq; seq++) {
    logs.push({
      date: addMonths(c.contractDate, seq - 1, c.paymentDay),
      seq,
      amount: c.monthlyRent,
      method: c.paymentMethod,
      source: c.paymentMethod === '카드' ? '카드' : c.paymentMethod === 'CMS' || c.paymentMethod === '이체' ? '계좌' : '수동',
      counterparty: c.customerName,
      status: '완료',
    });
  }
  // 현재 회차 부분납 (lastPaidAmount가 있고 monthlyRent보다 작은 경우)
  if (c.lastPaidAmount && c.lastPaidAmount > 0 && c.lastPaidAmount < c.monthlyRent) {
    logs.push({
      date: c.lastPaidDate ?? c.contractDate,
      seq: c.currentSeq,
      amount: c.lastPaidAmount,
      method: c.paymentMethod,
      source: c.paymentMethod === '카드' ? '카드' : '계좌',
      counterparty: c.customerName,
      status: '부분',
    });
  }
  // 최근순
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
  return (
    <>
      <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 6 }}>
        누적 입금액 <span className="mono" style={{ color: 'var(--text-main)', fontWeight: 600 }}>₩{formatCurrency(total)}</span>
        {' · '}최근순
      </div>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 110 }}>일자</th>
            <th className="center" style={{ width: 60 }}>회차</th>
            <th className="num" style={{ width: 120 }}>입금액</th>
            <th className="center" style={{ width: 70 }}>경로</th>
            <th>입금자</th>
            <th>결제수단</th>
            <th className="center" style={{ width: 70 }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l, i) => (
            <tr key={i}>
              <td className="mono">{formatDateFull(l.date)}</td>
              <td className="center mono">{l.seq}회</td>
              <td className="num mono">₩{formatCurrency(l.amount)}</td>
              <td className="center"><span className="chip" style={{ height: 18, padding: '0 8px', fontSize: 10, fontWeight: 500 }}>{l.source}</span></td>
              <td>{l.counterparty}</td>
              <td className="dim">{l.method}</td>
              <td className="center"><span className={`status ${l.status === '완료' ? '완료' : '부분'}`}>{l.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function ScheduleTable({ c }: { c: Contract }) {
  const rows = Array.from({ length: c.totalSeq }, (_, i) => {
    const seq = i + 1;
    const isPaid = seq < c.currentSeq;
    const isCurrent = seq === c.currentSeq;
    const unpaidThis = c.unpaidAmount > 0 && (isCurrent || (c.unpaidSeqCount > 1 && seq >= c.currentSeq - c.unpaidSeqCount + 1));
    return {
      seq,
      dueDate: addMonths(c.contractDate, i, c.paymentDay),
      amount: c.monthlyRent,
      status: isPaid ? '완료' : unpaidThis ? '미납' : isCurrent ? '예정' : '예정',
      paidAmount: isPaid ? c.monthlyRent : unpaidThis ? Math.max(0, c.monthlyRent - c.unpaidAmount) : 0,
    };
  });

  return (
    <table className="table">
      <thead>
        <tr>
          <th className="center" style={{ width: 50 }}>회차</th>
          <th>예정일</th>
          <th className="num">예정금액</th>
          <th className="num">입금액</th>
          <th className="num">잔액</th>
          <th className="center" style={{ width: 80 }}>상태</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.seq}>
            <td className="center mono">{r.seq}</td>
            <td className="mono">{formatDateFull(r.dueDate)}</td>
            <td className="num mono">{formatCurrency(r.amount)}</td>
            <td className="num mono">{formatCurrency(r.paidAmount)}</td>
            <td className={`num mono ${r.amount - r.paidAmount > 0 ? 'danger' : ''}`}>
              {formatCurrency(r.amount - r.paidAmount)}
            </td>
            <td className="center"><span className={`status ${r.status}`}>{r.status}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HistoryListTab({ scope, c }: { scope: 'contract' | 'vehicle'; c: Contract }) {
  const title = scope === 'vehicle' ? '차량 이력' : '계약 이력';
  const target = scope === 'vehicle' ? `차량번호 ${c.vehiclePlate}` : `계약 ${c.contractNo}`;
  const hint = scope === 'vehicle'
    ? '정비·검사·사고·세차·위반·보험 등 — 차량번호에 영구 귀속'
    : '연락기록·분쟁·클레임·수납이슈·메모 등 — 이 계약에만 귀속';

  return (
    <Section
      icon={scope === 'vehicle' ? <Car size={12} weight="duotone" /> : <ClipboardText size={12} weight="duotone" />}
      title={`${title} — ${target}`}
      action={<button type="button" className="btn btn-sm btn-primary">+ 이력 추가</button>}
    >
      <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 8 }}>{hint}</div>
      <div style={{ padding: 32, color: 'var(--text-weak)', textAlign: 'center', fontSize: 12 }}>
        아직 {title} 기록이 없습니다.
      </div>
    </Section>
  );
}

function addMonths(yyyymmdd: string, months: number, day: number): string {
  const d = new Date(yyyymmdd);
  d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, 28));
  return d.toISOString().slice(0, 10);
}
