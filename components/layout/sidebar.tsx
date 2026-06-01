'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Car, Warning, Gear, CaretLeft, CaretRight, ChartBar, CurrencyKrw, Wrench, Receipt, FileText, Bank,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/use-auth';
import { useRole } from '@/lib/use-role';

type SidebarProps = Record<string, never>;

const COLLAPSE_KEY = 'jpkerp5_sidebar_collapsed';

export function Sidebar(_props: SidebarProps = {} as SidebarProps) {
  const pathname = usePathname();
  useAuth();
  const { isMaster: master } = useRole();
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

      {/* 운영 (일상) */}
      <div className="sb-section">
        <Link href="/dashboard" className={`sb-item ${isActive('/dashboard') ? 'active' : ''}`} title="대시보드 (지표 관리)">
          <ChartBar size={14} weight={isActive('/dashboard') ? 'fill' : 'regular'} />
          <span>대시보드</span>
        </Link>
        <Link href="/" className={`sb-item ${pathname === '/' ? 'active' : ''}`} title="운영 현황 (계약 상태 일별 슬라이스)">
          <Car size={14} weight={pathname === '/' ? 'fill' : 'regular'} />
          <span>운영 현황</span>
        </Link>
        <Link href="/receivables" className={`sb-item ${isActive('/receivables') ? 'active' : ''}`} title="리스크 관리 — 미수/시동제어/검사지연 등">
          <Warning size={14} weight={isActive('/receivables') ? 'fill' : 'regular'} />
          <span>리스크 관리</span>
        </Link>
      </div>

      <div className="sb-divider" />

      {/* 데이터 (마스터 영역) — master 만 노출 */}
      {master && (
        <>
          <div className="sb-section">
            <Link href="/asset" className={`sb-item ${isActive('/asset') ? 'active' : ''}`} title="자산 관리 — 차량 마스터, 매입·정비·보험·할부·검사·GPS·매각">
              <Car size={14} weight={isActive('/asset') ? 'fill' : 'regular'} />
              <span>자산 관리</span>
            </Link>
            <Link href="/contract" className={`sb-item ${isActive('/contract') && pathname !== '/contract/preview' ? 'active' : ''}`} title="계약 관리 — 임차인·계약·만기·반납·스케줄">
              <FileText size={14} weight={isActive('/contract') ? 'fill' : 'regular'} />
              <span>계약 관리</span>
            </Link>
            <Link href="/finance" className={`sb-item ${isActive('/finance') ? 'active' : ''}`} title="재무 관리 — 자금일보·자동이체·카드·수납·지출·세금계산서">
              <Bank size={14} weight={isActive('/finance') ? 'fill' : 'regular'} />
              <span>재무 관리</span>
            </Link>
          </div>
          <div className="sb-divider" />
        </>
      )}

      {/* 기존 입출금 — master 에게는 재무관리 안으로 들어가지만 일반 직원은 그대로 입출금만 */}
      {!master && (
        <div className="sb-section">
          <Link href="/payments" className={`sb-item ${isActive('/payments') ? 'active' : ''}`} title="입출금 관리 — 계좌 입금/출금 거래">
            <CurrencyKrw size={14} weight={isActive('/payments') ? 'fill' : 'regular'} />
            <span>입출금 관리</span>
          </Link>
        </div>
      )}

      <div className="sb-spacer" />

      {/* 관리 영역 — 일일 운영과 분리 */}
      <div className="sb-foot">
        <Link href="/penalty" className={`sb-item ${isActive('/penalty') ? 'active' : ''}`} title="과태료 업무">
          <Receipt size={14} weight={isActive('/penalty') ? 'fill' : 'regular'} />
          <span>과태료 업무</span>
        </Link>
        {master && (
          <Link href="/admin/dev-tools" className={`sb-item ${isActive('/admin/dev-tools') ? 'active' : ''}`} title="개발도구 — 마스터 전용">
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
