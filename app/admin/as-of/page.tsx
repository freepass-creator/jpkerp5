'use client';

/**
 * /admin/as-of — 시점(as-of) 미수·상태 조회.
 *
 * "그 날 기준으로 어떤 계약이 어떤 상태였고 미수가 얼마였나" 를 과거 어느 날짜든 재구성.
 * 원천(날짜 박힌 입금·회차·반납일)이 다 보존되므로 computeContractAsOf 로 재생.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClockCounterClockwise } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useRole } from '@/lib/use-role';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatCurrency } from '@/lib/utils';
import { todayKr } from '@/lib/mock-data';
import { computeContractAsOf } from '@/lib/payment-schedule';
import { EmptyRow } from '@/components/ui/empty-row';
import type { Contract } from '@/lib/types';

/** 생애 날짜로 그 시점 상태 근사 (감사로그 없이 계약일·반납일 기준). */
function statusAsOf(c: Contract, asOf: string): '미시작' | '운행' | '반납' | '해지' {
  if (!c.contractDate || c.contractDate > asOf) return '미시작';
  const endDate = c.returnedDate ?? c.endedAt;
  if (endDate && endDate <= asOf) return c.status === '해지' ? '해지' : '반납';
  return '운행';
}

export default function AsOfPage() {
  const router = useRouter();
  const { isMaster, loading: roleLoading } = useRole();
  const { contracts } = useContracts();
  const [asOf, setAsOf] = useState(todayKr());
  const [onlyUnpaid, setOnlyUnpaid] = useState(true);

  const rows = useMemo(() => {
    return contracts
      .filter((c) => c.id && !c.id.startsWith('vehicle-orphan-') && c.contractDate && c.contractDate <= asOf)
      .map((c) => {
        const st = statusAsOf(c, asOf);
        const asOfC = computeContractAsOf(c, asOf);
        return { c, st, unpaidAsOf: asOfC.unpaidAmount ?? 0, unpaidNow: c.unpaidAmount ?? 0 };
      })
      .filter((r) => r.st !== '미시작')
      .filter((r) => !onlyUnpaid || r.unpaidAsOf > 0)
      .sort((a, b) => b.unpaidAsOf - a.unpaidAsOf);
  }, [contracts, asOf, onlyUnpaid]);

  const totalAsOf = useMemo(() => rows.reduce((s, r) => s + r.unpaidAsOf, 0), [rows]);

  if (!roleLoading && !isMaster) {
    router.replace('/');
    return null;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: 24, maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <header className="page-header" style={{ marginBottom: 16 }}>
          <h1 className="page-header-title">
            <ClockCounterClockwise size={18} weight="duotone" /> 시점 미수 조회 (as-of)
          </h1>
          <div className="page-header-title-sub">
            과거 어느 날짜든 "그 시점에 어떤 상태였고 미수가 얼마였나" 를 재구성. 그 날 이후 낸 입금은 제외.
          </div>
        </header>

        <div className="panel" style={{ marginBottom: 16 }}>
          <div style={{ padding: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              기준일
              <input type="date" className="input" value={asOf} max={todayKr()} onChange={(e) => setAsOf(e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} />
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={onlyUnpaid} onChange={(e) => setOnlyUnpaid(e.target.checked)} /> 미수 있는 계약만
            </label>
            <span style={{ marginLeft: 'auto', fontSize: 13 }}>
              {asOf} 기준 미수 <strong className="mono" style={{ color: 'var(--red-text)' }}>₩{formatCurrency(totalAsOf)}</strong> · {rows.length}건
            </span>
          </div>
        </div>

        <section className="panel">
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>계약자</th>
                  <th>차량</th>
                  <th>계약일</th>
                  <th className="center">상태(그 시점)</th>
                  <th className="num">미수(그 시점)</th>
                  <th className="num">미수(현재)</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <EmptyRow colSpan={6}>해당 시점 미수 계약 없음</EmptyRow>
                ) : rows.map((r) => (
                  <tr key={r.c.id}>
                    <td style={{ fontWeight: 600 }}>{r.c.customerName || '-'}</td>
                    <td className="mono dim">{r.c.vehiclePlate || '-'}</td>
                    <td className="mono dim">{r.c.contractDate || '-'}</td>
                    <td className="center">
                      <StatusBadge tone={r.st === '운행' ? 'green' : r.st === '해지' ? 'red' : 'gray'}>{r.st}</StatusBadge>
                    </td>
                    <td className="num mono" style={{ fontWeight: 700, color: r.unpaidAsOf > 0 ? 'var(--red-text)' : undefined }}>₩{formatCurrency(r.unpaidAsOf)}</td>
                    <td className="num mono dim">₩{formatCurrency(r.unpaidNow)}</td>
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
