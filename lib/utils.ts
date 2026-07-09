import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 금액 포맷 — n=undefined/null → '', n=0 → '0' (0과 미입력 구분).
 * 호출 시 ₩ 접두사 추가 권장: `₩${formatCurrency(n) || '-'}` (빈값 시 '-' fallback)
 * 또는 `formatMoney(n)` 헬퍼 (₩ + 빈값 처리 자동) 사용 권장.
 */
export function formatCurrency(n?: number | null): string {
  if (n == null) return '';
  return n.toLocaleString('ko-KR');
}

/** ₩ 접두사 + 빈값 처리 — formatCurrency wrapper. 빈값 시 '-' 반환. */
export function formatMoney(n?: number | null, fallback: string = '-'): string {
  if (n == null) return fallback;
  return `₩${n.toLocaleString('ko-KR')}`;
}

/** 빈값 통일 — 모든 페이지 동일 fallback '-'. (사용자 명시 룰: '-' 통일) */
export function displayValue<T>(v: T | undefined | null, fallback: string = '-'): T | string {
  if (v == null) return fallback;
  if (typeof v === 'string' && v.trim() === '') return fallback;
  return v;
}

/** 날짜 통일 — YYYY-MM-DD 포맷 + 빈값 fallback '-'. */
export function displayDate(d?: string | null, fallback: string = '-'): string {
  if (!d) return fallback;
  return d.slice(0, 10);
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

/** YYYY-MM-DD 에 days 를 더한 YYYY-MM-DD. (여러 곳 중복 정의되던 것 통합) */
export function addDays(yyyymmdd: string, days: number): string {
  const d = new Date(yyyymmdd);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysSince(date: string, today: string): number {
  return daysBetween(date, today);
}

/**
 * 계약 기간 (개월 수) — 진짜 calendar months 로 계산. 나누기 X.
 *
 * 정책:
 *  - 만기일 inclusive (한국 계약 관행) — 시작일 ~ 만기일 = (만기일+1) 까지의 month diff.
 *  - 예: 2022-01-01 ~ 2026-01-01 = 48 (4년)
 *  - 예: 2022-01-01 ~ 2025-12-31 = 48 (마지막 날 포함, 다음 시작 1/1)
 *  - 예: 2022-01-01 ~ 2025-01-01 = 36 (3년)
 *
 *  · 시작·만기 둘 다 필수. 빈 값/잘못된 형식 → 0.
 *  · 만기 < 시작 → 0.
 */
export function monthsBetween(startISO: string | undefined, endISO: string | undefined): number {
  if (!startISO || !endISO) return 0;
  const s = new Date(startISO);
  const e = new Date(endISO);
  if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return 0;
  if (e < s) return 0;
  // 만기일 inclusive: end + 1 day 로 정렬 후 calendar 달 diff.
  const eAdj = new Date(e);
  eAdj.setDate(eAdj.getDate() + 1);
  let months = (eAdj.getFullYear() - s.getFullYear()) * 12 + (eAdj.getMonth() - s.getMonth());
  // eAdj 의 일자가 시작 일자보다 작으면 한 달 깎음 (예: 1/15 → 4/14 = 2개월, 4/15 = 3개월).
  if (eAdj.getDate() < s.getDate()) months -= 1;
  return Math.max(0, months);
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
