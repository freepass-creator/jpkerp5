'use client';

/**
 * 테이블 체크박스 공용 컴포넌트 — 모든 list 페이지에서 동일 규격.
 *
 *   const sel = useTableSelection();
 *   <table>
 *     <thead><tr>
 *       <TableHeaderCheckbox selection={sel} ids={filtered.map(r => r.id)} />
 *       ...
 *     </tr></thead>
 *     <tbody>{filtered.map(r => (
 *       <tr>
 *         <TableRowCheckbox id={r.id} selection={sel} />
 *         ...
 *       </tr>
 *     ))}</tbody>
 *   </table>
 *
 * 시각·동작·접근성 모두 한 곳에서 관리. 페이지마다 다시 짜지 않음.
 */

import type { TableSelection } from '@/lib/use-table-selection';

export function TableHeaderCheckbox({ selection, ids, ariaLabel = '전체 선택' }: {
  selection: TableSelection;
  ids: string[];
  ariaLabel?: string;
}) {
  const all = ids.length > 0 && ids.every((id) => selection.selectedIds.has(id));
  const some = ids.some((id) => selection.selectedIds.has(id));
  return (
    <th className="checkbox-col">
      <input
        type="checkbox"
        checked={all}
        ref={(el) => {
          if (!el) return;
          el.indeterminate = some && !all;
        }}
        onChange={(e) => {
          if (e.target.checked) selection.selectAll(ids);
          else selection.clear();
        }}
        aria-label={ariaLabel}
      />
    </th>
  );
}

export function TableRowCheckbox({ id, selection, ariaLabel = '행 선택' }: {
  id: string;
  selection: TableSelection;
  ariaLabel?: string;
}) {
  return (
    <td className="checkbox-col" onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={selection.selectedIds.has(id)}
        onChange={() => selection.toggleRow(id)}
        aria-label={ariaLabel}
      />
    </td>
  );
}
