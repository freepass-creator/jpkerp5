'use client';

/**
 * 디스패치 view — Sidebar/topbar 없는 main content만.
 *
 * 사용처:
 *   · /dispatch 페이지 (단독)
 *   · /general?view=dispatch (일반관리 통합)
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { onValue, ref } from 'firebase/database';
import { useAuth, useUsers, type UserProfile } from '@/lib/use-auth';
import { useContracts } from '@/lib/firebase/contracts-store';
import { getRtdb, dbPath, ensureAuth } from '@/lib/firebase/client';
import {
  createDispatchOrder,
  DISPATCH_LABEL,
  DISPATCH_PRIORITY_LABEL,
  type DispatchOrder, type DispatchKind, type DispatchStatus, type DispatchPriority,
} from '@/lib/firebase/dispatch-store';
import { ORGANIZATION, ALL_TEAMS, divisionOfTeam } from '@/lib/organization';
import { StatusBadge } from '@/components/ui/status-badge';
import { DialogRoot, DialogContent, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/lib/toast';
import {
  Megaphone, Plus, CheckCircle, Eye, X, MagnifyingGlass, ClockCounterClockwise,
} from '@phosphor-icons/react';

type StatusFilter = DispatchStatus | 'all';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'pending',      label: '받음' },
  { key: 'acknowledged', label: '확인' },
  { key: 'in_progress',  label: '진행중' },
  { key: 'done',         label: '완료' },
  { key: 'cancelled',    label: '취소' },
  { key: 'all',          label: '전체' },
];

const KINDS: { key: DispatchKind; label: string }[] = [
  { key: 'memo',       label: '메모' },
  { key: 'inspection', label: '점검' },
  { key: 'delivery',   label: '인도' },
  { key: 'return',     label: '반납' },
  { key: 'other',      label: '기타' },
];

const STATUS_TONE: Record<DispatchStatus, 'orange' | 'blue' | 'amber' | 'green' | 'gray'> = {
  pending:      'orange',
  acknowledged: 'blue',
  in_progress:  'amber',
  done:         'green',
  cancelled:    'gray',
};

const STATUS_LABEL: Record<DispatchStatus, string> = {
  pending:      '받음',
  acknowledged: '확인',
  in_progress:  '진행중',
  done:         '완료',
  cancelled:    '취소',
};

export function DispatchView() {
  const { user } = useAuth();
  const [list, setList] = useState<DispatchOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [kindFilter, setKindFilter] = useState<DispatchKind | 'all'>('all');
  const [q, setQ] = useState('');
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try { await ensureAuth(); } catch { /* silent */ }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) return;
      unsub = onValue(ref(db, dbPath('dispatch_orders')), (snap) => {
        const val = (snap.val() ?? {}) as Record<string, DispatchOrder>;
        const arr = Object.values(val).sort((a, b) => (b._meta?.at ?? '').localeCompare(a._meta?.at ?? ''));
        setList(arr);
      });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return list.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (kindFilter !== 'all' && o.kind !== kindFilter) return false;
      if (query) {
        const hay = `${o.title ?? ''}${o.body ?? ''}${o.assignedToName ?? ''}${o.createdBy ?? ''}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [list, statusFilter, kindFilter, q]);

  const counts = useMemo(() => {
    const c: Record<DispatchStatus, number> = { pending: 0, acknowledged: 0, in_progress: 0, done: 0, cancelled: 0 };
    for (const o of list) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [list]);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
        <div className="page-header-title-group">
          <h1 className="page-header-title">
            <Megaphone size={18} weight="duotone" />
디스패치 (업무 요청)
          </h1>
          <div className="page-header-title-sub">
            현장 직원에게 업무 요청 보내기 + 처리 현황 모니터링. 모바일 /m/orders 에서 받음.
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setNewOpen(true)} style={{ height: 36 }}>
          <Plus size={14} weight="bold" /> 새 요청 보내기
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, flexShrink: 0 }}>
        <KpiCard label="미확인" value={counts.pending} tone="orange" icon={<ClockCounterClockwise size={20} weight="duotone" />} />
        <KpiCard label="확인됨" value={counts.acknowledged} tone="blue" icon={<Eye size={20} weight="duotone" />} />
        <KpiCard label="완료" value={counts.done} tone="green" icon={<CheckCircle size={20} weight="duotone" />} />
        <KpiCard label="취소" value={counts.cancelled} tone="gray" icon={<X size={20} weight="duotone" />} />
      </div>

      <section className="detail-section" style={{ flexShrink: 0 }}>
        <div className="detail-section-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {STATUS_FILTERS.map((f) => (
              <button key={f.key} className={`chip ${statusFilter === f.key ? 'active' : ''}`}
                onClick={() => setStatusFilter(f.key)}>{f.label}</button>
            ))}
          </div>
          <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={`chip ${kindFilter === 'all' ? 'active' : ''}`} onClick={() => setKindFilter('all')}>전체 종류</button>
            {KINDS.map((k) => (
              <button key={k.key} className={`chip ${kindFilter === k.key ? 'active' : ''}`}
                onClick={() => setKindFilter(k.key)}>{k.label}</button>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          <div style={{ position: 'relative' }}>
            <MagnifyingGlass size={14} weight="bold" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-weak)' }} />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="제목 / 본문 / 수신자"
              className="input" style={{ width: 260, paddingLeft: 30 }}
            />
          </div>
        </div>
      </section>

      <section className="detail-section" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="detail-section-header" style={{ flexShrink: 0 }}>
          <span className="title">요청 ({filtered.length})</span>
        </div>
        <div className="detail-section-body" style={{ padding: 0, flex: 1, minHeight: 0, overflow: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>상태</th>
                <th style={{ width: 70 }}>종류</th>
                <th>제목</th>
                <th style={{ width: 150 }}>수신자</th>
                <th style={{ width: 100 }}>마감</th>
                <th style={{ width: 140 }}>작성자/시간</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-weak)' }}>
                  해당 조건의 요청 없음
                </td></tr>
              )}
              {filtered.map((o) => (
                <tr key={o.id}>
                  <td><StatusBadge tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</StatusBadge></td>
                  <td>{DISPATCH_LABEL[o.kind]}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{o.title}</div>
                    {o.body && (
                      <div style={{ fontSize: 11, color: 'var(--text-weak)', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.body}
                      </div>
                    )}
                    {o.contractId && (
                      <Link href={`/contract/${o.contractId}`} style={{ fontSize: 10.5, color: 'var(--brand)', textDecoration: 'none' }}>
                        연결 계약 →
                      </Link>
                    )}
                  </td>
                  <td>
                    {o.assignedToName ? (
                      <span style={{ fontSize: 12 }}>{o.assignedToName}</span>
                    ) : (
                      <span style={{ fontSize: 11, padding: '1px 6px', background: 'var(--amber-bg)', color: 'var(--amber-text)', borderRadius: 'var(--radius-sm)' }}>전체 공지</span>
                    )}
                  </td>
                  <td className="mono" style={{ fontSize: 11 }}>{o.dueDate ?? '-'}</td>
                  <td className="mono dim" style={{ fontSize: 11 }}>
                    <div>{o.createdBy ?? '-'}</div>
                    <div style={{ color: 'var(--text-weak)' }}>{o._meta?.at?.slice(5, 16).replace('T', ' ') ?? '-'}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {newOpen && <NewOrderDialog onClose={() => setNewOpen(false)} creatorEmail={user?.email ?? undefined} />}
    </div>
  );
}

function KpiCard({ label, value, tone, icon }: { label: string; value: number; tone: 'orange' | 'blue' | 'green' | 'gray'; icon: React.ReactNode }) {
  const tones = {
    orange: { bg: 'var(--orange-bg)', fg: 'var(--orange-text)' },
    blue:   { bg: 'var(--blue-bg)',   fg: 'var(--blue-text)' },
    green:  { bg: 'var(--green-bg)',  fg: 'var(--green-text)' },
    gray:   { bg: 'var(--bg-sunken)', fg: 'var(--text-sub)' },
  } as const;
  const c = tones[tone];
  return (
    <div style={{
      padding: 14, background: c.bg, color: c.fg, borderRadius: 'var(--radius-lg)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      </div>
      {icon}
    </div>
  );
}

export function NewOrderDialog({ onClose, creatorEmail }: { onClose: () => void; creatorEmail?: string }) {
  const users = useUsers();
  const { contracts } = useContracts();
  const [recipientMode, setRecipientMode] = useState<'team' | 'person'>('person');
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const toggle = (arr: string[], v: string): string[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  const [kind, setKind] = useState<DispatchKind>('memo');
  const [priority, setPriority] = useState<DispatchPriority>('today');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [contractQ, setContractQ] = useState('');
  const [contractId, setContractId] = useState('');
  const [saving, setSaving] = useState(false);

  const contractMatches = useMemo(() => {
    const query = contractQ.trim().toLowerCase().replace(/[^\w가-힣]/g, '');
    if (!query) return [];
    return contracts
      .filter((c) => `${c.vehiclePlate ?? ''}${c.customerName ?? ''}`
        .toLowerCase().replace(/[^\w가-힣]/g, '').includes(query))
      .slice(0, 8);
  }, [contracts, contractQ]);
  const selectedContract = contractId ? contracts.find((c) => c.id === contractId) : null;

  async function handleSubmit() {
    if (!title.trim()) { toast.warning('제목을 입력하세요'); return; }
    setSaving(true);
    try {
      const payload: Parameters<typeof createDispatchOrder>[0] = {
        title: title.trim(),
        body: body.trim() || undefined,
        kind,
        priority,
        dueDate: dueDate || undefined,
        contractId: contractId || undefined,
        createdBy: creatorEmail,
      };
      // 현재 mode 의 선택만 전송 (다른 mode 선택은 무시)
      if (recipientMode === 'person' && selectedUids.length > 0) {
        payload.assignedToUids = selectedUids;
        if (selectedUids.length === 1) {
          payload.assignedToUid = selectedUids[0];
          const target: UserProfile | undefined = users.find((u) => u.uid === selectedUids[0]);
          payload.assignedToName = target?.displayName ?? target?.email;
        }
      } else if (recipientMode === 'team') {
        if (selectedTeams.length > 0) payload.assignedToTeams = selectedTeams;
        if (selectedDivisions.length > 0) payload.assignedToDivisions = selectedDivisions;
      }
      // 선택 없음 → broadcast
      await createDispatchOrder(payload);
      toast.success('요청 전송 완료');
      onClose();
    } catch (e) {
      toast.error(`전송 실패: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogRoot open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent title="새 요청 보내기" mode="new">
        <DialogBody style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="받는 곳">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* mode toggle */}
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  className={`chip ${recipientMode === 'person' ? 'active' : ''}`}
                  onClick={() => setRecipientMode('person')}
                >
                  개인
                </button>
                <button
                  type="button"
                  className={`chip ${recipientMode === 'team' ? 'active' : ''}`}
                  onClick={() => setRecipientMode('team')}
                >
                  팀
                </button>
              </div>
              {/* mode 별 buttons */}
              {recipientMode === 'person' && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {users.length === 0 ? (
                    <span className="dim" style={{ fontSize: 11 }}>등록된 직원 없음</span>
                  ) : users.map((u) => (
                    <button
                      key={u.uid}
                      type="button"
                      className={`chip ${selectedUids.includes(u.uid) ? 'active' : ''}`}
                      onClick={() => setSelectedUids((prev) => toggle(prev, u.uid))}
                      title={u.department ? `${u.department}` : undefined}
                    >
                      {u.displayName ?? u.email}
                    </button>
                  ))}
                </div>
              )}
              {recipientMode === 'team' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ORGANIZATION.map((div) => (
                    <div key={div.name} style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        type="button"
                        className={`chip ${selectedDivisions.includes(div.name) ? 'active' : ''}`}
                        onClick={() => setSelectedDivisions((prev) => toggle(prev, div.name))}
                        title={`${div.name} 산하 전체 (${div.teams.join('·')})`}
                      >
                        {div.name} 전체
                      </button>
                      <span className="dim" style={{ fontSize: 11 }}>·</span>
                      {div.teams.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`chip ${selectedTeams.includes(t) ? 'active' : ''}`}
                          onClick={() => setSelectedTeams((prev) => toggle(prev, t))}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {/* 요약 */}
              <div className="dim" style={{ fontSize: 11, padding: '4px 0 0', borderTop: '1px dashed var(--border)' }}>
                {(recipientMode === 'person' ? selectedUids.length : selectedTeams.length + selectedDivisions.length) === 0 ? (
                  <span style={{ color: 'var(--orange-text)' }}>선택 없음 → 전 직원 broadcast</span>
                ) : recipientMode === 'person' ? (
                  <>선택된 직원 <strong>{selectedUids.length}</strong>명</>
                ) : (
                  <>
                    {selectedDivisions.length > 0 && <>부 <strong>{selectedDivisions.length}</strong></>}
                    {selectedDivisions.length > 0 && selectedTeams.length > 0 && <> · </>}
                    {selectedTeams.length > 0 && <>팀 <strong>{selectedTeams.length}</strong></>}
                  </>
                )}
              </div>
            </div>
          </Field>
          <Field label="처리기한">
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {(['urgent', 'today', 'thisWeek', 'thisMonth'] as DispatchPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`chip ${priority === p ? 'active' : ''} ${p === 'urgent' ? 'chip-tone-red' : p === 'thisMonth' ? 'chip-tone-gray' : ''}`}
                  onClick={() => setPriority(p)}
                >
                  {DISPATCH_PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </Field>
          <Field label="제목 *">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="간단한 제목" className="input" style={{ width: '100%' }} />
          </Field>
          <Field label="본문 (선택)">
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="상세 내용"
              className="input" style={{ width: '100%', minHeight: 80, resize: 'vertical' }} />
          </Field>
          <Field label="마감일 (선택)">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" style={{ width: 200 }} />
          </Field>
          <Field label="연결 계약 (선택)">
            {selectedContract ? (
              <div style={{
                padding: '8px 12px', background: 'var(--brand-bg)',
                border: '1px solid var(--brand)', borderRadius: 'var(--radius)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>{selectedContract.vehiclePlate}</strong>
                  <span style={{ fontSize: 12 }}>{selectedContract.customerName}</span>
                </div>
                <button type="button" onClick={() => { setContractId(''); setContractQ(''); }} style={{
                  background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-sub)', padding: 4,
                }}>해제</button>
              </div>
            ) : (
              <>
                <input value={contractQ} onChange={(e) => setContractQ(e.target.value)}
                  placeholder="차량번호 또는 고객명" className="input" style={{ width: '100%' }} />
                {contractMatches.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                    {contractMatches.map((c) => (
                      <button key={c.id} type="button" onClick={() => { setContractId(c.id); setContractQ(''); }} style={{
                        padding: '8px 10px', background: 'var(--bg-sunken)',
                        border: '1px solid var(--border-soft)', borderRadius: 'var(--radius)',
                        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                      }}>
                        <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.vehiclePlate}</span>
                        {' '}<span style={{ fontSize: 11, color: 'var(--text-sub)' }}>{c.customerName}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </Field>
        </DialogBody>
        <DialogFooter>
          <button type="button" className="btn" onClick={onClose}>취소</button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={!title.trim() || saving}>
            {saving ? '전송 중...' : '요청 보내기'}
          </button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-sub)' }}>{label}</div>
      {children}
    </div>
  );
}
