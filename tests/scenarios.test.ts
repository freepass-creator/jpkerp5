/**
 * 업무 시나리오 회귀 테스트 (#34) — 돈 계산·매칭·회계 순수 로직.
 * Firebase·React 없이 검증. 이번 세션에 고친 로직의 회귀 안전망.
 */
import { describe, it, expect } from 'vitest';
import { generateSchedules, distributeEntry, recalcContract, resizeSchedules, computeContractAsOf } from '@/lib/payment-schedule';
import { bankTxKeys } from '@/lib/dedup-keys';
import { dedupAgainst } from '@/lib/dedup';
import { buildBankJournal, summarizeByAccount } from '@/lib/gl-entries';
import { markReturned, revertToOperating } from '@/lib/contract-actions';
import { planBulkReconcile } from '@/lib/bulk-reconcile';
import { applyMultiContractMatch, updateBankTxWithMatchSync } from '@/lib/firebase/tx-contract-sync';
import { computeAssetLedgerEntry } from '@/lib/asset-ledger';
import { splitVat, computeVatReport, vatPeriodRange } from '@/lib/vat-report';
import { findVehicleForContract } from '@/lib/entity-sync';
import type { Contract, BankTransaction, PaymentScheduleInline, PaymentEntry, Vehicle } from '@/lib/types';

const TODAY = '2026-07-09';

function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', contractNo: 'C-1', company: 'FP',
    customerName: '홍길동', vehiclePlate: '12가3456',
    contractDate: '2025-01-01', termMonths: 12, monthlyRent: 500000,
    paymentDay: 1, paymentTiming: '선불',
    status: '운행', vehicleStatus: '운행',
    deposit: 0, unpaidAmount: 0, unpaidSeqCount: 0, currentSeq: 1, totalSeq: 12,
    ...over,
  } as Contract;
}
function schedulesFor(c: Contract): PaymentScheduleInline[] {
  return generateSchedules(c).map((s) => ({ ...s, payments: [] })) as PaymentScheduleInline[];
}
function bankTx(over: Partial<BankTransaction> = {}): BankTransaction {
  return { id: 't1', txDate: '2025-02-01', amount: 500000, withdraw: 0, ...over } as BankTransaction;
}

describe('회차 생성 + FIFO 매칭 + 미수', () => {
  it('12개월 계약 → 12회차', () => {
    expect(schedulesFor(contract())).toHaveLength(12);
  });
  it('과거 미납 계약은 미수 > 0, 1개월 입금 FIFO 로 500,000 소비', () => {
    const c = contract();
    const recalced = recalcContract({ ...c, schedules: schedulesFor(c) }, TODAY);
    expect(recalced.unpaidAmount).toBeGreaterThan(0);
    const entry: PaymentEntry = { date: '2025-02-01', amount: 500000, source: '계좌', txId: 't1' };
    const { consumed } = distributeEntry(recalced.schedules ?? [], entry, TODAY);
    expect(consumed.reduce((s, x) => s + x.amount, 0)).toBe(500000);
  });
});

describe('은행 dedup — 거래후잔액 discriminator', () => {
  it('같은날·금액·입금자, 잔액 다르면 둘 다 unique(실입금 보존)', () => {
    const a = bankTx({ id: 'a', counterparty: '(주)법인', account: '111', balance: 1_000_000 });
    const b = bankTx({ id: 'b', counterparty: '(주)법인', account: '111', balance: 1_500_000 });
    expect(dedupAgainst([a, b], [], bankTxKeys).unique).toHaveLength(2);
  });
  it('같은 잔액이면 재업로드로 dedup(중복 방지)', () => {
    const a = bankTx({ id: 'a', counterparty: '(주)법인', account: '111', balance: 1_000_000 });
    const b = bankTx({ id: 'b', counterparty: '(주)법인', account: '111', balance: 1_000_000 });
    expect(dedupAgainst([b], [a], bankTxKeys).unique).toHaveLength(0);
  });
});

describe('GL — CMS 집금 정산 대차 균형·수익 인식', () => {
  it('CMS 집금 deposit → 대여료수입(gross) 인식 + 대차 균형', () => {
    const t = bankTx({
      id: 'd', amount: 990_000, subject: 'CMS수수료',
      settlementRole: 'deposit', settlementGrossAmount: 1_000_000, settlementFeeAmount: 10_000,
    });
    const sum = summarizeByAccount(buildBankJournal(t));
    const totalDebit = sum.reduce((s, a) => s + a.debit, 0);
    const totalCredit = sum.reduce((s, a) => s + a.credit, 0);
    expect(totalDebit).toBe(totalCredit);           // 대차 균형
    expect(sum.find((a) => a.accountKey === 'REVENUE_RENTAL')?.credit).toBe(1_000_000); // gross 수익
    expect(sum.find((a) => a.accountKey === 'UNCLASSIFIED')).toBeUndefined();           // 미지정 증발 X
  });
});

describe('resizeSchedules — 약정기간 변경', () => {
  it('확장: term 12→24 → 회차 24개 append', () => {
    const base = contract({ termMonths: 24 });
    const sched = generateSchedules({ ...base, termMonths: 12 }).map((s) => ({ ...s, payments: [] })) as PaymentScheduleInline[];
    expect(resizeSchedules({ ...base, schedules: sched })).toHaveLength(24);
  });
  it('축소: term 12→6 → 미납 초과회차 제거, 납부회차 보존', () => {
    const sched = schedulesFor(contract({ termMonths: 12 }));
    sched[11] = { ...sched[11], status: '완료', paidAmount: 500_000, payments: [{ date: '2025-12-01', amount: 500_000, source: '계좌' }] };
    const resized = resizeSchedules({ ...contract({ termMonths: 6 }), schedules: sched });
    expect(resized.map((s) => s.seq)).toContain(12);                          // 납부회차 보존
    expect(resized.filter((s) => s.seq > 6 && s.seq !== 12)).toHaveLength(0); // 미납 초과회차 제거
  });
});

describe('반납 → 되돌리기 (면제·일할·종료정보)', () => {
  it('반납 시 반납일 이후 회차 면제, 되돌리면 해제', () => {
    const c = contract();
    const returned = recalcContract(markReturned({ ...c, schedules: schedulesFor(c) }, '2025-06-15'), TODAY);
    expect(returned.schedules?.some((s) => s.status === '면제')).toBe(true);
    const reopened = recalcContract(revertToOperating(returned), TODAY);
    expect(reopened.returnedDate).toBeUndefined();
    expect(reopened.endReason).toBeUndefined();
    expect(reopened.schedules?.filter((s) => s.status === '면제' && s.dueDate > '2025-06-15')).toHaveLength(0);
  });
});

describe('은행 분할매칭 → 전체 해제 (H11 유령 payment 방지)', () => {
  it('1입금을 2계약에 분할 후 해제하면 두 계약 모두 미수 완전 원복', async () => {
    const mk = (id: string, plate: string) =>
      recalcContract({ ...contract({ id, vehiclePlate: plate }), schedules: schedulesFor(contract({ id })) }, TODAY);
    const store = new Map<string, Contract>([['cA', mk('cA', '11가1111')], ['cB', mk('cB', '22가2222')]]);
    const unpaid0 = store.get('cA')!.unpaidAmount ?? 0;
    expect(unpaid0).toBeGreaterThan(0);

    let tx: BankTransaction = bankTx({ id: 'dep', amount: 1_000_000, txDate: '2025-02-01' });
    const updateBank = (_id: string, patch: Partial<BankTransaction>) => { tx = { ...tx, ...patch }; };
    const updateC = (c: Contract) => { store.set(c.id, recalcContract(c, TODAY)); };
    const arr = () => Array.from(store.values());

    // 분할 매칭 500k + 500k
    await applyMultiContractMatch(tx, [{ contractId: 'cA', amount: 500_000 }, { contractId: 'cB', amount: 500_000 }], arr(), updateBank, updateC);
    expect((store.get('cA')!.unpaidAmount ?? 0)).toBe(unpaid0 - 500_000);
    expect((store.get('cB')!.unpaidAmount ?? 0)).toBe(unpaid0 - 500_000);
    expect(tx.matches?.length).toBe(2);

    // 전체 해제 — 두 계약 모두 원복 + matches 비움 (구버전은 cA 만 원복하고 cB 에 유령 payment 잔존)
    await updateBankTxWithMatchSync(tx, { matchedContractId: undefined }, arr(), updateBank, updateC);
    expect((store.get('cA')!.unpaidAmount ?? 0)).toBe(unpaid0);
    expect((store.get('cB')!.unpaidAmount ?? 0)).toBe(unpaid0);
    expect(tx.matches ?? []).toHaveLength(0);
  });
});

describe('computeContractAsOf — 시점(as-of) 재구성', () => {
  it('입금일 이후 기준일에는 납부 반영, 이전 기준일에는 미납으로 재구성', () => {
    const c = contract();
    const sched = schedulesFor(c);
    // seq1 을 2026-03-01 에 납부. 두 기준일 모두 12회차 전부 연체된 시점이라 연체집합은 동일 → 입금만 격리.
    sched[0] = { ...sched[0], payments: [{ date: '2026-03-01', amount: 500_000, source: '계좌' }] };
    const base = { ...c, schedules: sched };
    const before = computeContractAsOf(base, '2026-02-28'); // 입금 전 시점
    const after = computeContractAsOf(base, '2026-04-01');  // 입금 후 시점
    // 같은 계약·같은 연체집합이라도 입금 반영 여부로 미수가 다르다 (입금 전이 딱 1회차만큼 큼)
    expect((before.unpaidAmount ?? 0) - (after.unpaidAmount ?? 0)).toBe(500_000);
    // 원본은 불변
    expect(base.schedules?.[0].payments?.[0].date).toBe('2026-03-01');
  });
  it('반납일 이후 기준일에만 반납 반영 (그 이전엔 아직 운행 중 미수 발생)', () => {
    const c = contract();
    const returned = markReturned({ ...c, schedules: schedulesFor(c) }, '2025-06-15');
    const before = computeContractAsOf(returned, '2025-05-01'); // 반납 전 → 면제 해제, 회차 살아있음
    expect(before.returnedDate).toBeUndefined();
    expect(before.schedules?.some((s) => s.status === '면제')).toBe(false);
  });
});

describe('findVehicleForContract — 안정 FK 우선 (R1)', () => {
  const vehicles = [{ id: 'vA', plate: '11가1111' }, { id: 'vB', plate: '22가2222' }] as unknown as Vehicle[];
  it('vehicleId 있으면 그것으로 조회 (plate 가 달라도 FK 우선)', () => {
    expect(findVehicleForContract(vehicles, { vehicleId: 'vB', vehiclePlate: '11가1111' })?.id).toBe('vB');
  });
  it('vehicleId 없으면 plate 폴백', () => {
    expect(findVehicleForContract(vehicles, { vehiclePlate: '11가1111' })?.id).toBe('vA');
  });
  it('vehicleId 가 무효(차량 없음)면 plate 폴백', () => {
    expect(findVehicleForContract(vehicles, { vehicleId: 'gone', vehiclePlate: '22가2222' })?.id).toBe('vB');
  });
});

describe('자산대장 처분손익 (C3 — 매각가 입력)', () => {
  const disposedVehicle = (over: Partial<Vehicle> = {}) => ({
    id: 'v1', company: 'FP', plate: '12가3456', status: '매각',
    purchasePrice: 20_000_000, purchasedDate: '2023-01-01', saleDate: '2025-01-01',
    ...over,
  } as unknown as Vehicle);

  it('매각가 입력 시 처분손익 = 매각가 - 장부가 (부호 정확)', () => {
    const e = computeAssetLedgerEntry(disposedVehicle({ salePrice: 10_000_000 }), TODAY);
    expect(e.disposed).toBe(true);
    expect(e.incomplete).toBeFalsy();
    expect(e.disposalGainLoss).toBe(10_000_000 - e.bookValue);
  });
  it('매각가 미입력이면 처분손익 미계산(undefined)', () => {
    const e = computeAssetLedgerEntry(disposedVehicle(), TODAY);
    expect(e.disposalGainLoss).toBeUndefined();
  });
});

describe('부가세 신고자료 (H16)', () => {
  it('splitVat — VAT 포함가 ÷1.1 분리 (공급가액+세액=총액)', () => {
    const { supply, vat } = splitVat(1_100_000);
    expect(supply).toBe(1_000_000);
    expect(vat).toBe(100_000);
    expect(supply + vat).toBe(1_100_000);
  });
  it('과세매출(대여료) 매출세액 + 과세매입(정비) 매입세액 → 납부예상 = 차액', () => {
    const sale = bankTx({ id: 's', txDate: '2026-08-01', amount: 1_100_000, subject: '대여료수입' });
    const buy = bankTx({ id: 'b', txDate: '2026-08-05', amount: 0, withdraw: 220_000, subject: '정비비' });
    const insur = bankTx({ id: 'i', txDate: '2026-08-06', amount: 550_000, subject: '보험금수령' }); // 면세성 — 제외
    const r = computeVatReport([sale, buy, insur], [], '2026-07-01', '2026-12-31');
    expect(r.salesVat).toBe(100_000);      // 대여료만
    expect(r.purchaseVat).toBe(20_000);    // 정비비만 (보험금수령은 매출에도 안 잡힘)
    expect(r.netVatPayable).toBe(80_000);
    expect(r.salesLines.some((l) => l.account === 'REVENUE_INSURANCE')).toBe(false);
  });
  it('기간 밖 거래는 제외', () => {
    const outOfRange = bankTx({ id: 'o', txDate: '2026-01-01', amount: 1_100_000, subject: '대여료수입' });
    const r = computeVatReport([outOfRange], [], '2026-07-01', '2026-12-31');
    expect(r.salesVat).toBe(0);
  });
  it('vatPeriodRange — 2기 = 7~12월', () => {
    expect(vatPeriodRange(2026, '2기')).toEqual({ from: '2026-07-01', to: '2026-12-31' });
  });
});

describe('planBulkReconcile — 회사 격리 (#19)', () => {
  it('JPK 통장 입금은 동명 FP 계약에 안 붙고 JPK 계약에만 귀속', () => {
    const cA = { ...contract({ id: 'cA', company: 'FP', vehiclePlate: '11가1111' }) };
    const cB = { ...contract({ id: 'cB', company: 'JPK', vehiclePlate: '22가2222' }) };
    const cAf = { ...cA, schedules: schedulesFor(cA) };
    const cBf = { ...cB, schedules: schedulesFor(cB) };
    const dep = bankTx({ id: 'dep', counterparty: '홍길동', companyCode: 'JPK', amount: 500_000, txDate: '2025-03-01' });
    const plan = planBulkReconcile([cAf, cBf], [dep], { today: TODAY });
    expect(plan.assignments.filter((a) => a.contractId === 'cA')).toHaveLength(0);
    expect(plan.assignments.filter((a) => a.contractId === 'cB').length).toBeGreaterThan(0);
  });
});
