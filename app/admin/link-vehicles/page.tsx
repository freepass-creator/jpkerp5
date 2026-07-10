'use client';

/**
 * /admin/link-vehicles — 계약에 안정 FK(vehicleId) 백필 (R1).
 *
 * plate 문자열 링크를 Vehicle.id 안정키로 확정. plate 는 표시·폴백용으로 유지.
 * 재실행 가능(멱등) — import 후 다시 돌리면 새 계약만 스탬프.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LinkSimple } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { findVehicleByPlate } from '@/lib/entity-sync';
import { useRole } from '@/lib/use-role';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyRow } from '@/components/ui/empty-row';
import { showConfirm } from '@/lib/confirm';
import { toast } from '@/lib/toast';

type RowState = '확정' | '스탬프대상' | '미매칭';

export default function LinkVehiclesPage() {
  const router = useRouter();
  const { isMaster, loading: roleLoading } = useRole();
  const { contracts, updateMany } = useContracts();
  const { vehicles } = useVehicles();
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    return contracts
      .filter((c) => c.id && !c.id.startsWith('vehicle-orphan-'))
      .map((c) => {
        const matched = findVehicleByPlate(vehicles, c.vehiclePlate);
        let state: RowState;
        if (c.vehicleId && vehicles.some((v) => v.id === c.vehicleId)) state = '확정';
        else if (matched) state = '스탬프대상';
        else state = '미매칭';
        return { c, matched, state };
      });
  }, [contracts, vehicles]);

  const counts = useMemo(() => ({
    total: rows.length,
    fixed: rows.filter((r) => r.state === '확정').length,
    toStamp: rows.filter((r) => r.state === '스탬프대상').length,
    unmatched: rows.filter((r) => r.state === '미매칭').length,
  }), [rows]);

  async function applyStamp() {
    const targets = rows.filter((r) => r.state === '스탬프대상' && r.matched);
    if (targets.length === 0) { toast.info('스탬프할 대상 없음'); return; }
    if (!await showConfirm({ title: `${targets.length}건에 vehicleId 를 확정 기록할까요?`, description: 'plate 는 그대로 유지, 안정 FK 만 추가됩니다. 재실행 가능.', confirmLabel: '스탬프 적용' })) return;
    setBusy(true);
    try {
      const updated = targets.map((r) => ({ ...r.c, vehicleId: r.matched!.id }));
      await updateMany(updated);
      toast.success(`${updated.length}건 vehicleId 확정`);
    } catch (e) {
      toast.error(`실패: ${(e as Error).message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  if (!roleLoading && !isMaster) { router.replace('/'); return null; }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: 24, maxWidth: 1000, margin: '0 auto', width: '100%' }}>
        <header className="page-header" style={{ marginBottom: 16 }}>
          <h1 className="page-header-title"><LinkSimple size={18} weight="duotone" /> 계약 ↔ 차량 안정 링크 (vehicleId 백필)</h1>
          <div className="page-header-title-sub">
            plate 문자열 링크를 Vehicle.id 안정 FK로 확정 (OCR 오보정·번호변경에도 링크 불변). plate 는 표시·폴백용 유지. 재실행 가능.
          </div>
        </header>

        <div className="panel" style={{ marginBottom: 16 }}>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Kpi label="전체 계약" value={counts.total} />
            <Kpi label="FK 확정" value={counts.fixed} tone="var(--green-text)" />
            <Kpi label="스탬프 대상" value={counts.toStamp} tone="var(--brand)" />
            <Kpi label="미매칭(차량없음)" value={counts.unmatched} tone={counts.unmatched > 0 ? 'var(--red-text)' : undefined} />
          </div>
          <div style={{ padding: '0 16px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-primary" type="button" disabled={busy || counts.toStamp === 0} onClick={applyStamp}>
              {busy ? '적용 중…' : `스탬프 대상 ${counts.toStamp}건 vehicleId 확정`}
            </button>
            {counts.unmatched > 0 && <span className="dim" style={{ fontSize: 12 }}>미매칭은 차량 마스터에 해당 plate 등록 후 재실행</span>}
          </div>
        </div>

        <section className="panel">
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>계약자</th>
                  <th>차량번호(plate)</th>
                  <th>현재 vehicleId</th>
                  <th className="center">상태</th>
                  <th>매칭 차량</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <EmptyRow colSpan={5}>계약 없음</EmptyRow>
                ) : rows.filter((r) => r.state !== '확정').concat(rows.filter((r) => r.state === '확정')).map((r) => (
                  <tr key={r.c.id}>
                    <td style={{ fontWeight: 600 }}>{r.c.customerName || '-'}</td>
                    <td className="mono">{r.c.vehiclePlate || '-'}</td>
                    <td className="mono dim">{r.c.vehicleId ? r.c.vehicleId.slice(0, 10) + '…' : '-'}</td>
                    <td className="center">
                      <StatusBadge tone={r.state === '확정' ? 'green' : r.state === '스탬프대상' ? 'brand' : 'red'}>{r.state}</StatusBadge>
                    </td>
                    <td className="dim">{r.matched ? `${r.matched.plate} · ${r.matched.vehicleModelLine || r.matched.model || ''}` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div style={{ padding: '4px 8px' }}>
      <div className="dim" style={{ fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: tone }}>{value}</div>
    </div>
  );
}
