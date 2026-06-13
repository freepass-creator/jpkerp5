'use client';

/**
 * 모바일 근태관리 — 휴가/반차/조퇴 신청 + 본인 신청 이력.
 *
 * 데이터: /attendance_requests (웹·모바일 공유 단일 노드).
 * 추후 전자결재 흐름:
 *  · 본인 신청 → status='pending'
 *  · 데스크탑 /attendance (다음 라운드) — 결재자 승인/반려
 *  · approvalChain[] — 다단계 결재 확장 대비
 */

import { useState } from 'react';
import Link from 'next/link';
import { CaretLeft, Plus, Calendar, CheckCircle, XCircle, ClockCounterClockwise, X } from '@phosphor-icons/react';
import { useAuth } from '@/lib/use-auth';
import {
  useMyAttendanceRequests, submitAttendanceRequest,
  ATTENDANCE_LABEL, STATUS_LABEL, STATUS_TONE,
  type AttendanceType,
} from '@/lib/firebase/attendance-store';
import { toast } from '@/lib/toast';

export default function MobileAttendance() {
  const { user } = useAuth();
  const list = useMyAttendanceRequests(user?.uid);
  const [newOpen, setNewOpen] = useState(false);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Link href="/m/me" style={{ color: 'var(--text-sub)', textDecoration: 'none', fontSize: 12 }}>
          <CaretLeft size={14} weight="bold" /> 설정
        </Link>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, flex: 1 }}>근태관리</h1>
      </header>

      <button type="button" onClick={() => setNewOpen(true)} style={{
        height: 52, fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
        background: 'var(--brand)', color: '#fff', border: 'none',
        borderRadius: 'var(--radius-lg)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        <Plus size={18} weight="bold" />
        새 신청
      </button>

      {/* 본인 신청 이력 */}
      <section style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-soft)',
        borderRadius: 'var(--radius-lg)', overflow: 'hidden',
      }}>
        <header style={{
          padding: '10px 14px', background: 'var(--bg-sunken)',
          borderBottom: '1px solid var(--border-soft)',
          fontSize: 11, fontWeight: 700, color: 'var(--text-sub)',
        }}>내 신청 ({list.length})</header>
        {list.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 12, color: 'var(--text-weak)' }}>
            신청 내역 없음
          </div>
        ) : (
          <div>
            {list.map((r) => <RequestRow key={r.id} req={r} />)}
          </div>
        )}
      </section>

      <div style={{ fontSize: 10.5, color: 'var(--text-weak)', lineHeight: 1.6 }}>
        신청 후 사무/관리자가 데스크탑에서 승인 → 알림으로 결과 받음 (Phase 2 푸시).
        추후 전자결재 시스템과 통합 예정.
      </div>

      {newOpen && <NewRequestModal onClose={() => setNewOpen(false)} />}
    </div>
  );
}

function RequestRow({ req }: { req: ReturnType<typeof useMyAttendanceRequests>[number] }) {
  const tone = STATUS_TONE[req.status];
  const toneClass = `badge-${tone}`;
  return (
    <div style={{
      padding: '12px 14px',
      borderBottom: '1px solid var(--border-soft)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{ATTENDANCE_LABEL[req.type]}</span>
          <span className={`badge-base ${toneClass}`} style={{ fontSize: 9 }}>{STATUS_LABEL[req.status]}</span>
        </div>
        <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-sub)' }}>
          {req.fromDate}{req.toDate && req.toDate !== req.fromDate ? ` ~ ${req.toDate}` : ''}
          {req.earlyLeaveAt && ` · ${req.earlyLeaveAt} 출발`}
        </div>
        {req.reason && (
          <div style={{ fontSize: 11, color: 'var(--text-weak)', marginTop: 4, lineHeight: 1.5 }}>
            {req.reason}
          </div>
        )}
        {req.status === 'rejected' && req.rejectionReason && (
          <div style={{ fontSize: 11, color: 'var(--red-text)', marginTop: 4 }}>
            반려 사유: {req.rejectionReason}
          </div>
        )}
        {req.status === 'approved' && req.approvedBy && (
          <div style={{ fontSize: 10.5, color: 'var(--green-text)', marginTop: 4 }}>
            {req.approvedBy} 승인
          </div>
        )}
      </div>
      <div style={{ color: `var(--${tone === 'gray' ? 'text-weak' : tone + '-text'})` }}>
        {req.status === 'approved' ? <CheckCircle size={18} weight="duotone" />
         : req.status === 'rejected' ? <XCircle size={18} weight="duotone" />
         : req.status === 'cancelled' ? <X size={18} weight="duotone" />
         : <ClockCounterClockwise size={18} weight="duotone" />}
      </div>
    </div>
  );
}

function NewRequestModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [type, setType] = useState<AttendanceType>('vacation');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [earlyLeaveAt, setEarlyLeaveAt] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const isRange = type === 'vacation' || type === 'sick';
  const isEarly = type === 'early-leave';

  async function handleSubmit() {
    if (!user?.uid || !fromDate.trim()) {
      toast.warning('날짜를 입력하세요');
      return;
    }
    setSaving(true);
    try {
      await submitAttendanceRequest({
        applicantUid: user.uid,
        applicantEmail: user.email ?? undefined,
        applicantName: user.displayName ?? undefined,
        type,
        fromDate,
        toDate: isRange ? (toDate.trim() || fromDate) : undefined,
        earlyLeaveAt: isEarly ? (earlyLeaveAt.trim() || undefined) : undefined,
        reason: reason.trim() || undefined,
      });
      toast.success('신청 완료 — 승인 대기');
      onClose();
    } catch (e) {
      toast.error(`신청 실패: ${(e as Error).message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const types: AttendanceType[] = ['vacation', 'half-day-am', 'half-day-pm', 'early-leave', 'sick', 'other'];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-card)', width: '100%', maxWidth: 560,
        borderTopLeftRadius: 'var(--radius-lg)', borderTopRightRadius: 'var(--radius-lg)',
        padding: 18, paddingBottom: 'calc(18px + env(safe-area-inset-bottom))',
        display: 'flex', flexDirection: 'column', gap: 14,
        maxHeight: '92vh', overflow: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>새 근태 신청</h2>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6 }} aria-label="닫기">
            <X size={20} weight="bold" />
          </button>
        </div>

        <Field label="종류">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {types.map((t) => (
              <button key={t} type="button" onClick={() => setType(t)} style={{
                padding: '6px 12px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                background: type === t ? 'var(--brand)' : 'var(--bg-card)',
                color: type === t ? '#fff' : 'var(--text-main)',
                border: `1px solid ${type === t ? 'var(--brand)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                cursor: 'pointer',
              }}>{ATTENDANCE_LABEL[t]}</button>
            ))}
          </div>
        </Field>

        <Field label={isRange ? '시작일' : '날짜'}>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            style={inputStyle()} />
        </Field>

        {isRange && (
          <Field label="종료일 (선택 — 동일 일자면 비워두기)">
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              min={fromDate} style={inputStyle()} />
          </Field>
        )}

        {isEarly && (
          <Field label="출발 시간">
            <input type="time" value={earlyLeaveAt} onChange={(e) => setEarlyLeaveAt(e.target.value)}
              style={inputStyle()} />
          </Field>
        )}

        <Field label="사유 (선택)">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="휴가·반차·조퇴 사유"
            style={{ ...inputStyle(), minHeight: 80, resize: 'vertical', lineHeight: 1.5 }} />
        </Field>

        <button type="button" onClick={handleSubmit} disabled={saving || !fromDate}
          style={{
            height: 50, fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
            background: 'var(--brand)', color: '#fff', border: 'none',
            borderRadius: 'var(--radius-lg)', cursor: saving ? 'wait' : 'pointer',
            opacity: !fromDate ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <Calendar size={16} weight="bold" />
          {saving ? '신청 중...' : '신청'}
        </button>
      </div>
    </div>
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
function inputStyle(): React.CSSProperties {
  return {
    padding: '10px 12px', fontSize: 14, fontFamily: 'inherit',
    background: 'var(--bg-card)', color: 'var(--text-main)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    outline: 'none', width: '100%',
  };
}
