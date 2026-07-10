'use client';

/**
 * /notice — 공지사항.
 *
 *   누구나 작성 + 댓글. 작성자만 삭제.
 *   목록 (좌) + 본문·댓글 (우) 2 패널.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Megaphone, Plus, Trash, PaperPlaneTilt, ChatCircleDots } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { NewButton } from '@/components/ui/page-actions';
import { useAuth } from '@/lib/use-auth';
import { useRole } from '@/lib/use-role';
import {
  useNotices, createNotice, removeNotice, addComment, removeComment,
  type Notice, type NoticeComment,
} from '@/lib/firebase/notice-store';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';

function timeAgo(iso: string): string {
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

export default function NoticePage() {
  const router = useRouter();
  const { isMaster: master, loading: roleLoading } = useRole();
  useEffect(() => { if (!roleLoading && !master) router.replace('/'); }, [master, roleLoading, router]);

  const { user } = useAuth();
  const { notices, loading } = useNotices();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [commentBody, setCommentBody] = useState('');

  useEffect(() => {
    if (selectedId && notices.some((n) => n.id === selectedId)) return;
    setSelectedId(notices[0]?.id ?? null);
  }, [notices, selectedId]);

  const selected = useMemo(() => notices.find((n) => n.id === selectedId) ?? null, [notices, selectedId]);
  const comments = useMemo(() => {
    if (!selected?.comments) return [] as NoticeComment[];
    return Object.values(selected.comments).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  }, [selected]);

  async function handleCreate() {
    if (!title.trim() || !body.trim()) { toast.warning('제목·본문을 입력하세요'); return; }
    if (!user?.email) { toast.error('로그인 정보 없음'); return; }
    try {
      const id = await createNotice({
        title: title.trim(),
        body: body.trim(),
        createdBy: user.email,
        createdByName: user.displayName ?? undefined,
      });
      toast.success('공지 등록');
      setTitle(''); setBody('');
      setComposeOpen(false);
      setSelectedId(id);
    } catch (e) {
      toast.error(`등록 실패: ${(e as Error).message}`);
    }
  }

  async function handleRemoveNotice(n: Notice) {
    if (n.createdBy !== user?.email) { toast.warning('본인 작성건만 삭제 가능'); return; }
    if (!await showConfirm({ title: `"${n.title}" 공지를 삭제하시겠습니까?`, danger: true })) return;
    try {
      await removeNotice(n.id);
      toast.success('공지 삭제');
      if (selectedId === n.id) setSelectedId(null);
    } catch (e) {
      toast.error(`삭제 실패: ${(e as Error).message}`);
    }
  }

  async function handleAddComment() {
    if (!selected) return;
    if (!commentBody.trim()) return;
    if (!user?.email) { toast.error('로그인 정보 없음'); return; }
    try {
      await addComment(selected.id, {
        body: commentBody.trim(),
        createdBy: user.email,
        createdByName: user.displayName ?? undefined,
      });
      setCommentBody('');
    } catch (e) {
      toast.error(`댓글 실패: ${(e as Error).message}`);
    }
  }

  async function handleRemoveComment(c: NoticeComment) {
    if (!selected) return;
    if (c.createdBy !== user?.email) { toast.warning('본인 댓글만 삭제'); return; }
    try {
      await removeComment(selected.id, c.id);
    } catch (e) {
      toast.error(`삭제 실패: ${(e as Error).message}`);
    }
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <Megaphone size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>공지사항</span>
          </div>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: 'var(--text-weak)' }}>누구나 작성·댓글 가능 · 본인 작성건만 삭제</span>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 12, padding: 12, flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* 좌 — 목록 */}
          <div className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-sunken)', fontSize: 12, fontWeight: 700 }}>
              공지 ({notices.length})
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {loading ? (
                <div className="muted center" style={{ padding: 24, fontSize: 12 }}>불러오는 중…</div>
              ) : notices.length === 0 ? (
                <div className="muted center" style={{ padding: 24, fontSize: 12 }}>등록된 공지 없음 — 우측 하단 [+ 새 공지]</div>
              ) : notices.map((n) => {
                const isActive = selectedId === n.id;
                const cn = n.comments ? Object.keys(n.comments).length : 0;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setSelectedId(n.id)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '10px 12px',
                      background: isActive ? 'var(--brand-bg)' : 'var(--bg-card)',
                      color: isActive ? 'var(--brand)' : 'inherit',
                      border: 'none', borderBottom: '1px solid var(--border-soft)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.title}
                      </span>
                      {cn > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--text-sub)' }}>
                          <ChatCircleDots size={10} weight="duotone" /> {cn}
                        </span>
                      )}
                    </div>
                    <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
                      {n.createdByName ?? n.createdBy} · {timeAgo(n.createdAt)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 우 — 본문 + 댓글 */}
          <div className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {composeOpen ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, flex: 1, minHeight: 0, overflow: 'auto' }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>새 공지 작성</div>
                <input
                  className="input"
                  placeholder="제목"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{ width: '100%' }}
                />
                <textarea
                  className="input"
                  placeholder="본문 — 줄바꿈 그대로 표시됩니다"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  style={{ width: '100%', minHeight: 200, resize: 'vertical', whiteSpace: 'pre-wrap' }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" type="button" onClick={() => void handleCreate()}>
                    등록
                  </button>
                  <button className="btn" type="button" onClick={() => { setComposeOpen(false); setTitle(''); setBody(''); }}>
                    취소
                  </button>
                </div>
              </div>
            ) : !selected ? (
              <div className="muted center" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                좌측에서 공지 선택 또는 [+ 새 공지]
              </div>
            ) : (
              <>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <strong style={{ fontSize: 15 }}>{selected.title}</strong>
                    <span style={{ flex: 1 }} />
                    {selected.createdBy === user?.email && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ color: 'var(--red-text)' }}
                        onClick={() => void handleRemoveNotice(selected)}
                        title="공지 삭제"
                      >
                        <Trash size={11} weight="bold" /> 삭제
                      </button>
                    )}
                  </div>
                  <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>
                    {selected.createdByName ?? selected.createdBy} · {timeAgo(selected.createdAt)}
                  </div>
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6 }}>
                    {selected.body}
                  </div>
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                      댓글 ({comments.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {comments.length === 0 ? (
                        <div className="muted" style={{ fontSize: 11 }}>댓글 없음</div>
                      ) : comments.map((c) => (
                        <div key={c.id} style={{
                          padding: '8px 10px', background: 'var(--bg-sunken)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex', flexDirection: 'column', gap: 2,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                            <strong style={{ fontSize: 11 }}>{c.createdByName ?? c.createdBy}</strong>
                            <span className="dim" style={{ fontSize: 10 }}>{timeAgo(c.createdAt)}</span>
                            <span style={{ flex: 1 }} />
                            {c.createdBy === user?.email && (
                              <button
                                type="button"
                                onClick={() => void handleRemoveComment(c)}
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  fontSize: 10, color: 'var(--red-text)', padding: 0,
                                }}
                                title="댓글 삭제"
                              >삭제</button>
                            )}
                          </div>
                          <div style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{c.body}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', padding: 10, display: 'flex', gap: 6 }}>
                  <input
                    className="input"
                    placeholder="댓글 입력 (Enter 전송)"
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleAddComment(); } }}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-primary" type="button" onClick={() => void handleAddComment()} disabled={!commentBody.trim()}>
                    <PaperPlaneTilt size={12} weight="bold" /> 전송
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <BottomBar
          left={<NewButton label="공지 등록" onClick={() => { setComposeOpen(true); setSelectedId(null); }} />}
          right={null}
        />
      </div>
    </div>
  );
}
