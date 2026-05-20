'use client';

import type { ReactNode } from 'react';

/**
 * 페이지 하단 액션바. 좌측엔 stats/상태, 우측엔 액션 버튼.
 * 모든 페이지 동일 위치 (운영현황·과태료 모두 사용).
 *
 * 사용:
 *   <BottomBar
 *     left={<>선택 <strong>3</strong>건 · 합계 <strong>120만</strong></>}
 *     right={<><button>...</button><button>...</button></>}
 *   />
 */
export function BottomBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <footer className="bottom-bar">
      <div className="bottom-bar-left">{left}</div>
      <div className="bottom-bar-right">{right}</div>
    </footer>
  );
}
