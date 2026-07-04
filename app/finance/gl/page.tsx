'use client';

/**
 * /finance/gl — 총계정원장 (계정과목별 차변·대변·잔액).
 *
 * 분개 엔진(lib/gl-entries — buildAllJournals/summarizeByAccount) 기반 복식부기.
 * 기존 subject 단순합산 stub 은 ① 내부이체 미제외 ② 법인카드 지출을 입금 합산
 * ③ CMS 묶음 이중집계로 숫자가 왜곡됐음 → 엔진으로 교체 (/finance 총계정원장 view 와 동일 산식).
 */

import { useMemo } from 'react';
import { Receipt } from '@phosphor-icons/react';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { FINANCE_SUB } from '@/components/layout/sub-nav';
import { useBankTx, useCardTx } from '@/lib/firebase/transactions-store';
import { buildAllJournals, summarizeByAccount, CLASS_LABEL, type AccountClass, type LedgerSummary } from '@/lib/gl-entries';
import { formatCurrency } from '@/lib/utils';
import { EmptyRow } from '@/components/ui/empty-row';

const CLASS_ORDER: AccountClass[] = ['asset', 'liability', 'revenue', 'expense', 'equity'];

export default function FinanceGLPage() {
  const { rows: bankTx, loading: bankLoading } = useBankTx();
  const { rows: cardTx, loading: cardLoading } = useCardTx();
  const dataLoading = bankLoading || cardLoading;

  const journals = useMemo(() => buildAllJournals(bankTx, cardTx), [bankTx, cardTx]);
  const summary = useMemo<LedgerSummary[]>(() => summarizeByAccount(journals), [journals]);

  const grouped = useMemo(() => {
    const g = new Map<AccountClass, LedgerSummary[]>();
    for (const s of summary) {
      const arr = g.get(s.account.class) ?? [];
      arr.push(s);
      g.set(s.account.class, arr);
    }
    return g;
  }, [summary]);

  const totalDebit = useMemo(() => journals.reduce((s, j) => s + j.amount, 0), [journals]);

  return (
    <MasterPageShell
      title="총계정원장"
      icon={<Receipt size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      subNav={FINANCE_SUB}
    >
      <div className="dashboard">
        <div className="panel" style={{ marginBottom: 12 }}>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Kpi label="계정과목" value={`${summary.length}종`} />
            <Kpi label="분개" value={`${journals.length}건`} />
            <Kpi label="차변 합" value={`₩${formatCurrency(totalDebit)}`} tone="green" />
            <Kpi label="대변 합" value={`₩${formatCurrency(totalDebit)}`} tone="red" />
          </div>
          <div style={{ padding: '0 16px 12px', fontSize: 11, color: 'var(--text-sub)' }}>
            자동 분개 (계좌·자동이체·카드매출·법인카드) — 내부이체 제외 · CMS 묶음 중복 제거 · 복식부기 (차변=대변).
            회사·기간 필터가 필요하면 [입출금·카드] → 총계정원장 view 사용.
          </div>
        </div>

        <div className="panel">
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: 70 }}>분류</th>
                  <th style={{ width: 70 }}>코드</th>
                  <th>계정과목</th>
                  <th className="num" style={{ width: 140 }}>차변</th>
                  <th className="num" style={{ width: 140 }}>대변</th>
                  <th className="num" style={{ width: 140 }}>잔액</th>
                  <th className="center" style={{ width: 70 }}>건수</th>
                </tr>
              </thead>
              <tbody>
                {dataLoading ? (
                  <EmptyRow colSpan={7}>거래 데이터 불러오는 중…</EmptyRow>
                ) : summary.length === 0 ? (
                  <EmptyRow colSpan={7}>분개 없음 — 입출금 관리에서 거래 등록</EmptyRow>
                ) : CLASS_ORDER.flatMap((cls) => {
                  const rows = grouped.get(cls) ?? [];
                  return rows.map((s, i) => (
                    <tr key={s.accountKey}>
                      <td className="dim">{i === 0 ? CLASS_LABEL[cls] : ''}</td>
                      <td className="mono dim">{s.account.code}</td>
                      <td style={{ fontWeight: 600 }}>{s.account.name}</td>
                      <td className="num mono">{s.debit ? `₩${formatCurrency(s.debit)}` : '-'}</td>
                      <td className="num mono">{s.credit ? `₩${formatCurrency(s.credit)}` : '-'}</td>
                      <td className="num mono" style={{ fontWeight: 700 }}>
                        ₩{formatCurrency(Math.abs(s.balance))}
                      </td>
                      <td className="center dim">{s.entryCount}</td>
                    </tr>
                  ));
                })}
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
