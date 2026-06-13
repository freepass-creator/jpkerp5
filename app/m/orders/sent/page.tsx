'use client';

/**
 * 모바일 보낸 업무 — 새 요청 작성 + 추적 페이지.
 *
 *  · 요청자(사무)는 새 요청 보내기 + 진행 상황 모니터링.
 *  · 헤더 우측 [+ 새 요청] CTA → NewOrderModal
 *  · 행은 액션 없이 상태 표시만
 *  · indigo 라인 (보낸 = 보낸업무 카드 톤과 정합)
 */

import { useState } from 'react';
import { PaperPlaneTilt, Plus } from '@phosphor-icons/react';
import { useAuth } from '@/lib/use-auth';
import { useSentDispatchOrders } from '@/lib/firebase/dispatch-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { OrderRow, NewOrderModal } from '../_shared';
import { haptic } from '@/lib/haptic';

export default function MobileSentOrders() {
  const { user } = useAuth();
  const orders = useSentDispatchOrders(user?.email);
  const { contracts } = useContracts();
  const [newOpen, setNewOpen] = useState(false);

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
        borderTop: '3px solid var(--indigo-text)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <PaperPlaneTilt size={20} weight="regular" />
          보낸 업무
        </h1>
        <button type="button" onClick={() => { haptic.light(); setNewOpen(true); }} style={{
          padding: '6px 12px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
          background: 'var(--brand)', color: '#fff',
          border: 'none', borderRadius: 'var(--radius)',
          display: 'flex', alignItems: 'center', gap: 4,
          cursor: 'pointer', touchAction: 'manipulation',
        }}>
          <Plus size={13} weight="bold" />
          새 요청
        </button>
      </header>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>
          진행 중 {activeCount}건 / 전체 {orders.length}건
        </div>

        {newOpen && <NewOrderModal onClose={() => setNewOpen(false)} creatorEmail={user?.email ?? undefined} />}

        {orders.length === 0 ? (
          <div style={{
            padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--text-weak)',
            background: 'var(--bg-sunken)', borderRadius: 'var(--radius-lg)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          }}>
            <PaperPlaneTilt size={32} weight="duotone" />
            보낸 업무 없음
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {orders.map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                mode="sent"
                contract={o.contractId ? contracts.find((c) => c.id === o.contractId) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
