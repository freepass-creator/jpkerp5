'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  House, Warning, Buildings, Gear, CaretLeft, CaretRight, ChartBar, CurrencyKrw, ClipboardText,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/use-auth';
import { isAdmin } from '@/lib/admin-emails';

type SidebarProps = Record<string, never>;

const COLLAPSE_KEY = 'jpkerp5_sidebar_collapsed';

export function Sidebar(_props: SidebarProps = {} as SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const admin = isAdmin(user?.email);
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
          <House size={14} weight={pathname === '/' ? 'fill' : 'regular'} />
          <span>운영 현황</span>
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
          <Warning size={14} weight={isActive('/penalty') ? 'fill' : 'regular'} />
          <span>과태료 업무</span>
        </Link>
        <Link href="/companies" className={`sb-item ${isActive('/companies') ? 'active' : ''}`} title="법인 관리">
          <Buildings size={14} weight={isActive('/companies') ? 'fill' : 'regular'} />
          <span>법인 관리</span>
        </Link>
        {admin && (
          <Link href="/admin/audit" className={`sb-item ${isActive('/admin/audit') ? 'active' : ''}`} title="감사 로그 — 누가 언제 무엇을 (관리자 전용)">
            <ClipboardText size={14} weight={isActive('/admin/audit') ? 'fill' : 'regular'} />
            <span>감사 로그</span>
          </Link>
        )}
        <Link href="/settings" className={`sb-item ${isActive('/settings') ? 'active' : ''}`} title="설정 (화면·계정)">
          <Gear size={14} weight={isActive('/settings') ? 'fill' : 'regular'} />
          <span>설정</span>
        </Link>
      </div>
    </aside>
  );
}
