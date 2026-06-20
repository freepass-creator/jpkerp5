'use client';

/**
 * 전화번호 입력 — 자동 하이픈 (010-1234-5678 / 02-1234-5678).
 *
 *   <PhoneInput value={phone} onChange={setPhone} />
 *
 * 표시: 010-1234-5678
 * 내부 state: 숫자만 (01012345678) — onChange 에 raw 전달.
 *
 * 입력 트렌드:
 *   · inputMode="tel" — 모바일 숫자 키패드
 *   · placeholder 에 형식 예시
 *   · 자동 하이픈 — 직원이 형식 모르고 숫자만 쳐도 OK
 */

import { useState, useEffect } from 'react';

function formatKrPhone(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (!d) return '';
  // 02 (서울) 8~10자리 / 그 외 (010/031/051/070 등) 9~11자리
  if (d.startsWith('02')) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  // 010 / 011 / 070 / 031 등 3자리 prefix
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}

export function PhoneInput({
  value, onChange, placeholder, className = 'input input-compact mono', readonly,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  readonly?: boolean;
}) {
  const [display, setDisplay] = useState<string>(formatKrPhone(value ?? ''));

  useEffect(() => {
    setDisplay(formatKrPhone(value ?? ''));
  }, [value]);

  return (
    <input
      type="tel"
      inputMode="tel"
      className={className}
      value={display}
      placeholder={placeholder ?? '010-1234-5678'}
      readOnly={readonly}
      maxLength={14}
      onChange={(e) => {
        const formatted = formatKrPhone(e.target.value);
        setDisplay(formatted);
        onChange(formatted);
      }}
    />
  );
}
