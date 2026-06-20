/**
 * D-Day 자동 알림 — 만기 임박 항목 집계.
 *
 * 대상:
 *   - 정기검사 만기 (inspectionDueDate)
 *   - 자동차보험 만기 (insuranceExpiryDate)
 *   - 자동차세 납부 (vehicleTaxDueDate)
 *   - 운전면허 만기 (customerLicenseExpiry)
 *   - 계약 반납 임박 (returnScheduledDate)
 *
 * 윈도우:
 *   - D-30 이내 → '임박' (orange)
 *   - D-7 이내  → '긴급' (red)
 *   - D+0 이상  → '경과' (red, bold) — 만기 지남
 */

import type { Contract } from './types';
import { todayKr } from './mock-data';
import { isContractEnded } from './contract-lifecycle';

export type AlertSeverity = 'overdue' | 'urgent' | 'soon';

export type AlertKind = '정기검사' | '보험만기' | '자동차세' | '면허만기' | '반납임박';

export type AlertItem = {
  id: string;          // 고유키 (contractId + kind)
  contractId: string;
  contractNo: string;
  vehiclePlate: string;
  customerName: string;
  company: string;
  kind: AlertKind;
  dueDate: string;
  daysLeft: number;    // 음수면 경과
  severity: AlertSeverity;
};

/**
 * 한 계약에서 발생하는 모든 알림 추출.
 * 운행 중이 아닌(해지/반납) 계약은 제외.
 */
export function buildAlertsForContract(c: Contract, today: string): AlertItem[] {
  if (isContractEnded(c)) return [];
  const out: AlertItem[] = [];

  function add(kind: AlertKind, dueDate: string) {
    if (!dueDate) return;
    const days = daysBetween(today, dueDate);
    // D-30 이내만 (이미 경과한 것 포함)
    if (days > 30) return;
    out.push({
      id: `${c.id}|${kind}`,
      contractId: c.id,
      contractNo: c.contractNo,
      vehiclePlate: c.vehiclePlate,
      customerName: c.customerName,
      company: c.company,
      kind,
      dueDate,
      daysLeft: days,
      severity: days < 0 ? 'overdue' : days <= 7 ? 'urgent' : 'soon',
    });
  }

  if (c.inspectionDueDate) add('정기검사', c.inspectionDueDate);
  if (c.insuranceExpiryDate) add('보험만기', c.insuranceExpiryDate);
  if (c.vehicleTaxDueDate) add('자동차세', c.vehicleTaxDueDate);
  if (c.customerLicenseExpiry) add('면허만기', c.customerLicenseExpiry);
  if (c.returnScheduledDate && !c.returnedDate) add('반납임박', c.returnScheduledDate);

  return out;
}

/** 전체 계약에서 알림 집계 — daysLeft 오름차순 (가장 임박/경과한 것 위) */
export function buildAllAlerts(contracts: Contract[], today: string = todayKr()): AlertItem[] {
  const out: AlertItem[] = [];
  for (const c of contracts) out.push(...buildAlertsForContract(c, today));
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

/** YYYY-MM-DD 간 일수 차이 (b - a) */
function daysBetween(a: string, b: string): number {
  if (!a || !b) return 0;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.round((db - da) / 86400000);
}

/** Severity → 색상 var */
export function alertColor(s: AlertSeverity): string {
  if (s === 'overdue') return 'var(--red-text)';
  if (s === 'urgent') return 'var(--red-text)';
  return 'var(--orange-text)';
}

/** D-day 문자열 (D-3 / D+5 / 오늘) */
export function dDayLabel(days: number): string {
  if (days === 0) return '오늘';
  if (days < 0) return `D+${-days}`;
  return `D-${days}`;
}
