/**
 * 수납 스케줄 — 생성 / 미수 자동 분배 / 결제 매칭 (선입선출).
 *
 * 운영현황 업로드 시 흐름:
 *   1) generateSchedules(c)           → 1~termMonths 회차 생성 (status='예정', paidAmount=0)
 *   2) distributeUnpaid(s, unpaid, t) → 미수 금액을 직전 회차부터 역순으로 미납 분배
 *      · today 이전 회차들이 대상
 *      · monthlyRent 정수배는 '연체', 마지막 잉여는 '부분납'
 *      · 나머지 과거 회차는 '완료' (paidAmount = amount)
 *      · today 이후 회차는 '예정' 유지
 *   3) Contract.schedules = result 로 저장
 *
 * 결제 들어오면 (Phase 2):
 *   applyPayment(schedules, amount, txDate) → 선입선출로 가장 오래된 미납부터 차감.
 */

import type { Contract, PaymentSchedule } from './types';

/** YYYY-MM-DD + n개월 → 같은 day-of-month 의 다음 달 (월말 보정) */
function addMonths(iso: string, months: number, day: number): string {
  if (!iso) return '';
  const [y, m] = iso.split('-').map((s) => parseInt(s, 10));
  const targetM0 = (m - 1) + months;
  const year = y + Math.floor(targetM0 / 12);
  const month = ((targetM0 % 12) + 12) % 12 + 1;
  // 해당 달 마지막 날
  const lastDay = new Date(year, month, 0).getDate();
  const d = Math.min(day, lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * 계약 정보로 회차 N개 생성.
 *  - dueDate: 계약일 + (seq-1) 개월, paymentDay 적용
 *  - 모든 회차 status='예정', paidAmount=0
 */
export function generateSchedules(c: {
  contractDate: string;
  termMonths: number;
  monthlyRent: number;
  paymentDay: number;
}): Array<Omit<PaymentSchedule, 'id' | 'contractId'>> {
  const out: Array<Omit<PaymentSchedule, 'id' | 'contractId'>> = [];
  const total = Math.max(0, c.termMonths | 0);
  for (let i = 0; i < total; i++) {
    out.push({
      seq: i + 1,
      dueDate: addMonths(c.contractDate, i, c.paymentDay),
      amount: c.monthlyRent,
      status: '예정',
      paidAmount: 0,
    });
  }
  return out;
}

/**
 * 미수 금액을 직전 회차부터 역순으로 분배.
 *
 *  - today 이전 회차들 중 가장 최근부터 미납 채움
 *  - remaining >= amount → '연체' (paidAmount = 0)
 *  - 0 < remaining < amount → '부분납' (paidAmount = amount - remaining)
 *  - remaining = 0 → '완료' (paidAmount = amount)
 *  - today 이후 회차는 손대지 않음 (예정 유지)
 *
 * 새 배열 반환 — 원본 불변.
 */
export function distributeUnpaid<T extends Pick<PaymentSchedule, 'seq' | 'dueDate' | 'amount' | 'status' | 'paidAmount'>>(
  schedules: T[],
  unpaidAmount: number,
  today: string,
): T[] {
  const list = schedules.map((s) => ({ ...s }));
  let remaining = Math.max(0, Math.round(unpaidAmount));

  // 회차를 dueDate 오름차순으로 정렬 후 가장 최근부터 역순
  const sorted = [...list].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const s = sorted[i];
    if (s.dueDate > today) {
      // 미래 회차 — 예정 유지
      s.status = '예정';
      s.paidAmount = 0;
      continue;
    }
    if (remaining <= 0) {
      s.status = '완료';
      s.paidAmount = s.amount;
    } else if (remaining >= s.amount) {
      s.status = '연체';
      s.paidAmount = 0;
      remaining -= s.amount;
    } else {
      s.status = '부분납';
      s.paidAmount = s.amount - remaining;
      remaining = 0;
    }
  }

  // 원래 순서대로 결과 매핑
  const map = new Map(sorted.map((s) => [s.seq, s]));
  return list.map((s) => map.get(s.seq) ?? s);
}

/** 회차 배열에서 currentSeq (가장 오래된 미납 또는 부분납. 없으면 다음 예정) 계산 */
export function computeCurrentSeq(schedules: Array<Pick<PaymentSchedule, 'seq' | 'status' | 'dueDate'>>, today: string): number {
  // 미납/부분납 중 가장 오래된 거
  const overdue = schedules
    .filter((s) => s.status === '연체' || s.status === '부분납')
    .sort((a, b) => a.seq - b.seq);
  if (overdue.length > 0) return overdue[0].seq;
  // 예정 중 가장 빠른 dueDate
  const upcoming = schedules
    .filter((s) => s.status === '예정' && s.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (upcoming.length > 0) return upcoming[0].seq;
  // 다 완료
  return schedules.length;
}

/** 회차 배열 → 미수 합계 (연체·부분납의 미지급 부분 합) */
export function totalUnpaid(schedules: Array<Pick<PaymentSchedule, 'amount' | 'status' | 'paidAmount'>>): number {
  let s = 0;
  for (const x of schedules) {
    if (x.status === '연체') s += x.amount;
    else if (x.status === '부분납') s += Math.max(0, x.amount - x.paidAmount);
  }
  return s;
}

/** 회차 배열 → 미납 회차 수 */
export function totalUnpaidCount(schedules: Array<Pick<PaymentSchedule, 'status'>>): number {
  return schedules.filter((s) => s.status === '연체' || s.status === '부분납').length;
}

/**
 * 결제 적용 — 선입선출로 가장 오래된 미납부터 차감.
 * 잔여 금액(잉여)은 leftover로 반환 — 다음 회차 prepay 또는 미매칭으로 처리.
 */
export function applyPayment<T extends Pick<PaymentSchedule, 'seq' | 'dueDate' | 'amount' | 'status' | 'paidAmount'>>(
  schedules: T[],
  amount: number,
  _txDate: string,
): { schedules: T[]; leftover: number } {
  const list = schedules.map((s) => ({ ...s }));
  let remaining = Math.max(0, Math.round(amount));

  // 미납/부분납 → 예정 순서로, 같은 카테고리 안에서는 dueDate 오름차순
  const ordered = [...list].sort((a, b) => {
    const ra = rank(a.status);
    const rb = rank(b.status);
    if (ra !== rb) return ra - rb;
    return a.dueDate.localeCompare(b.dueDate);
  });

  for (const s of ordered) {
    if (remaining <= 0) break;
    const owed = s.status === '연체' ? s.amount
      : s.status === '부분납' ? Math.max(0, s.amount - s.paidAmount)
      : s.status === '예정' ? s.amount
      : 0;
    if (owed <= 0) continue;
    if (remaining >= owed) {
      s.paidAmount = s.amount;
      s.status = '완료';
      remaining -= owed;
    } else {
      s.paidAmount += remaining;
      s.status = '부분납';
      remaining = 0;
    }
  }

  const map = new Map(ordered.map((s) => [s.seq, s]));
  return {
    schedules: list.map((s) => map.get(s.seq) ?? s),
    leftover: remaining,
  };
}

function rank(status: PaymentSchedule['status']): number {
  if (status === '연체') return 0;
  if (status === '부분납') return 1;
  if (status === '예정') return 2;
  if (status === '완료') return 3;
  return 4;
}
