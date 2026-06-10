'use client';

/**
 * 빈 테이블 행 — 모든 list 페이지 동일 규격.
 *
 *  기존 패턴 (가장 많이 쓰임):
 *    <tr><td colSpan={N} className="muted center" style={{ padding: 32 }}>{메시지}</td></tr>
 *
 *  통일:
 *    <EmptyRow colSpan={N}>{메시지}</EmptyRow>
 *
 *  · padding 32px (일관)
 *  · 문구는 자유 — 도메인별로 의미가 달라서 일률 강제 X. 단 사용자가 다음 액션을 알 수 있게 작성.
 *    좋은 예: "등록된 차량이 없습니다 — [+ 차량 등록] 으로 시작"
 *    나쁜 예: "—" (행동 유도 부재)
 */

import type { ReactNode } from 'react';

export function EmptyRow({
  colSpan,
  children,
  padding = 32,
}: {
  colSpan: number;
  children: ReactNode;
  /** 기본 32 — 더 좁은 행이 필요한 경우만 override */
  padding?: number;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="muted center" style={{ padding }}>
        {children}
      </td>
    </tr>
  );
}
