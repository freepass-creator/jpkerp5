'use client';

/**
 * 테이블 행 선택 공용 hook — 모든 list 페이지에서 동일 사용.
 *
 * **deps 함정 주의 (2026-06-20 무한루프 사고 후 견고화):**
 *   ❌ useEffect(() => { ... sel.clear() }, [view, sel]);    // sel 통째로 deps = 무한루프
 *   ✅ useEffect(() => { ... clear(); }, [view, clear]);     // stable callback 만
 *
 * 반환 객체 자체는 selectedIds 변경 시 새 ref (의도된 React 변경 감지).
 * 하지만 안의 toggleRow/selectAll/clear/setSelectedIds 는 **stable ref** (useCallback).
 * → destructure 해서 method 만 deps 에 쓰면 안전.
 *
 *   const sel = useTableSelection();
 *   <TableHeaderCheckbox selection={sel} items={filtered} />
 *
 *   // useEffect 에서는:
 *   const { clear } = sel;
 *   useEffect(() => clear(), [view, clear]);  // 또는 deps 에 clear 빼도 OK (stable)
 */

import { useState, useMemo, useCallback } from 'react';

export type TableSelection = {
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleRow: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clear: () => void;
  size: number;
};

export function useTableSelection(): TableSelection {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ─── stable callbacks — deps 없음 (setSelectedIds 는 React 가 stable 보장) ───
  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // 객체 자체는 selectedIds 변경 시 새 ref (React 변경 감지용).
  // method 들은 위 useCallback 으로 stable → 호출자가 destructure 시 안전.
  return useMemo(() => ({
    selectedIds,
    setSelectedIds,
    toggleRow,
    selectAll,
    clear,
    size: selectedIds.size,
  }), [selectedIds, toggleRow, selectAll, clear]);
}
