'use client';

/**
 * /m/me/attendance/new — 모바일 근태 신청 폼 (풀스크린 페이지).
 *
 * 이전엔 모달이었는데 사용자 요청으로 별도 페이지로 분리.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar } from '@phosphor-icons/react';
import { MobileSaveFooter } from '@/components/mobile/save-footer';
import { useAuth } from '@/lib/use-auth';
import {
  submitAttendanceRequest, ATTENDANCE_LABEL,
  type AttendanceType,
} from '@/lib/firebase/attendance-store';
import { toast } from '@/lib/toast';

export default function NewAttendancePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [type, setType] = useState<AttendanceType>('vacation');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showRange, setShowRange] = useState(false);  // 기본 하루, 펼치면 종료일 입력
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
      router.replace('/m/me/attendance');
    } catch (e) {
      toast.error(`신청 실패: ${(e as Error).message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const types: AttendanceType[] = ['vacation', 'half-day-am', 'half-day-pm', 'early-leave', 'sick', 'other'];

  return (
    <div>
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--bg-card)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '12px 16px',
        borderTop: '3px solid var(--brand)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={20} weight="regular" />
          새 근태 신청
        </h1>
      </header>

      <div style={{ padding: 16, paddingBottom: 'calc(80px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="종류">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {types.map((t) => (
              <button key={t} type="button" onClick={() => setType(t)} style={{
                padding: '8px 14px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                background: type === t ? 'var(--brand)' : 'var(--bg-card)',
                color: type === t ? '#fff' : 'var(--text-main)',
                border: `1px solid ${type === t ? 'var(--brand)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                cursor: 'pointer',
              }}>{ATTENDANCE_LABEL[t]}</button>
            ))}
          </div>
        </Field>

        <Field label={isRange ? (showRange ? '시작일' : '날짜') : '날짜'}>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={inputStyle()} />
        </Field>

        {isRange && !showRange && (
          <button type="button" onClick={() => setShowRange(true)} style={{
            padding: '10px 14px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            background: 'var(--bg-card)', color: 'var(--brand)',
            border: '1px dashed var(--brand)', borderRadius: 'var(--radius)',
            cursor: 'pointer', textAlign: 'left',
          }}>
            + 하루 이상
          </button>
        )}

        {isRange && showRange && (
          <Field label="종료일">
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} min={fromDate} style={{ ...inputStyle(), flex: 1 }} />
              <button type="button" onClick={() => { setShowRange(false); setToDate(''); }} style={{
                padding: '0 12px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                background: 'var(--bg-card)', color: 'var(--text-sub)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                cursor: 'pointer',
              }}>하루</button>
            </div>
          </Field>
        )}

        {isEarly && (
          <Field label="출발 시간">
            <input type="time" value={earlyLeaveAt} onChange={(e) => setEarlyLeaveAt(e.target.value)} style={inputStyle()} />
          </Field>
        )}

        <Field label="사유 (선택)">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="휴가·반차·조퇴 사유"
            style={{ ...inputStyle(), minHeight: 100, resize: 'vertical', lineHeight: 1.5 }} />
        </Field>
      </div>

      <MobileSaveFooter
        prevLabel="취소"
        onPrev={() => router.back()}
        primaryLabel="신청"
        primaryBusyLabel="신청 중..."
        primaryBusy={saving}
        primaryDisabled={!fromDate}
        onPrimary={handleSubmit}
      />
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
    padding: '12px 14px', fontSize: 15, fontFamily: 'inherit',
    background: 'var(--bg-card)', color: 'var(--text-main)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    outline: 'none', width: '100%',
  };
}
