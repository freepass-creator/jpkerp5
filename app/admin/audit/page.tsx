'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardText, MagnifyingGlass, ArrowsClockwise, FileXls } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { useAuditLogs } from '@/lib/firebase/audit-store';
import { useRole } from '@/lib/use-role';
import { exportToExcel } from '@/lib/excel-export';
import { todayKr } from '@/lib/mock-data';
import type { AuditAction, AuditEntityType } from '@/lib/types';
import { usePersistentState } from '@/lib/use-persistent-state';

const ACTION_LABEL: Record<AuditAction, string> = {
  create: '생성',
  update: '수정',
  delete: '삭제',
  restore: '복원',
  match: '매칭',
  unmatch: '매칭해제',
  login: '로그인',
  logout: '로그아웃',
  import: '업로드',
  export: '내보내기',
};

const ACTION_COLOR: Record<AuditAction, string> = {
  create: 'var(--green-text)',
  update: 'var(--brand)',
  delete: 'var(--red-text)',
  restore: 'var(--green-text)',
  match: 'var(--brand)',
  unmatch: 'var(--orange-text)',
  login: 'var(--text-sub)',
  logout: 'var(--text-sub)',
  import: 'var(--brand)',
  export: 'var(--text-sub)',
};

const ENTITY_LABEL: Record<AuditEntityType, string> = {
  contract: '계약',
  company: '법인',
  vehicle: '차량',
  bank_tx: '계좌',
  card_tx: '카드',
  schedule: '회차',
  penalty: '과태료',
  license: '면허',
  document: '서류',
  system: '시스템',
};

/** entityType + entityId → 해당 페이지 url (drill-down). 없으면 null. */
function entityHref(t: AuditEntityType, id?: string): string | null {
  if (!id || id === 'batch') return null;
  switch (t) {
    case 'contract':  return `/contract?id=${encodeURIComponent(id)}`;
    case 'vehicle':   return `/asset?id=${encodeURIComponent(id)}`;
    case 'company':   return `/companies?id=${encodeURIComponent(id)}`;
    case 'penalty':   return `/penalty`;
    case 'bank_tx':
    case 'card_tx':   return `/payments`;
    default: return null;
  }
}

export default function AuditPage() {
  // audit log = master 만 접근 (감사 이력은 민감 정보)
  const router = useRouter();
  const { isRealMaster, loading: roleLoading } = useRole();
  useEffect(() => { if (!roleLoading && !isRealMaster) router.replace('/'); }, [isRealMaster, roleLoading, router]);

  const { rows, loading } = useAuditLogs(1000);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = usePersistentState<AuditAction | 'all'>('filter:audit:action', 'all');
  const [entityFilter, setEntityFilter] = usePersistentState<AuditEntityType | 'all'>('filter:audit:entity', 'all');
  const [dateFrom, setDateFrom] = useState('');     // YYYY-MM-DD (inclusive)
  const [dateTo, setDateTo] = useState('');         // YYYY-MM-DD (inclusive)
  const [expandedId, setExpandedId] = useState<string | null>(null);   // 클릭 행 펼침

  /** 빠른 기간 프리셋 — chip 클릭 1번으로 from·to 동시 설정 */
  function applyPreset(preset: 'today' | '7d' | '30d' | 'thisMonth' | 'clear') {
    if (preset === 'clear') { setDateFrom(''); setDateTo(''); return; }
    const today = todayKr();
    if (preset === 'today') { setDateFrom(today); setDateTo(today); return; }
    if (preset === 'thisMonth') {
      setDateFrom(`${today.slice(0, 7)}-01`);
      setDateTo(today);
      return;
    }
    const days = preset === '7d' ? 7 : 30;
    const d = new Date(today);
    d.setDate(d.getDate() - (days - 1));
    setDateFrom(d.toISOString().slice(0, 10));
    setDateTo(today);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (actionFilter !== 'all' && r.action !== actionFilter) return false;
      if (entityFilter !== 'all' && r.entityType !== entityFilter) return false;
      if (dateFrom || dateTo) {
        const ymd = r.at.slice(0, 10);
        if (dateFrom && ymd < dateFrom) return false;
        if (dateTo && ymd > dateTo) return false;
      }
      if (q) {
        const hay = `${r.label} ${r.by ?? ''} ${r.entityId ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, actionFilter, entityFilter, search, dateFrom, dateTo]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.action] = (m[r.action] ?? 0) + 1;
    return m;
  }, [rows]);

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <ClipboardText size={16} weight="fill" style={{ color: 'var(--text-sub)' }} />
            <span>감사 로그</span>
          </div>

          <div className="topbar-search">
            <MagnifyingGlass size={14} className="icon" />
            <input
              className="input"
              placeholder="내용 / 사용자 / ID 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="filter-bar">
            <button type="button" className={`chip ${actionFilter === 'all' ? 'active' : ''}`} onClick={() => setActionFilter('all')}>전체</button>
            {(['create', 'update', 'delete', 'match', 'unmatch', 'import'] as const).map((a) => (
              <button key={a} type="button" className={`chip ${actionFilter === a ? 'active' : ''}`} onClick={() => setActionFilter(a)}>
                {ACTION_LABEL[a]}
                {counts[a] > 0 && <span className="chip-count">{counts[a]}</span>}
              </button>
            ))}
            <span className="filter-divider" />
            {(['contract', 'bank_tx', 'company', 'schedule'] as const).map((e) => (
              <button key={e} type="button" className={`chip ${entityFilter === e ? 'active' : ''}`} onClick={() => setEntityFilter(entityFilter === e ? 'all' : e)}>
                {ENTITY_LABEL[e]}
              </button>
            ))}
          </div>
        </header>

        {/* 날짜 필터 — 입력 + 빠른 프리셋 */}
        <div style={{
          padding: '8px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          background: 'var(--bg-card)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-weak)' }}>기간</span>
          <input
            type="date"
            className="input input-compact"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ fontSize: 11, width: 130 }}
            aria-label="시작일"
          />
          <span className="dim">~</span>
          <input
            type="date"
            className="input input-compact"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ fontSize: 11, width: 130 }}
            aria-label="종료일"
          />
          <span className="filter-divider" />
          <button type="button" className="chip" onClick={() => applyPreset('today')}>오늘</button>
          <button type="button" className="chip" onClick={() => applyPreset('7d')}>7일</button>
          <button type="button" className="chip" onClick={() => applyPreset('30d')}>30일</button>
          <button type="button" className="chip" onClick={() => applyPreset('thisMonth')}>이번달</button>
          {(dateFrom || dateTo) && (
            <button type="button" className="chip" onClick={() => applyPreset('clear')} title="기간 해제" style={{ color: 'var(--red-text)' }}>
              ×
            </button>
          )}
        </div>

        <div className="dashboard" style={{ gridTemplateColumns: '1fr' }}>
          <div className="panel">
            <div className="panel-body">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 150 }}>일시</th>
                    <th style={{ width: 100 }}>사용자</th>
                    <th className="center" style={{ width: 80 }}>액션</th>
                    <th className="center" style={{ width: 70 }}>대상</th>
                    <th>내용</th>
                    <th style={{ width: 120 }}>ID</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="muted center" style={{ padding: '32px 10px' }}>
                        <ArrowsClockwise size={14} style={{ animation: 'spin 1s linear infinite', marginRight: 6 }} />
                        로그 로드 중...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted center" style={{ padding: '32px 10px' }}>
                        표시할 감사 로그가 없습니다.
                      </td>
                    </tr>
                  ) : filtered.map((r) => {
                    const hasDetail = !!(r.before || r.after);
                    const isExpanded = expandedId === r.id;
                    return (
                      <Fragment key={r.id}>
                        <tr
                          onClick={() => hasDetail && setExpandedId(isExpanded ? null : r.id)}
                          style={{ cursor: hasDetail ? 'pointer' : 'default' }}
                          title={hasDetail ? '클릭 — 변경 상세 펼침/접기' : '변경 상세 없음'}
                        >
                          <td className="mono">
                            {hasDetail && (
                              <span style={{ marginRight: 4, color: 'var(--text-weak)', fontSize: 10 }}>
                                {isExpanded ? '▼' : '▶'}
                              </span>
                            )}
                            {r.at.slice(0, 19).replace('T', ' ')}
                          </td>
                          <td className="dim">{r.by ?? '시스템'}</td>
                          <td className="center">
                            <span style={{ fontWeight: 600, fontSize: 11, color: ACTION_COLOR[r.action] }}>
                              {ACTION_LABEL[r.action]}
                            </span>
                          </td>
                          <td className="center dim">{ENTITY_LABEL[r.entityType]}</td>
                          <td>{r.label}</td>
                          <td className="mono dim" style={{ fontSize: 11 }} onClick={(e) => e.stopPropagation()}>
                            {(() => {
                              const href = entityHref(r.entityType, r.entityId);
                              if (!href) return r.entityId ?? '-';
                              return (
                                <a href={href} target="_blank" rel="noopener noreferrer" title="새 탭으로 점프" style={{ color: 'var(--brand)', textDecoration: 'none', borderBottom: '1px dashed currentColor' }}>
                                  {r.entityId}
                                </a>
                              );
                            })()}
                          </td>
                        </tr>
                        {isExpanded && hasDetail && (
                          <tr>
                            <td colSpan={6} style={{ background: 'var(--bg-sunken)', padding: 0 }}>
                              <DiffPanel before={r.before} after={r.after} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <BottomBar
          left={
            <button
              className="btn"
              type="button"
              disabled={filtered.length === 0}
              title={`표시된 ${filtered.length}건 엑셀 다운로드 (현재 필터 그대로)`}
              onClick={() => {
                const periodLabel = dateFrom && dateTo ? `${dateFrom} ~ ${dateTo}`
                  : dateFrom ? `${dateFrom}~` : dateTo ? `~${dateTo}` : '전체';
                exportToExcel({
                  title: `감사 로그 — ${periodLabel}`,
                  fileName: `감사로그-${dateFrom || 'all'}-${dateTo || 'all'}`,
                  sheetName: '감사',
                  rows: filtered.map((r) => ({
                    일시: r.at.slice(0, 19).replace('T', ' '),
                    사용자: r.by ?? '시스템',
                    액션: ACTION_LABEL[r.action],
                    대상: ENTITY_LABEL[r.entityType],
                    ID: r.entityId ?? '',
                    내용: r.label,
                  })),
                  columns: [
                    { key: '일시', header: '일시', width: 20, type: 'mono' },
                    { key: '사용자', header: '사용자', width: 18 },
                    { key: '액션', header: '액션', width: 10, type: 'center' },
                    { key: '대상', header: '대상', width: 10, type: 'center' },
                    { key: 'ID', header: 'ID', width: 16, type: 'mono' },
                    { key: '내용', header: '내용', width: 60 },
                  ],
                });
              }}
            >
              <FileXls size={14} weight="bold" /> 엑셀 <span className="chip-count">{filtered.length}</span>
            </button>
          }
          right={
            <>
              <span>전체 <strong>{rows.length}</strong></span>
              <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
              <span>표시 <strong>{filtered.length}</strong></span>
            </>
          }
        />
      </div>
    </div>
  );
}

/**
 * 변경 상세 — before/after 키 합치고 row 마다 한 줄로.
 *
 *  · 동일값 키: 회색으로 숨기지 않고 표시 (컨텍스트용)
 *  · 변경된 키: before 빨강 strike + after 초록 강조
 *  · 신규(after 만): 초록 강조
 *  · 삭제(before 만): 빨강 strike
 */
function DiffPanel({ before, after }: { before?: Record<string, unknown>; after?: Record<string, unknown> }) {
  const b = before ?? {};
  const a = after ?? {};
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).sort();
  if (keys.length === 0) return <div style={{ padding: 12, fontSize: 11, color: 'var(--text-weak)' }}>변경 상세 없음</div>;

  return (
    <div style={{ padding: '8px 16px', fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: 'var(--text-weak)' }}>
            <th style={{ width: '24%', textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>필드</th>
            <th style={{ width: '38%', textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>변경 전</th>
            <th style={{ width: '38%', textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>변경 후</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => {
            const bv = b[k];
            const av = a[k];
            const same = JSON.stringify(bv) === JSON.stringify(av);
            return (
              <tr key={k} style={{ borderTop: '1px solid var(--border-soft)' }}>
                <td style={{ padding: '4px 8px', color: 'var(--text-sub)' }}>{k}</td>
                <td style={{ padding: '4px 8px', color: same ? 'var(--text-weak)' : 'var(--red-text)', textDecoration: !same && bv !== undefined ? 'line-through' : undefined }}>
                  {bv === undefined ? <span className="dim">—</span> : <DiffValue v={bv} />}
                </td>
                <td style={{ padding: '4px 8px', color: same ? 'var(--text-weak)' : 'var(--green-text, #10b981)', fontWeight: same ? 400 : 600 }}>
                  {av === undefined ? <span className="dim">—</span> : <DiffValue v={av} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DiffValue({ v }: { v: unknown }) {
  if (v === null) return <span className="dim">null</span>;
  if (typeof v === 'boolean') return <>{v ? 'true' : 'false'}</>;
  if (typeof v === 'number') return <>{v.toLocaleString()}</>;
  if (typeof v === 'string') return <>{v.length > 80 ? v.slice(0, 80) + '…' : v}</>;
  return <>{JSON.stringify(v).slice(0, 80)}</>;
}
