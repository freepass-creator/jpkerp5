'use client';

/**
 * 계약 detail dialog 의 계약 정보 탭 — ContractInfoTab + AdditionalDriversEditor.
 *
 * 임차인·운전자·계약조건 표시 + 편집.
 * 원래 contract-detail-dialog.tsx 안에 인라인이었으나 분할 (2026-06-19).
 */

import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import {
  User, FileText, ClipboardText, Plus, Trash,
} from '@phosphor-icons/react';
import { Section } from '@/components/ui/detail-primitives';
import { Field as SharedField, EditableField as SharedEditableField } from '@/components/ui/editable-field';
import { StatusBadge } from '@/components/ui/status-badge';
import { type EditableTabHandle } from '@/components/ui/edit-buttons';
import { InlineTextEdit } from '@/components/ui/inline-text-edit';
import { formatCurrency, formatDateFull } from '@/lib/utils';
import { contractIdentMasked } from '@/lib/ident';
import type { Contract, AdditionalDriver } from '@/lib/types';

const Field = SharedField;
const EditableField = SharedEditableField;

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

export const ContractInfoTab = forwardRef<EditableTabHandle, { c: Contract; onUpdate: (u: Contract) => void; onEditingChange?: (e: boolean) => void }>(function ContractInfoTab({ c, onUpdate, onEditingChange }, ref) {
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
            {/* 담당자 — 인라인 즉시 편집 (editing 모드 무관) */}
            <div className="detail-field">
              <div className="label">담당자</div>
              <div className="value">
                <InlineTextEdit
                  value={editing ? (draft.manager ?? '') : (c.manager ?? '')}
                  onSave={(v) => {
                    if (editing) set('manager', v || undefined);
                    else onUpdate({ ...c, manager: v || undefined });
                  }}
                  placeholder="-"
                />
              </div>
            </div>
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
        {/* 인라인 즉시 편집 (ERP UX 트렌드 — 직원 [수정] 클릭 단계 생략) */}
        <InlineTextEdit
          value={editing ? (draft.notes ?? '') : (c.notes ?? '')}
          onSave={(v) => {
            if (editing) {
              set('notes', v || undefined);
            } else {
              // editing 모드 아닐 때는 즉시 onUpdate 발사
              onUpdate({ ...c, notes: v || undefined });
            }
          }}
          placeholder="메모 없음 — 클릭하여 입력"
          multiline rows={4}
        />
      </Section>
    </div>
  );
});

/** 보기/편집 겸용 필드 — editing=true 면 input, 아니면 Field 표시. */
