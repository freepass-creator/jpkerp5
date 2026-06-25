'use client';

/**
 * /finance/gl — 총계정원장 (계정과목별 집계).
 *
 * 입력: bank_tx + card_tx 의 subject (계정과목)
 * 출력: 계정과목별 입금합·출금합·순증감·거래건수
 *
 * Phase 1: stub — 계정과목 1차 분류. 차후 세무 보고용 양식 export.
 */

import { useMemo } from 'react';
import { Receipt } from '@phosphor-icons/react';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { FINANCE_SUB } from '@/components/layout/sub-nav';
import { useBankTx, useCardTx } from '@/lib/firebase/transactions-store';
import { formatCurrency } from '@/lib/utils';
import { EmptyRow } from '@/components/ui/empty-row';

type GLRow = {
  subject: string;
  inSum: number;
  outSum: number;
  net: number;
  count: number;
};

export default function FinanceGLPage() {
  const { rows: bankTx, loading: bankLoading } = useBankTx();
  const { rows: cardTx, loading: cardLoading } = useCardTx();
  const dataLoading = bankLoading || cardLoading;

  const rows = useMemo<GLRow[]>(() => {
    const m = new Map<string, GLRow>();
    function add(subj: string, inn: number, out: number) {
      const key = subj || '(미분류)';
      const r = m.get(key) ?? { subject: key, inSum: 0, outSum: 0, net: 0, count: 0 };
      r.inSum += inn;
      r.outSum += out;
      r.net = r.inSum - r.outSum;
      r.count++;
      m.set(key, r);
    }
    for (const t of bankTx) add(t.subject ?? '', t.amount ?? 0, t.withdraw ?? 0);
    for (const t of cardTx) add(t.category ?? '', t.amount ?? 0, 0);
    return Array.from(m.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [bankTx, cardTx]);

  const total = useMemo(() => {
    let inn = 0, out = 0, count = 0;
    for (const r of rows) { inn += r.inSum; out += r.outSum; count += r.count; }
    return { inn, out, net: inn - out, count };
  }, [rows]);

  const unmatched = useMemo(() => rows.find((r) => r.subject === '(미분류)')?.count ?? 0, [rows]);

  return (
    <MasterPageShell
      title="총계정원장"
      icon={<Receipt size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      subNav={FINANCE_SUB}
    >
      <div className="dashboard">
        <div className="panel" style={{ marginBottom: 12 }}>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            <Kpi label="계정과목 수" value={`${rows.length}종`} />
            <Kpi label="총 입금" value={`₩${formatCurrency(total.inn)}`} tone="green" />
            <Kpi label="총 출금" value={`₩${formatCurrency(total.out)}`} tone="red" />
            <Kpi label="순증감" value={`${total.net >= 0 ? '+' : ''}₩${formatCurrency(Math.abs(total.net))}`} tone={total.net >= 0 ? 'green' : 'red'} />
            <Kpi label="미분류" value={`${unmatched}건`} tone={unmatched > 0 ? 'red' : undefined} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-body">
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>계정과목</th>
                  <th className="num">입금</th>
                  <th className="num">출금</th>
                  <th className="num">순증감</th>
                  <th className="center">건수</th>
                </tr>
              </thead>
              <tbody>
                {dataLoading ? (
                  <EmptyRow colSpan={5}>거래 데이터 불러오는 중…</EmptyRow>
                ) : rows.length === 0 ? (
                  <EmptyRow colSpan={5}>거래 데이터 없음</EmptyRow>
                ) : rows.map((r) => (
                  <tr key={r.subject}>
                    <td>
                      <strong>{r.subject}</strong>
                      {r.subject === '(미분류)' && (
                        <span className="muted" style={{ marginLeft: 6, fontSize: 10 }}>← 분류 필요</span>
                      )}
                    </td>
                    <td className="num">{r.inSum ? `₩${formatCurrency(r.inSum)}` : '-'}</td>
                    <td className="num">{r.outSum ? `₩${formatCurrency(r.outSum)}` : '-'}</td>
                    <td className="num" style={{ color: r.net >= 0 ? 'var(--green-text)' : 'var(--red-text)', fontWeight: 700 }}>
                      {r.net >= 0 ? '+' : ''}₩{formatCurrency(Math.abs(r.net))}
                    </td>
                    <td className="center">{r.count}</td>
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
