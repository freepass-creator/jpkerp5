'use client';

/**
 * 클릭하면 PhoneInput 으로 전환되는 인라인 편집기.
 *
 *   <InlinePhoneEdit value={c.customerPhone1} onSave={(v) => onUpdate({ ...c, customerPhone1: v })} />
 *
 * 평소: 010-1234-5678 (포맷된 텍스트)
 * 클릭: PhoneInput + autofocus + blur 저장
 */

import { useEffect, useState } from 'react';
import { PhoneInput } from './phone-input';

function formatKr(d: string): string {
  const x = (d ?? '').replace(/\D/g, '');
  if (!x) return '';
  if (x.startsWith('02')) {
    if (x.length <= 2) return x;
    if (x.length <= 5) return `${x.slice(0, 2)}-${x.slice(2)}`;
    if (x.length <= 9) return `${x.slice(0, 2)}-${x.slice(2, 5)}-${x.slice(5)}`;
    return `${x.slice(0, 2)}-${x.slice(2, 6)}-${x.slice(6, 10)}`;
  }
  if (x.length <= 3) return x;
  if (x.length <= 7) return `${x.slice(0, 3)}-${x.slice(3)}`;
  if (x.length <= 10) return `${x.slice(0, 3)}-${x.slice(3, 6)}-${x.slice(6)}`;
  return `${x.slice(0, 3)}-${x.slice(3, 7)}-${x.slice(7, 11)}`;
}

export function InlinePhoneEdit({
  value, onSave, placeholder = '-', disabled,
}: {
  value: string | undefined;
  onSave: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  useEffect(() => { setDraft(value ?? ''); }, [value]);

  function commit() {
    setEditing(false);
    if (draft !== (value ?? '')) onSave(draft);
  }

  if (editing && !disabled) {
    // blur 시 commit — PhoneInput 자체엔 onBlur 가 없어 편집 div 로 감싸야 저장·종료됨
    // (기존엔 onBlur 가 표시용 div 에만 있어 편집모드에서 저장도 탈출도 안 됐음. InlineDateEdit 동일 패턴)
    return (
      <div onBlur={commit}>
        <PhoneInput
          value={draft}
          onChange={setDraft}
          className="input input-compact mono"
        />
      </div>
    );
  }

  const display = formatKr(value ?? '');
  return (
    <div
      onClick={() => !disabled && setEditing(true)}
      title={disabled ? undefined : '클릭하여 수정'}
      style={{
        cursor: disabled ? 'default' : 'text',
        padding: '4px 0',
        fontSize: 12,
        fontFamily: 'var(--font-mono, monospace)',
        color: display ? 'var(--text-main)' : 'var(--text-weak)',
      }}
    >
      {display || placeholder}
    </div>
  );
}
