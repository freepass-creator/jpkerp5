'use client';

/**
 * 보증금 처리 섹션 — 반납/강제회수 시 미반환 보증금을 차감(미납·손상·과태료)·환불 처리.
 *
 * 사실만: 받은 보증금 − 차감 − 환불 = 미반환 잔액. 정책(반환기한 N일 등)은 설정에서(추후).
 * 반납/해지/회수됐는데 미반환 잔액 있으면 "보증금 미반환" 강조 → 여기서 처리.
 */

import { useState } from 'react';
import { Coins } from '@phosphor-icons/react';
import type { Contract } from '@/lib/types';
import { Section } from '@/components/ui/detail-primitives';
import { StatusBadge } from '@/components/ui/status-badge';
import { showConfirm } from '@/lib/confirm';
import { toast } from '@/lib/toast';
import { todayKr } from '@/lib/mock-data';
import { formatCurrency } from '@/lib/utils';
import { depositLedger, addDepositDeduction, hasUnrefundedDeposit } from '@/lib/deposit';
import { isContractEnded } from '@/lib/contract-lifecycle';

export function DepositSection({ c, onUpdate }: { c: Contract; onUpdate: (c: Contract) => void }) {
  const l = depositLedger(c);
  const ended = isContractEnded(c);
  const flagged = hasUnrefundedDeposit(c);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const won = (n: number) => `₩${formatCurrency(n)}`;

  async function addDeduction() {
    const n = Number(amount.replace(/[,\s]/g, ''));
    if (!Number.isFinite(n) || n <= 0) { toast.error('차감 금액을 입력하세요'); return; }
    if (!reason.trim()) { toast.error('차감 사유를 입력하세요'); return; }
    if (n > l.unrefunded) { if (!await showConfirm({ title: `차감액이 미반환 잔액(${won(l.unrefunded)})보다 큽니다. 계속?`, danger: true })) return; }
    onUpdate({ ...c, ...addDepositDeduction(c, { date: todayKr(), amount: n, reason: reason.trim() }) });
    setAmount(''); setReason('');
    toast.success(`보증금 차감 ${won(n)} — ${reason.trim()}`);
  }

  async function refundRest() {
    if (l.unrefunded <= 0) { toast.info('환불할 미반환 잔액 없음'); return; }
    if (!await showConfirm({ title: `미반환 잔액 ${won(l.unrefunded)} 환불 처리할까요?`, description: '환불 완료로 기록됩니다.', confirmLabel: '환불 처리' })) return;
    setBusy(true);
    try {
      onUpdate({ ...c, depositRefunded: (c.depositRefunded ?? 0) + l.unrefunded, depositRefundedDate: todayKr() });
      toast.success(`보증금 ${won(l.unrefunded)} 환불 처리`);
    } finally { setBusy(false); }
  }

  return (
    <Section
      icon={<Coins size={12} weight="duotone" />}
      title="보증금 처리"
      action={flagged ? <StatusBadge tone="red">미반환 {won(l.unrefunded)}</StatusBadge> : (ended && l.unrefunded === 0 && l.received > 0 ? <StatusBadge tone="green">반환완료</StatusBadge> : undefined)}
    >
      <div className="detail-grid-2" style={{ fontSize: 12 }}>
        <Kv k="계약상 보증금" v={won(l.contractual)} />
        <Kv k="받은 보증금" v={won(l.received)} />
        <Kv k="차감 합계" v={l.deducted > 0 ? `− ${won(l.deducted)}` : '−'} tone={l.deducted > 0 ? 'var(--red-text)' : undefined} />
        <Kv k="환불 합계" v={l.refunded > 0 ? `− ${won(l.refunded)}` : '−'} />
        <Kv k="미반환 잔액" v={won(l.unrefunded)} tone={l.unrefunded > 0 ? 'var(--red-text)' : 'var(--green-text)'} bold />
      </div>

      {/* 차감 내역 */}
      {(c.depositDeductions ?? []).length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11 }}>
          {(c.depositDeductions ?? []).map((d) => (
            <div key={d.id} style={{ display: 'flex', gap: 8, padding: '2px 0', borderTop: '1px solid var(--border-weak)' }}>
              <span className="mono dim">{d.date}</span>
              <span className="mono" style={{ color: 'var(--red-text)' }}>− {won(d.amount)}</span>
              <span>{d.reason}</span>
            </div>
          ))}
        </div>
      )}

      {/* 처리 액션 — 반납/해지/회수된 계약에서 */}
      {ended && l.unrefunded > 0 && (
        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input" placeholder="차감액" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 100, fontSize: 12 }} inputMode="numeric" />
          <input className="input" placeholder="사유 (미납/손상/과태료…)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: 180, fontSize: 12 }} />
          <button className="btn btn-sm" type="button" onClick={addDeduction}>차감 추가</button>
          <button className="btn btn-sm btn-primary" type="button" disabled={busy} onClick={refundRest}>잔액 {won(l.unrefunded)} 환불</button>
        </div>
      )}
      {!ended && (
        <div className="dim" style={{ fontSize: 11, marginTop: 8 }}>운행 중 — 반납/해지 시 미반환 보증금 처리(차감·환불)가 여기서 활성화됩니다.</div>
      )}
    </Section>
  );
}

function Kv({ k, v, tone, bold }: { k: string; v: string; tone?: string; bold?: boolean }) {
  return (
    <div className="detail-field" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span className="label" style={{ minWidth: 90, color: 'var(--text-sub)' }}>{k}</span>
      <span className="mono" style={{ color: tone, fontWeight: bold ? 700 : undefined }}>{v}</span>
    </div>
  );
}
