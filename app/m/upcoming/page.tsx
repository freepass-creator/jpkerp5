'use client';

/**
 * 모바일 예정 업무 — 내일 이후 인도/반납/지시.
 *
 *  · 인도 예정: !deliveredDate && deliveryScheduled > today
 *  · 반납 예정: !returnedDate && returnScheduled > today
 *  · 지시 예정: dueDate > today && status != 'done' / 'cancelled' (본인 지시)
 *
 *  날짜 기준 그룹화 (오름차순).
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useAuth } from '@/lib/use-auth';
import { useMyDispatchOrders, DISPATCH_LABEL, type DispatchOrder } from '@/lib/firebase/dispatch-store';
import { CalendarBlank, CaretRight, CheckCircle } from '@phosphor-icons/react';
import { todayKr } from '@/lib/mock-data';

type Contract = ReturnType<typeof useContracts>['contracts'][number];

type DayBucket = {
  date: string;
  delivery: Contract[];
  return: Contract[];
  orders: DispatchOrder[];
};

export default function MobileUpcoming() {
  const { contracts } = useContracts();
  const { user } = useAuth();
  const orders = useMyDispatchOrders(user?.uid);
  const today = todayKr();

  const buckets = useMemo(() => {
    const inactive = (s?: string) => s === '휴차' || s === '휴차대기' || s === '매각검토'
      || s === '매각' || s === '매각대기' || s === '상품화대기' || s === '상품화중'
      || s === '상품대기' || s === '구매대기' || s === '등록대기';

    const map = new Map<string, DayBucket>();
    const ensure = (date: string) => {
      let b = map.get(date);
      if (!b) { b = { date, delivery: [], return: [], orders: [] }; map.set(date, b); }
      return b;
    };

    for (const c of contracts) {
      if (!c.deliveredDate) {
        const sched = c.deliveryScheduledDate ?? c.contractDate;
        if (sched && sched > today && !inactive(c.vehicleStatus) && c.status !== '반납' && c.status !== '해지') {
          ensure(sched).delivery.push(c);
        }
      }
      if (!c.returnedDate && c.returnScheduledDate && c.returnScheduledDate > today) {
        ensure(c.returnScheduledDate).return.push(c);
      }
    }
    for (const o of orders) {
      if (o.dueDate && o.dueDate > today && o.status !== 'done' && o.status !== 'cancelled') {
        ensure(o.dueDate).orders.push(o);
      }
    }

    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 14);
  }, [contracts, orders, today]);

  const total = buckets.reduce((sum, b) => sum + b.delivery.length + b.return.length + b.orders.length, 0);

  return (
    <div>
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--bg-card)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '12px 16px',
        borderTop: '3px solid var(--blue-text)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalendarBlank size={20} weight="regular" />
          예정 업무
        </h1>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-sub)' }}>{total}건</span>
      </header>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

      {total === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', fontSize: 13, color: 'var(--text-weak)',
          background: 'var(--bg-sunken)', borderRadius: 'var(--radius-lg)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        }}>
          <CheckCircle size={32} weight="duotone" />
          예정된 일 없음
        </div>
      )}

      {buckets.map((b) => (
        <DayBucketCard key={b.date} bucket={b} contracts={contracts} />
      ))}
      </div>
    </div>
  );
}

function DayBucketCard({ bucket, contracts }: { bucket: DayBucket; contracts: Contract[] }) {
  const total = bucket.delivery.length + bucket.return.length + bucket.orders.length;
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <header style={{
        padding: '8px 12px',
        background: 'var(--blue-bg)', color: 'var(--blue-text)',
        border: '1px solid var(--blue-border, rgba(37,99,235,0.25))',
        borderRadius: 'var(--radius)',
        fontSize: 12, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontFamily: 'var(--font-mono)' }}>{formatDateLabel(bucket.date)}</span>
        <span>{total}건</span>
      </header>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bucket.orders.map((o) => <OrderRow key={o.id} order={o} contracts={contracts} />)}
        {bucket.delivery.map((c) => (
          <ContractRow key={`d-${c.id}`} contract={c} action="인도" hrefBase={`/m/entry/deliver?contractId=${c.id}`} />
        ))}
        {bucket.return.map((c) => (
          <ContractRow key={`r-${c.id}`} contract={c} action="반납" hrefBase={`/m/entry/return?contractId=${c.id}`} />
        ))}
      </div>
    </section>
  );
}

function formatDateLabel(date: string): string {
  if (!date) return '-';
  const d = new Date(date);
  const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${dow})`;
}

function OrderRow({ order, contracts }: { order: DispatchOrder; contracts: Contract[] }) {
  const linked = order.contractId ? contracts.find((c) => c.id === order.contractId) : undefined;
  return (
    <Link href="/m/orders/received" style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '12px 14px', background: 'var(--bg-card)',
      border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)',
      textDecoration: 'none', color: 'inherit',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="badge-base badge-amber" style={{ fontSize: 9 }}>{DISPATCH_LABEL[order.kind]}</span>
        <CaretRight size={12} weight="bold" style={{ color: 'var(--text-weak)' }} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{order.title}</div>
      {linked && (
        <div style={{ fontSize: 10.5, color: 'var(--text-weak)' }}>
          연결 — <span style={{ fontFamily: 'var(--font-mono)' }}>{linked.vehiclePlate}</span> {linked.customerName}
        </div>
      )}
    </Link>
  );
}

function ContractRow({ contract: c, action, hrefBase }: {
  contract: Contract; action: '인도' | '반납'; hrefBase: string;
}) {
  return (
    <Link href={hrefBase} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 14px', background: 'var(--bg-card)',
      border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)',
      textDecoration: 'none', color: 'inherit',
    }}>
      <div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{c.vehiclePlate ?? '?'}</span>
          <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>{c.customerName ?? '?'}</span>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-weak)' }}>
          {c.vehicleModel ?? ''} · {c.customerPhone1 ?? ''}
        </div>
      </div>
      <span style={{
        padding: '4px 10px',
        background: action === '인도' ? 'var(--green-bg)' : 'var(--orange-bg)',
        color: action === '인도' ? 'var(--green-text)' : 'var(--orange-text)',
        borderRadius: 'var(--radius)', fontSize: 11, fontWeight: 700,
      }}>
        {action} →
      </span>
    </Link>
  );
}
