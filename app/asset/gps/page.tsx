'use client';

/**
 * /asset/gps — 자산 차량 단위 GPS 설치 현황.
 * 등록자산 row 패턴 + GPS 컬럼.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileXls, MagnifyingGlass, Copy, Trash } from '@phosphor-icons/react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useMergedVehicles } from '@/lib/use-merged-vehicles';
import { useCompanies } from '@/lib/firebase/companies-store';
import { Sidebar } from '@/components/layout/sidebar';
import { EmptyRow } from "@/components/ui/empty-row";
import { PageLoading } from "@/components/ui/page-loading";
import { BottomBar } from '@/components/layout/bottom-bar';
import { NewButton, ExcelButton, DeleteButton, ActionSep } from '@/components/ui/page-actions';
import { AssetTopbar } from '@/components/asset/asset-topbar';
import { StatusBadge } from '@/components/ui/status-badge';
import { vehicleStatusTone } from '@/lib/status-tones';
import { usePersistentState } from '@/lib/use-persistent-state';
import { useRole } from '@/lib/use-role';
import { displayCompanyName } from '@/lib/company-display';
import { CompanyCell } from '@/components/ui/company-cell';
import { matchesCompanyFilter, buildCompanyOptions } from '@/lib/filter-helpers';
import { useTableSelection } from '@/lib/use-table-selection';
import { useRowSelection, useCtrlASelectAll } from '@/lib/use-row-selection';
import { TableHeaderCheckbox, TableRowCheckbox } from '@/components/ui/table-checkbox';
import { exportToExcel } from '@/lib/excel-export';
import { useVehicleDialog } from '@/lib/global-dialogs';

export default function AssetGpsPage() {
  const router = useRouter();
  const { isMaster: master, loading: roleLoading } = useRole();
  useEffect(() => { if (!roleLoading && !master) router.replace('/'); }, [master, roleLoading, router]);

  const { vehicles, loading: vehiclesLoading } = useMergedVehicles();
  const { remove: removeVehicle } = useVehicles();
  const { contracts } = useContracts();
  // 시동제어 상태는 계약(engineDisabled)에 있음 — plate 로 join 해 자산 GPS 화면에 노출(5영역 반영).
  const lockedPlates = useMemo(() => {
    const s = new Set<string>();
    for (const c of contracts) if (c.engineDisabled && c.vehiclePlate) s.add(c.vehiclePlate.trim());
    return s;
  }, [contracts]);
  const { openVehicle } = useVehicleDialog();
  const { companies: companyMaster } = useCompanies();
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = usePersistentState('filter:asset-gps:company', 'all');
  const sel = useTableSelection();
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number; row: { id: string; plate?: string; gpsDeviceId?: string } | null }>({ open: false, x: 0, y: 0, row: null });

  const companyOptions = useMemo(() => buildCompanyOptions(vehicles, (v) => v.company), [vehicles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (!matchesCompanyFilter(v.company, companyFilter)) return false;
      if (q) {
        const hay = `${v.plate ?? ''} ${v.model ?? ''} ${v.gpsProvider ?? ''} ${v.gpsDeviceId ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      // 기본 정렬: 미설치 위 → 설치 (직원 작업 대상 우선)
      const aInst = !!(a.gpsProvider || a.gpsDeviceId);
      const bInst = !!(b.gpsProvider || b.gpsDeviceId);
      if (aInst !== bInst) return aInst ? 1 : -1;
      return (a.plate ?? '').localeCompare(b.plate ?? '');
    });
  }, [vehicles, search, companyFilter]);

  const rowSel = useRowSelection({ ids: filtered.map((v) => v.id), selection: sel });
  useCtrlASelectAll(rowSel, sel);

  if (roleLoading || !master) {
    return <PageLoading />;
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <AssetTopbar
          currentPage="gps"
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="차량번호 / GPS 공급사 / 단말번호"
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
                    <th style={{ width: 120 }}>GPS 공급사</th>
                    <th className="mono" style={{ width: 160 }}>단말번호</th>
                    <th className="center" style={{ width: 80 }}>설치</th>
                    <th className="center" style={{ width: 90 }}>시동제어</th>
                    <th className="center" style={{ width: 80 }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <EmptyRow colSpan={9}>{vehiclesLoading ? '데이터 불러오는 중…' : '등록된 차량 없음'}</EmptyRow>
                  ) : filtered.map((v, idx) => {
                    const installed = !!(v.gpsProvider || v.gpsDeviceId);
                    return (
                      <tr key={v.id} style={{ verticalAlign: 'middle', cursor: 'pointer' }} onMouseDown={rowSel.onRowMouseDown} onClick={(e) => rowSel.onRowClick(e, v.id, idx)} onDoubleClick={() => v.plate && openVehicle(v.plate, 'asset')} onContextMenu={(e) => rowSel.onRowContextMenu(e, v.id, idx, () => setCtxMenu({ open: true, x: e.clientX, y: e.clientY, row: v }))} className={sel.selectedIds.has(v.id) ? 'selected-row' : undefined}>
                        <TableRowCheckbox id={v.id} selection={sel} />
                        <td><CompanyCell raw={v.company} master={companyMaster} /></td>
                        <td className="mono">{v.plate || '-'}</td>
                        <td>{v.vehicleModelLine || v.model || '-'}</td>
                        <td>{v.gpsProvider || <span className="muted">-</span>}</td>
                        <td className="mono dim">{v.gpsDeviceId || '-'}</td>
                        <td className="center">
                          {installed
                            ? <StatusBadge tone="green">설치</StatusBadge>
                            : <StatusBadge tone="gray">미설치</StatusBadge>}
                        </td>
                        <td className="center">
                          {v.plate && lockedPlates.has(v.plate.trim())
                            ? <StatusBadge tone="red">제어중</StatusBadge>
                            : <span className="dim">-</span>}
                        </td>
                        <td className="center"><StatusBadge tone={vehicleStatusTone(v.status)}>{v.status}</StatusBadge></td>
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
              <NewButton label="GPS 등록" onClick={() => {
                const ids = Array.from(sel.selectedIds).filter((id) => !id.startsWith('contract-derived-'));
                if (ids.length !== 1) { toast.info('GPS를 등록/수정할 차량 1대를 목록에서 선택하세요 (행 더블클릭으로도 상세가 열립니다).'); return; }
                const v = filtered.find((x) => x.id === ids[0]);
                if (v?.plate) openVehicle(v.plate, 'asset'); else toast.error('차량번호가 없어 상세를 열 수 없습니다.');
              }} />
              <ActionSep />
              <DeleteButton
                count={sel.size}
                title="선택한 자산 삭제 (감사로그 남음)"
                onClick={async () => {
                  if (sel.size === 0) return;
                  const realIds = Array.from(sel.selectedIds).filter((id) => !id.startsWith('contract-derived-'));
                  if (realIds.length === 0) {
                    toast.info('선택한 자산이 모두 계약 자동 인식 자산 (삭제 불가)');
                    return;
                  }
                  const note = sel.size - realIds.length > 0 ? `\n(자동 인식 ${sel.size - realIds.length}건은 제외됨)` : '';
                  if (!await showConfirm({ title: `선택한 ${realIds.length}건의 자산을 삭제하시겠습니까?${note}`, danger: true })) return;
                  let ok = 0, fail = 0;
                  for (const id of realIds) {
                    try { await removeVehicle(id); ok++; } catch (err) { console.error('vehicle delete failed', id, err); fail++; }
                  }
                  sel.clear();
                  if (fail > 0) toast.error(`${ok}건 삭제, ${fail}건 실패`);
                  else toast.success(`${ok}건 삭제`);
                }}
              />
              <ExcelButton
                count={sel.size > 0 ? sel.size : filtered.length}
                disabled={filtered.length === 0}
                title={sel.size > 0
                  ? `선택한 ${sel.size}건만 엑셀 다운로드 (체크 해제 시 전체 ${filtered.length}건)`
                  : `현재 페이지 목록 (${filtered.length}건) 엑셀 다운로드`}
                onClick={() => {
                  const targetRows = sel.size > 0 ? filtered.filter((v) => sel.selectedIds.has(v.id)) : filtered;
                  const scope = sel.size > 0 ? `선택 ${sel.size}건` : `${filtered.length}건`;
                  exportToExcel({
                    title: `GPS 설치 현황${companyFilter !== 'all' ? ` (${companyFilter})` : ''} — ${scope}`,
                    fileName: `GPS설치${sel.size > 0 ? '-선택' : ''}`,
                    sheetName: 'GPS',
                    rows: targetRows.map((v) => ({
                      회사: v.company ? displayCompanyName(v.company, companyMaster) : '',
                      차량번호: v.plate ?? '',
                      차종: v.model ?? '',
                      상태: v.status ?? '',
                      GPS공급사: v.gpsProvider ?? '',
                      단말번호: v.gpsDeviceId ?? '',
                      설치일: v.gpsInstallUploadedAt?.slice(0, 10) ?? '',
                      시동제어: '',
                    })),
                    columns: [
                      { key: '회사', header: '회사', width: 14 },
                      { key: '차량번호', header: '차량번호', width: 14, type: 'mono' },
                      { key: '차종', header: '차종', width: 20 },
                      { key: '상태', header: '상태', width: 10, type: 'center' },
                      { key: 'GPS공급사', header: 'GPS공급사', width: 14 },
                      { key: '단말번호', header: '단말번호', width: 16, type: 'mono' },
                      { key: '설치일', header: '설치일', width: 14, type: 'date' },
                      { key: '시동제어', header: '시동제어', width: 10, type: 'center' },
                    ],
                  });
                }}
              />
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
            { label: '차량 상세', icon: <MagnifyingGlass size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.plate) openVehicle(ctxMenu.row.plate, 'asset'); }, disabled: !ctxMenu.row?.plate },
            { type: 'separator' },
            { label: '차량번호 복사', icon: <Copy size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.plate) navigator.clipboard.writeText(ctxMenu.row.plate); } },
            { label: '단말번호 복사', icon: <Copy size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.gpsDeviceId) navigator.clipboard.writeText(ctxMenu.row.gpsDeviceId); }, disabled: !ctxMenu.row.gpsDeviceId },
          ] satisfies ContextMenuItem[]) : []}
        />
      </div>
    </div>
  );
}
