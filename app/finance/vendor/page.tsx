'use client';

/**
 * /finance/vendor — 거래처별 입출금 집계 (파생).
 *
 * 입력: bank_tx + card_tx 의 counterparty / vendorId
 * 출력: 거래처별 입금합·출금합·순증감·최근거래일·거래건수
 *
 * Phase 1: stub (준비 중). 데이터는 이미 다 있음 — 가시화만 남음.
 */

import { useMemo } from 'react';
import { Buildings } from '@phosphor-icons/react';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { FINANCE_SUB } from '@/components/layout/sub-nav';
import { useBankTx, useCardTx } from '@/lib/firebase/transactions-store';
import { formatCurrency } from '@/lib/utils';
import { EmptyRow } from '@/components/ui/empty-row';

type VendorRow = {
  name: string;
  inSum: number;
  outSum: number;
  net: number;
  lastDate: string;
  count: number;
};

export default function FinanceVendorPage() {
  const { rows: bankTx } = useBankTx();
  const { rows: cardTx } = useCardTx();

  const vendorRows = useMemo<VendorRow[]>(() => {
    const m = new Map<string, VendorRow>();
    function add(name: string, inn: number, out: number, date: string) {
      if (!name) name = '(미지정)';
      const r = m.get(name) ?? { name, inSum: 0, outSum: 0, net: 0, lastDate: '', count: 0 };
      r.inSum += inn;
      r.outSum += out;
      r.net = r.inSum - r.outSum;
      if (date > r.lastDate) r.lastDate = date;
      r.count++;
      m.set(name, r);
    }
    for (const t of bankTx) {
      add(t.counterparty || '', t.amount ?? 0, t.withdraw ?? 0, (t.txDate ?? '').slice(0, 10));
    }
    for (const t of cardTx) {
      // CardTx 의 거래처 필드는 모델에 따라 다름 — counterparty 가 없으면 매칭 계약명
      const name = ('counterparty' in t ? (t as { counterparty?: string }).counterparty : undefined) ?? '';
      add(name, t.amount ?? 0, 0, (t.txDate ?? '').slice(0, 10));
    }
    return Array.from(m.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [bankTx, cardTx]);

  const total = useMemo(() => {
    let inn = 0, out = 0;
    for (const r of vendorRows) { inn += r.inSum; out += r.outSum; }
    return { inn, out, net: inn - out };
  }, [vendorRows]);

  return (
    <MasterPageShell
      title="거래처별 집계"
      icon={<Buildings size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      subNav={FINANCE_SUB}
    >
      <div className="dashboard">
        <div className="panel" style={{ marginBottom: 12 }}>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Kpi label="거래처 수" value={`${vendorRows.length}곳`} />
            <Kpi label="총 입금" value={`₩${formatCurrency(total.inn)}`} />
            <Kpi label="총 출금" value={`₩${formatCurrency(total.out)}`} />
            <Kpi label="순증감" value={`${total.net >= 0 ? '+' : ''}₩${formatCurrency(Math.abs(total.net))}`} tone={total.net >= 0 ? 'green' : 'red'} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-body">
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>거래처</th>
                  <th className="num">입금</th>
                  <th className="num">출금</th>
                  <th className="num">순증감</th>
                  <th className="center">건수</th>
                  <th className="center">최근거래일</th>
                </tr>
              </thead>
              <tbody>
                {vendorRows.length === 0 ? (
                  <EmptyRow colSpan={6}>거래처 데이터 없음 — bank_tx / card_tx 의 counterparty 채워지면 집계</EmptyRow>
                ) : vendorRows.map((r) => (
                  <tr key={r.name}>
                    <td><strong>{r.name}</strong></td>
                    <td className="num">{r.inSum ? `₩${formatCurrency(r.inSum)}` : '-'}</td>
                    <td className="num">{r.outSum ? `₩${formatCurrency(r.outSum)}` : '-'}</td>
                    <td className="num" style={{ color: r.net >= 0 ? 'var(--green-text)' : 'var(--red-text)', fontWeight: 700 }}>
                      {r.net >= 0 ? '+' : ''}₩{formatCurrency(Math.abs(r.net))}
                    </td>
                    <td className="center">{r.count}</td>
                    <td className="center mono">{r.lastDate || '-'}</td>
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
