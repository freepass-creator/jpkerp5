'use client';

/**
 * 유연한 날짜 입력칸.
 *
 * <input type="date"> 가 YYYY-MM-DD 만 허용해서 사용자가 "260520", "26.5.20",
 * "2026/5/20" 같이 익숙한 표기를 못 쓰는 문제 해소.
 *
 * - 보일 때는 text input — 사용자가 자유롭게 입력
 * - blur 또는 Enter 시 normalizeKoreanDate 로 정규화 → 정상 파싱되면 YYYY-MM-DD 로 갱신
 * - 정규화 실패 시 입력값 그대로 두고 빨간 테두리 (사용자가 고치도록)
 * - 캘린더 picker 도 옆에 같이 노출 (네이티브 date input 작은 버전)
 *
 * onChange 는 항상 YYYY-MM-DD 로 콜백. 정규화 안 된 raw 값은 외부로 흘리지 않음.
 *
 *   <DateInput value={contractDate} onChange={setContractDate} required />
 *
 * 받아주는 포맷: yyyy-mm-dd / yy-mm-dd / yyyymmdd / yymmdd / yyyy.mm.dd / yyyy/mm/dd /
 *               yyyy년 mm월 dd일 / 엑셀 직렬 / Date 객체
 */

import { useState, useEffect } from 'react';
import { normalizeKoreanDate } from '@/lib/parsers/date';

type Props = {
  value: string;                   // ISO YYYY-MM-DD or ''
  onChange: (iso: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** 칼렌더 picker 버튼 표시 (기본 true) */
  showPicker?: boolean;
};

export function DateInput({
  value, onChange, placeholder = '예: 2026-05-20 / 260520 / 26.5.20',
  required, disabled, className = 'input', style, showPicker = true,
}: Props) {
  const [text, setText] = useState(value);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(value);
    setInvalid(false);
  }, [value]);

  function commit() {
    const t = text.trim();
    if (!t) {
      setInvalid(false);
      if (value !== '') onChange('');
      return;
    }
    const iso = normalizeKoreanDate(t);
    if (iso) {
      setInvalid(false);
      setText(iso);
      if (iso !== value) onChange(iso);
    } else {
      setInvalid(true);
    }
  }

  const wrapStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, ...style };

  return (
    <span style={wrapStyle}>
      <input
        type="text"
        inputMode="numeric"
        className={className}
        value={text}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
          }
        }}
        style={{
          width: '100%',
          minWidth: 0,
          borderColor: invalid ? 'var(--red-text)' : undefined,
          color: invalid ? 'var(--red-text)' : undefined,
        }}
        title={invalid ? '날짜 형식을 인식할 수 없습니다 — 예: 2026-05-20 / 260520 / 26.5.20' : undefined}
      />
      {showPicker && (
        <input
          type="date"
          aria-label="날짜 선택"
          value={normalizeKoreanDate(text) || ''}
          onChange={(e) => {
            const iso = e.target.value;
            setText(iso);
            setInvalid(false);
            if (iso !== value) onChange(iso);
          }}
          disabled={disabled}
          style={{
            width: 18,
            padding: 0,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-weak)',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        />
      )}
    </span>
  );
}
