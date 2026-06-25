'use client';

/**
 * /finance/customer — 임차인별 입출금 집계 (파생).
 *
 * 입력: contracts (계약자별 청구·입금)
 * 출력: 임차인별 청구합·입금합·미수금·계약수·최근입금일
 *
 * Phase 1: stub — 계약 기반 1차 집계. 추후 우편/세금계산서 발행도 연동 가능.
 */

import { useMemo } from 'react';
import { User } from '@phosphor-icons/react';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { FINANCE_SUB } from '@/components/layout/sub-nav';
import { useContracts } from '@/lib/firebase/contracts-store';
import { formatCurrency } from '@/lib/utils';
import { EmptyRow } from '@/components/ui/empty-row';
import { isContractEnded } from '@/lib/contract-lifecycle';

type CustRow = {
  name: string;
  contractCount: number;
  billed: number;        // 누적 청구
  paid: number;          // 누적 입금
  unpaid: number;        // 미수
  active: number;        // 운영중 계약 수
  lastPaidDate: string;
};

export default function FinanceCustomerPage() {
  const { contracts, loading: contractsLoading } = useContracts();

  const rows = useMemo<CustRow[]>(() => {
    const m = new Map<string, CustRow>();
    for (const c of contracts) {
      const name = c.customerName || '(미지정)';
      const r = m.get(name) ?? {
        name, contractCount: 0, billed: 0, paid: 0, unpaid: 0, active: 0, lastPaidDate: '',
      };
      r.contractCount++;
      if (!isContractEnded(c)) r.active++;
      // schedules 청구 누적 + 입금 누적
      const schedules = c.schedules ?? [];
      for (const s of schedules) {
        r.billed += s.amount ?? 0;
        r.paid += s.paidAmount ?? 0;
      }
      r.unpaid += c.unpaidAmount ?? 0;
      if (c.lastPaidDate && c.lastPaidDate > r.lastPaidDate) r.lastPaidDate = c.lastPaidDate;
      m.set(name, r);
    }
    return Array.from(m.values()).sort((a, b) => b.unpaid - a.unpaid || b.billed - a.billed);
  }, [contracts]);

  const total = useMemo(() => {
    let billed = 0, paid = 0, unpaid = 0;
    for (const r of rows) { billed += r.billed; paid += r.paid; unpaid += r.unpaid; }
    return { billed, paid, unpaid };
  }, [rows]);

  return (
    <MasterPageShell
      title="임차인별 집계"
      icon={<User size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      subNav={FINANCE_SUB}
    >
      <div className="dashboard">
        <div className="panel" style={{ marginBottom: 12 }}>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Kpi label="임차인 수" value={`${rows.length}명`} />
            <Kpi label="누적 청구" value={`₩${formatCurrency(total.billed)}`} />
            <Kpi label="누적 입금" value={`₩${formatCurrency(total.paid)}`} tone="green" />
            <Kpi label="총 미수" value={`₩${formatCurrency(total.unpaid)}`} tone={total.unpaid > 0 ? 'red' : undefined} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-body">
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>임차인</th>
                  <th className="center">계약수 (운영중)</th>
                  <th className="num">청구</th>
                  <th className="num">입금</th>
                  <th className="num">미수</th>
                  <th className="center">최근입금일</th>
                </tr>
              </thead>
              <tbody>
                {contractsLoading ? (
                  <EmptyRow colSpan={6}>임차인 데이터 불러오는 중…</EmptyRow>
                ) : rows.length === 0 ? (
                  <EmptyRow colSpan={6}>임차인 데이터 없음</EmptyRow>
                ) : rows.map((r) => (
                  <tr key={r.name}>
                    <td><strong>{r.name}</strong></td>
                    <td className="center">{r.contractCount} ({r.active})</td>
                    <td className="num">{r.billed ? `₩${formatCurrency(r.billed)}` : '-'}</td>
                    <td className="num">{r.paid ? `₩${formatCurrency(r.paid)}` : '-'}</td>
                    <td className="num" style={{ color: r.unpaid > 0 ? 'var(--red-text)' : 'var(--text-weak)', fontWeight: r.unpaid > 0 ? 700 : 400 }}>
                      {r.unpaid > 0 ? `₩${formatCurrency(r.unpaid)}` : '-'}
                    </td>
                    <td className="center mono">{r.lastPaidDate || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MasterPageShell>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) {
  const color = tone === 'green' ? 'var(--green-text)' : tone === 'red' ? 'var(--red-text)' : 'var(--text-main)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  );
}
