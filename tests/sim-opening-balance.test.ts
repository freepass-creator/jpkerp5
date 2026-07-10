/**
 * 시뮬 — 期초(현재미수) 씨앗 → 실입금 realization end-to-end.
 * 핵심 불변식: 씨앗으로 잡힌 "현재미수"를 과거 계좌입금 업로드가 자동으로 지우지 않는다
 *   (실입금은 synthetic 期초 슬롯을 실전환할 뿐, 진짜 미수 꼬리는 보존).
 * 초과 입금이 들어올 때만 미수가 실제로 줄어든다.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import {
  distributeUnpaid, realizeOpeningBalance, totalUnpaid, totalUnpaidCount, addMonthsKeepDay,
} from '@/lib/payment-schedule';
import type { PaymentScheduleInline, PaymentEntry } from '@/lib/types';

const won = (n: number) => '₩' + n.toLocaleString('ko-KR');
const countSynthetic = (list: PaymentScheduleInline[]) =>
  list.reduce((n, s) => n + (s.payments ?? []).filter((p) => p.synthetic === true).length, 0);
const countReal = (list: PaymentScheduleInline[]) =>
  list.reduce((n, s) => n + (s.payments ?? []).filter((p) => !!p.txId).length, 0);

describe('期초 미수 씨앗·realization 시뮬', () => {
  it('과거입금이 현재미수를 안 지우는지 실측', () => {
    const today = '2026-07-10';
    const MONTH = 800_000;
    // 12회차(2025-07-05 ~ 2026-06-05)
    const base: PaymentScheduleInline[] = Array.from({ length: 12 }, (_, i) => ({
      seq: i + 1, dueDate: addMonthsKeepDay('2025-07-05', i), amount: MONTH,
      status: '예정', paidAmount: 0, payments: [],
    }));

    // 씨앗: 현재미수 1,600,000(2회차) + 마지막입금일 2026-04-05
    let list = distributeUnpaid(base, 1_600_000, today, '2026-04-05');
    const before = { unpaid: totalUnpaid(list), count: totalUnpaidCount(list), syn: countSynthetic(list), real: countReal(list) };

    // 과거 3년치 계좌 업로드 흉내 — 마지막입금일까지 10회차 실입금(각 800k) realize
    for (let i = 0; i < 10; i++) {
      const entry: PaymentEntry = { date: addMonthsKeepDay('2025-07-05', i), amount: MONTH, source: '계좌', txId: `bank${i}` };
      list = realizeOpeningBalance(list, entry, today).schedules;
    }
    const after = { unpaid: totalUnpaid(list), count: totalUnpaidCount(list), syn: countSynthetic(list), real: countReal(list) };

    // 초과 입금 1건(미수 갚음) → 실제 미수 차감
    const extra = realizeOpeningBalance(list, { date: '2026-07-09', amount: MONTH, source: '계좌', txId: 'bankExtra' }, today).schedules;
    const afterExtra = { unpaid: totalUnpaid(extra), count: totalUnpaidCount(extra) };

    const L: string[] = [''];
    L.push('════════ 期초 미수 씨앗·realization 시뮬 ════════');
    L.push('12회차 월 800,000 · 현재미수 1,600,000(2회차) · 마지막입금 2026-04-05');
    L.push('');
    L.push(`① 씨앗 직후: 미수 ${won(before.unpaid)} (${before.count}회차) · synthetic ${before.syn} · real ${before.real}`);
    L.push(`② 과거 10건 실입금 realize 후: 미수 ${won(after.unpaid)} (${after.count}회차) · synthetic ${after.syn} · real ${after.real}`);
    L.push(`   → 미수 불변(${before.unpaid === after.unpaid}) · synthetic ${before.syn}→${after.syn} 감소 · real 0→${after.real} 증가(허수→실 전환)`);
    L.push(`③ 초과 입금 1건 후: 미수 ${won(afterExtra.unpaid)} (${afterExtra.count}회차) — 실제로 800,000 차감`);
    L.push('');
    L.push('【판정】 과거 계좌입금 업로드는 期초 synthetic 슬롯만 실전환(총 paid 불변), 현재미수 꼬리는 보존.');
    L.push('  → 3년치 계좌 올려도 "현재미수"가 허수로 증발/오차감 안 됨. 초과분만 진짜 미수 차감.');
    L.push('══════════════════════════════════════════════════════════');
    writeFileSync('sim-opening-balance-report.txt', L.join('\n'), 'utf-8');

    // 불변식 가드
    expect(before.unpaid).toBe(1_600_000);
    expect(before.count).toBe(2);
    expect(after.unpaid).toBe(1_600_000);      // 과거입금이 현재미수 안 지움
    expect(after.count).toBe(2);
    expect(after.syn).toBeLessThan(before.syn); // synthetic 실전환됨
    expect(after.real).toBeGreaterThanOrEqual(10);
    expect(afterExtra.unpaid).toBe(800_000);    // 초과입금만 실제 차감
    expect(afterExtra.count).toBe(1);
  });
});
