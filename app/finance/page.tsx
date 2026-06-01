'use client';

/**
 * /finance — 재무 관리 메인 (거래내역 ledger).
 * v4 finance/page.tsx 의 컬럼 구조 그대로 + jpkerp5 BankTx 데이터.
 * 표 기반 (대시보드 카드 X) — 자산/계약과 동일한 list-first 패턴.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bank, MagnifyingGlass, ArrowLeft } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { SubNav, FINANCE_SUB } from '@/components/layout/sub-nav';
import { useBankTx } from '@/lib/firebase/transactions-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useRole } from '@/lib/use-role';
import { buildCompanyOptions, matchesCompanyFilter, resolveCompanyKey } from '@/lib/filter-helpers';
import { displayCompanyName } from '@/lib/company-display';
import { formatCurrency } from '@/lib/utils';

const fmtNum = (v: number) => v ? v.toLocaleString('ko-KR') : '';

export default function FinancePage() {
  const router = useRouter();
  const { isMaster: master, loading: roleLoading } = useRole();
  useEffect(() => {
    if (!roleLoading && !master) router.replace('/');
  }, [master, roleLoading, router]);

  const { rows: bankTx } = useBankTx();
  const { contracts } = useContracts();
  const { companies: companyMaster } = useCompanies();

  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'deposit' | 'withdraw'>('all');

  const contractById = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts]);

  const companyOptions = useMemo(
    () => buildCompanyOptions(bankTx, (t) => resolveCompanyKey(t, contractById)),
    [bankTx, contractById],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bankTx
      .filter((t) => {
        if (directionFilter === 'deposit' && !((t.amount ?? 0) > 0)) return false;
        if (directionFilter === 'withdraw' && !((t.withdraw ?? 0) > 0)) return false;
        if (!matchesCompanyFilter(resolveCompanyKey(t, contractById), companyFilter)) return false;
        if (q) {
          const c = t.matchedContractId ? contractById.get(t.matchedContractId) : undefined;
          const hay = `${t.counterparty ?? ''} ${t.memo ?? ''} ${t.account ?? ''} ${t.subject ?? ''} ${c?.contractNo ?? ''} ${c?.customerName ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.txDate ?? '').localeCompare(a.txDate ?? ''));
  }, [bankTx, search, directionFilter, companyFilter, contractById]);

  const totals = useMemo(() => {
    let inSum = 0, outSum = 0;
    for (const t of filtered) {
      inSum += t.amount ?? 0;
      outSum += t.withdraw ?? 0;
    }
    return { inSum, outSum };
  }, [filtered]);

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <Bank size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>재무 관리</span>
          </div>
          <div className="topbar-search">
            <MagnifyingGlass size={14} className="icon" />
            <input
              className="input"
              placeholder="거래상대 / 적요 / 계좌 / 계정과목 / 계약자"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="filter-bar">
            <select
              className="input-compact" data-w="md"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              title="회사별 필터"
            >
              <option value="all">회사: 전체</option>
              {companyOptions.map((co) => (
                <option key={co} value={co}>{displayCompanyName(co, companyMaster)}</option>
              ))}
            </select>
            <select
              className="input-compact" data-w="md"
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value as 'all' | 'deposit' | 'withdraw')}
              title="입출금 방향"
            >
              <option value="all">입출금 전체</option>
              <option value="deposit">입금만</option>
              <option value="withdraw">출금만</option>
            </select>
          </div>
          <div className="topbar-stats">
            <span>전체<strong>{bankTx.length}</strong></span>
            <span>표시<strong>{filtered.length}</strong></span>
            <span className="sep" />
            <span style={{ color: 'var(--green-text)' }}>입금<strong className="mono">₩{formatCurrency(totals.inSum)}</strong></span>
            <span style={{ color: 'var(--red-text)' }}>출금<strong className="mono">₩{formatCurrency(totals.outSum)}</strong></span>
          </div>
        </header>

        <SubNav items={FINANCE_SUB} />

        <div className="dashboard" style={{ gridTemplateColumns: '1fr' }}>
          <div className="panel">
            <div className="panel-body">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>회사</th>
                    <th style={{ width: 130 }}>계좌</th>
                    <th style={{ width: 110 }}>거래일시</th>
                    <th className="num" style={{ width: 110 }}>입금</th>
                    <th className="num" style={{ width: 110 }}>출금</th>
                    <th className="num" style={{ width: 120 }}>잔액</th>
                    <th>적요</th>
                    <th style={{ width: 140 }}>상대</th>
                    <th style={{ width: 90 }}>거래방법</th>
                    <th style={{ width: 100 }}>계정과목</th>
                    <th style={{ width: 110 }}>매칭 계약</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="muted center" style={{ padding: 32 }}>
                        거래내역 없음 — 입출금 관리에서 등록
                      </td>
                    </tr>
                  ) : filtered.map((t) => {
                    const c = t.matchedContractId ? contractById.get(t.matchedContractId) : undefined;
                    const co = resolveCompanyKey(t, contractById);
                    return (
                      <tr key={t.id}>
                        <td className="dim">{co ? displayCompanyName(co, companyMaster) : '-'}</td>
                        <td className="mono dim" style={{ fontSize: 11 }}>{t.account ?? '-'}</td>
                        <td className="mono">{(t.txDate ?? '').slice(0, 10)}</td>
                        <td className="num mono" style={{ color: (t.amount ?? 0) > 0 ? 'var(--green-text)' : 'var(--text-weak)' }}>
                          {fmtNum(t.amount ?? 0) || '-'}
                        </td>
                        <td className="num mono" style={{ color: (t.withdraw ?? 0) > 0 ? 'var(--red-text)' : 'var(--text-weak)' }}>
                          {fmtNum(t.withdraw ?? 0) || '-'}
                        </td>
                        <td className="num mono dim">{fmtNum(t.balance ?? 0) || '-'}</td>
                        <td>{t.memo || t.counterparty || '-'}</td>
                        <td className="dim">{t.counterparty || '-'}</td>
                        <td className="dim">{t.method || '-'}</td>
                        <td>{t.subject || <span className="muted">미지정</span>}</td>
                        <td className="mono dim" style={{ fontSize: 11 }}>
                          {c ? `${c.contractNo}` : '-'}
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
          left={<button className="btn btn-primary" type="button">+ 거래 등록</button>}
          right={<button className="btn" type="button">엑셀</button>}
        />
      </div>
    </div>
  );
}
