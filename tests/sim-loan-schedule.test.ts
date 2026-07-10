/**
 * 시뮬 — 할부/리스 상환스케줄: 생성(금리·기간·원금) + OCR파싱 + 회차↔출금 매칭 + 검산 + 우선순위.
 * 오릭스 실물(취득 37,746,500 / 월불입 893,500 / 48개월 / 총상환 42,958,040) 구조 기준.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import {
  generateLoanSchedule, summarizeLoanSchedule, buildLoanScheduleFromOcr,
  matchLoanPaymentsToWithdrawals, shouldReplaceLoanSchedule,
} from '@/lib/loan-schedule-calc';
import { crosscheckLoanSchedule } from '@/lib/ocr-crosscheck';
import type { BankTransaction } from '@/lib/types';

const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');

describe('할부 상환스케줄 시뮬', () => {
  it('생성·파싱·매칭·검산·우선순위 실측', () => {
    const L: string[] = [];
    const p = (s = '') => L.push(s);
    p('');
    p('════════ 할부 상환스케줄 시뮬 ════════');

    // 1) 생성 — 원리금균등 (오릭스 유형)
    const P = 37_746_500, RATE = 6.0, N = 48;
    const g = generateLoanSchedule({ principal: P, annualRatePct: RATE, months: N, startDate: '2022-01-25', method: '원리금균등' });
    const sum = summarizeLoanSchedule(g.rows);
    const rowOk = g.rows.every((r) => Math.abs(r.principal + r.interest - r.payment) <= 1);
    p('');
    p(`① 생성(원리금균등) 원금 ${won(P)} · 연 ${RATE}% · ${N}개월`);
    p(`   월불입금 ${won(g.monthlyPayment)} · 총상환 ${won(g.totalRepayment)} · 총이자 ${won(g.totalInterest)}`);
    p(`   회차수 ${g.rows.length} · Σ원금 ${won(sum.principalSum)}(=원금? ${sum.principalSum === P}) · 매행 원금+이자=불입 ${rowOk} · 말잔 ${won(g.rows[N - 1].remainingPrincipal)}`);
    p(`   1회차: 원금 ${won(g.rows[0].principal)} 이자 ${won(g.rows[0].interest)} / 말회차: 원금 ${won(g.rows[N - 1].principal)} 이자 ${won(g.rows[N - 1].interest)}`);

    // 원금균등 / 만기일시
    const eqP = generateLoanSchedule({ principal: P, annualRatePct: RATE, months: N, startDate: '2022-01-25', method: '원금균등' });
    const bullet = generateLoanSchedule({ principal: P, annualRatePct: RATE, months: N, startDate: '2022-01-25', method: '만기일시' });
    p(`   [원금균등] 1회차 불입 ${won(eqP.rows[0].payment)} → 말회차 ${won(eqP.rows[N - 1].payment)} (체감) · 총이자 ${won(eqP.totalInterest)}`);
    p(`   [만기일시] 매월 이자 ${won(bullet.rows[0].payment)} · 말회차 ${won(bullet.rows[N - 1].payment)}(원금일시) · 총이자 ${won(bullet.totalInterest)}`);

    // 2) OCR 파싱 — 생성 rows 를 상환표 OCR 형태로 흉내
    const rawRows = g.rows.slice(0, 6).map((r) => ({
      seq: r.seq, due_date: r.dueDate, principal: r.principal, interest: r.interest,
      payment: r.payment, remaining_principal: r.remainingPrincipal,
    }));
    const parsed = buildLoanScheduleFromOcr({ rows: rawRows });
    p('');
    p(`② OCR 파싱: ${rawRows.length}행 → ${parsed.length}행 정규화 (seq/원금/이자/불입/미회수 보존: ${parsed[0].principal === g.rows[0].principal})`);

    // 3) 회차 ↔ 은행 출금 매칭 (홀로 안 산다)
    let tid = 0;
    const tx = (over: Partial<BankTransaction>): BankTransaction =>
      ({ id: `w${++tid}`, txDate: over.txDate, amount: 0, withdraw: over.withdraw ?? 0 } as BankTransaction);
    const bankTx: BankTransaction[] = [
      ...g.rows.slice(0, 12).map((r) => tx({ txDate: r.dueDate, withdraw: r.payment })), // 12개월치 자동이체 출금
      tx({ txDate: '2022-03-10', withdraw: 55000 }),   // 노이즈(주유 등)
      tx({ txDate: '2022-05-01', withdraw: 893500 * 3 }), // 노이즈(다른 큰 출금)
    ];
    const matched = matchLoanPaymentsToWithdrawals(g.rows, bankTx);
    p('');
    p(`③ 회차↔출금 매칭: 출금 ${bankTx.length}건 중 회차 매칭 ${matched.matchedCount}건 (기대 12) · matchedTxIds ${matched.matchedTxIds.length}`);
    p(`   1회차 paidDate=${matched.rows[0].paidDate} txId=${matched.rows[0].matchedTxId} / 13회차(미출금) txId=${matched.rows[12].matchedTxId ?? '없음'}`);

    // 4) 검산 — 정상(전체 48행) vs 오독
    const fullRaw = g.rows.map((r) => ({
      seq: r.seq, due_date: r.dueDate, principal: r.principal, interest: r.interest,
      payment: r.payment, remaining_principal: r.remainingPrincipal,
    }));
    const ccGood = crosscheckLoanSchedule({ principal: P, total_repayment: g.totalRepayment, months: N, rows: fullRaw });
    const badRaw = fullRaw.map((r, i) => (i === 2 ? { ...r, payment: r.payment + 50000 } : r)); // 3회차 불입 오독
    const ccBad = crosscheckLoanSchedule({ principal: P, months: N, rows: badRaw });
    p('');
    p(`④ 검산: 정상 level=${ccGood.level} conf=${ccGood.confidence} / 오독(불입≠원금+이자) level=${ccBad.level} conf=${ccBad.confidence}`);
    ccBad.issues.forEach((i) => p(`    ⚠ [${i.severity}] ${i.message}`));

    // 5) 우선순위 — 업로드 > 생성
    p('');
    p('⑤ 우선순위(업로드>생성):');
    p(`   생성값이 업로드본 덮음? ${shouldReplaceLoanSchedule('uploaded', 'generated')} (기대 false)`);
    p(`   업로드가 생성값 덮음? ${shouldReplaceLoanSchedule('generated', 'uploaded')} (기대 true)`);
    p(`   최초 생성 반영? ${shouldReplaceLoanSchedule(undefined, 'generated')} (기대 true)`);

    p('');
    p('【판정】 표 없어도 원금·금리·기간으로 3방식 상환표 생성(검산 정합), OCR 표는 우선 반영, 각 회차는 은행 출금과 자동 매칭(자금 연결), 오독은 검산이 플래그.');
    p('══════════════════════════════════════════════════════════');
    writeFileSync('sim-loan-schedule-report.txt', L.join('\n'), 'utf-8');

    // 회귀 가드
    expect(g.rows.length).toBe(N);
    expect(sum.principalSum).toBe(P);
    expect(rowOk).toBe(true);
    expect(g.rows[N - 1].remainingPrincipal).toBe(0);
    expect(g.totalRepayment).toBe(sum.paymentSum);
    expect(matched.matchedCount).toBe(12);
    expect(ccGood.level).toBe('ok');
    expect(ccBad.level).toBe('warn');
    expect(shouldReplaceLoanSchedule('uploaded', 'generated')).toBe(false);
    expect(shouldReplaceLoanSchedule('generated', 'uploaded')).toBe(true);
  });
});
