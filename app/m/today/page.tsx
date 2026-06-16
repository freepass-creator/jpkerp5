'use client';

/**
 * 모바일 오늘 할 일 — 시간 기준 통합 뷰.
 *
 * 섹션:
 *  · 요청받은 업무 (dispatch_orders dueDate=오늘 + 본인 지정 또는 broadcast)
 *  · 인도 예정 (contracts deliveryScheduledDate=오늘 + !deliveredDate)
 *  · 반납 예정 (contracts returnScheduledDate=오늘 + !returnedDate)
 *
 * 빈 섹션은 표시 X. 카테고리별 묶음 + 색 구분.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useMyDispatchOrders, DISPATCH_LABEL, type DispatchOrder } from '@/lib/firebase/dispatch-store';
import { useMyOrgContext } from '@/lib/organization';
import { Calendar, Megaphone, Truck, ArrowUUpLeft, CaretRight, CheckCircle } from '@phosphor-icons/react';
import { todayKr } from '@/lib/mock-data';

export default function MobileToday() {
  return <SchedulePage targetDate={todayKr()} title="오늘 할 일" />;
}

/** 내부 컴포넌트 — page.tsx 에서 named export 금지 (Next.js 15 규칙) */
function SchedulePage({ targetDate, title }: { targetDate: string; title: string }) {
  const { contracts } = useContracts();
  const org = useMyOrgContext();
  const orders = useMyDispatchOrders(org.uid, org.team, org.division);

  const data = useMemo(() => {
    const deliveryList = contracts.filter((c) =>
      !c.deliveredDate && (c.deliveryScheduledDate ?? c.contractDate) === targetDate
    );
    const returnList = contracts.filter((c) =>
      !c.returnedDate && c.returnScheduledDate === targetDate
    );
    const orderList = orders.filter((o) =>
      o.dueDate === targetDate && (o.status === 'pending' || o.status === 'acknowledged')
    );
    return { deliveryList, returnList, orderList };
  }, [contracts, orders, targetDate]);

  const total = data.deliveryList.length + data.returnList.length + data.orderList.length;
  const dateLabel = formatDateLabel(targetDate);

  return (
    <div>
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--bg-card)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '12px 16px',
        borderTop: '3px solid var(--brand)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={20} weight="regular" />
          {title}
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-sub)', fontFamily: 'var(--font-mono)' }}>{dateLabel}</span>
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
          예정된 일 없음 — 한가한 날
        </div>
      )}

      {/* 요청받은 업무 */}
      {data.orderList.length > 0 && (
        <Section
          tone="amber"
          icon={<Megaphone size={16} weight="duotone" />}
          title={`요청받은 업무 (${data.orderList.length})`}
        >
          {data.orderList.map((o) => <OrderRow key={o.id} order={o} contracts={contracts} />)}
        </Section>
      )}

      {/* 인도 예정 */}
      {data.deliveryList.length > 0 && (
        <Section
          tone="green"
          icon={<Truck size={16} weight="duotone" />}
          title={`인도 예정 (${data.deliveryList.length})`}
        >
          {data.deliveryList.map((c) => (
            <ContractRow key={c.id} contract={c} action="인도" hrefBase={`/m/entry/deliver?contractId=${c.id}`} />
          ))}
        </Section>
      )}

      {/* 반납 예정 */}
      {data.returnList.length > 0 && (
        <Section
          tone="orange"
          icon={<ArrowUUpLeft size={16} weight="duotone" />}
          title={`반납 예정 (${data.returnList.length})`}
        >
          {data.returnList.map((c) => (
            <ContractRow key={c.id} contract={c} action="반납" hrefBase={`/m/entry/return?contractId=${c.id}`} />
          ))}
        </Section>
      )}
      </div>
    </div>
  );
}

function formatDateLabel(date: string): string {
  if (!date) return '-';
  const d = new Date(date);
  const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${dow})`;
}

function Section({ tone, icon, title, children }: {
  tone: 'amber' | 'green' | 'orange';
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <header style={{
        padding: '8px 12px',
        background: `var(--${tone}-bg)`, color: `var(--${tone}-text)`,
        border: `1px solid var(--${tone}-border, ${tone === 'green' ? 'rgba(22,101,52,0.25)' : tone === 'orange' ? 'rgba(194,65,12,0.25)' : 'rgba(161,98,7,0.25)'})`,
        borderRadius: 'var(--radius)',
        fontSize: 12, fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>{icon}{title}</header>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </section>
  );
}

function OrderRow({ order, contracts }: { order: DispatchOrder; contracts: ReturnType<typeof useContracts>['contracts'] }) {
  const linkedContract = order.contractId ? contracts.find((c) => c.id === order.contractId) : undefined;
  return (
    <Link href="/m/orders/received" style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '12px 14px', background: 'var(--bg-card)',
      border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)',
      textDecoration: 'none', color: 'inherit',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="badge-base badge-amber" style={{ fontSize: 9 }}>{DISPATCH_LABEL[order.kind]}</span>
          {order.status === 'pending' && <span className="badge-base badge-orange" style={{ fontSize: 9 }}>미확인</span>}
          {order.status === 'acknowledged' && <span className="badge-base badge-blue" style={{ fontSize: 9 }}>확인됨</span>}
        </div>
        <CaretRight size={12} weight="bold" style={{ color: 'var(--text-weak)' }} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{order.title}</div>
      {order.body && (
        <div style={{ fontSize: 11, color: 'var(--text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {order.body}
        </div>
      )}
      {linkedContract && (
        <div style={{ fontSize: 10.5, color: 'var(--text-weak)' }}>
          연결 — <span style={{ fontFamily: 'var(--font-mono)' }}>{linkedContract.vehiclePlate}</span> {linkedContract.customerName}
        </div>
      )}
    </Link>
  );
}

function ContractRow({ contract: c, action, hrefBase }: {
  contract: ReturnType<typeof useContracts>['contracts'][number];
  action: '인도' | '반납';
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
        {action}하기 →
      </span>
    </Link>
  );
}
