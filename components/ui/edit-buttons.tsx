'use client';

/**
 * 공용 [수정 / 저장 / 취소] 버튼 묶음 — 모든 detail dialog 동일 규격.
 *
 *  · DetailDialogShell 의 footer (한 dialog = 한 모드)
 *  · 탭 내부 inline (탭별 독립 편집 — 예: ContractDetailDialog 의 차량스펙·고객정보 탭)
 *
 *  변형: variant='inline' (탭 내부, btn-sm) / 'footer' (Shell 푸터, 기본 btn).
 */

import { Pencil, FloppyDisk, X as XIcon } from '@phosphor-icons/react';

/**
 * Tab 컴포넌트가 부모(예: DetailDialogShell footer)에게 노출하는 핸들.
 * 활성 탭이 자체적으로 inline 편집 모드를 켤 수 있도록.
 */
export type EditableTabHandle = {
  /** 편집 모드 진입 (footer [수정] 버튼이 호출) */
  startEdit: () => void;
  /** 현재 편집 중인지 (footer가 [저장]/[취소] 버튼 분기) */
  isEditing: () => boolean;
};

export type EditButtonsProps = {
  editing: boolean;
  onEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  /** inline: 탭 내부 (btn-sm) / footer: Shell 푸터 (기본 size) */
  variant?: 'inline' | 'footer';
};

export function EditButtons({ editing, onEdit, onSave, onCancel, variant = 'footer' }: EditButtonsProps) {
  const btnCls = variant === 'inline' ? 'btn btn-sm' : 'btn';
  const primaryCls = variant === 'inline' ? 'btn btn-sm btn-primary' : 'btn btn-primary';
  const iconSize = 12;
  if (editing) {
    return (
      <>
        {onCancel && (
          <button className={btnCls} type="button" onClick={onCancel}>
            <XIcon size={iconSize} weight="bold" /> 취소
          </button>
        )}
        {onSave && (
          <button className={primaryCls} type="button" onClick={onSave}>
            <FloppyDisk size={iconSize} weight="bold" /> 저장
          </button>
        )}
      </>
    );
  }
  if (!onEdit) return null;
  return (
    <button className={primaryCls} type="button" onClick={onEdit}>
      <Pencil size={iconSize} weight="bold" /> 수정
    </button>
  );
}

/**
 * 탭 내부 우측 정렬 wrapper (탭 상단). 공용 패턴이라 함께 export.
 */
export function InlineEditBar(props: EditButtonsProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 4 }}>
      <EditButtons {...props} variant="inline" />
    </div>
  );
}
