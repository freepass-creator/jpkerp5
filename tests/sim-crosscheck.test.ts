/**
 * 시뮬 — OCR 교차검증 엔진(ocr-crosscheck)이 실제 증권/고지서의 이상을 잡는지 실증.
 * 특히 page-81(166마2517) "납입한 보험료=총보험료" 이상 케이스를 ⚠ 로 플래그하는지.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { crosscheckInsurance, crosscheckPenalty, crosscheckVehicleReg } from '@/lib/ocr-crosscheck';

const L: string[] = [];
function line(s = '') { L.push(s); }

describe('OCR 교차검증 시뮬', () => {
  it('실증권/고지서 검산 실측', () => {
    line('');
    line('════════ OCR 교차검증(검산) 시뮬 ════════');

    // 1) 정상 보험 — 297거4892 (총 1,388,610, 2~6회 386,520, 1회차 1,002,090)
    const normal = crosscheckInsurance({
      total_premium: 1388610, paid_premium: 1002090,
      start_date: '2026-03-14', end_date: '2027-03-14', car_number: '297거4892',
      installments: [
        { cycle: 2, due_date: '2026-04-14', amount: 77300 },
        { cycle: 3, due_date: '2026-05-14', amount: 77300 },
        { cycle: 4, due_date: '2026-06-14', amount: 77320 },
        { cycle: 5, due_date: '2026-07-14', amount: 77300 },
        { cycle: 6, due_date: '2026-08-14', amount: 77300 },
      ],
    });
    line('');
    line(`① 정상 보험(297거4892): level=${normal.level} conf=${normal.confidence} issues=${normal.issues.length}`);
    normal.issues.forEach((i) => line(`    ⚠ [${i.severity}] ${i.message}`));

    // 2) 이상 보험 — 166마2517 (총 2,688,610, 납입한=2,688,610(=총!), 2~6회 1,551,540)
    const anomaly = crosscheckInsurance({
      total_premium: 2688610, paid_premium: 2688610,
      start_date: '2025-05-16', end_date: '2026-05-16', car_number: '166마2517',
      installments: [
        { cycle: 2, due_date: '2025-06-16', amount: 310320 },
        { cycle: 3, due_date: '2025-07-16', amount: 310280 },
        { cycle: 4, due_date: '2025-08-16', amount: 310330 },
        { cycle: 5, due_date: '2025-09-16', amount: 310290 },
        { cycle: 6, due_date: '2025-10-16', amount: 310320 },
      ],
    });
    line('');
    line(`② 이상 보험(166마2517, 납입한=총): level=${anomaly.level} conf=${anomaly.confidence} issues=${anomaly.issues.length}`);
    anomaly.issues.forEach((i) => line(`    ⚠ [${i.severity}] ${i.message}`));

    // 3) 회차금액 오독 — 2~N 합이 총보다 큼
    const bad = crosscheckInsurance({
      total_premium: 1000000, car_number: '12가3456',
      installments: [{ cycle: 2, amount: 600000 }, { cycle: 3, amount: 600000 }],
    });
    line('');
    line(`③ 회차 오독(Σ2~N>총): level=${bad.level} conf=${bad.confidence}`);
    bad.issues.forEach((i) => line(`    ⚠ [${i.severity}] ${i.message}`));

    // 4) 과태료 — 차량번호 없음 + 세부합 불일치
    const pen = crosscheckPenalty({
      amount: 40000, car_number: '', issue_date: '2026-05-01', due_date: '2026-05-20',
      penalty_amount: 30000, surcharge_amount: 5000, // 합 35,000 ≠ 40,000
    });
    line('');
    line(`④ 과태료(번호판X·세부합 불일치): level=${pen.level} conf=${pen.confidence}`);
    pen.issues.forEach((i) => line(`    ⚠ [${i.severity}] ${i.message}`));

    // 5) 등록증 — VIN 16자(오독) + 배기량 정상
    const reg = crosscheckVehicleReg({ vin: 'KNAME81ABKS50089', plate: '66소6317', displacement: 2199 });
    line('');
    line(`⑤ 등록증(VIN 16자): level=${reg.level} conf=${reg.confidence}`);
    reg.issues.forEach((i) => line(`    ⚠ [${i.severity}] ${i.message}`));

    // 6) p41 실증권 유형(분납 균등) → 편차 플래그 없음  vs  한 회차 오독(10배) → 편차 warn
    const uniform = crosscheckInsurance({
      total_premium: 886990, paid_premium: 736070, car_number: '139우7166', start_date: '2025-11-27', end_date: '2026-11-27',
      installments: [{ cycle: 2, amount: 50320 }, { cycle: 3, amount: 50280 }, { cycle: 4, amount: 50310 }, { cycle: 5, amount: 50300 }, { cycle: 6, amount: 50310 }],
    });
    const outlier = crosscheckInsurance({
      total_premium: 1_000_000, car_number: '12가3456', start_date: '2026-01-01', end_date: '2027-01-01',
      installments: [{ cycle: 2, amount: 50000 }, { cycle: 3, amount: 500000 }, { cycle: 4, amount: 50000 }],
    });
    line('');
    line(`⑥ 분납 균등(실 p41 139우7166): level=${uniform.level} conf=${uniform.confidence} (편차 플래그 없어야)`);
    line(`   한 회차 오독(5만 vs 50만): level=${outlier.level} — ${outlier.issues.map((i) => i.message).join(' / ')}`);

    line('');
    line('【판정】 정상·균등건은 conf 100/ok, 이상건(page-81·회차오독·번호판누락·세부불일치·VIN오독·분납편차)은 ⚠/error 플래그.');
    line('→ 업로드 후 목록에서 conf 낮은 건만 사람이 확인 = "몰라도 시스템이 알려주는" 능동 검증.');
    line('══════════════════════════════════════════════════════════');
    writeFileSync('sim-crosscheck-report.txt', L.join('\n'), 'utf-8');

    // 회귀 가드: 정상=ok, 이상=경고 이상
    expect(normal.level).toBe('ok');
    expect(anomaly.level).toBe('warn');
    expect(bad.level).toBe('error');
    expect(pen.level).toBe('warn');
    expect(reg.level).toBe('warn');
    expect(uniform.issues.some((i) => i.message.includes('편차'))).toBe(false); // 균등 = 편차 플래그 없음
    expect(outlier.issues.some((i) => i.message.includes('편차'))).toBe(true);  // 오독 = 편차 플래그
  });
});
