/**
 * 시뮬 — 계약번호 정확키 매칭. 동명이인("김철수" 2계약, 같은 월대여료)을
 * 계약번호가 정확히 가려내는지. 계약번호 없으면 모호 → 자동매칭 보류(수동).
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { autoMatchAll, findCandidates } from '@/lib/receipt-match';
import type { BankTransaction, Contract, PaymentScheduleInline } from '@/lib/types';

const sched = (seq: number, amount: number): PaymentScheduleInline =>
  ({ seq, dueDate: '2026-07-05', amount, status: '연체', paidAmount: 0, payments: [] } as PaymentScheduleInline);

const mk = (id: string, no: string, name: string, plate: string): Contract =>
  ({ id, contractNo: no, customerName: name, vehiclePlate: plate, status: '운행', schedules: [sched(1, 800_000)] } as Contract);

const tx = (over: Partial<BankTransaction>): BankTransaction =>
  ({ id: 't', txDate: '2026-07-05', amount: 800_000, counterparty: '김철수', source: 'CMS', ...over } as BankTransaction);

describe('계약번호 정확키 매칭 시뮬', () => {
  it('동명이인 계약번호 disambiguation 실측', () => {
    const contracts = [
      mk('c1', 'CP01-2607-0001', '김철수', '12가1111'),
      mk('c2', 'CP01-2607-0002', '김철수', '34나2222'),
    ];

    const L: string[] = [''];
    L.push('════════ 계약번호 정확키 매칭 시뮬 ════════');
    L.push('동명이인: c1(CP01-2607-0001) / c2(CP01-2607-0002) 둘 다 "김철수", 월 800,000');
    L.push('');

    // 1) 계약번호 있음 → 정확히 c2
    const withNo = autoMatchAll([tx({ id: 't1', contractNo: 'CP01-2607-0002' })], contracts);
    L.push(`① 계약번호 'CP01-2607-0002' 입금: 자동매칭 ${withNo.length}건 → 계약 ${withNo[0]?.candidate.contract.id ?? '없음'} (${withNo[0]?.candidate.confidence ?? '-'})`);

    // 구분자 다른 표기도 정규화 매칭 (cp0126070002)
    const normalized = autoMatchAll([tx({ id: 't1b', contractNo: 'cp0126070002' })], contracts);
    L.push(`   표기변형 'cp0126070002' → 계약 ${normalized[0]?.candidate.contract.id ?? '없음'} (정규화 매칭)`);

    // 2) 계약번호 없음 → 동명이인 모호 → 자동매칭 보류
    const without = autoMatchAll([tx({ id: 't2' })], contracts);
    L.push(`② 계약번호 없음(이름 '김철수'만): 자동매칭 ${without.length}건 (기대 0 — 동명이인 모호로 수동 검토 유도)`);

    // 3) 단발 후보 검색 — 계약번호 있으면 첫 후보가 그 계약
    const cands = findCandidates(tx({ id: 't3', contractNo: 'CP01-2607-0001' }), contracts);
    L.push(`③ findCandidates(계약번호 CP01-2607-0001): 첫 후보 ${cands[0]?.contract.id ?? '없음'} (${cands[0]?.confidence ?? '-'})`);

    L.push('');
    L.push('【판정】 계약번호(정확키)가 있으면 동명이인·같은금액도 정확한 1계약으로 자동매칭. 없으면 종전대로 모호→수동.');
    L.push('  → 이름 매칭의 동명이인/오타/차명불일치 취약점을 정확키로 방어. 없으면 회귀 없이 기존 로직.');
    L.push('══════════════════════════════════════════════════════════');
    writeFileSync('sim-contractno-match-report.txt', L.join('\n'), 'utf-8');

    expect(withNo.length).toBe(1);
    expect(withNo[0].candidate.contract.id).toBe('c2');
    expect(normalized[0]?.candidate.contract.id).toBe('c2');
    expect(without.length).toBe(0);            // 동명이인 → 자동매칭 보류
    expect(cands[0]?.contract.id).toBe('c1');
  });
});
