'use client';

/**
 * /asset/loan — 자산 차량 단위 할부 현황 list.
 * 등록자산 view 동일 row 패턴 + 할부 컬럼.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileXls } from '@phosphor-icons/react';
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

export default function AssetLoanPage() {
  const router = useRouter();
  const { isMaster: master, loading: roleLoading } = useRole();
  useEffect(() => { if (!roleLoading && !master) router.replace('/'); }, [master, roleLoading, router]);

  const { vehicles } = useMergedVehicles();
  const { companies: companyMaster } = useCompanies();
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const sel = useTableSelection();

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
    }).sort((a, b) => (a.plate ?? '').localeCompare(b.plate ?? ''));
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
                    <tr key={v.id} style={{ verticalAlign: 'middle', cursor: 'pointer' }} onDoubleClick={() => router.push(`/asset?view=registered&plate=${encodeURIComponent(v.plate ?? '')}`)} className={sel.selectedIds.has(v.id) ? 'selected-row' : undefined}>
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
              <button className="btn" type="button"><FileXls size={14} weight="bold" /> 엑셀</button>
            </>
          }
          right={null}
        />
      </div>
    </div>
  );
}
