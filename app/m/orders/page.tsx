'use client';

/**
 * 모바일 요청받은 업무 — 나에게 지정됐거나 전체 broadcast 된 dispatch_orders.
 *
 * 상태:
 *  · pending — 신규 (확인 필요)
 *  · acknowledged — 확인함
 *  · done — 완료
 *
 * 액션: 확인 / 완료
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  Megaphone, CheckCircle, ClockCounterClockwise, CaretRight, Eye,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/use-auth';
import {
  useMyDispatchOrders, updateDispatchStatus,
  DISPATCH_LABEL, DISPATCH_TONE,
  type DispatchOrder,
} from '@/lib/firebase/dispatch-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { toast } from '@/lib/toast';

type Filter = 'pending' | 'all';

export default function MobileOrders() {
  const { user } = useAuth();
  const orders = useMyDispatchOrders(user?.uid);
  const { contracts } = useContracts();
  const [filter, setFilter] = useState<Filter>('pending');

  const filtered = filter === 'pending'
    ? orders.filter((o) => o.status === 'pending')
    : orders;

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>요청받은 업무</h1>
        <p style={{ fontSize: 12, color: 'var(--text-sub)', margin: '4px 0 0' }}>
          사무에서 본인에게 지정한 지시 + 전체 공지
        </p>
      </header>

      <div style={{ display: 'flex', gap: 6 }}>
        <Chip active={filter === 'pending'} onClick={() => setFilter('pending')}>
          미확인 ({orders.filter((o) => o.status === 'pending').length})
        </Chip>
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
          전체 ({orders.length})
        </Chip>
      </div>

      {filtered.length === 0 ? (
        <div style={{
          padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--text-weak)',
          background: 'var(--bg-sunken)', borderRadius: 'var(--radius-lg)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        }}>
          <Megaphone size={32} weight="duotone" />
          {filter === 'pending' ? '미확인 요청 없음' : '받은 요청 없음'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((o) => (
            <OrderRow
              key={o.id}
              order={o}
              contract={o.contractId ? contracts.find((c) => c.id === o.contractId) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '6px 12px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
      background: active ? 'var(--brand)' : 'var(--bg-card)',
      color: active ? '#fff' : 'var(--text-sub)',
      border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
      borderRadius: 'var(--radius)', cursor: 'pointer',
    }}>{children}</button>
  );
}

function OrderRow({ order, contract }: { order: DispatchOrder; contract?: { vehiclePlate?: string; customerName?: string } }) {
  const tone = DISPATCH_TONE[order.kind];
  const isPending = order.status === 'pending';
  const isAck = order.status === 'acknowledged';

  async function acknowledge() {
    try {
      await updateDispatchStatus(order.id, { status: 'acknowledged', acknowledgedAt: new Date().toISOString() });
      toast.success('확인 처리');
    } catch (e) {
      toast.error(`실패: ${(e as Error).message}`);
    }
  }
  async function markDone() {
    try {
      await updateDispatchStatus(order.id, { status: 'done', doneAt: new Date().toISOString() });
      toast.success('완료 처리');
    } catch (e) {
      toast.error(`실패: ${(e as Error).message}`);
    }
  }

  return (
    <div style={{
      padding: 14, background: 'var(--bg-card)',
      border: `1px solid ${isPending ? 'var(--amber-text)' : 'var(--border-soft)'}`,
      borderLeft: `3px solid var(--${tone === 'brand' ? 'brand' : tone + '-text'})`,
      borderRadius: 'var(--radius-lg)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span className={`badge-base badge-${tone}`} style={{ fontSize: 10 }}>{DISPATCH_LABEL[order.kind]}</span>
        {isPending && <span className="badge-base badge-amber" style={{ fontSize: 10 }}>신규</span>}
        {isAck && <span className="badge-base badge-blue" style={{ fontSize: 10 }}>확인됨</span>}
        {order.status === 'done' && <span className="badge-base badge-green" style={{ fontSize: 10 }}>완료</span>}
        {order.dueDate && (
          <span style={{ fontSize: 10, color: 'var(--text-weak)', marginLeft: 'auto' }}>
            마감 <span className="mono">{order.dueDate}</span>
          </span>
        )}
      </div>

      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>{order.title}</div>

      {order.body && (
        <div style={{ fontSize: 12, color: 'var(--text-sub)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {order.body}
        </div>
      )}

      {contract && (
        <Link href={`/m/contract/${order.contractId}`} style={{
          fontSize: 11, color: 'var(--brand)', textDecoration: 'none',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <CaretRight size={11} weight="bold" />
          {contract.vehiclePlate} · {contract.customerName}
        </Link>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: 'var(--text-weak)' }}>
        <span>
          {order.createdBy ?? '?'} · {order._meta?.at?.slice(5, 16).replace('T', ' ')}
        </span>
      </div>

      {/* 액션 */}
      {(isPending || isAck) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {isPending && (
            <button type="button" onClick={acknowledge} style={{
              flex: 1, padding: '10px 12px',
              background: 'var(--bg-card)', color: 'var(--brand)',
              border: '1px solid var(--brand)', borderRadius: 'var(--radius)',
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
              <Eye size={13} weight="bold" /> 확인
            </button>
          )}
          <button type="button" onClick={markDone} style={{
            flex: 1, padding: '10px 12px',
            background: 'var(--green-text)', color: '#fff',
            border: 'none', borderRadius: 'var(--radius)',
            fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}>
            <CheckCircle size={13} weight="bold" /> 완료
          </button>
        </div>
      )}
    </div>
  );
}
