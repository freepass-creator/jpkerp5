'use client';

/**
 * 업무 요청 상세 다이얼로그 — 받은업무/요청업무 카드 항목 클릭 시 노출.
 *
 *  · 페이지 이동 없이 in-place 상세
 *  · 받은 본인 → [확인] [시작] [완료] 액션
 *  · 작성한 본인 → [취소] [삭제]
 */

import { useMemo, useState } from 'react';
import { Calendar, CheckCircle, Megaphone, Trash, PaperPlaneTilt, XCircle, Pulse, User, ChatCircleDots } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import {
  updateDispatchStatus, removeDispatchOrder, addDispatchComment, removeDispatchComment,
  DISPATCH_LABEL, DISPATCH_PRIORITY_LABEL,
  type DispatchOrder, type DispatchStatus, type DispatchComment,
} from '@/lib/firebase/dispatch-store';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';
import { useAuth, useUsers } from '@/lib/use-auth';
import { useContracts } from '@/lib/firebase/contracts-store';

const STATUS_LABEL: Record<DispatchStatus, string> = {
  pending: '대기 (미확인)',
  acknowledged: '확인됨',
  in_progress: '진행 중',
  done: '완료',
  cancelled: '취소됨',
};

const STATUS_TONE: Record<DispatchStatus, { bg: string; text: string }> = {
  pending:      { bg: 'var(--orange-bg)', text: 'var(--orange-text)' },
  acknowledged: { bg: 'var(--brand-bg)', text: 'var(--brand)' },
  in_progress:  { bg: 'var(--purple-bg, #f3e8ff)', text: 'var(--purple-text, #6b21a8)' },
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

export function DispatchDetailDialog({
  order, onClose,
}: {
  order: DispatchOrder | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const allUsers = useUsers();
  const { contracts } = useContracts();
  const myEmail = user?.email ?? '';
  const myUid = user?.uid ?? '';

  // ⚠️ 모든 hooks 는 early return 위에 — Hooks 규칙
  const [commentBody, setCommentBody] = useState('');
  const comments = useMemo<DispatchComment[]>(() => {
    if (!order?.comments) return [];
    return Object.values(order.comments).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  }, [order?.comments]);

  if (!order) return null;

  const isCreator = order.createdBy === myEmail;
  const uids = order.assignedToUids ?? (order.assignedToUid ? [order.assignedToUid] : []);
  const isReceiver = uids.includes(myUid) || (!order.assignedToUid && !order.assignedToUids && !order.assignedToTeams && !order.assignedToDivisions);

  // 이메일 → 이름 변환
  const nameByEmail = (email?: string): string => {
    if (!email) return '-';
    const u = allUsers.find((x) => x.email === email);
    return u?.displayName ?? email;
  };
  const creatorName = order.createdByName ?? nameByEmail(order.createdBy);

  // 받는 사람 표시
  const recipientLabel = (() => {
    if (uids.length === 0 && !order.assignedToTeams?.length && !order.assignedToDivisions?.length) return '전 직원 broadcast';
    const names: string[] = [];
    for (const uid of uids) {
      const u = allUsers.find((x) => x.uid === uid);
      names.push(u?.displayName ?? u?.email ?? uid);
    }
    if (order.assignedToTeams?.length) names.push(...order.assignedToTeams.map((t) => `${t} (팀)`));
    if (order.assignedToDivisions?.length) names.push(...order.assignedToDivisions.map((d) => `${d} 전체`));
    return names.join(', ');
  })();

  const linkedContract = order.contractId ? contracts.find((c) => c.id === order.contractId) : null;

  async function setStatus(s: DispatchStatus) {
    if (!order) return;
    const patch: Parameters<typeof updateDispatchStatus>[1] = { status: s };
    const now = new Date().toISOString();
    if (s === 'acknowledged') patch.acknowledgedAt = now;
    if (s === 'in_progress') patch.startedAt = now;
    if (s === 'done') patch.doneAt = now;
    try {
      await updateDispatchStatus(order.id, patch);
      toast.success(`${STATUS_LABEL[s]} 처리`);
      onClose();
    } catch (e) {
      toast.error(`처리 실패: ${(e as Error).message}`);
    }
  }

  const status = order.status;
  const tone = STATUS_TONE[status];

  return (
    <DialogRoot open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent title="업무 요청 상세" mode="view">
        <DialogBody style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 제목 + 상태 */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <strong style={{ fontSize: 16, flex: 1 }}>
              {order.priority === 'urgent' && <span style={{ color: 'var(--red-text)' }}>[긴급] </span>}
              {order.title}
            </strong>
            <span style={{
              padding: '3px 10px',
              borderRadius: 'var(--radius-sm)',
              background: tone.bg, color: tone.text,
              fontSize: 11, fontWeight: 700,
            }}>{STATUS_LABEL[status]}</span>
          </div>

          {/* 메타 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--text-sub)' }}>
            <span><User size={11} weight="duotone" /> 보낸 사람: <strong style={{ color: 'var(--text-main)' }}>{creatorName}</strong> · {timeAgo(order._meta?.at)}</span>
            {order.priority && order.priority !== 'today' && (
              <span><Pulse size={11} weight="duotone" /> 처리기한: <strong style={{ color: 'var(--text-main)' }}>{DISPATCH_PRIORITY_LABEL[order.priority]}</strong></span>
            )}
            {order.dueDate && (
              <span><Calendar size={11} weight="duotone" /> 마감: <strong className="mono" style={{ color: 'var(--text-main)' }}>{order.dueDate}</strong></span>
            )}
            <span><Megaphone size={11} weight="duotone" /> 종류: <strong style={{ color: 'var(--text-main)' }}>{DISPATCH_LABEL[order.kind]}</strong></span>
          </div>

          {/* 받는 사람 */}
          <div style={{ padding: '8px 12px', background: 'var(--bg-sunken)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
            <span className="dim">받는 사람</span> · <strong>{recipientLabel}</strong>
          </div>

          {/* 본문 */}
          {order.body && (
            <div style={{
              padding: '12px 14px', background: 'var(--bg-card)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
            }}>
              {order.body}
            </div>
          )}

          {/* 연결 계약 */}
          {linkedContract && (
            <div style={{ padding: '8px 12px', background: 'var(--brand-bg)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
              <span className="dim">연결 계약</span> · <strong className="mono">{linkedContract.vehiclePlate}</strong> {linkedContract.customerName}
            </div>
          )}

          {/* 진행 history */}
          {(order.acknowledgedAt || order.startedAt || order.doneAt) && (
            <div style={{ fontSize: 11, color: 'var(--text-sub)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {order.acknowledgedAt && <span>· 확인 {timeAgo(order.acknowledgedAt)}</span>}
              {order.startedAt && <span>· 시작 {timeAgo(order.startedAt)}</span>}
              {order.doneAt && <span>· 완료 {timeAgo(order.doneAt)}</span>}
            </div>
          )}

          {/* 답글·댓글 */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <ChatCircleDots size={12} weight="duotone" /> 답글 ({comments.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {comments.length === 0 ? (
                <div className="muted" style={{ fontSize: 11 }}>답글 없음</div>
              ) : comments.map((c) => (
                <div key={c.id} style={{
                  padding: '8px 10px', background: 'var(--bg-sunken)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <strong style={{ fontSize: 11 }}>{c.createdByName ?? nameByEmail(c.createdBy)}</strong>
                    <span className="dim" style={{ fontSize: 10 }}>{timeAgo(c.createdAt)}</span>
                    <span style={{ flex: 1 }} />
                    {c.createdBy === myEmail && (
                      <button
                        type="button"
                        onClick={() => {
                          void (async () => {
                            try {
                              await removeDispatchComment(order.id, c.id);
                            } catch (e) { toast.error(`삭제 실패: ${(e as Error).message}`); }
                          })();
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--red-text)', padding: 0 }}
                      >삭제</button>
                    )}
                  </div>
                  <div style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{c.body}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="input"
                placeholder="답글 / 메모 (Enter 전송)"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!commentBody.trim()) return;
                    void (async () => {
                      try {
                        await addDispatchComment(order.id, {
                          body: commentBody.trim(),
                          createdBy: myEmail,
                          createdByName: user?.displayName ?? undefined,
                        });
                        setCommentBody('');
                      } catch (err) { toast.error(`전송 실패: ${(err as Error).message}`); }
                    })();
                  }
                }}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={!commentBody.trim()}
                onClick={() => {
                  if (!commentBody.trim()) return;
                  void (async () => {
                    try {
                      await addDispatchComment(order.id, {
                        body: commentBody.trim(),
                        createdBy: myEmail,
                        createdByName: user?.displayName ?? undefined,
                      });
                      setCommentBody('');
                    } catch (err) { toast.error(`전송 실패: ${(err as Error).message}`); }
                  })();
                }}
              >
                <PaperPlaneTilt size={12} weight="bold" /> 전송
              </button>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <DialogClose className="btn">닫기</DialogClose>
          {/* 받는 사람 액션 */}
          {isReceiver && status === 'pending' && (
            <button type="button" className="btn btn-primary" onClick={() => void setStatus('acknowledged')}>
              <CheckCircle size={12} weight="bold" /> 확인
            </button>
          )}
          {isReceiver && status === 'acknowledged' && (
            <button type="button" className="btn" onClick={() => void setStatus('in_progress')}>
              <PaperPlaneTilt size={12} weight="bold" /> 시작
            </button>
          )}
          {isReceiver && (status === 'acknowledged' || status === 'in_progress') && (
            <button type="button" className="btn btn-primary" onClick={() => void setStatus('done')}>
              <CheckCircle size={12} weight="bold" /> 완료
            </button>
          )}
          {/* 작성자 액션 */}
          {isCreator && status !== 'done' && status !== 'cancelled' && (
            <button type="button" className="btn" style={{ color: 'var(--text-sub)' }} onClick={() => void setStatus('cancelled')}>
              <XCircle size={12} weight="bold" /> 취소
            </button>
          )}
          {isCreator && (
            <button type="button" className="btn" style={{ color: 'var(--red-text)' }} onClick={async () => {
              if (!await showConfirm({ title: '이 업무 요청을 삭제하시겠습니까?', danger: true })) return;
              void (async () => {
                try {
                  await removeDispatchOrder(order.id);
                  toast.success('삭제됨');
                  onClose();
                } catch (e) {
                  toast.error(`삭제 실패: ${(e as Error).message}`);
                }
              })();
            }}>
              <Trash size={12} weight="bold" /> 삭제
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
