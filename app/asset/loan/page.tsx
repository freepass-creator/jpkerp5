'use client';

/**
 * /asset/loan — 자산 차량 단위 할부 현황 list.
 * 등록자산 view 동일 row 패턴 + 할부 컬럼.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileXls, MagnifyingGlass, Copy } from '@phosphor-icons/react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
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

export default function AssetLoanPage() {
  const router = useRouter();
  const { isMaster: master, loading: roleLoading } = useRole();
  useEffect(() => { if (!roleLoading && !master) router.replace('/'); }, [master, roleLoading, router]);

  const { vehicles } = useMergedVehicles();
  const { companies: companyMaster } = useCompanies();
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = usePersistentState('filter:asset-loan:company', 'all');
  const sel = useTableSelection();
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number; row: { id: string; plate?: string; loanCompany?: string } | null }>({ open: false, x: 0, y: 0, row: null });

  const companyOptions = useMemo(() => buildCompanyOptions(vehicles, (v) => v.company), [vehicles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (!matchesCompanyFilter(v.company, companyFilter)) return false;
      if (q) {
        const hay = `${v.plate ?? ''} ${v.model ?? ''} ${v.loanCompany ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      // 기본 정렬: 잔여 원금 큰 순 (관리 우선순위)
      const aRem = a.loanRemainingPrincipal ?? 0;
      const bRem = b.loanRemainingPrincipal ?? 0;
      if (aRem !== bRem) return bRem - aRem;
      return (a.plate ?? '').localeCompare(b.plate ?? '');
    });
  }, [vehicles, search, companyFilter]);

  if (roleLoading || !master) {
    return <div className="layout"><Sidebar /><div className="app"><div style={{ padding: 40, fontSize: 12, color: 'var(--text-weak)' }}>로딩 중…</div></div></div>;
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <AssetTopbar
          currentPage="loan"
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="차량번호 / 차종 / 할부사"
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
                    <th style={{ width: 120 }}>할부사</th>
                    <th className="mono" style={{ width: 100 }}>개시일</th>
                    <th className="num" style={{ width: 80 }}>할부개월</th>
                    <th className="num" style={{ width: 130 }}>잔여원금</th>
                    <th className="num" style={{ width: 110 }}>매입가</th>
                    <th className="center" style={{ width: 80 }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={10} className="muted center" style={{ padding: 32 }}>등록된 차량 없음</td></tr>
                  ) : filtered.map((v) => (
                    <tr key={v.id} style={{ verticalAlign: 'middle', cursor: 'pointer' }} onDoubleClick={() => router.push(`/asset?view=registered&plate=${encodeURIComponent(v.plate ?? '')}`)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ open: true, x: e.clientX, y: e.clientY, row: v }); }} className={sel.selectedIds.has(v.id) ? 'selected-row' : undefined}>
                      <TableRowCheckbox id={v.id} selection={sel} />
                      <td>{v.company ? displayCompanyName(v.company, companyMaster) : '-'}</td>
                      <td className="mono">{v.plate || '-'}</td>
                      <td>{v.vehicleModelLine || v.model || '-'}</td>
                      <td>{v.loanCompany || <span className="muted">-</span>}</td>
                      <td className="mono dim">{v.loanStartDate || '-'}</td>
                      <td className="num mono">{v.loanMonths ? `${v.loanMonths}` : '-'}</td>
                      <td className="num mono">{v.loanRemainingPrincipal ? `₩${v.loanRemainingPrincipal.toLocaleString()}` : '-'}</td>
                      <td className="num mono dim">{v.purchasePrice ? `₩${v.purchasePrice.toLocaleString()}` : '-'}</td>
                      <td className="center dim">{v.loanCompany ? '진행중' : <span className="muted">-</span>}</td>
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
              <button className="btn btn-primary" type="button"><Plus size={14} weight="bold" /> 할부 등록</button>
              <span className="btn-sep" />
              <button
                className="btn"
                type="button"
                disabled={filtered.length === 0}
                title={`현재 페이지 목록 (${filtered.length}건) 엑셀 다운로드`}
                onClick={() => {
                  exportToExcel({
                    title: `구매방식 (할부) 현황${companyFilter !== 'all' ? ` (${companyFilter})` : ''}`,
                    fileName: '구매방식',
                    sheetName: '할부',
                    rows: filtered.map((v) => ({
                      회사: v.company ? displayCompanyName(v.company, companyMaster) : '',
                      차량번호: v.plate ?? '',
                      차종: v.model ?? '',
                      할부사: v.loanLender ?? '',
                      개시일: v.loanStartDate ?? '',
                      할부개월: v.loanMonths ?? '',
                      매입가: v.purchasePrice ?? '',
                      잔여원금: v.loanRemainingPrincipal ?? '',
                    })),
                    columns: [
                      { key: '회사', header: '회사', width: 14 },
                      { key: '차량번호', header: '차량번호', width: 14, type: 'mono' },
                      { key: '차종', header: '차종', width: 20 },
                      { key: '할부사', header: '할부사', width: 16 },
                      { key: '개시일', header: '개시일', width: 14, type: 'date' },
                      { key: '할부개월', header: '할부개월', width: 10, type: 'number' },
                      { key: '매입가', header: '매입가', width: 14, type: 'number' },
                      { key: '잔여원금', header: '잔여원금', width: 14, type: 'number' },
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
            { label: '자산 상세 보기', icon: <MagnifyingGlass size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.plate) router.push(`/asset?q=${encodeURIComponent(ctxMenu.row.plate)}`); } },
            { type: 'separator' },
            { label: '차량번호 복사', icon: <Copy size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.plate) navigator.clipboard.writeText(ctxMenu.row.plate); } },
            { label: '할부사 복사', icon: <Copy size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.loanCompany) navigator.clipboard.writeText(ctxMenu.row.loanCompany); }, disabled: !ctxMenu.row.loanCompany },
          ] satisfies ContextMenuItem[]) : []}
        />
      </div>
    </div>
  );
}
