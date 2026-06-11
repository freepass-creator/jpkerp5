'use client';

/**
 * /contract/idle — 휴차 차량 관리.
 * Contract.vehicleStatus = '휴차' or '휴차대기' + 매각검토 까지 포함.
 * 계약자 연락처 자리에 현재 위치(idleLocation) 표시 — 휴차차량은 계약자 없으니 위치가 더 중요.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pause, MagnifyingGlass, MapPin, FileXls } from '@phosphor-icons/react';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { CONTRACT_SUB } from '@/components/layout/sub-nav';
import { BottomBar } from '@/components/layout/bottom-bar';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { displayCompanyName } from '@/lib/company-display';
import { useRole } from '@/lib/use-role';
import { todayKr } from '@/lib/mock-data';
import { IdleLocationDialog } from '@/components/idle-location-dialog';
import type { Contract } from '@/lib/types';
import { StatusBadge } from '@/components/ui/status-badge';
import { vehicleStatusTone } from '@/lib/status-tones';
import { downloadContractsExcel } from '@/lib/contract-export';

export default function ContractIdlePage() {
  const router = useRouter();
  const { isMaster: master, loading: roleLoading } = useRole();
  useEffect(() => {
    if (!roleLoading && !master) router.replace('/');
  }, [master, roleLoading, router]);

  const { contracts, update: updateContract } = useContracts();
  const { companies: companyMaster } = useCompanies();
  const today = todayKr();

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Contract | null>(null);

  const [statusFilter, setStatusFilter] = useState<'all' | '휴차' | '휴차대기' | '매각검토' | '__noloc'>('all');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contracts
      .filter((c) => c.vehicleStatus === '휴차' || c.vehicleStatus === '휴차대기' || c.vehicleStatus === '매각검토')
      .filter((c) => {
        if (statusFilter === '__noloc') return !c.idleLocation?.trim();
        if (statusFilter !== 'all' && c.vehicleStatus !== statusFilter) return false;
        return true;
      })
      .filter((c) => {
        if (!q) return true;
        const hay = `${c.vehiclePlate ?? ''} ${c.vehicleModel ?? ''} ${c.idleLocation ?? ''} ${c.idleReason ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => (a.idleSince ?? '').localeCompare(b.idleSince ?? ''));
  }, [contracts, search, statusFilter]);

  const counts = useMemo(() => {
    const c = { 전체: 0, 휴차대기: 0, 휴차: 0, 매각검토: 0, 위치미입력: 0 };
    for (const r of contracts) {
      if (r.vehicleStatus !== '휴차' && r.vehicleStatus !== '휴차대기' && r.vehicleStatus !== '매각검토') continue;
      c.전체++;
      if (r.vehicleStatus === '휴차대기') c.휴차대기++;
      else if (r.vehicleStatus === '휴차') c.휴차++;
      else if (r.vehicleStatus === '매각검토') c.매각검토++;
      if (!r.idleLocation?.trim()) c.위치미입력++;
    }
    return c;
  }, [contracts]);

  function daysIdle(since?: string): number | null {
    if (!since) return null;
    return Math.max(0, Math.round((new Date(today).getTime() - new Date(since).getTime()) / 86400000));
  }

  return (
    <MasterPageShell
      title="휴차 관리"
      icon={<Pause size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      subNav={CONTRACT_SUB}
      search={
        <div className="topbar-search">
          <MagnifyingGlass size={14} className="icon" />
          <input
            className="input"
            placeholder="차량번호 / 위치 / 사유"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      }
      quickFilters={
        <>
          <button type="button" className={`chip ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>
            전체<span className="chip-count">{counts.전체}</span>
          </button>
          <button type="button" className={`chip ${statusFilter === '휴차대기' ? 'active' : ''}`} onClick={() => setStatusFilter('휴차대기')}>
            휴차대기<span className="chip-count">{counts.휴차대기}</span>
          </button>
          <button type="button" className={`chip chip-tone-brand ${statusFilter === '휴차' ? 'active' : ''}`} onClick={() => setStatusFilter('휴차')}>
            휴차중<span className="chip-count">{counts.휴차}</span>
          </button>
          <button type="button" className={`chip chip-tone-orange ${statusFilter === '매각검토' ? 'active' : ''}`} onClick={() => setStatusFilter('매각검토')}>
            매각검토<span className="chip-count">{counts.매각검토}</span>
          </button>
          <span className="filter-divider" />
          <button type="button" className={`chip chip-tone-red ${statusFilter === '__noloc' ? 'active' : ''}`} onClick={() => setStatusFilter('__noloc')}>
            위치 미입력<span className="chip-count">{counts.위치미입력}</span>
          </button>
        </>
      }
      bottomBar={
        <BottomBar
          left={
            <button
              className="btn"
              type="button"
              disabled={rows.length === 0}
              onClick={() => downloadContractsExcel(rows, companyMaster, { title: '휴차 차량', fileName: '휴차차량', sheetName: '휴차', filter: `${rows.length}건` })}
            >
              <FileXls size={14} weight="bold" /> 엑셀
            </button>
          }
          right={null}
        />
      }
    >
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 56 }}>회사</th>
            <th style={{ width: 96 }}>차량번호</th>
            <th style={{ width: 140 }}>차종</th>
            <th style={{ width: 80 }}>상태</th>
            <th style={{ width: 100 }}>휴차 시작</th>
            <th className="num" style={{ width: 70 }}>경과일</th>
            <th>현재 위치 · 사유</th>
            <th style={{ width: 110 }}>위치 담당</th>
            <th style={{ width: 100 }}>종료 예정</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={9} className="muted center" style={{ padding: 32 }}>휴차 차량 없음</td></tr>
          ) : rows.map((c) => {
            const days = daysIdle(c.idleSince);
            const noLocation = !c.idleLocation?.trim();
            return (
              <tr key={c.id} onClick={() => setEditing(c)} style={{ cursor: 'pointer' }}>
                <td className="dim">{c.company ? displayCompanyName(c.company, companyMaster) : '-'}</td>
                <td className="mono">{c.vehiclePlate}</td>
                <td className="dim">{c.vehicleModel || '-'}</td>
                <td><StatusBadge tone={vehicleStatusTone(c.vehicleStatus)}>{c.vehicleStatus}</StatusBadge></td>
                <td className="mono">{c.idleSince || '-'}</td>
                <td className="num mono" style={{ color: days != null && days > 30 ? 'var(--red-text)' : undefined, fontWeight: days != null && days > 30 ? 700 : undefined }}>
                  {days != null ? `D+${days}` : '-'}
                </td>
                <td>
                  {noLocation ? (
                    <span style={{ color: 'var(--red-text)', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={12} weight="fill" /> 위치 미입력 (클릭하여 등록)
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <MapPin size={12} weight="duotone" style={{ color: 'var(--brand)' }} />
                      <strong>{c.idleLocation}</strong>
                      {c.idleReason && <span className="dim" style={{ fontSize: 11 }}>· {c.idleReason}</span>}
                    </span>
                  )}
                </td>
                <td className="mono dim">{c.idleContact || '-'}</td>
                <td className="mono dim">{c.idleUntil || '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {editing && (
        <IdleLocationDialog
          contract={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await updateContract({ ...editing, ...patch });
            setEditing(null);
          }}
        />
      )}
    </MasterPageShell>
  );
}
