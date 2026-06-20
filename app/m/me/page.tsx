'use client';

/**
 * 모바일 설정 — 모바일에 정말 필요한 것만.
 *  · 프로필
 *  · 화면 (테마/라운드/폰트 — 컴팩트 3종, 디테일한 건 데스크탑 /settings)
 *  · 손님조회 링크 공유 (Web Share + Clipboard)
 *  · 근태관리 (휴가/반차/조퇴 신청)
 *  · 알림 토글 (localStorage, FCM 추후)
 *  · 데스크탑 모드 link
 *  · 로그아웃
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/use-auth';
import { useRole } from '@/lib/use-role';
import { useSettings, type Theme, type Radius } from '@/lib/use-settings';
import { getAuth, signOut } from 'firebase/auth';
import { getFirebaseApp } from '@/lib/firebase/client';
import {
  User, SignOut, Bell, BellSlash, ShareNetwork, Copy, Check,
  Calendar, Sun, Moon, CircleHalf, Tray,
} from '@phosphor-icons/react';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';
import { APP_VERSION } from '@/lib/version';

const NOTI_KEY = 'jpkerp5:mobile:notifications';

export default function MobileMe() {
  const { user } = useAuth();
  const { isRealMaster } = useRole();

  async function handleLogout() {
    if (!await showConfirm({ title: '로그아웃하시겠습니까?' })) return;
    const app = getFirebaseApp();
    if (!app) return;
    await signOut(getAuth(app));
    window.location.href = '/';
  }

  return (
    <div>
      <div style={{ height: 3, background: 'var(--text-sub)' }} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 프로필 */}
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

      {/* 화면 — 컴팩트 (테마·라운드·폰트). 더 디테일한 건 /settings */}
      <DisplaySettings />

      {/* 손님조회 링크 */}
      <CustomerPortalShare />

      {/* 근태 + 알림 + 데스크탑 모드 */}
      <section style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-soft)',
        borderRadius: 'var(--radius-lg)', overflow: 'hidden',
      }}>
        <MenuItem
          icon={<Calendar size={18} weight="duotone" />}
          label="근태관리"
          desc="휴가·반차·조퇴 신청"
          href="/m/me/attendance"
        />
        {isRealMaster && (
          <MenuItem
            icon={<Tray size={18} weight="duotone" />}
            label="입력함 (intake)"
            desc="모든 입력 audit · 분류·매칭 결과 · 수동 보정"
            href="/inbox"
          />
        )}
        <NotificationToggle />
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
        렌터카매니저 모바일 · v{APP_VERSION}
      </div>
      </div>
    </div>
  );
}

/* ─────────── 화면 설정 — 컴팩트 (테마·라운드·폰트) ─────────── */

function DisplaySettings() {
  const { settings, update } = useSettings();

  const themes: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: '라이트', icon: <Sun size={14} weight="duotone" /> },
    { value: 'dark',  label: '다크',   icon: <Moon size={14} weight="duotone" /> },
    { value: 'auto',  label: '자동',   icon: <CircleHalf size={14} weight="duotone" /> },
  ];
  const radii: { value: Radius; label: string }[] = [
    { value: 'square',  label: '각지게' },
    { value: 'soft',    label: '약간' },
    { value: 'rounded', label: '둥글게' },
  ];

  return (
    <section style={{
      padding: 14, background: 'var(--bg-card)',
      border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>화면</div>

      {/* 테마 */}
      <SettingRow label="테마">
        <ChipRow>
          {themes.map((t) => (
            <Chip key={t.value} active={settings.theme === t.value} onClick={() => update({ theme: t.value })}>
              {t.icon}{t.label}
            </Chip>
          ))}
        </ChipRow>
      </SettingRow>

      {/* 라운드 */}
      <SettingRow label="라운드">
        <ChipRow>
          {radii.map((r) => (
            <Chip key={r.value} active={settings.radius === r.value} onClick={() => update({ radius: r.value })}>
              {r.label}
            </Chip>
          ))}
        </ChipRow>
      </SettingRow>

      <div style={{ fontSize: 10, color: 'var(--text-weak)' }}>
        폰트·강조색·밀도 등 상세는 데스크탑 <Link href="/settings" style={{ color: 'var(--brand)' }}>/settings</Link>
      </div>
    </section>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-sub)' }}>{label}</div>
      {children}
    </div>
  );
}
function ChipRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{children}</div>;
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        padding: '6px 12px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
        background: active ? 'var(--brand)' : 'var(--bg-card)',
        color: active ? '#fff' : 'var(--text-main)',
        border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        cursor: 'pointer', touchAction: 'manipulation',
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}
    >{children}</button>
  );
}

/* ─────────── 손님조회 링크 ─────────── */

function CustomerPortalShare() {
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

/* ─────────── 알림 토글 (localStorage, FCM 추후) ─────────── */

function NotificationToggle() {
  const [enabled, setEnabled] = useState<boolean>(true);

  useEffect(() => {
    try {
      const v = localStorage.getItem(NOTI_KEY);
      setEnabled(v !== '0');
    } catch { /* silent */ }
  }, []);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    try { localStorage.setItem(NOTI_KEY, next ? '1' : '0'); } catch { /* silent */ }
    toast.info(next ? '알림 켜짐 (FCM 푸시는 Phase 2)' : '알림 꺼짐');
  }

  return (
    <button type="button" onClick={toggle} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', background: 'transparent',
      border: 'none', borderBottom: '1px solid var(--border-soft)',
      cursor: 'pointer', textAlign: 'left', width: '100%',
      fontFamily: 'inherit', color: 'inherit',
      touchAction: 'manipulation',
    }}>
      <div style={{ color: enabled ? 'var(--brand)' : 'var(--text-weak)' }}>
        {enabled ? <Bell size={18} weight="duotone" /> : <BellSlash size={18} weight="duotone" />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>알림</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-weak)' }}>
          {enabled ? '받기 (사무 신규 등록 알림)' : '받지 않기'}
        </div>
      </div>
      <div style={{
        width: 36, height: 20,
        background: enabled ? 'var(--brand)' : 'var(--bg-sunken)',
        borderRadius: 999, position: 'relative',
        transition: 'background 0.15s',
      }}>
        <div style={{
          position: 'absolute', top: 2, left: enabled ? 18 : 2,
          width: 16, height: 16, background: '#fff', borderRadius: '50%',
          transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        }} />
      </div>
    </button>
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
