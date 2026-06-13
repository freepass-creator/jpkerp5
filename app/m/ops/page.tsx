'use client';

/**
 * 모바일 운영 — 그룹화 (리스크 페이지와 같은 패턴).
 *
 * 그룹 순서 (사용자 우선순위):
 *  1. 만기임박 (반납 D-7 이내, 아직 반납 X)
 *  2. 인도예정 (계약은 됐는데 인도 안 됨, 비활성 vehicleStatus 제외)
 *  3. 휴차 (휴차 / 휴차대기)
 *  4. 계약중 (vehicleStatus='운행')
 *
 * 필터 칩 = 그룹과 매칭 (active='all' 이면 모두 표시, 특정 그룹이면 그것만).
 */

import { useMemo, useState } from 'react';
import { useContracts } from '@/lib/firebase/contracts-store';
import { MagnifyingGlass, X, ArrowUUpLeft, Truck, PauseCircle, Car } from '@phosphor-icons/react';
import { ContractListItem } from '@/components/mobile/contract-list-item';
import { formatCurrency } from '@/lib/utils';

type GroupKey = 'returning' | 'delivering' | 'idle' | 'running';

const GROUPS: { key: GroupKey; label: string; tone: 'orange' | 'blue' | 'amber' | 'green'; icon: React.ReactNode }[] = [
  { key: 'returning',  label: '만기임박', tone: 'orange', icon: <ArrowUUpLeft size={16} weight="duotone" /> },
  { key: 'delivering', label: '인도예정', tone: 'blue',   icon: <Truck size={16} weight="duotone" /> },
  { key: 'idle',       label: '휴차',     tone: 'amber',  icon: <PauseCircle size={16} weight="duotone" /> },
  { key: 'running',    label: '계약중',   tone: 'green',  icon: <Car size={16} weight="duotone" /> },
];

export default function MobileOps() {
  const { contracts } = useContracts();
  const [q, setQ] = useState('');
  const [activeGroup, setActiveGroup] = useState<GroupKey | 'all'>('all');

  const { groups, totalCount } = useMemo(() => {
    const query = q.trim().toLowerCase().replace(/[^\w가-힣]/g, '');
    const todayDate = new Date();
    const dayMs = 24 * 60 * 60 * 1000;

    const out: Record<GroupKey, typeof contracts> = {
      returning:  [],
      delivering: [],
      idle:       [],
      running:    [],
    };
    const uniqueIds = new Set<string>();

    for (const c of contracts) {
      if (query) {
        const hay = `${c.vehiclePlate ?? ''}${c.customerName ?? ''}${c.customerPhone1 ?? ''}${c.contractNo ?? ''}`
          .toLowerCase().replace(/[^\w가-힣]/g, '');
        if (!hay.includes(query)) continue;
      }

      const s = c.vehicleStatus;
      let matched = false;

      // 만기임박 — 반납 안 됨 + 예정일 D-7 이내 (계약중의 부분집합)
      if (!c.returnedDate && c.returnScheduledDate) {
        const ret = new Date(c.returnScheduledDate);
        const diff = Math.floor((ret.getTime() - todayDate.getTime()) / dayMs);
        if (diff >= 0 && diff <= 7) {
          out.returning.push(c);
          matched = true;
        }
      }
      // 인도예정 — 인도 안 됨 + 활성 차량 상태
      if (!c.deliveredDate) {
        if (s !== '휴차' && s !== '휴차대기' && s !== '매각' && s !== '매각대기' && s !== '매각검토'
            && c.status !== '반납' && c.status !== '해지') {
          out.delivering.push(c);
          matched = true;
        }
      }
      // 휴차
      if (s === '휴차' || s === '휴차대기') {
        out.idle.push(c);
        matched = true;
      }
      // 계약중 — 운행 (만기임박 contract 도 여기 같이 포함)
      if (s === '운행') {
        out.running.push(c);
        matched = true;
      }

      if (matched) uniqueIds.add(c.id);
    }
    return { groups: out, totalCount: uniqueIds.size };
  }, [contracts, q]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* 상단 고정 — 타이틀 + 검색바 + 그룹 칩 */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--bg-card)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '16px 16px 10px',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Car size={22} weight="duotone" />
          운영
        </h1>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', background: 'var(--bg-card)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        }}>
          <MagnifyingGlass size={18} weight="duotone" />
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
          <GroupChip label={`전체 (${totalCount})`} active={activeGroup === 'all'} onClick={() => setActiveGroup('all')} tone="brand" />
          {GROUPS.map((g) => (
            <GroupChip
              key={g.key}
              label={`${g.label} (${groups[g.key].length})`}
              active={activeGroup === g.key}
              onClick={() => setActiveGroup(g.key)}
              tone={g.tone}
            />
          ))}
        </div>
      </div>

      <div style={{ padding: '10px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>총 {totalCount}건</div>

        {/* 그룹별 섹션 — 리스크 페이지와 동일 패턴 */}
        {(activeGroup === 'all' ? GROUPS : GROUPS.filter((g) => g.key === activeGroup)).map((g) => {
          const items = groups[g.key];
          if (items.length === 0) return null;
          return (
            <section key={g.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <header style={{
                padding: '8px 12px', background: `var(--${g.tone}-bg)`, color: `var(--${g.tone}-text)`,
                border: `1px solid var(--${g.tone}-border, ${g.tone === 'orange' ? 'rgba(194,65,12,0.25)' : g.tone === 'blue' ? 'rgba(30,64,175,0.25)' : g.tone === 'amber' ? 'rgba(161,98,7,0.25)' : 'rgba(22,101,52,0.25)'})`,
                borderRadius: 'var(--radius)',
                fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {g.icon}
                {g.label} ({items.length})
              </header>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map((c) => (
                  <ContractListItem
                    key={c.id}
                    contract={c}
                    extra={c.unpaidAmount > 0
                      ? <span style={{ color: 'var(--red-text)', fontWeight: 600 }}>미수 ₩{formatCurrency(c.unpaidAmount)}</span>
                      : undefined}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {totalCount === 0 && (
          <div style={{
            padding: 32, textAlign: 'center', fontSize: 12, color: 'var(--text-weak)',
            background: 'var(--bg-sunken)', borderRadius: 'var(--radius-lg)',
          }}>
            {q ? '검색 결과 없음' : '해당 조건 없음'}
          </div>
        )}
      </div>
    </div>
  );
}

function GroupChip({ label, active, onClick, tone }: { label: string; active: boolean; onClick: () => void; tone: 'brand' | 'orange' | 'blue' | 'amber' | 'green' }) {
  const activeColor = tone === 'brand' ? 'var(--brand)' : `var(--${tone}-text)`;
  return (
    <button type="button" onClick={onClick} style={{
      padding: '6px 12px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap',
      background: active ? activeColor : 'var(--bg-card)',
      color: active ? '#fff' : (tone === 'brand' ? 'var(--text-sub)' : `var(--${tone}-text)`),
      border: `1px solid ${active ? activeColor : 'var(--border)'}`,
      borderRadius: 'var(--radius)', cursor: 'pointer', flexShrink: 0,
    }}>{label}</button>
  );
}
