'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Power, FileXls, ChatCircleDots, X, MagnifyingGlass, Plus, Gavel, Warning, PaperPlaneTilt, FileText, Copy, FloppyDisk } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { Sidebar } from '@/components/layout/sidebar';
import { AppTopbar } from '@/components/layout/app-topbar';
import { FilterSelect } from '@/components/ui/filter-select';
import { useVehicleDialog } from '@/lib/global-dialogs';
import { BottomBar } from '@/components/layout/bottom-bar';
import { SmsDialog } from '@/components/sms-dialog';
import { EngineLockDialog } from '@/components/engine-lock-dialog';
import dynamic from 'next/dynamic';
const CreateDialog = dynamic(() => import('@/components/create-dialog').then((m) => m.CreateDialog), { ssr: false });
const RiskDetailDialog = dynamic(() => import('@/components/risk-detail-dialog').then((m) => m.RiskDetailDialog), { ssr: false });
const ContractDetailDialog = dynamic(() => import('@/components/contract-detail-dialog').then((m) => m.ContractDetailDialog), { ssr: false });
import { buildCompanyOptions } from '@/lib/filter-helpers';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { syncContractAndVehicleStatus } from '@/lib/firebase/contract-status-sync';
import { useCompanies } from '@/lib/firebase/companies-store';
import { CompanyCell } from '@/components/ui/company-cell';
import { useRowSelection, useCtrlASelectAll } from '@/lib/use-row-selection';
import { useTableSelection } from '@/lib/use-table-selection';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { downloadOverdueExcel } from '@/lib/contract-export';
import { useAuth } from '@/lib/use-auth';
import { useRole } from '@/lib/use-role';
import { toast } from '@/lib/toast';
import { todayKr } from '@/lib/mock-data';
import { useLiveTodayKr } from '@/lib/use-live-today';
import { friendlyError } from '@/lib/friendly-error';
import type { Contract, RiskIssue } from '@/lib/types';
import { computeActiveIssues, pickPrimaryIssue, computeLatePayStage, ISSUE_COLOR, ISSUE_LABEL, type LatePayStage, needsEngineLockAction, needsNoticeAction } from '@/lib/risk-issues';
import { StatusBadge } from '@/components/ui/status-badge';
import { vehicleStatusTone } from '@/lib/status-tones';
import { usePersistentState } from '@/lib/use-persistent-state';

type Filter =
  | '전체'           // 진행중 전체 (종결 제외)
  | '미납중'
  | '시동제어필요'   // 신규: D+3+ 미납 + 아직 시동제어 안 함
  | '내용증명필요'   // 신규: D+10+ 미납 + 아직 내용증명 발송 안 함
  | '장기미수'       // 90일+ 미결 회차 (AR aging 90+)
  | '시동제어'        // 이미 ON 상태
  | '검사지연'
  | '기타'
  | '종료'
  | '매각';

/** 진행중 리스크 전체 */
const ACTIVE_FILTERS: Filter[] = ['전체', '미납중', '시동제어필요', '내용증명필요', '장기미수', '시동제어', '검사지연', '기타'];
/** 자주 쓰는 4개 — chip 노출 */
const QUICK_FILTERS: Filter[] = ['전체', '미납중', '시동제어필요', '내용증명필요'];
/** 나머지 진행중 — dropdown 노출 */
const MORE_ACTIVE: Filter[] = ['장기미수', '시동제어', '검사지연', '기타'];
/** 종결 — dropdown 노출 */
const CLOSED_FILTERS: Filter[] = ['종료', '매각'];
const MORE_FILTERS: Filter[] = [...MORE_ACTIVE, ...CLOSED_FILTERS];

/** 검사지연 — 정기검사 예정일 지남 (임차인이 받아야 하는 책임 사항) */
function isInspectionOverdue(c: Contract, today: string): boolean {
  return !!(c.inspectionDueDate && c.inspectionDueDate < today);
}

function hasOverdue(c: Contract): boolean {
  return (c.schedules ?? []).some((s) => s.status === '연체');
}
function hasPartial(c: Contract): boolean {
  return (c.schedules ?? []).some((s) => s.status === '부분납');
}

/** 장기미수 — 가장 오래된 미결 회차가 90일 이상 경과 (ERP AR aging 90+) */
function isLongOverdue(c: Contract, today: string): boolean {
  return maxOverdueDays(c, today) >= 90;
}

function maxOverdueDays(c: Contract, today: string): number {
  const overdue = (c.schedules ?? []).filter((s) => s.status === '연체' || s.status === '부분납');
  if (overdue.length === 0) return 0;
  const oldest = overdue.map((s) => s.dueDate).sort()[0];
  const t = new Date(today).getTime();
  const o = new Date(oldest).getTime();
  return Math.max(0, Math.round((t - o) / (1000 * 60 * 60 * 24)));
}

/**
 * 회수 미완료 — 법적 해지 가능 사유 있는데 차량 아직 못 가져온 계약.
 *   조건: (D+10+ 미납 + 내용증명 송부 완료) 또는 (수동 채권화)
 *      + 차량 회수 안 됨 (returnedDate 없고 status가 반납/해지/매각 아님)
 */
function needsRecovery(c: Contract, today: string, sentIds: Set<string>): boolean {
  const days = maxOverdueDays(c, today);
  const legalGrounds = days >= 10 && sentIds.has(c.id);
  const debtFlagged = c.status === '채권';
  if (!legalGrounds && !debtFlagged) return false;
  // 이미 회수/종결된 케이스는 제외
  if (c.returnedDate) return false;
  if (c.status === '반납' || c.status === '해지') return false;
  return true;
}

function lastContactDate(contractId: string, history: ReturnType<typeof useHistoryEntries>['entries']): string | undefined {
  const logs = history.filter((h) => h.scope === 'contract' && h.contractId === contractId && h.category === '연락기록');
  if (logs.length === 0) return undefined;
  return logs.map((l) => l.date).sort().reverse()[0];
}

export default function ReceivablesPage() {
  const { contracts, loading: contractsLoading, update: rtdbUpdate } = useContracts();
  const { vehicles, update: updateVehicleMaster } = useVehicles();
  // 미수 페이지에서도 Contract.vehicleStatus 변경 시 Vehicle 마스터 status 자동 동기화
  const updateContract = useCallback((updated: Contract) => {
    void syncContractAndVehicleStatus(updated, vehicles, rtdbUpdate, updateVehicleMaster);
  }, [rtdbUpdate, vehicles, updateVehicleMaster]);
  const { companies: companyMaster } = useCompanies();
  const { entries: history, add: addHistory } = useHistoryEntries();
  const { user } = useAuth();
  const { isAdmin: admin } = useRole();
  const { openVehicle } = useVehicleDialog();
  const [filter, setFilter] = usePersistentState<Filter>('filter:receivables:quick', '미납중');
  const [companyFilter, setCompanyFilter] = usePersistentState<string>('filter:receivables:company', 'all');
  const [search, setSearch] = useState('');
  const [contactOpen, setContactOpen] = useState<Contract | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number; row: Contract | null }>({ open: false, x: 0, y: 0, row: null });
  const [createOpen, setCreateOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [engineLockTarget, setEngineLockTarget] = useState<Contract | null>(null);
  const [detailContract, setDetailContract] = useState<Contract | null>(null);
  /** 리스크 상세 → [수정] 시 풀 계약 다이얼로그 열기 */
  const [editContract, setEditContract] = useState<Contract | null>(null);
  // 행 선택 — lib/use-table-selection SSOT
  const sel = useTableSelection();
  const { selectedIds, setSelectedIds } = sel;
  const selAdapter = sel;

  const today = useLiveTodayKr();

  // 5개 필터 정의:
  // · 미납중   = unpaidAmount > 0 OR 부분납 (회수해야 할 돈이 있는 경우)
  // · 시동제어 = engineDisabled
  // · 검사지연 = inspectionDueDate < today
  // · 종료     = 반납/해지/채권 OR returnedDate 있음 (이미 종결된 계약, 정상+비정상 모두)
  // · 기타     = 위 4개에 안 잡히는 기타 위반 (추후 직원 피드백 반영)
  // 내용증명 발송된 계약 ID Set (history_entries category='법적조치')
  const noticeSentIds = useMemo(() => {
    const s = new Set<string>();
    for (const h of history) {
      if (h.category === '법적조치' && h.scope === 'contract' && h.contractId) {
        s.add(h.contractId);
      }
    }
    return s;
  }, [history]);

  const isLatePay = (c: Contract) => (c.unpaidAmount ?? 0) > 0 || hasPartial(c);
  const isEngineLock = (c: Contract) => c.engineDisabled === true;
  const isInspection = (c: Contract) => isInspectionOverdue(c, today);
  const isSold = (c: Contract) => c.vehicleStatus === '매각' || c.vehicleStatus === '매각대기';
  const isClosed = (c: Contract) =>
    !isSold(c) && (c.status === '반납' || c.status === '해지' || c.status === '채권' || !!c.returnedDate);
  const isOther = (c: Contract) =>
    !isLatePay(c) && !isEngineLock(c) && !isInspection(c) && !isClosed(c) && !isSold(c) && c.status === '채권';
  const needsLock = (c: Contract) => needsEngineLockAction(c, today);
  const needsNotice = (c: Contract) => needsNoticeAction(c, today, noticeSentIds);
  // '전체' = 진행중 모든 리스크 (종결 제외)
  const isActiveRisk = (c: Contract) =>
    !isClosed(c) && !isSold(c) &&
    (isLatePay(c) || isEngineLock(c) || isInspection(c) || isOther(c) || needsLock(c) || needsNotice(c));

  /** 사용 중인 회사 옵션 — 드랍다운 채우기용 */
  const companyOptions = useMemo(
    () => buildCompanyOptions(contracts, (c) => c.company),
    [contracts],
  );

  const filtered = useMemo<Contract[]>(() => {
    const base = contracts.filter((c) => c.id && !c.id.startsWith('vehicle-orphan-'));
    let list: Contract[];
    if (filter === '전체') list = base.filter(isActiveRisk);
    else if (filter === '미납중') list = base.filter(isLatePay);
    else if (filter === '시동제어필요') list = base.filter(needsLock);
    else if (filter === '내용증명필요') list = base.filter(needsNotice);
    else if (filter === '시동제어') list = base.filter(isEngineLock);
    else if (filter === '검사지연') list = base.filter(isInspection);
    else if (filter === '장기미수') list = base.filter((c) => isLongOverdue(c, today));
    else if (filter === '종료') list = base.filter(isClosed);
    else if (filter === '매각') list = base.filter(isSold);
    else if (filter === '기타') list = base.filter(isOther);
    else list = base;

    if (companyFilter !== 'all') list = list.filter((c) => c.company === companyFilter);

    const q = search.trim().toLowerCase();
    const searched = !q ? list : list.filter((c) =>
      (c.customerName ?? '').toLowerCase().includes(q)
      || (c.vehiclePlate ?? '').toLowerCase().includes(q)
      || (c.vehicleModel ?? '').toLowerCase().includes(q)
      || (c.manager ?? '').toLowerCase().includes(q),
    );
    // 기본 정렬: 미수금 큰 순 (가장 시급한 회수 대상 위로)
    return [...searched].sort((a, b) => (b.unpaidAmount ?? 0) - (a.unpaidAmount ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts, filter, companyFilter, search, noticeSentIds]);

  const counts = useMemo(() => {
    const base = contracts.filter((c) => c.id && !c.id.startsWith('vehicle-orphan-'));
    return {
      전체: base.filter(isActiveRisk).length,
      미납중: base.filter(isLatePay).length,
      시동제어필요: base.filter(needsLock).length,
      내용증명필요: base.filter(needsNotice).length,
      시동제어: base.filter(isEngineLock).length,
      검사지연: base.filter(isInspection).length,
      장기미수: base.filter((c) => isLongOverdue(c, today)).length,
      종료: base.filter(isClosed).length,
      매각: base.filter(isSold).length,
      기타: base.filter(isOther).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts, today, noticeSentIds]);

  // 현재 선택 chip 의 count 가 0 되면 [전체] 로 자동 전환
  useEffect(() => {
    if (filter !== '전체' && (counts[filter] ?? 0) === 0) setFilter('전체');
  }, [filter, counts]);

  /** 채권화 토글 — 회수 어려운 미수금 분류 (수동) */
  async function toggleDebtFlag(c: Contract) {
    if (!admin) { toast.error('관리자만 채권 변경 가능'); return; }
    const isDebt = c.status === '채권';
    if (!isDebt) {
      if (!window.confirm(`${c.vehiclePlate} ${c.customerName} — 채권화 처리 (회수불가/법적조치 검토)?`)) return;
    } else {
      if (!window.confirm(`${c.vehiclePlate} ${c.customerName} — 채권 해제하시겠습니까?`)) return;
    }
    try {
      // 채권화 시 status='채권', 해제 시 returnedDate 있으면 '반납', 없으면 '운행'
      const nextStatus: Contract['status'] = isDebt
        ? (c.returnedDate ? '반납' : '운행')
        : '채권';
      await updateContract({ ...c, status: nextStatus });
      toast.success(isDebt ? `${c.vehiclePlate} 채권 해제` : `${c.vehiclePlate} 채권화`);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  function openEngineLockDialog(c: Contract) {
    if (!admin) { toast.error('관리자만 시동제어 가능'); return; }
    setEngineLockTarget(c);
  }

  /** EngineLockDialog 의 confirm 콜백 — 실제 RTDB update */
  async function commitEngineLock(next: boolean, reason: string) {
    const c = engineLockTarget;
    if (!c) return;
    await updateContract({
      ...c,
      engineDisabled: next,
      engineDisabledAt: next ? new Date().toISOString() : undefined,
      engineDisabledBy: next ? user?.email ?? '' : undefined,
      engineDisabledReason: next ? reason : undefined,
    });
    toast.success(next ? `${c.vehiclePlate} 시동제어 ON` : `${c.vehiclePlate} 시동제어 해제`);
  }

  const filterTone = (f: Filter): string => {
    if (f === '미납중') return 'red';
    if (f === '시동제어') return 'amber';
    if (f === '검사지연') return 'blue';
    if (f === '기타') return 'gray';
    if (f === '종료') return 'gray';
    if (f === '매각') return 'gray';
    return 'brand';
  };

  // Ctrl/Shift+click 행선택 + Ctrl+A
  const rowSel = useRowSelection({ ids: filtered.map((c) => c.id), selection: selAdapter });
  useCtrlASelectAll(rowSel, selAdapter);

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <AppTopbar
          menuKey="receivables"
          icon={<Warning size={16} weight="fill" style={{ color: 'var(--red-text)' }} />}
          search={{ placeholder: '고객 / 차량 / 차종 / 담당', value: search, onChange: setSearch }}
          filter={
            <>
              <FilterSelect
                value={companyFilter}
                onChange={setCompanyFilter}
                dataW="md"
                title="회사별 필터"
                options={[
                  { value: 'all', label: '회사: 전체' },
                  ...companyOptions.map((co) => ({ value: co, label: co })),
                ]}
              />
              <span className="filter-divider" />
              {QUICK_FILTERS.map((f) => {
                if (f !== '전체' && (counts[f] ?? 0) === 0) return null;
                return (
                  <button
                    key={f}
                    className={`chip chip-tone-${filterTone(f)} ${filter === f ? 'active' : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f}
                    <span className="chip-count">{counts[f] ?? 0}</span>
                  </button>
                );
              })}
              <FilterSelect
                value={MORE_FILTERS.includes(filter) ? filter : ''}
                onChange={(v) => { if (v) setFilter(v as Filter); }}
                dataW="md"
                title="기타 상태"
                emptyLabel="기타 상태…"
                options={[
                  ...MORE_ACTIVE.map((f) => ({
                    value: f, label: f, group: '진행중',
                    hint: counts[f] > 0 ? `(${counts[f]})` : undefined,
                  })),
                  ...CLOSED_FILTERS.map((f) => ({
                    value: f, label: f, group: '종결',
                    hint: counts[f] > 0 ? `(${counts[f]})` : undefined,
                  })),
                ]}
              />
            </>
          }
          right={<span className="topbar-date">{today}</span>}
        />

        <div className="dashboard">
          <div className="panel">
            <div className="panel-body">
              <table className="table">
                <thead>
                  <tr>
                    <th className="checkbox-col">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id))}
                        ref={(el) => {
                          if (!el) return;
                          const some = filtered.some((c) => selectedIds.has(c.id));
                          const all = filtered.every((c) => selectedIds.has(c.id));
                          el.indeterminate = some && !all;
                        }}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(new Set(filtered.map((c) => c.id)));
                          else setSelectedIds(new Set());
                        }}
                        aria-label="전체 선택"
                      />
                    </th>
                    <th className="center" style={{ width: 56 }}>회사</th>
                    <th className="center" style={{ width: 72 }}>차량상태</th>
                    <th style={{ width: 84 }}>차량번호</th>
                    <th style={{ width: 84 }}>계약자</th>
                    <th style={{ width: 100 }}>연락처</th>
                    <th className="num" style={{ width: 96 }}>미수금</th>
                    <th className="center" style={{ width: 48 }}>미납</th>
                    <th className="center" style={{ width: 76 }}>리스크</th>
                    <th className="center" style={{ width: 78 }}>발생일</th>
                    <th className="center" style={{ width: 50 }}>경과</th>
                    <th style={{ width: 116 }}>미처리 액션</th>
                    <th className="center" style={{ width: 72 }}>시동제어</th>
                    <th className="center" style={{ width: 56 }}>채권</th>
                    <th style={{ width: 140 }}>액션</th>
                    <th>비고</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={16} className="muted center" style={{ padding: 32 }}>
                        {contractsLoading ? '데이터 불러오는 중…' : `${filter} 해당 계약 없음`}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((c) => {
                      const days = maxOverdueDays(c, today);
                      const lastC = lastContactDate(c.id, history);
                      const isChecked = selectedIds.has(c.id);
                      const allIssues = computeActiveIssues(c, today);
                      // 리스크 컬럼은 진짜 리스크(상태)만 — 시동제어/채권화/내용증명은 액션 결과라 별도 컬럼에서 표시
                      const issues = allIssues.filter((i) => i.kind !== '시동제어' && i.kind !== '채권화' && i.kind !== '내용증명');
                      const primary = pickPrimaryIssue(issues);
                      const others = issues.filter((i) => i !== primary);
                      const latePayStage: LatePayStage = computeLatePayStage(days);
                      const showLockNeeded = needsLock(c);
                      const showNoticeNeeded = needsNotice(c);
                      return (
                        <tr key={c.id} onMouseDown={rowSel.onRowMouseDown} onClick={(e) => rowSel.onRowClick(e, c.id, filtered.findIndex((x) => x.id === c.id))} onDoubleClick={() => openVehicle(c.vehiclePlate ?? '', 'risk')} onContextMenu={(e) => rowSel.onRowContextMenu(e, c.id, filtered.findIndex((x) => x.id === c.id), () => setCtxMenu({ open: true, x: e.clientX, y: e.clientY, row: c }))} style={{ cursor: 'pointer' }}>
                          <td className="checkbox-col">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(c.id)) next.delete(c.id);
                                  else next.add(c.id);
                                  return next;
                                });
                              }}
                              onClick={(e) => e.stopPropagation()}
                              aria-label="행 선택"
                            />
                          </td>
                          <td className="center dim"><CompanyCell raw={c.company} master={companyMaster} /></td>
                          <td className="center">{c.vehicleStatus ? <StatusBadge tone={vehicleStatusTone(c.vehicleStatus)}>{c.vehicleStatus}</StatusBadge> : <span className="muted">-</span>}</td>
                          <td className="mono">{c.vehiclePlate}</td>
                          <td>{c.customerName}</td>
                          <td className="mono">{c.customerPhone1 || '-'}</td>
                          <td className="num">{(c.unpaidAmount ?? 0).toLocaleString()}</td>
                          <td className="center">{c.unpaidSeqCount ?? 0}</td>
                          {/* 리스크 */}
                          <td className="center">
                            {primary ? (
                              <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <IssueBadge issue={primary} />
                                {others.length > 0 && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center' }}>
                                    {others.map((i) => (
                                      <span
                                        key={i.kind}
                                        className="risk-cell__sub-kind"
                                        title={`${i.issueDate} · D+${i.daysOverdue}`}
                                      >
                                        +{ISSUE_LABEL[i.kind]}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-weak)' }}>—</span>
                            )}
                          </td>
                          {/* 발생일 */}
                          <td className="center mono">
                            {primary ? primary.issueDate : <span style={{ color: 'var(--text-weak)' }}>—</span>}
                          </td>
                          {/* 경과 D+N (+ SLA) */}
                          <td className="center">
                            {primary ? (
                              <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <strong
                                  className="risk-cell__dn"
                                  data-level={primary.daysOverdue >= 11 ? 'red' : primary.daysOverdue >= 4 ? 'orange' : 'normal'}
                                >
                                  D+{primary.daysOverdue}
                                </strong>
                                {primary.kind === '미납' && latePayStage !== '정상' && latePayStage !== '경고' && (
                                  <SlaTag stage={latePayStage} />
                                )}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-weak)' }}>—</span>
                            )}
                          </td>
                          {/* 미처리 액션 */}
                          <td>
                            {(showLockNeeded || showNoticeNeeded) ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {showLockNeeded && <ActionNeededTag label="시동제어" />}
                                {showNoticeNeeded && <ActionNeededTag label="내용증명" />}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-weak)' }}>—</span>
                            )}
                          </td>
                          <td className="center">
                            <button
                              type="button"
                              className={`toggle-pill ${c.engineDisabled ? 'is-on toggle-pill--red' : ''}`}
                              onClick={() => openEngineLockDialog(c)}
                              title={c.engineDisabled ? `${c.engineDisabledAt?.slice(0, 10) ?? ''} 제어 시작` : '시동제어 ON'}
                            >
                              <Power weight={c.engineDisabled ? 'fill' : 'regular'} />
                              {c.engineDisabled ? 'ON' : 'OFF'}
                            </button>
                          </td>
                          <td className="center">
                            <button
                              type="button"
                              className={`toggle-pill ${c.status === '채권' ? 'is-on toggle-pill--zinc' : ''}`}
                              onClick={() => toggleDebtFlag(c)}
                              title={c.status === '채권' ? '채권 해제' : '채권화 (회수불가)'}
                            >
                              <Gavel weight={c.status === '채권' ? 'fill' : 'regular'} />
                              {c.status === '채권' ? 'ON' : 'OFF'}
                            </button>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                              <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => setContactOpen(c)}
                                  title={lastC ? `최근 연락 ${lastC} (마지막 기록일)` : '연락기록 없음 — 추가'}
                                  style={lastC && lastC >= today ? { borderColor: 'var(--green-text)', color: 'var(--green-text)' } : undefined}
                                >
                                  <ChatCircleDots /> 연락
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => window.open(`/notice/cert/${c.id}`, '_blank')}
                                  title="내용증명 (최고서) — 새 탭"
                                >
                                  <FileText /> 내용증명
                                </button>
                              </div>
                              {lastC ? (
                                <span className="dim mono" style={{ fontSize: 10 }} title={`마지막 연락 ${lastC}`}>
                                  최근 연락 {(() => {
                                    const d = Math.round((new Date(today).getTime() - new Date(lastC).getTime()) / 86400000);
                                    return d <= 0 ? '오늘' : d === 1 ? '어제' : `${d}일 전`;
                                  })()}
                                </span>
                              ) : (
                                <span style={{ fontSize: 10, color: 'var(--red-text)' }} title="연락기록 없음">
                                  연락기록 없음
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="dim" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.notes || ''}>
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

          {/* 우측 컬럼 — 위/아래 반반 (회수 미완료 + 시동제어) */}
          <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 10, minHeight: 0, overflow: 'hidden' }}>
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <span style={{ color: '#7f1d1d' }}>
                  <Warning size={14} weight="fill" />
                </span>
                회수 미완료
                {(() => {
                  const list = contracts.filter((c) => needsRecovery(c, today, noticeSentIds));
                  return (
                    <span className="badge" style={{ background: '#fef2f2', color: '#7f1d1d', border: '1px solid rgba(127,29,29,0.3)' }}>
                      {list.length}
                    </span>
                  );
                })()}
              </div>
              <div className="panel-meta danger">
                ₩{contracts.filter((c) => needsRecovery(c, today, noticeSentIds)).reduce((s, c) => s + (c.unpaidAmount ?? 0), 0).toLocaleString()}
              </div>
            </div>
            <div className="panel-body">
              {(() => {
                const list = contracts
                  .filter((c) => needsRecovery(c, today, noticeSentIds))
                  .sort((a, b) => maxOverdueDays(b, today) - maxOverdueDays(a, today));
                if (list.length === 0) {
                  return <div className="empty-state">회수 대기 차량 없음</div>;
                }
                return (
                  <div>
                    {list.map((c) => {
                      const days = maxOverdueDays(c, today);
                      const reason = c.status === '채권' ? '채권화' : '내용증명 D+' + (days - 10);
                      const lastC = lastContactDate(c.id, history);
                      const lastCDays = lastC ? Math.max(0, Math.round((new Date(today).getTime() - new Date(lastC).getTime()) / 86400000)) : null;
                      return (
                        <div key={c.id} className="list-item" onClick={() => setContactOpen(c)} style={{ cursor: 'pointer' }}>
                          <span className="tag over" style={{ background: '#fef2f2', color: '#7f1d1d' }}>{reason}</span>
                          <div className="list-item-main">
                            <div className="list-item-top">
                              {c.customerName}
                              <span className="text-weak text-xs">{c.company}</span>
                            </div>
                            <div className="list-item-sub">
                              <span className="plate">{c.vehiclePlate}</span>
                              <span className="text-weak">·</span>
                              <span className="danger mono">₩{(c.unpaidAmount ?? 0).toLocaleString()}</span>
                              <span className="text-weak">·</span>
                              <span style={{ color: lastC ? 'var(--text-weak)' : 'var(--red-text)', fontSize: 10 }} title={lastC ? `마지막 연락 ${lastC}` : '연락기록 없음'}>
                                {lastC ? `연락 ${lastCDays === 0 ? '오늘' : lastCDays === 1 ? '어제' : `${lastCDays}일 전`}` : '미연락'}
                              </span>
                            </div>
                          </div>
                          <div className="list-item-right">
                            <div className="dday danger">D+{days}</div>
                            <div className="date">{c.engineDisabled ? '시동제어 ON' : ''}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* 보조 패널 — 시동제어 현황 (사유 뱃지) */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <span style={{ color: 'var(--red-text)' }}>
                  <Power size={14} weight="fill" />
                </span>
                시동제어 현황
                <span className="badge" style={{ background: 'var(--red-bg)', color: 'var(--red-text)' }}>
                  {counts['시동제어']}
                </span>
              </div>
              <div className="panel-meta danger">
                ₩{contracts.filter((c) => c.engineDisabled).reduce((s, c) => s + (c.unpaidAmount ?? 0), 0).toLocaleString()}
              </div>
            </div>
            <div className="panel-body">
              {counts['시동제어'] === 0 ? (
                <div className="empty-state">시동제어 중 차량 없음</div>
              ) : (
                <div>
                  {contracts
                    .filter((c) => c.engineDisabled)
                    .sort((a, b) => (b.engineDisabledAt ?? '').localeCompare(a.engineDisabledAt ?? ''))
                    .map((c) => {
                      const startDate = c.engineDisabledAt?.slice(0, 10) ?? '';
                      const daysSince = startDate
                        ? Math.max(0, Math.round((new Date(today).getTime() - new Date(startDate).getTime()) / 86400000))
                        : 0;
                      const reason = (c.engineDisabledReason || '').trim();
                      const reasonKey = ['미납', '검사지연'].find((k) => reason.includes(k)) ?? (reason || '기타');
                      const lastC = lastContactDate(c.id, history);
                      const lastCDays = lastC ? Math.max(0, Math.round((new Date(today).getTime() - new Date(lastC).getTime()) / 86400000)) : null;
                      return (
                        <div key={c.id} className="list-item" onClick={() => setContactOpen(c)} style={{ cursor: 'pointer' }}>
                          <span className="tag over">{reasonKey}</span>
                          <div className="list-item-main">
                            <div className="list-item-top">
                              {c.customerName}
                              <span className="text-weak text-xs">{c.company}</span>
                            </div>
                            <div className="list-item-sub">
                              <span className="plate">{c.vehiclePlate}</span>
                              <span className="text-weak">·</span>
                              <span className="danger mono">₩{(c.unpaidAmount ?? 0).toLocaleString()}</span>
                              <span className="text-weak">·</span>
                              <span style={{ color: lastC ? 'var(--text-weak)' : 'var(--red-text)', fontSize: 10 }} title={lastC ? `마지막 연락 ${lastC}` : '연락기록 없음'}>
                                {lastC ? `연락 ${lastCDays === 0 ? '오늘' : lastCDays === 1 ? '어제' : `${lastCDays}일 전`}` : '미연락'}
                              </span>
                            </div>
                          </div>
                          <div className="list-item-right">
                            <div className="dday danger">D+{daysSince}</div>
                            <div className="date">{startDate}</div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
          </div> {/* 우측 컬럼 wrapper 닫기 */}
        </div>

        <BottomBar
          left={
            <>
              <button className="btn btn-primary" type="button" onClick={() => setCreateOpen(true)}>
                <Plus size={14} weight="bold" /> 신규 등록
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => setSmsOpen(true)}
                disabled={filtered.length === 0}
                title={selectedIds.size === 0 ? `필터 표시된 ${filtered.length}건 전체 발송 (확인창에서 취소 가능)` : `선택 ${selectedIds.size}건 발송`}
              >
                <PaperPlaneTilt size={14} /> 문자 발송 ({selectedIds.size > 0 ? selectedIds.size : `전체 ${filtered.length}`})
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  if (selectedIds.size === 0) return;
                  const ids = Array.from(selectedIds).join(',');
                  window.open(`/notice/cert/bulk?ids=${ids}`, '_blank');
                }}
                disabled={selectedIds.size === 0}
                title={selectedIds.size === 0 ? '체크박스로 선택 후 일괄 출력 (한 PDF에 N장)' : '선택 계약 N건 내용증명 일괄 출력'}
              >
                <FileText size={14} /> 내용증명 일괄 출력{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
              </button>
              <button className="btn" type="button" onClick={() => setContactOpen(filtered[0] ?? null)} disabled={filtered.length === 0} title="첫 행 연락기록 — 행 선택 후 우측 연락 버튼 권장">
                <ChatCircleDots size={14} /> 연락기록
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => downloadOverdueExcel(contracts, companyMaster)}
                title={`현재 페이지 목록 (${filtered.length}건) 엑셀 다운로드`}
                disabled={filtered.length === 0}
              >
                <FileXls size={14} weight="bold" /> 엑셀 <span className="chip-count">{filtered.length}</span>
              </button>
            </>
          }
          right={
            <>
              <span>표시 <strong>{filtered.length}</strong>건</span>
              {selectedIds.size > 0 && (
                <>
                  <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
                  <span>선택 <strong>{selectedIds.size}</strong>건</span>
                  <button className="btn btn-sm btn-ghost" type="button" onClick={() => setSelectedIds(new Set())} title="선택 모두 해제">
                    <X size={11} /> 해제
                  </button>
                </>
              )}
              <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
              <span>미수 <strong className="mono" style={{ color: 'var(--red-text)' }}>₩{filtered.reduce((s, c) => s + (c.unpaidAmount ?? 0), 0).toLocaleString()}</strong></span>
              {counts['시동제어'] > 0 && (
                <>
                  <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
                  <span><Power size={11} weight="fill" style={{ color: 'var(--red-text)', verticalAlign: 'middle' }} /> {counts['시동제어']}</span>
                </>
              )}
            </>
          }
        />
      </div>

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} visibleModes={['이력']} initialMode="이력" />
      <RiskDetailDialog
        contract={detailContract}
        open={!!detailContract}
        onOpenChange={(v) => { if (!v) setDetailContract(null); }}
        onAddContact={(c) => { setDetailContract(null); setContactOpen(c); }}
        onEngineLock={(c) => { setDetailContract(null); openEngineLockDialog(c); }}
        onSendSms={(c) => { setDetailContract(null); setSelectedIds(new Set([c.id])); setSmsOpen(true); }}
        onMarkDebt={(c) => { void updateContract({ ...c, status: '채권' }); }}
        onEdit={detailContract ? () => {
          // 리스크 다이얼로그 → 풀 계약 상세 dialog (수정 가능)
          setEditContract(detailContract);
          setDetailContract(null);
        } : undefined}
      />
      <ContractDetailDialog
        contract={editContract}
        open={!!editContract}
        onOpenChange={(v) => { if (!v) setEditContract(null); }}
        onUpdate={(updated) => { void updateContract(updated); }}
      />
      <SmsDialog open={smsOpen} onOpenChange={setSmsOpen} contracts={filtered} selectedIds={selectedIds} />
      <EngineLockDialog
        contract={engineLockTarget}
        open={!!engineLockTarget}
        onOpenChange={(v) => { if (!v) setEngineLockTarget(null); }}
        onConfirm={commitEngineLock}
      />
      <ContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        onClose={() => setCtxMenu({ open: false, x: 0, y: 0, row: null })}
        items={ctxMenu.row ? ([
          { label: '상세 보기', icon: <MagnifyingGlass size={12} weight="bold" />, onClick: () => { if (ctxMenu.row) setDetailContract(ctxMenu.row); } },
          { type: 'separator' },
          { label: '연락 기록 추가', icon: <ChatCircleDots size={12} weight="bold" />, onClick: () => { if (ctxMenu.row) setContactOpen(ctxMenu.row); } },
          { label: '연락처 복사', icon: <Copy size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.customerPhone1) navigator.clipboard.writeText(ctxMenu.row.customerPhone1); }, disabled: !ctxMenu.row.customerPhone1 },
          {
            label: '미수 정보 복사',
            icon: <Copy size={12} weight="bold" />,
            onClick: () => {
              const r = ctxMenu.row;
              if (!r) return;
              const text = `${r.vehiclePlate} · ${r.customerName} · 미수 ₩${(r.unpaidAmount ?? 0).toLocaleString()} (${r.unpaidSeqCount ?? 0}회차)`;
              navigator.clipboard.writeText(text);
            },
          },
          { type: 'separator' },
          { label: '시동 제어 등록', icon: <Power size={12} weight="bold" />, onClick: () => { if (ctxMenu.row) setEngineLockTarget(ctxMenu.row); } },
          {
            label: ctxMenu.row.status === '채권' ? '채권 해제' : '채권화 처리',
            icon: <Gavel size={12} weight="bold" />,
            onClick: () => { if (ctxMenu.row) void toggleDebtFlag(ctxMenu.row); },
            danger: ctxMenu.row.status !== '채권',
          },
        ] satisfies ContextMenuItem[]) : []}
      />

      {/* 연락기록 다이얼로그 */}
      {contactOpen && (
        <ContactLogDialog
          contract={contactOpen}
          onClose={() => setContactOpen(null)}
          onSave={async (date, method, response, nextPromise, notes) => {
            try {
              await addHistory({
                scope: 'contract',
                contractId: contactOpen.id,
                vehiclePlate: contactOpen.vehiclePlate,
                date,
                category: '연락기록',
                title: `${method} — ${response.slice(0, 30)}`,
                description: [response, nextPromise && `약속일: ${nextPromise}`, notes].filter(Boolean).join('\n'),
                status: '완료',
              });
              toast.success('연락기록 저장');
              setContactOpen(null);
            } catch (e) {
              toast.error(friendlyError(e));
            }
          }}
        />
      )}
    </div>
  );
}

/* ─────────────── 연락기록 다이얼로그 ─────────────── */
function ContactLogDialog({
  contract,
  onClose,
  onSave,
}: {
  contract: Contract;
  onClose: () => void;
  onSave: (date: string, method: string, response: string, nextPromise: string, notes: string) => Promise<void>;
}) {
  const [date, setDate] = useState(todayKr());
  const [method, setMethod] = useState('전화');
  const [response, setResponse] = useState('');
  const [nextPromise, setNextPromise] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const isDirty = !!response.trim() || !!nextPromise || !!notes.trim();
  function tryClose() {
    if (isDirty && !window.confirm('입력 중인 내용이 있습니다. 저장하지 않고 닫을까요?')) return;
    onClose();
  }

  return (
    <DialogRoot open={true} onOpenChange={(v) => !v && tryClose()}>
      <DialogContent
        size="sm"
        mode="new"
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ChatCircleDots size={14} weight="fill" style={{ color: 'var(--brand)' }} />
            연락기록 — <span className="mono">{contract.vehiclePlate}</span>
            <span className="dim" style={{ fontSize: 11, fontWeight: 400 }}>{contract.customerName}</span>
          </span>
        }
      >
        <DialogBody style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="form-grid-2" style={{ gridTemplateColumns: '90px minmax(0, 1fr)' }}>
            <label className="form-label">연락일</label>
            <input
              type="date"
              className="input input-compact mono"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />

            <label className="form-label">방법</label>
            <select
              className="input input-compact"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option>전화</option>
              <option>문자</option>
              <option>카톡</option>
              <option>방문</option>
              <option>이메일</option>
            </select>

            <label className="form-label" style={{ alignSelf: 'flex-start', paddingTop: 6 }}>
              고객반응 <span style={{ color: 'var(--red-text)' }}>*</span>
            </label>
            <textarea
              className="input"
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="예) 5/30 입금 약속, 통화 안 됨, 연체이유 등"
              rows={3}
              autoFocus
              style={{ resize: 'vertical', fontFamily: 'inherit', padding: 8 }}
            />

            <label className="form-label">다음 약속일</label>
            <input
              type="date"
              className="input input-compact mono"
              value={nextPromise}
              onChange={(e) => setNextPromise(e.target.value)}
            />

            <label className="form-label" style={{ alignSelf: 'flex-start', paddingTop: 6 }}>비고</label>
            <textarea
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="필요시 추가 메모"
              style={{ resize: 'vertical', fontFamily: 'inherit', padding: 8 }}
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || !response.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(date, method, response, nextPromise, notes);
              } finally {
                setSaving(false);
              }
            }}
            title={!response.trim() ? '고객반응 입력 필요' : '연락기록 저장'}
          >
            <FloppyDisk size={12} weight="bold" /> 저장
          </button>
          <DialogClose asChild>
            <button type="button" className="btn" disabled={saving}>닫기</button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

/* ──────── 리스크 이슈 표시 헬퍼 컴포넌트 ──────── */

function IssueBadge({ issue }: { issue: RiskIssue }) {
  const color = ISSUE_COLOR[issue.kind];
  const palette = {
    red:    { bg: 'var(--red-bg)',    fg: 'var(--red-text)',    bd: 'var(--red-border)' },
    orange: { bg: 'var(--orange-bg, #fff7ed)', fg: 'var(--orange-text, #c2410c)', bd: 'rgba(194,65,12,0.25)' },
    yellow: { bg: 'var(--warn-bg, #fefce8)', fg: 'var(--warn-text, #854d0e)', bd: 'rgba(133,77,14,0.2)' },
    gray:   { bg: 'var(--bg-sunken)', fg: 'var(--text-main)',   bd: 'var(--border)' },
  }[color];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '1px 6px', fontSize: 11, fontWeight: 600,
      background: palette.bg, color: palette.fg,
      border: `1px solid ${palette.bd}`,
      borderRadius: 0,
      whiteSpace: 'nowrap', lineHeight: 1.5,
    }}>
      {ISSUE_LABEL[issue.kind]}
    </span>
  );
}

/** 액션 종류별 색조 — 시동제어=주황(운영), 내용증명=보라(법적조치), 회수=어두운 빨강(종결) */
const ACTION_PALETTE: Record<string, { bg: string; fg: string; bd: string }> = {
  '시동제어':  { bg: 'var(--orange-bg, #fff7ed)', fg: 'var(--orange-text, #c2410c)', bd: 'rgba(194,65,12,0.3)' },
  '내용증명':  { bg: '#f5f3ff', fg: '#6d28d9', bd: 'rgba(109,40,217,0.25)' },
  '회수':      { bg: '#fef2f2', fg: '#7f1d1d', bd: 'rgba(127,29,29,0.3)' },
};

function ActionNeededTag({ label }: { label: string }) {
  const p = ACTION_PALETTE[label] ?? { bg: 'var(--red-bg)', fg: 'var(--red-text)', bd: 'var(--red-border)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '1px 6px', fontSize: 10, fontWeight: 600,
      background: p.bg, color: p.fg,
      border: `1px solid ${p.bd}`,
      borderRadius: 0,
      whiteSpace: 'nowrap', lineHeight: 1.5,
    }}>
      <Warning weight="fill" style={{ width: 9, height: 9 }} />
      {label}
    </span>
  );
}

function SlaTag({ stage }: { stage: LatePayStage }) {
  if (stage === '정상' || stage === '경고') return null;
  // 단계별 색조 — 운영성(시동제어)=주황, 법적조치(내용증명)=보라, 종결(회수)=어두운 빨강
  const map: Record<Exclude<LatePayStage, '정상' | '경고'>, { label: string; bg: string; fg: string; bd: string }> = {
    '시동제어D-1': { label: '시동제어 D-1', bg: 'var(--orange-bg, #fff7ed)', fg: 'var(--orange-text, #c2410c)', bd: 'rgba(194,65,12,0.25)' },
    '시동제어':    { label: '시동제어 활성', bg: 'var(--orange-bg, #fff7ed)', fg: 'var(--orange-text, #c2410c)', bd: 'rgba(194,65,12,0.3)' },
    '내용증명':    { label: '내용증명 송부', bg: '#f5f3ff', fg: '#6d28d9', bd: 'rgba(109,40,217,0.25)' },
    '회수가능':    { label: '회수 가능',     bg: '#fef2f2', fg: '#7f1d1d', bd: 'rgba(127,29,29,0.3)' },
  };
  const m = map[stage];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '1px 6px', fontSize: 10, fontWeight: 600,
      background: m.bg, color: m.fg, border: `1px solid ${m.bd}`, borderRadius: 0,
      whiteSpace: 'nowrap', lineHeight: 1.5,
    }}>
      {m.label}
    </span>
  );
}
