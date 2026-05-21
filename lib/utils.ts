import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(n?: number | null): string {
  if (n == null || n === 0) return '';
  return n.toLocaleString('ko-KR');
}

export function formatDate(d?: string | null): string {
  if (!d) return '';
  // YYYY-MM-DD → MM/DD
  if (d.length >= 10) return d.slice(5, 10).replace('-', '/');
  return d;
}

export function formatDateFull(d?: string | null): string {
  if (!d) return '';
  return d.slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export function daysSince(date: string, today: string): number {
  return daysBetween(date, today);
}

export function isOverdue(scheduledDate: string, today: string): boolean {
  return scheduledDate < today;
}

/**
 * 잔여 기간 직관 포맷 — '2년3개월 22일'이면 '2년3개월', '3개월 22일'이면 '3개월',
 * 1개월 미만이면 '22일' 식.
 *
 *   formatRemainingHuman('2026-05-22', '2028-08-15') → '2년2개월'
 *   formatRemainingHuman('2026-05-22', '2026-08-15') → '2개월'
 *   formatRemainingHuman('2026-05-22', '2026-06-10') → '19일'
 *   formatRemainingHuman('2026-05-22', '2026-05-22') → '오늘'
 *   formatRemainingHuman('2026-05-22', '2026-05-20') → 'D+2'  (경과)
 */
export function formatRemainingHuman(from: string, to: string): string {
  if (!from || !to) return '';
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '날짜오류';
  const ms = b.getTime() - a.getTime();
  // 동일 일자
  if (Math.abs(ms) < 12 * 60 * 60 * 1000) return '오늘';
  // sanity 가드 — 잔여 또는 경과가 30년 넘으면 데이터 오류로 판단
  if (Math.abs(ms) > 30 * 365 * 86400000) return '날짜오류';
  // 경과
  if (ms < 0) {
    const dPast = Math.round(-ms / 86400000);
    return `D+${dPast}`;
  }
  // 잔여 — 년/월/일 차이 계산
  let years = b.getFullYear() - a.getFullYear();
  let months = b.getMonth() - a.getMonth();
  let days = b.getDate() - a.getDate();
  if (days < 0) {
    months -= 1;
    const prevLast = new Date(b.getFullYear(), b.getMonth(), 0).getDate();
    days += prevLast;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years > 0) return `${years}년${months}개월`;
  if (months > 0) return `${months}개월`;
  return `${days}일`;
}

/** YYYY-MM-DD → YY.MM.DD (한 줄 계약기간 표시용) */
export function shortDate(d?: string | null): string {
  if (!d || d.length < 10) return '';
  return `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`;
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** YYYY-MM-DD → "2026-05-14 (목)" */
export function dateWithDow(d: string): string {
  if (!d || d.length < 10) return d;
  const dt = new Date(d);
  const dow = DOW[dt.getDay()];
  return `${d.slice(0, 10)} (${dow})`;
}

/** 인도일 ~ 반납예정일 한 줄 표기 */
export function formatPeriod(from?: string | null, to?: string | null): string {
  if (!from && !to) return '';
  if (!to) return shortDate(from);
  if (!from) return `~ ${shortDate(to)}`;
  return `${shortDate(from)} ~ ${shortDate(to)}`;
}
