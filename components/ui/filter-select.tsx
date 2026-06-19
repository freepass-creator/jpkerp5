'use client';

/**
 * FilterSelect — 디자인 시스템에 맞는 custom dropdown.
 *
 * native <select> 의 option 패널은 OS 가 그려서 radius/font/padding 통제 불가.
 * 필터바 (chip 옆) 에서 시각 일치가 깨지는 문제 해결용.
 *
 * 사용:
 *   <FilterSelect
 *     value={v}
 *     onChange={setV}
 *     options={[{ value: 'all', label: '전체' }, ...]}
 *     dataW="md"
 *     title="회사별 필터"
 *   />
 *
 * 키보드: Esc 닫기 / 화살표 위·아래 이동 / Enter 선택 / Space 토글.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CaretDown } from '@phosphor-icons/react';

export type FilterSelectOption = {
  value: string;
  label: ReactNode;
  /** 옵션 그룹화 — 같은 group 라벨끼리 묶임 */
  group?: string;
  /** 추가 표시 (괄호 안 카운트 등) */
  hint?: string;
  disabled?: boolean;
};

export type FilterSelectProps = {
  value: string;
  onChange: (v: string) => void;
  options: FilterSelectOption[];
  /** input-compact data-w 와 동일 — 'sm' | 'md' | 'lg' (기본 'md') */
  dataW?: 'sm' | 'md' | 'lg';
  /** 선택 안 됨 placeholder. value 매칭 option 없을 때 */
  placeholder?: string;
  title?: string;
  disabled?: boolean;
  /** value 가 비었거나 매칭 옵션 없을 때 표시할 라벨 */
  emptyLabel?: string;
};

export function FilterSelect({
  value, onChange, options,
  dataW = 'md', placeholder, title, disabled, emptyLabel,
}: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  const selected = options.find((o) => o.value === value);
  const display = selected?.label ?? emptyLabel ?? placeholder ?? '선택';

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => {
          let next = i + 1;
          while (next < options.length && options[next].disabled) next++;
          return next >= options.length ? i : next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => {
          let next = i - 1;
          while (next >= 0 && options[next].disabled) next--;
          return next < 0 ? i : next;
        });
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const o = options[activeIdx];
        if (o && !o.disabled) {
          onChange(o.value);
          setOpen(false);
          btnRef.current?.focus();
        }
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, options, activeIdx, onChange]);

  // 열릴 때 현재 선택을 활성으로
  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.value === value);
    setActiveIdx(idx >= 0 ? idx : 0);
  }, [open, options, value]);

  // 활성 항목 스크롤
  useEffect(() => {
    if (!open || activeIdx < 0) return;
    const el = panelRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  return (
    <div className="filter-select-wrap">
      <button
        ref={btnRef}
        type="button"
        className="filter-select-btn input-compact"
        data-w={dataW}
        data-open={open ? '' : undefined}
        disabled={disabled}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span className="filter-select-label">{display}</span>
        <CaretDown size={10} weight="bold" className="filter-select-caret" />
      </button>
      {open && (
        <div
          ref={panelRef}
          id={listboxId}
          role="listbox"
          className="filter-select-panel"
        >
          {options.map((o, idx) => {
            const isSelected = o.value === value;
            const isActive = idx === activeIdx;
            const prevGroup = idx > 0 ? options[idx - 1].group : undefined;
            const showGroup = o.group && o.group !== prevGroup;
            return (
              <div key={o.value}>
                {showGroup && (
                  <div className="filter-select-group">{o.group}</div>
                )}
                <button
                  type="button"
                  data-idx={idx}
                  data-selected={isSelected ? '' : undefined}
                  data-active={isActive ? '' : undefined}
                  disabled={o.disabled}
                  className="filter-select-option"
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    btnRef.current?.focus();
                  }}
                  role="option"
                  aria-selected={isSelected}
                >
                  <span className="filter-select-option-label">{o.label}</span>
                  {o.hint && <span className="filter-select-option-hint">{o.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
