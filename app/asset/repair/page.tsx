'use client';

/**
 * /asset/repair — 자산 차량 단위 수선 현황.
 * 등록자산 row 패턴 + 정비 누적 컬럼 (최근 정비일·누적 비용·횟수·최근 항목).
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileXls } from '@phosphor-icons/react';
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

export default function RepairPage() {
  const router = useRouter();
  const { isMaster: master, loading: roleLoading } = useRole();
  useEffect(() => { if (!roleLoading && !master) router.replace('/'); }, [master, roleLoading, router]);

  const { entries: history } = useHistoryEntries();
  const { vehicles } = useMergedVehicles();
  const { companies: companyMaster } = useCompanies();
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = usePersistentState('filter:asset-repair:company', 'all');
  const sel = useTableSelection();

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
    }).sort((a, b) => (a.plate ?? '').localeCompare(b.plate ?? ''));
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
                    <tr><td colSpan={9} className="muted center" style={{ padding: 32 }}>등록된 차량 없음</td></tr>
                  ) : filtered.map((v) => {
                    const r = v.plate ? repairByPlate.get(v.plate.replace(/\s/g, '')) : undefined;
                    return (
                      <tr key={v.id} style={{ verticalAlign: 'middle', cursor: 'pointer' }} onDoubleClick={() => router.push(`/asset?view=registered&plate=${encodeURIComponent(v.plate ?? '')}`)} className={sel.selectedIds.has(v.id) ? 'selected-row' : undefined}>
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
              <button className="btn" type="button"><FileXls size={14} weight="bold" /> 엑셀</button>
            </>
          }
          right={null}
        />
      </div>
    </div>
  );
}
