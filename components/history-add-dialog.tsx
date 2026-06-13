'use client';

import { useState } from 'react';
import { toast } from '@/lib/toast';
import { CheckCircle, CircleNotch } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { DateInput } from '@/components/ui/date-input';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { todayKr } from '@/lib/mock-data';
import type { Contract, HistoryCategory, HistoryScope, HistoryEntry } from '@/lib/types';

const VEHICLE_CATEGORIES: HistoryCategory[] = ['정비', '사고', '검사', '세차', '위반', '보험', '부품교체', '기타'];
const CONTRACT_CATEGORIES: HistoryCategory[] = ['연락기록', '분쟁', '클레임', '수납이슈', '메모', '기타'];

const STATUSES: HistoryEntry['status'][] = ['완료', '진행', '예정'];

/**
 * 이력 추가 다이얼로그 — 카테고리별 디스패처.
 *
 *  공통: 일자/상태/제목/금액/메모 (common fields)
 *  추가 (카테고리별 subform):
 *    · 상품화 (카테고리 = '기타' + meta.kind='상품화' 가 아니라, 신설 카테고리)
 *    · 정비   (작업유형/주행거리/업체)
 *    · 사고   (사고형태/가해피해/과실/보험/면책금 등 13개+)
 *
 *  scope='vehicle' → 차량 이력 (정비/사고/검사 등 plate에 영구 귀속)
 *  scope='contract' → 계약 이력 (연락기록/분쟁 등 contractId에 귀속)
 */
export function HistoryAddDialog({
  open, onOpenChange, scope, contract,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: HistoryScope;
  contract: Contract;
}) {
  const { add } = useHistoryEntries();
  const categories = scope === 'vehicle' ? VEHICLE_CATEGORIES : CONTRACT_CATEGORIES;

  const [category, setCategory] = useState<HistoryCategory>(categories[0]);
  const [date, setDate] = useState(todayKr());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [status, setStatus] = useState<HistoryEntry['status']>('완료');
  const [vendor, setVendor] = useState('');
  const [mileage, setMileage] = useState('');
  // 카테고리별 meta (subform 상태 통합)
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const isVehicle = scope === 'vehicle';
  // 카테고리 변경 시 meta 초기화
  function changeCategory(c: HistoryCategory) {
    setCategory(c);
    setMeta({});
    // 사고/정비 등 자동 title 비우기 (subform 에서 자동 생성)
    if (c === '사고' || c === '정비') setTitle('');
  }

  const valid = !!date && (
    // 사고는 title 자동 생성 가능
    category === '사고' ? true :
    // 그 외엔 title 필수
    !!title.trim()
  );

  /** 입력값 중 하나라도 채워졌으면 dirty (신규 등록이라 모두 빈값이 깨끗 상태) */
  const isDirty =
    !!title.trim() || !!description.trim() || !!cost ||
    !!vendor.trim() || !!mileage || Object.keys(meta).length > 0;

  function guardedClose(next: boolean) {
    if (!next && isDirty) {
      if (!window.confirm('입력 중인 내용이 있습니다. 저장하지 않고 닫을까요?')) return;
    }
    onOpenChange(next);
  }

  async function handleSave() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      // 카테고리별 title 자동 생성 (사용자가 안 적은 경우)
      const autoTitle = title.trim() || autoTitleFor(category, meta);
      await add({
        scope,
        contractId: contract.id,
        vehiclePlate: contract.vehiclePlate,
        date,
        category,
        title: autoTitle,
        description: description.trim() || undefined,
        cost: cost ? parseInt(cost.replace(/[^0-9]/g, ''), 10) || undefined : undefined,
        status,
        vendor: vendor.trim() || undefined,
        mileage: mileage ? parseInt(mileage.replace(/[^0-9]/g, ''), 10) || undefined : undefined,
        meta: Object.keys(meta).length > 0 ? meta : undefined,
      });
      // 초기화
      setCategory(categories[0]);
      setDate(todayKr());
      setTitle('');
      setDescription('');
      setCost('');
      setStatus('완료');
      setVendor('');
      setMileage('');
      setMeta({});
      onOpenChange(false);
    } catch (e) {
      toast.error('이력 추가 실패: ' + ((e as Error).message ?? String(e)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={guardedClose}>
      <DialogContent
        size={category === '사고' ? 'lg' : 'md'}
        mode="new"
        title={isVehicle ? `차량 이력 추가 — ${contract.vehiclePlate}` : `계약 이력 추가 — ${contract.customerName}`}
      >
        <DialogBody className="p-0" style={{ display: 'flex', flexDirection: 'column' }}>
          <form
            onSubmit={(e) => { e.preventDefault(); void handleSave(); }}
            style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div className="form-grid-2">
              <label className="form-label">분류 *</label>
              <div className="filter-bar" style={{ gridColumn: 'span 3', flexWrap: 'wrap' }}>
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`chip ${category === c ? 'active' : ''}`}
                    onClick={() => changeCategory(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <label className="form-label">일자 *</label>
              <DateInput required value={date} onChange={setDate} style={{ width: 200 }} />

              <label className="form-label">상태</label>
              <div className="filter-bar">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`chip ${status === s ? 'active' : ''}`}
                    onClick={() => setStatus(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* 카테고리별 디테일 subform */}
            {isVehicle && category === '사고' && (
              <AccidentSubform meta={meta} setMeta={setMeta} />
            )}
            {isVehicle && category === '정비' && (
              <MaintSubform meta={meta} setMeta={setMeta} vendor={vendor} setVendor={setVendor} mileage={mileage} setMileage={setMileage} />
            )}
            {isVehicle && category === '부품교체' && (
              <MaintSubform meta={meta} setMeta={setMeta} vendor={vendor} setVendor={setVendor} mileage={mileage} setMileage={setMileage} variant="parts" />
            )}

            {/* 공통: 제목 / 금액 / 메모 */}
            <div className="form-grid-2">
              <label className="form-label">제목{category !== '사고' && ' *'}</label>
              <input
                className="input"
                placeholder={
                  category === '사고' ? '비워두면 자동 생성 (예: 사고 단독·과실 20%)' :
                  category === '정비' ? '비워두면 정비 유형으로 자동 생성' :
                  isVehicle ? '예: 엔진오일 교체' : '예: 미수 1차 안내 통화'
                }
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ gridColumn: 'span 3' }}
              />

              {/* 정비/부품교체는 위에서 vendor/mileage 이미 받음 — 그 외 차량 이력은 vendor 노출 */}
              {isVehicle && category !== '정비' && category !== '부품교체' && category !== '사고' && (
                <>
                  <label className="form-label">업체</label>
                  <input
                    className="input"
                    placeholder="예: 현대블루핸즈 강남"
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                  />
                  <label className="form-label">주행거리</label>
                  <input
                    className="input mono"
                    placeholder="km"
                    value={mileage}
                    onChange={(e) => setMileage(e.target.value.replace(/[^0-9]/g, ''))}
                    style={{ width: 160 }}
                  />
                </>
              )}

              {category !== '사고' && (
                <>
                  <label className="form-label">금액</label>
                  <input
                    className="input mono"
                    placeholder="원 단위"
                    value={cost}
                    onChange={(e) => setCost(e.target.value.replace(/[^0-9]/g, ''))}
                    style={{ width: 200 }}
                  />
                </>
              )}

              <label className="form-label" style={{ alignSelf: 'start', paddingTop: 6 }}>상세 내용</label>
              <textarea
                className="input"
                rows={3}
                placeholder={isVehicle
                  ? '작업 내역 / 발견된 문제 / 부품 정보 등'
                  : '응대 내용 / 응답 / 약속 사항 / 다음 액션'}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ height: 'auto', padding: '8px 12px', resize: 'vertical', gridColumn: 'span 3' }}
              />
            </div>
          </form>
        </DialogBody>
        <DialogFooter>
          <div style={{ flex: 1 }} />
          <DialogClose asChild>
            <button className="btn">취소</button>
          </DialogClose>
          <button className="btn btn-primary" type="button" onClick={handleSave} disabled={!valid || saving}>
            {saving ? <CircleNotch size={12} weight="bold" style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={12} />}
            {saving ? '저장 중...' : '이력 추가'}
          </button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

/* ─────────────── 카테고리별 자동 title 생성 ─────────────── */
function autoTitleFor(category: HistoryCategory, meta: Record<string, unknown>): string {
  if (category === '사고') {
    const accType = meta.accType as string ?? '';
    const role = meta.accRole as string ?? '';
    const fault = meta.faultPct;
    const parts = ['사고', accType, role && `${role}`, fault != null && `과실 ${fault}%`].filter(Boolean);
    return parts.join(' · ');
  }
  if (category === '정비') {
    const t = meta.maintType as string ?? '';
    return t ? `정비 — ${t}` : '정비';
  }
  if (category === '부품교체') {
    const t = meta.maintType as string ?? '';
    return t ? `부품교체 — ${t}` : '부품교체';
  }
  return category;
}

/* ─────────────── 정비 / 부품교체 subform ─────────────── */
const MAINT_TYPES = ['엔진오일', '타이어', '브레이크', '배터리', '에어컨', '정기점검', '기능수리', '기타'];
const PARTS_TYPES = ['엔진오일', '브레이크 패드', '타이어', '배터리', '와이퍼', '에어필터', '연료필터', '기타'];
const WORK_STATUS = ['입고', '작업중', '완료'];

function MaintSubform({
  meta, setMeta, vendor, setVendor, mileage, setMileage, variant = 'maint',
}: {
  meta: Record<string, unknown>;
  setMeta: (m: Record<string, unknown>) => void;
  vendor: string;
  setVendor: (v: string) => void;
  mileage: string;
  setMileage: (v: string) => void;
  variant?: 'maint' | 'parts';
}) {
  const opts = variant === 'parts' ? PARTS_TYPES : MAINT_TYPES;
  const maintType = (meta.maintType as string) ?? '';
  const workStatus = (meta.workStatus as string) ?? '';
  return (
    <div className="form-grid-2">
      <label className="form-label">{variant === 'parts' ? '교체 부품' : '정비 구분'} *</label>
      <div className="filter-bar" style={{ gridColumn: 'span 3', flexWrap: 'wrap' }}>
        {opts.map((t) => (
          <button key={t} type="button" className={`chip ${maintType === t ? 'active' : ''}`} onClick={() => setMeta({ ...meta, maintType: t })}>{t}</button>
        ))}
      </div>

      <label className="form-label">진행</label>
      <div className="filter-bar">
        {WORK_STATUS.map((s) => (
          <button key={s} type="button" className={`chip ${workStatus === s ? 'active' : ''}`} onClick={() => setMeta({ ...meta, workStatus: s })}>{s}</button>
        ))}
      </div>

      <label className="form-label">업체</label>
      <input className="input" placeholder="예: 현대블루핸즈 강남" value={vendor} onChange={(e) => setVendor(e.target.value)} />

      <label className="form-label">주행거리</label>
      <input className="input mono" placeholder="km" value={mileage} onChange={(e) => setMileage(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 160 }} />
    </div>
  );
}

/* ─────────────── 사고 subform — v3 디테일 그대로 ─────────────── */
const ACC_TYPES = ['단독', '쌍방'];
const ACC_ROLES = ['가해', '피해'];
const ACC_STATUS = ['접수', '처리중', '수리중', '종결'];
const RENTAL_OPTS = ['미정', '대차제공', '대차없음'];
const DEDUCT_STATUS = ['미수', '수납완료', '면제'];
const FAULT_STEPS = ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100'];
const INS_TYPES: { key: string; label: string }[] = [
  { key: 'car', label: '자차' }, { key: 'property', label: '대물' }, { key: 'person', label: '대인' },
  { key: 'self', label: '자손' }, { key: 'uninsured', label: '무보험' },
];

function AccidentSubform({
  meta, setMeta,
}: { meta: Record<string, unknown>; setMeta: (m: Record<string, unknown>) => void }) {
  const get = <T,>(k: string, fallback: T): T => (meta[k] as T) ?? fallback;
  const set = (k: string, v: unknown) => setMeta({ ...meta, [k]: v });

  const insSelected = (get<string[]>('insTypes', [])) ?? [];
  function toggleIns(key: string) {
    const next = insSelected.includes(key) ? insSelected.filter((x) => x !== key) : [...insSelected, key];
    set('insTypes', next);
  }

  return (
    <div className="detail-section" style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
      <div className="detail-section-header" style={{ marginBottom: 8 }}>사고 상세</div>

      <div className="form-grid-2">
        <label className="form-label">사고형태 *</label>
        <div className="filter-bar">
          {ACC_TYPES.map((t) => <button key={t} type="button" className={`chip ${get('accType', '') === t ? 'active' : ''}`} onClick={() => set('accType', t)}>{t}</button>)}
        </div>

        <label className="form-label">가해/피해 *</label>
        <div className="filter-bar">
          {ACC_ROLES.map((t) => <button key={t} type="button" className={`chip ${get('accRole', '') === t ? 'active' : ''}`} onClick={() => set('accRole', t)}>{t}</button>)}
        </div>

        <label className="form-label">진행</label>
        <div className="filter-bar">
          {ACC_STATUS.map((t) => <button key={t} type="button" className={`chip ${get('accidentStatus', '') === t ? 'active' : ''}`} onClick={() => set('accidentStatus', t)}>{t}</button>)}
        </div>

        <label className="form-label">내 과실 %</label>
        <div className="filter-bar" style={{ flexWrap: 'wrap' }}>
          {FAULT_STEPS.map((p) => <button key={p} type="button" className={`chip ${String(get('faultPct', '')) === p ? 'active' : ''}`} onClick={() => set('faultPct', parseInt(p, 10))}>{p}</button>)}
        </div>

        <label className="form-label">보험유형</label>
        <div className="filter-bar" style={{ flexWrap: 'wrap' }}>
          {INS_TYPES.map((o) => (
            <button key={o.key} type="button" className={`chip ${insSelected.includes(o.key) ? 'active' : ''}`} onClick={() => toggleIns(o.key)}>{o.label}</button>
          ))}
        </div>

        <label className="form-label">대차</label>
        <div className="filter-bar">
          {RENTAL_OPTS.map((t) => <button key={t} type="button" className={`chip ${get('rentalCar', '') === t ? 'active' : ''}`} onClick={() => set('rentalCar', t)}>{t}</button>)}
        </div>

        <label className="form-label">사고 장소</label>
        <input className="input" value={get('location', '')} onChange={(e) => set('location', e.target.value)} placeholder="예: 강남대로 → 양재IC" style={{ gridColumn: 'span 3' }} />
      </div>

      <div className="detail-section-header" style={{ marginTop: 14, marginBottom: 8 }}>우리쪽 보험</div>
      <div className="form-grid-2">
        <label className="form-label">보험사</label>
        <input className="input" value={get('ourInsurance', '')} onChange={(e) => set('ourInsurance', e.target.value)} placeholder="예: 삼성화재" />
        <label className="form-label">접수번호</label>
        <input className="input mono" value={get('insuranceNo', '')} onChange={(e) => set('insuranceNo', e.target.value)} />
        <label className="form-label">담당자 연락처</label>
        <input className="input mono" value={get('insuranceContact', '')} onChange={(e) => set('insuranceContact', e.target.value)} placeholder="010-0000-0000" style={{ gridColumn: 'span 3' }} />
      </div>

      <div className="detail-section-header" style={{ marginTop: 14, marginBottom: 8 }}>상대쪽</div>
      <div className="form-grid-2">
        <label className="form-label">차량번호</label>
        <input className="input mono" value={get('otherPlate', '')} onChange={(e) => set('otherPlate', e.target.value)} placeholder="예: 12가3456" />
        <label className="form-label">이름</label>
        <input className="input" value={get('otherName', '')} onChange={(e) => set('otherName', e.target.value)} />
        <label className="form-label">연락처</label>
        <input className="input mono" value={get('otherPhone', '')} onChange={(e) => set('otherPhone', e.target.value)} placeholder="010-0000-0000" />
        <label className="form-label">보험사</label>
        <input className="input" value={get('otherInsurance', '')} onChange={(e) => set('otherInsurance', e.target.value)} placeholder="예: KB손해보험" />
        <label className="form-label">접수번호</label>
        <input className="input mono" value={get('otherInsuranceNo', '')} onChange={(e) => set('otherInsuranceNo', e.target.value)} />
        <label className="form-label">담당자 연락처</label>
        <input className="input mono" value={get('otherInsuranceContact', '')} onChange={(e) => set('otherInsuranceContact', e.target.value)} placeholder="010-0000-0000" />
      </div>

      <div className="detail-section-header" style={{ marginTop: 14, marginBottom: 8 }}>금액 / 면책금</div>
      <div className="form-grid-2">
        <label className="form-label">총 수리비</label>
        <input className="input mono" value={get('totalRepair', '')} onChange={(e) => set('totalRepair', e.target.value.replace(/[^0-9]/g, ''))} placeholder="원" />
        <label className="form-label">보험처리액</label>
        <input className="input mono" value={get('insuranceAmount', '')} onChange={(e) => set('insuranceAmount', e.target.value.replace(/[^0-9]/g, ''))} placeholder="원" />
        <label className="form-label">면책금 (고객부담)</label>
        <input className="input mono" value={get('deductibleAmount', '')} onChange={(e) => set('deductibleAmount', e.target.value.replace(/[^0-9]/g, ''))} placeholder="원" />
        <label className="form-label">수납한 면책금</label>
        <input className="input mono" value={get('deductiblePaid', '')} onChange={(e) => set('deductiblePaid', e.target.value.replace(/[^0-9]/g, ''))} placeholder="원" />
        <label className="form-label">면책금 상태</label>
        <div className="filter-bar" style={{ gridColumn: 'span 3' }}>
          {DEDUCT_STATUS.map((t) => <button key={t} type="button" className={`chip ${get('deductibleStatus', '') === t ? 'active' : ''}`} onClick={() => set('deductibleStatus', t)}>{t}</button>)}
        </div>
      </div>
    </div>
  );
}
