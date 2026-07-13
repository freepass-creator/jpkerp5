/**
 * 자금일보 계정과목 → 재무 enum 매핑 + GL 분개 정합 불변식.
 *  - 매핑 결과는 반드시 enum 에 존재(드롭다운 노출) · 재매핑 idempotent
 *  - 모든 입/출금 계정과목이 총계정원장에서 '미지정'으로 새지 않음(오분개 방지)
 */
import { describe, it, expect } from 'vitest';
import { ALL_SUBJECTS, RECEIPT_SUBJECTS, EXPENSE_SUBJECTS, INTERNAL_SUBJECTS } from '@/lib/ledger-subjects';
import { JBO_SUBJECT_MAP, mapJboSubject } from '@/lib/migrate/jbo-subject-map';
import { ACCOUNTS, buildBankJournal } from '@/lib/gl-entries';
import type { BankTransaction } from '@/lib/types';

const ALL = new Set<string>(ALL_SUBJECTS);

const depositTx = (subject: string): BankTransaction =>
  ({ id: 't', txDate: '2026-01-01', amount: 100000, subject } as BankTransaction);
const withdrawTx = (subject: string): BankTransaction =>
  ({ id: 't', txDate: '2026-01-01', amount: 0, withdraw: 100000, subject } as BankTransaction);

describe('자금일보 → enum 매핑 정합', () => {
  it('모든 매핑 결과값은 재무 enum(ALL_SUBJECTS) 에 존재 — 드롭다운 노출 보장', () => {
    for (const [raw, target] of Object.entries(JBO_SUBJECT_MAP)) {
      expect(ALL.has(target), `${raw} → ${target} 이 enum 에 없음`).toBe(true);
    }
  });
  it('mapJboSubject 는 enum 값에 대해 항등 — 재매핑 idempotent', () => {
    for (const s of ALL_SUBJECTS) {
      expect(mapJboSubject(s), `${s} 가 재매핑에서 변함`).toBe(s);
    }
  });
  it('mapJboSubject 이중 적용 안정 f(f(x))===f(x)', () => {
    for (const raw of Object.keys(JBO_SUBJECT_MAP)) {
      const once = mapJboSubject(raw)!;
      expect(mapJboSubject(once)).toBe(once);
    }
  });
});

describe('GL 분개 — 신규 계정과목이 미지정으로 새지 않음', () => {
  it('모든 입금 계정과목(RECEIPT) → UNCLASSIFIED 아님 + 실재 계정', () => {
    for (const s of RECEIPT_SUBJECTS) {
      const [j] = buildBankJournal(depositTx(s));
      expect(j, `${s} 분개 없음`).toBeTruthy();
      expect(j.creditAccount, `${s} → 미지정`).not.toBe('UNCLASSIFIED');
      expect(ACCOUNTS[j.creditAccount], `${s} → ${j.creditAccount} 계정 미존재`).toBeTruthy();
    }
  });
  it('모든 출금 계정과목(EXPENSE) → UNCLASSIFIED 아님 + 실재 계정', () => {
    for (const s of EXPENSE_SUBJECTS) {
      const [j] = buildBankJournal(withdrawTx(s));
      expect(j, `${s} 분개 없음`).toBeTruthy();
      expect(j.debitAccount, `${s} → 미지정`).not.toBe('UNCLASSIFIED');
      expect(ACCOUNTS[j.debitAccount], `${s} → ${j.debitAccount} 계정 미존재`).toBeTruthy();
    }
  });
  it('내부이체(INTERNAL)는 GL 분개에서 제외(손익 무관)', () => {
    for (const s of INTERNAL_SUBJECTS) {
      expect(buildBankJournal(depositTx(s)).length, `${s} 는 분개 안 돼야`).toBe(0);
    }
  });
});
