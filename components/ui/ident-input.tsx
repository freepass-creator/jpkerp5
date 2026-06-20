'use client';

/**
 * 식별번호 입력 — 주민번호 또는 사업자번호 자동 포맷.
 *
 *   <IdentInput value={ident} onChange={setIdent} kind="개인" />
 *
 * 표시:
 *   개인 (13자리): 230115-1234567 (앞 6 + 뒤 7)
 *   사업자 (10자리): 123-45-67890 (3 + 2 + 5)
 *   자동 판별 (kind 미명시): 자리 수로 추측
 *
 * 입력 트렌드:
 *   · 형식 예시 placeholder
 *   · 직원이 숫자만 쳐도 자동 하이픈
 *   · inputMode="numeric"
 */

import { useState, useEffect } from 'react';

export type IdentKind = '개인' | '사업자' | 'auto';

function formatIdent(digits: string, kind: IdentKind): string {
  const d = digits.replace(/\D/g, '');
  if (!d) return '';
  const len = d.length;
  // 사업자 (10자리)
  if (kind === '사업자' || (kind === 'auto' && len <= 10 && len !== 6)) {
    if (len <= 3) return d;
    if (len <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5, 10)}`;
  }
  // 개인 주민번호 (13자리)
  if (len <= 6) return d;
  return `${d.slice(0, 6)}-${d.slice(6, 13)}`;
}

export function IdentInput({
  value, onChange, kind = 'auto', placeholder, className = 'input input-compact mono', readonly,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  kind?: IdentKind;
  placeholder?: string;
  className?: string;
  readonly?: boolean;
}) {
  const [display, setDisplay] = useState<string>(formatIdent(value ?? '', kind));

  useEffect(() => {
    setDisplay(formatIdent(value ?? '', kind));
  }, [value, kind]);

  return (
    <input
      type="text"
      inputMode="numeric"
      className={className}
      value={display}
      placeholder={placeholder ?? (kind === '사업자' ? '123-45-67890' : '230115-1234567')}
      readOnly={readonly}
      maxLength={kind === '사업자' ? 12 : 14}
      onChange={(e) => {
        const formatted = formatIdent(e.target.value, kind);
        setDisplay(formatted);
        onChange(formatted);
      }}
    />
  );
}
