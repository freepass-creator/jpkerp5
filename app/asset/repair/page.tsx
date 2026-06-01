'use client';

/**
 * /asset/repair — 정비 이력 통합 뷰.
 * HistoryEntry (scope='vehicle' + category='정비' OR '부품교체') 전체를 차량과 함께 표시.
 */

import { useMemo, useState } from 'react';
import { Wrench, MagnifyingGlass } from '@phosphor-icons/react';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { ASSET_SUB } from '@/components/layout/sub-nav';
import { BottomBar } from '@/components/layout/bottom-bar';

export default function RepairPage() {
  const { entries: history } = useHistoryEntries();
  const { vehicles } = useVehicles();
  const [search, setSearch] = useState('');
  const [maintTypeFilter, setMaintTypeFilter] = useState('all');

  const vehicleByPlate = useMemo(() => {
    const m = new Map<string, typeof vehicles[number]>();
    for (const v of vehicles) if (v.plate) m.set(v.plate, v);
    return m;
  }, [vehicles]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return history
      .filter((h) => h.scope === 'vehicle' && (h.category === '정비' || h.category === '부품교체'))
      .filter((h) => {
        if (maintTypeFilter !== 'all') {
          const t = (h.meta?.maintType as string) ?? '';
          if (t !== maintTypeFilter) return false;
        }
        if (q) {
          const hay = `${h.vehiclePlate ?? ''} ${h.title ?? ''} ${h.vendor ?? ''} ${h.description ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }, [history, search, maintTypeFilter]);

  const maintTypes = useMemo(() => {
    const set = new Set<string>();
    for (const h of history) {
      const t = (h.meta?.maintType as string) ?? '';
      if (t) set.add(t);
    }
    return Array.from(set).sort();
  }, [history]);

  const totalCost = rows.reduce((s, h) => s + (h.cost ?? 0), 0);

  return (
    <MasterPageShell
      title="정비 이력"
      icon={<Wrench size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      subNav={ASSET_SUB}
      search={
        <>
          <div className="topbar-search">
            <MagnifyingGlass size={14} className="icon" />
            <input className="input" placeholder="차량번호 / 정비 내용 / 업체" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="filter-bar">
            <select className="input-compact" data-w="md" value={maintTypeFilter} onChange={(e) => setMaintTypeFilter(e.target.value)} title="정비 구분">
              <option value="all">정비구분: 전체</option>
              {maintTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </>
      }
      bottomBar={
        <BottomBar
          left={null}
          right={
            <>
              <span>정비 <strong>{rows.length}</strong>건</span>
              <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
              <span>총 비용 <strong className="mono">₩{totalCost.toLocaleString()}</strong></span>
            </>
          }
        />
      }
    >
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 90 }}>일자</th>
            <th style={{ width: 90 }}>차량번호</th>
            <th style={{ width: 140 }}>차종</th>
            <th style={{ width: 90 }}>구분</th>
            <th style={{ width: 100 }}>정비 항목</th>
            <th>제목</th>
            <th style={{ width: 140 }}>업체</th>
            <th className="num" style={{ width: 90 }}>주행거리</th>
            <th className="num" style={{ width: 100 }}>금액</th>
            <th style={{ width: 64 }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={10} className="muted center" style={{ padding: 32 }}>정비 이력 없음 — 계약 행에서 [+ 이력 추가] 로 등록</td></tr>
          ) : rows.map((h) => {
            const v = vehicleByPlate.get(h.vehiclePlate ?? '');
            const maintType = (h.meta?.maintType as string) ?? '-';
            return (
              <tr key={h.id}>
                <td className="mono">{h.date}</td>
                <td className="mono">{h.vehiclePlate || '-'}</td>
                <td className="dim">{v?.model ?? '-'}</td>
                <td>{h.category}</td>
                <td>{maintType}</td>
                <td>{h.title}</td>
                <td className="dim">{h.vendor ?? '-'}</td>
                <td className="num mono dim">{h.mileage ? `${h.mileage.toLocaleString()}km` : '-'}</td>
                <td className="num mono">{h.cost ? `₩${h.cost.toLocaleString()}` : '-'}</td>
                <td className="dim">{h.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </MasterPageShell>
  );
}
