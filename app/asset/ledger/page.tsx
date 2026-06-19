'use client';

/**
 * /asset/ledger — 고정자산대장 (ERP 표준).
 *
 *  · 차량 1대 = 1대장
 *  · 취득가 → 누적 감가 → 장부가 → (매각 시) 처분손익
 *  · 정액법 60개월·잔존가치 10%
 *  · 본부 합계 (active 합계 vs 처분 합계 분리)
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bank, MagnifyingGlass } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useRole } from '@/lib/use-role';
import { useLiveTodayKr } from '@/lib/use-live-today';
import { displayCompanyName } from '@/lib/company-display';
import { matchesCompanyFilter, buildCompanyOptions } from '@/lib/filter-helpers';
import { computeAssetLedgerEntry, summarizeLedger } from '@/lib/asset-ledger';
import { formatCurrency } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/status-badge';
import { FilterSelect } from '@/components/ui/filter-select';
import { vehicleStatusTone } from '@/lib/status-tones';
import { usePersistentState } from '@/lib/use-persistent-state';
import type { VehicleStatus } from '@/lib/types';

const fmt = (v: number) => v ? v.toLocaleString('ko-KR') : '0';

export default function AssetLedgerPage() {
  const router = useRouter();
  const { isMaster: master, loading: roleLoading } = useRole();
  useEffect(() => { if (!roleLoading && !master) router.replace('/'); }, [master, roleLoading, router]);

  const { vehicles, loading } = useVehicles();
  const { companies: companyMaster } = useCompanies();
  const today = useLiveTodayKr();

  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = usePersistentState<string>('filter:asset:ledger:company', 'all');
  const [scope, setScope] = usePersistentState<'active' | 'disposed' | 'all'>('filter:asset:ledger:scope', 'active');

  const companyOptions = useMemo(
    () => buildCompanyOptions(vehicles, (v) => v.company),
    [vehicles],
  );

  const entries = useMemo(() => {
    return vehicles.map((v) => computeAssetLedgerEntry(v, today));
  }, [vehicles, today]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((e) => {
        if (!matchesCompanyFilter(e.company, companyFilter)) return false;
        if (scope === 'active' && e.disposed) return false;
        if (scope === 'disposed' && !e.disposed) return false;
        if (q) {
          const hay = `${e.plate} ${e.model} ${e.status}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // 처분 → 하단, 처분되면 매각일 최신순, 아니면 취득일 최신순
        if (a.disposed !== b.disposed) return a.disposed ? 1 : -1;
        if (a.disposed && b.disposed) return (b.saleDate ?? '').localeCompare(a.saleDate ?? '');
        return (b.acquisitionDate ?? '').localeCompare(a.acquisitionDate ?? '');
      });
  }, [entries, search, companyFilter, scope]);

  const summary = useMemo(() => summarizeLedger(filtered), [filtered]);

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <Bank size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>고정자산대장</span>
          </div>
          <div className="topbar-search">
            <MagnifyingGlass size={14} className="icon" />
            <input
              className="input"
              placeholder="차량번호 / 차종 / 상태"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-bar">
            <FilterSelect
              value={companyFilter}
              onChange={setCompanyFilter}
              dataW="md"
              title="회사별 필터"
              options={[
                { value: 'all', label: '회사: 전체' },
                ...companyOptions.map((co) => ({ value: co, label: co })),
              ]}
            />
            <span className="filter-divider" />
            <button type="button" className={`chip ${scope === 'active' ? 'active' : ''}`} onClick={() => setScope('active')}>운영자산</button>
            <button type="button" className={`chip ${scope === 'disposed' ? 'active' : ''}`} onClick={() => setScope('disposed')}>처분자산</button>
            <button type="button" className={`chip ${scope === 'all' ? 'active' : ''}`} onClick={() => setScope('all')}>전체</button>
          </div>
          <div className="topbar-right">
            <span className="topbar-date">{today}</span>
          </div>
        </header>

        <div className="dashboard">
          {/* 합계 패널 */}
          <div className="panel" style={{ marginBottom: 12 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: scope === 'disposed' ? 'repeat(4, 1fr)' : 'repeat(5, 1fr)',
              gap: 8, padding: 14,
            }}>
              {scope !== 'disposed' && (
                <>
                  <SumCard label="운영 자산 대수" value={`${summary.activeCount}대`} />
                  <SumCard label="총 취득가" value={`₩${fmt(summary.totalAcquisition)}`} />
                  <SumCard label="누적 감가" value={`₩${fmt(summary.totalAccumulatedDep)}`} tone="orange" />
                  <SumCard label="장부가 (운영)" value={`₩${fmt(summary.totalBookValue)}`} tone="brand" />
                </>
              )}
              {scope !== 'active' && (
                <>
                  <SumCard label="처분 대수" value={`${summary.disposedCount}대`} />
                  <SumCard label="총 매각가" value={`₩${fmt(summary.totalSalePrice)}`} />
                  <SumCard
                    label="처분손익 합계"
                    value={`${summary.totalDisposalGainLoss >= 0 ? '+' : ''}₩${fmt(Math.abs(summary.totalDisposalGainLoss))}`}
                    tone={summary.totalDisposalGainLoss >= 0 ? 'green' : 'red'}
                  />
                </>
              )}
              {summary.incompleteCount > 0 && (
                <SumCard label="대장 미완성" value={`${summary.incompleteCount}대`} tone="orange" hint="취득가/취득일 미입력" />
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-body">
              <table className="table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>회사</th>
                    <th style={{ width: 84 }}>차량번호</th>
                    <th>차종</th>
                    <th style={{ width: 70 }}>상태</th>
                    <th style={{ width: 100 }}>취득일</th>
                    <th className="num" style={{ width: 110 }}>취득가</th>
                    <th className="center" style={{ width: 70 }}>경과</th>
                    <th className="num" style={{ width: 110 }}>누적감가</th>
                    <th className="num" style={{ width: 110 }}>장부가</th>
                    <th style={{ width: 100 }}>매각일</th>
                    <th className="num" style={{ width: 110 }}>매각가</th>
                    <th className="num" style={{ width: 110 }}>처분손익</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={12} className="muted center" style={{ padding: 32 }}>{loading ? '데이터 불러오는 중…' : '해당 필터에 맞는 자산 없음'}</td></tr>
                  ) : filtered.map((e) => {
                    const tone = vehicleStatusTone(e.status as VehicleStatus);
                    return (
                      <tr key={e.vehicleId} style={{ background: e.disposed ? 'var(--bg-stripe)' : undefined }}>
                        <td className="dim">{e.company ? displayCompanyName(e.company, companyMaster) : '-'}</td>
                        <td className="mono">{e.plate}</td>
                        <td className="dim">{e.model || '-'}</td>
                        <td><StatusBadge tone={tone}>{e.status || '-'}</StatusBadge></td>
                        <td className="mono dim">{e.acquisitionDate || <span className="muted">-</span>}</td>
                        <td className="num mono">{e.acquisitionCost ? formatCurrency(e.acquisitionCost) : <span className="muted">-</span>}</td>
                        <td className="center dim">{e.incomplete ? '-' : `${e.monthsHeld}개월`}</td>
                        <td className="num mono" style={{ color: 'var(--orange-text)' }}>
                          {e.incomplete ? '-' : formatCurrency(e.accumulatedDepreciation)}
                        </td>
                        <td className="num mono" style={{ color: 'var(--brand)', fontWeight: 600 }}>
                          {e.incomplete ? <span className="muted">-</span> : formatCurrency(e.bookValue)}
                        </td>
                        <td className="mono dim">{e.saleDate || <span className="muted">-</span>}</td>
                        <td className="num mono">{e.salePrice !== undefined ? formatCurrency(e.salePrice) : <span className="muted">-</span>}</td>
                        <td className="num mono" style={{
                          color: e.disposalGainLoss === undefined ? 'var(--text-weak)'
                            : e.disposalGainLoss >= 0 ? 'var(--green-text)' : 'var(--red-text)',
                          fontWeight: 600,
                        }}>
                          {e.disposalGainLoss === undefined ? <span className="muted">-</span>
                            : `${e.disposalGainLoss >= 0 ? '+' : ''}${formatCurrency(e.disposalGainLoss)}`}
                        </td>
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
            <span className="dim" style={{ fontSize: 12 }}>
              정액법 60개월 · 잔존가치 10% · 회사·차종별 별도 정책 필요 시 추후 마스터 분리
            </span>
          }
          right={null}
        />
      </div>
    </div>
  );
}

function SumCard({ label, value, tone, hint }: { label: string; value: string; tone?: 'brand' | 'orange' | 'red' | 'green'; hint?: string }) {
  const color = tone === 'brand' ? 'var(--brand)'
    : tone === 'orange' ? 'var(--orange-text)'
    : tone === 'red' ? 'var(--red-text)'
    : tone === 'green' ? 'var(--green-text)'
    : 'var(--text-main)';
  return (
    <div style={{
      padding: '10px 12px',
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-sub)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 700, color, marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: 'var(--text-weak)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}
