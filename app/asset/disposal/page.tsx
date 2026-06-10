'use client';

/**
 * /asset/disposal — 자산 차량 단위 처분(매각) 현황.
 * 등록자산 row 패턴 + 매각 상태 컬럼.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileXls } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { AssetTopbar } from '@/components/asset/asset-topbar';
import { useMergedVehicles } from '@/lib/use-merged-vehicles';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useRole } from '@/lib/use-role';
import { displayCompanyName } from '@/lib/company-display';
import { matchesCompanyFilter, buildCompanyOptions } from '@/lib/filter-helpers';
import { useTableSelection } from '@/lib/use-table-selection';
import { TableHeaderCheckbox, TableRowCheckbox } from '@/components/ui/table-checkbox';
import { StatusBadge } from '@/components/ui/status-badge';
import { vehicleStatusTone } from '@/lib/status-tones';

const DISPOSAL_STATUSES = ['매각검토', '매각대기', '매각'] as const;

export default function AssetDisposalPage() {
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
      if (!DISPOSAL_STATUSES.includes(v.status as typeof DISPOSAL_STATUSES[number])) return false;
      if (!matchesCompanyFilter(v.company, companyFilter)) return false;
      if (q) {
        const hay = `${v.plate ?? ''} ${v.model ?? ''} ${v.assetCode ?? ''}`.toLowerCase();
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
          searchPlaceholder="차량번호 / 차종 / 자산코드"
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
                    <tr><td colSpan={7} className="muted center" style={{ padding: 32 }}>처분 대상 차량 없음</td></tr>
                  ) : filtered.map((v) => (
                    <tr key={v.id} style={{ verticalAlign: 'middle', cursor: 'pointer' }} onDoubleClick={() => router.push(`/asset?view=registered&plate=${encodeURIComponent(v.plate ?? '')}`)} className={sel.selectedIds.has(v.id) ? 'selected-row' : undefined}>
                      <TableRowCheckbox id={v.id} selection={sel} />
                      <td>{v.company ? displayCompanyName(v.company, companyMaster) : '-'}</td>
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
              <button className="btn" type="button"><FileXls size={14} weight="bold" /> 엑셀</button>
            </>
          }
          right={null}
        />
      </div>
    </div>
  );
}
