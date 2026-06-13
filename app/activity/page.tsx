'use client';

/**
 * 활동 피드 — 모바일·웹 입력 통합 실시간 노출.
 *
 * 데이터 소스:
 *   · field_logs (현장 입력)
 *   · attendance_requests (근태 신청)
 *
 * 필터: 출처(전체/모바일/웹) × 종류(현장입력/근태)
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/layout/sidebar';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useActivityFeed, relativeTime, type ActivityKind } from '@/lib/firebase/activity-feed';
import { Pulse, Phone as PhoneIcon, DesktopTower, ArrowSquareOut, FunnelSimple } from '@phosphor-icons/react';
import type { DataSource } from '@/lib/write-meta';

type SourceFilter = 'all' | 'mobile' | 'web';
type KindFilter = 'all' | ActivityKind;

const SOURCES: { key: SourceFilter; label: string; icon: React.ReactNode }[] = [
  { key: 'all',    label: '전체',   icon: null },
  { key: 'mobile', label: '모바일', icon: <PhoneIcon size={11} weight="bold" /> },
  { key: 'web',    label: '웹',     icon: <DesktopTower size={11} weight="bold" /> },
];

const KINDS: { key: KindFilter; label: string }[] = [
  { key: 'all',        label: '전체' },
  { key: 'field_log',  label: '현장 입력' },
  { key: 'attendance', label: '근태 신청' },
];

export default function ActivityPage() {
  const { items, loading } = useActivityFeed(200);
  const { contracts } = useContracts();
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter((it) => {
      if (sourceFilter !== 'all' && it.source !== sourceFilter) return false;
      if (kindFilter !== 'all' && it.kind !== kindFilter) return false;
      if (query) {
        const hay = `${it.label}${it.summary}${it.by ?? ''}${it.applicantName ?? ''}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [items, sourceFilter, kindFilter, q]);

  const counts = useMemo(() => ({
    total: items.length,
    mobile: items.filter((i) => i.source === 'mobile').length,
    web: items.filter((i) => i.source === 'web').length,
  }), [items]);

  function contractInfo(contractId?: string): string {
    if (!contractId) return '';
    const c = contracts.find((x) => x.id === contractId);
    return c ? `${c.vehiclePlate ?? '?'} · ${c.customerName ?? '?'}` : contractId.slice(0, 8);
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <Pulse size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>활동 피드</span>
            <span style={{ color: 'var(--text-weak)', margin: '0 6px', fontSize: 11 }}>›</span>
            <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>
              {counts.total}건 (모바일 {counts.mobile} / 웹 {counts.web})
            </span>
          </div>
        </header>

        <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <header className="page-header">
            <div className="page-header-title-group">
              <h1 className="page-header-title">
                <Pulse size={18} weight="duotone" />
                활동 피드
              </h1>
              <div className="page-header-title-sub">
                직원이 모바일·웹에서 입력한 메모·면허검증·근태 신청 실시간 통합 노출.
              </div>
            </div>
          </header>

          {/* 필터 */}
          <section className="detail-section">
            <div className="detail-section-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <FunnelSimple size={14} weight="duotone" style={{ color: 'var(--text-sub)' }} />
              <div style={{ display: 'flex', gap: 4 }}>
                {SOURCES.map((s) => (
                  <button key={s.key} className={`chip ${sourceFilter === s.key ? 'active' : ''}`}
                    onClick={() => setSourceFilter(s.key)}>
                    {s.icon} {s.label}
                  </button>
                ))}
              </div>
              <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
              <div style={{ display: 'flex', gap: 4 }}>
                {KINDS.map((k) => (
                  <button key={k.key} className={`chip ${kindFilter === k.key ? 'active' : ''}`}
                    onClick={() => setKindFilter(k.key)}>{k.label}</button>
                ))}
              </div>
              <span style={{ flex: 1 }} />
              <input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="라벨 / 본문 / 작성자"
                className="input" style={{ width: 240 }}
              />
            </div>
          </section>

          {/* 피드 */}
          <section className="detail-section">
            <div className="detail-section-header">
              <span className="title">최근 활동 ({filtered.length})</span>
            </div>
            <div className="detail-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {loading && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-weak)', fontSize: 12 }}>로딩 중...</div>
              )}
              {!loading && filtered.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-weak)', fontSize: 12 }}>
                  해당 조건의 활동 없음
                </div>
              )}
              {filtered.map((it) => (
                <FeedRow key={it.id} item={it} contractInfo={contractInfo(it.contractId)} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function FeedRow({ item, contractInfo }: { item: ReturnType<typeof useActivityFeed>['items'][number]; contractInfo: string }) {
  const sourceColor: Record<DataSource, string> = {
    mobile: 'var(--blue-text)',
    web: 'var(--brand)',
    system: 'var(--text-weak)',
  };
  const sourceBg: Record<DataSource, string> = {
    mobile: 'var(--blue-bg)',
    web: 'var(--brand-bg)',
    system: 'var(--bg-sunken)',
  };
  const linkHref = item.contractId ? `/contract/${item.contractId}`
    : item.attendanceId ? `/attendance` : undefined;

  const content = (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto',
      gap: 12, alignItems: 'flex-start',
      padding: '10px 14px', background: 'var(--bg-card)',
      border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-md)',
    }}>
      <span style={{
        padding: '2px 8px', fontSize: 10, fontWeight: 700,
        background: sourceBg[item.source], color: sourceColor[item.source],
        border: `1px solid ${sourceColor[item.source]}33`,
        borderRadius: 'var(--radius-sm)',
        minWidth: 44, textAlign: 'center', alignSelf: 'center',
      }}>{item.source === 'mobile' ? '모바일' : item.source === 'web' ? '웹' : '시스템'}</span>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 2 }}>
          <span className={`badge-base badge-${item.tone}`} style={{ fontSize: 10 }}>{item.label}</span>
          {contractInfo && (
            <span style={{ fontSize: 11, color: 'var(--text-main)', fontWeight: 600 }}>
              {contractInfo}
            </span>
          )}
          {item.applicantName && (
            <span style={{ fontSize: 11, color: 'var(--text-main)', fontWeight: 600 }}>
              {item.applicantName}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          {item.summary}
        </div>
      </div>

      <div style={{ textAlign: 'right', alignSelf: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>{relativeTime(item.at)}</div>
        {item.by && (
          <div style={{ fontSize: 10, color: 'var(--text-weak)', marginTop: 2 }}>{item.by}</div>
        )}
        {linkHref && (
          <ArrowSquareOut size={11} weight="bold" style={{ color: 'var(--brand)', marginTop: 4 }} />
        )}
      </div>
    </div>
  );

  if (linkHref) {
    return (
      <Link href={linkHref} style={{ textDecoration: 'none', color: 'inherit' }}>
        {content}
      </Link>
    );
  }
  return content;
}
