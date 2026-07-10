'use client';

/**
 * 필터 바 공용 컴포넌트 — 회사 + 기간 + 검색 통일.
 *
 * 사용:
 *   <CompanyFilter value={...} onChange={...} options={...} master={...} />
 *   <PeriodFilter mode={...} anchor={...} onChange={...} />
 *
 * 모든 list 페이지가 같은 형태로 사용.
 */

import type { Company } from '@/lib/types';
import { displayCompanyName } from '@/lib/company-display';
import { FilterSelect } from './filter-select';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';

/**
 * 회사 dropdown — 전체 옵션 + option list. 모든 list 페이지 공용.
 * - allValue: 전체 옵션의 값 (기본 'all'; 운영현황 등 sentinel '전체' 쓰는 페이지는 override).
 *   matchesCompanyFilter 가 'all'·'전체' 둘 다 통과 처리하므로 어느 쪽이든 안전.
 * - counts: 회사코드 → 건수. 있으면 옵션 옆 (N) 힌트 표기.
 */
export function CompanyFilter({
  value, onChange, options, master, label = '회사', allValue = 'all', counts,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  master: Company[];
  label?: string;
  allValue?: string;
  counts?: Record<string, number>;
}) {
  return (
    <FilterSelect
      value={value}
      onChange={onChange}
      dataW="md"
      title={`${label} 필터`}
      options={[
        { value: allValue, label: `${label}: 전체` },
        ...options.map((co) => ({
          value: co,
          label: displayCompanyName(co, master) || co,
          hint: counts && counts[co] ? `(${counts[co]})` : undefined,
        })),
      ]}
    />
  );
}

export type PeriodMode = 'month' | 'quarter' | 'year';
export type PeriodAnchor = { y: number; m: number };

/** 기간 chip 토글 + ◀ 라벨 ▶ + 당월 — 자금일보·재무 등 기간 필요 페이지 표준 */
export function PeriodFilter({
  mode, anchor, onModeChange, onShift, onCurrent, label,
}: {
  mode: PeriodMode;
  anchor: PeriodAnchor;
  onModeChange: (m: PeriodMode) => void;
  onShift: (delta: number) => void;
  onCurrent: () => void;
  /** 라벨 override — 없으면 자동 (YYYY-MM 또는 YYYY Q?) */
  label?: string;
}) {
  const auto = (() => {
    if (mode === 'year') return `${anchor.y}`;
    if (mode === 'quarter') {
      const q = Math.floor((anchor.m - 1) / 3) + 1;
      return `${anchor.y} Q${q}`;
    }
    return `${anchor.y}-${String(anchor.m).padStart(2, '0')}`;
  })();
  return (
    <>
      <button type="button" className={`chip ${mode === 'month' ? 'active' : ''}`} onClick={() => onModeChange('month')}>월</button>
      <button type="button" className={`chip ${mode === 'quarter' ? 'active' : ''}`} onClick={() => onModeChange('quarter')}>분기</button>
      <button type="button" className={`chip ${mode === 'year' ? 'active' : ''}`} onClick={() => onModeChange('year')}>연</button>
      <span className="filter-divider" />
      <button type="button" className="chip" onClick={() => onShift(-1)} title="이전 기간"><CaretLeft size={11} weight="bold" /></button>
      <strong className="mono" style={{ minWidth: 80, textAlign: 'center', fontSize: 12 }}>{label ?? auto}</strong>
      <button type="button" className="chip" onClick={() => onShift(1)} title="다음 기간"><CaretRight size={11} weight="bold" /></button>
      <button type="button" className="chip" onClick={onCurrent} title="현재 기간으로">당월</button>
    </>
  );
}

/** PeriodAnchor → date in-range 헬퍼 */
export function isInPeriod(yyyymmdd: string, mode: PeriodMode, anchor: PeriodAnchor): boolean {
  if (!yyyymmdd) return false;
  const [yStr, mStr] = yyyymmdd.split('-');
  const y = Number(yStr), m = Number(mStr);
  if (Number.isNaN(y) || Number.isNaN(m)) return false;
  if (mode === 'year') return y === anchor.y;
  if (mode === 'quarter') {
    const qa = Math.floor((anchor.m - 1) / 3);
    const qy = Math.floor((m - 1) / 3);
    return y === anchor.y && qy === qa;
  }
  return y === anchor.y && m === anchor.m;
}

/** PeriodAnchor shift 유틸 */
export function shiftAnchor(anchor: PeriodAnchor, mode: PeriodMode, delta: number): PeriodAnchor {
  const step = mode === 'month' ? 1 : mode === 'quarter' ? 3 : 12;
  const d = new Date(anchor.y, anchor.m - 1 + step * delta, 1);
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

export function currentAnchor(): PeriodAnchor {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}
