'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChartBar, Car, ClipboardText, CurrencyKrw, Warning, ArrowRight,
  Clock, Calendar as CalendarIcon, Megaphone, PaperPlaneTilt, CheckCircle,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/use-auth';
import { useMyDispatchOrders, useSentDispatchOrders, DISPATCH_LABEL, DISPATCH_PRIORITY_LABEL, DISPATCH_PRIORITY_ORDER, updateDispatchStatus, type DispatchOrder, type DispatchPriority } from '@/lib/firebase/dispatch-store';
import dynamic from 'next/dynamic';
const NewOrderDialog = dynamic(
  () => import('@/components/dispatch/dispatch-view').then((m) => m.NewOrderDialog),
  { ssr: false },
);
import { toast } from '@/lib/toast';
import { Sidebar } from '@/components/layout/sidebar';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useBankTx, useCardTx } from '@/lib/firebase/transactions-store';
import { usePenalties } from '@/lib/firebase/penalty-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useAuditLogs } from '@/lib/firebase/audit-store';
import type { AuditEntityType } from '@/lib/types';
import { displayCompanyName } from '@/lib/company-display';
import { useTodos, isTodoAllDone } from '@/lib/firebase/todos-store';
import { useSchedules } from '@/lib/firebase/schedules-store';
import { StaffMultiPicker } from '@/components/ui/staff-multi-picker';
import { DetailDialogShell } from '@/components/ui/detail-dialog-shell';
import { ContractDetailDialog } from '@/components/contract-detail-dialog';
import { formatCurrency, dateWithDow, formatDate } from '@/lib/utils';
import { todayKr } from '@/lib/mock-data';
import { useLiveTodayKr } from '@/lib/use-live-today';
import { buildAllAlerts, alertColor, dDayLabel, type AlertItem } from '@/lib/alerts';
import { StatusBadge } from '@/components/ui/status-badge';

export default function DashboardPage() {
  const [detailContractId, setDetailContractId] = useState<string | null>(null);
  const { contracts, update: updateContract } = useContracts();
  const { vehicles } = useVehicles();
  const { rows: bankTx } = useBankTx();
  const { rows: cardTx } = useCardTx();
  const { penalties } = usePenalties();
  const { user } = useAuth();
  const incomingOrders = useMyDispatchOrders(user?.uid);
  const outgoingOrders = useSentDispatchOrders(user?.email);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  async function handleAckIncoming(orderId: string) {
    try {
      await updateDispatchStatus(orderId, { status: 'acknowledged', acknowledgedAt: new Date().toISOString() });
      toast.success('확인 처리됨');
    } catch (e) {
      toast.error(`확인 실패: ${(e as Error).message}`);
    }
  }
  const detailContract = detailContractId ? contracts.find((c) => c.id === detailContractId) ?? null : null;
  // 시간 의존 KPI(가동률·미수율·D-Day 등) 자동 refresh —
  // 자정 통과 또는 탭 복귀 시점에 새로 계산되도록 dependency 로 사용.
  // 5 분 tick + 탭 visible 전환 + window focus 트리거.
  const today = useLiveTodayKr();

  const kpi = useMemo(() => {
    const thisMonth = today.slice(0, 7);          // YYYY-MM
    const lastMonth = (() => {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 1);
      return d.toISOString().slice(0, 7);
    })();
    const nextMonth = (() => {
      const d = new Date(today);
      d.setMonth(d.getMonth() + 1);
      return d.toISOString().slice(0, 7);
    })();

    // 미수 + 운행
    const totalUnpaid = contracts.reduce((s, c) => s + (c.unpaidAmount ?? 0), 0);
    const unpaidCount = contracts.filter((c) => (c.unpaidAmount ?? 0) > 0).length;
    const activeContracts = contracts.filter((c) => c.status === '운행').length;
    // 가동률 = 운행 / 운영 fleet
    //   · 분모(운영 fleet): 매각·매각대기·매각검토·폐차 제외한 등록 차량 전부
    //   · 분자(운행): status === '운행'
    //   · 휴차 = 운영 fleet − 운행 (모순 없는 정의)
    const DISPOSED = new Set(['매각', '매각대기', '매각검토', '폐차']);
    const operatingFleet = vehicles.filter((v) => !DISPOSED.has(v.status)).length;
    const runningVehicles = vehicles.filter((v) => v.status === '운행').length;
    const totalVehicles = vehicles.length;
    const utilization = operatingFleet > 0 ? Math.round((runningVehicles / operatingFleet) * 100) : 0;
    const overdueReturns = contracts.filter(
      (c) => c.returnScheduledDate && !c.returnedDate && c.status === '운행' && c.returnScheduledDate < today
    ).length;
    const monthlyTarget = contracts.filter((c) => c.status === '운행').reduce((s, c) => s + (c.monthlyRent ?? 0), 0);
    // 휴차 = 운영 fleet 중 운행 안 하는 차량 (정비/대기/사고 등 포함). 매각 차량은 제외됨
    const idle = Math.max(0, operatingFleet - runningVehicles);
    const penaltyOpen = penalties.filter((p) => p.status !== '납부완료' && p.status !== '회사납부').length;
    // 핵심 % 지표
    //   · 유휴율 = 유휴 / 운영 fleet
    //   · 미수율 = 미수 / 이번달 청구 매출 (사용자 정의: 매출 기준 못 받은 비율)
    const idleRate = operatingFleet > 0 ? Math.round((idle / operatingFleet) * 100) : 0;
    const unpaidRate = monthlyTarget > 0 ? Math.round((totalUnpaid / monthlyTarget) * 100) : 0;

    // 월 수금현황 — 매칭된 입금 (계좌·카드)
    type Tx = { matchedContractId?: string; amount?: number; txDate?: string };
    const sumMatched = (txs: readonly Tx[]) => txs
      .filter((t) => t.matchedContractId && (t.amount ?? 0) > 0)
      .reduce((s, t) => s + (t.amount ?? 0), 0);
    const sumInMonth = (txs: readonly Tx[], ym: string) => txs
      .filter((t) => t.matchedContractId && (t.amount ?? 0) > 0 && (t.txDate ?? '').startsWith(ym))
      .reduce((s, t) => s + (t.amount ?? 0), 0);
    const collectedThisMonth = sumInMonth(bankTx as Tx[], thisMonth) + sumInMonth(cardTx as Tx[], thisMonth);
    const collectedLastMonth = sumInMonth(bankTx as Tx[], lastMonth) + sumInMonth(cardTx as Tx[], lastMonth);
    const collectedTotal = sumMatched(bankTx as Tx[]) + sumMatched(cardTx as Tx[]);
    const collectionProgress = monthlyTarget > 0 ? Math.round((collectedThisMonth / monthlyTarget) * 100) : 0;
    const momGrowth = collectedLastMonth > 0
      ? Math.round(((collectedThisMonth - collectedLastMonth) / collectedLastMonth) * 100)
      : null;

    // 영업/만기 KPI
    const expiringNextMonth = contracts.filter(
      (c) => c.status === '운행' && c.returnScheduledDate?.startsWith(nextMonth)
    ).length;
    const newThisMonth = contracts.filter((c) => c.contractDate?.startsWith(thisMonth)).length;

    return {
      totalUnpaid, unpaidCount, activeContracts, totalVehicles, utilization,
      operatingFleet, runningVehicles, idleRate, unpaidRate,
      overdueReturns, monthlyTarget, idle, penaltyOpen,
      collectedThisMonth, collectedLastMonth, collectionProgress, momGrowth, collectedTotal,
      expiringNextMonth, newThisMonth,
    };
  }, [contracts, vehicles, bankTx, cardTx, penalties, today]);

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <ChartBar size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>대시보드</span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-weak)' }}>지표 카드 → 클릭 시 해당 페이지로 이동</span>
          <div style={{ flex: 1 }} />
          <span className="topbar-date">{dateWithDow(today)}</span>
        </header>

        <div style={{ padding: 16, overflow: 'auto', background: 'var(--bg-page)', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* 업무 카드 — 모바일 카드 스타일 5분류 (밀린/오늘/예정/받은/요청) */}
          <Section title="업무 카드" right={<span className="dim" style={{ fontSize: 11 }}>본인 기준 · 항목 클릭 → 상세</span>}>
            <TaskCardsGrid
              contracts={contracts}
              penalties={penalties}
              incomingOrders={incomingOrders}
              outgoingOrders={outgoingOrders}
              today={today}
              onOpenContract={setDetailContractId}
              onCreateOutgoing={() => setNewOrderOpen(true)}
              onAckIncoming={handleAckIncoming}
            />
          </Section>

          {/* 최상단 — 좌 달력 + 우 할 일 칠판. panel 박스로 공간 분리 + 좌우 높이 stretch */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'stretch' }}>
            <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column' }}>
              <Section fill title="일자별 스케줄" right={<span className="dim" style={{ fontSize: 11 }}>{today.slice(0, 7)} · 더블클릭 → 상세</span>}>
                <ScheduleCalendar contracts={contracts} today={today} onSelectContract={setDetailContractId} />
              </Section>
            </div>
            <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column' }}>
              <Section fill title="할 일 보드" right={<span className="dim" style={{ fontSize: 11 }}>유관자가 함께 보는 공유 메모 · 더블클릭 → 상세</span>}>
                <TodoBoard />
              </Section>
            </div>
          </div>

          {/* 운영현황 지표 — 가동률(총대수·휴차) / 미수율(매출·수금·미수) */}
          <Section title="운영현황 지표">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <MainKpi
                icon={<Car weight="duotone" />}
                label="가동률"
                value={`${kpi.utilization}%`}
                tone="green"
                href="/asset"
                hrefHint="자산현황"
                details={[
                  { k: '총 차량', v: `${kpi.operatingFleet}대` },
                  { k: '운행', v: `${kpi.runningVehicles}대` },
                  { k: '휴차', v: `${kpi.idle}대` },
                ]}
              />
              <MainKpi
                icon={<CurrencyKrw weight="duotone" />}
                label="미수율"
                value={`${kpi.unpaidRate}%`}
                tone="red"
                href="/contract/overdue"
                hrefHint="미수금 관리"
                details={[
                  { k: '월매출', v: formatCurrency(kpi.monthlyTarget) },
                  { k: '미수금', v: formatCurrency(kpi.totalUnpaid) },
                  { k: '미수건', v: `${kpi.unpaidCount}건` },
                ]}
              />
            </div>
            {/* 보조 KPI 4종 — 이번달 운영 흐름 한 줄 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 8 }}>
              <SubKpi
                label="이번달 수금률"
                value={`${kpi.collectionProgress}%`}
                sub={`${formatCurrency(kpi.collectedThisMonth)} / ${formatCurrency(kpi.monthlyTarget)}`}
                tone={kpi.collectionProgress >= 90 ? 'green' : kpi.collectionProgress >= 70 ? 'brand' : 'orange'}
                href="/payments"
                trendPct={kpi.momGrowth}
              />
              <SubKpi
                label="반납 지연"
                value={`${kpi.overdueReturns}건`}
                sub="운행 중 · 만기 경과"
                tone={kpi.overdueReturns === 0 ? 'green' : 'red'}
                href="/contract/expire"
              />
              <SubKpi
                label="이번달 신규"
                value={`${kpi.newThisMonth}건`}
                sub={`다음달 만기 ${kpi.expiringNextMonth}건`}
                tone="brand"
                href="/contract"
              />
              <SubKpi
                label="과태료 미처리"
                value={`${kpi.penaltyOpen}건`}
                sub="고지서·매칭·통지"
                tone={kpi.penaltyOpen === 0 ? 'green' : 'orange'}
                href="/penalty"
              />
            </div>
          </Section>

          {/* D-Day 임박 알림 — 정기검사·보험만기·자동차세·면허만기·반납임박 (D-30 이내) */}
          <Section title="D-Day 임박 알림">
            <AlertsPanel contracts={contracts} today={today} />
          </Section>

          {/* 법인별 운영 현황 — 관리 법인 단위 카드 */}
          <Section title="법인별 운영 현황">
            <CompanyKpiGrid contracts={contracts} vehicles={vehicles} bankTx={bankTx} cardTx={cardTx} today={today} />
          </Section>

          {/* 최근 활동 — 감사로그 최근 20건 (점프 가능) */}
          <Section title="최근 활동" right={<Link href="/admin/audit" className="dim" style={{ fontSize: 11 }}>전체 보기 →</Link>}>
            <RecentActivityPanel />
          </Section>
        </div>

        <ContractDetailDialog
          contract={detailContract}
          open={!!detailContract}
          onOpenChange={(o) => { if (!o) setDetailContractId(null); }}
          onUpdate={(u) => { void updateContract(u); }}
        />
        {newOrderOpen && (
          <NewOrderDialog onClose={() => setNewOrderOpen(false)} creatorEmail={user?.email ?? undefined} />
        )}
      </div>
    </div>
  );
}

/* ─────────────────── 박스 줄인 섹션·줄 형식 컴포넌트 ─────────────────── */

function Section({ title, right, children, fill = false }: { title: string; right?: React.ReactNode; children: React.ReactNode; fill?: boolean }) {
  return (
    <section style={fill ? { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } : undefined}>
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>{title}</h3>
        {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
      </div>
      {fill ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
      ) : children}
    </section>
  );
}

/** 할 일 칠판 보드 — 가입회원 중 복수 담당자 + 인지/완료 + 후속 메모 공유 */
function TodoBoard() {
  const todosApi = useTodos();
  const { todos: manualTodos, add, remove } = todosApi;
  const [draft, setDraft] = useState('');
  const [assigneeChips, setAssigneeChips] = useState<string[]>([]);
  const [priority, setPriority] = useState<'high' | 'mid' | 'low'>('mid');
  const [openTodoId, setOpenTodoId] = useState<string | null>(null);

  const openTodo = openTodoId ? manualTodos.find((t) => t.id === openTodoId) ?? null : null;

  const rank = { high: 0, mid: 1, low: 2 };
  const sorted = [...manualTodos].sort((a, b) => {
    const aDone = isTodoAllDone(a), bDone = isTodoAllDone(b);
    if (aDone !== bDone) return aDone ? 1 : -1;       // 완료된 항목은 아래
    const r = rank[a.priority] - rank[b.priority];
    if (r !== 0) return r;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });

  async function handleAdd() {
    const title = draft.trim();
    if (!title) return;
    await add({
      title,
      priority,
      assignees: assigneeChips.map((name) => ({ name })),
      createdAt: new Date().toISOString(),
    });
    setDraft('');
    setAssigneeChips([]);
  }

  const TONE = {
    high: { color: 'var(--red-text)', label: '긴급' },
    mid: { color: 'var(--orange-text)', label: '보통' },
    low: { color: 'var(--text-sub)', label: '낮음' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
      {/* 입력 행 — 담당자 picker · 긴급도 · 메모 · 추가. 좁을 때만 자연 줄바꿈 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <StaffMultiPicker selected={assigneeChips} onChange={setAssigneeChips} />
        {assigneeChips.map((name) => (
          <span key={name} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 6px', fontSize: 11, fontWeight: 600,
            background: 'var(--brand-bg)', color: 'var(--brand)',
            borderRadius: 'var(--radius-sm)',
          }}>
            {name}
            <button
              type="button"
              onClick={() => setAssigneeChips((prev) => prev.filter((x) => x !== name))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, fontSize: 12, lineHeight: 1 }}
              title="제외"
            >×</button>
          </span>
        ))}
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as 'high' | 'mid' | 'low')}
          className="input-compact"
          style={{ fontSize: 11, width: 64 }}
        >
          <option value="high">긴급</option>
          <option value="mid">보통</option>
          <option value="low">낮음</option>
        </select>
        <input
          type="text"
          className="input input-compact"
          placeholder="자유 메모 입력 (예: 김부장님 보험증권 갱신 협상)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
          style={{ flex: 1, minWidth: 160, fontSize: 12 }}
        />
        <button className="btn btn-primary" type="button" onClick={() => void handleAdd()} disabled={!draft.trim()}>
          추가
        </button>
      </div>

      {/* 보드 — 수동 메모 리스트. panel 안에서 flex 1 + 스크롤 */}
      {sorted.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-sub)', fontSize: 12 }}>
          메모를 입력하면 여기에 표시됩니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minHeight: 0, overflow: 'auto', paddingRight: 2 }}>
          {sorted.map((t) => {
            const tone = TONE[t.priority];
            const allDone = isTodoAllDone(t);
            const ackCount = (t.assignees ?? []).filter((a) => !!a.ack || !!a.done).length;
            const doneCount = (t.assignees ?? []).filter((a) => !!a.done).length;
            const fuCount = t.followups?.length ?? 0;
            return (
              <div
                key={t.id}
                onDoubleClick={() => setOpenTodoId(t.id)}
                title="더블클릭 → 상세 · 인지/완료/후속메모"
                style={{
                  display: 'flex', flexDirection: 'column', gap: 4,
                  padding: '6px 10px',
                  background: allDone ? 'var(--bg-sunken)' : 'var(--bg-card)',
                  border: '1px solid var(--border-soft)',
                  borderLeft: `3px solid ${tone.color}`,
                  borderRadius: 'var(--radius-sm)',
                  opacity: allDone ? 0.6 : 1,
                  cursor: 'pointer',
                }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-main)', textDecoration: allDone ? 'line-through' : 'none' }}>{t.title}</div>
                    {t.dueDate && <div style={{ fontSize: 10, color: 'var(--text-sub)', marginTop: 1 }}>마감 {t.dueDate}</div>}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void remove(t.id); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-weak)', padding: 2, fontSize: 14, lineHeight: 1 }}
                    title="삭제"
                  >
                    ×
                  </button>
                </div>
                {/* 담당자 칩 라인 — 인지/완료 상태별 색 */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  {(t.assignees ?? []).length === 0 ? (
                    <span className="dim" style={{ fontSize: 10 }}>담당자 미지정</span>
                  ) : (t.assignees ?? []).map((a) => {
                    const state = a.done ? 'done' : a.ack ? 'ack' : 'open';
                    const styles = state === 'done'
                      ? { bg: 'var(--green-bg)', color: 'var(--green-text)', icon: '✓' }
                      : state === 'ack'
                      ? { bg: 'var(--brand-bg)', color: 'var(--brand)', icon: '●' }
                      : { bg: 'var(--bg-sunken)', color: 'var(--text-sub)', icon: '○' };
                    return (
                      <span key={a.name} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        padding: '1px 6px', fontSize: 10,
                        background: styles.bg, color: styles.color,
                        borderRadius: 'var(--radius-sm)',
                      }}>
                        <span style={{ fontSize: 9 }}>{styles.icon}</span>
                        {a.name}
                      </span>
                    );
                  })}
                  {fuCount > 0 && (
                    <span className="dim" style={{ fontSize: 10, marginLeft: 'auto' }}>
                      후속 {fuCount} · 인지 {ackCount}/{(t.assignees ?? []).length} · 완료 {doneCount}/{(t.assignees ?? []).length}
                    </span>
                  )}
                  {fuCount === 0 && (t.assignees ?? []).length > 0 && (
                    <span className="dim" style={{ fontSize: 10, marginLeft: 'auto' }}>
                      인지 {ackCount}/{(t.assignees ?? []).length} · 완료 {doneCount}/{(t.assignees ?? []).length}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TodoDetailDialog
        todo={openTodo}
        api={todosApi}
        onOpenChange={(o) => { if (!o) setOpenTodoId(null); }}
      />
    </div>
  );
}

/** 할 일 상세 다이얼로그 — 담당자별 인지/완료 + 후속 메모 + 삭제 */
function TodoDetailDialog({
  todo, api, onOpenChange,
}: {
  todo: import('@/lib/types').ManualTodo | null;
  api: ReturnType<typeof useTodos>;
  onOpenChange: (open: boolean) => void;
}) {
  const open = !!todo;
  const [followNote, setFollowNote] = useState('');
  const [followBy, setFollowBy] = useState('');

  if (!todo) {
    return (
      <DetailDialogShell open={open} onOpenChange={onOpenChange} title="" heroName="" heroMeta={null}>
        <div />
      </DetailDialogShell>
    );
  }

  const TONE = {
    high: { color: 'var(--red-text)', label: '긴급' },
    mid: { color: 'var(--orange-text)', label: '보통' },
    low: { color: 'var(--text-sub)', label: '낮음' },
  };
  const tone = TONE[todo.priority];
  const allDone = isTodoAllDone(todo);
  const ackCount = todo.assignees.filter((a) => !!a.ack || !!a.done).length;
  const doneCount = todo.assignees.filter((a) => !!a.done).length;
  const total = todo.assignees.length;

  async function handleAddFollow() {
    const note = followNote.trim();
    if (!note || !todo) return;
    await api.addFollowup(todo.id, followBy, note);
    setFollowNote('');
    // followBy 는 한 세션 내 같은 사람이 여러 번 작성할 수 있어 유지
  }

  return (
    <DetailDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={`할 일 상세 — ${todo.title}`}
      heroName={todo.title}
      heroMeta={
        <>
          <span style={{ color: tone.color, fontWeight: 700 }}>{tone.label}</span>
          {todo.dueDate && (<><span>·</span><span>마감 {todo.dueDate}</span></>)}
          {todo.createdAt && (<><span>·</span><span className="dim">생성 {todo.createdAt.slice(0, 16).replace('T', ' ')}</span></>)}
          {total > 0 && (<><span>·</span><span>인지 {ackCount}/{total} · 완료 {doneCount}/{total}</span></>)}
        </>
      }
      heroRight={
        <div style={{ display: 'flex', gap: 6 }}>
          {allDone ? (
            <button className="btn btn-sm" type="button" onClick={() => void api.setAllDone(todo.id, false)}>재오픈</button>
          ) : (
            <button className="btn btn-sm btn-primary" type="button" onClick={() => void api.setAllDone(todo.id, true)}>일괄 완료</button>
          )}
        </div>
      }
      footer={
        <button
          className="btn btn-danger"
          type="button"
          onClick={() => {
            if (window.confirm(`이 할 일을 삭제할까요?\n\n${todo.title}`)) {
              void api.remove(todo.id);
              onOpenChange(false);
            }
          }}
        >
          삭제
        </button>
      }
    >
      <div className="detail-stack">
        {/* 담당자별 상태 */}
        <section className="detail-section">
          <div className="detail-section-header">담당자 — 인지 · 완료</div>
          <div className="detail-section-body">
            {total === 0 ? (
              <div className="dim" style={{ fontSize: 12 }}>담당자가 지정되지 않았습니다.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {todo.assignees.map((a) => (
                  <div key={a.name} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px',
                    background: a.done ? 'var(--green-bg)' : 'var(--bg-card)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: 'var(--radius-sm)',
                  }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-main)', minWidth: 80 }}>{a.name}</span>
                    <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                      <button
                        className={`btn btn-sm ${a.ack || a.done ? 'btn-primary' : ''}`}
                        type="button"
                        onClick={() => void api.setAssigneeState(todo.id, a.name, 'ack', !(a.ack || a.done))}
                        disabled={!!a.done}
                        title={a.ack ? `인지: ${a.ack.slice(0, 16).replace('T', ' ')}` : '인지 표시'}
                      >
                        {a.ack || a.done ? '✓ 인지' : '인지'}
                      </button>
                      <button
                        className={`btn btn-sm ${a.done ? 'btn-primary' : ''}`}
                        type="button"
                        onClick={() => void api.setAssigneeState(todo.id, a.name, 'done', !a.done)}
                        title={a.done ? `완료: ${a.done.slice(0, 16).replace('T', ' ')}` : '완료 표시'}
                      >
                        {a.done ? '✓ 완료' : '완료'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 후속 진행 메모 */}
        <section className="detail-section">
          <div className="detail-section-header">후속 진행 메모</div>
          <div className="detail-section-body">
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input
                type="text"
                className="input input-compact"
                placeholder="작성자"
                value={followBy}
                onChange={(e) => setFollowBy(e.target.value)}
                style={{ width: 100, fontSize: 12 }}
              />
              <input
                type="text"
                className="input input-compact"
                placeholder="진행 내용 (예: 김부장님과 통화함, 화요일에 다시 연락)"
                value={followNote}
                onChange={(e) => setFollowNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleAddFollow(); }}
                style={{ flex: 1, fontSize: 12 }}
              />
              <button className="btn btn-primary" type="button" onClick={() => void handleAddFollow()} disabled={!followNote.trim()}>
                기록
              </button>
            </div>
            {(todo.followups ?? []).length === 0 ? (
              <div className="dim" style={{ fontSize: 12, textAlign: 'center', padding: '12px 0' }}>아직 기록된 후속 내용이 없습니다.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[...(todo.followups ?? [])].reverse().map((f) => (
                  <div key={f.id} style={{
                    display: 'flex', gap: 8, alignItems: 'flex-start',
                    padding: '8px 10px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: 'var(--radius-sm)',
                  }}>
                    <div style={{ minWidth: 100, fontSize: 11 }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{f.by}</div>
                      <div className="dim" style={{ fontSize: 10 }}>{f.at.slice(0, 16).replace('T', ' ')}</div>
                    </div>
                    <div style={{ flex: 1, fontSize: 12, color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>{f.note}</div>
                    <button
                      type="button"
                      onClick={() => void api.removeFollowup(todo.id, f.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-weak)', padding: 2, fontSize: 14, lineHeight: 1 }}
                      title="이 메모 삭제"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </DetailDialogShell>
  );
}

/** 일자별 스케줄 달력 — 만기·반납·신규 표시 */
type ScheduleDayItem = { contractId: string; plate: string; customer: string; kind: '만기' | '반납' | '신규' };

const KIND_COLOR: Record<ScheduleDayItem['kind'], string> = {
  '만기': 'var(--orange-text)',
  '반납': 'var(--red-text)',
  '신규': 'var(--green-text)',
};

function ScheduleCalendar({ contracts, today, onSelectContract }: { contracts: import('@/lib/types').Contract[]; today: string; onSelectContract: (id: string) => void }) {
  const [year, month] = today.split('-').map(Number);
  const [dialogYmd, setDialogYmd] = useState<string | null>(null);
  const { schedules } = useSchedules();
  // 일자별 일정 카운트 + 미해소 여부 (오늘 이전 + done 안 됨)
  const manualByYmd = useMemo(() => {
    const m = new Map<string, { open: number; done: number; stale: number }>();
    for (const s of schedules) {
      const cur = m.get(s.date) ?? { open: 0, done: 0, stale: 0 };
      if (s.done) cur.done += 1;
      else {
        cur.open += 1;
        if (s.date < today) cur.stale += 1;
      }
      m.set(s.date, cur);
    }
    return m;
  }, [schedules, today]);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startWeekday = firstDay.getDay(); // 0=일
  const daysInMonth = lastDay.getDate();

  // 일자별 이벤트 카운트 + 상세 리스트 (한 번 순회로 O(N))
  const { counts, details } = useMemo(() => {
    const c2 = new Map<string, { expire: number; return: number; renew: number }>();
    const d2 = new Map<string, ScheduleDayItem[]>();
    const push = (ymd: string, item: ScheduleDayItem) => {
      const arr = d2.get(ymd) ?? [];
      arr.push(item);
      d2.set(ymd, arr);
    };
    for (const c of contracts) {
      const inc = (date: string | undefined, type: 'expire' | 'return' | 'renew', kind: ScheduleDayItem['kind']) => {
        if (!date) return;
        const ymd = date.slice(0, 10);
        const cur = c2.get(ymd) ?? { expire: 0, return: 0, renew: 0 };
        cur[type] += 1;
        c2.set(ymd, cur);
        push(ymd, { contractId: c.id, plate: c.vehiclePlate ?? '', customer: c.customerName ?? '', kind });
      };
      if (c.status === '운행') inc(c.returnScheduledDate, 'expire', '만기');
      if (!c.returnedDate && c.returnScheduledDate) inc(c.returnScheduledDate, 'return', '반납');
      inc(c.contractDate, 'renew', '신규');
    }
    return { counts: c2, details: d2 };
  }, [contracts]);

  const cells: Array<{ day: number | null; ymd: string }> = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ day: null, ymd: '' });
  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, ymd });
  }

  const todayDay = today.startsWith(`${year}-${String(month).padStart(2, '0')}`) ? Number(today.slice(8, 10)) : -1;

  return (
    <>
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, fontSize: 11, marginBottom: 4 }}>
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
            <div key={d} style={{ textAlign: 'center', fontWeight: 600, color: i === 0 ? 'var(--red-text)' : i === 6 ? 'var(--blue-text, var(--brand))' : 'var(--text-sub)', paddingBottom: 4 }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {cells.map((cell, idx) => {
            if (cell.day == null) return <div key={idx} />;
            const ev = counts.get(cell.ymd);
            const isToday = cell.day === todayDay;
            const weekday = idx % 7;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setDialogYmd(cell.ymd)}
                title="클릭 → 일정 상세"
                style={{
                  textAlign: 'left',
                  minHeight: 64,
                  padding: 6,
                  background: isToday ? 'var(--brand-bg)' : 'var(--bg-card)',
                  border: isToday ? '1.5px solid var(--brand)' : '1px solid var(--border-soft)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  cursor: 'pointer',
                  font: 'inherit',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: isToday ? 700 : 500, color: weekday === 0 ? 'var(--red-text)' : weekday === 6 ? 'var(--blue-text, var(--brand))' : 'var(--text-main)' }}>{cell.day}</div>
                {(() => {
                  const m = manualByYmd.get(cell.ymd);
                  const totalManual = (m?.open ?? 0) + (m?.done ?? 0);
                  if (!ev && totalManual === 0) return null;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 9 }}>
                      {ev && ev.expire > 0 && <span style={{ color: 'var(--orange-text)' }}>● 만기 {ev.expire}</span>}
                      {ev && ev.return > 0 && <span style={{ color: 'var(--red-text)' }}>● 반납 {ev.return}</span>}
                      {ev && ev.renew > 0 && <span style={{ color: 'var(--green-text)' }}>● 신규 {ev.renew}</span>}
                      {m && m.open > 0 && (
                        <span style={{ color: m.stale > 0 ? 'var(--red-text)' : 'var(--brand)', fontWeight: m.stale > 0 ? 700 : 500 }}>
                          {m.stale > 0 ? '⚠' : '●'} 일정 {m.open}
                        </span>
                      )}
                      {m && m.done > 0 && m.open === 0 && (
                        <span style={{ color: 'var(--green-text)' }}>✓ 완료 {m.done}</span>
                      )}
                    </div>
                  );
                })()}
              </button>
            );
          })}
        </div>
      </div>

      <ScheduleDetailDialog
        ymd={dialogYmd}
        items={dialogYmd ? (details.get(dialogYmd) ?? []) : []}
        onOpenChange={(o) => { if (!o) setDialogYmd(null); }}
        onSelectContract={(id) => { setDialogYmd(null); onSelectContract(id); }}
      />
    </>
  );
}

/** 일정 상세 다이얼로그 — 규격: DetailDialogShell 단일 모드. 행 클릭 → 계약 상세 모달 */
function ScheduleDetailDialog({
  ymd, items, onOpenChange, onSelectContract,
}: {
  ymd: string | null;
  items: ScheduleDayItem[];
  onOpenChange: (open: boolean) => void;
  onSelectContract: (contractId: string) => void;
}) {
  const open = !!ymd;
  const today = todayKr();
  const { schedules, add: addSchedule, remove: removeSchedule, toggleDone: toggleScheduleDone } = useSchedules();
  const [draftTitle, setDraftTitle] = useState('');
  const [draftTime, setDraftTime] = useState('');

  // ymd 표시 — `2026-06-09 (월)`
  const heroLabel = (() => {
    if (!ymd) return '';
    const [y, m, d] = ymd.split('-').map(Number);
    const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
    return `${ymd} (${dow})`;
  })();

  const counts = items.reduce(
    (acc, it) => ({ ...acc, [it.kind]: (acc as Record<string, number>)[it.kind] + 1 || 1 }),
    { 만기: 0, 반납: 0, 신규: 0 } as Record<ScheduleDayItem['kind'], number>,
  );

  const grouped: Array<[ScheduleDayItem['kind'], ScheduleDayItem[]]> = [
    ['만기', items.filter((x) => x.kind === '만기')],
    ['반납', items.filter((x) => x.kind === '반납')],
    ['신규', items.filter((x) => x.kind === '신규')],
  ];

  // 해당 일자 수동 스케줄
  const daySchedules = ymd ? schedules.filter((s) => s.date === ymd).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')) : [];

  async function handleAddSchedule() {
    const title = draftTitle.trim();
    if (!title || !ymd) return;
    await addSchedule({
      date: ymd,
      title,
      time: draftTime.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    setDraftTitle('');
    setDraftTime('');
  }

  return (
    <DetailDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={`일정 상세 — ${heroLabel}`}
      heroName={heroLabel}
      heroMeta={
        <>
          {ymd === today && <><span className="status 운행">오늘</span><span>·</span></>}
          <span>총 {items.length + daySchedules.length}건</span>
          {counts.만기 > 0 && <><span>·</span><span style={{ color: KIND_COLOR['만기'] }}>만기 {counts.만기}</span></>}
          {counts.반납 > 0 && <><span>·</span><span style={{ color: KIND_COLOR['반납'] }}>반납 {counts.반납}</span></>}
          {counts.신규 > 0 && <><span>·</span><span style={{ color: KIND_COLOR['신규'] }}>신규 {counts.신규}</span></>}
          {daySchedules.length > 0 && <><span>·</span><span style={{ color: 'var(--brand)' }}>일정 {daySchedules.length}</span></>}
        </>
      }
    >
      <div className="detail-stack">
        {/* 자동 집계 — 만기/반납/신규 */}
        {grouped.map(([kind, arr]) => {
          if (arr.length === 0) return null;
          return (
            <section key={kind} className="detail-section">
              <div className="detail-section-header" style={{ color: KIND_COLOR[kind] }}>
                {kind} ({arr.length})
              </div>
              <div className="detail-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {arr.map((it, i) => (
                  <button
                    key={`${it.contractId}-${i}`}
                    type="button"
                    onClick={() => onSelectContract(it.contractId)}
                    title="클릭 → 계약 상세 정보"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-soft)',
                      borderLeft: `3px solid ${KIND_COLOR[kind]}`,
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 12,
                      color: 'var(--text-main)',
                      cursor: 'pointer',
                      font: 'inherit',
                      textAlign: 'left',
                    }}
                  >
                    <span className="plate">{it.plate || '-'}</span>
                    <span style={{ color: 'var(--text-sub)' }}>{it.customer || '-'}</span>
                    <span className="dim" style={{ marginLeft: 'auto', fontSize: 10 }}>상세 보기 →</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}

        {/* 일정 — 시간 + 제목만, 미해소는 경고 강조 */}
        <section className="detail-section">
          <div className="detail-section-header">일정</div>
          <div className="detail-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* 입력 한 줄 — 시간 + 제목 + Enter */}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="time"
                className="input input-compact"
                value={draftTime}
                onChange={(e) => setDraftTime(e.target.value)}
                style={{ width: 100, fontSize: 12 }}
              />
              <input
                type="text"
                className="input input-compact"
                placeholder="일정 입력 후 Enter (예: 보험사 미팅)"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleAddSchedule(); }}
                style={{ flex: 1, fontSize: 12 }}
                autoFocus
              />
            </div>
            {daySchedules.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {daySchedules.map((s) => {
                  const stale = !s.done && ymd && ymd < today;
                  const accent = stale ? 'var(--red-text)' : s.done ? 'var(--green-text)' : 'var(--brand)';
                  return (
                    <div key={s.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px',
                      background: stale ? 'var(--red-bg)' : 'var(--bg-card)',
                      border: '1px solid var(--border-soft)',
                      borderLeft: `3px solid ${accent}`,
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 12,
                      opacity: s.done ? 0.6 : 1,
                    }}>
                      <input
                        type="checkbox"
                        checked={!!s.done}
                        onChange={() => void toggleScheduleDone(s.id, !s.done)}
                        title={s.done ? '완료 — 재오픈' : '처리 완료로 표시'}
                      />
                      {s.time && (
                        <span className="mono" style={{ fontWeight: 700, color: accent, minWidth: 44 }}>{s.time}</span>
                      )}
                      <span style={{
                        flex: 1, color: 'var(--text-main)', fontWeight: 600,
                        textDecoration: s.done ? 'line-through' : 'none',
                      }}>{s.title}</span>
                      {stale && <span style={{ fontSize: 11, color: 'var(--red-text)', fontWeight: 700 }}>⚠ 지연</span>}
                      <button
                        type="button"
                        onClick={() => void removeSchedule(s.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-weak)', padding: 2, fontSize: 14, lineHeight: 1 }}
                        title="삭제"
                      >×</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </DetailDialogShell>
  );
}

/** 메인 KPI — 가동률·수금률 등 핵심 지표용 큰 카드 (2 col span, 진행률 바 포함) */
/** 법인별 운영 현황 — 회사 단위로 동일 KPI(가동률/수금률/유휴율/미수율) 4종 카드 그리드 */
function CompanyKpiGrid({
  contracts, vehicles, bankTx, cardTx, today,
}: {
  contracts: import('@/lib/types').Contract[];
  vehicles: import('@/lib/types').Vehicle[];
  bankTx: readonly { matchedContractId?: string; amount?: number; txDate?: string }[];
  cardTx: readonly { matchedContractId?: string; amount?: number; txDate?: string }[];
  today: string;
}) {
  const { companies } = useCompanies();

  const rows = useMemo(() => {
    const thisMonth = today.slice(0, 7);
    const DISPOSED = new Set(['매각', '매각대기', '매각검토']);

    // contractId → company 매핑 (tx → company 추적용)
    const contractCompany = new Map<string, string>();
    for (const c of contracts) contractCompany.set(c.id, c.company);

    // 회사별 수금 한 번에 집계 (O(N))
    const collectedBy = new Map<string, number>();
    const incCollected = (txs: readonly { matchedContractId?: string; amount?: number; txDate?: string }[]) => {
      for (const t of txs) {
        if (!t.matchedContractId || !(t.amount && t.amount > 0)) continue;
        if (!(t.txDate ?? '').startsWith(thisMonth)) continue;
        const co = contractCompany.get(t.matchedContractId);
        if (!co) continue;
        collectedBy.set(co, (collectedBy.get(co) ?? 0) + (t.amount ?? 0));
      }
    };
    incCollected(bankTx);
    incCollected(cardTx);

    // 회사 코드 enumeration — vehicles + contracts 에서 등장한 모든 company + master companies
    const companySet = new Set<string>();
    for (const v of vehicles) if (v.company) companySet.add(v.company);
    for (const c of contracts) if (c.company) companySet.add(c.company);
    for (const m of companies) if (m.code) companySet.add(m.code);

    type Row = {
      code: string;
      name: string;
      operatingFleet: number; running: number; idle: number;
      utilization: number; idleRate: number;
      monthlyTarget: number; collected: number;
      collectionProgress: number;
      unpaid: number; unpaidCount: number; unpaidRate: number;
    };
    const out: Row[] = [];
    for (const code of companySet) {
      const vs = vehicles.filter((v) => v.company === code);
      const cs = contracts.filter((c) => c.company === code);
      const operatingFleet = vs.filter((v) => !DISPOSED.has(v.status)).length;
      const running = vs.filter((v) => v.status === '운행').length;
      const idle = vs.filter((v) => !v.currentContractId && !DISPOSED.has(v.status)).length;
      const monthlyTarget = cs.filter((c) => c.status === '운행').reduce((s, c) => s + (c.monthlyRent ?? 0), 0);
      const unpaid = cs.reduce((s, c) => s + (c.unpaidAmount ?? 0), 0);
      const unpaidCount = cs.filter((c) => (c.unpaidAmount ?? 0) > 0).length;
      const collected = collectedBy.get(code) ?? 0;
      out.push({
        code,
        name: displayCompanyName(code, companies),
        operatingFleet, running, idle,
        utilization: operatingFleet > 0 ? Math.round((running / operatingFleet) * 100) : 0,
        idleRate: operatingFleet > 0 ? Math.round((idle / operatingFleet) * 100) : 0,
        monthlyTarget, collected,
        collectionProgress: monthlyTarget > 0 ? Math.round((collected / monthlyTarget) * 100) : 0,
        unpaid, unpaidCount,
        unpaidRate: monthlyTarget > 0 ? Math.round((unpaid / monthlyTarget) * 100) : 0,
      });
    }
    // 운영대수 큰 순으로
    out.sort((a, b) => b.operatingFleet - a.operatingFleet);
    return out;
  }, [contracts, vehicles, bankTx, cardTx, companies, today]);

  if (rows.length === 0) {
    return (
      <div className="panel" style={{ padding: 24, textAlign: 'center', color: 'var(--text-sub)', fontSize: 12 }}>
        등록된 법인이 없습니다.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
      {rows.map((r) => <CompanyKpiCard key={r.code} row={r} />)}
    </div>
  );
}

function CompanyKpiCard({ row }: { row: {
  code: string; name: string;
  operatingFleet: number; running: number; idle: number;
  utilization: number; idleRate: number;
  monthlyTarget: number; collected: number; collectionProgress: number;
  unpaid: number; unpaidCount: number; unpaidRate: number;
} }) {
  // 톤 산정 — 메인 카드와 동일 thresholds
  const utilTone = row.utilization >= 80 ? 'green' : row.utilization >= 60 ? 'brand' : 'orange';
  const unpaidTone = row.unpaidRate <= 5 ? 'green' : row.unpaidRate <= 15 ? 'brand' : row.unpaidRate <= 30 ? 'orange' : 'red';
  const codeQ = encodeURIComponent(row.code);

  return (
    <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', borderBottom: '1px solid var(--border-soft)', paddingBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>{row.name}</div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-sub)' }}>
          운영 <span className="mono" style={{ fontWeight: 600, color: 'var(--text-main)' }}>{row.operatingFleet}</span>대
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <CompanyMiniKpi
          label="가동률"
          value={`${row.utilization}%`}
          tone={utilTone}
          sub={`총 ${row.operatingFleet} · 휴차 ${row.idle}`}
          href={`/asset?company=${codeQ}`}
        />
        <CompanyMiniKpi
          label="미수율"
          value={`${row.unpaidRate}%`}
          tone={unpaidTone}
          sub={`월매출 ${row.monthlyTarget.toLocaleString('ko-KR')} · 미수 ${row.unpaid.toLocaleString('ko-KR')}`}
          href={`/contract/overdue?company=${codeQ}`}
        />
      </div>
    </div>
  );
}

function CompanyMiniKpi({
  label, value, tone, sub, href,
}: {
  label: string;
  value: string;
  tone: 'brand' | 'red' | 'orange' | 'green' | 'zinc';
  sub?: string;
  href?: string;
}) {
  const colorMap = {
    brand: 'var(--brand)', red: 'var(--red-text)', orange: 'var(--orange-text)',
    green: 'var(--green-text)', zinc: 'var(--text-sub)',
  };
  const style: React.CSSProperties = {
    padding: '6px 10px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-soft)',
    borderLeft: `3px solid ${colorMap[tone]}`,
    borderRadius: 'var(--radius-sm)',
    display: 'flex', flexDirection: 'column', gap: 2,
    textDecoration: 'none', color: 'inherit',
  };
  const body = (
    <>
      <div style={{ fontSize: 10, color: 'var(--text-sub)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: colorMap[tone], fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</div>
      {sub && <div className="mono" style={{ fontSize: 9, color: 'var(--text-weak)', fontVariantNumeric: 'tabular-nums' }}>{sub}</div>}
    </>
  );
  if (href) {
    return <Link href={href} style={style} title="클릭 — 해당 페이지로 이동 (회사 필터 적용)">{body}</Link>;
  }
  return <div style={style}>{body}</div>;
}

function MainKpi({
  icon, label, value, details, tone, href, hrefHint,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  /** 우측 세부 라인 — 한 줄 / 한 항목 */
  details?: Array<{ k: string; v: string }>;
  tone: 'brand' | 'red' | 'orange' | 'green' | 'zinc';
  /** 클릭 시 이동 경로 — drill-down */
  href?: string;
  /** href 우측 끝 표시 안내 — '자산현황' / '미수금 관리' */
  hrefHint?: string;
}) {
  const colorMap = {
    brand: 'var(--brand)', red: 'var(--red-text)', orange: 'var(--orange-text)',
    green: 'var(--green-text)', zinc: 'var(--text-sub)',
  };
  const body = (
    <>
      <span style={{ color: colorMap[tone], display: 'inline-flex', alignSelf: 'center' }}>{icon}</span>
      <span style={{ fontSize: 13, color: 'var(--text-sub)', fontWeight: 600, letterSpacing: '-0.01em' }}>{label}</span>
      <span style={{
        fontSize: 20, fontWeight: 800, color: colorMap[tone],
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
      }}>{value}</span>
      {details && details.map((d) => (
        <span key={d.k} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, fontSize: 12, color: 'var(--text-sub)' }}>
          <span>{d.k}</span>
          <span className="mono" style={{
            color: 'var(--text-main)', fontWeight: 700, fontSize: 13,
            fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em',
          }}>{d.v}</span>
        </span>
      ))}
      {href && hrefHint && (
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-weak)' }}>
          {hrefHint} <ArrowRight size={11} weight="bold" />
        </span>
      )}
    </>
  );
  const baseStyle: React.CSSProperties = {
    padding: '14px 20px',
    display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: 20,
  };
  if (href) {
    return (
      <Link href={href} className="panel" style={{ ...baseStyle, textDecoration: 'none', color: 'inherit' }} title={hrefHint ? `${hrefHint} 페이지로 이동` : undefined}>
        {body}
      </Link>
    );
  }
  return <div className="panel" style={baseStyle}>{body}</div>;
}

/** SubKpi — 보조 KPI 카드 (운영 흐름 mini 4개 한 줄). */
function SubKpi({
  label, value, sub, tone, href, trendPct,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: 'brand' | 'red' | 'orange' | 'green' | 'zinc';
  href?: string;
  /** 전월대비 증감 (%, null = 비교 불가) */
  trendPct?: number | null;
}) {
  const colorMap = {
    brand: 'var(--brand)', red: 'var(--red-text)', orange: 'var(--orange-text)',
    green: 'var(--green-text)', zinc: 'var(--text-sub)',
  };
  const style: React.CSSProperties = {
    padding: '10px 14px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-soft)',
    borderLeft: `3px solid ${colorMap[tone]}`,
    borderRadius: 'var(--radius-sm)',
    display: 'flex', flexDirection: 'column', gap: 4,
    textDecoration: 'none', color: 'inherit',
    cursor: href ? 'pointer' : 'default',
  };
  const body = (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-sub)', fontWeight: 500 }}>{label}</span>
        {trendPct != null && (
          <span className="mono" style={{ fontSize: 10, marginLeft: 'auto', color: trendPct >= 0 ? 'var(--green-text)' : 'var(--red-text)', fontWeight: 600 }}>
            {trendPct >= 0 ? '↑' : '↓'} {Math.abs(trendPct)}%
          </span>
        )}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: colorMap[tone], fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</div>
      {sub && <div className="mono" style={{ fontSize: 10, color: 'var(--text-weak)', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
    </>
  );
  if (href) return <Link href={href} style={style} title={`${label} → 상세`}>{body}</Link>;
  return <div style={style}>{body}</div>;
}

/* ─────────────────── D-Day 임박 알림 패널 ─────────────────── */

const KIND_BADGE: Record<AlertItem['kind'], string> = {
  '정기검사': '검사',
  '보험만기': '보험',
  '자동차세': '자동차세',
  '면허만기': '면허',
  '반납임박': '반납',
};

function AlertsPanel({ contracts, today }: { contracts: import('@/lib/types').Contract[]; today: string }) {
  const alerts = useMemo(() => buildAllAlerts(contracts, today), [contracts, today]);
  const overdue = alerts.filter((a) => a.severity === 'overdue').length;
  const urgent = alerts.filter((a) => a.severity === 'urgent').length;
  const soon = alerts.filter((a) => a.severity === 'soon').length;

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="detail-section-header" style={{ background: 'var(--bg-card)' }}>
        <Warning size={12} weight="duotone" />
        <span className="title">D-30 이내 임박 (만기·반납·검사)</span>
        <span style={{ fontSize: 11, color: 'var(--text-weak)' }}>
          {overdue > 0 && <span style={{ color: 'var(--red-text)', marginRight: 8 }}><strong>경과 {overdue}</strong></span>}
          {urgent > 0 && <span style={{ color: 'var(--red-text)', marginRight: 8 }}>긴급 {urgent}</span>}
          {soon > 0 && <span style={{ color: 'var(--orange-text)' }}>임박 {soon}</span>}
          {alerts.length === 0 && <span style={{ color: 'var(--green-text)' }}>임박 항목 없음 ✓</span>}
        </span>
      </div>
      {alerts.length === 0 ? (
        <div style={{ padding: 24, fontSize: 12, color: 'var(--text-weak)', textAlign: 'center' }}>
          현재 D-30 이내 임박 항목이 없습니다.
        </div>
      ) : (
        <div style={{ maxHeight: 360, overflow: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th className="center" style={{ width: 70 }}>D-Day</th>
                <th className="center" style={{ width: 64 }}>구분</th>
                <th style={{ width: 110 }}>예정일</th>
                <th style={{ width: 110 }}>차량번호</th>
                <th>계약자</th>
                <th>회사</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr
                  key={a.id}
                  style={{ cursor: 'pointer' }}
                  title={`${a.customerName} ${a.vehiclePlate} ${KIND_BADGE[a.kind]} 상세 — 새 탭`}
                  onClick={() => window.open(`/contract?id=${encodeURIComponent(a.contractId)}`, '_blank')}
                >
                  <td className="center mono" style={{ color: alertColor(a.severity), fontWeight: 600 }}>
                    {dDayLabel(a.daysLeft)}
                  </td>
                  <td className="center">
                    <StatusBadge tone={a.severity === 'overdue' ? 'red' : a.severity === 'urgent' ? 'orange' : 'blue'}>{KIND_BADGE[a.kind]}</StatusBadge>
                  </td>
                  <td className="mono">{formatDate(a.dueDate)}</td>
                  <td className="mono">{a.vehiclePlate}</td>
                  <td>{a.customerName}</td>
                  <td className="dim">{a.company}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────── 최근 활동 패널 (감사로그) ─────────────────── */

const ACTIVITY_LABEL: Partial<Record<string, string>> = {
  create: '생성', update: '수정', delete: '삭제',
  restore: '복원', match: '매칭', unmatch: '매칭해제',
  import: '업로드', export: '내보내기',
  login: '로그인', logout: '로그아웃',
};

const ACTIVITY_ENTITY: Partial<Record<AuditEntityType, string>> = {
  contract: '계약', company: '법인', vehicle: '차량',
  bank_tx: '계좌', card_tx: '카드', schedule: '회차',
  penalty: '과태료', license: '면허', document: '서류', system: '시스템',
};

function activityHref(t: AuditEntityType, id?: string): string | null {
  if (!id || id === 'batch') return null;
  switch (t) {
    case 'contract':  return `/contract?id=${encodeURIComponent(id)}`;
    case 'vehicle':   return `/asset?id=${encodeURIComponent(id)}`;
    case 'company':   return `/companies?id=${encodeURIComponent(id)}`;
    case 'penalty':   return `/penalty`;
    case 'bank_tx':
    case 'card_tx':   return `/payments`;
    default: return null;
  }
}

function RecentActivityPanel() {
  const { rows, loading } = useAuditLogs(20);

  // 상대 시간 — 활동의 신선도 한 눈에 (방금/5분 전/오늘/어제/...).
  // 같은 today 의존이라 useLiveTodayKr 와 별개 — 활동은 분 단위 변화라 nowTick 사용.
  // ⚠️ early return 위에 위치해야 — Hooks 규칙
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60 * 1000);  // 1분 마다 refresh
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div className="panel" style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-weak)' }}>
        활동 로드 중…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="panel" style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-weak)' }}>
        활동 기록 없음
      </div>
    );
  }
  function relTime(atIso: string): string {
    const diffMin = Math.round((nowTick - new Date(atIso).getTime()) / 60000);
    if (diffMin < 1) return '방금';
    if (diffMin < 60) return `${diffMin}분 전`;
    if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)}시간 전`;
    const days = Math.floor(diffMin / (60 * 24));
    if (days === 1) return '어제';
    if (days < 7) return `${days}일 전`;
    return atIso.slice(5, 10);   // 일주일 넘으면 MM-DD
  }

  return (
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ maxHeight: 320, overflow: 'auto' }}>
        {rows.slice(0, 20).map((r) => {
          const href = activityHref(r.entityType, r.entityId);
          const rel = relTime(r.at);
          const absTime = r.at.slice(0, 16).replace('T', ' ');
          const inner = (
            <>
              <span className="mono dim" style={{ fontSize: 10, minWidth: 64 }} title={absTime}>{rel}</span>
              <span className="dim" style={{ fontSize: 11, minWidth: 70, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.by ?? '시스템'}</span>
              <span style={{ fontSize: 11, fontWeight: 600, minWidth: 50, color: r.action === 'delete' ? 'var(--red-text)' : r.action === 'create' ? 'var(--green-text)' : 'var(--brand)' }}>
                {ACTIVITY_LABEL[r.action] ?? r.action}
              </span>
              <span className="dim" style={{ fontSize: 11, minWidth: 40 }}>{ACTIVITY_ENTITY[r.entityType] ?? r.entityType}</span>
              <span style={{ fontSize: 11, flex: 1, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
            </>
          );
          const rowStyle: React.CSSProperties = {
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '6px 12px',
            borderTop: '1px solid var(--border-soft)',
            textDecoration: 'none',
            color: 'inherit',
          };
          if (href) {
            return (
              <a
                key={r.id}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="activity-row-link"
                style={{ ...rowStyle, cursor: 'pointer' }}
                title="새 탭으로 점프"
              >
                {inner}
              </a>
            );
          }
          return <div key={r.id} style={rowStyle}>{inner}</div>;
        })}
      </div>
    </div>
  );
}



/* ─────────────────── 업무 카드 — 모바일 카드 스타일 5분류 ─────────────────── */

const daysBetween = (a: string, b: string) => {
  if (!a || !b) return 0;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.round((da - db) / 86400000);
};

type TaskTone = 'red' | 'brand' | 'purple' | 'amber' | 'gray';

type TaskItem = {
  key: string;
  title: string;
  sub?: string;
  meta?: string;
  href?: string;
  onClick?: () => void;
  ackId?: string;          // 받은 업무 — 클릭 시 [확인] 처리
  /** 시각적 우선순위 — 'urgent' = 강조, 'thisMonth' = dim */
  priority?: DispatchPriority;
};

function TaskCardsGrid({
  contracts, penalties, incomingOrders, outgoingOrders, today, onOpenContract, onCreateOutgoing, onAckIncoming,
}: {
  contracts: ReturnType<typeof useContracts>['contracts'];
  penalties: ReturnType<typeof usePenalties>['penalties'];
  incomingOrders: DispatchOrder[];
  outgoingOrders: DispatchOrder[];
  today: string;
  onOpenContract: (id: string) => void;
  onCreateOutgoing?: () => void;
  onAckIncoming?: (orderId: string) => void;
}) {
  const groups = useMemo(() => {
    const overdue: TaskItem[] = [];
    const todays: TaskItem[] = [];
    const upcoming: TaskItem[] = [];

    const d = new Date(today);
    const in7 = new Date(d);
    in7.setDate(d.getDate() + 7);
    const upTo = in7.toISOString().slice(0, 10);

    const unpaidList = contracts
      .filter((c) => (c.unpaidAmount ?? 0) > 0)
      .sort((a, b) => (b.unpaidAmount ?? 0) - (a.unpaidAmount ?? 0))
      .slice(0, 8);
    for (const c of unpaidList) {
      overdue.push({
        key: `unpaid-${c.id}`,
        title: c.customerName ?? '?',
        sub: `${c.vehiclePlate ?? '-'} · 미수 ${formatCurrency(c.unpaidAmount ?? 0)}`,
        onClick: () => onOpenContract(c.id),
      });
    }
    const lateReturns = contracts.filter(
      (c) => c.returnScheduledDate && !c.returnedDate && c.status === '운행' && c.returnScheduledDate < today
    ).slice(0, 5);
    for (const c of lateReturns) {
      overdue.push({
        key: `late-${c.id}`,
        title: c.customerName ?? '?',
        sub: `${c.vehiclePlate ?? '-'} · 반납 지연`,
        meta: dDayLabel(daysBetween(c.returnScheduledDate ?? '', today)),
        onClick: () => onOpenContract(c.id),
      });
    }
    const openPenalty = penalties.filter((p) => p.status !== '납부완료' && p.status !== '회사납부').slice(0, 5);
    for (const p of openPenalty) {
      overdue.push({
        key: `pen-${p.id}`,
        title: p.carNumber ?? '?',
        sub: `${p.docType} · ${p.description ?? '-'}`,
        meta: p.dueDate ? dDayLabel(daysBetween(p.dueDate, today)) : undefined,
        href: '/penalty',
      });
    }

    const todayDeliveries = contracts.filter((c) =>
      !c.deliveredDate && (c.deliveryScheduledDate ?? c.contractDate) === today
    );
    for (const c of todayDeliveries) {
      todays.push({
        key: `del-${c.id}`,
        title: c.customerName ?? '?',
        sub: `${c.vehiclePlate ?? '-'} 인도`,
        meta: '오늘',
        onClick: () => onOpenContract(c.id),
      });
    }
    const todayReturns = contracts.filter((c) =>
      !c.returnedDate && c.returnScheduledDate === today
    );
    for (const c of todayReturns) {
      todays.push({
        key: `ret-${c.id}`,
        title: c.customerName ?? '?',
        sub: `${c.vehiclePlate ?? '-'} 반납`,
        meta: '오늘',
        onClick: () => onOpenContract(c.id),
      });
    }

    const futureDeliveries = contracts.filter((c) => {
      const dd = c.deliveryScheduledDate ?? c.contractDate ?? '';
      return !c.deliveredDate && dd > today && dd <= upTo;
    }).slice(0, 6);
    for (const c of futureDeliveries) {
      upcoming.push({
        key: `fdel-${c.id}`,
        title: c.customerName ?? '?',
        sub: `${c.vehiclePlate ?? '-'} 인도 예정`,
        meta: dDayLabel(daysBetween(c.deliveryScheduledDate ?? c.contractDate ?? '', today)),
        onClick: () => onOpenContract(c.id),
      });
    }
    const futureReturns = contracts.filter((c) =>
      !c.returnedDate && c.returnScheduledDate && c.returnScheduledDate > today && c.returnScheduledDate <= upTo
    ).slice(0, 6);
    for (const c of futureReturns) {
      upcoming.push({
        key: `fret-${c.id}`,
        title: c.customerName ?? '?',
        sub: `${c.vehiclePlate ?? '-'} 반납 예정`,
        meta: dDayLabel(daysBetween(c.returnScheduledDate ?? '', today)),
        onClick: () => onOpenContract(c.id),
      });
    }

    // 우선순위 정렬: 긴급 → 오늘 → 이번주 → 이번달
    const priOrder = (p?: DispatchPriority): number => DISPATCH_PRIORITY_ORDER[p ?? 'today'] ?? 1;
    // 라벨: 긴급=강조 prefix, 오늘=default (표시 X), 이번주/이번달=메타에 작게
    const priPrefix = (p?: DispatchPriority): string => p === 'urgent' ? `[긴급] ` : '';
    const priBadge = (p?: DispatchPriority): string | undefined => {
      if (!p || p === 'urgent' || p === 'today') return undefined;
      return DISPATCH_PRIORITY_LABEL[p];
    };

    const incoming: TaskItem[] = incomingOrders
      .filter((o) => o.status === 'pending' || o.status === 'acknowledged')
      .sort((a, b) => priOrder(a.priority) - priOrder(b.priority))
      .slice(0, 8)
      .map((o) => {
        const badge = priBadge(o.priority);
        return {
          key: `in-${o.id}`,
          title: `${priPrefix(o.priority)}${o.title}`,
          sub: `${DISPATCH_LABEL[o.kind]}${badge ? ` · ${badge}` : ''}${o.body ? ` · ${o.body.slice(0, 40)}` : ''}`,
          meta: o.status === 'pending' ? '미확인' : '확인',
          href: '/m/orders/received',
          ackId: o.status === 'pending' ? o.id : undefined,
          priority: o.priority,
        };
      });

    const outgoing: TaskItem[] = outgoingOrders
      .filter((o) => o.status !== 'done' && o.status !== 'cancelled')
      .sort((a, b) => priOrder(a.priority) - priOrder(b.priority))
      .slice(0, 8)
      .map((o) => {
        const badge = priBadge(o.priority);
        return {
          key: `out-${o.id}`,
          title: `${priPrefix(o.priority)}${o.title}`,
          sub: `${o.assignedToName ?? '전체'} · ${DISPATCH_LABEL[o.kind]}${badge ? ` · ${badge}` : ''}`,
          meta: o.status === 'pending' ? '대기' : o.status === 'acknowledged' ? '확인' : '진행중',
          href: '/dispatch',
          priority: o.priority,
        };
      });

    return { overdue, todays, upcoming, incoming, outgoing };
  }, [contracts, penalties, incomingOrders, outgoingOrders, today, onOpenContract]);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: 12,
    }}>
      <TaskCard tone="red" icon={<Warning weight="duotone" />} title="밀린 업무" items={groups.overdue} emptyText="밀린 업무 없음" />
      <TaskCard tone="brand" icon={<Clock weight="duotone" />} title="오늘 업무" items={groups.todays} emptyText="오늘 일정 없음" />
      <TaskCard tone="purple" icon={<CalendarIcon weight="duotone" />} title="예정 업무 (7일)" items={groups.upcoming} emptyText="다가오는 일정 없음" />
      <TaskCard tone="amber" icon={<Megaphone weight="duotone" />} title="받은 업무" items={groups.incoming} emptyText="받은 요청 없음" href="/m/orders/received" onAck={onAckIncoming} />
      <TaskCard tone="gray" icon={<PaperPlaneTilt weight="duotone" />} title="요청 업무" items={groups.outgoing} emptyText="요청한 업무 없음" href="/dispatch" headerAction={onCreateOutgoing ? (
        <button
          type="button"
          onClick={onCreateOutgoing}
          style={{
            padding: '2px 8px', fontSize: 11, fontWeight: 700,
            background: 'var(--bg-card)', color: 'var(--text-main)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
          }}
          title="새 업무 요청 — 회원에게 발송"
        >
          + 새 요청
        </button>
      ) : undefined} />
    </div>
  );
}

function TaskCard({
  tone, icon, title, items, emptyText, href, headerAction, onAck,
}: {
  tone: TaskTone;
  icon: React.ReactNode;
  title: string;
  items: TaskItem[];
  emptyText: string;
  href?: string;
  headerAction?: React.ReactNode;
  onAck?: (orderId: string) => void;
}) {
  const toneVars = TASK_TONES[tone];
  return (
    <section style={{
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg-card)',
      border: `1px solid ${toneVars.border}`,
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      minHeight: 200,
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 12px',
        background: toneVars.headerBg, color: toneVars.headerText,
        fontSize: 12, fontWeight: 700,
      }}>
        {icon}
        <span>{title}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11 }}>{items.length}</span>
        {headerAction}
      </header>
      {items.length === 0 ? (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-weak)', fontSize: 11, padding: 16,
          gap: 6, flexDirection: 'column',
        }}>
          <CheckCircle size={18} weight="duotone" style={{ opacity: 0.5 }} />
          {emptyText}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', padding: 6, gap: 4, maxHeight: 320, overflow: 'auto' }}>
          {items.map((it) => (
            <TaskRow key={it.key} item={it} tone={tone} onAck={onAck} />
          ))}
        </div>
      )}
      {href && items.length > 0 && (
        <Link href={href} style={{
          padding: '6px 12px', borderTop: '1px solid var(--border-soft)',
          fontSize: 11, color: 'var(--text-sub)', textDecoration: 'none',
          textAlign: 'center',
        }}>
          전체 보기 →
        </Link>
      )}
    </section>
  );
}

function TaskRow({ item, tone, onAck }: { item: TaskItem; tone: TaskTone; onAck?: (orderId: string) => void }) {
  const toneVars = TASK_TONES[tone];
  const dimmed = item.priority === 'thisMonth';
  const inner = (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      padding: '8px 10px',
      background: 'var(--bg-page)',
      border: '1px solid var(--border-soft)',
      borderRadius: 'var(--radius)',
      cursor: 'pointer',
      opacity: dimmed ? 0.55 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.title}
        </span>
        {item.meta && (
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: toneVars.headerText,
            padding: '1px 6px', borderRadius: 'var(--radius-sm)',
            background: toneVars.headerBg,
          }}>{item.meta}</span>
        )}
        {item.ackId && onAck && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAck(item.ackId!); }}
            style={{
              padding: '1px 8px', fontSize: 10, fontWeight: 700,
              background: 'var(--brand)', color: 'white', border: 'none',
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            }}
            title="확인 처리"
          >
            확인
          </button>
        )}
      </div>
      {item.sub && (
        <span className="dim" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.sub}
        </span>
      )}
    </div>
  );
  if (item.href) return <Link href={item.href} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link>;
  if (item.onClick) return <div onClick={item.onClick} role="button">{inner}</div>;
  return inner;
}

const TASK_TONES: Record<TaskTone, { headerBg: string; headerText: string; border: string }> = {
  red:    { headerBg: 'var(--red-bg)',    headerText: 'var(--red-text)',    border: 'rgba(220,38,38,0.25)' },
  brand:  { headerBg: 'var(--brand-bg)',  headerText: 'var(--brand)',       border: 'rgba(37,99,235,0.25)' },
  purple: { headerBg: '#f3e8ff',          headerText: '#6b21a8',            border: 'rgba(107,33,168,0.25)' },
  amber:  { headerBg: 'var(--amber-bg)',  headerText: 'var(--amber-text)',  border: 'rgba(161,98,7,0.25)' },
  gray:   { headerBg: 'var(--bg-sunken)', headerText: 'var(--text-sub)',    border: 'var(--border)' },
};
