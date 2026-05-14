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
