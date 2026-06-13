'use client';

/**
 * 모바일 계약 리스트 행 — 운영/리스크/홈 드롭다운 등 모든 contract list 공용.
 *
 * 규격 통일:
 *  · 카드: bg-card, border-soft 1px, radius-lg, padding 12/14
 *  · 좌측 내용: plate(mono bold) + 고객명(sub) + 상태 칩(옵션) /
 *               모델·회사·서브 텍스트(weak)
 *  · 우측: CaretRight 14
 *  · 강조 영역 (미수금/리스크 상세) 는 extra prop
 *
 * 사용:
 *   <ContractListItem
 *     contract={c}
 *     hrefSuffix="?risk=unpaid"
 *     extra={<span>₩{...}</span>}
 *   />
 */

import Link from 'next/link';
import { CaretRight } from '@phosphor-icons/react';

export type MobileContractListItemProps = {
  contract: {
    id: string;
    vehiclePlate?: string;
    customerName?: string;
    vehicleModel?: string;
    company?: string;
    vehicleStatus?: string;
    unpaidAmount?: number;
  };
  /** href 생성: /m/contract/{id}{hrefSuffix} (예: '?risk=unpaid') */
  hrefSuffix?: string;
  /** 상태 칩 노출 여부 (default true) */
  showStatusChip?: boolean;
  /** 추가 정보 한 줄 — 미수금/리스크 상세 등 */
  extra?: React.ReactNode;
};

export function ContractListItem({ contract: c, hrefSuffix = '', showStatusChip = true, extra }: MobileContractListItemProps) {
  return (
    <Link
      href={`/m/contract/${c.id}${hrefSuffix}`}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', background: 'var(--bg-card)',
        border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)',
        textDecoration: 'none', color: 'inherit',
        touchAction: 'manipulation',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            {c.vehiclePlate ?? '?'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>{c.customerName ?? '?'}</span>
          {showStatusChip && c.vehicleStatus && (
            <span style={{
              fontSize: 10, padding: '1px 6px',
              background: 'var(--bg-sunken)', color: 'var(--text-sub)',
              borderRadius: 'var(--radius-sm)',
            }}>{c.vehicleStatus}</span>
          )}
        </div>
        <div style={{
          fontSize: 10.5, color: 'var(--text-weak)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {c.vehicleModel ?? ''}
          {c.company ? <> · {c.company}</> : null}
          {extra ? <> · {extra}</> : null}
        </div>
      </div>
      <CaretRight size={14} weight="bold" style={{ color: 'var(--text-weak)', flexShrink: 0 }} />
    </Link>
  );
}
