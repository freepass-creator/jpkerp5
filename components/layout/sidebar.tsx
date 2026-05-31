'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Car, Warning, Gear, CaretLeft, CaretRight, ChartBar, CurrencyKrw, Wrench, Receipt,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/use-auth';
import { useRole } from '@/lib/use-role';

type SidebarProps = Record<string, never>;

const COLLAPSE_KEY = 'jpkerp5_sidebar_collapsed';

export function Sidebar(_props: SidebarProps = {} as SidebarProps) {
  const pathname = usePathname();
  useAuth();
  const { isAdmin: admin } = useRole();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(COLLAPSE_KEY) : null;
    if (saved === '1') setCollapsed(true);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.sidebar = collapsed ? 'collapsed' : 'expanded';
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const toggle = () => setCollapsed((c) => !c);

  return (
    <aside className="sidebar">
      <div className="sb-brand">
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

      <div className="sb-section">
        <Link href="/dashboard" className={`sb-item ${isActive('/dashboard') ? 'active' : ''}`} title="대시보드 (지표 관리)">
          <ChartBar size={14} weight={isActive('/dashboard') ? 'fill' : 'regular'} />
          <span>대시보드</span>
        </Link>
        <Link href="/" className={`sb-item ${pathname === '/' ? 'active' : ''}`} title="운영 현황 (자산·계약)">
          <Car size={14} weight={pathname === '/' ? 'fill' : 'regular'} />
          <span>운영 현황</span>
        </Link>
        <Link href="/receivables" className={`sb-item ${isActive('/receivables') ? 'active' : ''}`} title="리스크 관리 — 미수/시동제어/검사지연 등 임차인 책임 위반 관리">
          <Warning size={14} weight={isActive('/receivables') ? 'fill' : 'regular'} />
          <span>리스크 관리</span>
        </Link>
        <Link href="/payments" className={`sb-item ${isActive('/payments') ? 'active' : ''}`} title="계좌 관리 (계좌·카드)">
          <CurrencyKrw size={14} weight={isActive('/payments') ? 'fill' : 'regular'} />
          <span>계좌 관리</span>
        </Link>
      </div>

      <div className="sb-spacer" />

      {/* 관리 영역 — 일일 운영과 분리. 과태료·법인·설정 */}
      <div className="sb-foot">
        <Link href="/penalty" className={`sb-item ${isActive('/penalty') ? 'active' : ''}`} title="과태료 업무">
          <Receipt size={14} weight={isActive('/penalty') ? 'fill' : 'regular'} />
          <span>과태료 업무</span>
        </Link>
        {admin && (
          <Link href="/admin/dev-tools" className={`sb-item ${isActive('/admin/dev-tools') ? 'active' : ''}`} title="개발도구 — 이력 업로드 / 진단 / wipe / 감사 로그 (관리자 전용)">
            <Wrench size={14} weight={isActive('/admin/dev-tools') ? 'fill' : 'regular'} />
            <span>개발도구</span>
          </Link>
        )}
        <Link href="/settings" className={`sb-item ${isActive('/settings') ? 'active' : ''}`} title="설정 — 직원·법인·사용안내·화면·계정">
          <Gear size={14} weight={isActive('/settings') ? 'fill' : 'regular'} />
          <span>설정</span>
        </Link>
      </div>
    </aside>
  );
}
