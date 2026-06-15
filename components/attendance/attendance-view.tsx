'use client';

/**
 * 근태 결재 view — Sidebar/topbar 없는 main content만.
 *
 * 사용처:
 *   · /attendance 페이지 (단독)
 *   · /general?view=attendance (일반관리 통합)
 */

import { useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { useAuth } from '@/lib/use-auth';
import { getRtdb, dbPath, ensureAuth } from '@/lib/firebase/client';
import {
  updateAttendanceStatus,
  ATTENDANCE_LABEL, STATUS_LABEL, STATUS_TONE,
  type AttendanceRequest, type AttendanceStatus, type AttendanceType,
} from '@/lib/firebase/attendance-store';
import { StatusBadge } from '@/components/ui/status-badge';
import { toast } from '@/lib/toast';
import { Calendar, CheckCircle, XCircle, ClockCounterClockwise, FunnelSimple } from '@phosphor-icons/react';

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'all';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'pending',   label: '대기' },
  { key: 'approved',  label: '승인' },
  { key: 'rejected',  label: '반려' },
  { key: 'cancelled', label: '취소' },
  { key: 'all',       label: '전체' },
];

export function AttendanceView() {
  const { user } = useAuth();
  const [list, setList] = useState<AttendanceRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [typeFilter, setTypeFilter] = useState<AttendanceType | 'all'>('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<AttendanceRequest | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try { await ensureAuth(); } catch { /* silent */ }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) return;
      unsub = onValue(ref(db, dbPath('attendance_requests')), (snap) => {
        const val = (snap.val() ?? {}) as Record<string, AttendanceRequest>;
        const arr = Object.values(val);
        arr.sort((a, b) => (b.fromDate ?? '').localeCompare(a.fromDate ?? ''));
        setList(arr);
      });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return list.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (query) {
        const hay = `${r.applicantName ?? ''}${r.applicantEmail ?? ''}${r.reason ?? ''}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [list, statusFilter, typeFilter, q]);

  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = { pending: 0, approved: 0, rejected: 0, cancelled: 0 };
    for (const r of list) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [list]);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
      <header className="page-header" style={{ flexShrink: 0 }}>
        <div className="page-header-title-group">
          <h1 className="page-header-title">
            <Calendar size={18} weight="duotone" />
            근태 결재
          </h1>
          <div className="page-header-title-sub">
            직원 모바일 신청 → 사무 승인·반려. 추후 다단계 전자결재 확장.
          </div>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, flexShrink: 0 }}>
        <KpiCard label="대기" value={counts.pending} tone="orange" icon={<ClockCounterClockwise size={20} weight="duotone" />} />
        <KpiCard label="승인" value={counts.approved} tone="green" icon={<CheckCircle size={20} weight="duotone" />} />
        <KpiCard label="반려" value={counts.rejected} tone="red" icon={<XCircle size={20} weight="duotone" />} />
        <KpiCard label="취소" value={counts.cancelled} tone="gray" icon={<ClockCounterClockwise size={20} weight="duotone" />} />
      </div>

      <section className="detail-section" style={{ flexShrink: 0 }}>
        <div className="detail-section-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <FunnelSimple size={14} weight="duotone" style={{ color: 'var(--text-sub)' }} />
          <div style={{ display: 'flex', gap: 4 }}>
            {STATUS_FILTERS.map((f) => (
              <button key={f.key} className={`chip ${statusFilter === f.key ? 'active' : ''}`}
                onClick={() => setStatusFilter(f.key)}>{f.label}</button>
            ))}
          </div>
          <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={`chip ${typeFilter === 'all' ? 'active' : ''}`} onClick={() => setTypeFilter('all')}>전체 종류</button>
            {(Object.keys(ATTENDANCE_LABEL) as AttendanceType[]).map((t) => (
              <button key={t} className={`chip ${typeFilter === t ? 'active' : ''}`}
                onClick={() => setTypeFilter(t)}>{ATTENDANCE_LABEL[t]}</button>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="신청자 / 이메일 / 사유" className="input" style={{ width: 240 }} />
        </div>
      </section>

      <section className="detail-section" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="detail-section-header" style={{ flexShrink: 0 }}>
          <span className="title">신청 ({filtered.length})</span>
        </div>
        <div className="detail-section-body" style={{ padding: 0, flex: 1, minHeight: 0, overflow: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>상태</th>
                <th style={{ width: 120 }}>종류</th>
                <th>신청자</th>
                <th style={{ width: 180 }}>일자</th>
                <th>사유</th>
                <th style={{ width: 130 }}>신청일</th>
                <th style={{ width: 200 }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-weak)' }}>
                  해당 조건의 신청 없음
                </td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} onClick={() => setSelected(r)} style={{ cursor: 'pointer' }}>
                  <td><StatusBadge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusBadge></td>
                  <td>{ATTENDANCE_LABEL[r.type]}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.applicantName ?? r.applicantEmail ?? '?'}</div>
                    {r.applicantName && r.applicantEmail && (
                      <div style={{ fontSize: 10, color: 'var(--text-weak)' }}>{r.applicantEmail}</div>
                    )}
                  </td>
                  <td className="mono">
                    {r.fromDate}{r.toDate && r.toDate !== r.fromDate ? ` ~ ${r.toDate}` : ''}
                    {r.earlyLeaveAt && (
                      <span style={{ marginLeft: 6, color: 'var(--text-sub)', fontSize: 11 }}>· {r.earlyLeaveAt} 출발</span>
                    )}
                  </td>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5 }}>
                    {r.reason ?? <span className="muted">-</span>}
                  </td>
                  <td className="mono dim" style={{ fontSize: 11 }}>
                    {r._meta?.at?.slice(5, 16).replace('T', ' ') ?? '-'}
                    {r._meta?.source === 'mobile' && (
                      <span style={{ marginLeft: 4, padding: '1px 5px', background: 'var(--blue-bg)', color: 'var(--blue-text)', fontSize: 9, borderRadius: 'var(--radius-sm)' }}>모바일</span>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {r.status === 'pending' ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <ApproveBtn r={r} approverEmail={user?.email ?? undefined} />
                        <RejectBtn r={r} />
                      </div>
                    ) : (
                      <span className="muted" style={{ fontSize: 11 }}>
                        {r.approvedBy ? `${r.approvedBy}` : '-'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected && <DetailDialog req={selected} onClose={() => setSelected(null)} approverEmail={user?.email ?? undefined} />}
    </div>
  );
}

function KpiCard({ label, value, tone, icon }: { label: string; value: number; tone: 'orange' | 'green' | 'red' | 'gray'; icon: React.ReactNode }) {
  const tones = {
    orange: { bg: 'var(--orange-bg)', fg: 'var(--orange-text)' },
    green:  { bg: 'var(--green-bg)',  fg: 'var(--green-text)' },
    red:    { bg: 'var(--red-bg)',    fg: 'var(--red-text)' },
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

function ApproveBtn({ r, approverEmail }: { r: AttendanceRequest; approverEmail?: string }) {
  async function handle() {
    if (!window.confirm(`${r.applicantName ?? r.applicantEmail}의 ${ATTENDANCE_LABEL[r.type]} 승인하시겠습니까?`)) return;
    try {
      await updateAttendanceStatus(r.id, { status: 'approved', approvedBy: approverEmail });
      toast.success('승인 완료');
    } catch (e) { toast.error(`실패: ${(e as Error).message}`); }
  }
  return (
    <button className="btn btn-sm" onClick={handle} style={{ background: 'var(--green-text)', color: '#fff', borderColor: 'var(--green-text)' }}>
      <CheckCircle size={11} weight="bold" /> 승인
    </button>
  );
}

function RejectBtn({ r }: { r: AttendanceRequest }) {
  async function handle() {
    const reason = window.prompt(`${r.applicantName ?? r.applicantEmail}의 ${ATTENDANCE_LABEL[r.type]} 반려 사유:`);
    if (!reason) return;
    try {
      await updateAttendanceStatus(r.id, { status: 'rejected', rejectionReason: reason });
      toast.success('반려 처리');
    } catch (e) { toast.error(`실패: ${(e as Error).message}`); }
  }
  return (
    <button className="btn btn-sm" onClick={handle}>
      <XCircle size={11} weight="bold" /> 반려
    </button>
  );
}

function DetailDialog({ req, onClose, approverEmail }: { req: AttendanceRequest; onClose: () => void; approverEmail?: string }) {
  async function approve() {
    try {
      await updateAttendanceStatus(req.id, { status: 'approved', approvedBy: approverEmail });
      toast.success('승인 완료'); onClose();
    } catch (e) { toast.error(`실패: ${(e as Error).message}`); }
  }
  async function reject() {
    const reason = window.prompt('반려 사유:');
    if (!reason) return;
    try {
      await updateAttendanceStatus(req.id, { status: 'rejected', rejectionReason: reason });
      toast.success('반려 처리'); onClose();
    } catch (e) { toast.error(`실패: ${(e as Error).message}`); }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
        width: '90%', maxWidth: 560, padding: 24,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>근태 신청 상세</h2>
          <StatusBadge tone={STATUS_TONE[req.status]}>{STATUS_LABEL[req.status]}</StatusBadge>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 12px', fontSize: 13 }}>
          <Field label="신청자" value={`${req.applicantName ?? '-'} (${req.applicantEmail ?? '-'})`} />
          <Field label="종류" value={ATTENDANCE_LABEL[req.type]} />
          <Field label="일자" value={`${req.fromDate}${req.toDate && req.toDate !== req.fromDate ? ` ~ ${req.toDate}` : ''}${req.earlyLeaveAt ? ` · ${req.earlyLeaveAt} 출발` : ''}`} mono />
          <Field label="사유" value={req.reason || '-'} multi />
          <Field label="신청일" value={req._meta?.at ?? '-'} mono />
          <Field label="출처" value={req._meta?.source ?? '-'} />
          {req.approvedBy && <Field label="처리자" value={req.approvedBy} />}
          {req.rejectionReason && <Field label="반려 사유" value={req.rejectionReason} danger />}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {req.status === 'pending' ? (
            <>
              <button className="btn" onClick={approve} style={{ background: 'var(--green-text)', color: '#fff', borderColor: 'var(--green-text)', flex: 1 }}>
                <CheckCircle size={14} weight="bold" /> 승인
              </button>
              <button className="btn" onClick={reject} style={{ flex: 1 }}>
                <XCircle size={14} weight="bold" /> 반려
              </button>
            </>
          ) : (
            <button className="btn" onClick={onClose} style={{ flex: 1 }}>닫기</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono, multi, danger }: { label: string; value: string; mono?: boolean; multi?: boolean; danger?: boolean }) {
  return (
    <>
      <div style={{ color: 'var(--text-sub)', fontSize: 11 }}>{label}</div>
      <div style={{
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        color: danger ? 'var(--red-text)' : 'var(--text-main)',
        whiteSpace: multi ? 'pre-wrap' : 'normal',
        lineHeight: 1.5,
      }}>{value}</div>
    </>
  );
}
