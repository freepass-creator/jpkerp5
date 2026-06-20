'use client';

/**
 * 클릭하면 즉시 편집 가능한 텍스트 필드 — 트렌드 SaaS 패턴 (Notion · Linear · Airtable).
 *
 *   <InlineTextEdit value={c.notes} onSave={(v) => onUpdate({ ...c, notes: v })} multiline />
 *
 * 동작:
 *   · 평소: read-only 텍스트 (회색 hint 또는 값)
 *   · 클릭: input/textarea 로 전환 + autoFocus
 *   · blur 또는 Enter (single line): 변경됐으면 onSave 호출
 *   · ESC: draft 폐기 + readonly 복귀
 *   · multiline: Ctrl+Enter 로 저장 (Enter 는 줄바꿈)
 *
 * dialog 의 view/edit 모드와 무관 — 항상 직접 편집 가능.
 * 직원이 [수정] 버튼 누르는 단계 생략 → 자주 쓰는 필드 (메모/담당자) 에 적용.
 */

import { useEffect, useRef, useState } from 'react';

export function InlineTextEdit({
  value, onSave, placeholder, multiline, className, style, rows = 4, disabled,
}: {
  value: string | undefined;
  onSave: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  style?: React.CSSProperties;
  rows?: number;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  function commit() {
    setEditing(false);
    if (draft !== (value ?? '')) onSave(draft);
  }

  function cancel() {
    setDraft(value ?? '');
    setEditing(false);
  }

  if (editing && !disabled) {
    const commonProps = {
      ref: inputRef as React.RefObject<never>,
      value: draft,
      autoFocus: true,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          commit();
        }
      },
      placeholder,
      className: className ?? 'input',
      style,
    };

    if (multiline) {
      return <textarea {...commonProps} rows={rows} style={{ width: '100%', fontSize: 12, padding: 8, resize: 'vertical', ...style }} />;
    }
    return <input type="text" {...commonProps} />;
  }

  const hasValue = !!(value && value.trim());
  return (
    <div
      onClick={() => !disabled && setEditing(true)}
      title={disabled ? undefined : '클릭하여 수정'}
      style={{
        cursor: disabled ? 'default' : 'text',
        padding: multiline ? 0 : '4px 0',
        minHeight: multiline ? rows * 18 : undefined,
        fontSize: 12,
        color: hasValue ? 'var(--text-main)' : 'var(--text-weak)',
        whiteSpace: multiline ? 'pre-wrap' : 'nowrap',
        ...style,
      }}
    >
      {hasValue ? value : (placeholder ?? '클릭하여 입력')}
    </div>
  );
}
