'use client';

/**
 * /m/orders/* 받은·보낸 페이지 공용 컴포넌트.
 *
 *  · OrderRow — 카드 행 (받은 = 3단계 액션, 보낸 = 모니터링)
 *  · NewOrderModal — 새 요청 보내기 (보낸 전용)
 *  · STATUS_LABEL / STATUS_TONE_MAP — 공용 상태 표시
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle, CaretRight, Eye, X, MagnifyingGlass, Play,
} from '@phosphor-icons/react';
import { useUsers } from '@/lib/use-auth';
import {
  updateDispatchStatus, createDispatchOrder,
  DISPATCH_LABEL, DISPATCH_TONE,
  type DispatchOrder, type DispatchKind, type DispatchStatus,
} from '@/lib/firebase/dispatch-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { toast } from '@/lib/toast';
import { MobileSaveFooter } from '@/components/mobile/save-footer';

export const STATUS_LABEL: Record<DispatchStatus, string> = {
  pending:      '받음',
  acknowledged: '확인',
  in_progress:  '진행중',
  done:         '완료',
  cancelled:    '취소',
};

export const STATUS_TONE_MAP: Record<DispatchStatus, 'orange' | 'blue' | 'amber' | 'green' | 'gray'> = {
  pending:      'orange',
  acknowledged: 'blue',
  in_progress:  'amber',
  done:         'green',
  cancelled:    'gray',
};

export function OrderRow({ order: o, mode, contract }: {
  order: DispatchOrder;
  mode: 'received' | 'sent';
  contract?: { vehiclePlate?: string; customerName?: string };
}) {
  const tone = DISPATCH_TONE[o.kind];
  const statusTone = STATUS_TONE_MAP[o.status];
  const isReceived = mode === 'received';

  async function transition(next: DispatchStatus) {
    try {
      const patch: { status: DispatchStatus; acknowledgedAt?: string; startedAt?: string; doneAt?: string } = { status: next };
      const now = new Date().toISOString();
      if (next === 'acknowledged') patch.acknowledgedAt = now;
      if (next === 'in_progress') patch.startedAt = now;
      if (next === 'done') patch.doneAt = now;
      await updateDispatchStatus(o.id, patch);
      toast.success(`${STATUS_LABEL[next]} 처리`);
    } catch (e) {
      toast.error(`실패: ${(e as Error).message}`);
    }
  }

  return (
    <div style={{
      padding: 14, background: 'var(--bg-card)',
      border: `1px solid ${o.status === 'pending' && isReceived ? 'var(--amber-text)' : 'var(--border-soft)'}`,
      borderLeft: `3px solid var(--${tone === 'brand' ? 'brand' : tone + '-text'})`,
      borderRadius: 'var(--radius-lg)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span className={`badge-base badge-${tone}`} style={{ fontSize: 10 }}>{DISPATCH_LABEL[o.kind]}</span>
        <span className={`badge-base badge-${statusTone}`} style={{ fontSize: 10 }}>{STATUS_LABEL[o.status]}</span>
        {o.dueDate && (
          <span style={{ fontSize: 10, color: 'var(--text-weak)', marginLeft: 'auto' }}>
            마감 <span className="mono">{o.dueDate}</span>
          </span>
        )}
      </div>

      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>{o.title}</div>

      {o.body && (
        <div style={{ fontSize: 12, color: 'var(--text-sub)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {o.body}
        </div>
      )}

      {contract && o.contractId && (
        <Link href={`/m/contract/${o.contractId}`} style={{
          fontSize: 11, color: 'var(--brand)', textDecoration: 'none',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <CaretRight size={11} weight="bold" />
          {contract.vehiclePlate} · {contract.customerName}
        </Link>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: 'var(--text-weak)' }}>
        <span>
          {isReceived ? '보낸이' : '받는이'}: {isReceived ? (o.createdBy ?? '?') : (o.assignedToName ?? '전체 공지')}
        </span>
        <span>{o._meta?.at?.slice(5, 16).replace('T', ' ')}</span>
      </div>

      {isReceived && o.status !== 'done' && o.status !== 'cancelled' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {o.status === 'pending' && (
            <StageBtn onClick={() => transition('acknowledged')} tone="blue" icon={<Eye size={13} weight="bold" />} label="확인" />
          )}
          {(o.status === 'pending' || o.status === 'acknowledged') && (
            <StageBtn onClick={() => transition('in_progress')} tone="amber" icon={<Play size={13} weight="bold" />} label="진행중" />
          )}
          <StageBtn onClick={() => transition('done')} tone="green" icon={<CheckCircle size={13} weight="bold" />} label="완료" />
        </div>
      )}
    </div>
  );
}

function StageBtn({ onClick, tone, icon, label }: {
  onClick: () => void;
  tone: 'blue' | 'amber' | 'green';
  icon: React.ReactNode;
  label: string;
}) {
  const colors = {
    blue:  { bg: 'var(--bg-card)', fg: 'var(--blue-text)',  border: 'var(--blue-text)' },
    amber: { bg: 'var(--bg-card)', fg: 'var(--amber-text)', border: 'var(--amber-text)' },
    green: { bg: 'var(--green-text)', fg: '#fff', border: 'var(--green-text)' },
  } as const;
  const c = colors[tone];
  return (
    <button type="button" onClick={onClick} style={{
      flex: 1, padding: '10px 12px',
      background: c.bg, color: c.fg,
      border: `1px solid ${c.border}`, borderRadius: 'var(--radius)',
      fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
    }}>
      {icon} {label}
    </button>
  );
}

const KINDS: { key: DispatchKind; label: string }[] = [
  { key: 'memo',       label: '메모' },
  { key: 'inspection', label: '점검' },
  { key: 'delivery',   label: '인도' },
  { key: 'return',     label: '반납' },
  { key: 'other',      label: '기타' },
];

export function NewOrderModal({ onClose, creatorEmail }: { onClose: () => void; creatorEmail?: string }) {
  const users = useUsers();
  const { contracts } = useContracts();
  const [assignedToUid, setAssignedToUid] = useState<string>('');
  const [kind, setKind] = useState<DispatchKind>('memo');
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
      .slice(0, 5);
  }, [contracts, contractQ]);
  const selectedContract = contractId ? contracts.find((c) => c.id === contractId) : null;

  async function handleSubmit() {
    if (!title.trim()) {
      toast.warning('제목을 입력하세요');
      return;
    }
    setSaving(true);
    try {
      const target = users.find((u) => u.uid === assignedToUid);
      await createDispatchOrder({
        assignedToUid: assignedToUid || undefined,
        assignedToName: target?.displayName ?? target?.email,
        title: title.trim(),
        body: body.trim() || undefined,
        kind,
        dueDate: dueDate || undefined,
        contractId: contractId || undefined,
        createdBy: creatorEmail,
      });
      toast.success('요청 전송 완료');
      onClose();
    } catch (e) {
      toast.error(`전송 실패: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-card)', width: '100%', maxWidth: 560,
        borderTopLeftRadius: 'var(--radius-lg)', borderTopRightRadius: 'var(--radius-lg)',
        padding: 18,
        paddingBottom: 'calc(76px + env(safe-area-inset-bottom))',
        display: 'flex', flexDirection: 'column', gap: 12,
        maxHeight: '92vh', overflow: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>새 요청 보내기</h2>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6 }} aria-label="닫기">
            <X size={20} weight="bold" />
          </button>
        </div>

        <Field label="받을 사람 (비우면 전체 공지)">
          <select value={assignedToUid} onChange={(e) => setAssignedToUid(e.target.value)} style={inputStyle()}>
            <option value="">전체 공지</option>
            {users.map((u) => (
              <option key={u.uid} value={u.uid}>
                {u.displayName ?? u.email}{u.department ? ` (${u.department})` : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label="종류">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {KINDS.map((k) => (
              <button key={k.key} type="button" onClick={() => setKind(k.key)} style={{
                padding: '6px 12px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                background: kind === k.key ? 'var(--brand)' : 'var(--bg-card)',
                color: kind === k.key ? '#fff' : 'var(--text-main)',
                border: `1px solid ${kind === k.key ? 'var(--brand)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)', cursor: 'pointer',
              }}>{k.label}</button>
            ))}
          </div>
        </Field>

        <Field label="제목 *">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="간단한 제목" style={inputStyle()} />
        </Field>

        <Field label="본문 (선택)">
          <textarea value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="상세 내용"
            style={{ ...inputStyle(), minHeight: 80, resize: 'vertical', lineHeight: 1.5 }} />
        </Field>

        <Field label="마감일 (선택)">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
            style={inputStyle()} />
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
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', background: 'var(--bg-card)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              }}>
                <MagnifyingGlass size={14} weight="bold" />
                <input
                  value={contractQ} onChange={(e) => setContractQ(e.target.value)}
                  placeholder="차량번호 또는 고객명"
                  style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, fontFamily: 'inherit' }}
                />
              </div>
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
      </div>

      <MobileSaveFooter
        prevLabel="취소"
        onPrev={onClose}
        primaryLabel="요청 보내기"
        primaryBusyLabel="전송 중..."
        primaryBusy={saving}
        primaryDisabled={!title.trim()}
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
    padding: '10px 12px', fontSize: 14, fontFamily: 'inherit',
    background: 'var(--bg-card)', color: 'var(--text-main)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    outline: 'none', width: '100%',
  };
}
