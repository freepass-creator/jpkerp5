'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  House, Warning, Buildings, CurrencyKrw, ChatCircleDots, Plus,
  SignOut, Gear, CaretLeft, CaretRight,
} from '@phosphor-icons/react';
import { useAuth, logout } from '@/lib/use-auth';

type ActionHandlers = {
  onCreate?: () => void;
  onSms?: () => void;
  onLedger?: () => void;
  onMaster?: () => void;
  smsCount?: number;
};

const COLLAPSE_KEY = 'jpkerp5_sidebar_collapsed';

export function Sidebar({ onCreate, onSms, onLedger, onMaster, smsCount }: ActionHandlers = {}) {
  const pathname = usePathname();
  const { user } = useAuth();
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
        <div className="sb-section-label">메뉴</div>
        <Link href="/" className={`sb-item ${isActive('/') && pathname === '/' ? 'active' : ''}`} title="홈 — 미수/반납">
          <House size={14} weight={pathname === '/' ? 'fill' : 'regular'} />
          <span>홈 — 미수/반납</span>
        </Link>
        <Link href="/penalty" className={`sb-item ${isActive('/penalty') ? 'active' : ''}`} title="과태료 업무">
          <Warning size={14} weight={isActive('/penalty') ? 'fill' : 'regular'} />
          <span>과태료 업무</span>
        </Link>
        <button
          className="sb-item"
          type="button"
          onClick={onMaster}
          disabled={!onMaster}
          title={onMaster ? '회사(법인) 마스터 관리' : '마스터 (준비중)'}
        >
          <Buildings size={14} />
          <span>회사 마스터</span>
        </button>
      </div>

      <div className="sb-section">
        <div className="sb-section-label">액션</div>
        {onCreate && (
          <button className="sb-item primary" type="button" onClick={onCreate} title="신규 생성">
            <Plus size={14} weight="bold" />
            <span>신규 생성</span>
          </button>
        )}
        {onSms && (
          <button className="sb-item" type="button" onClick={onSms} title="문자 발송">
            <ChatCircleDots size={14} />
            <span>문자 발송</span>
            {smsCount !== undefined && smsCount > 0 && <span className="sb-count">{smsCount}</span>}
          </button>
        )}
        {onLedger && (
          <button className="sb-item" type="button" onClick={onLedger} title="수납이력">
            <CurrencyKrw size={14} />
            <span>수납이력</span>
          </button>
        )}
      </div>

      <div className="sb-spacer" />

      <div className="sb-foot">
        <button className="sb-item" type="button" title="설정 — 준비중">
          <Gear size={14} />
          <span>설정</span>
        </button>
        {user && (
          <div className="sb-user">
            <div>{user.displayName || '직원'}</div>
            <div className="sb-user-email">{user.email}</div>
          </div>
        )}
        <button className="sb-item" type="button" onClick={() => void logout()} title="로그아웃">
          <SignOut size={14} />
          <span>로그아웃</span>
        </button>
      </div>
    </aside>
  );
}
