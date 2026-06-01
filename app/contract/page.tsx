'use client';

/**
 * 계약 관리 — 마스터 전용 디테일 관리.
 *
 * 운영현황(/) 은 직원용 일상 슬라이스, /contract 는 마스터용 계약 마스터.
 * v4 sub-pages: /contract/customer · /contract/expire · /contract/return · /contract/overdue · /contract/schedule
 *
 * Phase 1: 계약 리스트 + 계약자별 묶음 보기.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, MagnifyingGlass, ArrowLeft } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { SubNav, CONTRACT_SUB } from '@/components/layout/sub-nav';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useRole } from '@/lib/use-role';
import { buildCompanyOptions, matchesCompanyFilter } from '@/lib/filter-helpers';
import { displayCompanyName } from '@/lib/company-display';
import { todayKr } from '@/lib/mock-data';

export default function ContractPage() {
  const router = useRouter();
  const { isMaster: master, loading: roleLoading } = useRole();
  useEffect(() => {
    if (!roleLoading && !master) router.replace('/');
  }, [master, roleLoading, router]);

  const { contracts } = useContracts();
  const { companies: companyMaster } = useCompanies();

  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | '운행' | '대기' | '반납' | '해지' | '채권'>('all');
  const [groupBy, setGroupBy] = useState<'list' | 'customer'>('list');

  const today = todayKr();

  const companyOptions = useMemo(
    () => buildCompanyOptions(contracts, (c) => c.company),
    [contracts],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contracts.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!matchesCompanyFilter(c.company, companyFilter)) return false;
      if (q) {
        const hay = `${c.customerName} ${c.vehiclePlate} ${c.vehicleModel} ${c.contractNo} ${c.customerPhone1 ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [contracts, search, statusFilter, companyFilter]);

  // 계약자별 묶음 (customerName 기준)
  const byCustomer = useMemo(() => {
    const m = new Map<string, typeof filtered>();
    for (const c of filtered) {
      const k = c.customerName || '미상';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(c);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <FileText size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>계약 관리</span>
          </div>
          <div className="topbar-search">
            <MagnifyingGlass size={14} className="icon" />
            <input
              className="input"
              placeholder="계약자 / 차량 / 계약번호 / 연락처"
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
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              title="상태별 필터"
            >
              <option value="all">상태: 전체</option>
              <option value="운행">운행</option>
              <option value="대기">대기</option>
              <option value="반납">반납</option>
              <option value="해지">해지</option>
              <option value="채권">채권</option>
            </select>
            <span className="filter-divider" />
            <button type="button" className={`chip ${groupBy === 'list' ? 'active' : ''}`} onClick={() => setGroupBy('list')}>전체 리스트</button>
            <button type="button" className={`chip ${groupBy === 'customer' ? 'active' : ''}`} onClick={() => setGroupBy('customer')}>계약자별 묶음</button>
          </div>
        </header>

        <SubNav items={CONTRACT_SUB} />

        <div className="dashboard" style={{ gridTemplateColumns: '1fr' }}>
          <div className="panel">
            <div className="panel-body">
              {groupBy === 'list' ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>회사</th>
                      <th style={{ width: 110 }}>계약번호</th>
                      <th style={{ width: 90 }}>차량번호</th>
                      <th>계약자</th>
                      <th style={{ width: 110 }}>연락처</th>
                      <th style={{ width: 90 }}>계약일</th>
                      <th style={{ width: 90 }}>만기일</th>
                      <th className="num" style={{ width: 100 }}>월대여료</th>
                      <th className="num" style={{ width: 100 }}>보증금</th>
                      <th style={{ width: 60 }}>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={10} className="muted center" style={{ padding: 32 }}>계약 없음</td></tr>
                    ) : filtered.map((c) => (
                      <tr key={c.id} onClick={() => router.push(`/contract/${c.id}`)} style={{ cursor: 'pointer' }}>
                        <td className="dim">{c.company ? displayCompanyName(c.company, companyMaster) : '-'}</td>
                        <td className="mono">{c.contractNo}</td>
                        <td className="mono">{c.vehiclePlate}</td>
                        <td>{c.customerName}</td>
                        <td className="mono dim">{c.customerPhone1 || '-'}</td>
                        <td className="mono">{c.contractDate}</td>
                        <td className="mono dim">{c.returnScheduledDate || '-'}</td>
                        <td className="num mono">₩{(c.monthlyRent ?? 0).toLocaleString()}</td>
                        <td className="num mono">₩{(c.deposit ?? 0).toLocaleString()}</td>
                        <td><span className={`status ${c.status}`}>{c.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>계약자</th>
                      <th className="center" style={{ width: 64 }}>계약수</th>
                      <th>차량들</th>
                      <th className="num" style={{ width: 130 }}>총 미수금</th>
                      <th className="num" style={{ width: 130 }}>월 대여료 합</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCustomer.length === 0 ? (
                      <tr><td colSpan={5} className="muted center" style={{ padding: 32 }}>—</td></tr>
                    ) : byCustomer.map(([name, list]) => {
                      const totalUnpaid = list.reduce((s, c) => s + (c.unpaidAmount ?? 0), 0);
                      const totalMonthly = list.reduce((s, c) => s + (c.monthlyRent ?? 0), 0);
                      return (
                        <tr key={name}>
                          <td><strong>{name}</strong></td>
                          <td className="center">{list.length}</td>
                          <td>
                            {list.map((c) => (
                              <span key={c.id} className="mono" style={{ marginRight: 8, fontSize: 11 }}>
                                {c.vehiclePlate} <span className="dim">{c.status}</span>
                              </span>
                            ))}
                          </td>
                          <td className="num mono" style={{ color: totalUnpaid > 0 ? 'var(--red-text)' : undefined }}>
                            ₩{totalUnpaid.toLocaleString()}
                          </td>
                          <td className="num mono">₩{totalMonthly.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <BottomBar
          left={<Link href="/" className="btn"><ArrowLeft size={12} /> 운영 현황</Link>}
          right={
            <>
              <span>계약 <strong>{filtered.length}</strong>건</span>
              {groupBy === 'customer' && (
                <>
                  <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
                  <span>고객 <strong>{byCustomer.length}</strong>명</span>
                </>
              )}
              <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
              <span className="dim" style={{ fontSize: 11 }}>오늘 {today}</span>
            </>
          }
        />
      </div>
    </div>
  );
}
