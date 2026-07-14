/**
 * Contract.vehicleStatus + 만기일 파생 → 단일 Stage 값.
 * 상세 다이얼로그와 목록(운영현황·자산·계약)이 같은 값을 보여주도록 한 곳에서 결정.
 *
 *  - 내부 Stage 값은 vehicleStatus 와 같지만, 운행+만기D-90 → '만기임박' 으로 파생
 *  - stageLabel() 로 표시용 라벨 변환 ('운행' → '계약중', '매각' → '매각완료')
 */

import type { Contract } from '@/lib/types';
import { todayKr } from '@/lib/mock-data';
import { daysSince } from '@/lib/utils';
import { addMonthsKeepDay } from '@/lib/payment-schedule';

export type Stage =
  | '구매대기' | '등록대기'
  | '상품화대기' | '상품화중' | '상품대기'
  | '운행'
  | '만기경과' | '만기임박' | '연장대기' | '종료대기'
  | '휴차대기' | '매각검토' | '매각대기' | '매각'
  | '휴차' | '임시배차';

/** 만기일 — contractDate + termMonths 기준 (계약 기간이 진실).
 *  문자열 기반 addMonthsKeepDay 사용 — 월말 clamp + 타임존 안전 (기존 Date.setMonth 는
 *  clamp 없어 1/31+1개월=3/3, UTC 파싱으로 하루 밀림 → 회차 dueDate 와 만기 표시가 어긋났음). */
export function getExpiryDate(c: Contract): string | null {
  if (c.contractDate && c.termMonths && c.termMonths > 0) {
    const expiry = addMonthsKeepDay(c.contractDate, c.termMonths);
    if (expiry) return expiry;
  }
  return c.returnScheduledDate ?? null;
}

/** 만기까지 남은 일수 — 음수면 경과 */
export function daysToExpiry(c: Contract, today: string = todayKr()): number | null {
  const expiry = getExpiryDate(c);
  if (!expiry) return null;
  const a = new Date(today).getTime();
  const b = new Date(expiry).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** 만기 D-90 이내 (음수 = 경과 포함) */
export function isNearExpiry(c: Contract, today: string = todayKr()): boolean {
  const d = daysToExpiry(c, today);
  return d !== null && d <= 90;
}

/** 계약 1건 → 현재 stage */
export function currentStage(c: Contract, today: string = todayKr()): Stage {
  function runningExpiry(): Stage {
    const d = daysToExpiry(c, today);
    if (d !== null && d < 0) return '만기경과';
    if (d !== null && d <= 90) return '만기임박';
    return '운행';
  }
  switch (c.vehicleStatus) {
    case '운행': return runningExpiry();
    case '연장대기': return '연장대기';
    case '종료대기': return '종료대기';
    case '매각': return '매각';
    case '매각대기': return '매각대기';
    case '매각검토': return '매각검토';
    case '휴차대기': return '휴차대기';
    case '상품대기': return '상품대기';
    case '상품화중': return '상품화중';
    case '상품화대기': return '상품화대기';
    case '등록대기': return '등록대기';
    case '구매대기': return '구매대기';
    case '휴차': return '휴차';
    case '임시배차': return '임시배차';
    case '인도대기':
    case '출고대기': return '상품대기';
  }
  if (c.returnedDate || c.status === '반납') return '휴차대기';
  if (c.deliveredDate && c.status === '운행') return runningExpiry();
  if (c.status === '운행') return runningExpiry();
  return '구매대기';
}

/** 표시용 라벨 — '운행' → '계약중', '매각' → '매각완료' */
export function stageLabel(s: Stage): string {
  if (s === '운행') return '계약중';
  if (s === '매각') return '매각완료';
  return s;
}

/** 계약 1건의 현재 표시 라벨 한방. */
export function contractStageLabel(c: Contract, today: string = todayKr()): string {
  return stageLabel(currentStage(c, today));
}

/* ─────────────── 운영현황 3종 상태 (차량/계약/수납) ─────────────── */

/** 차량상태 — 차량 자체의 물리적 라이프사이클 */
export type VehicleState =
  | '구매대기' | '등록대기' | '상품화중' | '인도대기' | '운행중'
  | '휴차대기' | '휴차' | '매각검토' | '매각대기' | '매각완료'
  | '반납';

export function getVehicleState(c: Contract): { name: VehicleState; days: number } {
  const today = todayKr();
  if (c.vehicleStatus === '매각')   return { name: '매각완료', days: c.idleSince ? daysSince(c.idleSince, today) : 0 };
  if (c.vehicleStatus === '매각대기') return { name: '매각대기', days: c.idleSince ? daysSince(c.idleSince, today) : 0 };
  if (c.vehicleStatus === '매각검토') return { name: '매각검토', days: c.idleSince ? daysSince(c.idleSince, today) : 0 };
  if (c.vehicleStatus === '휴차대기') return { name: '휴차대기', days: c.idleSince ? daysSince(c.idleSince, today) : 0 };
  if (c.vehicleStatus === '휴차')   return { name: '휴차', days: c.idleSince ? daysSince(c.idleSince, today) : 0 };
  if (c.returnedDate || c.status === '반납' || c.vehicleStatus === '반납') {
    return { name: '반납', days: c.returnedDate ? daysSince(c.returnedDate, today) : 0 };
  }
  if (c.customerName?.trim()) {
    const start = c.deliveredDate ?? c.contractDate;
    return { name: '운행중', days: daysSince(start, today) };
  }
  if (c.vehicleStatus === '구매대기') return { name: '구매대기', days: daysSince(c.contractDate, today) };
  if (c.vehicleStatus === '등록대기') return { name: '등록대기', days: daysSince(c.purchasedDate ?? c.contractDate, today) };
  if (c.vehicleStatus === '상품화중' || c.vehicleStatus === '상품화대기') {
    return { name: '상품화중', days: daysSince(c.registeredDate ?? c.contractDate, today) };
  }
  return { name: '휴차대기', days: daysSince(c.readiedDate ?? c.contractDate, today) };
}

/** 계약상태 — 계약 라이프사이클 + 컴플라이언스 + 계약없음. 우선순위: 위반 > 미수검 > 연장 > 종료 > 만기경과 > 만기임박 > 확정대기 > 계약중 > 계약없음 */
export type ContractState = '계약없음' | '확정대기' | '계약중' | '만기임박' | '만기경과' | '연장대기' | '종료대기' | '미수검' | '위반';

export function getContractState(c: Contract): { name: ContractState; days: number } {
  const today = todayKr();
  if (!c.customerName?.trim()) return { name: '계약없음', days: 0 };
  if (c.hasViolations) {
    return { name: '위반', days: c.violationSince ? daysSince(c.violationSince, today) : 0 };
  }
  if (c.inspectionDueDate && c.inspectionDueDate < today) {
    return { name: '미수검', days: daysSince(c.inspectionDueDate, today) };
  }
  if (c.vehicleStatus === '연장대기') return { name: '연장대기', days: 0 };
  if (c.vehicleStatus === '종료대기') {
    const d = daysToExpiry(c, today);
    return { name: '종료대기', days: d !== null ? Math.max(0, -d) : 0 };
  }
  // 확정대기 — 계약 체결됐으나 차량 인도 전.
  // 정의: customerName 있음 + deliveredDate 없음 + status='대기' (또는 vehicleStatus 인도대기/출고대기/상품대기/재고)
  // 출고 일정 관리 + 보증금 입금 추적 단계 (업무흐름도 Ⅳ ② 계약확정 절차)
  const isPreDelivery = !c.deliveredDate && (
    c.status === '대기' ||
    c.vehicleStatus === '인도대기' ||
    c.vehicleStatus === '출고대기' ||
    c.vehicleStatus === '상품대기' ||
    c.vehicleStatus === '재고'
  );
  if (isPreDelivery) return { name: '확정대기', days: daysSince(c.contractDate, today) };
  const isRunning = c.vehicleStatus === '운행' || (c.deliveredDate && c.status === '운행');
  if (isRunning) {
    const d = daysToExpiry(c, today);
    if (d !== null && d < 0) return { name: '만기경과', days: -d };
    if (d !== null && d <= 90) return { name: '만기임박', days: d };
  }
  return { name: '계약중', days: daysSince(c.contractDate, today) };
}

/** 수납상태 (4종) — 결제 건전성. 휴차/매각 차량은 결제 멈춤 상태 */
export type PaymentState = '정상' | '미납' | '휴차' | '종결';

export function getPaymentState(c: Contract): { name: PaymentState; days: number } {
  const today = todayKr();
  if (c.vehicleStatus === '휴차' || c.vehicleStatus === '휴차대기' || c.vehicleStatus === '매각검토') {
    return { name: '휴차', days: c.idleSince ? daysSince(c.idleSince, today) : 0 };
  }
  if (c.vehicleStatus === '매각' || c.vehicleStatus === '매각대기' || c.status === '반납' || c.status === '해지') {
    return { name: '종결', days: 0 };
  }
  if ((c.unpaidAmount ?? 0) <= 0) {
    return { name: '정상', days: daysSince(c.lastPaidDate ?? c.contractDate, today) };
  }
  const overdueSchedules = (c.schedules ?? [])
    .filter((s) => (s.status === '연체' || s.status === '부분납') && s.dueDate <= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (overdueSchedules.length > 0) {
    return { name: '미납', days: Math.max(0, daysSince(overdueSchedules[0].dueDate, today)) };
  }
  if (c.currentSeq && c.contractDate) {
    const [y, m] = c.contractDate.split('-').map((s) => parseInt(s, 10));
    const targetM0 = (m - 1) + (c.currentSeq - 1);
    const year = y + Math.floor(targetM0 / 12);
    const month = ((targetM0 % 12) + 12) % 12 + 1;
    const lastDay = new Date(year, month, 0).getDate();
    const d = Math.min(c.paymentDay || 1, lastDay);
    const oldestDue = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return { name: '미납', days: Math.max(0, daysSince(oldestDue, today)) };
  }
  return { name: '미납', days: 0 };
}
