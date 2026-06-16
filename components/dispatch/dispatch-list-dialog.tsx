'use client';

/**
 * 업무 요청 목록 다이얼로그 — 받은/요청 카드 헤더 클릭 시 또는 어디서나 호출.
 *
 *   페이지 이동 X — 글로벌 모달.
 *   상태 필터 (진행중/완료/전체) + 항목 클릭 → DispatchDetailDialog 열림 (내부 상태 관리).
 */

import { useMemo, useState } from 'react';
import { Megaphone, PaperPlaneTilt } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import {
  DISPATCH_LABEL, DISPATCH_PRIORITY_LABEL,
  type DispatchOrder, type DispatchStatus,
} from '@/lib/firebase/dispatch-store';
import { useAuth, useUsers } from '@/lib/use-auth';
import { DispatchDetailDialog } from './dispatch-detail-dialog';

const STATUS_LABEL: Record<DispatchStatus, string> = {
  pending: '미확인',
  acknowledged: '확인',
  in_progress: '진행중',
  done: '완료',
  cancelled: '취소',
};

const STATUS_TONE: Record<DispatchStatus, { bg: string; text: string }> = {
  pending:      { bg: 'var(--orange-bg)', text: 'var(--orange-text)' },
  acknowledged: { bg: 'var(--brand-bg)', text: 'var(--brand)' },
  in_progress:  { bg: '#f3e8ff', text: '#6b21a8' },
  done:         { bg: 'var(--green-bg)', text: 'var(--green-text)' },
  cancelled:    { bg: 'var(--bg-sunken)', text: 'var(--text-sub)' },
};

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return iso.slice(0, 10);
}

export type DispatchListKind = 'incoming' | 'outgoing';

export function DispatchListDialog({
  kind, orders, onClose,
}: {
  kind: DispatchListKind;
  orders: DispatchOrder[];
  onClose: () => void;
}) {
  const { user } = useAuth();
  const allUsers = useUsers();
  const [filter, setFilter] = useState<'active' | 'done' | 'all'>('active');
  const [detailId, setDetailId] = useState<string | null>(null);

  const nameByEmail = (email?: string): string => {
    if (!email) return '-';
    const u = allUsers.find((x) => x.email === email);
    return u?.displayName ?? email;
  };

  const filtered = useMemo(() => {
    return orders
      .filter((o) => {
        if (filter === 'active') return o.status !== 'done' && o.status !== 'cancelled';
        if (filter === 'done') return o.status === 'done' || o.status === 'cancelled';
        return true;
      })
      .sort((a, b) => (b._meta?.at ?? '').localeCompare(a._meta?.at ?? ''));
  }, [orders, filter]);

  const counts = useMemo(() => {
    let active = 0, done = 0;
    for (const o of orders) {
      if (o.status === 'done' || o.status === 'cancelled') done++;
      else active++;
    }
    return { active, done, all: orders.length };
  }, [orders]);

  const detailOrder = detailId ? orders.find((o) => o.id === detailId) ?? null : null;

  return (
    <>
      <DialogRoot open onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {kind === 'incoming' ? <><Megaphone size={14} weight="duotone" /> 받은 업무</> : <><PaperPlaneTilt size={14} weight="duotone" /> 요청 업무</>}
            </span> as unknown as string
          }
          mode="view"
        >
          <DialogBody style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '70vh' }}>
            {/* 상태 필터 */}
            <div style={{ display: 'flex', gap: 4 }}>
              {(['active', 'done', 'all'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`chip ${filter === k ? 'active' : ''}`}
                  onClick={() => setFilter(k)}
                >
                  {k === 'active' ? `진행중 ${counts.active}` : k === 'done' ? `완료 ${counts.done}` : `전체 ${counts.all}`}
                </button>
              ))}
            </div>
            {/* 목록 */}
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtered.length === 0 ? (
                <div className="muted center" style={{ padding: 32, fontSize: 12 }}>
                  해당 조건의 업무 없음
                </div>
              ) : filtered.map((o) => {
                const tone = STATUS_TONE[o.status];
                const counter = kind === 'incoming'
                  ? `보낸 사람: ${o.createdByName ?? nameByEmail(o.createdBy)}`
                  : `받는 사람: ${o.assignedToName ?? '여러 명/전체'}`;
                const dim = o.status === 'done' || o.status === 'cancelled';
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setDetailId(o.id)}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 2,
                      padding: '8px 10px', textAlign: 'left',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-soft)',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      opacity: dim ? 0.6 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.priority === 'urgent' && <span style={{ color: 'var(--red-text)' }}>[긴급] </span>}
                        {o.title}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        padding: '1px 6px', borderRadius: 'var(--radius-sm)',
                        background: tone.bg, color: tone.text,
                      }}>{STATUS_LABEL[o.status]}</span>
                    </div>
                    <div className="dim" style={{ fontSize: 11, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span>{counter}</span>
                      {o.priority && o.priority !== 'today' && <span>· {DISPATCH_PRIORITY_LABEL[o.priority]}</span>}
                      <span style={{ marginLeft: 'auto' }}>{timeAgo(o._meta?.at)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose className="btn">닫기</DialogClose>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>

      {detailOrder && (
        <DispatchDetailDialog order={detailOrder} onClose={() => setDetailId(null)} />
      )}
    </>
  );
}
