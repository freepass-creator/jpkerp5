'use client';

/**
 * 오늘 날짜 (한국 기준) — 자동 refresh.
 *
 *   const today = useLiveTodayKr();
 *
 *  · 5분마다 setInterval tick
 *  · document.visibilitychange — 탭 복귀 시 즉시 refresh
 *  · window focus — 다른 앱에서 돌아올 때 refresh
 *  · 같은 day 면 setState 안 함 (불필요 re-render 회피)
 *
 * 사용 의도:
 *   시간 의존 KPI/D-Day/만기 계산 useMemo 의 deps 로 사용 →
 *   자정 통과 또는 사용자 탭 복귀 시 자동 invalidate.
 *
 * 운영현황·미수금·만기·휴차·검사·보험 등 모든 시간 기준 페이지에서
 * todayKr() 직접 호출 대신 이 hook 사용 권장.
 */

import { useEffect, useState } from 'react';
import { todayKr } from '@/lib/mock-data';

export function useLiveTodayKr(): string {
  const [today, setToday] = useState<string>(() => todayKr());
  useEffect(() => {
    const refresh = () => {
      const next = todayKr();
      setToday((cur) => (cur === next ? cur : next));
    };
    const tick = setInterval(refresh, 5 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return today;
}
