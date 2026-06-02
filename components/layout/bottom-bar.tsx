'use client';

import type { ReactNode } from 'react';

/**
 * 페이지 하단 액션바.
 * 자산·계약·재무 통일 규격:
 *   - 좌측: 모든 액션 버튼 (등록·수정·복사·삭제·엑셀)
 *   - 우측: 카톡·알림 popup 영역 (비워둠)
 *
 * 사용:
 *   <BottomBar
 *     left={<><button>+ 신규</button><span className="btn-sep"/><button>엑셀</button></>}
 *     right={null}
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
