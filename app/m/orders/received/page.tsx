'use client';

/**
 * 모바일 받은 업무 — 처리 전용 페이지.
 *
 *  · 받은자(현장)는 처리만 함. 새 요청 보내기 X.
 *  · 3단계 액션: 확인 → 진행중 → 완료
 *  · amber 라인 (받은 = 받은업무 카드 톤과 정합)
 */

import { Megaphone } from '@phosphor-icons/react';
import { useAuth } from '@/lib/use-auth';
import { useMyDispatchOrders } from '@/lib/firebase/dispatch-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { OrderRow } from '../_shared';

export default function MobileReceivedOrders() {
  const { user } = useAuth();
  const orders = useMyDispatchOrders(user?.uid);
  const { contracts } = useContracts();

  const activeCount = orders.filter((o) =>
    o.status === 'pending' || o.status === 'acknowledged' || o.status === 'in_progress'
  ).length;

  return (
    <div>
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--bg-card)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '12px 16px',
        borderTop: '3px solid var(--amber-text)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Megaphone size={20} weight="regular" />
          받은 업무
        </h1>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-sub)' }}>
          진행 중 {activeCount} / 전체 {orders.length}
        </span>
      </header>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {orders.length === 0 ? (
          <div style={{
            padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--text-weak)',
            background: 'var(--bg-sunken)', borderRadius: 'var(--radius-lg)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          }}>
            <Megaphone size={32} weight="duotone" />
            받은 업무 없음
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {orders.map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                mode="received"
                contract={o.contractId ? contracts.find((c) => c.id === o.contractId) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
