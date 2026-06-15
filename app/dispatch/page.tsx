'use client';

/**
 * /dispatch — Sidebar + topbar + DispatchView (공용 컴포넌트).
 *
 * 일반관리 통합: /general?view=dispatch 에서도 동일 DispatchView 렌더.
 */

import { Sidebar } from '@/components/layout/sidebar';
import { Megaphone } from '@phosphor-icons/react';
import { DispatchView } from '@/components/dispatch/dispatch-view';

export default function DispatchPage() {
  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <Megaphone size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>디스패치</span>
          </div>
        </header>
        <DispatchView />
      </div>
    </div>
  );
}
