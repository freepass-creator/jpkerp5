'use client';

/**
 * 모바일 밀린 업무 — 오늘 이전 지연된 인도/반납/지시.
 *
 *  · 인도 지연: !deliveredDate && deliveryScheduled < today (휴차/매각 등 비활성 제외)
 *  · 반납 지연: !returnedDate && returnScheduled < today
 *  · 지시 지연: dueDate < today && status != 'done' / 'cancelled' (본인 지시)
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useAuth } from '@/lib/use-auth';
import { useMyDispatchOrders, DISPATCH_LABEL, type DispatchOrder } from '@/lib/firebase/dispatch-store';
import { Clock, Megaphone, Truck, ArrowUUpLeft, CaretRight, CheckCircle } from '@phosphor-icons/react';
import { todayKr } from '@/lib/mock-data';

export default function MobileBacklog() {
  const { contracts } = useContracts();
  const { user } = useAuth();
  const orders = useMyDispatchOrders(user?.uid);
  const today = todayKr();

  const data = useMemo(() => {
    const inactive = (s?: string) => s === '휴차' || s === '휴차대기' || s === '매각검토'
      || s === '매각' || s === '매각대기' || s === '상품화대기' || s === '상품화중'
      || s === '상품대기' || s === '구매대기' || s === '등록대기';

    const deliveryList = contracts.filter((c) => {
      if (c.deliveredDate) return false;
      const sched = c.deliveryScheduledDate ?? c.contractDate;
      if (!sched) return false;
      return sched < today && !inactive(c.vehicleStatus) && c.status !== '반납' && c.status !== '해지';
    });
    const returnList = contracts.filter((c) =>
      !c.returnedDate && c.returnScheduledDate && c.returnScheduledDate < today
    );
    const orderList = orders.filter((o) =>
      o.dueDate && o.dueDate < today && o.status !== 'done' && o.status !== 'cancelled'
    );
    return { deliveryList, returnList, orderList };
  }, [contracts, orders, today]);

  const total = data.deliveryList.length + data.returnList.length + data.orderList.length;

  return (
    <div>
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--bg-card)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '12px 16px',
        borderTop: '3px solid var(--red-text)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={20} weight="regular" />
          밀린 업무
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
          밀린 업무 없음 — 깔끔
        </div>
      )}

      {data.orderList.length > 0 && (
        <Section icon={<Megaphone size={16} weight="duotone" />} title={`지시 지연 (${data.orderList.length})`}>
          {data.orderList.map((o) => <OrderRow key={o.id} order={o} contracts={contracts} />)}
        </Section>
      )}

      {data.deliveryList.length > 0 && (
        <Section icon={<Truck size={16} weight="duotone" />} title={`인도 지연 (${data.deliveryList.length})`}>
          {data.deliveryList.map((c) => (
            <ContractRow key={c.id} contract={c} action="인도" date={c.deliveryScheduledDate ?? c.contractDate ?? ''}
              hrefBase={`/m/entry/deliver?contractId=${c.id}`} />
          ))}
        </Section>
      )}

      {data.returnList.length > 0 && (
        <Section icon={<ArrowUUpLeft size={16} weight="duotone" />} title={`반납 지연 (${data.returnList.length})`}>
          {data.returnList.map((c) => (
            <ContractRow key={c.id} contract={c} action="반납" date={c.returnScheduledDate ?? ''}
              hrefBase={`/m/entry/return?contractId=${c.id}`} />
          ))}
        </Section>
      )}
      </div>
    </div>
  );
}

function Section({ icon, title, children }: {
  icon: React.ReactNode; title: string; children: React.ReactNode;
}) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <header style={{
        padding: '8px 12px',
        background: 'var(--red-bg)', color: 'var(--red-text)',
        border: '1px solid var(--red-border, rgba(185,28,28,0.25))',
        borderRadius: 'var(--radius)',
        fontSize: 12, fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>{icon}{title}</header>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </section>
  );
}

function OrderRow({ order, contracts }: { order: DispatchOrder; contracts: ReturnType<typeof useContracts>['contracts'] }) {
  const linked = order.contractId ? contracts.find((c) => c.id === order.contractId) : undefined;
  return (
    <Link href="/m/orders" style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '12px 14px', background: 'var(--bg-card)',
      border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)',
      textDecoration: 'none', color: 'inherit',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="badge-base badge-amber" style={{ fontSize: 9 }}>{DISPATCH_LABEL[order.kind]}</span>
          <span className="badge-base badge-red" style={{ fontSize: 9 }}>지연 · {order.dueDate ?? '-'}</span>
        </div>
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

function ContractRow({ contract: c, action, date, hrefBase }: {
  contract: ReturnType<typeof useContracts>['contracts'][number];
  action: '인도' | '반납';
  date: string;
  hrefBase: string;
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
        <div style={{ fontSize: 10.5, color: 'var(--red-text)', fontFamily: 'var(--font-mono)' }}>
          예정 {date}
        </div>
      </div>
      <span style={{
        padding: '4px 10px',
        background: 'var(--red-bg)', color: 'var(--red-text)',
        borderRadius: 'var(--radius)', fontSize: 11, fontWeight: 700,
      }}>
        {action}하기 →
      </span>
    </Link>
  );
}
