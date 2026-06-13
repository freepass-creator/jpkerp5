'use client';

/**
 * 모바일 검색 — 차량번호 / 고객명 / 연락처 통합.
 *
 * 데스크탑 GlobalSearch 와 동일한 데이터 소스를 사용하되, 모바일에 맞춘 큰 입력 + 카드 리스트.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useContracts } from '@/lib/firebase/contracts-store';
import { MagnifyingGlass, CaretRight, X } from '@phosphor-icons/react';

export default function MobileSearch() {
  const { contracts } = useContracts();
  const [q, setQ] = useState('');

  const results = useMemo(() => {
    const query = q.trim().toLowerCase().replace(/[^\w가-힣]/g, '');
    if (!query) return [];
    return contracts
      .filter((c) => {
        const hay = `${c.vehiclePlate ?? ''}${c.customerName ?? ''}${c.customerPhone1 ?? ''}${c.customerPhone2 ?? ''}${c.contractNo ?? ''}`
          .toLowerCase().replace(/[^\w가-힣]/g, '');
        return hay.includes(query);
      })
      .slice(0, 50);
  }, [contracts, q]);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px 0' }}>검색</h1>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', background: 'var(--bg-card)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        }}>
          <MagnifyingGlass size={18} weight="duotone" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="차량번호 / 고객명 / 연락처"
            autoFocus
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 16, fontFamily: 'inherit',
            }}
          />
          {q && (
            <button onClick={() => setQ('')} type="button" style={{
              padding: 4, background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-sub)',
            }} aria-label="지우기">
              <X size={16} weight="bold" />
            </button>
          )}
        </div>
        {q && (
          <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 6 }}>
            {results.length}건
          </div>
        )}
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {results.map((c) => (
          <Link key={c.id} href={`/m/contract/${c.id}`} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', background: 'var(--bg-card)',
            border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)',
            textDecoration: 'none', color: 'inherit', touchAction: 'manipulation',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{c.vehiclePlate ?? '?'}</span>
                <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>{c.customerName ?? '?'}</span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-weak)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.customerPhone1 ?? ''} · {c.company ?? ''}
              </div>
            </div>
            <CaretRight size={14} weight="bold" style={{ color: 'var(--text-weak)', flexShrink: 0 }} />
          </Link>
        ))}
        {q && results.length === 0 && (
          <div style={{
            padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-weak)',
            background: 'var(--bg-sunken)', borderRadius: 'var(--radius-lg)',
          }}>
            검색 결과 없음
          </div>
        )}
        {!q && (
          <div style={{
            padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-weak)',
            background: 'var(--bg-sunken)', borderRadius: 'var(--radius-lg)',
          }}>
            차량번호, 고객명, 또는 연락처를 입력하세요
          </div>
        )}
      </div>
    </div>
  );
}
