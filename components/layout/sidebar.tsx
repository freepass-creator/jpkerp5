'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  House, Warning, Buildings, CurrencyKrw, ChatCircleDots, Plus,
  SignOut, Gear,
} from '@phosphor-icons/react';
import { useAuth, logout } from '@/lib/use-auth';

type ActionHandlers = {
  onCreate?: () => void;
  onSms?: () => void;
  onLedger?: () => void;
  smsCount?: number;
};

export function Sidebar({ onCreate, onSms, onLedger, smsCount }: ActionHandlers = {}) {
  const pathname = usePathname();
  const { user } = useAuth();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <div className="sb-brand-logo">jpk</div>
        <div className="sb-brand-text">
          <div className="sb-brand-name">jpkerp5</div>
          <div className="sb-brand-sub">렌탈 ERP</div>
        </div>
      </div>

      <div className="sb-section">
        <div className="sb-section-label">메뉴</div>
        <Link href="/" className={`sb-item ${isActive('/') && pathname === '/' ? 'active' : ''}`}>
          <House size={14} weight={pathname === '/' ? 'fill' : 'regular'} />
          <span>홈 — 미수/반납</span>
        </Link>
        <Link href="/penalty" className={`sb-item ${isActive('/penalty') ? 'active' : ''}`}>
          <Warning size={14} weight={isActive('/penalty') ? 'fill' : 'regular'} />
          <span>과태료 업무</span>
        </Link>
        <button className="sb-item" type="button" title="마스터 (법인·차량·고객) — 준비중">
          <Buildings size={14} />
          <span>마스터</span>
        </button>
      </div>

      <div className="sb-section">
        <div className="sb-section-label">액션</div>
        {onCreate && (
          <button className="sb-item primary" type="button" onClick={onCreate}>
            <Plus size={14} weight="bold" />
            <span>신규 생성</span>
          </button>
        )}
        {onSms && (
          <button className="sb-item" type="button" onClick={onSms}>
            <ChatCircleDots size={14} />
            <span>문자 발송</span>
            {smsCount !== undefined && smsCount > 0 && <span className="sb-count">{smsCount}</span>}
          </button>
        )}
        {onLedger && (
          <button className="sb-item" type="button" onClick={onLedger}>
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
        <button className="sb-item" type="button" onClick={() => void logout()}>
          <SignOut size={14} />
          <span>로그아웃</span>
        </button>
      </div>
    </aside>
  );
}
