'use client';

/**
 * /asset/disposal — 자산 차량 단위 처분(매각) 현황.
 * 등록자산 row 패턴 + 매각 상태 컬럼.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileXls, MagnifyingGlass, Copy, Trash } from '@phosphor-icons/react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { syncContractStatusFromVehicle } from '@/lib/entity-sync';
import { toast } from '@/lib/toast';
import type { Vehicle } from '@/lib/types';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { AssetTopbar } from '@/components/asset/asset-topbar';
import { useMergedVehicles } from '@/lib/use-merged-vehicles';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useRole } from '@/lib/use-role';
import { displayCompanyName } from '@/lib/company-display';
import { CompanyCell } from '@/components/ui/company-cell';
import { matchesCompanyFilter, buildCompanyOptions } from '@/lib/filter-helpers';
import { useTableSelection } from '@/lib/use-table-selection';
import { useRowSelection, useCtrlASelectAll } from '@/lib/use-row-selection';
import { TableHeaderCheckbox, TableRowCheckbox } from '@/components/ui/table-checkbox';
import { StatusBadge } from '@/components/ui/status-badge';
import { vehicleStatusTone } from '@/lib/status-tones';
import { usePersistentState } from '@/lib/use-persistent-state';
import { exportToExcel } from '@/lib/excel-export';
import { useVehicleDialog } from '@/lib/global-dialogs';

const DISPOSAL_STATUSES = ['매각검토', '매각대기', '매각'] as const;

export default function AssetDisposalPage() {
  const router = useRouter();
  const { isMaster: master, loading: roleLoading } = useRole();
  useEffect(() => { if (!roleLoading && !master) router.replace('/'); }, [master, roleLoading, router]);

  const { vehicles, loading: vehiclesLoading } = useMergedVehicles();
  const { openVehicle } = useVehicleDialog();
  const { update: updateVehicle, remove: removeVehicle } = useVehicles();
  const { contracts, update: updateContract } = useContracts();
  const { companies: companyMaster } = useCompanies();
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = usePersistentState('filter:asset-disposal:company', 'all');
  const sel = useTableSelection();
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number; row: { id: string; plate?: string; vin?: string } | null }>({ open: false, x: 0, y: 0, row: null });

  const companyOptions = useMemo(() => buildCompanyOptions(vehicles, (v) => v.company), [vehicles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (!DISPOSAL_STATUSES.includes(v.status as typeof DISPOSAL_STATUSES[number])) return false;
      if (!matchesCompanyFilter(v.company, companyFilter)) return false;
      if (q) {
        const hay = `${v.plate ?? ''} ${v.model ?? ''} ${v.vin ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      // 매각검토 → 매각대기 → 매각 순
      const rank = (s: string) => DISPOSAL_STATUSES.indexOf(s as typeof DISPOSAL_STATUSES[number]);
      const r = rank(a.status) - rank(b.status);
      if (r !== 0) return r;
      return (a.plate ?? '').localeCompare(b.plate ?? '');
    });
  }, [vehicles, search, companyFilter]);

  const rowSel = useRowSelection({ ids: filtered.map((v) => v.id), selection: sel });
  useCtrlASelectAll(rowSel, sel);

  if (roleLoading || !master) {
    return <div className="layout"><Sidebar /><div className="app"><div style={{ padding: 40, fontSize: 12, color: 'var(--text-weak)' }}>로딩 중…</div></div></div>;
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <AssetTopbar
          currentPage="disposal"
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="차량번호 / 차종 / VIN"
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
                    <th className="mono" style={{ width: 90 }}>제작연월</th>
                    <th className="num" style={{ width: 120 }}>매입가</th>
                    <th className="center" style={{ width: 90 }}>처분상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={7} className="muted center" style={{ padding: 32 }}>{vehiclesLoading ? '데이터 불러오는 중…' : '처분 대상 차량 없음'}</td></tr>
                  ) : filtered.map((v, idx) => (
                    <tr key={v.id} style={{ verticalAlign: 'middle', cursor: 'pointer' }} onClick={(e) => rowSel.onRowClick(e, v.id, idx)} onDoubleClick={() => v.plate && openVehicle(v.plate, 'asset')} onContextMenu={(e) => rowSel.onRowContextMenu(e, v.id, idx, () => setCtxMenu({ open: true, x: e.clientX, y: e.clientY, row: v }))} className={sel.selectedIds.has(v.id) ? 'selected-row' : undefined}>
                      <TableRowCheckbox id={v.id} selection={sel} />
                      <td><CompanyCell raw={v.company} master={companyMaster} /></td>
                      <td className="mono">{v.plate || '-'}</td>
                      <td>{v.vehicleModelLine || v.model || '-'}</td>
                      <td className="mono dim">{v.manufacturedDate?.slice(0, 7) || '-'}</td>
                      <td className="num mono">{v.purchasePrice ? `₩${v.purchasePrice.toLocaleString()}` : '-'}</td>
                      <td className="center"><StatusBadge tone={vehicleStatusTone(v.status)}>{v.status}</StatusBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <BottomBar
          left={
            <>
              <button className="btn btn-primary" type="button"><Plus size={14} weight="bold" /> 처분 등록</button>
              <span className="btn-sep" />
              {/* 일괄 다음 단계 — 매각검토 → 매각대기 → 매각 progression */}
              <select
                className="input input-compact"
                disabled={sel.size === 0}
                value=""
                title={sel.size === 0 ? '체크박스로 자산 선택 후 일괄 다음 단계' : `선택 ${sel.size}건 → 일괄 상태 변경`}
                style={{ fontSize: 12, minWidth: 130 }}
                onChange={async (e) => {
                  const next = e.target.value as Vehicle['status'];
                  e.currentTarget.value = '';
                  if (!next || sel.size === 0) return;
                  const targets = vehicles.filter((v) => sel.selectedIds.has(v.id) && !v.id.startsWith('contract-derived-'));
                  const synthetic = sel.size - targets.length;
                  if (targets.length === 0) {
                    toast.info('선택된 자산 중 처리 가능한 자산 없음 (계약 자동 인식 자산 제외)');
                    return;
                  }
                  const note = synthetic > 0 ? `\n(자동 인식 ${synthetic}건은 제외됨)` : '';
                  if (!confirm(`선택한 ${targets.length}건의 자산 상태를 '${next}' 로 변경합니다.\n같은 plate 활성 계약 vehicleStatus 도 sync 됩니다.${note}\n계속?`)) return;
                  let changed = 0, syncedContracts = 0;
                  const todayIso = new Date().toISOString().slice(0, 10);
                  for (const v of targets) {
                    if (v.status === next) continue;
                    // 매각 status 전환 시 saleDate 자동 set (자산대장 처분손익 계산용)
                    const saleDate = next === '매각' && !v.saleDate ? todayIso : v.saleDate;
                    const merged = { ...v, status: next, saleDate };
                    try {
                      await updateVehicle(merged);
                      changed++;
                      const r = await syncContractStatusFromVehicle(merged, contracts, updateContract);
                      syncedContracts += r.updatedCount;
                    } catch (err) { console.error('disposal bulk failed', v.id, err); }
                  }
                  toast.success(`${changed}대 → ${next}${syncedContracts > 0 ? ` · 계약 ${syncedContracts}건 sync` : ''}`);
                  sel.clear();
                }}
              >
                <option value="">선택 상태 변경…</option>
                <option value="매각검토">매각검토</option>
                <option value="매각대기">매각대기 (다음 단계)</option>
                <option value="매각">매각 완료</option>
                <option value="휴차대기">↩ 휴차대기로 복귀</option>
              </select>
              <button
                className="btn"
                type="button"
                disabled={sel.size === 0}
                title="체크박스로 선택한 자산 일괄 삭제 (감사로그 남음)"
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
                  const targetRows = sel.size > 0 ? filtered.filter((v) => sel.selectedIds.has(v.id)) : filtered;
                  const scope = sel.size > 0 ? `선택 ${sel.size}건` : `${filtered.length}건`;
                  exportToExcel({
                    title: `처분 자산${companyFilter !== 'all' ? ` (${companyFilter})` : ''} — ${scope}`,
                    fileName: `처분자산${sel.size > 0 ? '-선택' : ''}`,
                    sheetName: '처분',
                    rows: targetRows.map((v) => ({
                      회사: v.company ? displayCompanyName(v.company, companyMaster) : '',
                      차량번호: v.plate ?? '',
                      차종: v.model ?? '',
                      VIN: v.vin ?? '',
                      제작연월: v.manufacturedDate ?? '',
                      매입가: v.purchasePrice ?? '',
                      상태: v.status ?? '',
                      매각예상가: '',
                      매각일: v.disposalCertUploadedAt?.slice(0, 10) ?? '',
                    })),
                    columns: [
                      { key: '회사', header: '회사', width: 14 },
                      { key: '차량번호', header: '차량번호', width: 14, type: 'mono' },
                      { key: '차종', header: '차종', width: 20 },
                      { key: 'VIN', header: 'VIN', width: 18, type: 'mono' },
                      { key: '제작연월', header: '제작연월', width: 12, type: 'mono' },
                      { key: '매입가', header: '매입가', width: 14, type: 'number' },
                      { key: '상태', header: '상태', width: 12, type: 'center' },
                      { key: '매각예상가', header: '매각예상가', width: 14, type: 'number' },
                      { key: '매각일', header: '매각일', width: 14, type: 'date' },
                    ],
                  });
                }}
              >
                <FileXls size={14} weight="bold" /> 엑셀 <span className="chip-count">{filtered.length}</span>
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
            { label: '차량 상세', icon: <MagnifyingGlass size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.plate) openVehicle(ctxMenu.row.plate, 'asset'); }, disabled: !ctxMenu.row?.plate },
            { type: 'separator' },
            { label: '차량번호 복사', icon: <Copy size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.plate) navigator.clipboard.writeText(ctxMenu.row.plate); } },
            { label: 'VIN 복사', icon: <Copy size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.vin) navigator.clipboard.writeText(ctxMenu.row.vin); }, disabled: !ctxMenu.row.vin },
          ] satisfies ContextMenuItem[]) : []}
        />
      </div>
    </div>
  );
}
