'use client';

/**
 * /asset/gps — 자산 차량 단위 GPS 설치 현황.
 * 등록자산 row 패턴 + GPS 컬럼.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileXls } from '@phosphor-icons/react';
import { useMergedVehicles } from '@/lib/use-merged-vehicles';
import { useCompanies } from '@/lib/firebase/companies-store';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { AssetTopbar } from '@/components/asset/asset-topbar';
import { StatusBadge } from '@/components/ui/status-badge';
import { vehicleStatusTone } from '@/lib/status-tones';
import { useRole } from '@/lib/use-role';
import { displayCompanyName } from '@/lib/company-display';
import { matchesCompanyFilter, buildCompanyOptions } from '@/lib/filter-helpers';
import { useTableSelection } from '@/lib/use-table-selection';
import { TableHeaderCheckbox, TableRowCheckbox } from '@/components/ui/table-checkbox';

export default function AssetGpsPage() {
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
        const hay = `${v.plate ?? ''} ${v.model ?? ''} ${v.gpsProvider ?? ''} ${v.gpsDeviceId ?? ''}`.toLowerCase();
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
                    <tr><td colSpan={9} className="muted center" style={{ padding: 32 }}>등록된 차량 없음</td></tr>
                  ) : filtered.map((v) => {
                    const installed = !!(v.gpsProvider || v.gpsDeviceId);
                    return (
                      <tr key={v.id} style={{ verticalAlign: 'middle', cursor: 'pointer' }} onDoubleClick={() => router.push(`/asset?view=registered&plate=${encodeURIComponent(v.plate ?? '')}`)} className={sel.selectedIds.has(v.id) ? 'selected-row' : undefined}>
                        <TableRowCheckbox id={v.id} selection={sel} />
                        <td>{v.company ? displayCompanyName(v.company, companyMaster) : '-'}</td>
                        <td className="mono">{v.plate || '-'}</td>
                        <td>{v.vehicleModelLine || v.model || '-'}</td>
                        <td>{v.gpsProvider || <span className="muted">-</span>}</td>
                        <td className="mono dim">{v.gpsDeviceId || '-'}</td>
                        <td className="center">
                          {installed
                            ? <StatusBadge tone="green">설치</StatusBadge>
                            : <StatusBadge tone="gray">미설치</StatusBadge>}
                        </td>
                        <td className="center dim">-</td>
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
              <button className="btn btn-primary" type="button"><Plus size={14} weight="bold" /> GPS 등록</button>
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
