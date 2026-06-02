'use client';

/**
 * /finance/daily — 자금일보 standalone.
 * BankTx + CardTx 를 회사·일자별로 집계 (입출금관리 페이지의 summary 탭과 동일 로직).
 * 세무사 전달용 엑셀 다운로드 진입점.
 */

import { useMemo } from 'react';
import { ChartBar, DownloadSimple } from '@phosphor-icons/react';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { FINANCE_SUB } from '@/components/layout/sub-nav';
import { BottomBar } from '@/components/layout/bottom-bar';
import { useBankTx, useCardTx } from '@/lib/firebase/transactions-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { displayCompanyName } from '@/lib/company-display';
import { downloadDailyLedgerExcel } from '@/lib/ledger-export';
import { formatCurrency } from '@/lib/utils';

type DailyRow = {
  key: string; companyCode: string; date: string;
  txCount: number; deposit: number; withdraw: number; netChange: number; endBalance: number;
  depoSubjects: string; drawSubjects: string;
};

export default function FinanceDailyPage() {
  const { rows: bankTx } = useBankTx();
  const { rows: cardTx } = useCardTx();
  const { contracts } = useContracts();
  const { companies: companyMaster } = useCompanies();

  const contractById = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts]);

  const daily = useMemo<DailyRow[]>(() => {
    const m = new Map<string, DailyRow & { _depo: Record<string, number>; _draw: Record<string, number> }>();
    function bucket(companyCode: string, day: string) {
      const k = `${companyCode}|${day}`;
      let cur = m.get(k);
      if (!cur) {
        cur = {
          key: k, companyCode, date: day, txCount: 0,
          deposit: 0, withdraw: 0, netChange: 0, endBalance: 0,
          depoSubjects: '', drawSubjects: '',
          _depo: {}, _draw: {},
        };
        m.set(k, cur);
      }
      return cur;
    }
    for (const t of bankTx) {
      const day = (t.txDate ?? '').slice(0, 10);
      if (!day) continue;
      const companyCode = t.companyCode || (t.matchedContractId && contractById.get(t.matchedContractId)?.company) || '(미지정)';
      const cur = bucket(companyCode, day);
      cur.deposit += t.amount ?? 0;
      cur.withdraw += t.withdraw ?? 0;
      cur.netChange = cur.deposit - cur.withdraw;
      cur.endBalance = t.balance ?? cur.endBalance;
      const subj = t.subject || ((t.amount ?? 0) > 0 ? '대여료수입' : undefined);
      if (subj && (t.amount ?? 0) > 0) cur._depo[subj] = (cur._depo[subj] ?? 0) + (t.amount ?? 0);
      if (subj && (t.withdraw ?? 0) > 0) cur._draw[subj] = (cur._draw[subj] ?? 0) + (t.withdraw ?? 0);
      cur.txCount++;
    }
    for (const t of cardTx) {
      if ((t.kind ?? '매출') !== '매출') continue;
      const day = (t.txDate ?? '').slice(0, 10);
      if (!day) continue;
      const companyCode = (t.matchedContractId && contractById.get(t.matchedContractId)?.company) || '(미지정)';
      const cur = bucket(companyCode, day);
      cur.deposit += t.amount ?? 0;
      cur.netChange = cur.deposit - cur.withdraw;
      cur._depo['카드매출'] = (cur._depo['카드매출'] ?? 0) + (t.amount ?? 0);
      cur.txCount++;
    }
    return Array.from(m.values()).map(({ _depo, _draw, ...rest }) => ({
      ...rest,
      depoSubjects: Object.entries(_depo).map(([s, v]) => `${s} ₩${v.toLocaleString('ko-KR')}`).join(' / '),
      drawSubjects: Object.entries(_draw).map(([s, v]) => `${s} ₩${v.toLocaleString('ko-KR')}`).join(' / '),
    })).sort((a, b) => b.date.localeCompare(a.date) || a.companyCode.localeCompare(b.companyCode));
  }, [bankTx, cardTx, contractById]);

  const totals = useMemo(() => {
    let inSum = 0, outSum = 0;
    for (const r of daily) { inSum += r.deposit; outSum += r.withdraw; }
    return { inSum, outSum };
  }, [daily]);

  function handleExport() {
    const dailyRows = daily.map((r) => ({
      companyCode: r.companyCode,
      date: r.date,
      txCount: r.txCount,
      deposit: r.deposit,
      withdraw: r.withdraw,
      netChange: r.netChange,
      endBalance: r.endBalance,
      depoSubjects: r.depoSubjects,
      drawSubjects: r.drawSubjects,
    }));
    const ledger = bankTx.map((t) => {
      const c = t.matchedContractId ? contractById.get(t.matchedContractId) : undefined;
      return {
        txDate: t.txDate ?? '',
        companyCode: t.companyCode || c?.company || '(미지정)',
        account: t.account ?? '',
        subject: t.subject ?? '',
        counterparty: t.counterparty ?? '',
        memo: t.memo ?? '',
        deposit: t.amount ?? 0,
        withdraw: t.withdraw ?? 0,
        balance: t.balance ?? 0,
        matchedContractNo: c?.contractNo ?? '',
        matchedScheduleSeq: t.matchedScheduleSeq ?? ('' as const),
      };
    });
    downloadDailyLedgerExcel(dailyRows, ledger, { title: '자금일보' });
  }

  return (
    <MasterPageShell
      title="자금일보"
      icon={<ChartBar size={16} weight="fill" style={{ color: 'var(--orange-text, #c2410c)' }} />}
      subNav={FINANCE_SUB}
      stats={
        <>
          <span>일자<strong>{daily.length}</strong></span>
          <span className="sep" />
          <span style={{ color: 'var(--green-text)' }}>입금<strong className="mono">₩{formatCurrency(totals.inSum)}</strong></span>
          <span style={{ color: 'var(--red-text)' }}>출금<strong className="mono">₩{formatCurrency(totals.outSum)}</strong></span>
          <span>순증감<strong className="mono" style={{ color: totals.inSum - totals.outSum < 0 ? 'var(--red-text)' : 'var(--text-main)' }}>₩{formatCurrency(totals.inSum - totals.outSum)}</strong></span>
        </>
      }
      bottomBar={
        <BottomBar
          left={
            <button className="btn btn-primary" type="button" onClick={handleExport} title="자금일보 엑셀 (세무사 공유용)">
              <DownloadSimple size={12} weight="bold" /> 엑셀 다운로드
            </button>
          }
          right={null}
        />
      }
    >
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 90 }}>회사</th>
            <th style={{ width: 110 }}>일자</th>
            <th className="num" style={{ width: 80 }}>거래</th>
            <th className="num" style={{ width: 130 }}>입금합계</th>
            <th className="num" style={{ width: 130 }}>출금합계</th>
            <th className="num" style={{ width: 130 }}>순증감</th>
            <th className="num" style={{ width: 130 }}>잔액</th>
            <th>계정과목 소계</th>
          </tr>
        </thead>
        <tbody>
          {daily.length === 0 ? (
            <tr><td colSpan={8} className="muted center" style={{ padding: 32 }}>거래 내역 없음 — 입출금관리에서 등록</td></tr>
          ) : daily.map((r) => (
            <tr key={r.key}>
              <td className="dim">{displayCompanyName(r.companyCode, companyMaster)}</td>
              <td className="mono">{r.date}</td>
              <td className="num mono">{r.txCount}</td>
              <td className="num mono" style={{ color: 'var(--green-text)' }}>{r.deposit > 0 ? `₩${formatCurrency(r.deposit)}` : '-'}</td>
              <td className="num mono" style={{ color: 'var(--red-text)' }}>{r.withdraw > 0 ? `₩${formatCurrency(r.withdraw)}` : '-'}</td>
              <td className="num mono" style={{ color: r.netChange < 0 ? 'var(--red-text)' : undefined }}>₩{formatCurrency(r.netChange)}</td>
              <td className="num mono dim">{r.endBalance ? `₩${formatCurrency(r.endBalance)}` : '-'}</td>
              <td className="dim" style={{ fontSize: 11 }}>{r.depoSubjects}{r.drawSubjects && r.depoSubjects && ' · '}{r.drawSubjects}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </MasterPageShell>
  );
}
