'use client';

/**
 * /asset/repair — 자산 차량 단위 수선 현황.
 * 등록자산 row 패턴 + 정비 누적 컬럼 (최근 정비일·누적 비용·횟수·최근 항목).
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileXls, MagnifyingGlass, Copy, ArrowSquareOut, Trash } from '@phosphor-icons/react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { toast } from '@/lib/toast';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { useMergedVehicles } from '@/lib/use-merged-vehicles';
import { useCompanies } from '@/lib/firebase/companies-store';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { AssetTopbar } from '@/components/asset/asset-topbar';
import { useRole } from '@/lib/use-role';
import { displayCompanyName } from '@/lib/company-display';
import { matchesCompanyFilter, buildCompanyOptions } from '@/lib/filter-helpers';
import { useTableSelection } from '@/lib/use-table-selection';
import { TableHeaderCheckbox, TableRowCheckbox } from '@/components/ui/table-checkbox';
import { usePersistentState } from '@/lib/use-persistent-state';
import { exportToExcel } from '@/lib/excel-export';
import { useVehicleDialog } from '@/lib/global-dialogs';

export default function RepairPage() {
  const router = useRouter();
  const { isMaster: master, loading: roleLoading } = useRole();
  useEffect(() => { if (!roleLoading && !master) router.replace('/'); }, [master, roleLoading, router]);

  const { entries: history } = useHistoryEntries();
  const { vehicles, loading: vehiclesLoading } = useMergedVehicles();
  const { remove: removeVehicle } = useVehicles();
  const { openVehicle } = useVehicleDialog();
  const { companies: companyMaster } = useCompanies();
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = usePersistentState('filter:asset-repair:company', 'all');
  const sel = useTableSelection();
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number; row: { id: string; plate?: string } | null }>({ open: false, x: 0, y: 0, row: null });

  /** 차량 plate → 정비/부품교체 이력 집계 */
  const repairByPlate = useMemo(() => {
    const m = new Map<string, { count: number; totalCost: number; lastDate: string; lastTitle: string; lastVendor: string }>();
    for (const h of history) {
      if (h.scope !== 'vehicle') continue;
      if (h.category !== '정비' && h.category !== '부품교체') continue;
      const key = (h.vehiclePlate ?? '').replace(/\s/g, '');
      if (!key) continue;
      const cur = m.get(key) ?? { count: 0, totalCost: 0, lastDate: '', lastTitle: '', lastVendor: '' };
      cur.count += 1;
      cur.totalCost += (h.cost ?? 0);
      if ((h.date ?? '') > cur.lastDate) {
        cur.lastDate = h.date ?? '';
        cur.lastTitle = h.title ?? '';
        cur.lastVendor = h.vendor ?? '';
      }
      m.set(key, cur);
    }
    return m;
  }, [history]);

  const companyOptions = useMemo(() => buildCompanyOptions(vehicles, (v) => v.company), [vehicles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (!matchesCompanyFilter(v.company, companyFilter)) return false;
      if (q) {
        const r = v.plate ? repairByPlate.get(v.plate.replace(/\s/g, '')) : undefined;
        const hay = `${v.plate ?? ''} ${v.model ?? ''} ${r?.lastTitle ?? ''} ${r?.lastVendor ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      // 기본 정렬: 최근 정비일 desc (최근 작업 위)
      const aDate = a.plate ? repairByPlate.get(a.plate.replace(/\s/g, ''))?.lastDate ?? '' : '';
      const bDate = b.plate ? repairByPlate.get(b.plate.replace(/\s/g, ''))?.lastDate ?? '' : '';
      if (aDate !== bDate) return bDate.localeCompare(aDate);
      return (a.plate ?? '').localeCompare(b.plate ?? '');
    });
  }, [vehicles, search, companyFilter, repairByPlate]);

  if (roleLoading || !master) {
    return <div className="layout"><Sidebar /><div className="app"><div style={{ padding: 40, fontSize: 12, color: 'var(--text-weak)' }}>로딩 중…</div></div></div>;
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <AssetTopbar
          currentPage="repair"
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="차량번호 / 차종 / 정비 내용 / 업체"
          companyFilter={companyFilter}
          onCompanyFilterChange={setCompanyFilter}
          companyOptions={companyOptions}
          companyMaster={companyMaster}
        />

        <div className="dashboard" style={{ gridTemplateColumns: '1fr' }}>
          <div className="panel">
            <div className="panel-body">
              <table className="table">
                <thead>
                  <tr>
                    <TableHeaderCheckbox selection={sel} ids={filtered.map((v) => v.id)} />
                    <th style={{ width: 56 }}>회사</th>
                    <th style={{ width: 96 }}>차량번호</th>
                    <th style={{ width: 130 }}>차종</th>
                    <th className="mono" style={{ width: 100 }}>최근 정비일</th>
                    <th>최근 정비 항목</th>
                    <th style={{ width: 130 }}>최근 업체</th>
                    <th className="num" style={{ width: 70 }}>정비 횟수</th>
                    <th className="num" style={{ width: 120 }}>누적 비용</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={9} className="muted center" style={{ padding: 32 }}>{vehiclesLoading ? '데이터 불러오는 중…' : '등록된 차량 없음'}</td></tr>
                  ) : filtered.map((v) => {
                    const r = v.plate ? repairByPlate.get(v.plate.replace(/\s/g, '')) : undefined;
                    return (
                      <tr
                        key={v.id}
                        style={{ verticalAlign: 'middle', cursor: 'pointer' }}
                        onDoubleClick={() => v.plate && openVehicle(v.plate, 'asset')}
                        onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ open: true, x: e.clientX, y: e.clientY, row: v }); }}
                        className={sel.selectedIds.has(v.id) ? 'selected-row' : undefined}
                      >
                        <TableRowCheckbox id={v.id} selection={sel} />
                        <td>{v.company ? displayCompanyName(v.company, companyMaster) : '-'}</td>
                        <td className="mono">{v.plate || '-'}</td>
                        <td>{v.vehicleModelLine || v.model || '-'}</td>
                        <td className="mono dim">{r?.lastDate || <span className="muted">-</span>}</td>
                        <td>{r?.lastTitle || <span className="muted">-</span>}</td>
                        <td className="dim">{r?.lastVendor || '-'}</td>
                        <td className="num mono">{r?.count ?? 0}</td>
                        <td className="num mono">{r?.totalCost ? `₩${r.totalCost.toLocaleString()}` : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <BottomBar
          left={
            <>
              <button className="btn btn-primary" type="button"><Plus size={14} weight="bold" /> 정비 등록</button>
              <span className="btn-sep" />
              <button
                className="btn"
                type="button"
                disabled={sel.size === 0}
                title="선택한 자산 삭제 (감사로그 남음)"
                style={{ color: sel.size > 0 ? 'var(--red-text)' : undefined }}
                onClick={async () => {
                  if (sel.size === 0) return;
                  const realIds = Array.from(sel.selectedIds).filter((id) => !id.startsWith('contract-derived-'));
                  if (realIds.length === 0) {
                    toast.info('선택한 자산이 모두 계약 자동 인식 자산 (삭제 불가)');
                    return;
                  }
                  const note = sel.size - realIds.length > 0 ? `\n(자동 인식 ${sel.size - realIds.length}건은 제외됨)` : '';
                  if (!confirm(`선택한 ${realIds.length}건의 자산을 삭제하시겠습니까?${note}`)) return;
                  for (const id of realIds) {
                    try { await removeVehicle(id); } catch (err) { console.error('vehicle delete failed', id, err); }
                  }
                  sel.clear();
                }}
              >
                <Trash size={14} weight="bold" /> 선택 {sel.size}건 삭제
              </button>
              <button
                className="btn"
                type="button"
                disabled={filtered.length === 0}
                title={sel.size > 0
                  ? `선택한 ${sel.size}건만 엑셀 다운로드 (체크 해제 시 전체 ${filtered.length}건)`
                  : `현재 페이지 목록 (${filtered.length}건) 엑셀 다운로드`}
                onClick={() => {
                  const targetVehicles = sel.size > 0 ? filtered.filter((v) => sel.selectedIds.has(v.id)) : filtered;
                  const scope = sel.size > 0 ? `선택 ${sel.size}건` : `${filtered.length}건`;
                  const rows = targetVehicles.map((v) => {
                    const r = v.plate ? repairByPlate.get(v.plate.replace(/\s/g, '')) : undefined;
                    return {
                      회사: v.company ? displayCompanyName(v.company, companyMaster) : '',
                      차량번호: v.plate ?? '',
                      차종: v.model ?? '',
                      정비횟수: r?.count ?? 0,
                      누적비용: r?.totalCost ?? 0,
                      최근정비일: r?.lastDate ?? '',
                      최근항목: r?.lastTitle ?? '',
                      업체: r?.lastVendor ?? '',
                    };
                  });
                  exportToExcel({
                    title: `수선 내역${companyFilter !== 'all' ? ` (${companyFilter})` : ''} — ${scope}`,
                    fileName: `수선내역${sel.size > 0 ? '-선택' : ''}`,
                    sheetName: '수선',
                    rows,
                    columns: [
                      { key: '회사', header: '회사', width: 14 },
                      { key: '차량번호', header: '차량번호', width: 14, type: 'mono' },
                      { key: '차종', header: '차종', width: 20 },
                      { key: '정비횟수', header: '정비횟수', width: 10, type: 'number' },
                      { key: '누적비용', header: '누적비용', width: 14, type: 'number' },
                      { key: '최근정비일', header: '최근정비일', width: 14, type: 'date' },
                      { key: '최근항목', header: '최근항목', width: 20 },
                      { key: '업체', header: '업체', width: 18 },
                    ],
                  });
                }}
              >
                <FileXls size={14} weight="bold" /> 엑셀 <span className="chip-count">{sel.size > 0 ? sel.size : filtered.length}</span>
              </button>
            </>
          }
          right={null}
        />
        <ContextMenu
          open={ctxMenu.open}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu({ open: false, x: 0, y: 0, row: null })}
          items={ctxMenu.row ? ([
            { label: '자산 상세 보기', icon: <MagnifyingGlass size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.plate) router.push(`/asset?q=${encodeURIComponent(ctxMenu.row.plate)}`); } },
            { type: 'separator' },
            { label: '차량번호 복사', icon: <Copy size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.plate) navigator.clipboard.writeText(ctxMenu.row.plate); } },
            { type: 'separator' },
            { label: '계약 이력', icon: <ArrowSquareOut size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.plate) router.push(`/contract?q=${encodeURIComponent(ctxMenu.row.plate)}`); } },
          ] satisfies ContextMenuItem[]) : []}
        />
      </div>
    </div>
  );
}
