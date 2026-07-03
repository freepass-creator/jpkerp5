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

import type { Contract, PaymentSchedule, PaymentScheduleInline, PaymentEntry, DiscountEntry, ScheduleStatus } from './types';

/* ──────────────── 분납·선납·할인 entry 헬퍼 ──────────────── */

/** payments 합계 — undefined 안전 */
export function sumPayments(s: { payments?: PaymentEntry[] }): number {
  return (s.payments ?? []).reduce((sum, p) => sum + (p.amount || 0), 0);
}

/** discounts 합계 — undefined 안전 */
export function sumDiscounts(s: { discounts?: DiscountEntry[] }): number {
  return (s.discounts ?? []).reduce((sum, d) => sum + (d.amount || 0), 0);
}

/** 실 청구금액 = amount - 할인합계 */
export function effectiveAmount(s: { amount: number; discounts?: DiscountEntry[] }): number {
  return Math.max(0, s.amount - sumDiscounts(s));
}

/** 잔액 = 실청구 - 납부합계 (음수면 0) */
export function balance(s: { amount: number; discounts?: DiscountEntry[]; payments?: PaymentEntry[] }): number {
  return Math.max(0, effectiveAmount(s) - sumPayments(s));
}

/** payments·discounts 배열로부터 status·paidAmount·discountAmount·paidAt 자동 재계산 */
export function recalcSchedule<T extends PaymentScheduleInline>(s: T, today: string): T {
  const paid = sumPayments(s);
  const disc = sumDiscounts(s);
  const lastDate = (s.payments ?? []).reduce<string>((mx, p) => p.date > mx ? p.date : mx, '');
  if (s.status === '면제') return { ...s, paidAmount: paid, discountAmount: disc };
  const effective = Math.max(0, s.amount - disc);
  let status: ScheduleStatus;
  if (effective === 0 && disc > 0) status = '완료';        // 할인으로 전액 처리
  else if (paid >= effective) status = '완료';
  else if (paid > 0 || disc > 0) status = '부분납';        // 일부 납부 또는 일부 할인
  else status = s.dueDate < today ? '연체' : '예정';
  return { ...s, status, paidAmount: paid, discountAmount: disc, paidAt: lastDate || undefined };
}

/** 한 회차에 payment entry 추가 + 재계산 + 초과분 반환 (선납 처리용) */
export function addPaymentEntry<T extends PaymentScheduleInline>(
  s: T,
  entry: PaymentEntry,
  today: string,
): { schedule: T; leftover: number } {
  const list = [...(s.payments ?? []), entry];
  const effective = effectiveAmount(s);
  const paid = list.reduce((sum, p) => sum + p.amount, 0);
  const leftover = Math.max(0, paid - effective);
  // 초과분은 entry.amount에서 깎고 leftover만큼 빼서 마지막 entry 조정
  if (leftover > 0) {
    list[list.length - 1] = { ...entry, amount: entry.amount - leftover };
  }
  const next = recalcSchedule({ ...s, payments: list }, today);
  return { schedule: next, leftover };
}

/**
 * 계약 전체를 오늘 날짜 기준으로 재계산 — read 시점에 호출.
 *
 *   - 각 회차의 status를 dueDate + payments + discounts + today로 다시 결정
 *     (스냅샷 업로드 후 시간 흐르면 '예정' → '연체' 자동 전환)
 *   - unpaidAmount / unpaidSeqCount / currentSeq 캐시 재계산
 *
 * DB에는 쓰지 않고 화면 표시용으로만 사용. read transform에 적용.
 */
export function recalcContract<T extends Contract>(c: T, today: string): T {
  if (!c.schedules || c.schedules.length === 0) return c;
  // 반납완료된 계약은 returnedDate 이후 회차 = 자동 면제 처리 (미수 0)
  const returnedCutoff = c.returnedDate;
  // 선불/후불 정책 반영 — 1회차 dueDate 자동 재계산.
  // 선불: 1회차 = 계약일. 후불: 1회차 = 계약일 + 1개월.
  // paidAmount/status 보존 (이미 입금된 회차 보호) — dueDate 만 갱신.
  const isPostpaid = c.paymentTiming === '후불';
  const recalcedSchedules = c.schedules.map((s) => {
    const expectedDueDate = c.contractDate
      ? addMonths(c.contractDate, isPostpaid ? s.seq : s.seq - 1, c.paymentDay)
      : s.dueDate;
    const withDueDate = s.dueDate !== expectedDueDate ? { ...s, dueDate: expectedDueDate } : s;
    if (returnedCutoff && withDueDate.dueDate > returnedCutoff) {
      return { ...withDueDate, status: '면제' as const, paidAmount: withDueDate.amount, paidAt: withDueDate.paidAt };
    }
    return recalcSchedule(withDueDate, today);
  });
  // 미수 = sum(연체·부분납 회차의 잔액). 면제는 제외.
  let unpaidAmount = 0;
  let unpaidSeqCount = 0;
  for (const s of recalcedSchedules) {
    if (s.status === '연체') {
      unpaidAmount += effectiveAmount(s);
      unpaidSeqCount += 1;
    } else if (s.status === '부분납') {
      unpaidAmount += Math.max(0, effectiveAmount(s) - s.paidAmount);
      unpaidSeqCount += 1;
    }
  }
  const overdue = recalcedSchedules.filter((s) => s.status === '연체' || s.status === '부분납').sort((a, b) => a.seq - b.seq);
  const upcoming = recalcedSchedules.filter((s) => s.status === '예정' && s.dueDate >= today).sort((a, b) => a.seq - b.seq);
  const currentSeq = overdue[0]?.seq ?? upcoming[0]?.seq ?? recalcedSchedules.length;
  // 사용자 명시: 계약기간 = 회차 수. totalSeq = termMonths 강제 동기 (불일치 방지)
  const totalSeq = c.termMonths;
  return {
    ...c,
    schedules: recalcedSchedules,
    unpaidAmount,
    unpaidSeqCount,
    currentSeq,
    totalSeq,
  };
}

/** 한 회차에 할인 entry 추가 + 재계산. 할인 합계가 청구금액 초과 시 자동 cap. */
export function addDiscountEntry<T extends PaymentScheduleInline>(
  s: T,
  entry: DiscountEntry,
  today: string,
): T {
  const existing = sumDiscounts(s);
  const cap = Math.max(0, s.amount - existing);
  const capped: DiscountEntry = { ...entry, amount: Math.min(entry.amount, cap) };
  if (capped.amount <= 0) return s;
  const list = [...(s.discounts ?? []), capped];
  return recalcSchedule({ ...s, discounts: list }, today);
}

/** 입금 한 건을 FIFO로 여러 회차에 자동 분배 (선납·분납·정산 통합) */
export function distributeEntry<T extends PaymentScheduleInline>(
  schedules: T[],
  entry: PaymentEntry,
  today: string,
): { schedules: T[]; consumed: Array<{ seq: number; amount: number }> } {
  const list = schedules.map((s) => ({ ...s }));
  // seq → 원본 인덱스 Map (find 반복 회피 — O(N²) → O(N))
  const idxBySeq = new Map<number, number>();
  list.forEach((s, i) => idxBySeq.set(s.seq, i));
  // 미납 우선 (연체·부분납 → 예정), 같은 카테고리 안에서는 seq 오름차순
  const ordered = [...list].sort((a, b) => {
    const ra = rank(a.status);
    const rb = rank(b.status);
    if (ra !== rb) return ra - rb;
    return a.seq - b.seq;
  });
  let remaining = Math.max(0, Math.round(entry.amount));
  const consumed: Array<{ seq: number; amount: number }> = [];
  for (const s of ordered) {
    if (remaining <= 0) break;
    if (s.status === '면제') continue;
    const owed = Math.max(0, effectiveAmount(s) - sumPayments(s));
    if (owed <= 0) continue;
    const apply = Math.min(owed, remaining);
    const idx = idxBySeq.get(s.seq);
    if (idx === undefined) continue;
    const { schedule } = addPaymentEntry(list[idx], { ...entry, amount: apply }, today);
    list[idx] = schedule;
    consumed.push({ seq: s.seq, amount: apply });
    remaining -= apply;
  }
  return { schedules: list, consumed };
}

/** legacy 모델 (payments 없고 paidAmount만 있는 회차) → payments 배열 마이그레이션 */
export function migrateLegacySchedules<T extends PaymentScheduleInline>(schedules: T[]): T[] {
  return schedules.map((s) => {
    if (s.payments && s.payments.length > 0) return s;
    if (s.paidAmount > 0) {
      // 정산 entry 1건으로 변환 — paidAt 있으면 그 날짜, 없으면 dueDate
      const date = s.paidAt || s.dueDate;
      const payments: PaymentEntry[] = [{ date, amount: s.paidAmount, source: '정산', memo: '스냅샷 자동 정리' }];
      return { ...s, payments };
    }
    return { ...s, payments: [] };
  });
}

/**
 * 만기·연장 날짜 계산 SSOT — iso + months, iso 의 day-of-month 유지 (월말 clamp, 타임존 안전).
 * Date.setMonth() (clamp 없음 + UTC 시프트) 대신 이 문자열 기반 함수를 만기 계산 전반에 사용.
 */
export function addMonthsKeepDay(iso: string, months: number): string {
  if (!iso) return '';
  const day = parseInt(iso.split('-')[2] ?? '1', 10) || 1;
  return addMonths(iso, months, day);
}

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
 *  - 선불 (default): dueDate = 계약일 + (seq-1) 개월 (1회차 = 계약일)
 *  - 후불: dueDate = 계약일 + seq 개월 (1회차 = 계약일 + 1개월)
 *    예: 2026-05-05 계약 + 후불 → 1회차 2026-06-05
 *  - 모든 회차 status='예정', paidAmount=0
 */
export function generateSchedules(c: {
  contractDate: string;
  termMonths: number;
  monthlyRent: number;
  paymentDay: number;
  paymentTiming?: '선불' | '후불';
}): Array<Omit<PaymentSchedule, 'id' | 'contractId'>> {
  const out: Array<Omit<PaymentSchedule, 'id' | 'contractId'>> = [];
  const total = Math.max(0, c.termMonths | 0);
  const isPostpaid = c.paymentTiming === '후불';
  for (let i = 0; i < total; i++) {
    const offset = isPostpaid ? i + 1 : i;
    out.push({
      seq: i + 1,
      dueDate: addMonths(c.contractDate, offset, c.paymentDay),
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
export function distributeUnpaid<T extends PaymentScheduleInline>(
  schedules: T[],
  unpaidAmount: number,
  today: string,
  lastPaidDate?: string,
): T[] {
  const list = schedules.map((s) => ({ ...s, payments: [] as PaymentEntry[] }));
  let remaining = Math.max(0, Math.round(unpaidAmount));

  // dueDate 오름차순 정렬 후 가장 최근부터 역순 — 미수 채움
  const sorted = [...list].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const s = sorted[i];
    if (s.dueDate > today) {
      // 미래 회차 — 예정 유지 (payments 비움)
      s.status = '예정';
      s.paidAmount = 0;
      s.paidAt = undefined;
      continue;
    }
    // lastPaidDate 이전(또는 같음) 회차는 자동 완료 처리 — 그 시점까지는 정산됨
    if (lastPaidDate && s.dueDate <= lastPaidDate) {
      s.payments = [{ date: lastPaidDate, amount: s.amount, source: '정산', memo: `마지막입금일(${lastPaidDate}) 이전 자동 정산` }];
      s.status = '완료';
      s.paidAmount = s.amount;
      s.paidAt = lastPaidDate;
      continue;
    }
    if (remaining <= 0) {
      // 과거 회차 + 미수 다 차감됨 → 정산 entry 추가
      s.payments = [{ date: s.dueDate, amount: s.amount, source: '정산', memo: '스냅샷 자동 정리' }];
      s.status = '완료';
      s.paidAmount = s.amount;
      s.paidAt = s.dueDate;
    } else if (remaining >= s.amount) {
      s.status = '연체';
      s.paidAmount = 0;
      s.paidAt = undefined;
      remaining -= s.amount;
    } else {
      // 부분납 — 채워진 부분만 정산 entry로
      const paid = s.amount - remaining;
      s.payments = [{ date: s.dueDate, amount: paid, source: '정산', memo: '스냅샷 자동 정리 (부분)' }];
      s.status = '부분납';
      s.paidAmount = paid;
      s.paidAt = s.dueDate;
      remaining = 0;
    }
  }

  // 원래 순서대로 결과 매핑
  const map = new Map(sorted.map((s) => [s.seq, s]));
  return list.map((s) => map.get(s.seq) ?? s) as T[];
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

/** 회차 배열 → 미수 합계 (연체·부분납의 미지급 부분 합, 할인 차감) */
export function totalUnpaid(schedules: Array<Pick<PaymentScheduleInline, 'amount' | 'status' | 'paidAmount' | 'discountAmount' | 'discounts'>>): number {
  let s = 0;
  for (const x of schedules) {
    const disc = x.discountAmount ?? (x.discounts ?? []).reduce((sum, d) => sum + d.amount, 0);
    const effective = Math.max(0, x.amount - disc);
    if (x.status === '연체') s += effective;
    else if (x.status === '부분납') s += Math.max(0, effective - x.paidAmount);
  }
  return s;
}

/** 회차 배열 → 미납 회차 수 */
export function totalUnpaidCount(schedules: Array<Pick<PaymentSchedule, 'status'>>): number {
  return schedules.filter((s) => s.status === '연체' || s.status === '부분납').length;
}

/**
 * 결제 적용 — 선입선출로 가장 오래된 미납부터 차감.
 * payment entry로 기록되어 분납·선납 history 보존.
 * 잔여 금액(leftover)은 미매칭으로 처리.
 */
export function applyPayment<T extends PaymentScheduleInline>(
  schedules: T[],
  amount: number,
  txDate: string,
  entrySource: PaymentEntry['source'] = '수동',
  entryMeta?: Partial<Pick<PaymentEntry, 'txId' | 'cardTxId' | 'memo' | 'by'>>,
): { schedules: T[]; leftover: number; consumed: Array<{ seq: number; amount: number }> } {
  const entry: PaymentEntry = {
    date: txDate,
    amount: Math.max(0, Math.round(amount)),
    source: entrySource,
    ...(entryMeta ?? {}),
    at: new Date().toISOString(),
  };
  const { schedules: next, consumed } = distributeEntry(schedules, entry, txDate);
  const totalConsumed = consumed.reduce((s, x) => s + x.amount, 0);
  return { schedules: next, leftover: entry.amount - totalConsumed, consumed };
}

function rank(status: PaymentSchedule['status']): number {
  if (status === '연체') return 0;
  if (status === '부분납') return 1;
  if (status === '예정') return 2;
  if (status === '완료') return 3;
  return 4;
}
