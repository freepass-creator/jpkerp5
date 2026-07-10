/**
 * 시뮬 — 차량 간편 상태(2축 파생). 세부 19단계 × 계약축 전 조합 커버 +
 * 사장님 시나리오(계약·차 미구매 / 상품화중 계약됨 / 재고 / 운행 / 반납) 라벨 검증.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { simpleVehicleState, vehiclePrepStage } from '@/lib/vehicle-state';
import type { VehicleStatus, ContractStatus } from '@/lib/types';

const ALL: VehicleStatus[] = [
  '구매대기', '등록대기', '상품화대기', '상품화중', '상품대기', '운행', '연장대기', '종료대기',
  '휴차대기', '매각검토', '매각대기', '매각', '인도대기', '출고대기', '재고', '반납', '휴차', '임시배차', '정비', '사고',
];
const VALID_TONE = new Set(['red', 'orange', 'amber', 'green', 'blue', 'gray']);
const c = (s: ContractStatus) => ({ status: s });

describe('차량 간편 상태 시뮬', () => {
  it('19단계 × 계약축 전수 + 시나리오 실측', () => {
    const L: string[] = [''];
    L.push('════════ 차량 간편 상태(2축) 시뮬 ════════');
    L.push('세부상태 → 준비축 | [미계약 / 계약됨(대기) / 운행중]');
    L.push('');

    let covered = 0;
    for (const s of ALL) {
      const prep = vehiclePrepStage(s);
      const none = simpleVehicleState(s, null);
      const wait = simpleVehicleState(s, c('대기'));
      const run = simpleVehicleState(s, c('운행'));
      // 전수 가드: 라벨 비지 않음 + tone 유효
      for (const st of [none, wait, run]) {
        expect(st.label.length).toBeGreaterThan(0);
        expect(VALID_TONE.has(st.tone)).toBe(true);
        covered++;
      }
      L.push(`${s.padEnd(6)} → ${prep.padEnd(5)} | ${none.label}  /  ${wait.label}  /  ${run.label}`);
    }

    L.push('');
    L.push('──── 사장님 시나리오 ────');
    const scen: [string, ReturnType<typeof simpleVehicleState>, string][] = [
      ['계약됐는데 차 구매 전', simpleVehicleState('구매대기', c('대기')), '계약됨 · 차량 소싱 필요'],
      ['상품화중인데 계약됨', simpleVehicleState('상품화중', c('대기')), '계약됨 · 상품화 중'],
      ['재고로 영업 중', simpleVehicleState('상품대기', null), '재고 · 영업가능'],
      ['손님한테 나감', simpleVehicleState('운행', c('운행')), '운행중 (손님)'],
      ['반납 들어옴', simpleVehicleState('반납', c('반납')), '반납 입고'],
    ];
    for (const [desc, st, expected] of scen) {
      const ok = st.label === expected;
      L.push(`${ok ? '✓' : '✗'} ${desc}: "${st.label}" (${st.prep}/${st.sale}, ${st.tone})${ok ? '' : ` [기대 ${expected}]`}`);
    }

    L.push('');
    L.push(`전수 커버: ${covered}건 (19상태 × 3계약축) 모두 라벨·tone 유효.`);
    L.push('【판정】 두 축(차량 준비 × 계약)을 조합해 "지금 이 차 어떤 상태"를 한 라벨로. 세부 19단계는 보존.');
    L.push('══════════════════════════════════════════════════════════');
    writeFileSync('sim-vehicle-state-report.txt', L.join('\n'), 'utf-8');

    for (const [, st, expected] of scen) expect(st.label).toBe(expected);
    expect(covered).toBe(ALL.length * 3);
  });
});
