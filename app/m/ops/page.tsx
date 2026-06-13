'use client';

/**
 * 모바일 운영 — 활성 계약 리스트 + 검색 + 상태 필터.
 *
 * 데스크탑 운영현황 페이지와 같은 데이터, 모바일 카드 레이아웃.
 */

import { useMemo, useState } from 'react';
import { useContracts } from '@/lib/firebase/contracts-store';
import { MagnifyingGlass, X, FunnelSimple } from '@phosphor-icons/react';
import { ContractListItem } from '@/components/mobile/contract-list-item';
import { formatCurrency } from '@/lib/utils';

type Filter = 'all' | 'delivering' | 'running' | 'returning' | 'idle';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',        label: '전체' },
  { key: 'delivering', label: '인도 대기' },
  { key: 'running',    label: '운행' },
  { key: 'returning',  label: '반납 임박' },
  { key: 'idle',       label: '휴차' },
];

export default function MobileOps() {
  const { contracts } = useContracts();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase().replace(/[^\w가-힣]/g, '');
    const todayDate = new Date();
    const dayMs = 24 * 60 * 60 * 1000;

    return contracts
      .filter((c) => {
        if (filter === 'delivering') {
          if (c.deliveredDate) return false;
          if (c.vehicleStatus === '휴차' || c.vehicleStatus === '매각' || c.vehicleStatus === '반납') return false;
        }
        if (filter === 'running') {
          if (c.vehicleStatus !== '운행') return false;
        }
        if (filter === 'returning') {
          if (c.returnedDate || !c.returnScheduledDate) return false;
          const ret = new Date(c.returnScheduledDate);
          const diff = Math.floor((ret.getTime() - todayDate.getTime()) / dayMs);
          if (diff < 0 || diff > 7) return false;
        }
        if (filter === 'idle') {
          if (!(c.vehicleStatus === '휴차' || c.vehicleStatus === '휴차대기')) return false;
        }
        if (query) {
          const hay = `${c.vehiclePlate ?? ''}${c.customerName ?? ''}${c.customerPhone1 ?? ''}${c.contractNo ?? ''}`.toLowerCase().replace(/[^\w가-힣]/g, '');
          if (!hay.includes(query)) return false;
        }
        return true;
      })
      .slice(0, 100);
  }, [contracts, q, filter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* 상단 고정 — 타이틀 + 검색바 + 필터칩. 스크롤해도 따라옴 */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--bg-card)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '16px 16px 10px',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 10px 0' }}>운영</h1>
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
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingTop: 8, paddingBottom: 2, scrollbarWidth: 'none' }}>
          <FunnelSimple size={16} weight="duotone" style={{ color: 'var(--text-sub)', flexShrink: 0, alignSelf: 'center' }} />
          {FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)} style={{
              padding: '6px 12px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap',
              background: filter === f.key ? 'var(--brand)' : 'var(--bg-card)',
              color: filter === f.key ? '#fff' : 'var(--text-sub)',
              border: `1px solid ${filter === f.key ? 'var(--brand)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)', cursor: 'pointer', flexShrink: 0,
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '10px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>{filtered.length}건</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map((c) => (
            <ContractListItem
              key={c.id}
              contract={c}
              extra={c.unpaidAmount > 0
                ? <span style={{ color: 'var(--red-text)', fontWeight: 600 }}>미수 ₩{formatCurrency(c.unpaidAmount)}</span>
                : undefined}
            />
          ))}
          {filtered.length === 0 && (
            <div style={{
              padding: 32, textAlign: 'center', fontSize: 12, color: 'var(--text-weak)',
              background: 'var(--bg-sunken)', borderRadius: 'var(--radius-lg)',
            }}>
              {q ? '검색 결과 없음' : '해당 조건 없음'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

