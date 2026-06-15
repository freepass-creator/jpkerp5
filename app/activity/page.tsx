'use client';

/**
 * /activity — Sidebar + topbar + ActivityView (공용 컴포넌트).
 *
 * 일반관리 통합: /general?view=activity 에서도 동일 ActivityView 렌더.
 */

import { Sidebar } from '@/components/layout/sidebar';
import { Pulse } from '@phosphor-icons/react';
import { ActivityView } from '@/components/activity/activity-view';

export default function ActivityPage() {
  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <Pulse size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>활동 피드</span>
          </div>
        </header>
        <ActivityView />
      </div>
    </div>
  );
}
