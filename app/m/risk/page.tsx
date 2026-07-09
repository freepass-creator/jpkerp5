'use client';

/**
 * 모바일 리스크 — 미수·연체·반납 지연·보험 미커버·미입력 데이터 등.
 *
 * 카테고리별로 그룹화하여 현장 직원이 즉시 행동할 항목 노출.
 */

import { useMemo, useState } from 'react';
import { useContracts } from '@/lib/firebase/contracts-store';
import { isContractEnded } from '@/lib/contract-lifecycle';
import { getExpiryDate } from '@/lib/contract-stage';
import { todayKr } from '@/lib/mock-data';
import { CurrencyKrw, ArrowUUpLeft, ShieldWarning, IdentificationCard, MagnifyingGlass, X } from '@phosphor-icons/react';
import { ContractListItem } from '@/components/mobile/contract-list-item';
import { formatCurrency } from '@/lib/utils';
import { ageFromIdent } from '@/lib/ident';

type RiskKind = 'unpaid' | 'overdue-return' | 'insurance-gap' | 'insurance-expiry' | 'missing-ident';

const KINDS: { key: RiskKind; label: string; icon: React.ReactNode; tone: 'red' | 'orange' | 'amber' }[] = [
  { key: 'unpaid',           label: '미수금',         icon: <CurrencyKrw size={16} weight="duotone" />,    tone: 'red' },
  { key: 'overdue-return',   label: '반납 지연',      icon: <ArrowUUpLeft size={16} weight="duotone" />,   tone: 'orange' },
  { key: 'insurance-gap',    label: '보험 미커버',    icon: <ShieldWarning size={16} weight="duotone" />,  tone: 'red' },
  { key: 'insurance-expiry', label: '보험 만료 임박', icon: <ShieldWarning size={16} weight="duotone" />,  tone: 'amber' },
  { key: 'missing-ident',    label: '등록번호 결손',  icon: <IdentificationCard size={16} weight="duotone" />, tone: 'amber' },
];

export default function MobileRisk() {
  const { contracts } = useContracts();
  const [activeKind, setActiveKind] = useState<RiskKind | 'all'>('all');
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const dayMs = 24 * 60 * 60 * 1000;
    const todayStr = todayKr();
    const out: Record<RiskKind, typeof contracts> = {
      'unpaid':           [],
      'overdue-return':   [],
      'insurance-gap':    [],
      'insurance-expiry': [],
      'missing-ident':    [],
    };
    for (const c of contracts) {
      const s = c.vehicleStatus;
      const inactive = s === '휴차' || s === '휴차대기' || s === '매각' || s === '매각대기'
        || s === '매각검토' || isContractEnded(c);

      if (c.unpaidAmount > 0) out['unpaid'].push(c);

      if (!c.returnedDate) {
        // 만기 SSOT + 문자열 비교 (기존 new Date() 시분초 포함으로 오후엔 하루 어긋나던 것 제거)
        const exp = getExpiryDate(c);
        if (exp && exp < todayStr) out['overdue-return'].push(c);
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

        // 보험 만료 임박 D-30 (만료일 ≤ 30일 + 미만료).
        //   문자열 today(KST) 기준 정수일수 — new Date() 시분초 혼입+floor 는 당일 만료건을
        //   오전 9시 이후 누락시켰음(overdue-return 과 동일 방식으로 통일).
        if (c.insuranceExpiryDate) {
          const diff = Math.round((new Date(c.insuranceExpiryDate).getTime() - new Date(todayStr).getTime()) / dayMs);
          if (diff >= 0 && diff <= 30) out['insurance-expiry'].push(c);
        }
      }
    }
    return out;
  }, [contracts]);

  const totalCount = (Object.values(groups) as (typeof contracts)[]).reduce((a, list) => a + list.length, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* 상단 고정 — 검색바 + 카테고리 칩. 탭바로 위치 인지 */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--bg-card)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '12px 16px 10px',
        borderTop: '3px solid var(--red-text)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        {/* 검색바 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', background: 'var(--bg-card)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        }}>
          <MagnifyingGlass size={18} weight="bold" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="차량번호 / 고객명 / 연락처"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 16, fontFamily: 'inherit' }}
          />
          {q && (
            <button onClick={() => setQ('')} type="button" style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-sub)' }} aria-label="지우기">
              <X size={16} weight="bold" />
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 8, paddingBottom: 2 }}>
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
      </div>

      <div style={{ padding: '10px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 운영과 동일 — 총 건수 표시 */}
        <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>
          총 {totalCount}건
        </div>
      {/* 카테고리별 섹션 */}
      {(activeKind === 'all' ? KINDS : KINDS.filter((k) => k.key === activeKind)).map((kind) => {
        const items = groups[kind.key];
        if (items.length === 0) return null;
        return (
          <section key={kind.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <header style={{
              padding: '8px 12px', background: `var(--${kind.tone}-bg)`, color: `var(--${kind.tone}-text)`,
              border: `1px solid var(--${kind.tone}-border, ${kind.tone === 'red' ? 'rgba(220,38,38,0.25)' : 'rgba(194,65,12,0.25)'})`,
              borderRadius: 'var(--radius)',
              fontSize: 12, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {kind.icon}
              {kind.label} ({items.length})
            </header>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((c) => {
                const extraText =
                  kind.key === 'unpaid' && c.unpaidAmount > 0
                    ? <span style={{ color: 'var(--red-text)', fontWeight: 600 }}>₩{formatCurrency(c.unpaidAmount)}</span>
                  : kind.key === 'overdue-return' && c.returnScheduledDate
                    ? <span style={{ color: 'var(--orange-text)' }}>반납예정 {c.returnScheduledDate}</span>
                  : kind.key === 'insurance-gap'
                    ? <span>보험연령 {c.insuranceAge ?? '-'}세</span>
                  : kind.key === 'insurance-expiry' && c.insuranceExpiryDate
                    ? <span style={{ color: 'var(--amber-text)' }}>만료 {c.insuranceExpiryDate}</span>
                  : kind.key === 'missing-ident'
                    ? <span style={{ color: 'var(--amber-text)' }}>등록번호 결손</span>
                  : null;
                return (
                  <ContractListItem
                    key={c.id}
                    contract={c}
                    hrefSuffix={`?risk=${kind.key}`}
                    extra={extraText ?? undefined}
                  />
                );
              })}
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
