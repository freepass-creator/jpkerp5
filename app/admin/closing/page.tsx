'use client';

/**
 * 회계기간 마감 — admin 전용.
 *
 * ERP #18: 마감된 월은 거래 등록/수정 불가. 정정은 신규 분개로.
 *
 *  · 월별 카드 (최근 24개월) — 열림/닫힘 상태 + closedAt/By 표시
 *  · master 만 마감/재오픈 토글
 *  · 재오픈은 사유 필수 (audit log 강제)
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, LockOpen, ArrowLeft, Warning } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { useAuth } from '@/lib/use-auth';
import { useRole } from '@/lib/use-role';
import { useClosedPeriods, closePeriod, reopenPeriod, isPeriodClosed } from '@/lib/firebase/closed-periods-store';
import { showConfirm, showPrompt } from '@/lib/confirm';
import { toast } from '@/lib/toast';

function monthsAgo(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export default function AdminClosingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { isRealMaster, loading: roleLoading } = useRole();
  useEffect(() => { if (!roleLoading && !isRealMaster) router.replace('/'); }, [isRealMaster, roleLoading, router]);

  const { closedPeriods, loading } = useClosedPeriods();
  const months = monthsAgo(24);
  const actor = user?.email ?? user?.uid ?? 'unknown';

  async function handleClose(yyyymm: string) {
    if (!await showConfirm({
      title: `${yyyymm}월 회계기간 마감`,
      description: '마감 후 그 달 거래는 등록·수정·삭제 불가합니다.\n정정 필요 시 신규 분개(전기오류수정)로 처리하세요.',
      confirmLabel: '마감', danger: true,
    })) return;
    try {
      await closePeriod(yyyymm, actor);
      toast.success(`${yyyymm}월 마감됨`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleReopen(yyyymm: string) {
    if (!await showConfirm({
      title: `${yyyymm}월 회계기간 재오픈`,
      description: '재오픈 사유는 audit log 에 영구 기록됩니다.',
      confirmLabel: '재오픈', danger: true,
    })) return;
    const reason = await showPrompt({ title: '재오픈 사유 (필수)', description: 'audit log 에 영구 기록됩니다.', placeholder: '사유 입력', multiline: true });
    if (!reason || !reason.trim()) { toast.info('사유 없음 — 취소'); return; }
    try {
      await reopenPeriod(yyyymm, actor, reason);
      toast.success(`${yyyymm}월 재오픈됨`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (roleLoading) return null;

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <Lock size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>회계기간 마감</span>
          </div>
        </header>

        <div className="dashboard">
          <div className="panel" style={{ marginBottom: 12 }}>
            <div style={{ padding: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
              <Link href="/admin" className="btn btn-sm"><ArrowLeft size={12} /> admin</Link>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>회계기간 마감 (ERP #18)</div>
                <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>
                  마감된 월은 입금·거래 등록·수정 불가. 정정은 신규 분개로.
                </div>
              </div>
            </div>
          </div>

          {loading && <div className="muted center" style={{ padding: 40 }}>로딩 중…</div>}

          <div className="panel">
            <div className="panel-body" style={{ padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {months.map((m) => {
                  const closed = isPeriodClosed(closedPeriods, m);
                  const entry = closedPeriods[m];
                  return (
                    <div key={m} style={{
                      padding: 12,
                      background: closed ? 'var(--red-bg, rgba(220,38,38,0.06))' : 'var(--bg-card)',
                      border: `1px solid ${closed ? 'var(--red-border, rgba(220,38,38,0.3))' : 'var(--border)'}`,
                      borderRadius: 'var(--radius)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        {closed ? <Lock size={12} weight="fill" style={{ color: 'var(--red-text)' }} />
                                : <LockOpen size={12} style={{ color: 'var(--text-sub)' }} />}
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{m}</span>
                      </div>
                      {closed ? (
                        <>
                          <div style={{ fontSize: 10, color: 'var(--text-sub)' }}>
                            마감 · {entry?.closedBy?.split('@')[0]}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-weak)' }}>
                            {entry?.closedAt ? new Date(entry.closedAt).toLocaleDateString('ko') : ''}
                          </div>
                          <button className="btn btn-sm" type="button" style={{ marginTop: 6, width: '100%' }}
                            onClick={() => void handleReopen(m)}>
                            <Warning size={11} /> 재오픈
                          </button>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 10, color: 'var(--text-weak)' }}>열림 (수정 가능)</div>
                          <button className="btn btn-sm" type="button" style={{ marginTop: 6, width: '100%' }}
                            onClick={() => void handleClose(m)}>
                            <Lock size={11} /> 마감
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
