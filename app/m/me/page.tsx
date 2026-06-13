'use client';

/**
 * 모바일 설정 — 내 프로필, 알림, 디자인, 로그아웃, 데스크탑 모드.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/use-auth';
import { getAuth, signOut } from 'firebase/auth';
import { getFirebaseApp } from '@/lib/firebase/client';
import { User, Monitor, SignOut, Bell, Palette, ShareNetwork, Copy, Check } from '@phosphor-icons/react';
import { toast } from '@/lib/toast';

export default function MobileMe() {
  const { user } = useAuth();

  async function handleLogout() {
    if (!window.confirm('로그아웃하시겠습니까?')) return;
    const app = getFirebaseApp();
    if (!app) return;
    await signOut(getAuth(app));
    window.location.href = '/';
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px 0' }}>설정</h1>
      </header>

      {/* 프로필 카드 */}
      <section style={{
        padding: 16, background: 'var(--bg-card)',
        border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'var(--brand-bg)', color: 'var(--brand)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <User size={24} weight="duotone" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.displayName ?? user?.email?.split('@')[0] ?? '직원'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>{user?.email}</div>
        </div>
      </section>

      {/* 손님조회 링크 공유 — 카톡·문자로 손님에게 보낼 셀프 조회 URL */}
      <CustomerPortalShare />

      {/* 메뉴 */}
      <section style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-soft)',
        borderRadius: 'var(--radius-lg)', overflow: 'hidden',
      }}>
        <MenuItem icon={<Bell size={18} weight="duotone" />} label="알림" desc="푸시·진동·메시지 (Phase 2)" onClick={() => toast.info('Phase 2 — 푸시 알림 설정')} />
        <MenuItem icon={<Palette size={18} weight="duotone" />} label="디자인" desc="폰트·라운드·색상" href="/settings" />
        <MenuItem icon={<Monitor size={18} weight="duotone" />} label="데스크탑 모드" desc="데스크탑 ERP 화면으로" href="/" />
      </section>

      <button
        type="button"
        onClick={handleLogout}
        style={{
          padding: 14, background: 'var(--bg-card)',
          border: '1px solid var(--red-border, rgba(220,38,38,0.25))',
          borderRadius: 'var(--radius-lg)', color: 'var(--red-text)',
          fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <SignOut size={16} weight="bold" />
        로그아웃
      </button>

      <div style={{ fontSize: 10, color: 'var(--text-weak)', textAlign: 'center', marginTop: 8 }}>
        렌터카매니저 모바일 · v1.0 (beta)
      </div>
    </div>
  );
}

function CustomerPortalShare() {
  // 손님 셀프 조회 URL — 추후 별도 페이지 (/customer/{contractId} 등) 구축 시 동적 생성
  // 현재는 모바일 메인 URL 기준 (placeholder)
  const url = typeof window !== 'undefined' ? `${window.location.origin}/customer` : '';
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('링크 복사됨');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('복사 실패');
    }
  }

  async function handleShare() {
    if (!canShare) return;
    try {
      await navigator.share({
        title: '렌터카매니저 — 손님 조회',
        text: '내 계약 정보를 셀프로 확인하세요',
        url,
      });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast.error('공유 실패');
    }
  }

  return (
    <section style={{
      padding: 14, background: 'var(--bg-card)',
      border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>손님 조회 링크</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-weak)', marginTop: 2 }}>
          손님에게 카톡·문자로 보낼 셀프 조회 URL
        </div>
      </div>
      <div style={{
        padding: '8px 10px', background: 'var(--bg-sunken)',
        borderRadius: 'var(--radius-sm)', fontSize: 11, fontFamily: 'var(--font-mono)',
        color: 'var(--text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{url || '-'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: canShare ? '1fr 1fr' : '1fr', gap: 8 }}>
        <button type="button" onClick={handleCopy} style={{
          padding: '12px 8px', background: 'var(--bg-card)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          color: copied ? 'var(--green-text)' : 'var(--text-main)',
        }}>
          {copied ? <Check size={14} weight="bold" /> : <Copy size={14} weight="duotone" />}
          {copied ? '복사됨' : '복사하기'}
        </button>
        {canShare && (
          <button type="button" onClick={handleShare} style={{
            padding: '12px 8px', background: 'var(--brand)',
            border: 'none', borderRadius: 'var(--radius)',
            color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <ShareNetwork size={14} weight="bold" />
            공유하기
          </button>
        )}
      </div>
    </section>
  );
}

function MenuItem({ icon, label, desc, onClick, href }: { icon: React.ReactNode; label: string; desc: string; onClick?: () => void; href?: string }) {
  const base: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 14px', background: 'transparent',
    border: 'none', borderBottom: '1px solid var(--border-soft)',
    cursor: 'pointer', textAlign: 'left', width: '100%',
    fontFamily: 'inherit', textDecoration: 'none', color: 'inherit',
    touchAction: 'manipulation',
  };
  const content = (
    <>
      <div style={{ color: 'var(--brand)' }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-weak)' }}>{desc}</div>
      </div>
    </>
  );
  if (href) return <Link href={href} style={base}>{content}</Link>;
  return <button type="button" onClick={onClick} style={base}>{content}</button>;
}
