/**
 * 시뮬 — 능동 운영 알림 스캔. 보험/검사/반납지연/계약만기/미수/과태료적체/정합성을
 * 실제로 잡아 심각도로 정렬하는지. 매각차량 제외 확인.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { scanOpsAlerts, summarizeAlerts } from '@/lib/ops-alerts';
import type { Vehicle, Contract } from '@/lib/types';

const today = '2026-07-10';
const V = (o: Partial<Vehicle>): Vehicle => ({ status: '운행', ...o } as Vehicle);
const C = (o: Partial<Contract>): Contract => ({ status: '운행', ...o } as Contract);

describe('능동 운영 알림 시뮬', () => {
  it('7종 알림 스캔·정렬 실측', () => {
    const vehicles: Vehicle[] = [
      V({ id: 'v1', plate: '12가1111', insuranceCompany: 'DB손보', insuranceExpiryDate: '2026-07-15' }), // 보험 D-5
      V({ id: 'v2', plate: '34나2222', inspectionDueDate: '2026-07-13' }),                               // 검사 D-3
      V({ id: 'v3', plate: '56다3333', status: '매각', insuranceExpiryDate: '2026-07-11' }),             // 매각 → 제외
      V({ id: 'v4', plate: '78라4444' }),                                                                // 운행·계약없음 → 정합성
    ];
    const contracts: Contract[] = [
      C({ id: 'c1', vehiclePlate: '90마5555', customerName: '김반납', returnScheduledDate: '2026-07-08' }),          // 반납 2일 지연
      C({ id: 'c2', vehiclePlate: '11바6666', customerName: '이만기', returnScheduledDate: '2026-07-20' }),          // 계약 D-10
      C({ id: 'c3', vehiclePlate: '12가1111', customerName: '박미수', contractNo: 'CP-1', returnScheduledDate: '2027-01-01', unpaidSeqCount: 3, unpaidAmount: 2_400_000 }),
      C({ id: 'c4', vehiclePlate: '34나2222', customerName: '정상', returnScheduledDate: '2027-01-01' }),
    ];
    const penalties = [
      ...Array.from({ length: 6 }, (_, i) => ({ status: '접수', carNumber: `p${i}` })),
      { status: '납부완료', carNumber: 'done' },
    ];

    const alerts = scanOpsAlerts({ today, vehicles, contracts, penalties });
    const sum = summarizeAlerts(alerts);
    const kinds = new Set(alerts.map((a) => a.kind));

    const L: string[] = [''];
    L.push('════════ 능동 운영 알림 시뮬 ════════');
    L.push(`오늘 ${today} · 알림 ${sum.total}건 (critical ${sum.critical} / warn ${sum.warn} / info ${sum.info})`);
    L.push('');
    for (const a of alerts) L.push(`[${a.severity.toUpperCase().padEnd(8)}] ${a.kind} — ${a.title}  ·  ${a.detail}`);
    L.push('');
    L.push(`감지 종류: ${[...kinds].join(', ')}`);
    L.push(`매각차량(v3) 알림 없음: ${!alerts.some((a) => a.entityId === 'v3')}`);
    L.push(`정렬: 첫 알림 severity=${alerts[0]?.severity} (critical 우선)`);
    L.push('【판정】 기한임박·미수·적체·정합성을 시스템이 먼저 통보 → "몰라도 알려주는" 능동 지능.');
    L.push('══════════════════════════════════════════════════════════');
    writeFileSync('sim-ops-alerts-report.txt', L.join('\n'), 'utf-8');

    expect(kinds.has('보험만기')).toBe(true);
    expect(kinds.has('검사만기')).toBe(true);
    expect(kinds.has('반납지연')).toBe(true);
    expect(kinds.has('계약만기')).toBe(true);
    expect(kinds.has('미수')).toBe(true);
    expect(kinds.has('과태료적체')).toBe(true);
    expect(kinds.has('정합성')).toBe(true);
    expect(alerts.some((a) => a.entityId === 'v3')).toBe(false); // 매각 제외
    expect(alerts[0].severity).toBe('critical');                 // 심각도 정렬
    // 무보험·보험미상 운행(v4=운행·보험만기없음) critical 경보 — 기존엔 스캔서 빠지던 최악 케이스
    expect(alerts.some((a) => a.title.includes('무보험') && a.severity === 'critical')).toBe(true);
  });
});
