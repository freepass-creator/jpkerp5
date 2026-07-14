/**
 * 초기 세팅 일괄 대사 매칭 — 3년치 은행입금을 활성 계약 수납스케줄에 채워 미납 대사.
 *
 * 요구(사용자):
 *  - 현재 계약자·계약에 한해, 그 계약의 대여료 입금은 어찌됐든 다 스케줄에 매칭돼야.
 *  - 미수가 있으면 오래된 미납부터 채워넣는 방식(FIFO).
 *  - 다중 계약이면 "먼저 계약한 것"부터 채우고 넘치면 다음 계약으로.
 *  - 자동매칭은 계약자명 + 대여료금액을 보완해 판정(차량번호 끝4자리 보조).
 *  - 어디에도 못 붙는 '붕 떠있는' 입금은 검토용으로 분리.
 *
 * 순수 함수. planBulkReconcile 로 미리보기 계산 → buildReconcilePatches 로 적용 패치 생성.
 */

import type { Contract, BankTransaction, PaymentEntry, PaymentScheduleInline } from './types';
import { realizeOpeningBalance, totalUnpaid, totalUnpaidCount } from './payment-schedule';
import { isContractEnded } from './contract-lifecycle';
// 정규화 SSOT — 자동매칭(receipt-match)과 동일 로직 재사용 (#1 SSOT)
import { normName, plateSuffix4, counterpartySuffix4 } from './receipt-match';

/** 입금의 차량끝4 — JBO 사전태깅 차량번호(linkedVehiclePlate) 우선, 그다음 입금자명·적요 끝4. */
function depositSuffix4(t: { counterparty?: string; memo?: string; linkedVehiclePlate?: string }): string {
  return plateSuffix4(t.linkedVehiclePlate ?? '')      // 자금일보가 박아둔 차량번호 = 최우선 신호
    || counterpartySuffix4(t.counterparty ?? '')
    || counterpartySuffix4(t.memo ?? '');
}
/** 회사|신원 복합 그룹키 — 회사 격리(#19): 입금은 자기 회사 계약에만 귀속. */
function idOf(c: Contract): string {
  return (c.customerIdentNo ?? '').replace(/\D/g, '') || normName(c.customerName ?? '');
}

export type ReconcileTx = Pick<BankTransaction, 'id' | 'txDate' | 'amount' | 'counterparty' | 'memo'>;

export type ContractReconcile = {
  contract: Contract;
  schedules: PaymentScheduleInline[];   // 매칭 적용된 회차
  matchedTxCount: number;
  matchedAmount: number;
  unpaidBefore: number;                 // contract.unpaidAmount (직원 입력/기존)
  unpaidAfter: number;                  // 실입금 채운 뒤 스케줄 미납
  monthlyRent: number;
};

export type ReconcileAssignment = { txId: string; contractId: string; amount: number; seqs: number[] };

export type BulkReconcilePlan = {
  perContract: ContractReconcile[];
  assignments: ReconcileAssignment[];
  matchedTxIds: string[];
  floating: ReconcileTx[];                       // 귀속 실패/회사 모호 입금 (검토용)
  overflow: Array<{ txId: string; amount: number }>; // 계약 미납 다 채우고 남은 초과분
  closedSkipped: ReconcileTx[];                  // 회계마감된 월이라 건너뛴 입금 (#18)
};

/**
 * 활성 계약 + 미매칭 입금 → 대사 계획(미리보기). 저장 없음(순수).
 * #19 회사 격리: 입금은 자기 회사(companyCode) 계약에만 귀속. 회사 불명이면서 신원이
 *   여러 회사에 걸치면 안전하게 floating(오귀속 방지).
 * #18 회계마감: isClosed 제공 시 마감월 입금은 건너뜀(closedSkipped).
 * #5 감사: actorEmail 을 payment entry.by 로 기록.
 */
export function planBulkReconcile(
  contracts: Contract[],
  bankTx: BankTransaction[],
  opts?: { today?: string; actorEmail?: string; isClosed?: (date: string, company?: string) => boolean },
): BulkReconcilePlan {
  const today = opts?.today ?? '';
  const isClosed = opts?.isClosed;

  // 1) 현재 계약자·계약만 (종료 제외)
  const active = contracts.filter((c) => !isContractEnded(c));

  // 2) 회사|신원 그룹핑 (#19) — 같은 이름이어도 회사가 다르면 다른 그룹
  const gkey = (company: string, id: string) => JSON.stringify([company, id]);
  const companyOf = (k: string) => (JSON.parse(k)[0] as string) ?? '';
  const groups = new Map<string, Contract[]>();
  const nameIndex = new Map<string, Set<string>>();     // normName → {그룹키...}
  const suffixIndex = new Map<string, Set<string>>();   // 차량끝4 → {그룹키...}
  const addIdx = (m: Map<string, Set<string>>, key: string, gk: string) => {
    let s = m.get(key); if (!s) { s = new Set(); m.set(key, s); } s.add(gk);
  };
  for (const c of active) {
    const id = idOf(c);
    if (!id) continue;
    const gk = gkey(c.company ?? '', id);
    let arr = groups.get(gk); if (!arr) { arr = []; groups.set(gk, arr); } arr.push(c);
    if (c.customerName) addIdx(nameIndex, normName(c.customerName), gk);
    const suf = plateSuffix4(c.vehiclePlate ?? '');
    if (suf.length === 4) addIdx(suffixIndex, suf, gk);
  }
  // 그룹 내 계약을 계약일 오름차순(먼저 계약한 것 먼저)
  for (const arr of groups.values()) {
    arr.sort((a, b) => (a.contractDate ?? '').localeCompare(b.contractDate ?? ''));
  }

  // 3) 미매칭 입금 (입금·양수·미매칭) 날짜순
  const deposits = bankTx
    .filter((t) => (t.amount ?? 0) > 0 && !(t.withdraw && t.withdraw > 0) && !t.matchedContractId)
    .sort((a, b) => (a.txDate ?? '').localeCompare(b.txDate ?? ''));

  // 4) 회사 스코프 귀속 — 차량끝4 우선, 그다음 이름. 입금 회사가 있으면 그 회사 그룹만,
  //    회사 불명이면서 신원이 여러 회사에 걸치면 floating(오귀속 방지). 마감월은 건너뜀.
  const depByGroup = new Map<string, BankTransaction[]>();
  const floating: ReconcileTx[] = [];
  const closedSkipped: ReconcileTx[] = [];
  const asTx = (t: BankTransaction): ReconcileTx => ({ id: t.id, txDate: t.txDate, amount: t.amount, counterparty: t.counterparty, memo: t.memo });
  for (const t of deposits) {
    const suf = depositSuffix4(t);
    let cand = (suf && suffixIndex.get(suf)) || undefined;
    if (!cand) {
      // 이름 귀속 — JBO 사전태깅 임차인(linkedCustomerName) 우선, 없으면 입금자명
      const nm = normName(t.linkedCustomerName || t.counterparty || '');
      cand = nm ? nameIndex.get(nm) : undefined;
    }
    if (!cand || cand.size === 0) { floating.push(asTx(t)); continue; }
    let picks = [...cand];
    if (t.companyCode) picks = picks.filter((gk) => companyOf(gk) === t.companyCode);
    if (picks.length !== 1) { floating.push(asTx(t)); continue; }   // 0=미귀속, 2+=회사 모호
    const gk = picks[0];
    if (isClosed && isClosed((t.txDate ?? '').slice(0, 10), companyOf(gk) || undefined)) { closedSkipped.push(asTx(t)); continue; }
    let arr = depByGroup.get(gk);
    if (!arr) { arr = []; depByGroup.set(gk, arr); }
    arr.push(t);
  }

  // 5) 그룹별 FIFO — 계약일순 계약의 오래된 미납부터 채우고 넘치면 다음 계약
  const work = new Map<string, PaymentScheduleInline[]>(); // contractId → 작업 schedules
  const assignments: ReconcileAssignment[] = [];
  const matchedTxIds = new Set<string>();
  const overflow: Array<{ txId: string; amount: number }> = [];

  for (const [k, cs] of groups) {
    for (const c of cs) work.set(c.id, (c.schedules ?? []).map((s) => ({ ...s, payments: [...(s.payments ?? [])] })));
    for (const t of depByGroup.get(k) ?? []) {
      let remaining = Math.max(0, Math.round(t.amount ?? 0));
      for (const c of cs) {
        if (remaining <= 0) break;
        const sched = work.get(c.id)!;
        const entry: PaymentEntry = { date: t.txDate, amount: remaining, source: '계좌', txId: t.id, by: opts?.actorEmail, at: new Date().toISOString() };
        // 期초 realization — 실입금이 期초(synthetic) 자리를 오래된순 실전환, 꼬리 미수는 보존
        const { schedules, consumed } = realizeOpeningBalance(sched, entry, today || t.txDate);
        const used = consumed.reduce((s, x) => s + x.amount, 0);
        if (used > 0) {
          work.set(c.id, schedules);
          assignments.push({ txId: t.id, contractId: c.id, amount: used, seqs: consumed.map((x) => x.seq) });
          matchedTxIds.add(t.id);
          remaining -= used;
        }
      }
      if (remaining > 0) overflow.push({ txId: t.id, amount: remaining });
    }
  }

  // 6) 계약별 결과 집계
  const byContract = new Map<string, ReconcileAssignment[]>();
  for (const a of assignments) {
    let arr = byContract.get(a.contractId);
    if (!arr) { arr = []; byContract.set(a.contractId, arr); }
    arr.push(a);
  }
  const perContract: ContractReconcile[] = [];
  for (const cs of groups.values()) {
    for (const c of cs) {
      const sched = work.get(c.id) ?? c.schedules ?? [];
      const apps = byContract.get(c.id) ?? [];
      perContract.push({
        contract: c,
        schedules: sched,
        matchedTxCount: new Set(apps.map((a) => a.txId)).size,
        matchedAmount: apps.reduce((s, a) => s + a.amount, 0),
        unpaidBefore: c.unpaidAmount ?? 0,
        unpaidAfter: totalUnpaid(sched),
        monthlyRent: c.monthlyRent ?? 0,
      });
    }
  }

  return { perContract, assignments, matchedTxIds: [...matchedTxIds], floating, overflow, closedSkipped };
}

/**
 * 대사 계획 → 실제 저장용. 저장소 배치 시그니처에 맞춤:
 *   updateManyContracts(Contract[]) / updateManyBankTx(Record<id, patch>)
 */
export function buildReconcilePatches(plan: BulkReconcilePlan): {
  contractRows: Contract[];
  txPatches: Record<string, Partial<BankTransaction>>;
} {
  const at = new Date().toISOString();

  const contractRows: Contract[] = plan.perContract
    .filter((r) => r.matchedTxCount > 0)
    .map((r) => ({
      ...r.contract,
      schedules: r.schedules,
      unpaidAmount: totalUnpaid(r.schedules),
      unpaidSeqCount: totalUnpaidCount(r.schedules),
    }));

  const byTx = new Map<string, ReconcileAssignment[]>();
  for (const a of plan.assignments) {
    let arr = byTx.get(a.txId);
    if (!arr) { arr = []; byTx.set(a.txId, arr); }
    arr.push(a);
  }
  const txPatches: Record<string, Partial<BankTransaction>> = {};
  for (const [txId, apps] of byTx) {
    const contractsHit = [...new Set(apps.map((a) => a.contractId))];
    if (contractsHit.length === 1) {
      txPatches[txId] = { matchedContractId: contractsHit[0], matchedScheduleSeq: apps[0].seqs[0], matchedAt: at };
    } else {
      // 한 입금이 여러 계약에 분할 충전 → matches[] (updateBankTxWithMatchSync 와 호환)
      const matches = contractsHit.map((cid) => ({
        contractId: cid,
        amount: apps.filter((a) => a.contractId === cid).reduce((s, a) => s + a.amount, 0),
        matchedAt: at,
      }));
      txPatches[txId] = { matchedContractId: contractsHit[0], matches, matchedAt: at };
    }
  }

  return { contractRows, txPatches };
}
