'use client';

/**
 * /attendance — Sidebar + topbar + AttendanceView (공용 컴포넌트).
 *
 * 일반관리 통합: /general?view=attendance 에서도 동일 AttendanceView 렌더.
 */

import { Sidebar } from '@/components/layout/sidebar';
import { Calendar } from '@phosphor-icons/react';
import { AttendanceView } from '@/components/attendance/attendance-view';

export default function AttendancePage() {
  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <Calendar size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>근태 결재</span>
          </div>
        </header>
        <AttendanceView />
      </div>
    </div>
  );
}
