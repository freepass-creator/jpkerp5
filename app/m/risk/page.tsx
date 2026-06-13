'use client';

/**
 * 모바일 리스크 — 미수·연체·반납 지연·보험 미커버·미입력 데이터 등.
 *
 * 카테고리별로 그룹화하여 현장 직원이 즉시 행동할 항목 노출.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useContracts } from '@/lib/firebase/contracts-store';
import { CurrencyKrw, ArrowUUpLeft, ShieldWarning, IdentificationCard, CaretRight, FunnelSimple } from '@phosphor-icons/react';
import { formatCurrency } from '@/lib/utils';
import { ageFromIdent } from '@/lib/ident';

type RiskKind = 'unpaid' | 'overdue-return' | 'insurance-gap' | 'missing-ident';

const KINDS: { key: RiskKind; label: string; icon: React.ReactNode; tone: 'red' | 'orange' | 'amber' }[] = [
  { key: 'unpaid',         label: '미수금',       icon: <CurrencyKrw size={16} weight="duotone" />,    tone: 'red' },
  { key: 'overdue-return', label: '반납 지연',    icon: <ArrowUUpLeft size={16} weight="duotone" />,   tone: 'orange' },
  { key: 'insurance-gap',  label: '보험 미커버',  icon: <ShieldWarning size={16} weight="duotone" />,  tone: 'red' },
  { key: 'missing-ident',  label: '등록번호 결손', icon: <IdentificationCard size={16} weight="duotone" />, tone: 'amber' },
];

export default function MobileRisk() {
  const { contracts } = useContracts();
  const [activeKind, setActiveKind] = useState<RiskKind | 'all'>('all');

  const groups = useMemo(() => {
    const todayDate = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const out: Record<RiskKind, typeof contracts> = {
      'unpaid':         [],
      'overdue-return': [],
      'insurance-gap':  [],
      'missing-ident':  [],
    };
    for (const c of contracts) {
      const s = c.vehicleStatus;
      const inactive = s === '휴차' || s === '휴차대기' || s === '매각' || s === '매각대기'
        || s === '매각검토' || c.status === '반납' || c.status === '해지';

      if (c.unpaidAmount > 0) out['unpaid'].push(c);

      if (!c.returnedDate && c.returnScheduledDate) {
        const ret = new Date(c.returnScheduledDate);
        const diff = Math.floor((ret.getTime() - todayDate.getTime()) / dayMs);
        if (diff < 0) out['overdue-return'].push(c);
      }

      if (!inactive) {
        const ia = c.insuranceAge ?? 0;
        const driverIdent = c.customerKind === '법인' ? c.driverIdentNo : (c.customerIdentNo ?? c.driverIdentNo);
        const age = ageFromIdent(driverIdent, '개인');
        const blocked = (ia > 0 && age != null && age < ia);
        const missingDriver = ia > 0 && age == null;
        if (blocked || missingDriver) out['insurance-gap'].push(c);
      }

      if (!inactive) {
        const d = (c.customerIdentNo ?? '').replace(/\D/g, '');
        if (c.customerKind !== '법인' && d.length !== 13) out['missing-ident'].push(c);
      }
    }
    return out;
  }, [contracts]);

  const totalCount = (Object.values(groups) as (typeof contracts)[]).reduce((a, list) => a + list.length, 0);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px 0' }}>리스크</h1>
        <p style={{ fontSize: 12, color: 'var(--text-sub)', margin: 0 }}>
          미수 · 반납 지연 · 보험 미커버 · 데이터 결손
        </p>
      </header>

      {/* 카테고리 필터 */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
        <FunnelSimple size={16} weight="duotone" style={{ color: 'var(--text-sub)', flexShrink: 0, alignSelf: 'center' }} />
        <KindChip label={`전체 (${totalCount})`} active={activeKind === 'all'} onClick={() => setActiveKind('all')} tone="brand" />
        {KINDS.map((k) => (
          <KindChip
            key={k.key}
            label={`${k.label} (${groups[k.key].length})`}
            active={activeKind === k.key}
            onClick={() => setActiveKind(k.key)}
            tone={k.tone}
          />
        ))}
      </div>

      {/* 카테고리별 섹션 */}
      {(activeKind === 'all' ? KINDS : KINDS.filter((k) => k.key === activeKind)).map((kind) => {
        const items = groups[kind.key];
        if (items.length === 0) return null;
        return (
          <section key={kind.key} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-lg)', overflow: 'hidden',
          }}>
            <header style={{
              padding: '10px 14px', background: `var(--${kind.tone}-bg)`, color: `var(--${kind.tone}-text)`,
              borderBottom: `1px solid var(--${kind.tone}-border, ${kind.tone === 'red' ? 'rgba(220,38,38,0.25)' : 'rgba(194,65,12,0.25)'})`,
              fontSize: 12, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {kind.icon}
              {kind.label} ({items.length})
            </header>
            <div>
              {items.slice(0, 30).map((c) => (
                <Link key={c.id} href={`/m/contract/${c.id}`} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderBottom: '1px solid var(--border-soft)',
                  textDecoration: 'none', color: 'inherit', touchAction: 'manipulation',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 13 }}>{c.vehiclePlate ?? '?'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>{c.customerName ?? '?'}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-weak)', marginTop: 2 }}>
                      {kind.key === 'unpaid' && c.unpaidAmount > 0 && (
                        <span style={{ color: 'var(--red-text)', fontWeight: 600 }}>₩{formatCurrency(c.unpaidAmount)}</span>
                      )}
                      {kind.key === 'overdue-return' && c.returnScheduledDate && (
                        <span>예정 {c.returnScheduledDate}</span>
                      )}
                      {kind.key === 'insurance-gap' && (
                        <span>보험연령 {c.insuranceAge ?? '-'}세</span>
                      )}
                      {kind.key === 'missing-ident' && (
                        <span>등록번호 결손</span>
                      )}
                    </div>
                  </div>
                  <CaretRight size={14} weight="bold" style={{ color: 'var(--text-weak)' }} />
                </Link>
              ))}
              {items.length > 30 && (
                <div style={{ padding: 10, textAlign: 'center', fontSize: 11, color: 'var(--text-weak)' }}>
                  ... 외 {items.length - 30}건
                </div>
              )}
            </div>
          </section>
        );
      })}

      {totalCount === 0 && (
        <div style={{
          padding: 32, textAlign: 'center', fontSize: 12, color: 'var(--text-weak)',
          background: 'var(--bg-sunken)', borderRadius: 'var(--radius-lg)',
        }}>
          리스크 없음 — 좋은 상태
        </div>
      )}
    </div>
  );
}

function KindChip({ label, active, onClick, tone }: { label: string; active: boolean; onClick: () => void; tone: 'brand' | 'red' | 'orange' | 'amber' }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '6px 12px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap',
      background: active ? (tone === 'brand' ? 'var(--brand)' : `var(--${tone}-text)`) : 'var(--bg-card)',
      color: active ? '#fff' : (tone === 'brand' ? 'var(--text-sub)' : `var(--${tone}-text)`),
      border: `1px solid ${active ? (tone === 'brand' ? 'var(--brand)' : `var(--${tone}-text)`) : 'var(--border)'}`,
      borderRadius: 'var(--radius)', cursor: 'pointer', flexShrink: 0,
    }}>{label}</button>
  );
}
