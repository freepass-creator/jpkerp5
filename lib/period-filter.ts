/**
 * 기간 필터 — 재무·운영 페이지 공통.
 * UI: 하단바 chip 그룹 (오늘 / 이번 주 / 이번 달 / 이번 분기 / 올해 / 전체)
 * 필터: row의 날짜 필드 vs 기간 시작·끝.
 */

export type Period = '오늘' | '이번주' | '이번달' | '이번분기' | '올해' | '전체';

export const PERIODS: Period[] = ['오늘', '이번주', '이번달', '이번분기', '올해', '전체'];

export type PeriodRange = {
  start: Date | null;
  end: Date | null;
};

/** Period → [start, end] (inclusive). 전체는 null/null */
export function periodRange(p: Period, today: Date = new Date()): PeriodRange {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  switch (p) {
    case '전체': return { start: null, end: null };
    case '오늘': {
      const end = new Date(t); end.setHours(23, 59, 59, 999);
      return { start: t, end };
    }
    case '이번주': {
      const dow = t.getDay(); // 0=일~6=토
      const start = new Date(t); start.setDate(t.getDate() - dow);
      const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case '이번달': {
      const start = new Date(t.getFullYear(), t.getMonth(), 1);
      const end = new Date(t.getFullYear(), t.getMonth() + 1, 0); end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case '이번분기': {
      const q = Math.floor(t.getMonth() / 3);
      const start = new Date(t.getFullYear(), q * 3, 1);
      const end = new Date(t.getFullYear(), q * 3 + 3, 0); end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case '올해': {
      const start = new Date(t.getFullYear(), 0, 1);
      const end = new Date(t.getFullYear(), 11, 31); end.setHours(23, 59, 59, 999);
      return { start, end };
    }
  }
}

/** dateStr 가 range 안인지. range 양쪽 null이면 항상 true. */
export function isInRange(dateStr: string | undefined, range: PeriodRange): boolean {
  if (!range.start && !range.end) return true;
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return false;
  if (range.start && t < range.start.getTime()) return false;
  if (range.end && t > range.end.getTime()) return false;
  return true;
}
