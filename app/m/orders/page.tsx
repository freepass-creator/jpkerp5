'use client';

/**
 * 모바일 요청받은 업무 — 나에게 지정됐거나 전체 broadcast 된 dispatch_orders.
 *
 * 상태:
 *  · pending — 신규 (확인 필요)
 *  · acknowledged — 확인함
 *  · done — 완료
 *
 * 액션: 확인 / 완료
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Megaphone, CheckCircle, CaretRight, Eye, Plus, X, MagnifyingGlass,
} from '@phosphor-icons/react';
import { useAuth, useUsers } from '@/lib/use-auth';
import {
  useMyDispatchOrders, updateDispatchStatus, createDispatchOrder,
  DISPATCH_LABEL, DISPATCH_TONE,
  type DispatchOrder, type DispatchKind,
} from '@/lib/firebase/dispatch-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { toast } from '@/lib/toast';
import { MobileSaveFooter } from '@/components/mobile/save-footer';

type Filter = 'pending' | 'all';

export default function MobileOrders() {
  const { user } = useAuth();
  const orders = useMyDispatchOrders(user?.uid);
  const { contracts } = useContracts();
  const [filter, setFilter] = useState<Filter>('pending');
  const [newOpen, setNewOpen] = useState(false);

  const filtered = filter === 'pending'
    ? orders.filter((o) => o.status === 'pending')
    : orders;

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Megaphone size={22} weight="regular" />
          요청받은 업무
        </h1>
        <button type="button" onClick={() => setNewOpen(true)} style={{
          padding: '8px 14px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
          background: 'var(--brand)', color: '#fff',
          border: 'none', borderRadius: 'var(--radius)',
          display: 'flex', alignItems: 'center', gap: 4,
          cursor: 'pointer', touchAction: 'manipulation',
        }}>
          <Plus size={14} weight="bold" />
          새 요청
        </button>
      </header>

      <div style={{ display: 'flex', gap: 6 }}>
        <Chip active={filter === 'pending'} onClick={() => setFilter('pending')}>
          미확인 ({orders.filter((o) => o.status === 'pending').length})
        </Chip>
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
          전체 ({orders.length})
        </Chip>
      </div>

      {newOpen && <NewOrderModal onClose={() => setNewOpen(false)} creatorEmail={user?.email ?? undefined} />}

      {filtered.length === 0 ? (
        <div style={{
          padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--text-weak)',
          background: 'var(--bg-sunken)', borderRadius: 'var(--radius-lg)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        }}>
          <Megaphone size={32} weight="duotone" />
          {filter === 'pending' ? '미확인 요청 없음' : '받은 요청 없음'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((o) => (
            <OrderRow
              key={o.id}
              order={o}
              contract={o.contractId ? contracts.find((c) => c.id === o.contractId) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '6px 12px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
      background: active ? 'var(--brand)' : 'var(--bg-card)',
      color: active ? '#fff' : 'var(--text-sub)',
      border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
      borderRadius: 'var(--radius)', cursor: 'pointer',
    }}>{children}</button>
  );
}

function OrderRow({ order, contract }: { order: DispatchOrder; contract?: { vehiclePlate?: string; customerName?: string } }) {
  const tone = DISPATCH_TONE[order.kind];
  const isPending = order.status === 'pending';
  const isAck = order.status === 'acknowledged';

  async function acknowledge() {
    try {
      await updateDispatchStatus(order.id, { status: 'acknowledged', acknowledgedAt: new Date().toISOString() });
      toast.success('확인 처리');
    } catch (e) {
      toast.error(`실패: ${(e as Error).message}`);
    }
  }
  async function markDone() {
    try {
      await updateDispatchStatus(order.id, { status: 'done', doneAt: new Date().toISOString() });
      toast.success('완료 처리');
    } catch (e) {
      toast.error(`실패: ${(e as Error).message}`);
    }
  }

  return (
    <div style={{
      padding: 14, background: 'var(--bg-card)',
      border: `1px solid ${isPending ? 'var(--amber-text)' : 'var(--border-soft)'}`,
      borderLeft: `3px solid var(--${tone === 'brand' ? 'brand' : tone + '-text'})`,
      borderRadius: 'var(--radius-lg)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span className={`badge-base badge-${tone}`} style={{ fontSize: 10 }}>{DISPATCH_LABEL[order.kind]}</span>
        {isPending && <span className="badge-base badge-amber" style={{ fontSize: 10 }}>신규</span>}
        {isAck && <span className="badge-base badge-blue" style={{ fontSize: 10 }}>확인됨</span>}
        {order.status === 'done' && <span className="badge-base badge-green" style={{ fontSize: 10 }}>완료</span>}
        {order.dueDate && (
          <span style={{ fontSize: 10, color: 'var(--text-weak)', marginLeft: 'auto' }}>
            마감 <span className="mono">{order.dueDate}</span>
          </span>
        )}
      </div>

      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>{order.title}</div>

      {order.body && (
        <div style={{ fontSize: 12, color: 'var(--text-sub)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {order.body}
        </div>
      )}

      {contract && (
        <Link href={`/m/contract/${order.contractId}`} style={{
          fontSize: 11, color: 'var(--brand)', textDecoration: 'none',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <CaretRight size={11} weight="bold" />
          {contract.vehiclePlate} · {contract.customerName}
        </Link>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: 'var(--text-weak)' }}>
        <span>
          {order.createdBy ?? '?'} · {order._meta?.at?.slice(5, 16).replace('T', ' ')}
        </span>
      </div>

      {/* 액션 */}
      {(isPending || isAck) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {isPending && (
            <button type="button" onClick={acknowledge} style={{
              flex: 1, padding: '10px 12px',
              background: 'var(--bg-card)', color: 'var(--brand)',
              border: '1px solid var(--brand)', borderRadius: 'var(--radius)',
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
              <Eye size={13} weight="bold" /> 확인
            </button>
          )}
          <button type="button" onClick={markDone} style={{
            flex: 1, padding: '10px 12px',
            background: 'var(--green-text)', color: '#fff',
            border: 'none', borderRadius: 'var(--radius)',
            fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}>
            <CheckCircle size={13} weight="bold" /> 완료
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────── 새 요청 보내기 모달 ─────────── */

const KINDS: { key: DispatchKind; label: string }[] = [
  { key: 'memo',       label: '메모' },
  { key: 'inspection', label: '점검' },
  { key: 'delivery',   label: '인도' },
  { key: 'return',     label: '반납' },
  { key: 'other',      label: '기타' },
];

function NewOrderModal({ onClose, creatorEmail }: { onClose: () => void; creatorEmail?: string }) {
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
        paddingBottom: 'calc(76px + env(safe-area-inset-bottom))', // SaveFooter 공간
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
                <MagnifyingGlass size={14} weight="duotone" />
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
