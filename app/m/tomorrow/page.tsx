'use client';

/**
 * 모바일 내일 할 일 — 시간 기준 통합 뷰 (동일 패턴, 날짜만 +1일).
 */

import { SchedulePage } from '../today/page';
import { todayKr } from '@/lib/mock-data';

export default function MobileTomorrow() {
  const today = new Date(todayKr());
  today.setDate(today.getDate() + 1);
  const tomorrow = today.toISOString().slice(0, 10);
  return <SchedulePage targetDate={tomorrow} title="내일 할 일" />;
}
