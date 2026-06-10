'use client';

/**
 * Field + EditableField — 공용 정보 행 컴포넌트.
 *
 *  뷰 모드: <Field label="이름" value="홍길동" />
 *  편집 모드: <EditableField label="이름" value={draft.name} editing={editing} onChange={(v) => set('name', v)} />
 *
 *  편집 시 input은 .value 와 정확히 같은 위치/폰트/사이즈로 렌더 —
 *  뷰 ⟷ 수정 토글 시 텍스트 위치 점프 X.
 *
 *  사용처: ContractDetailDialog, CompanyDetailDialog, 기타 모든 상세 다이얼로그.
 *  (예전에는 각 dialog 가 자체 정의 — 통일을 위해 여기로 일원화)
 */

import type { ReactNode } from 'react';

export function Field({
  label, value, mono, muted,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="detail-field">
      <div className="label">{label}</div>
      <div className={`value ${mono ? 'mono' : ''} ${muted ? 'muted' : ''}`}>{value}</div>
    </div>
  );
}

export function EditableField({
  label, value, editing, onChange, mono, placeholder, readonly,
}: {
  label: string;
  value: string | undefined;
  editing: boolean;
  onChange?: (v: string) => void;
  mono?: boolean;
  placeholder?: string;
  /** 편집 모드에서도 read-only — 식별자 등 변경 불가 필드 */
  readonly?: boolean;
}) {
  if (!editing || readonly) {
    return <Field label={label} value={value || (placeholder ?? '-')} mono={mono} muted={!value} />;
  }
  return (
    <div className="detail-field is-editing">
      <div className="label">{label}</div>
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className={`detail-field-input ${mono ? 'mono' : ''}`}
      />
    </div>
  );
}
