/**
 * 시뮬 — 체크리스트 게이팅 상태 전이. 준비 항목 다 체크돼야 다음 단계 열림.
 * 자동 판정(등록증=vin·보험=만기일·계약=연결)은 수동 체크 없이 ✓.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { nextTransitions, isTransitionReady, transitionProgress } from '@/lib/vehicle-transitions';
import type { Vehicle, Contract } from '@/lib/types';

const V = (o: Partial<Vehicle>): Vehicle => ({ status: '상품화중', ...o } as Vehicle);
const waitContract = { status: '대기' } as Contract;

describe('차량 상태 전이 체크리스트 시뮬', () => {
  it('체크 완료로 전이 열림 + 자동판정 실측', () => {
    const L: string[] = [''];
    L.push('════════ 상태 전이 체크리스트 시뮬 ════════');
    const line = (s: string) => L.push(s);

    // 1) 상품화중 → 상품대기 : 외관·내부·정비 3항목 수동
    const v1 = V({ status: '상품화중' });
    const t1 = nextTransitions('상품화중')[0];
    const p0 = transitionProgress(t1, v1, null, {});
    const ready0 = isTransitionReady(t1, v1, null, {});
    const checks = { exterior: 'x', interior: 'x', mechanical: 'x' };
    const pAll = transitionProgress(t1, v1, null, checks);
    const readyAll = isTransitionReady(t1, v1, null, checks);
    line('');
    line(`① 상품화중 → ${t1.to} (${t1.actionLabel})`);
    line(`   체크 전: ${p0.done}/${p0.total} ready=${ready0} · 3항목 체크 후: ${pAll.done}/${pAll.total} ready=${readyAll}`);

    // 2) 구매대기 → 등록대기 : 등록증(vin) 자동 ✓ + 구매 수동
    const t2 = nextTransitions('구매대기')[0];
    const vVin = V({ status: '구매대기', vin: 'KNAME81ABKS500895' });
    const rAuto = transitionProgress(t2, vVin, null, {});      // regInput auto ✓, purchased 미체크
    const rDone = isTransitionReady(t2, vVin, null, { purchased: 'x' });
    line('');
    line(`② 구매대기 → ${t2.to}: vin 있으면 등록증 자동✓ → ${rAuto.done}/${rAuto.total}(구매 미체크) · 구매 체크 후 ready=${rDone}`);

    // 3) 상품대기 → 인도대기 : 계약 연결 자동 ✓ + 인도준비 수동
    const t3 = nextTransitions('상품대기')[0];
    const vStock = V({ status: '상품대기' });
    const rNoContract = transitionProgress(t3, vStock, null, {});          // 계약없음 → contracted 미충족
    const rWithContract = transitionProgress(t3, vStock, waitContract, {}); // 계약대기 → contracted 자동✓
    const rReady = isTransitionReady(t3, vStock, waitContract, { deliveryReady: 'x' });
    line('');
    line(`③ 상품대기 → ${t3.to}: 계약없음 ${rNoContract.done}/${rNoContract.total} · 계약대기 연결 시 ${rWithContract.done}/${rWithContract.total}(자동✓) · 인도준비 체크 후 ready=${rReady}`);

    // 4) 운행 → 두 갈래(정상 반납 / 회수). 회수는 4단계 절차.
    const t4 = nextTransitions('운행');
    const recovery = t4.find((x) => x.to === '반납')!;
    const vRun = V({ status: '운행' });
    const recNot = isTransitionReady(recovery, vRun, waitContract, {});
    const recReady = isTransitionReady(recovery, vRun, waitContract, { arrearsChecked: 'x', recoveryNotice: 'x', locateVehicle: 'x', recovered: 'x' });
    line('');
    line(`④ 운행 전이 갈래 ${t4.length}개: ${t4.map((x) => `${x.to}(${x.checklist.length})`).join(' / ')}`);
    line(`   회수 절차 ${recovery.checklist.length}단계: ${recovery.checklist.map((c) => c.label).join(' → ')}`);
    line(`   미완 ready=${recNot} → 4항목 체크 후 ready=${recReady}`);
    const arrearsC = { status: '운행', unpaidSeqCount: 2, unpaidAmount: 1_600_000 } as Contract;
    const recAutoDone = transitionProgress(recovery, vRun, arrearsC, {}).done;
    line(`   미납 계약이면 '미납 확인' 자동✓ → ${recAutoDone}/4 (수동 체크 전)`);

    line('');
    line('【판정】 준비 항목 다 체크돼야 다음 단계 열림. 같은 상태도 갈래별(정상반납/회수) 절차가 다름. 데이터로 아는 항목(등록증·보험·계약)은 자동✓.');
    line('══════════════════════════════════════════════════════════');
    writeFileSync('sim-vehicle-transitions-report.txt', L.join('\n'), 'utf-8');

    expect(ready0).toBe(false);       // 체크 전 전이 불가
    expect(readyAll).toBe(true);      // 3항목 체크 후 열림
    expect(rAuto.done).toBe(1);       // vin 자동✓ 1개
    expect(rDone).toBe(true);         // 구매 체크로 완료
    expect(rNoContract.done).toBe(0); // 계약없으면 자동✓ 안 됨
    expect(rWithContract.done).toBe(1); // 계약연결 시 자동✓
    expect(rReady).toBe(true);
    // 운행: 정상반납 + 회수 두 갈래, 회수는 4단계
    expect(t4.length).toBe(2);
    expect(recovery.checklist.length).toBe(4);
    expect(recNot).toBe(false);
    expect(recReady).toBe(true);
    expect(recAutoDone).toBeGreaterThanOrEqual(1); // 미납 계약이면 '미납 확인' 자동✓
  });
});
