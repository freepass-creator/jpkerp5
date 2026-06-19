'use client';

/**
 * /inbox — intake 단일 inbox 페이지 (Phase 3).
 *
 * 모든 데이터 입력 (모바일 업로드 · 엑셀 import · OCR dialog) 의 audit 로그.
 * 단계 표시: classifying → matching → matched/pending → committed/rejected.
 *
 * 현재는 **READ-ONLY 가시화**. 클릭 시 raw + classify + match 상세 패널.
 * 사용자 수동 수정·재처리는 Phase 3.1+ 에서 추가.
 */

import { useMemo, useState } from 'react';
import { Tray, ArrowsClockwise } from '@phosphor-icons/react';
import { PageShell } from '@/components/ui/page-shell';
import { FilterSelect } from '@/components/ui/filter-select';
import { useIntakeItems, removeIntakeItem } from '@/lib/firebase/intake-store';
import { toast } from '@/lib/toast';
import type { IntakeItem, IntakeStatus, IntakeSource, IntakeKind } from '@/lib/intake/types';

const STATUS_LABEL: Record<IntakeStatus, string> = {
  classifying: '분류중',
  matching: '매칭중',
  matched: '매칭됨',
  pending: '대기',
  committed: '반영완료',
  rejected: '거부',
};
const STATUS_TONE: Record<IntakeStatus, string> = {
  classifying: 'gray',
  matching: 'amber',
  matched: 'blue',
  pending: 'orange',
  committed: 'green',
  rejected: 'red',
};

const SOURCE_LABEL: Record<IntakeSource, string> = {
  'desktop-excel':         '엑셀 import',
  'desktop-ocr-penalty':   'OCR 과태료',
  'desktop-ocr-vehicle':   'OCR 등록증',
  'desktop-ocr-insurance': 'OCR 보험',
  'desktop-ocr-business':  'OCR 사업자등록',
  'mobile-upload':         '모바일',
  'manual-form':           '수기',
};

const KIND_LABEL: Record<IntakeKind, string> = {
  contract: '계약',
  vehicle: '자산',
  company: '법인',
  'bank-tx': '입출금',
  'card-tx': '카드',
  'auto-debit': '자동이체',
  penalty: '과태료',
  insurance: '보험',
  loan: '할부',
  photo: '사진',
  'audio-call': '통화',
  'document-misc': '문서',
  'snapshot-mixed': '스냅샷',
  unknown: '?',
};

type StatusFilter = 'all' | 'active' | IntakeStatus;
const STATUS_FILTERS: StatusFilter[] = ['all', 'active', 'classifying', 'matching', 'matched', 'pending', 'committed', 'rejected'];
const SOURCE_FILTERS: Array<'all' | IntakeSource> = ['all', 'mobile-upload', 'desktop-excel', 'desktop-ocr-penalty', 'desktop-ocr-vehicle', 'desktop-ocr-insurance', 'desktop-ocr-business', 'manual-form'];

function fmtTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function effectiveKind(item: IntakeItem): IntakeKind {
  if (item.overrideKind) return item.overrideKind;
  return item.classify?.kind ?? 'unknown';
}

export default function InboxPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [sourceFilter, setSourceFilter] = useState<'all' | IntakeSource>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 'all' → 모든 status (loadAll), 'active' → 처리 진행중 (default)
  const { items, loading } = useIntakeItems({
    status: statusFilter === 'all' || statusFilter === 'active' ? statusFilter as 'active' : statusFilter,
  });

  const filtered = useMemo(() => {
    let list = items;
    if (sourceFilter !== 'all') list = list.filter((i) => i.source === sourceFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((i) => {
        const blob = JSON.stringify({ raw: i.raw, classify: i.classify, match: i.match }).toLowerCase();
        return blob.includes(q);
      });
    }
    return list;
  }, [items, sourceFilter, search]);

  const selected = useMemo(() => filtered.find((i) => i.id === selectedId) ?? null, [filtered, selectedId]);

  async function handleRemove(id: string) {
    if (!confirm('이 intake 기록을 삭제합니다 (도메인 노드는 영향 X). 진행?')) return;
    try {
      await removeIntakeItem(id);
      toast.success('삭제됨');
      if (selectedId === id) setSelectedId(null);
    } catch (e) {
      toast.error(`삭제 실패: ${(e as Error).message}`);
    }
  }

  return (
    <PageShell
      title="입력함 (intake)"
      icon={<Tray size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      topbarSearch={{ placeholder: '내용 검색 (소스/분류/매칭 결과)', value: search, onChange: setSearch }}
      topbarFilter={
        <>
          <FilterSelect
            value={sourceFilter}
            onChange={(v) => setSourceFilter(v as 'all' | IntakeSource)}
            dataW="md"
            title="소스"
            options={SOURCE_FILTERS.map((s) => ({
              value: s,
              label: s === 'all' ? '소스: 전체' : SOURCE_LABEL[s],
            }))}
          />
          <span className="filter-divider" />
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              className={`chip ${statusFilter === s ? 'active' : ''}`}
              onClick={() => setStatusFilter(s)}
              title={s === 'all' ? '전체 (committed/rejected 포함)' : s === 'active' ? '처리 진행중' : STATUS_LABEL[s as IntakeStatus]}
            >
              {s === 'all' ? '전체' : s === 'active' ? '진행중' : STATUS_LABEL[s as IntakeStatus]}
            </button>
          ))}
        </>
      }
      topbarRight={
        <span className="topbar-date">
          {loading ? '...' : `${filtered.length}건`}
        </span>
      }
      dashboardGrid="1fr 360px"
    >
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 130 }}>시각</th>
            <th style={{ width: 110 }}>소스</th>
            <th style={{ width: 80 }}>종류</th>
            <th style={{ width: 70 }}>신뢰도</th>
            <th style={{ width: 90 }}>매칭</th>
            <th style={{ width: 90 }}>상태</th>
            <th>요약</th>
            <th style={{ width: 60 }}>액션</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} className="center muted" style={{ padding: 24 }}>불러오는 중…</td></tr>
          ) : filtered.length === 0 ? (
            <tr><td colSpan={8} className="center muted" style={{ padding: 24 }}>표시할 intake 없음</td></tr>
          ) : filtered.map((item) => {
            const isActive = item.id === selectedId;
            const kind = effectiveKind(item);
            const conf = item.classify?.confidence;
            const matchConf = item.match?.confidence;
            const summary = (() => {
              if (item.raw.mode === 'file') return item.raw.file.name;
              if (item.raw.mode === 'row') return `${item.raw.sheetName ?? '시트'} · 1행`;
              if (item.raw.mode === 'manual') {
                const p = item.raw.payload;
                if (typeof p.itemCount === 'number') return `${p.itemCount}건`;
                if (typeof p.rowCount === 'number') return `${p.rowCount}행`;
                return JSON.stringify(p).slice(0, 60);
              }
              return '';
            })();
            return (
              <tr
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                style={{ cursor: 'pointer', background: isActive ? 'var(--brand-bg)' : undefined }}
              >
                <td className="mono">{fmtTime(item.createdAt)}</td>
                <td>{SOURCE_LABEL[item.source]}</td>
                <td>{KIND_LABEL[kind]}</td>
                <td className="num mono">
                  {conf !== undefined ? `${(conf * 100).toFixed(0)}%` : '-'}
                </td>
                <td>
                  {matchConf ? (
                    <span style={{
                      fontSize: 11,
                      color:
                        matchConf === 'high' ? 'var(--green-text)'
                        : matchConf === 'medium' ? 'var(--amber-text)'
                        : matchConf === 'low' ? 'var(--orange-text)'
                        : 'var(--text-weak)',
                    }}>
                      {matchConf}
                    </span>
                  ) : <span className="dim">-</span>}
                </td>
                <td>
                  <span
                    className="chip-count"
                    style={{
                      background: `var(--${STATUS_TONE[item.status]}-bg)`,
                      color: `var(--${STATUS_TONE[item.status]}-text)`,
                      padding: '2px 6px',
                    }}
                  >
                    {STATUS_LABEL[item.status]}
                  </span>
                </td>
                <td className="dim" style={{ fontSize: 11 }}>{summary}</td>
                <td className="center">
                  <button
                    type="button"
                    className="btn-icon"
                    title="삭제"
                    onClick={(e) => { e.stopPropagation(); void handleRemove(item.id); }}
                    style={{ color: 'var(--red-text)', fontSize: 10 }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* 우측 디테일 패널 */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>
        {!selected ? (
          <div className="muted center" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
            행 선택 시 상세 표시
          </div>
        ) : (
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
              <strong>intake/{selected.id.slice(-8)}</strong>
              <div className="dim mono" style={{ fontSize: 10, marginTop: 2 }}>{selected.id}</div>
            </div>
            <DetailRow label="소스">{SOURCE_LABEL[selected.source]}</DetailRow>
            <DetailRow label="생성">{fmtTime(selected.createdAt)}{selected.createdBy ? ` · ${selected.createdBy}` : ''}</DetailRow>
            <DetailRow label="상태">{STATUS_LABEL[selected.status]}</DetailRow>
            {selected.classify && (
              <>
                <DetailRow label="분류">{KIND_LABEL[selected.classify.kind]} · {(selected.classify.confidence * 100).toFixed(0)}%</DetailRow>
                <DetailRow label="분류근거" mono>{selected.classify.reason}</DetailRow>
              </>
            )}
            {selected.match && (
              <>
                <DetailRow label="매칭">{selected.match.confidence}</DetailRow>
                <DetailRow label="매칭근거" mono>{selected.match.reason}</DetailRow>
                {selected.match.contractId && (
                  <DetailRow label="계약" mono>{selected.match.contractId}</DetailRow>
                )}
              </>
            )}
            {selected.committed && selected.committed.length > 0 && (
              <DetailRow label="반영">
                {selected.committed.map((c, i) => (
                  <div key={i} className="mono" style={{ fontSize: 10 }}>{c.node} → {c.id}</div>
                ))}
              </DetailRow>
            )}
            {selected.rejectReason && (
              <DetailRow label="거부사유">{selected.rejectReason}</DetailRow>
            )}
            <div style={{ marginTop: 8 }}>
              <div className="dim" style={{ fontSize: 10, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ArrowsClockwise size={10} weight="bold" /> raw payload
              </div>
              <pre
                className="mono"
                style={{
                  fontSize: 10,
                  background: 'var(--bg-sunken)',
                  padding: 8,
                  borderRadius: 'var(--radius-sm)',
                  maxHeight: 240,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {JSON.stringify(selected.raw, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function DetailRow({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 8, alignItems: 'baseline' }}>
      <span className="dim" style={{ fontSize: 10 }}>{label}</span>
      <span className={mono ? 'mono' : undefined} style={{ fontSize: 11, wordBreak: 'break-all' }}>{children}</span>
    </div>
  );
}
