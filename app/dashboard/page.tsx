'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChartBar, Warning,
  Clock, Calendar as CalendarIcon, Megaphone, PaperPlaneTilt, CheckCircle,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/use-auth';
import { useMyOrgContext } from '@/lib/organization';
import { useMyDispatchOrders, useSentDispatchOrders, DISPATCH_LABEL, DISPATCH_PRIORITY_LABEL, DISPATCH_PRIORITY_ORDER, updateDispatchStatus, type DispatchOrder, type DispatchPriority } from '@/lib/firebase/dispatch-store';
import { useNotices, createNotice, addComment as addNoticeComment } from '@/lib/firebase/notice-store';
import dynamic from 'next/dynamic';
const NewOrderDialog = dynamic(
  () => import('@/components/dispatch/dispatch-view').then((m) => m.NewOrderDialog),
  { ssr: false },
);
const DispatchDetailDialog = dynamic(
  () => import('@/components/dispatch/dispatch-detail-dialog').then((m) => m.DispatchDetailDialog),
  { ssr: false },
);
const DispatchListDialog = dynamic(
  () => import('@/components/dispatch/dispatch-list-dialog').then((m) => m.DispatchListDialog),
  { ssr: false },
);
import type { DispatchListKind } from '@/components/dispatch/dispatch-list-dialog';
import { toast } from '@/lib/toast';
import { Sidebar } from '@/components/layout/sidebar';
import { AppTopbar } from '@/components/layout/app-topbar';
import { useVehicleDialog } from '@/lib/global-dialogs';
import { useCallback } from 'react';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useBankTx, useCardTx } from '@/lib/firebase/transactions-store';
import { usePenalties } from '@/lib/firebase/penalty-store';
import { useSchedules } from '@/lib/firebase/schedules-store';
import { DetailDialogShell } from '@/components/ui/detail-dialog-shell';
import { formatCurrency, dateWithDow } from '@/lib/utils';
import { todayKr } from '@/lib/mock-data';
import { useLiveTodayKr } from '@/lib/use-live-today';
import { dDayLabel } from '@/lib/alerts';

export default function DashboardPage() {
  const { contracts } = useContracts();
  const { openVehicle } = useVehicleDialog();
  // 계약 id 받아 → 그 계약의 차량번호로 자산 dialog (운영 현황 탭) 열기
  const handleOpenContract = useCallback((id: string) => {
    const c = contracts.find((x) => x.id === id);
    if (c) openVehicle(c.vehiclePlate ?? '', 'operation');
  }, [contracts, openVehicle]);
  const { vehicles } = useVehicles();
  const { rows: bankTx } = useBankTx();
  const { rows: cardTx } = useCardTx();
  const { penalties } = usePenalties();
  const { user } = useAuth();
  const org = useMyOrgContext();
  const incomingOrders = useMyDispatchOrders(org.uid, org.team, org.division);
  const outgoingOrders = useSentDispatchOrders(user?.email);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [listKind, setListKind] = useState<DispatchListKind | null>(null);
  const [noticeComposing, setNoticeComposing] = useState(false);
  const detailOrder = useMemo(() => {
    if (!detailOrderId) return null;
    return incomingOrders.find((o) => o.id === detailOrderId) ?? outgoingOrders.find((o) => o.id === detailOrderId) ?? null;
  }, [detailOrderId, incomingOrders, outgoingOrders]);
  async function handleAckIncoming(orderId: string) {
    try {
      await updateDispatchStatus(orderId, { status: 'acknowledged', acknowledgedAt: new Date().toISOString() });
      toast.success('확인 처리됨');
    } catch (e) {
      toast.error(`확인 실패: ${(e as Error).message}`);
    }
  }
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
    // 확정대기 — 계약 체결됐으나 인도 전. 보증금 입금 추적 + 출고 일정 관리 대상.
    const pendingDelivery = contracts.filter((c) => {
      if (c.deliveredDate) return false;
      if (c.status === '반납' || c.status === '해지' || c.status === '채권') return false;
      return c.status === '대기' ||
        c.vehicleStatus === '인도대기' ||
        c.vehicleStatus === '출고대기' ||
        c.vehicleStatus === '상품대기' ||
        c.vehicleStatus === '재고';
    });
    const pendingDeliveryCount = pendingDelivery.length;
    const pendingDepositSum = pendingDelivery.reduce((s, c) => s + Math.max(0, (c.deposit ?? 0) - (c.depositReceived ?? 0)), 0);

    return {
      totalUnpaid, unpaidCount, activeContracts, totalVehicles, utilization,
      operatingFleet, runningVehicles, idleRate, unpaidRate,
      overdueReturns, monthlyTarget, idle, penaltyOpen,
      collectedThisMonth, collectedLastMonth, collectionProgress, momGrowth, collectedTotal,
      expiringNextMonth, newThisMonth,
      pendingDeliveryCount, pendingDepositSum,
    };
  }, [contracts, vehicles, bankTx, cardTx, penalties, today]);

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <AppTopbar
          menuKey="dashboard"
          icon={<ChartBar size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
          right={<span className="topbar-date">{dateWithDow(today)}</span>}
        />

        <div style={{
          padding: 12, background: 'var(--bg-page)',
          display: 'flex', flexDirection: 'column', gap: 10,
          flex: 1, minHeight: 0, overflow: 'hidden',
        }}>
          {/* 업무 카드 — 본인 스케줄(좌, 1fr) + 디스패치(우, 280px) — 아래 row 와 column align */}
          <Section title="업무 카드" right={<span className="dim" style={{ fontSize: 11 }}>본인 기준 · 항목 클릭 → 상세</span>}>
            <TaskCardsGrid
              contracts={contracts}
              penalties={penalties}
              incomingOrders={incomingOrders}
              outgoingOrders={outgoingOrders}
              today={today}
              onOpenContract={handleOpenContract}
              onCreateOutgoing={() => setNewOrderOpen(true)}
              onAckIncoming={handleAckIncoming}
              onOpenOrder={setDetailOrderId}
              onOpenList={setListKind}
            />
          </Section>

          {/* 위 5분할 grid 와 column align — 캘린더 span 3 + 공지사항 span 1 + 데이터 요약 span 1 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12, alignItems: 'stretch', flex: '1 1 0', minHeight: 0 }}>
            <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', gridColumn: 'span 3' }}>
              <Section fill title="일자별 스케줄" right={<span className="dim" style={{ fontSize: 11 }}>{today.slice(0, 7)} · 더블클릭 → 상세</span>}>
                <ScheduleCalendar contracts={contracts} today={today} onSelectContract={handleOpenContract} />
              </Section>
            </div>
            <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', gridColumn: 'span 1' }}>
              <Section fill title="공지사항" right={
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setNoticeComposing((v) => !v)}
                  title={noticeComposing ? '작성 취소' : '새 공지'}
                  style={{ padding: '0 6px', height: 22, fontSize: 12, lineHeight: 1 }}
                >
                  {noticeComposing ? '×' : '+'}
                </button>
              }>
                <NoticeMiniPanel composing={noticeComposing} onClose={() => setNoticeComposing(false)} />
              </Section>
            </div>
            <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', gridColumn: 'span 1' }}>
              <Section fill title="전체 데이터 요약" right={<span className="dim" style={{ fontSize: 11 }}>카드 클릭 → 상세</span>}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto', minHeight: 0, flex: 1 }}>
                  <CompactKpi
                    label="가동률"
                    value={`${kpi.utilization}%`}
                    tone="green"
                    href="/asset"
                    details={[
                      { k: '총차량', v: `${kpi.operatingFleet}대` },
                      { k: '운행', v: `${kpi.runningVehicles}대` },
                      { k: '휴차', v: `${kpi.idle}대` },
                    ]}
                  />
                  <CompactKpi
                    label="미수율"
                    value={`${kpi.unpaidRate}%`}
                    tone="red"
                    href="/contract/overdue"
                    details={[
                      { k: '월매출', v: formatCurrency(kpi.monthlyTarget) },
                      { k: '미수금', v: formatCurrency(kpi.totalUnpaid) },
                      { k: '미수건', v: `${kpi.unpaidCount}건` },
                    ]}
                  />
                  <CompactKpi
                    label="이번달 수금률"
                    value={`${kpi.collectionProgress}%`}
                    tone={kpi.collectionProgress >= 90 ? 'green' : kpi.collectionProgress >= 70 ? 'brand' : 'orange'}
                    href="/payments"
                    details={[
                      { k: '수금', v: formatCurrency(kpi.collectedThisMonth) },
                      { k: '목표', v: formatCurrency(kpi.monthlyTarget) },
                    ]}
                  />
                  <CompactKpi
                    label="반납 지연"
                    value={`${kpi.overdueReturns}건`}
                    tone={kpi.overdueReturns === 0 ? 'green' : 'red'}
                    href="/contract/expire"
                    details={[{ k: '운행 중', v: '만기 경과' }]}
                  />
                  <CompactKpi
                    label="이번달 신규 계약"
                    value={`${kpi.newThisMonth}건`}
                    tone="brand"
                    href="/contract"
                    details={[{ k: '다음달 만기', v: `${kpi.expiringNextMonth}건` }]}
                  />
                  <CompactKpi
                    label="확정대기 (인도 전)"
                    value={`${kpi.pendingDeliveryCount}건`}
                    tone={kpi.pendingDeliveryCount === 0 ? 'zinc' : kpi.pendingDepositSum > 0 ? 'orange' : 'brand'}
                    href="/?view=확정대기"
                    details={[
                      { k: '보증금 미수령', v: formatCurrency(kpi.pendingDepositSum) },
                    ]}
                  />
                  <CompactKpi
                    label="과태료 미처리"
                    value={`${kpi.penaltyOpen}건`}
                    tone={kpi.penaltyOpen === 0 ? 'green' : 'orange'}
                    href="/penalty"
                    details={[{ k: '고지서', v: '매칭·통지 대기' }]}
                  />
                </div>
              </Section>
            </div>
          </div>
        </div>

        {/* ContractDetailDialog 제거 — 통일된 자산 dialog (GlobalDialogsProvider) 사용 */}
        {newOrderOpen && (
          <NewOrderDialog onClose={() => setNewOrderOpen(false)} creatorEmail={user?.email ?? undefined} />
        )}
        {detailOrder && (
          <DispatchDetailDialog order={detailOrder} onClose={() => setDetailOrderId(null)} />
        )}
        {listKind && (
          <DispatchListDialog
            kind={listKind}
            orders={listKind === 'incoming' ? incomingOrders : outgoingOrders}
            onClose={() => setListKind(null)}
          />
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
  contracts, penalties, incomingOrders, outgoingOrders, today, onOpenContract, onCreateOutgoing, onAckIncoming, onOpenOrder, onOpenList, sideColumnWidth,
}: {
  contracts: ReturnType<typeof useContracts>['contracts'];
  penalties: ReturnType<typeof usePenalties>['penalties'];
  incomingOrders: DispatchOrder[];
  outgoingOrders: DispatchOrder[];
  today: string;
  onOpenContract: (id: string) => void;
  onCreateOutgoing?: () => void;
  onAckIncoming?: (orderId: string) => void;
  /** dispatch order 항목 클릭 → 상세 dialog */
  onOpenOrder?: (orderId: string) => void;
  /** 받은/요청 카드 헤더 클릭 → 목록 dialog */
  onOpenList?: (kind: DispatchListKind) => void;
  /** 우측 디스패치 영역 폭 — 아래 row 와 column align 위해 px 지정. 미지정 시 균등 grid */
  sideColumnWidth?: number;
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
      .filter((o) => o.status === 'pending' || o.status === 'acknowledged' || o.status === 'in_progress')
      .sort((a, b) => priOrder(a.priority) - priOrder(b.priority))
      .slice(0, 8)
      .map((o) => {
        const badge = priBadge(o.priority);
        return {
          key: `in-${o.id}`,
          title: `${priPrefix(o.priority)}${o.title}`,
          sub: `${DISPATCH_LABEL[o.kind]}${badge ? ` · ${badge}` : ''}${o.body ? ` · ${o.body.slice(0, 40)}` : ''}`,
          meta: o.status === 'pending' ? '미확인' : o.status === 'acknowledged' ? '확인' : '진행중',
          onClick: onOpenOrder ? () => onOpenOrder(o.id) : undefined,
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
          onClick: onOpenOrder ? () => onOpenOrder(o.id) : undefined,
          priority: o.priority,
        };
      });

    return { overdue, todays, upcoming, incoming, outgoing };
  }, [contracts, penalties, incomingOrders, outgoingOrders, today, onOpenContract]);

  const requestBtn = onCreateOutgoing ? (
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
  ) : undefined;

  // sideColumnWidth 지정 시 — 좌(본인 스케줄 3 cards) + 우(디스패치 2 cards) 분리. 아래 row 와 column align
  if (sideColumnWidth) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `minmax(0, 1fr) ${sideColumnWidth}px`, gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          <TaskCard tone="red" icon={<Warning weight="duotone" />} title="밀린 업무" items={groups.overdue} emptyText="밀린 업무 없음" />
          <TaskCard tone="brand" icon={<Clock weight="duotone" />} title="오늘 업무" items={groups.todays} emptyText="오늘 일정 없음" />
          <TaskCard tone="purple" icon={<CalendarIcon weight="duotone" />} title="예정 업무 (7일)" items={groups.upcoming} emptyText="다가오는 일정 없음" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <TaskCard tone="amber" icon={<Megaphone weight="duotone" />} title="받은 업무" items={groups.incoming} emptyText="받은 요청 없음" onAck={onAckIncoming} onTitleClick={onOpenList ? () => onOpenList('incoming') : undefined} />
          <TaskCard tone="gray" icon={<PaperPlaneTilt weight="duotone" />} title="요청 업무" items={groups.outgoing} emptyText="요청한 업무 없음" headerAction={requestBtn} onTitleClick={onOpenList ? () => onOpenList('outgoing') : undefined} />
        </div>
      </div>
    );
  }

  // 미지정 — 5 cards 평면 grid
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
      <TaskCard tone="gray" icon={<PaperPlaneTilt weight="duotone" />} title="요청 업무" items={groups.outgoing} emptyText="요청한 업무 없음" href="/dispatch" headerAction={requestBtn} />
    </div>
  );
}

function TaskCard({
  tone, icon, title, items, emptyText, href, headerAction, onAck, onTitleClick,
}: {
  tone: TaskTone;
  icon: React.ReactNode;
  title: string;
  items: TaskItem[];
  emptyText: string;
  href?: string;
  headerAction?: React.ReactNode;
  onAck?: (orderId: string) => void;
  /** 헤더 제목 클릭 → 목록 dialog 등 */
  onTitleClick?: () => void;
}) {
  const toneVars = TASK_TONES[tone];
  return (
    <section style={{
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg-card)',
      border: `1px solid ${toneVars.border}`,
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      minHeight: 0, flex: '1 1 0',
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 12px',
        background: toneVars.headerBg, color: toneVars.headerText,
        fontSize: 12, fontWeight: 700,
      }}>
        {icon}
        {onTitleClick ? (
          <button
            type="button"
            onClick={onTitleClick}
            style={{
              background: 'none', border: 'none', padding: 0,
              cursor: 'pointer', color: 'inherit',
              fontWeight: 700, fontSize: 12,
              textDecoration: 'underline', textDecorationColor: 'currentColor',
              textUnderlineOffset: 2,
            }}
            title="전체 내역 보기"
          >
            {title}
          </button>
        ) : (
          <span>{title}</span>
        )}
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
      {onTitleClick && (
        <button
          type="button"
          onClick={onTitleClick}
          style={{
            padding: '6px 12px', borderTop: '1px solid var(--border-soft)',
            fontSize: 11, color: 'var(--text-sub)',
            background: 'var(--bg-card)', border: 'none',
            textAlign: 'center', cursor: 'pointer',
          }}
        >
          전체 내역 보기 →
        </button>
      )}
      {!onTitleClick && href && items.length > 0 && (
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

/* ─── CompactKpi — 한 줄 작은 박스 (확인·인지용) ─── */
function CompactKpi({
  label, value, tone, href, details,
}: {
  label: string;
  value: string;
  tone: 'brand' | 'red' | 'orange' | 'green' | 'zinc';
  href?: string;
  details?: Array<{ k: string; v: string }>;
}) {
  const colorMap = {
    brand: 'var(--brand)', red: 'var(--red-text)', orange: 'var(--orange-text)',
    green: 'var(--green-text)', zinc: 'var(--text-sub)',
  } as const;
  const body = (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-sub)', fontWeight: 600 }}>{label}</span>
        <span style={{
          marginLeft: 'auto',
          fontSize: 14, fontWeight: 700,
          color: colorMap[tone],
          fontVariantNumeric: 'tabular-nums',
        }}>{value}</span>
      </div>
      {details && details.length > 0 && (
        <div style={{
          fontSize: 10, color: 'var(--text-weak)',
          display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2,
        }}>
          {details.map((d) => (
            <span key={d.k} style={{ whiteSpace: 'nowrap' }}>
              {d.k} <strong className="mono" style={{ color: 'var(--text-main)' }}>{d.v}</strong>
            </span>
          ))}
        </div>
      )}
    </>
  );
  const style: React.CSSProperties = {
    padding: '8px 12px',
    display: 'flex', flexDirection: 'column',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-soft)',
    borderLeft: `3px solid ${colorMap[tone]}`,
    borderRadius: 'var(--radius-sm)',
    textDecoration: 'none', color: 'inherit',
    cursor: href ? 'pointer' : 'default',
  };
  if (href) return <Link href={href} style={style}>{body}</Link>;
  return <div style={style}>{body}</div>;
}

/* ─── 공지사항 미니 패널 — 대시보드 캘린더 옆 ─── */
function NoticeMiniPanel({ composing, onClose }: { composing: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { notices, loading } = useNotices();
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  async function handleCreate() {
    if (!draftTitle.trim() || !draftBody.trim()) { toast.warning('제목·내용 입력'); return; }
    if (!user?.email) { toast.error('로그인 정보 없음'); return; }
    try {
      await createNotice({
        title: draftTitle.trim(),
        body: draftBody.trim(),
        createdBy: user.email,
        createdByName: user.displayName ?? undefined,
      });
      setDraftTitle(''); setDraftBody('');
      onClose();
      toast.success('공지 등록');
    } catch (e) {
      toast.error(`등록 실패: ${(e as Error).message}`);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0 }}>
      {composing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input
            className="input"
            placeholder="제목"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            style={{ fontSize: 12 }}
          />
          <textarea
            className="input"
            placeholder="내용"
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            style={{ fontSize: 12, minHeight: 60, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-primary btn-sm" type="button" onClick={() => void handleCreate()}>등록</button>
            <button className="btn btn-sm" type="button" onClick={() => { setDraftTitle(''); setDraftBody(''); onClose(); }}>취소</button>
          </div>
        </div>
      )}

      {/* 목록 */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {loading ? (
          <div className="muted center" style={{ fontSize: 11, padding: 16 }}>불러오는 중…</div>
        ) : notices.length === 0 ? (
          <div className="muted center" style={{ fontSize: 11, padding: 16 }}>공지 없음</div>
        ) : notices.slice(0, 10).map((n) => {
          const cn = n.comments ? Object.keys(n.comments).length : 0;
          const isOpen = openId === n.id;
          return (
            <div key={n.id} style={{
              padding: '6px 8px',
              background: isOpen ? 'var(--brand-bg)' : 'var(--bg-card)',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-sm)',
            }}>
              <button
                type="button"
                onClick={() => { setOpenId(isOpen ? null : n.id); setReply(''); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  textAlign: 'left', width: '100%', padding: 0,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.title}
                  </span>
                  {cn > 0 && <span className="dim" style={{ fontSize: 10 }}>답글 {cn}</span>}
                </div>
                <div className="dim" style={{ fontSize: 10, marginTop: 2 }}>
                  {n.createdByName ?? n.createdBy}
                </div>
              </button>
              {isOpen && (
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--border)' }}>
                  <div style={{ fontSize: 11, whiteSpace: 'pre-wrap', lineHeight: 1.5, marginBottom: 6 }}>
                    {n.body}
                  </div>
                  {n.comments && Object.values(n.comments).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')).map((c) => (
                    <div key={c.id} style={{
                      padding: '4px 6px', background: 'var(--bg-sunken)',
                      borderRadius: 'var(--radius-sm)', marginBottom: 3, fontSize: 11,
                    }}>
                      <strong style={{ fontSize: 10 }}>{c.createdByName ?? c.createdBy}: </strong>
                      <span style={{ whiteSpace: 'pre-wrap' }}>{c.body}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
                    <input
                      className="input"
                      placeholder="댓글"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && reply.trim() && user?.email) {
                          e.preventDefault();
                          void (async () => {
                            try {
                              await addNoticeComment(n.id, {
                                body: reply.trim(),
                                createdBy: user.email ?? '',
                                createdByName: user.displayName ?? undefined,
                              });
                              setReply('');
                            } catch (err) { toast.error((err as Error).message); }
                          })();
                        }
                      }}
                      style={{ flex: 1, fontSize: 11 }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
