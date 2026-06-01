'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, ArrowLeft, ArrowClockwise, Warning, ShieldStar, Envelope, Clock, UserCircle, Pause, Play, Key, Trash, ArrowUp, ArrowDown, Crown } from '@phosphor-icons/react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { StatusBadge } from '@/components/ui/status-badge';
import { useAuth } from '@/lib/use-auth';
import { useRole } from '@/lib/use-role';
import { getFirebaseAuth } from '@/lib/firebase/client';

type UserRow = {
  uid: string;
  email: string;
  displayName: string;
  createdAt: string;
  lastSignInAt: string;
  disabled: boolean;
  provider: string;
  role: 'master' | 'admin' | 'staff';
};

function fmtKDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function daysAgo(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  if (isNaN(d)) return '';
  const days = Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
  if (days === 0) return '오늘';
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const { isMaster, isAdmin: viewerAdmin } = useRole();
  const admin = viewerAdmin;
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? '조회 실패');
      setUsers(data.users);
    } catch (e) {
      setErr((e as Error).message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  const [busyUid, setBusyUid] = useState<string | null>(null);

  const toggleDisabled = useCallback(async (u: UserRow) => {
    if (!user) return;
    if (u.uid === user.uid) { alert('자기 자신은 비활성화할 수 없습니다.'); return; }
    const next = !u.disabled;
    if (!confirm(`${u.email} 계정을 ${next ? '비활성화' : '활성화'} 할까요?`)) return;
    setBusyUid(u.uid);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/users/${u.uid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ disabled: next }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await load();
    } catch (e) {
      alert('실패: ' + ((e as Error).message ?? String(e)));
    } finally {
      setBusyUid(null);
    }
  }, [user, load]);

  const sendReset = useCallback(async (u: UserRow) => {
    if (!u.email) { alert('이메일 없음'); return; }
    if (!confirm(`${u.email} 으로 비밀번호 재설정 메일을 보낼까요?`)) return;
    setBusyUid(u.uid);
    try {
      const auth = getFirebaseAuth();
      if (!auth) throw new Error('Firebase 미설정');
      await sendPasswordResetEmail(auth, u.email);
      alert(`재설정 메일을 ${u.email} 으로 발송했습니다.`);
    } catch (e) {
      alert('발송 실패: ' + ((e as Error).message ?? String(e)));
    } finally {
      setBusyUid(null);
    }
  }, []);

  const toggleRole = useCallback(async (u: UserRow) => {
    if (!user || !isMaster) return;
    if (u.role === 'master') { alert('마스터 권한은 코드(SUPER_ADMIN_EMAILS) 변경 후에 가능합니다.'); return; }
    const next: 'admin' | 'staff' = u.role === 'admin' ? 'staff' : 'admin';
    if (!confirm(`${u.email} 의 권한을 ${next === 'admin' ? '관리자' : '일반 직원'} 으로 변경할까요?`)) return;
    setBusyUid(u.uid);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/users/${u.uid}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: next }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await load();
    } catch (e) {
      alert('권한 변경 실패: ' + ((e as Error).message ?? String(e)));
    } finally {
      setBusyUid(null);
    }
  }, [user, isMaster, load]);

  const deleteUser = useCallback(async (u: UserRow) => {
    if (!user) return;
    if (u.uid === user.uid) { alert('자기 자신은 삭제할 수 없습니다.'); return; }
    if (!confirm(`${u.email} 계정을 영구 삭제할까요?\n복구 불가능합니다.`)) return;
    setBusyUid(u.uid);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/users/${u.uid}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await load();
    } catch (e) {
      alert('삭제 실패: ' + ((e as Error).message ?? String(e)));
    } finally {
      setBusyUid(null);
    }
  }, [user, load]);

  useEffect(() => {
    if (admin && user) void load();
  }, [admin, user, load]);

  if (!admin) {
    return (
      <div className="layout">
        <Sidebar />
        <div className="app">
          <header className="topbar">
            <div className="topbar-title">
              <Users size={16} weight="fill" style={{ color: 'var(--brand)' }} />
              <span>계정 관리</span>
            </div>
          </header>
          <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
            <div className="notice notice--error">
              <Warning size={14} weight="fill" style={{ marginRight: 6, verticalAlign: 'middle' }} />
              관리자만 접근 가능합니다.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <Users size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>계정 관리</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn" type="button" onClick={() => void load()} disabled={loading}>
              <ArrowClockwise size={13} weight="bold" /> 새로고침
            </button>
          </div>
        </header>

        <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <header className="page-header">
            <div className="page-header-title-group">
              <h1 className="page-header-title">
                <Users size={18} weight="duotone" />
                계정 관리
                {users.length > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-weak)', marginLeft: 8 }}>
                    총 {users.length}명
                  </span>
                )}
              </h1>
              <div className="page-header-title-sub">
                Firebase Auth 에 등록된 전체 직원 계정 — 가입일 / 마지막 로그인 / 권한 표시
              </div>
            </div>
            <div className="page-header-actions">
              <Link href="/admin/dev-tools" className="btn">
                <ArrowLeft size={13} /> 개발도구
              </Link>
            </div>
          </header>

          {err && (
            <div className="notice notice--error">
              <Warning size={14} weight="fill" style={{ marginRight: 6, verticalAlign: 'middle' }} />
              {err}
            </div>
          )}

          {loading && users.length === 0 && (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-weak)', fontSize: 13 }}>
              불러오는 중…
            </div>
          )}

          {!loading && users.length === 0 && !err && (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-weak)', fontSize: 13 }}>
              가입된 계정이 없습니다.
            </div>
          )}

          {users.length > 0 && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-soft)', color: 'var(--text-weak)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
                      <UserCircle size={11} weight="bold" style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      이름 / 이메일
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid var(--border)', width: 80 }}>
                      권한
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid var(--border)', width: 100 }}>
                      방식
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)', width: 180 }}>
                      <Clock size={11} weight="bold" style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      가입일
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)', width: 180 }}>
                      마지막 로그인
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid var(--border)', width: 70 }}>
                      상태
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid var(--border)', width: 130 }}>
                      관리
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const userAdmin = u.role === 'master' || u.role === 'admin';
                    return (
                      <tr key={u.uid} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                            {u.displayName || <span style={{ color: 'var(--text-weak)', fontWeight: 400 }}>(이름 없음)</span>}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-weak)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Envelope size={10} weight="bold" />
                            {u.email}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {u.role === 'master' && (
                              <StatusBadge tone="red" icon={<Crown size={10} weight="fill" />}>마스터</StatusBadge>
                            )}
                            {u.role === 'admin' && (
                              <StatusBadge tone="brand" icon={<ShieldStar size={10} weight="fill" />}>관리자</StatusBadge>
                            )}
                            {u.role === 'staff' && (
                              <span style={{ fontSize: 11, color: 'var(--text-weak)' }}>일반</span>
                            )}
                            {/* 마스터만 권한 토글 가능 (마스터 본인은 코드 박힘) */}
                            {isMaster && u.role !== 'master' && u.uid !== user?.uid && (
                              <button
                                type="button"
                                className="btn"
                                style={{ padding: '2px 6px', fontSize: 9, minHeight: 0 }}
                                onClick={() => void toggleRole(u)}
                                disabled={busyUid === u.uid}
                                title={u.role === 'admin' ? '일반 직원으로 강등' : '관리자로 승급'}
                              >
                                {u.role === 'admin' ? <ArrowDown size={9} weight="bold" /> : <ArrowUp size={9} weight="bold" />}
                              </button>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, color: 'var(--text-weak)' }}>
                          {u.provider === 'password' ? '이메일' : u.provider}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-main)' }}>
                          {fmtKDateTime(u.createdAt)}
                          <div style={{ fontSize: 10, color: 'var(--text-weak)' }}>{daysAgo(u.createdAt)}</div>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-main)' }}>
                          {u.lastSignInAt ? (
                            <>
                              {fmtKDateTime(u.lastSignInAt)}
                              <div style={{ fontSize: 10, color: 'var(--text-weak)' }}>{daysAgo(u.lastSignInAt)}</div>
                            </>
                          ) : (
                            <span style={{ color: 'var(--text-weak)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          {u.disabled ? (
                            <StatusBadge tone="red">비활성</StatusBadge>
                          ) : (
                            <StatusBadge tone="green">활성</StatusBadge>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: 4 }}>
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '4px 8px', fontSize: 10, minHeight: 0 }}
                              onClick={() => void toggleDisabled(u)}
                              disabled={busyUid === u.uid || u.uid === user?.uid}
                              title={u.disabled ? '활성화' : '비활성화'}
                            >
                              {u.disabled ? <Play size={11} weight="fill" /> : <Pause size={11} weight="fill" />}
                            </button>
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '4px 8px', fontSize: 10, minHeight: 0 }}
                              onClick={() => void sendReset(u)}
                              disabled={busyUid === u.uid}
                              title="비밀번호 재설정 메일 발송"
                            >
                              <Key size={11} weight="bold" />
                            </button>
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '4px 8px', fontSize: 10, minHeight: 0, color: 'var(--red-text)' }}
                              onClick={() => void deleteUser(u)}
                              disabled={busyUid === u.uid || u.uid === user?.uid || userAdmin}
                              title={userAdmin ? '관리자는 코드(ADMIN_EMAILS) 변경 후 삭제' : '계정 삭제'}
                            >
                              <Trash size={11} weight="bold" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
