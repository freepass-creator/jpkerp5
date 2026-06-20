'use client';

/**
 * 클릭하면 DateInput 으로 전환되는 인라인 날짜 편집기.
 *
 *   <InlineDateEdit value={c.returnScheduledDate} onSave={(v) => onUpdate({ ...c, returnScheduledDate: v })} />
 *
 * 평소: 2026-06-20 (YYYY-MM-DD 텍스트)
 * 클릭: DateInput (정규화 + 캘린더 picker)
 */

import { useEffect, useState } from 'react';
import { DateInput } from './date-input';

export function InlineDateEdit({
  value, onSave, placeholder = '-', disabled,
}: {
  value: string | undefined;
  onSave: (v: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  useEffect(() => { setDraft(value ?? ''); }, [value]);

  function commit() {
    setEditing(false);
    if (draft !== (value ?? '')) onSave(draft || undefined);
  }

  if (editing && !disabled) {
    return (
      <div onBlur={commit}>
        <DateInput value={draft} onChange={setDraft} style={{ width: 160 }} />
      </div>
    );
  }

  return (
    <div
      onClick={() => !disabled && setEditing(true)}
      title={disabled ? undefined : '클릭하여 수정'}
      style={{
        cursor: disabled ? 'default' : 'text',
        padding: '4px 0',
        fontSize: 12,
        fontFamily: 'var(--font-mono, monospace)',
        color: value ? 'var(--text-main)' : 'var(--text-weak)',
      }}
    >
      {value || placeholder}
    </div>
  );
}
