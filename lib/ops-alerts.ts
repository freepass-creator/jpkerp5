/**
 * 능동 운영 알림 — 운영자가 "뭘 봐야 할지 몰라도" 시스템이 먼저 짚어준다.
 *
 * 순수 스캔 함수. 대시보드가 이미 들고 있는 데이터(vehicles·contracts·penalties)만으로 동작.
 * 기한 임박(보험·검사·계약 만기), 미수 누적, 과태료 미처리 적체, 운영 정합성 이상을
 * 심각도로 정렬해 반환 → 대시 배지/스트립으로 노출.
 *
 * 원칙: 데이터는 홀로 안 산다([[feedback_data_always_links]]) — 각 알림은 차량·계약 엔티티에 링크.
 */

import type { Vehicle, Contract } from './types';

export type OpsAlertSeverity = 'critical' | 'warn' | 'info';
export type OpsAlertKind = '보험만기' | '검사만기' | '계약만기' | '반납지연' | '미수' | '과태료적체' | '정합성';

export interface OpsAlert {
  kind: OpsAlertKind;
  severity: OpsAlertSeverity;
  title: string;          // 한 줄 요약
  detail: string;         // 부연
  entityId?: string;      // vehicle/contract id
  entityLabel?: string;   // plate / contractNo
  dueDate?: string;
  daysLeft?: number;      // 음수 = 경과
  href?: string;          // 클릭 이동
}

/** 매각/폐차 계열 — 운영 스캔 제외 */
const DISPOSED = new Set(['매각', '매각대기', '매각검토', '폐차']);

function daysBetween(fromYmd: string, toYmd: string): number | null {
  const a = new Date(fromYmd).getTime(), b = new Date(toYmd).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

export interface OpsAlertInput {
  today: string;                       // YYYY-MM-DD
  vehicles: readonly Vehicle[];
  contracts: readonly Contract[];
  /** 정규화된 과태료 (penalty-store) — status !== '납부완료'/'회사납부' 를 미처리로 셈 */
  penalties?: ReadonlyArray<{ status?: string; carNumber?: string; deletedAt?: string }>;
  /** 임박 판정 기준일 (기본: 보험·검사 30일, 계약만기 14일) */
  soonInsuranceDays?: number;
  soonInspectionDays?: number;
  soonContractDays?: number;
}

export function scanOpsAlerts(input: OpsAlertInput): OpsAlert[] {
  const { today } = input;
  const soonIns = input.soonInsuranceDays ?? 30;
  const soonInsp = input.soonInspectionDays ?? 30;
  const soonCon = input.soonContractDays ?? 14;
  const alerts: OpsAlert[] = [];

  const operating = input.vehicles.filter((v) => !DISPOSED.has(v.status));

  // 1) 보험 만기
  for (const v of operating) {
    const due = v.insuranceExpiryDate;
    if (!due) continue;
    const d = daysBetween(today, due);
    if (d == null || d > soonIns) continue;
    alerts.push({
      kind: '보험만기',
      severity: d < 0 ? 'critical' : d <= 7 ? 'critical' : 'warn',
      title: `보험 만기 ${d < 0 ? `${-d}일 경과` : `D-${d}`} · ${v.plate ?? v.id}`,
      detail: `${v.insuranceCompany ?? '보험사 미상'} · 만기 ${due}`,
      entityId: v.id, entityLabel: v.plate, dueDate: due, daysLeft: d, href: '/asset',
    });
  }

  // 2) 정기검사 만기
  for (const v of operating) {
    const due = v.inspectionDueDate;
    if (!due) continue;
    const d = daysBetween(today, due);
    if (d == null || d > soonInsp) continue;
    alerts.push({
      kind: '검사만기',
      severity: d < 0 ? 'critical' : d <= 7 ? 'warn' : 'info',
      title: `정기검사 ${d < 0 ? `${-d}일 경과` : `D-${d}`} · ${v.plate ?? v.id}`,
      detail: `검사유효 만료 ${due}`,
      entityId: v.id, entityLabel: v.plate, dueDate: due, daysLeft: d, href: '/asset',
    });
  }

  // 3) 계약 만기 임박 / 반납 지연
  for (const c of input.contracts) {
    if (c.status !== '운행') continue;
    const due = c.returnScheduledDate;
    if (!due) continue;
    const returned = !!c.returnedDate;
    if (returned) continue;
    const d = daysBetween(today, due);
    if (d == null) continue;
    if (d < 0) {
      alerts.push({
        kind: '반납지연',
        severity: 'critical',
        title: `반납 ${-d}일 지연 · ${c.vehiclePlate ?? ''}`,
        detail: `${c.customerName ?? ''} · 반납예정 ${due} 경과`,
        entityId: c.id, entityLabel: c.contractNo ?? c.vehiclePlate, dueDate: due, daysLeft: d, href: '/contract',
      });
    } else if (d <= soonCon) {
      alerts.push({
        kind: '계약만기',
        severity: d <= 3 ? 'warn' : 'info',
        title: `계약 만기 D-${d} · ${c.vehiclePlate ?? ''}`,
        detail: `${c.customerName ?? ''} · 반납예정 ${due}`,
        entityId: c.id, entityLabel: c.contractNo ?? c.vehiclePlate, dueDate: due, daysLeft: d, href: '/contract',
      });
    }
  }

  // 4) 미수 누적 — 회차수 기준
  for (const c of input.contracts) {
    const cnt = c.unpaidSeqCount ?? 0;
    if (cnt < 2) continue;
    const amt = c.unpaidAmount ?? 0;
    alerts.push({
      kind: '미수',
      severity: cnt >= 3 ? 'critical' : 'warn',
      title: `미수 ${cnt}회차 · ${c.vehiclePlate ?? ''}`,
      detail: `${c.customerName ?? ''} · 미수액 ₩${amt.toLocaleString('ko-KR')}`,
      entityId: c.id, entityLabel: c.contractNo ?? c.vehiclePlate, href: '/payments',
    });
  }

  // 5) 과태료 미처리 적체 (요약 1건)
  if (input.penalties && input.penalties.length) {
    const open = input.penalties.filter(
      (p) => !p.deletedAt && p.status !== '납부완료' && p.status !== '회사납부',
    ).length;
    if (open >= 5) {
      alerts.push({
        kind: '과태료적체',
        severity: open >= 15 ? 'warn' : 'info',
        title: `과태료 미처리 ${open}건 적체`,
        detail: '고지서 매칭·임차인 통보 대기',
        href: '/penalty',
      });
    }
  }

  // 6) 정합성 — 운행 차량인데 활성 계약 없음(운영 데이터 어긋남)
  const activeByPlate = new Set(
    input.contracts.filter((c) => c.status === '운행' && c.vehiclePlate).map((c) => c.vehiclePlate),
  );
  for (const v of operating) {
    if (v.status !== '운행') continue;
    if (v.plate && !activeByPlate.has(v.plate)) {
      alerts.push({
        kind: '정합성',
        severity: 'warn',
        title: `운행 차량에 활성 계약 없음 · ${v.plate}`,
        detail: '차량 상태=운행이나 매칭되는 운행 계약이 없음 — 상태/계약 확인',
        entityId: v.id, entityLabel: v.plate, href: '/asset',
      });
    }
  }

  const sevRank = { critical: 0, warn: 1, info: 2 } as const;
  return alerts.sort((a, b) => {
    if (sevRank[a.severity] !== sevRank[b.severity]) return sevRank[a.severity] - sevRank[b.severity];
    const da = a.daysLeft ?? 9999, db = b.daysLeft ?? 9999;
    return da - db;
  });
}

/** 심각도별 개수 — 대시 배지용 */
export function summarizeAlerts(alerts: readonly OpsAlert[]): { critical: number; warn: number; info: number; total: number } {
  let critical = 0, warn = 0, info = 0;
  for (const a of alerts) {
    if (a.severity === 'critical') critical++;
    else if (a.severity === 'warn') warn++;
    else info++;
  }
  return { critical, warn, info, total: alerts.length };
}
