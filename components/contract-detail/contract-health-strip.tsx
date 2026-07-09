'use client';

/**
 * 계약 상세 상단 연동·완전성 스트립 — "이 계약이 무엇과 물려 있고 뭐가 빠졌나".
 * lib/contract-linkage 의 순수 함수 결과를 칩으로 표시. 읽기 전용(진단만).
 */

import { useMemo } from 'react';
import { Car, CurrencyKrw, Receipt, ShieldCheck, ListNumbers, WarningCircle, CheckCircle } from '@phosphor-icons/react';
import type { Contract } from '@/lib/types';
import { computeContractLinkage } from '@/lib/contract-linkage';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useBankTx, useCardTx } from '@/lib/firebase/transactions-store';
import { useInsurances } from '@/lib/firebase/insurance-store';
import { usePenaltyStore } from '@/lib/use-penalty-store';
import { formatCurrency } from '@/lib/utils';

function Chip({ icon, label, tone = 'normal' }: {
  icon: React.ReactNode;
  label: string;
  tone?: 'normal' | 'muted' | 'red';
}) {
  const color = tone === 'red' ? 'var(--red-text)' : tone === 'muted' ? 'var(--text-weak)' : 'var(--text-main)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 12, color, padding: '3px 8px',
      background: 'var(--bg-sunken)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    }}>
      {icon}{label}
    </span>
  );
}

export function ContractHealthStrip({ c }: { c: Contract }) {
  const { vehicles } = useVehicles();
  const { rows: bankTx } = useBankTx();
  const { rows: cardTx } = useCardTx();
  const { policies: insurances } = useInsurances();
  const [penalties] = usePenaltyStore();

  const { links, missing } = useMemo(
    () => computeContractLinkage(c, { vehicles, bankTx, cardTx, penalties, insurances }),
    [c, vehicles, bankTx, cardTx, penalties, insurances],
  );

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
      padding: '10px 12px', marginBottom: 12,
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-sub)', marginRight: 2 }}>연동</span>
        <Chip icon={<Car size={12} weight="fill" />}
          label={links.vehicle ? (links.vehicle.model || '차량') : '차량 없음'}
          tone={links.vehicle ? 'normal' : 'red'} />
        <Chip icon={<ListNumbers size={12} />}
          label={`회차 ${links.scheduleCount}`}
          tone={links.scheduleCount === 0 ? 'muted' : 'normal'} />
        <Chip icon={<CurrencyKrw size={12} weight="fill" />}
          label={`수납 ${links.incomeCount}건${links.incomeAmount ? ` · ₩${formatCurrency(links.incomeAmount)}` : ''}`}
          tone={links.incomeCount === 0 ? 'muted' : 'normal'} />
        <Chip icon={<Receipt size={12} />}
          label={`과태료 ${links.penaltyCount}`}
          tone={links.penaltyCount === 0 ? 'muted' : 'normal'} />
        <Chip icon={<ShieldCheck size={12} weight="fill" />}
          label={links.insurance ? '보험' : '보험 없음'}
          tone={links.insurance ? 'normal' : 'muted'} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-sub)', marginRight: 2 }}>빠짐</span>
        {missing.length === 0 ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--green-text)' }}>
            <CheckCircle size={13} weight="fill" /> 없음
          </span>
        ) : missing.map((m) => (
          <span key={m} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12,
            color: 'var(--red-text)', padding: '3px 8px',
            background: 'var(--red-bg, rgba(220,38,38,0.08))', border: '1px solid var(--red-border, rgba(220,38,38,0.25))', borderRadius: 'var(--radius-sm)',
          }}>
            <WarningCircle size={12} weight="fill" /> {m}
          </span>
        ))}
      </div>
    </div>
  );
}
