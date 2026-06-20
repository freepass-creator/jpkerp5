'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Gear, User, Sun, Moon, Desktop, ArrowCounterClockwise, SignOut, BookOpen, Snowflake, Leaf, Coffee,
  Shield, Play, CircleNotch, ArrowSquareOut,
} from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { useAuth, logout } from '@/lib/use-auth';
import { toast } from '@/lib/toast';
import { useRole } from '@/lib/use-role';
import { useSettings, type Theme, type FontFamily, type FontSize, type Density, type Radius, type Accent } from '@/lib/use-settings';
import { POLICY_DEF, usePolicies, type PolicyKey } from '@/lib/policy';
import { MODULES, useModules, type ModuleKey } from '@/lib/modules';
import { MENU_LABELS, DEFAULT_VISIBILITY, loadVisibility, saveVisibility, type MenuKey } from '@/components/layout/sidebar';
import { useEffect as useEffectMenu } from 'react';
import { usePersistentState } from '@/lib/use-persistent-state';

type Tab = 'display' | 'menu' | 'account' | 'admin' | 'company';

export default function SettingsPage() {
  const [tab, setTab] = usePersistentState<Tab>('filter:settings:tab', 'display');
  const { user } = useAuth();
  const { isAdmin: admin, isRealMaster } = useRole();

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <Gear size={16} weight="fill" style={{ color: 'var(--text-sub)' }} />
            <span>설정</span>
          </div>
        </header>

        <div className="page-shell">
          <nav className="page-shell-nav">
            <div className="page-shell-nav-group-label">개인</div>
            <button type="button" className={`page-shell-nav-item ${tab === 'display' ? 'active' : ''}`} onClick={() => setTab('display')}>
              <Sun size={14} weight={tab === 'display' ? 'fill' : 'regular'} />
              <span>화면</span>
            </button>
            <button type="button" className={`page-shell-nav-item ${tab === 'menu' ? 'active' : ''}`} onClick={() => setTab('menu')}>
              <Gear size={14} weight={tab === 'menu' ? 'fill' : 'regular'} />
              <span>메뉴 표시</span>
            </button>
            <button type="button" className={`page-shell-nav-item ${tab === 'account' ? 'active' : ''}`} onClick={() => setTab('account')}>
              <User size={14} weight={tab === 'account' ? 'fill' : 'regular'} />
              <span>계정</span>
            </button>

            <div className="page-shell-nav-group-label" style={{ marginTop: 14 }}>도움</div>
            <Link href="/help" className="page-shell-nav-item">
              <BookOpen size={14} />
              <span>사용 안내</span>
              <ArrowSquareOut size={11} weight="bold" style={{ marginLeft: 'auto', opacity: 0.5 }} />
            </Link>

            {admin && (
              <>
                <div className="page-shell-nav-group-label" style={{ marginTop: 14 }}>운영</div>
                <button type="button" className={`page-shell-nav-item ${tab === 'admin' ? 'active' : ''}`} onClick={() => setTab('admin')}>
                  <Shield size={14} weight={tab === 'admin' ? 'fill' : 'regular'} />
                  <span>일일 작업</span>
                </button>
              </>
            )}
            {isRealMaster && (
              <>
                <div className="page-shell-nav-group-label" style={{ marginTop: 14 }}>회사 정책</div>
                <button type="button" className={`page-shell-nav-item ${tab === 'company' ? 'active' : ''}`} onClick={() => setTab('company')}>
                  <Gear size={14} weight={tab === 'company' ? 'fill' : 'regular'} />
                  <span>정책 · 모듈 · 브랜드</span>
                </button>
              </>
            )}
          </nav>

          <main className="page-shell-main">
            {tab === 'display' && <DisplaySettings />}
            {tab === 'menu' && <MenuVisibilitySettings />}
            {tab === 'account' && <AccountSettings />}
            {tab === 'admin' && <AdminSettings />}
            {tab === 'company' && <CompanyPolicySettings />}
          </main>
        </div>

        <BottomBar
          right={
            <span>
              {tab === 'display' && '화면 — 테마 · 글꼴 · 글자 크기 · 행 밀도'}
              {tab === 'menu' && '메뉴 표시 — 사이드바에 보이는 메뉴 선택 (운영현황·설정은 필수)'}
              {tab === 'account' && `로그인 — ${user?.email ?? '-'}`}
              {tab === 'admin' && '관리 — 일일 면허재검증 · 데이터 정비'}
            </span>
          }
        />
      </div>
    </div>
  );
}

/* ──────────────────── 화면 ──────────────────── */

const THEMES: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: '라이트',  icon: <Sun weight="bold" /> },
  { value: 'sepia', label: '세피아',  icon: <BookOpen weight="bold" /> },
  { value: 'cool',  label: '쿨',      icon: <Snowflake weight="bold" /> },
  { value: 'warm',  label: '웜',      icon: <Coffee weight="bold" /> },
  { value: 'mint',  label: '민트',    icon: <Leaf weight="bold" /> },
  { value: 'dark',  label: '다크',    icon: <Moon weight="bold" /> },
  { value: 'auto',  label: '시스템',  icon: <Desktop weight="bold" /> },
];

const ACCENTS: { value: Accent; label: string; color: string }[] = [
  { value: 'navy',   label: '네이비', color: '#1B2A4A' },
  { value: 'blue',   label: '블루',   color: '#2563eb' },
  { value: 'indigo', label: '인디고', color: '#4f46e5' },
  { value: 'teal',   label: '틸',     color: '#0d9488' },
  { value: 'green',  label: '그린',   color: '#16a34a' },
  { value: 'red',    label: '레드',   color: '#dc2626' },
  { value: 'orange', label: '오렌지', color: '#ea580c' },
  { value: 'purple', label: '퍼플',   color: '#9333ea' },
  { value: 'slate',  label: '슬레이트', color: '#475569' },
];
const FONTS: { value: FontFamily; label: string; desc: string }[] = [
  { value: 'pretendard',      label: 'Pretendard',         desc: '한글·영문·숫자 통일 (기본)' },
  { value: 'pretendard-mono', label: 'Pretendard + 등폭',  desc: '영문·숫자는 Consolas' },
  { value: 'mono',            label: 'Consolas + 굴림체',  desc: '전통 ERP' },
  { value: 'noto',            label: 'Noto Sans KR',       desc: 'Google 표준' },
  { value: 'spoqa',           label: 'Spoqa Han Sans Neo', desc: '가독성 우수' },
  { value: 'nanum',           label: '나눔고딕',           desc: '한국어 표준' },
  { value: 'nanum-square',    label: '나눔스퀘어 라운드',  desc: '둥근 형태' },
  { value: 'ibm-plex',        label: 'IBM Plex Sans KR',   desc: '모던' },
  { value: 'gowun',           label: '고운돋움',           desc: '얇고 우아' },
  { value: 'system',          label: '시스템 기본',        desc: 'OS 기본' },
];
const FONT_SIZES: FontSize[] = [11, 12, 13, 14];
const DENSITIES: { value: Density; label: string; desc: string }[] = [
  { value: 'compact',     label: '컴팩트', desc: '많은 정보 (행 30px)' },
  { value: 'comfortable', label: '편안함', desc: '여유 (행 36px)' },
];
const RADII: { value: Radius; label: string; desc: string }[] = [
  { value: 'square',  label: '각지게',     desc: '모서리 0 — 직각 (전통 ERP)' },
  { value: 'soft',    label: '약간 둥글게', desc: '모서리 3~8px — 표준 (기본)' },
  { value: 'rounded', label: '더 둥글게',   desc: '모서리 4~12px — 부드럽게' },
];

function DisplaySettings() {
  const { settings, update, reset } = useSettings();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>
      <header className="page-header">
        <div className="page-header-title-group">
          <h1 className="page-header-title">화면</h1>
          <div className="page-header-title-sub">테마 · 글꼴 · 글자 크기 · 행 밀도</div>
        </div>
        <div className="page-header-actions">
          <button className="btn" type="button" onClick={reset}>
            <ArrowCounterClockwise /> 기본값 복원
          </button>
        </div>
      </header>

      <Section title="테마">
        <div className="filter-bar">
          {THEMES.map((t) => (
            <button key={t.value} type="button" className={`chip ${settings.theme === t.value ? 'active' : ''}`} onClick={() => update({ theme: t.value })}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="브랜드 색상">
        <div className="filter-bar">
          {ACCENTS.map((a) => (
            <button
              key={a.value}
              type="button"
              className={`chip ${settings.accent === a.value ? 'active' : ''}`}
              onClick={() => update({ accent: a.value })}
              title={a.label}
            >
              <span style={{
                display: 'inline-block',
                width: 12, height: 12,
                background: a.color,
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: 'var(--radius-sm)',
              }} />
              {a.label}
            </button>
          ))}
          {/* 커스텀 색상 picker */}
          <label
            className={`chip ${settings.accent === 'custom' ? 'active' : ''}`}
            style={{ cursor: 'pointer', position: 'relative' }}
            title="직접 색상 선택"
          >
            <span style={{
              display: 'inline-block',
              width: 12, height: 12,
              background: settings.customAccent || '#1B2A4A',
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: 'var(--radius-sm)',
            }} />
            기타
            <input
              type="color"
              value={settings.customAccent || '#1B2A4A'}
              onChange={(e) => update({ accent: 'custom', customAccent: e.target.value })}
              style={{
                position: 'absolute',
                opacity: 0,
                width: '100%', height: '100%',
                top: 0, left: 0,
                cursor: 'pointer',
              }}
            />
          </label>
          {settings.accent === 'custom' && (
            <span style={{ fontSize: 11, color: 'var(--text-weak)', marginLeft: 4, fontFamily: 'var(--font-mono)' }}>
              {settings.customAccent}
            </span>
          )}
        </div>
      </Section>

      <Section title="글꼴">
        <div className="filter-bar">
          {FONTS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`chip ${settings.fontFamily === f.value ? 'active' : ''}`}
              onClick={() => update({ fontFamily: f.value })}
              title={f.desc}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="글자 크기">
        <div className="filter-bar">
          {FONT_SIZES.map((sz) => (
            <button key={sz} type="button" className={`chip ${settings.fontSize === sz ? 'active' : ''}`} onClick={() => update({ fontSize: sz })}>
              {sz}px
            </button>
          ))}
        </div>
      </Section>

      <Section title="행 밀도">
        <div className="filter-bar">
          {DENSITIES.map((d) => (
            <button key={d.value} type="button" className={`chip ${settings.density === d.value ? 'active' : ''}`} onClick={() => update({ density: d.value })} title={d.desc}>
              {d.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="모서리 (라디우스)">
        <div className="filter-bar">
          {RADII.map((r) => (
            <button key={r.value} type="button" className={`chip ${settings.radius === r.value ? 'active' : ''}`} onClick={() => update({ radius: r.value })} title={r.desc}>
              {r.label}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {title}
      </div>
      {children}
    </section>
  );
}

/* ──────────────────── 계정 ──────────────────── */

function AccountSettings() {
  const { user } = useAuth();
  const [customerUrl, setCustomerUrl] = useState('');
  useEffectMenu(() => {
    if (typeof window !== 'undefined') setCustomerUrl(`${window.location.origin}/customer`);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 560 }}>
      <header className="page-header">
        <div className="page-header-title-group">
          <h1 className="page-header-title">계정</h1>
          <div className="page-header-title-sub">로그인 정보 · 세션 관리 · 손님 페이지 공유</div>
        </div>
      </header>

      {/* 손님 자가조회 페이지 — 직원이 한 링크로 모든 손님에게 공유 */}
      <section className="detail-section">
        <div className="detail-section-header">손님 자가조회 페이지</div>
        <div className="detail-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.6 }}>
            모든 손님에게 같은 링크 공유. 손님이 차량번호 + 주민번호로 본인 인증 후 자기 계약·회차·수납 내역만 조회.
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              readOnly
              value={customerUrl}
              className="input input-compact mono"
              style={{ flex: 1, fontSize: 11 }}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                navigator.clipboard.writeText(customerUrl).then(
                  () => toast.success('손님 페이지 링크 복사됨 — 카톡/SMS/이메일 로 전송'),
                  () => prompt('수동 복사', customerUrl),
                );
              }}
            >
              📋 복사
            </button>
            <a href="/customer" target="_blank" rel="noopener noreferrer" className="btn btn-sm" style={{ textDecoration: 'none' }}>
              미리보기 →
            </a>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-weak)', lineHeight: 1.6 }}>
            ↳ 보안: Firebase Anonymous Auth + 차량번호 인덱스 쿼리 + 주민번호 클라이언트 매칭. 손님이 다른 손님 정보 조회 불가.
          </div>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-header">로그인 정보</div>
        <div className="detail-section-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'var(--brand-bg)', color: 'var(--brand)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <User size={20} weight="bold" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>{user?.displayName || '직원'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-weak)', marginTop: 2 }}>{user?.email}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-header">세션</div>
        <div className="detail-section-body" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--text-sub)' }}>현재 세션에서 로그아웃합니다.</span>
          <button className="btn btn-danger" type="button" onClick={() => void logout()}>
            <SignOut /> 로그아웃
          </button>
        </div>
      </section>
    </div>
  );
}

/* ──────────────────── 관리 ──────────────────── */

type LicenseRun = {
  ok: boolean;
  dry?: boolean;
  targets?: number;
  updated?: number;
  alerts?: number;
  outcomes?: Array<{
    contractId: string;
    contractNo: string;
    customerName: string;
    licenseNo: string;
    before?: string;
    after?: string;
    changed: boolean;
    alert: boolean;
    error?: string;
  }>;
  ranAt?: string;
  error?: string;
};

function AdminSettings() {
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<LicenseRun | null>(null);

  async function trigger(dry: boolean) {
    setBusy(true);
    setRun(null);
    try {
      const { getFirebaseAuth } = await import('@/lib/firebase/client');
      const auth = getFirebaseAuth();
      const user = auth?.currentUser;
      const idToken = user ? await user.getIdToken() : '';
      const res = await fetch(`/api/cron/license-verify${dry ? '?dry=1' : ''}`, {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
      });
      const json = await res.json();
      setRun(json);
    } catch (e) {
      setRun({ ok: false, error: (e as Error).message ?? String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <section className="detail-section">
        <div className="detail-section-header">면허번호 일괄 재검증 — RIMS</div>
        <div className="detail-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>
            등록된 모든 계약의 면허번호를 RIMS에 일괄 조회합니다. 매일 0시 자동 실행 (Vercel Cron).
            <br />
            <span style={{ color: 'var(--text-weak)' }}>
              · 시뮬레이션: RTDB 갱신 없이 결과만 확인
              <br />
              · 실행: 정지/취소/만료 발견 시 status 갱신 + 알림 대상 표시
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" type="button" onClick={() => trigger(true)} disabled={busy}>
              {busy ? <CircleNotch weight="bold" style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={12} weight="duotone" />}
              시뮬레이션 (dry-run)
            </button>
            <button className="btn btn-primary" type="button" onClick={() => trigger(false)} disabled={busy}>
              {busy ? <CircleNotch weight="bold" style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={12} weight="fill" />}
              지금 실행
            </button>
          </div>

          {run && (
            <div style={{ marginTop: 6, border: '1px solid var(--border-soft)', background: 'var(--bg-card)' }}>
              {!run.ok ? (
                <div style={{ padding: 10, color: 'var(--red-text)', fontSize: 12 }}>오류: {run.error ?? 'unknown'}</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: 10, borderBottom: '1px solid var(--border-soft)' }}>
                    <Kpi label="대상" value={String(run.targets ?? 0)} />
                    <Kpi label="갱신" value={String(run.updated ?? 0)} />
                    <Kpi label="경보" value={String(run.alerts ?? 0)} alert={!!run.alerts && run.alerts > 0} />
                    <Kpi label="모드" value={run.dry ? '시뮬레이션' : '실행'} />
                  </div>
                  {run.outcomes && run.outcomes.length > 0 && (
                    <div style={{ maxHeight: 320, overflow: 'auto' }}>
                      <table className="table" style={{ fontSize: 11 }}>
                        <thead>
                          <tr>
                            <th>계약</th>
                            <th>고객</th>
                            <th>면허번호</th>
                            <th>이전</th>
                            <th>이후</th>
                            <th>비고</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.outcomes.map((o) => (
                            <tr key={o.contractId} style={o.alert ? { background: 'var(--red-text-bg, transparent)' } : undefined}>
                              <td className="mono">{o.contractNo}</td>
                              <td>{o.customerName}</td>
                              <td className="mono">{o.licenseNo}</td>
                              <td style={{ color: 'var(--text-weak)' }}>{o.before ?? '—'}</td>
                              <td style={{ color: o.alert ? 'var(--red-text)' : o.changed ? 'var(--orange-text)' : 'var(--text-sub)', fontWeight: o.changed ? 600 : 400 }}>
                                {o.after ?? '—'}
                              </td>
                              <td style={{ color: 'var(--text-weak)' }}>
                                {o.alert ? '운영 알림 필요' : o.changed ? '상태 변경' : o.error ? `오류: ${o.error}` : '변동 없음'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-weak)' }}>
                    실행 시각: {run.ranAt ? run.ranAt.slice(0, 19).replace('T', ' ') : '-'}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-weak)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: alert ? 'var(--red-text)' : 'var(--text-main)' }}>{value}</div>
    </div>
  );
}

/* ─────────────── 메뉴 표시 설정 ─────────────── */

function MenuVisibilitySettings() {
  const [vis, setVis] = useState<Record<MenuKey, boolean>>(DEFAULT_VISIBILITY);
  useEffectMenu(() => { setVis(loadVisibility()); }, []);
  function toggle(k: MenuKey) {
    const next = { ...vis, [k]: !vis[k] };
    setVis(next); saveVisibility(next);
  }
  function reset() { setVis(DEFAULT_VISIBILITY); saveVisibility(DEFAULT_VISIBILITY); }
  const orderedKeys: MenuKey[] = ['dashboard', 'receivables', 'asset', 'contract', 'finance', 'penalty', 'general', 'devtools'];
  return (
    <div className="settings-card" style={{ padding: 24 }}>
      <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-sub)' }}>
        사이드바에 노출할 메뉴를 선택하세요. <strong>운영현황</strong>과 <strong>설정</strong>은 항상 표시됩니다.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {orderedKeys.map((k) => (
          <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', background: vis[k] ? 'var(--bg-card)' : 'var(--bg-sunken)' }}>
            <input type="checkbox" checked={vis[k] !== false} onChange={() => toggle(k)} />
            <span style={{ fontSize: 13, fontWeight: vis[k] ? 600 : 400, color: vis[k] ? 'var(--text-main)' : 'var(--text-sub)' }}>{MENU_LABELS[k]}</span>
          </label>
        ))}
      </div>
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-sm" type="button" onClick={reset}>모두 표시 (초기화)</button>
      </div>
    </div>
  );
}

/* ──────────────────── 회사 정책 — 정책 / 모듈 / 브랜드 (master 만) ──────────────────── */

function CompanyPolicySettings() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PolicySection />
      <ModuleSection />
      <BrandingSection />
    </div>
  );
}

function PolicySection() {
  const { policies, setPolicy, loading } = usePolicies();
  const grouped: Record<string, PolicyKey[]> = {};
  for (const k of Object.keys(POLICY_DEF) as PolicyKey[]) {
    const g = POLICY_DEF[k].group;
    (grouped[g] = grouped[g] ?? []).push(k);
  }
  return (
    <div className="settings-card" style={{ padding: 20 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700 }}>정책</h3>
      <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 16 }}>
        임박일·연체일·반환기한 — 회사가 직접 변경. 즉시 검증·알림에 반영.
      </div>
      {loading && <div style={{ fontSize: 12, color: 'var(--text-weak)' }}>로딩 중…</div>}
      {Object.entries(grouped).map(([group, keys]) => (
        <div key={group} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-sub)', marginBottom: 8 }}>{group}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 100px 80px', gap: 8, alignItems: 'center' }}>
            {keys.map((k) => (
              <React.Fragment key={k}>
                <span style={{ fontSize: 12 }}>{POLICY_DEF[k].label}</span>
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={policies[k] ?? POLICY_DEF[k].default}
                  onChange={(e) => { void setPolicy(k, Number(e.target.value)); }}
                  style={{ width: 100, fontFamily: 'var(--font-mono)' }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-weak)' }}>{POLICY_DEF[k].unit}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ModuleSection() {
  const { modules, toggleModule, loading } = useModules();
  return (
    <div className="settings-card" style={{ padding: 20 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700 }}>모듈 on/off</h3>
      <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 16 }}>
        회사 규모에 맞게 기능 모듈 끄기. 운영·리스크 코어는 항상 ON.
      </div>
      {loading && <div style={{ fontSize: 12, color: 'var(--text-weak)' }}>로딩 중…</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(Object.keys(MODULES) as ModuleKey[]).map((k) => (
          <label key={k} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
            cursor: 'pointer', background: modules[k] ? 'var(--bg-card)' : 'var(--bg-sunken)',
          }}>
            <input
              type="checkbox"
              checked={modules[k] ?? MODULES[k].default}
              onChange={() => { void toggleModule(k); }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: modules[k] ? 'var(--text-main)' : 'var(--text-sub)' }}>
                {MODULES[k].label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-weak)' }}>{MODULES[k].desc}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function BrandingSection() {
  // 화이트라벨 슬롯 — 회사명·CI URL·고객센터 전화. localStorage 기반 (서버 적용은 v7 마이그레이션 시).
  const [brand, setBrand] = useState(() => {
    if (typeof window === 'undefined') return { name: '', ciUrl: '', csPhone: '' };
    try { return JSON.parse(localStorage.getItem('jpkerp5:branding') || '{}'); }
    catch { return { name: '', ciUrl: '', csPhone: '' }; }
  });
  function save(patch: Partial<typeof brand>) {
    const next = { ...brand, ...patch };
    setBrand(next);
    try { localStorage.setItem('jpkerp5:branding', JSON.stringify(next)); } catch { /* noop */ }
  }
  return (
    <div className="settings-card" style={{ padding: 20 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700 }}>브랜드 (화이트라벨)</h3>
      <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 16 }}>
        회사명·CI 분리. v6/v7 시스템에서 다른 회사 배포 시 활용 (현재 v5 는 사이드바에 미적용).
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, alignItems: 'center' }}>
        <label style={{ fontSize: 12 }}>회사명</label>
        <input className="input" value={brand.name ?? ''} onChange={(e) => save({ name: e.target.value })} placeholder="예: JPK 렌트카" />
        <label style={{ fontSize: 12 }}>CI URL</label>
        <input className="input mono" value={brand.ciUrl ?? ''} onChange={(e) => save({ ciUrl: e.target.value })} placeholder="https://.../logo.png" />
        <label style={{ fontSize: 12 }}>고객센터 전화</label>
        <input className="input mono" value={brand.csPhone ?? ''} onChange={(e) => save({ csPhone: e.target.value })} placeholder="1588-XXXX" />
      </div>
    </div>
  );
}
