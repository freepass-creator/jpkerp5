'use client';

/**
 * 테이블 행 선택 공용 hook — 모든 list 페이지에서 동일 사용.
 *
 *   const sel = useTableSelection(filtered);
 *   <TableHeaderCheckbox selection={sel} items={filtered} />
 *   ...
 *   <TableRowCheckbox id={row.id} selection={sel} />
 *
 * 필터/뷰 변경 시 선택 자동 해제는 useEffect 로 호출 측에서 sel.clear() 호출.
 */

import { useState, useMemo } from 'react';

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

  return useMemo(() => ({
    selectedIds,
    setSelectedIds,
    toggleRow: (id: string) => setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    }),
    selectAll: (ids: string[]) => setSelectedIds(new Set(ids)),
    clear: () => setSelectedIds(new Set()),
    size: selectedIds.size,
  }), [selectedIds]);
}
