'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Car, Warning, Gear, CaretLeft, CaretRight, ChartBar, CurrencyKrw, Wrench, Receipt, FileText, Folder, Megaphone, Tray,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/use-auth';
import { useRole } from '@/lib/use-role';
import { APP_VERSION } from '@/lib/version';

type SidebarProps = Record<string, never>;

const COLLAPSE_KEY = 'jpkerp5_sidebar_collapsed';
const VISIBILITY_KEY = 'jpkerp5_sidebar_visibility';

/** 사이드바 메뉴 가시성 — 사용자가 설정 페이지에서 토글. 운영현황·설정은 항상 표시. */
export type MenuKey =
  | 'dashboard' | 'receivables'
  | 'asset' | 'contract' | 'finance'
  | 'penalty' | 'general'
  | 'notice' | 'inbox'
  | 'devtools';

export const MENU_LABELS: Record<MenuKey, string> = {
  dashboard: '대시보드',
  receivables: '리스크 현황',
  asset: '자산 관리',
  contract: '계약 관리',
  finance: '재무 관리',
  penalty: '과태료 업무',
  general: '일반 관리',
  notice: '공지사항',
  inbox: '입력함 (intake)',
  devtools: '개발도구',
};

/** 기본 가시성 — 디폴트 모두 ON. 사용자가 설정 → 메뉴 표시에서 안 쓰는 메뉴만 끔.
 *  운영현황은 항상 표시 (필수, 토글 불가). */
export const DEFAULT_VISIBILITY: Record<MenuKey, boolean> = {
  dashboard: true,
  receivables: true,
  asset: true,
  contract: true,
  finance: true,
  penalty: true,
  general: true,
  notice: true,
  inbox: true,
  devtools: true,
};

export function loadVisibility(): Record<MenuKey, boolean> {
  if (typeof window === 'undefined') return DEFAULT_VISIBILITY;
  try {
    const raw = localStorage.getItem(VISIBILITY_KEY);
    if (!raw) return DEFAULT_VISIBILITY;
    const parsed = JSON.parse(raw) as Partial<Record<MenuKey, boolean>>;
    return { ...DEFAULT_VISIBILITY, ...parsed };
  } catch { return DEFAULT_VISIBILITY; }
}

export function saveVisibility(v: Record<MenuKey, boolean>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(VISIBILITY_KEY, JSON.stringify(v));
  // 사이드바가 즉시 재렌더하도록 storage 이벤트 강제 디스패치
  window.dispatchEvent(new Event('jpkerp5_visibility_changed'));
}

export function Sidebar(_props: SidebarProps = {} as SidebarProps) {
  const pathname = usePathname();
  useAuth();
  const { isMaster: master } = useRole();
  const [collapsed, setCollapsed] = useState(false);
  const [visibility, setVisibility] = useState<Record<MenuKey, boolean>>(DEFAULT_VISIBILITY);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(COLLAPSE_KEY) : null;
    if (saved === '1') setCollapsed(true);
    setVisibility(loadVisibility());
    function onChange() { setVisibility(loadVisibility()); }
    window.addEventListener('jpkerp5_visibility_changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('jpkerp5_visibility_changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.sidebar = collapsed ? 'collapsed' : 'expanded';
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const toggle = () => setCollapsed((c) => !c);
  const show = (k: MenuKey) => visibility[k] !== false;

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        {!collapsed && <span className="sb-brand-text">성유민바보</span>}
        <button
          className="sb-brand-collapse"
          type="button"
          onClick={toggle}
          title={collapsed ? '사이드바 확장' : '사이드바 접기'}
          aria-label={collapsed ? '사이드바 확장' : '사이드바 접기'}
        >
          {collapsed ? <CaretRight size={14} weight="bold" /> : <CaretLeft size={14} weight="bold" />}
        </button>
      </div>

      {/* ① 대시보드 (단독) */}
      {show('dashboard') && (
        <div className="sb-section">
          <Link href="/dashboard" className={`sb-item ${isActive('/dashboard') ? 'active' : ''}`} title="대시보드 (지표 관리)">
            <ChartBar size={14} weight={isActive('/dashboard') ? 'fill' : 'regular'} />
            <span>대시보드</span>
          </Link>
        </div>
      )}
      {show('dashboard') && <div className="sb-divider" />}

      {/* ② 필수 운영 — 운영현황(항상 표시) · 리스크 현황 */}
      <div className="sb-section">
        <Link href="/" className={`sb-item ${pathname === '/' ? 'active' : ''}`} title="운영 현황 (필수)">
          <Car size={14} weight={pathname === '/' ? 'fill' : 'regular'} />
          <span>운영 현황</span>
        </Link>
        {show('receivables') && (
          <Link href="/receivables" className={`sb-item ${isActive('/receivables') ? 'active' : ''}`} title="리스크 현황 — 미수/시동제어/검사지연 등">
            <Warning size={14} weight={isActive('/receivables') ? 'fill' : 'regular'} />
            <span>리스크 현황</span>
          </Link>
        )}
      </div>

      <div className="sb-divider" />

      {/* ③ 디테일 관리 — 자산·계약·입출금 (옵셔널, 깊이 쓰는 회사) */}
      {(show('asset') || show('contract') || show('finance')) && (
        <>
          <div className="sb-section">
            {master && show('asset') && (
              <Link href="/asset" className={`sb-item ${isActive('/asset') ? 'active' : ''}`} title="자산 관리 — 차량 마스터, 매입·정비·보험·할부·검사·GPS·매각">
                <Car size={14} weight={isActive('/asset') ? 'fill' : 'regular'} />
                <span>자산 관리</span>
              </Link>
            )}
            {master && show('contract') && (
              <Link href="/contract" className={`sb-item ${isActive('/contract') && pathname !== '/contract/preview' ? 'active' : ''}`} title="계약 관리 — 임차인·만기·반납·수납스케줄">
                <FileText size={14} weight={isActive('/contract') ? 'fill' : 'regular'} />
                <span>계약 관리</span>
              </Link>
            )}
            {show('finance') && (
              <Link
                href={master ? '/finance' : '/payments'}
                className={`sb-item ${(isActive('/finance') || isActive('/payments')) ? 'active' : ''}`}
                title="재무 관리 — 계좌·자동이체·카드매출·법인카드"
              >
                <CurrencyKrw size={14} weight={(isActive('/finance') || isActive('/payments')) ? 'fill' : 'regular'} />
                <span>재무 관리</span>
              </Link>
            )}
          </div>
          <div className="sb-divider" />
        </>
      )}

      {/* ④ 과태료·일반 (같은 그룹) — 손익은 일반관리 안으로 통합 */}
      {(show('penalty') || show('general')) && (
        <>
          <div className="sb-section">
            {show('penalty') && (
              <Link href="/penalty" className={`sb-item ${isActive('/penalty') ? 'active' : ''}`} title="과태료 업무">
                <Receipt size={14} weight={isActive('/penalty') ? 'fill' : 'regular'} />
                <span>과태료 업무</span>
              </Link>
            )}
            {master && show('general') && (
              <Link href="/general" className={`sb-item ${isActive('/general') ? 'active' : ''}`} title="일반 관리 — 직원·법인·임대·시설·차고지·증차·공문·손익">
                <Folder size={14} weight={isActive('/general') ? 'fill' : 'regular'} />
                <span>일반 관리</span>
              </Link>
            )}
            {/* 공지사항은 사이드바 메뉴 X — 대시보드 캘린더 옆 패널에서 노출 */}
            {/* 디스패치·근태·활동피드 → /general 좌측 nav 안으로 통합 (2026-06-15) */}
          </div>
          <div className="sb-divider" />
        </>
      )}

      <div className="sb-spacer" />

      {/* 관리 영역 — 도구·설정 (과태료 업무는 위 디테일 묶음으로 이동) */}
      <div className="sb-foot">
        {master && show('inbox') && (
          <Link href="/inbox" className={`sb-item ${isActive('/inbox') ? 'active' : ''}`} title="입력함 — 모든 데이터 입력 audit (intake)">
            <Tray size={14} weight={isActive('/inbox') ? 'fill' : 'regular'} />
            <span>입력함</span>
          </Link>
        )}
        {master && show('devtools') && (
          <Link href="/admin/dev-tools" className={`sb-item ${isActive('/admin/dev-tools') ? 'active' : ''}`} title="개발도구 — 마스터 전용">
            <Wrench size={14} weight={isActive('/admin/dev-tools') ? 'fill' : 'regular'} />
            <span>개발도구</span>
          </Link>
        )}
        <Link href="/settings" className={`sb-item ${isActive('/settings') ? 'active' : ''}`} title={`설정 — 메뉴 표시·직원·법인·계정 (v${APP_VERSION})`}>
          <Gear size={14} weight={isActive('/settings') ? 'fill' : 'regular'} />
          <span>설정</span>
          {!collapsed && (
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-weak)', fontFamily: 'var(--font-mono)' }}>
              v{APP_VERSION}
            </span>
          )}
        </Link>
      </div>
    </aside>
  );
}
