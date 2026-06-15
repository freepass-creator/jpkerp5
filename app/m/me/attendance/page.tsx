'use client';

/**
 * 모바일 근태관리 — 본인 신청 이력.
 *
 * "새 신청" 은 /m/me/attendance/new 페이지로 이동 (모달 폐기).
 */

import Link from 'next/link';
import { Plus, Calendar, CheckCircle, XCircle, ClockCounterClockwise, X } from '@phosphor-icons/react';
import { useAuth } from '@/lib/use-auth';
import {
  useMyAttendanceRequests, updateAttendanceStatus,
  ATTENDANCE_LABEL, STATUS_LABEL, STATUS_TONE,
} from '@/lib/firebase/attendance-store';
import { toast } from '@/lib/toast';

export default function MobileAttendance() {
  const { user } = useAuth();
  const list = useMyAttendanceRequests(user?.uid);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={22} weight="regular" />
          근태관리
        </h1>
      </header>

      <Link href="/m/me/attendance/new" style={{
        height: 52, fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
        background: 'var(--brand)', color: '#fff', textDecoration: 'none',
        borderRadius: 'var(--radius-lg)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        <Plus size={18} weight="bold" />
        새 신청
      </Link>

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
      </div>
    </div>
  );
}

function RequestRow({ req }: { req: ReturnType<typeof useMyAttendanceRequests>[number] }) {
  const tone = STATUS_TONE[req.status];
  const toneClass = `badge-${tone}`;
  const canCancel = req.status === 'pending';

  async function handleCancel() {
    if (!window.confirm(`${ATTENDANCE_LABEL[req.type]} 신청을 취소하시겠습니까?`)) return;
    try {
      await updateAttendanceStatus(req.id, { status: 'cancelled' });
      toast.success('신청 취소됨');
    } catch (e) {
      toast.error(`취소 실패: ${(e as Error).message}`);
    }
  }

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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <div style={{ color: `var(--${tone === 'gray' ? 'text-weak' : tone + '-text'})` }}>
          {req.status === 'approved' ? <CheckCircle size={18} weight="duotone" />
           : req.status === 'rejected' ? <XCircle size={18} weight="duotone" />
           : req.status === 'cancelled' ? <X size={18} weight="duotone" />
           : <ClockCounterClockwise size={18} weight="duotone" />}
        </div>
        {canCancel && (
          <button type="button" onClick={handleCancel} style={{
            padding: '4px 10px', fontSize: 10.5, fontWeight: 600, fontFamily: 'inherit',
            background: 'var(--bg-card)', color: 'var(--text-sub)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            cursor: 'pointer', touchAction: 'manipulation',
          }}>취소</button>
        )}
      </div>
    </div>
  );
}
