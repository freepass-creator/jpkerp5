'use client';

/**
 * /admin/status-drift — 차량상태 drift 진단·일괄 수정.
 *
 * Vehicle.status (자산 마스터) vs Contract.vehicleStatus (계약 사본) 가 어긋난 케이스를
 * 한 화면에서 보고 어느 쪽으로 정렬할지 결정한다.
 *
 *  · entity-sync.ts 와 contract-detail-dialog 의 sync 점이 누락된 케이스
 *  · 등록증만 손으로 status 바꾸고 계약은 그대로 둔 케이스
 *  · 계약 plate 가 빈 케이스(매칭 불가) — 별도 카운트
 *
 * 동작 변경 없음 (진단 + 수동 정렬만). 운영 데이터의 어느 한 쪽 자동 덮어쓰기 금지.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Wrench, Warning, CheckCircle, ArrowRight, ArrowLeft, MagnifyingGlass } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { StatusBadge } from '@/components/ui/status-badge';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { displayCompanyName } from '@/lib/company-display';
import { vehicleStatusTone } from '@/lib/status-tones';
import { audit } from '@/lib/firebase/audit-store';
import type { Vehicle, Contract } from '@/lib/types';

type DriftRow = {
  plate: string;
  contract: Contract;
  vehicle: Vehicle;
  side: 'mismatch';
};

type OrphanRow = {
  plate: string;
  contract: Contract;
  side: 'no-vehicle';   // 계약 plate 에 해당하는 vehicle 마스터 없음
};

type StaleVehicleRow = {
  plate: string;
  vehicle: Vehicle;
  side: 'no-contract';  // vehicle 은 있는데 활성 계약 없음 (휴차/매각/대기 등 정상 가능)
};

export default function StatusDriftPage() {
  const { vehicles, update: updateVehicle } = useVehicles();
  const { contracts, update: updateContract } = useContracts();
  const { companies: companyMaster } = useCompanies();
  const [busy, setBusy] = useState(false);
  const [showOrphans, setShowOrphans] = useState(false);
  const [showStaleVehicles, setShowStaleVehicles] = useState(false);

  const byPlate = useMemo(() => {
    const m = new Map<string, Vehicle>();
    for (const v of vehicles) {
      const p = (v.plate ?? '').trim();
      if (p) m.set(p, v);
    }
    return m;
  }, [vehicles]);

  const contractByPlate = useMemo(() => {
    // 활성 계약 우선 (운행 > 대기 > 그 외). 같은 plate 여러 건 있으면 활성 우선.
    const m = new Map<string, Contract>();
    const rank = (s?: string) => (s === '운행' ? 0 : s === '대기' ? 1 : 2);
    for (const c of contracts) {
      const p = (c.vehiclePlate ?? '').trim();
      if (!p) continue;
      const cur = m.get(p);
      if (!cur || rank(c.status) < rank(cur.status)) m.set(p, c);
    }
    return m;
  }, [contracts]);

  const drift: DriftRow[] = useMemo(() => {
    const rows: DriftRow[] = [];
    for (const [plate, c] of contractByPlate.entries()) {
      const v = byPlate.get(plate);
      if (!v) continue;
      const cs = c.vehicleStatus ?? '';
      const vs = v.status ?? '';
      if (cs && vs && cs !== vs) {
        rows.push({ plate, contract: c, vehicle: v, side: 'mismatch' });
      }
    }
    return rows.sort((a, b) => a.plate.localeCompare(b.plate));
  }, [contractByPlate, byPlate]);

  const orphans: OrphanRow[] = useMemo(() => {
    const rows: OrphanRow[] = [];
    for (const [plate, c] of contractByPlate.entries()) {
      if (!byPlate.has(plate)) rows.push({ plate, contract: c, side: 'no-vehicle' });
    }
    return rows.sort((a, b) => a.plate.localeCompare(b.plate));
  }, [contractByPlate, byPlate]);

  const staleVehicles: StaleVehicleRow[] = useMemo(() => {
    const rows: StaleVehicleRow[] = [];
    for (const [plate, v] of byPlate.entries()) {
      if (!contractByPlate.has(plate)) rows.push({ plate, vehicle: v, side: 'no-contract' });
    }
    return rows.sort((a, b) => a.plate.localeCompare(b.plate));
  }, [byPlate, contractByPlate]);

  async function applyContractSide(row: DriftRow) {
    if (busy) return;
    const before = { vehicleStatus_contract: row.contract.vehicleStatus, status_vehicle: row.vehicle.status };
    setBusy(true);
    try {
      const merged: Vehicle = { ...row.vehicle, status: (row.contract.vehicleStatus ?? row.vehicle.status) as Vehicle['status'] };
      await updateVehicle(merged);
      await audit.update('vehicle', row.vehicle.id, `drift 정렬: vehicle.status → ${row.contract.vehicleStatus} (계약 기준)`, before, { status_vehicle: merged.status });
    } finally {
      setBusy(false);
    }
  }

  async function applyVehicleSide(row: DriftRow) {
    if (busy) return;
    const before = { vehicleStatus_contract: row.contract.vehicleStatus, status_vehicle: row.vehicle.status };
    setBusy(true);
    try {
      const merged: Contract = { ...row.contract, vehicleStatus: (row.vehicle.status ?? row.contract.vehicleStatus) as Contract['vehicleStatus'] };
      await updateContract(merged);
      await audit.update('contract', row.contract.id, `drift 정렬: contract.vehicleStatus → ${row.vehicle.status} (자산 기준)`, before, { vehicleStatus_contract: merged.vehicleStatus });
    } finally {
      setBusy(false);
    }
  }

  async function applyAllVehicleSide() {
    if (drift.length === 0 || busy) return;
    if (!confirm(`드리프트 ${drift.length}건을 모두 '자산 마스터' 값으로 정렬합니다. 진행할까요?\n\n각 계약의 vehicleStatus 가 vehicle.status 로 덮입니다.`)) return;
    setBusy(true);
    try {
      for (const row of drift) {
        const merged: Contract = { ...row.contract, vehicleStatus: (row.vehicle.status ?? row.contract.vehicleStatus) as Contract['vehicleStatus'] };
        await updateContract(merged);
      }
      await audit.update('contract', 'batch', `drift 일괄 정렬: vehicle.status → contract.vehicleStatus (${drift.length}건)`, undefined, { count: drift.length, plates: drift.slice(0, 100).map((r) => r.plate), truncated: drift.length > 100 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <Wrench size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>차량상태 drift 진단</span>
          </div>
        </header>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div className="notice notice--info" style={{ fontSize: 12, lineHeight: 1.6 }}>
            <strong>차량상태(VehicleStatus) 는 자산 마스터(Vehicle.status) 가 SoT</strong> 입니다.<br />
            계약의 <code>vehicleStatus</code> 는 화면 노출용 사본. 두 값이 다른 케이스를 모아 한 화면에서 정렬합니다.<br />
            <span className="dim">참고: contract-detail-dialog 에서 상태 변경 시 vehicles-store 로 자동 sync 가 일어나지만, plate 매칭 실패·이전 OCR 케이스 등으로 누락이 생길 수 있음.</span>
          </div>

          {/* 요약 KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <KpiCard label="총 자산" value={vehicles.length} />
            <KpiCard label="활성 계약 plate" value={contractByPlate.size} />
            <KpiCard label="🔴 상태 drift" value={drift.length} tone={drift.length > 0 ? 'red' : 'green'} />
            <KpiCard label="🟡 plate 매칭 실패" value={orphans.length} tone={orphans.length > 0 ? 'orange' : 'gray'} />
          </div>

          {/* drift 본판 */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>
                상태 drift ({drift.length}건)
              </h3>
              {drift.length > 0 && (
                <button className="btn btn-sm" disabled={busy} onClick={applyAllVehicleSide} title="자산 마스터 값으로 일괄 정렬 (각 계약 vehicleStatus 덮어쓰기)">
                  자산 기준 일괄 정렬
                </button>
              )}
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 56 }}>회사</th>
                  <th style={{ width: 96 }}>차량번호</th>
                  <th>차종</th>
                  <th style={{ width: 100 }}>계약자</th>
                  <th className="center" style={{ width: 110 }}>계약 vehicleStatus</th>
                  <th className="center" style={{ width: 40 }}>vs</th>
                  <th className="center" style={{ width: 110 }}>자산 status</th>
                  <th className="center" style={{ width: 200 }}>동작</th>
                </tr>
              </thead>
              <tbody>
                {drift.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="muted center" style={{ padding: 24 }}>
                      <CheckCircle size={16} weight="fill" style={{ color: 'var(--green-text, #10b981)', verticalAlign: 'middle', marginRight: 6 }} />
                      drift 없음 — 모든 계약-자산 짝 상태 일치
                    </td>
                  </tr>
                ) : drift.map((r) => (
                  <tr key={r.plate}>
                    <td className="dim">{r.contract.company ? displayCompanyName(r.contract.company, companyMaster) : '-'}</td>
                    <td className="mono">{r.plate}</td>
                    <td className="dim">{r.contract.vehicleModel || r.vehicle.model || '-'}</td>
                    <td>{r.contract.customerName || '-'}</td>
                    <td className="center"><StatusBadge tone={vehicleStatusTone(r.contract.vehicleStatus)}>{r.contract.vehicleStatus || '-'}</StatusBadge></td>
                    <td className="center muted">≠</td>
                    <td className="center"><StatusBadge tone={vehicleStatusTone(r.vehicle.status)}>{r.vehicle.status || '-'}</StatusBadge></td>
                    <td className="center">
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button className="btn btn-sm" disabled={busy} onClick={() => applyContractSide(r)} title="계약값으로 자산 마스터 덮어쓰기">
                          <ArrowRight size={11} /> 계약→자산
                        </button>
                        <button className="btn btn-sm" disabled={busy} onClick={() => applyVehicleSide(r)} title="자산값으로 계약 사본 덮어쓰기">
                          <ArrowLeft size={11} /> 자산→계약
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* plate 매칭 실패 (계약은 있지만 vehicle 마스터에 없음) */}
          <section>
            <button
              className="btn btn-sm"
              type="button"
              onClick={() => setShowOrphans((s) => !s)}
              style={{ marginBottom: 8 }}
            >
              <Warning size={11} /> plate 매칭 실패 ({orphans.length}건) {showOrphans ? '접기' : '펼치기'}
            </button>
            {showOrphans && (
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 96 }}>차량번호</th>
                    <th>계약자</th>
                    <th>차종</th>
                    <th className="center" style={{ width: 110 }}>계약 vehicleStatus</th>
                    <th style={{ width: 100 }}>점프</th>
                  </tr>
                </thead>
                <tbody>
                  {orphans.length === 0 ? (
                    <tr><td colSpan={5} className="muted center" style={{ padding: 16 }}>없음</td></tr>
                  ) : orphans.slice(0, 100).map((r) => (
                    <tr key={r.plate}>
                      <td className="mono">{r.plate}</td>
                      <td>{r.contract.customerName || '-'}</td>
                      <td className="dim">{r.contract.vehicleModel || '-'}</td>
                      <td className="center"><StatusBadge tone={vehicleStatusTone(r.contract.vehicleStatus)}>{r.contract.vehicleStatus || '-'}</StatusBadge></td>
                      <td>
                        <Link className="btn btn-sm" href={`/?q=${encodeURIComponent(r.plate)}`}>
                          <MagnifyingGlass size={11} /> 운영현황
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {orphans.length > 100 && (
                    <tr><td colSpan={5} className="muted center" style={{ padding: 8 }}>상위 100건만 표시</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </section>

          {/* vehicle 은 있지만 활성 계약 없음 — 정상 가능 (휴차·매각·대기) */}
          <section>
            <button
              className="btn btn-sm"
              type="button"
              onClick={() => setShowStaleVehicles((s) => !s)}
              style={{ marginBottom: 8 }}
            >
              자산만 있는 차량 ({staleVehicles.length}건) {showStaleVehicles ? '접기' : '펼치기'}
            </button>
            {showStaleVehicles && (
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 56 }}>회사</th>
                    <th style={{ width: 96 }}>차량번호</th>
                    <th>차종</th>
                    <th className="center" style={{ width: 110 }}>자산 status</th>
                    <th style={{ width: 100 }}>점프</th>
                  </tr>
                </thead>
                <tbody>
                  {staleVehicles.length === 0 ? (
                    <tr><td colSpan={5} className="muted center" style={{ padding: 16 }}>없음</td></tr>
                  ) : staleVehicles.slice(0, 100).map((r) => (
                    <tr key={r.plate}>
                      <td className="dim">{r.vehicle.company ? displayCompanyName(r.vehicle.company, companyMaster) : '-'}</td>
                      <td className="mono">{r.plate}</td>
                      <td className="dim">{r.vehicle.model || '-'}</td>
                      <td className="center"><StatusBadge tone={vehicleStatusTone(r.vehicle.status)}>{r.vehicle.status || '-'}</StatusBadge></td>
                      <td>
                        <Link className="btn btn-sm" href={`/asset?q=${encodeURIComponent(r.plate)}`}>
                          <MagnifyingGlass size={11} /> 자산
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {staleVehicles.length > 100 && (
                    <tr><td colSpan={5} className="muted center" style={{ padding: 8 }}>상위 100건만 표시</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </section>

        </div>

        <BottomBar
          left={<Link href="/admin/dev-tools" className="btn btn-sm">← 개발도구</Link>}
          right={busy ? <span className="dim" style={{ fontSize: 12 }}>처리 중…</span> : null}
        />
      </div>
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone?: 'red' | 'orange' | 'green' | 'gray' }) {
  const color = tone === 'red' ? 'var(--red-text)'
    : tone === 'orange' ? 'var(--orange-text, #c2410c)'
    : tone === 'green' ? 'var(--green-text, #10b981)'
    : 'var(--text-main)';
  return (
    <div style={{ padding: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-weak)', marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 20, fontWeight: 700, color }}>{value.toLocaleString()}</div>
    </div>
  );
}
