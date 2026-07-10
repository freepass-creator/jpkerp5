/**
 * 시뮬 — 입금 계정과목 자동분류. "무조건 대여료수입" → 신호 기반 재분류.
 * 감사 사례(제이피케이오토 ₩44,000,000 이 대여료수입으로 오분류되던 것)를 법인간이체로 잡는지.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { classifyDepositSubject } from '@/lib/classify-subject';

describe('입금 계정과목 자동분류 시뮬', () => {
  it('신호별 분류 실측', () => {
    const cases: { label: string; input: Parameters<typeof classifyDepositSubject>[0]; expect: string }[] = [
      { label: '일반 대여료(소액)', input: { counterparty: '97러0815 남애진', amount: 720_000 }, expect: '대여료수입' },
      { label: '계약매칭+월대여료 근사', input: { counterparty: '이우진', amount: 810_000, matchedContractId: 'c1', monthlyRent: 800_000 }, expect: '대여료수입' },
      { label: '보증금 키워드', input: { counterparty: '김철수', memo: '보증금 입금', amount: 3_000_000 }, expect: '보증금' },
      { label: '정산/환급 키워드', input: { counterparty: '정산반환', memo: '중도해지 정산', amount: 1_250_000 }, expect: '정산입금' },
      { label: '법인 상대 대액(감사 사례)', input: { counterparty: '제이피케이오토(주)', amount: 44_000_000 }, expect: '법인간이체' },
      { label: '대액 라운드+계약 미매칭', input: { counterparty: '미상', amount: 20_000_000 }, expect: '기타입금' },
      { label: '이자 입금', input: { counterparty: '신한은행', memo: '이자', amount: 12_340 }, expect: '이자입금' },
    ];

    const L: string[] = [''];
    L.push('════════ 입금 계정과목 자동분류 시뮬 ════════');
    let pass = 0;
    for (const c of cases) {
      const r = classifyDepositSubject(c.input);
      const ok = r.subject === c.expect;
      if (ok) pass++;
      L.push(`${ok ? '✓' : '✗'} ${c.label}: → ${r.subject} (${r.confidence}) — ${r.reason} ${ok ? '' : `[기대 ${c.expect}]`}`);
    }
    L.push('');
    L.push(`판정: ${pass}/${cases.length} 정확. 기본은 대여료수입 유지(하위호환), 보증금·정산·법인간이체·이자만 재분류.`);
    L.push('감사 사례(제이피케이오토 ₩44,000,000)가 대여료수입 아닌 법인간이체로 잡힘 → 회계 왜곡 완화.');
    L.push('══════════════════════════════════════════════════════════');
    writeFileSync('sim-subject-classify-report.txt', L.join('\n'), 'utf-8');

    for (const c of cases) expect(classifyDepositSubject(c.input).subject).toBe(c.expect);
  });
});
