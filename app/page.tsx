'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Buildings, MagnifyingGlass, ArrowsClockwise, Truck, ArrowUDownLeft, Warning, ChatCircleDots, X, CurrencyKrw, SignOut } from '@phosphor-icons/react';
import { useAuth, logout } from '@/lib/use-auth';
import {
  TODAY,
  buildDeliveries,
  buildReturns,
  buildOverdue,
} from '@/lib/mock-data';
import { formatCurrency, formatDate, daysSince, formatPeriod, dateWithDow } from '@/lib/utils';
import type { Contract } from '@/lib/types';
import { useContracts } from '@/lib/firebase/contracts-store';
import { ContractDetailDialog } from '@/components/contract-detail-dialog';
import { CreateDialog } from '@/components/create-dialog';
import { ExtendPopover } from '@/components/extend-popover';
import { SmsDialog } from '@/components/sms-dialog';
import { PaymentLedgerDialog } from '@/components/payment-ledger-dialog';

type View = '전체' | '계약중' | '휴차' | '미수';
const VIEWS: View[] = ['전체', '계약중', '휴차', '미수'];

/** 계약중 = 아직 반납·해지 안된 진행 계약 (운행·대기·휴차·채권 포함) */
function isActiveContract(c: Contract): boolean {
  if (c.returnedDate) return false;
  return c.status !== '반납' && c.status !== '해지';
}

/** 운행 중 = 인도 완료 + 미반납 + 미해지 (= 고객에게 출고된 상태) */
function isRunning(c: Contract): boolean {
  return !!c.deliveredDate && !c.returnedDate && c.status !== '해지';
}

function matchesView(c: Contract, v: View): boolean {
  if (v === '전체') return true;
  if (v === '계약중') return isRunning(c);
  // 휴차 = "계약중이 아닌 모든 차" — 구매대기/등록/상품화/상품대기/반납/대기 등 비운행 전체
  if (v === '휴차') return !isRunning(c);
  if (v === '미수') return c.unpaidAmount > 0;
  return true;
}

function matchesCompany(c: Contract, co: string): boolean {
  return co === '전체' || c.company === co;
}

/** 컬럼 정렬 키 — 수동 정렬 시 클릭한 컬럼명 */
type SortCol = '회사' | '차량상태' | '차량번호' | '차종' | '계약자' | '연락처' | '계약상태' | '계약기간' | '반납까지' | '수납상태' | '미수금' | '담당';
type SortDir = 'asc' | 'desc';

const VS_ORDER: VehicleState[] = ['구매대기', '등록대기', '상품화중', '인도대기', '계약완료', '휴차', '반납'];
const CS_ORDER: ContractState[] = ['위반', '미수검', '정상'];
const PS_ORDER: PaymentState[] = ['미납', '정상'];

function compareForCol(a: Contract, b: Contract, col: SortCol): number {
  switch (col) {
    case '회사': return a.company.localeCompare(b.company);
    case '차량상태': return VS_ORDER.indexOf(getVehicleState(a).name) - VS_ORDER.indexOf(getVehicleState(b).name);
    case '차량번호': return a.vehiclePlate.localeCompare(b.vehiclePlate);
    case '차종': return a.vehicleModel.localeCompare(b.vehicleModel);
    case '계약자': return a.customerName.localeCompare(b.customerName);
    case '연락처': return a.customerPhone1.localeCompare(b.customerPhone1);
    case '계약상태': return CS_ORDER.indexOf(getContractState(a).name) - CS_ORDER.indexOf(getContractState(b).name);
    case '계약기간': return a.contractDate.localeCompare(b.contractDate);
    case '반납까지': {
      const aD = a.returnScheduledDate ?? '9999-12-31';
      const bD = b.returnScheduledDate ?? '9999-12-31';
      return aD.localeCompare(bD);
    }
    case '수납상태': {
      const pa = getPaymentState(a);
      const pb = getPaymentState(b);
      const oa = PS_ORDER.indexOf(pa.name);
      const ob = PS_ORDER.indexOf(pb.name);
      if (oa !== ob) return oa - ob;
      return pb.days - pa.days; // 같은 상태면 일수 큰 순
    }
    case '미수금': return a.unpaidAmount - b.unpaidAmount;
    case '담당': return (a.manager ?? '').localeCompare(b.manager ?? '');
    default: return 0;
  }
}

/** 퀵필터별 기본 정렬 — 가장 시급한/관련성 높은 행이 위로 */
function sortComparator(view: View): (a: Contract, b: Contract) => number {
  if (view === '미수') {
    // 연체 일수 많은 순 (오래된 미수 먼저)
    return (a, b) => {
      const da = getPaymentState(a).days;
      const db = getPaymentState(b).days;
      return db - da;
    };
  }
  if (view === '휴차') {
    // 휴차 일수 많은 순
    return (a, b) => {
      const da = getVehicleState(a).days;
      const db = getVehicleState(b).days;
      return db - da;
    };
  }
  if (view === '계약중') {
    // 반납 가까운 순 (D-day 작은 순)
    return (a, b) => {
      const aD = a.returnScheduledDate || '9999-12-31';
      const bD = b.returnScheduledDate || '9999-12-31';
      return aD.localeCompare(bD);
    };
  }
  // 전체: 최근 계약 등록 순 (desc)
  return (a, b) => b.contractDate.localeCompare(a.contractDate);
}

function sortLabel(view: View): string {
  switch (view) {
    case '미수': return '연체 오래된 순';
    case '휴차': return '휴차 오래된 순';
    case '계약중': return '반납 임박 순';
    default: return '최근 등록 순';
  }
}

/** 차량상태 (7종) — 차량 전체 라이프사이클 */
type VehicleState = '구매대기' | '등록대기' | '상품화중' | '인도대기' | '계약완료' | '휴차' | '반납';

function getVehicleState(c: Contract): { name: VehicleState; days: number } {
  // Post-delivery 우선
  if (c.vehicleStatus === '휴차') {
    return { name: '휴차', days: c.idleSince ? daysSince(c.idleSince, TODAY) : 0 };
  }
  if (c.returnedDate || c.status === '반납') {
    return { name: '반납', days: c.returnedDate ? daysSince(c.returnedDate, TODAY) : 0 };
  }
  // Pre-delivery phases — 각 phase 시작일부터 경과
  if (c.vehicleStatus === '구매대기') {
    return { name: '구매대기', days: daysSince(c.contractDate, TODAY) };
  }
  if (c.vehicleStatus === '등록대기') {
    return { name: '등록대기', days: daysSince(c.purchasedDate ?? c.contractDate, TODAY) };
  }
  if (c.vehicleStatus === '상품화중') {
    return { name: '상품화중', days: daysSince(c.registeredDate ?? c.contractDate, TODAY) };
  }
  if (c.vehicleStatus === '인도대기' || c.vehicleStatus === '출고대기' || !c.deliveredDate || c.status === '대기') {
    return { name: '인도대기', days: daysSince(c.readiedDate ?? c.contractDate, TODAY) };
  }
  // 인도 완료 = 계약완료
  return { name: '계약완료', days: daysSince(c.deliveredDate, TODAY) };
}

/** 계약상태 (3종) — 컴플라이언스 (정기검사·위반) */
type ContractState = '정상' | '미수검' | '위반';
function getContractState(c: Contract): { name: ContractState; days: number } {
  const inspectionOverdue = !!(c.inspectionDueDate && c.inspectionDueDate < TODAY);
  const hasViolations = !!c.hasViolations;
  // 위반이 미수검보다 우선 (둘 다 있을 시 위반 표시)
  if (hasViolations) {
    return { name: '위반', days: c.violationSince ? daysSince(c.violationSince, TODAY) : 0 };
  }
  if (inspectionOverdue) {
    return { name: '미수검', days: daysSince(c.inspectionDueDate!, TODAY) };
  }
  // 정상 = 컴플라이언스 OK 유지 일수 = 계약 시작일부터
  return { name: '정상', days: daysSince(c.contractDate, TODAY) };
}

/** 수납상태 (2종) — 결제 건전성 */
type PaymentState = '정상' | '미납';
function getPaymentState(c: Contract): { name: PaymentState; days: number } {
  if (c.unpaidAmount <= 0) {
    return { name: '정상', days: daysSince(c.lastPaidDate ?? c.contractDate, TODAY) };
  }
  // 미납 = 최근 입금 후 30일+ 시점부터 = 미납 발생일부터
  const ref = c.lastPaidDate || c.contractDate;
  const days = Math.max(0, daysSince(ref, TODAY) - 30);
  return { name: '미납', days };
}

export default function Page() {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>('전체');
  const [companyFilter, setCompanyFilter] = useState<string>('전체');
  const [manualSort, setManualSort] = useState<{ col: SortCol; dir: SortDir } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Firebase RTDB 실시간 구독 — /icar001/contracts
  const { contracts, loading: contractsLoading, update: rtdbUpdate } = useContracts();

  // selectedId를 기준으로 fresh contract 참조 (업데이트 시 자동 반영)
  const selected = useMemo(
    () => contracts.find((c) => c.id === selectedId) ?? null,
    [contracts, selectedId]
  );

  const updateContract = useCallback((updated: Contract) => {
    void rtdbUpdate(updated);
  }, [rtdbUpdate]);

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // 퀵필터 변경 시 수동 정렬·선택 초기화 (필터 의도된 자동 정렬 우선)
  useEffect(() => { setManualSort(null); setSelectedIds(new Set()); }, [view]);

  function toggleSort(col: SortCol) {
    setManualSort((prev) => {
      if (!prev || prev.col !== col) return { col, dir: 'asc' };
      if (prev.dir === 'asc') return { col, dir: 'desc' };
      return null;  // 3번째 클릭 → 해제
    });
  }

  const companies = useMemo(() => {
    const set = new Set(contracts.map((c) => c.company));
    return ['전체', ...Array.from(set)];
  }, [contracts]);

  /** 회사 필터만 적용된 모집단 — 사이드패널/요약의 기준 */
  const scopedContracts = useMemo(() => {
    return contracts.filter((c) => matchesCompany(c, companyFilter));
  }, [contracts, companyFilter]);

  /** 상태 칩 카운트 — 회사 필터를 적용한 상태에서 각 view 별 수 (양방향 연동) */
  const viewCounts = useMemo(() => ({
    전체: contracts.filter((c) => matchesCompany(c, companyFilter)).length,
    계약중: contracts.filter((c) => matchesCompany(c, companyFilter) && matchesView(c, '계약중')).length,
    휴차: contracts.filter((c) => matchesCompany(c, companyFilter) && matchesView(c, '휴차')).length,
    미수: contracts.filter((c) => matchesCompany(c, companyFilter) && matchesView(c, '미수')).length,
  } as Record<View, number>), [contracts, companyFilter]);

  /** 회사 칩 카운트 — 상태 필터를 적용한 상태에서 각 회사별 수 (양방향 연동) */
  const companyCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const co of companies) {
      m[co] = contracts.filter((c) => matchesView(c, view) && matchesCompany(c, co)).length;
    }
    return m;
  }, [contracts, companies, view]);

  const filteredContracts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const arr = contracts.filter((c) => {
      if (!matchesCompany(c, companyFilter)) return false;
      if (!matchesView(c, view)) return false;
      if (q) {
        const hay = `${c.customerName} ${c.vehiclePlate} ${c.vehicleModel} ${c.manager} ${c.customerPhone1}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // 수동 정렬 우선, 없으면 퀵필터별 자동 정렬
    if (manualSort) {
      const sign = manualSort.dir === 'asc' ? 1 : -1;
      return [...arr].sort((a, b) => sign * compareForCol(a, b, manualSort.col));
    }
    return [...arr].sort(sortComparator(view));
  }, [contracts, search, view, companyFilter, manualSort]);

  const summary = useMemo(() => {
    const totalUnpaid = scopedContracts.reduce((s, c) => s + c.unpaidAmount, 0);
    const unpaidCount = scopedContracts.filter((c) => c.unpaidAmount > 0).length;
    return { totalUnpaid, unpaidCount };
  }, [scopedContracts]);

  const deliveries = useMemo(() => buildDeliveries(scopedContracts, TODAY), [scopedContracts]);
  const returns = useMemo(() => buildReturns(scopedContracts, TODAY, 30), [scopedContracts]);
  const overdue = useMemo(() => buildOverdue(scopedContracts, TODAY), [scopedContracts]);

  function handleRowDoubleClick(c: Contract) {
    setSelectedId(c.id);
    setDetailOpen(true);
  }

  function handleExtend(contractId: string, months: number) {
    const c = contracts.find((x) => x.id === contractId);
    if (!c) return;
    const base = c.returnScheduledDate ? new Date(c.returnScheduledDate) : new Date(TODAY);
    base.setMonth(base.getMonth() + months);
    void rtdbUpdate({
      ...c,
      returnScheduledDate: base.toISOString().slice(0, 10),
      termMonths: c.termMonths + months,
      totalSeq: c.totalSeq + months,
      notes: `${c.notes ?? ''}${c.notes ? ' / ' : ''}${TODAY} ${months}개월 연장`.trim(),
    });
  }

  return (
    <div className="app">
      {/* TOPBAR — Linear style */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="topbar-brand-logo" title="CI 자리 (추후 교체)">CI</div>
          <div className="topbar-brand-text">
            <div className="name">icar ERP</div>
          </div>
        </div>

        <div className="topbar-search">
          <MagnifyingGlass size={14} className="icon" />
          <input
            className="input"
            placeholder="고객 / 차량 / 차종 / 담당"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-bar">
          {VIEWS.map((v) => {
            const count = viewCounts[v];
            return (
              <button key={v} className={`chip ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
                {v}
                {count > 0 && <span className="chip-count">{count}</span>}
              </button>
            );
          })}
          <span className="filter-divider" />
          {companies.map((co) => {
            const cnt = companyCounts[co] ?? 0;
            return (
              <button
                key={co}
                className={`chip ${companyFilter === co ? 'active' : ''}`}
                onClick={() => setCompanyFilter(co)}
              >
                {co}
                {cnt > 0 && <span className="chip-count">{cnt}</span>}
              </button>
            );
          })}
        </div>

        <div className="topbar-right">
          <span className="topbar-sort" title={manualSort ? '컬럼 헤더 다시 클릭으로 변경/해제' : '필터별 자동 정렬'}>
            <span className="arrow">{manualSort?.dir === 'asc' ? '▲' : '▼'}</span>
            {manualSort
              ? `${manualSort.col} ${manualSort.dir === 'asc' ? '오름' : '내림'}`
              : sortLabel(view)}
          </span>
          <span className="topbar-date">{dateWithDow(TODAY)}</span>
          <UserBadge />
        </div>

        <div className="topbar-actions">
          {selectedIds.size > 0 && (
            <button className="btn btn-sm" onClick={clearSelection} title="선택 해제">
              <X size={12} /> 선택 해제 ({selectedIds.size})
            </button>
          )}
          <button
            className="btn"
            onClick={() => setSmsOpen(true)}
            title={selectedIds.size > 0 ? `${selectedIds.size}건 발송` : '전체 발송'}
          >
            <ChatCircleDots size={14} /> 문자
            {selectedIds.size > 0 && <span className="chip-count" style={{ background: 'var(--brand-bg)', color: 'var(--brand)' }}>{selectedIds.size}</span>}
          </button>
          <button className="btn" onClick={() => setLedgerOpen(true)} title="계좌·카드 수납 통합 관리">
            <CurrencyKrw size={14} /> 수납이력
          </button>
          <Link href="/penalty" className="btn" style={{ textDecoration: 'none' }} title="과태료 / 통행료 / 범칙금 처리">
            <Warning size={14} /> 과태료
          </Link>
          <button className="btn" title="마스터 (법인·차량·고객)">
            <Buildings size={14} /> 마스터
          </button>
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus size={14} weight="bold" /> 신규 생성
          </button>
        </div>
      </header>

      {/* DASHBOARD */}
      <div className="dashboard">
        {/* MAIN — 계약 리스트 */}
        <div className="panel">
          <div className="panel-body">
            <table className="table">
              <thead>
                <tr>
                  <th className="checkbox-col">
                    <input
                      type="checkbox"
                      checked={filteredContracts.length > 0 && filteredContracts.every((c) => selectedIds.has(c.id))}
                      ref={(el) => {
                        if (!el) return;
                        const some = filteredContracts.some((c) => selectedIds.has(c.id));
                        const all = filteredContracts.every((c) => selectedIds.has(c.id));
                        el.indeterminate = some && !all;
                      }}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(new Set(filteredContracts.map((c) => c.id)));
                        else setSelectedIds(new Set());
                      }}
                      aria-label="전체 선택"
                    />
                  </th>
                  <SortableTh col="회사" align="center" width={64} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="차량상태" align="center" width={84} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="차량번호" width={92} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="차종" sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="계약자" width={96} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="연락처" width={116} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="계약상태" align="center" width={80} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="계약기간" align="center" width={152} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="반납까지" align="center" width={76} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="수납상태" align="center" width={86} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="미수금" align="num" width={110} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="담당" width={64} sort={manualSort} onSort={toggleSort} />
                  <th style={{ width: 240 }}>비고</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="muted center" style={{ padding: 32 }}>표시할 계약이 없습니다.</td>
                  </tr>
                ) : (
                  filteredContracts.map((c) => {
                    const isReturnOverdue = !!(c.returnScheduledDate && !c.returnedDate && c.status === '운행' && c.returnScheduledDate < TODAY);
                    const returnDaysToGo = c.returnScheduledDate ? daysSince(TODAY, c.returnScheduledDate) : null;
                    const vs = getVehicleState(c);
                    const cs = getContractState(c);
                    const ps = getPaymentState(c);

                    const isChecked = selectedIds.has(c.id);
                    return (
                      <tr
                        key={c.id}
                        onDoubleClick={() => handleRowDoubleClick(c)}
                        className={`${selected?.id === c.id ? 'selected' : ''} ${isChecked ? 'selected-row' : ''}`}
                        onClick={() => setSelectedId(c.id)}
                      >
                        {/* 체크박스 */}
                        <td className="checkbox-col" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleRow(c.id)}
                            aria-label={`${c.customerName} 선택`}
                          />
                        </td>
                        {/* 회사 */}
                        <td className="center dim">{c.company}</td>
                        {/* 차량상태 */}
                        <td className="center">
                          <span className={`status ${vs.name}`}>{vs.name}</span>
                        </td>
                        {/* 차량 */}
                        <td className="plate">{c.vehiclePlate}</td>
                        <td className="dim">{c.vehicleModel}</td>
                        {/* 고객 */}
                        <td>{c.customerName}</td>
                        <td className="mono dim">{c.customerPhone1}</td>
                        {/* 계약상태 + 기간 */}
                        <td className="center">
                          <span className={`status ${cs.name}`}>{cs.name}</span>
                        </td>
                        <td className="center mono dim">
                          {formatPeriod(c.deliveredDate ?? c.contractDate, c.returnScheduledDate) || <span className="muted">-</span>}
                        </td>
                        <td className={`center mono ${isReturnOverdue ? 'danger' : 'dim'}`}>
                          {returnDaysToGo === null
                            ? <span className="muted">-</span>
                            : isReturnOverdue
                            ? `D+${Math.abs(returnDaysToGo)}`
                            : returnDaysToGo === 0
                            ? '오늘'
                            : `D-${returnDaysToGo}`}
                        </td>
                        {/* 수납상태 + 미수금 */}
                        <td className="center">
                          <span className={`status ${ps.name}`}>
                            {ps.name}
                            {ps.name === '미납' && ps.days > 0 && (
                              <span style={{ marginLeft: 4, fontWeight: 600 }}>+{ps.days}</span>
                            )}
                          </span>
                        </td>
                        <td className={`num mono ${c.unpaidAmount > 0 ? 'danger' : ''}`}>
                          {c.unpaidAmount > 0 ? formatCurrency(c.unpaidAmount) : <span className="muted">없음</span>}
                        </td>
                        {/* 관리 */}
                        <td className="dim">{c.manager || '-'}</td>
                        <td className="dim" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.notes || ''}>
                          {c.notes || <span className="muted">-</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SIDEBAR — 3패널: 연체 / 반납·만기 / 출고예정 (연체 우선·크게) */}
        <div className="sidebar-stack">
          <SidePanel
            icon={<Warning size={14} weight="fill" />}
            title="연체 알림"
            count={overdue.length}
            tone="red"
            empty="연체 항목 없음"
            meta={summary.totalUnpaid > 0 ? (
              <span className="panel-meta danger">₩{formatCurrencyShort(summary.totalUnpaid)}</span>
            ) : undefined}
          >
            {overdue.map((o) => (
              <div key={`od-${o.contractId}-${o.type}`} className="list-item" onClick={() => {
                const c = contracts.find((x) => x.id === o.contractId);
                if (c) handleRowDoubleClick(c);
              }}>
                <span className="tag over">{o.type === '반납지연' ? '반납' : '미납'}</span>
                <div className="list-item-main">
                  <div className="list-item-top">
                    {o.customerName}
                    <span className="text-weak text-xs">{o.company}</span>
                  </div>
                  <div className="list-item-sub">
                    <span className="plate">{o.vehiclePlate}</span>
                    <span className="text-weak">·</span>
                    {o.vehicleModel}
                    {o.type === '결제지연' && o.unpaidAmount && (
                      <>
                        <span className="text-weak">·</span>
                        <span className="danger mono">₩{formatCurrency(o.unpaidAmount)}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="list-item-right">
                  <div className="dday danger">D+{o.overdueDays}</div>
                  <div className="date">{formatDate(o.referenceDate)}</div>
                </div>
                {o.type === '반납지연' && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <ExtendPopover
                      currentReturnDate={o.referenceDate}
                      customerName={o.customerName}
                      vehiclePlate={o.vehiclePlate}
                      onExtend={(months) => handleExtend(o.contractId, months)}
                    />
                  </div>
                )}
              </div>
            ))}
          </SidePanel>

          <SidePanel
            icon={<ArrowUDownLeft size={14} />}
            title="반납 / 만기"
            count={returns.length}
            empty="만기 도래 계약 없음"
          >
            {returns.map((r) => (
              <div key={`ret-${r.contractId}`} className="list-item" onClick={() => {
                const c = contracts.find((x) => x.id === r.contractId);
                if (c) handleRowDoubleClick(c);
              }}>
                <span className="tag in">반납</span>
                <div className="list-item-main">
                  <div className="list-item-top">
                    {r.customerName}
                    <span className="text-weak text-xs">{r.company}</span>
                  </div>
                  <div className="list-item-sub">
                    <span className="plate">{r.vehiclePlate}</span>
                    <span className="text-weak">·</span>
                    {r.vehicleModel}
                  </div>
                </div>
                <DDay date={r.scheduledDate} danger={r.status === '지연'} />
                <div onClick={(e) => e.stopPropagation()}>
                  <ExtendPopover
                    currentReturnDate={r.scheduledDate}
                    customerName={r.customerName}
                    vehiclePlate={r.vehiclePlate}
                    onExtend={(months) => handleExtend(r.contractId, months)}
                  />
                </div>
              </div>
            ))}
          </SidePanel>

          <SidePanel
            icon={<Truck size={14} />}
            title="출고 예정"
            count={deliveries.length}
            empty="출고 예정 없음"
          >
            {deliveries.map((d) => (
              <div key={`del-${d.contractId}`} className="list-item" onClick={() => {
                const c = contracts.find((x) => x.id === d.contractId);
                if (c) handleRowDoubleClick(c);
              }}>
                <span className="tag out">출고</span>
                <div className="list-item-main">
                  <div className="list-item-top">
                    {d.customerName}
                    <span className="text-weak text-xs">{d.company}</span>
                  </div>
                  <div className="list-item-sub">
                    <span className="plate">{d.vehiclePlate}</span>
                    <span className="text-weak">·</span>
                    {d.vehicleModel}
                  </div>
                </div>
                <DDay date={d.scheduledDate} danger={d.status === '지연'} />
              </div>
            ))}
          </SidePanel>
        </div>
      </div>

      <ContractDetailDialog
        contract={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdate={updateContract}
      />
      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <SmsDialog open={smsOpen} onOpenChange={setSmsOpen} contracts={filteredContracts} selectedIds={selectedIds} />
      <PaymentLedgerDialog open={ledgerOpen} onOpenChange={setLedgerOpen} contracts={contracts} />
    </div>
  );
}

/* ─────────────── Sub components ─────────────── */

function SortableTh({
  col, align, width, sort, onSort,
}: {
  col: SortCol;
  align?: 'center' | 'num';
  width?: number;
  sort: { col: SortCol; dir: SortDir } | null;
  onSort: (col: SortCol) => void;
}) {
  const isActive = sort?.col === col;
  const arrow = isActive ? (sort?.dir === 'asc' ? '▲' : '▼') : null;
  const className = `sortable ${align === 'center' ? 'center' : align === 'num' ? 'num' : ''} ${isActive ? 'active' : ''}`;
  return (
    <th className={className} style={width ? { width } : undefined} onClick={() => onSort(col)}>
      {col}
      {arrow && <span className="sort-arrow">{arrow}</span>}
    </th>
  );
}

function Metric({ label, value, unit, danger }: { label: string; value: string; unit?: string; danger?: boolean }) {
  return (
    <div className={`metric ${danger ? 'danger' : ''}`}>
      <span className="label">{label}</span>
      <span className="value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </span>
    </div>
  );
}

function SidePanel({
  icon, title, count, tone, empty, meta, children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  tone?: 'red' | 'orange' | 'blue';
  empty: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  const toneColor = tone === 'red' ? 'var(--red-text)' : tone === 'orange' ? 'var(--orange-text)' : 'var(--text-sub)';
  const badgeBg = tone === 'red' ? 'var(--red-bg)' : tone === 'orange' ? 'var(--orange-bg)' : 'var(--zinc-bg)';
  const badgeText = tone === 'red' ? 'var(--red-text)' : tone === 'orange' ? 'var(--orange-text)' : 'var(--zinc-text)';

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <span style={{ color: toneColor }}>{icon}</span>
          {title}
          <span className="badge" style={{ background: badgeBg, color: badgeText }}>{count}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {meta}
          <button className="btn btn-sm btn-ghost" title="새로고침">
            <ArrowsClockwise size={12} />
          </button>
        </div>
      </div>
      <div className="panel-body">
        {count === 0 ? <div className="empty-state">{empty}</div> : <div>{children}</div>}
      </div>
    </div>
  );
}

function DDay({ date, danger }: { date: string; danger?: boolean }) {
  const diff = daysSince(TODAY, date);
  const text = danger ? `D+${Math.abs(diff)}` : diff === 0 ? '오늘' : `D-${diff}`;
  return (
    <div className="list-item-right">
      <div className={`dday ${danger ? 'danger' : ''}`}>{text}</div>
      <div className="date">{formatDate(date)}</div>
    </div>
  );
}

/* 합 ₩ 표시 short — 1,234,567 → 1.23M */
function UserBadge() {
  const { user } = useAuth();
  if (!user) return null;
  const name = user.displayName || user.email || '직원';
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 11, color: 'var(--text-sub)',
        padding: '4px 10px', borderRadius: 999,
        background: 'var(--bg-sunken)', border: '1px solid var(--border)',
      }}
      title={user.email ?? ''}
    >
      <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>{name}</span>
      <button
        type="button"
        onClick={() => void logout()}
        title="로그아웃"
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 0, display: 'inline-flex', color: 'var(--text-weak)',
        }}
      >
        <SignOut size={12} />
      </button>
    </span>
  );
}

function formatCurrencyShort(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(0)}만`;
  return formatCurrency(n);
}

