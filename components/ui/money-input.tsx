'use client';

/**
 * 금액 입력 — 천원단위 콤마 자동 (1,500,000).
 *
 *   <MoneyInput value={purchasePrice} onChange={(n) => set('purchasePrice', n)} />
 *
 * 표시: 1,500,000
 * 내부 state: 1500000 (number | undefined)
 *
 * 모든 금액 입력 폼에서 동일 규격 사용. lib/utils.ts 의 formatCurrency 와 동일 톤.
 */

import { useState, useEffect } from 'react';

export function MoneyInput({
  value, onChange, placeholder, className = 'input input-compact mono', readonly,
}: {
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  placeholder?: string;
  className?: string;
  readonly?: boolean;
}) {
  const [display, setDisplay] = useState<string>(value != null ? value.toLocaleString('ko-KR') : '');

  // 외부 value 변경 시 표시 동기화 (다른 필드에서 set 한 경우)
  useEffect(() => {
    setDisplay(value != null ? value.toLocaleString('ko-KR') : '');
  }, [value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      className={className}
      value={display}
      placeholder={placeholder ?? '금액'}
      readOnly={readonly}
      onChange={(e) => {
        const raw = e.target.value.replace(/[,\s]/g, '');
        if (raw === '') {
          setDisplay('');
          onChange(undefined);
          return;
        }
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        setDisplay(n.toLocaleString('ko-KR'));
        onChange(n);
      }}
      onBlur={() => {
        // 정규화 — 빈 string 이면 display 도 빈채로
        if (value != null) setDisplay(value.toLocaleString('ko-KR'));
      }}
    />
  );
}
