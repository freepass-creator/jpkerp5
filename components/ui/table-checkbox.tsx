'use client';

/**
 * 테이블 선택 공용 — 체크박스 컬럼은 시각적으로 표시 X (사용자 정책 2026-06-17).
 *
 * 사용자 요청: 체크박스가 UI 를 어지럽힘 + 자주 안 씀 → 컬럼 자체 hide.
 * 대신 일괄 작업이 필요할 때 SelectionToolbar 로 "전체 선택 / 선택 해제 / N건" 만 노출.
 *
 * - 페이지 코드 변경 없이 모든 list 에서 체크박스 컬럼 즉시 사라짐 (return null).
 * - selection state 자체는 유지 → 일괄 처리 버튼 + Shift/Ctrl+click 같은 옵션 가능.
 * - 행 클릭으로 토글 원할 때는 페이지에서 onClick 핸들러에 Ctrl/Cmd 키 분기 직접 추가.
 */

import type { TableSelection } from '@/lib/use-table-selection';

export function TableHeaderCheckbox(_: {
  selection: TableSelection;
  ids: string[];
  ariaLabel?: string;
}) {
  return null;
}

export function TableRowCheckbox(_: {
  id: string;
  selection: TableSelection;
  ariaLabel?: string;
}) {
  return null;
}

/** 일괄 작업 토글 모음 — 토픽바·필터바·푸터 어디든 삽입.
 *  N건 선택됐을 때만 [전체 선택][해제] 노출 (간섭 최소화). */
export function SelectionToolbar({
  selection, ids, hideIfEmpty = true, compact = true,
}: {
  selection: TableSelection;
  ids: string[];
  /** 아무것도 선택 안 됐을 때 숨김 (default true). false 면 항상 노출 */
  hideIfEmpty?: boolean;
  compact?: boolean;
}) {
  const n = selection.size;
  if (hideIfEmpty && n === 0) return null;
  const allSelected = ids.length > 0 && ids.every((id) => selection.selectedIds.has(id));
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: compact ? 4 : 8,
      fontSize: 11, color: 'var(--text-sub)',
    }}>
      <span style={{ fontWeight: 600 }}>{n}건 선택</span>
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => allSelected ? selection.clear() : selection.selectAll(ids)}
        title={allSelected ? '전체 선택 해제' : '보이는 행 모두 선택'}
      >
        {allSelected ? '전체 해제' : '전체 선택'}
      </button>
      {n > 0 && (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => selection.clear()}
          title="선택 해제"
        >
          해제
        </button>
      )}
    </div>
  );
}
