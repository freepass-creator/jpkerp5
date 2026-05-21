'use client';

import { useMemo, useState } from 'react';
import {
  ChartBar, Car, ClipboardText, CurrencyKrw, Warning, Plus,
} from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { CreateDialog } from '@/components/create-dialog';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useBankTx, useCardTx } from '@/lib/firebase/transactions-store';
import { usePenalties } from '@/lib/firebase/penalty-store';
import { formatCurrency, dateWithDow } from '@/lib/utils';
import { todayKr } from '@/lib/mock-data';

export default function DashboardPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const { contracts } = useContracts();
  const { vehicles } = useVehicles();
  const { rows: bankTx } = useBankTx();
  const { rows: cardTx } = useCardTx();
  const { penalties } = usePenalties();

  const kpi = useMemo(() => {
    const totalUnpaid = contracts.reduce((s, c) => s + (c.unpaidAmount ?? 0), 0);
    const unpaidCount = contracts.filter((c) => (c.unpaidAmount ?? 0) > 0).length;
    const activeContracts = contracts.filter((c) => c.status === '운행').length;
    const overdueReturns = contracts.filter(
      (c) => c.returnScheduledDate && !c.returnedDate && c.status === '운행' && c.returnScheduledDate < todayKr()
    ).length;
    const totalDeposit = contracts.reduce((s, c) => s + (c.deposit ?? 0), 0);
    const monthlyRevenue = contracts.filter((c) => c.status === '운행').reduce((s, c) => s + (c.monthlyRent ?? 0), 0);
    const idle = vehicles.filter((v) => !v.currentContractId).length;
    const penaltyOpen = penalties.filter((p) => p.status !== '납부완료' && p.status !== '회사납부').length;
    return {
      totalUnpaid, unpaidCount, activeContracts, overdueReturns,
      totalDeposit, monthlyRevenue, idle, penaltyOpen,
      bankTxCount: bankTx.length,
      cardTxCount: cardTx.length,
    };
  }, [contracts, vehicles, bankTx, cardTx, penalties]);

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 14, color: 'var(--text-main)' }}>
            <ChartBar size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            대시보드
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-weak)' }}>지표 관리 — Phase 2 (준비중)</span>
          <div style={{ flex: 1 }} />
          <span className="topbar-date">{dateWithDow(todayKr())}</span>
        </header>

        <div style={{ padding: 10, overflow: 'auto', background: 'var(--bg-page)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, gridAutoRows: 'min-content' }}>
          <KpiCard icon={<ClipboardText weight="duotone" />} label="운행중 계약" value={kpi.activeContracts} unit="건" tone="brand" />
          <KpiCard icon={<CurrencyKrw weight="duotone" />} label="월 매출 (운행중)" value={formatCurrency(kpi.monthlyRevenue)} unit="원" tone="green" />
          <KpiCard icon={<CurrencyKrw weight="duotone" />} label="미수 합계" value={formatCurrency(kpi.totalUnpaid)} unit="원" tone={kpi.totalUnpaid > 0 ? 'red' : 'green'} sub={`${kpi.unpaidCount}건`} />
          <KpiCard icon={<Warning weight="duotone" />} label="반납 지연" value={kpi.overdueReturns} unit="건" tone={kpi.overdueReturns > 0 ? 'orange' : 'green'} />

          <KpiCard icon={<Car weight="duotone" />} label="유휴 차량" value={kpi.idle} unit="대" tone="zinc" />
          <KpiCard icon={<Warning weight="duotone" />} label="과태료 미처리" value={kpi.penaltyOpen} unit="건" tone={kpi.penaltyOpen > 0 ? 'orange' : 'green'} />
          <KpiCard icon={<CurrencyKrw weight="duotone" />} label="입금 트랜잭션" value={kpi.bankTxCount + kpi.cardTxCount} unit="건" tone="brand" sub={`계좌 ${kpi.bankTxCount} · 카드 ${kpi.cardTxCount}`} />
          <KpiCard icon={<CurrencyKrw weight="duotone" />} label="보증금 합계" value={formatCurrency(kpi.totalDeposit)} unit="원" tone="zinc" />

          {/* 향후 차트 자리 */}
          <div className="panel" style={{ gridColumn: 'span 4', minHeight: 200, padding: 20, alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-weak)' }}>
            <ChartBar size={32} weight="duotone" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-sub)' }}>차트 영역 — Phase 2</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>월별 매출 추이 / 미수 추이 / 회사별 차량 분포 / 계약 갱신율 등</div>
          </div>
        </div>

        <BottomBar
          left={
            <button className="btn btn-primary" type="button" onClick={() => setCreateOpen(true)}>
              <Plus weight="bold" /> 신규 등록
            </button>
          }
          right={<span>실시간 집계 — RTDB</span>}
        />

        <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      </div>
    </div>
  );
}

function KpiCard({
  icon, label, value, unit, sub, tone = 'zinc',
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  unit?: string;
  sub?: string;
  tone?: 'brand' | 'red' | 'orange' | 'green' | 'zinc';
}) {
  const colorMap = {
    brand: 'var(--brand)',
    red: 'var(--red-text)',
    orange: 'var(--orange-text)',
    green: 'var(--green-text)',
    zinc: 'var(--text-sub)',
  };
  const bgMap = {
    brand: 'var(--brand-bg)',
    red: 'var(--red-bg)',
    orange: 'var(--orange-bg)',
    green: 'var(--green-bg)',
    zinc: 'var(--bg-sunken)',
  };

  return (
    <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 28, height: 28,
          background: bgMap[tone], color: colorMap[tone],
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          borderRadius: 'var(--radius-sm)',
        }}>
          {icon}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-sub)', fontWeight: 500 }}>{label}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-main)' }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: 'var(--text-weak)' }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-weak)' }}>{sub}</div>}
    </div>
  );
}
