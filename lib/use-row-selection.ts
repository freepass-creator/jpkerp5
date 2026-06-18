'use client';

/**
 * 행 선택 공용 hook — rentcar-manager 패턴 포팅 (2026-06-18).
 *
 *   const sel = useTableSelection();
 *   const rowSel = useRowSelection({ ids: filtered.map((r) => r.id), selection: sel });
 *   useCtrlASelectAll(rowSel);
 *
 *   <tr onClick={(e) => rowSel.onRowClick(e, r.id, idx)}
 *       onContextMenu={(e) => rowSel.onRowContextMenu(e, r.id, idx, () => setCtxMenu(...))}
 *       className={sel.selectedIds.has(r.id) ? 'selected-row' : ''}>
 *
 *  동작:
 *   - 평클릭: 단일 선택 (다른 선택 해제 + 그 행만)
 *   - Ctrl/Cmd+클릭: toggle (그 행 추가/제거, 다른 선택 유지)
 *   - Shift+클릭: 마지막 클릭한 행 ~ 현재 행 range 선택 (Excel 스타일)
 *   - 우클릭: 현재 행이 선택 안 됐으면 자동 단일 선택. 이후 ctxMenu 콜백 실행
 *   - Ctrl+A: 보이는 행 전체 선택 (useCtrlASelectAll)
 *
 * 체크박스 컬럼 hide 시대의 대체 패턴 (e7f5468).
 */

import { useCallback, useEffect, useRef } from 'react';
import type { TableSelection } from './use-table-selection';

export type RowSelection = {
  onRowClick: (e: React.MouseEvent, id: string, index: number) => void;
  onRowContextMenu: (
    e: React.MouseEvent,
    id: string,
    index: number,
    showCtxMenu: () => void,
  ) => void;
  ids: string[];
};

export function useRowSelection({
  ids, selection,
}: {
  ids: string[];
  selection: TableSelection;
}): RowSelection {
  const lastIdxRef = useRef<number | null>(null);

  const onRowClick = useCallback((e: React.MouseEvent, id: string, index: number) => {
    if (e.shiftKey && lastIdxRef.current != null) {
      // range select — last 부터 index 까지 토글 없이 add
      const [a, b] = lastIdxRef.current < index
        ? [lastIdxRef.current, index]
        : [index, lastIdxRef.current];
      const next = new Set(selection.selectedIds);
      for (let i = a; i <= b; i++) {
        const rid = ids[i];
        if (rid) next.add(rid);
      }
      selection.setSelectedIds(next);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      selection.toggleRow(id);
      lastIdxRef.current = index;
      return;
    }
    // 평클릭 — 단일 선택 (다른 선택 해제)
    selection.setSelectedIds(new Set([id]));
    lastIdxRef.current = index;
  }, [ids, selection]);

  const onRowContextMenu = useCallback((
    e: React.MouseEvent, id: string, index: number, showCtxMenu: () => void,
  ) => {
    e.preventDefault();
    // 우클릭한 행이 미선택이면 자동 단일 선택 (다른 선택 해제 — rentcar-manager 패턴)
    if (!selection.selectedIds.has(id)) {
      selection.setSelectedIds(new Set([id]));
      lastIdxRef.current = index;
    }
    showCtxMenu();
  }, [selection]);

  return { onRowClick, onRowContextMenu, ids };
}

/** Ctrl/Cmd+A 키보드 단축키 — 보이는 행 전체 선택.
 *  Input/textarea/contenteditable 에 focus 있을 땐 무시 (기본 동작 보장). */
export function useCtrlASelectAll(rowSel: RowSelection, selection: TableSelection): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a') return;
      const tgt = e.target as HTMLElement | null;
      if (!tgt) return;
      const tag = tgt.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tgt.isContentEditable) return;
      // 다이얼로그·모달 안에 있으면 그쪽에 양보
      if (tgt.closest('[role="dialog"]')) return;
      e.preventDefault();
      selection.selectAll(rowSel.ids);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rowSel.ids, selection]);
}
