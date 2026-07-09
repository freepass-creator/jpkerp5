'use client';

/**
 * 재무 거래 → 계약 자동 매칭 헬퍼.
 *
 * 자금일보(daily-ledger-view) / 계좌·자동이체·카드매출·법인카드 view 에서
 * 거래의 matchedContractId 또는 입금/매출 금액이 바뀔 때 호출.
 *
 * 흐름:
 *   1) 이전 매칭 있었으면 reverseMatch → 옛 계약 schedule entry 제거 + 옛 거래 패치
 *   2) 새 matchedContractId 있고 입금/매출 금액 > 0 이면 applyFifoPayment → 새 계약 schedule 자동 분배
 *
 * SSOT: feedback_jpkerp5_five_domain_ssot 정책 — 재무에서 매칭하면 계약 unpaidAmount 자동 차감.
 */

import type { BankTransaction, CardTransaction, Contract } from '@/lib/types';
import { applyFifoPayment, reverseMatch, applyFifoCardPayment, reverseCardMatch } from '@/lib/receipt-match';
import { todayKr } from '@/lib/mock-data';

/**
 * 중복 입금 감지 — 거래 금액과 같은 금액이 해당 계약에 직접 수납(source='수동'/'현금')
 * 으로 +-3일 이내에 이미 있으면 중복 가능성.
 *
 * 사용자 정책: 직접 수납 후 계좌 매칭 시 중복 경고 (직원이 같은 입금을 양쪽 등록한 경우).
 */
export function detectDuplicateManualPayment(
  contract: Contract,
  txDate: string,
  amount: number,
): { found: boolean; matchSeq?: number; matchDate?: string } {
  const txTime = new Date(txDate).getTime();
  if (!Number.isFinite(txTime) || amount <= 0) return { found: false };
  for (const s of contract.schedules ?? []) {
    for (const p of s.payments ?? []) {
      if (p.amount !== amount) continue;
      if (p.source !== '수동' && p.source !== '현금') continue;
      const pTime = new Date(p.date).getTime();
      if (!Number.isFinite(pTime)) continue;
      if (Math.abs(pTime - txTime) <= 3 * 86400_000) {
        return { found: true, matchSeq: s.seq, matchDate: p.date };
      }
    }
  }
  return { found: false };
}

type BankUpdater = (id: string, patch: Partial<BankTransaction>) => Promise<void> | void;
type ContractUpdater = (c: Contract) => Promise<void> | void;

/**
 * BankTransaction 업데이트 — 매칭 변경 시 양쪽 계약 자동 동기화.
 *
 * patch.matchedContractId 가 정의되어 있으면 변경 의도. undefined 면 그대로 둠.
 * patch.deposit 변경 + 기존 matched 있으면 reverse + 재적용.
 */
export async function updateBankTxWithMatchSync(
  oldTx: BankTransaction,
  patch: Partial<BankTransaction>,
  contracts: Contract[],
  updateBank: BankUpdater,
  updateContract: ContractUpdater,
): Promise<void> {
  const oldMatchId = oldTx.matchedContractId;
  const wasMulti = (oldTx.matches ?? []).length > 0;
  // 'in' 으로 판정 — 명시적 undefined(매칭 해제 의도)와 키 부재(기존 유지)를 구분.
  //   !== undefined 로는 vendor 재지정 등 해제 흐름({matchedContractId: undefined})이
  //   '변경 없음'으로 오인돼 reverseMatch 를 건너뛰고 계약에 유령 payment 가 남는다.
  const matchProvided = 'matchedContractId' in patch;
  const newMatchId = matchProvided ? patch.matchedContractId : oldMatchId;
  const newDeposit = patch.amount ?? oldTx.amount ?? 0;
  // 다중매칭 거래에 단일 match 패치가 오면 항상 collapse(전체 reverse) 대상.
  const matchChanged = oldMatchId !== newMatchId || (matchProvided && wasMulti);
  const amountChanged = (!!oldMatchId || wasMulti) && (oldTx.amount ?? 0) !== newDeposit;

  if (!matchChanged && !amountChanged) {
    await updateBank(oldTx.id, patch);
    return;
  }

  // 1) 이전 매칭 전부 해제 — 단일 matchedContractId + 다중 matches[] 의 모든 계약.
  //   (기존엔 matchedContractId 만 reverse 해 분할매칭의 2번째 이후 계약에 유령 payment 가 남고
  //    미수가 영구히 안 돌아왔음.) 계약별 최신상태를 working Map 으로 체이닝 — 같은 계약
  //    재적용 시 옛 entry 미제거 상태 위에 새 entry 가 쌓이는 이중차감 방지.
  const working = new Map<string, Contract>();
  const getW = (id: string): Contract | undefined => working.get(id) ?? contracts.find((c) => c.id === id);
  let resolvedPatch: Partial<BankTransaction> = { ...patch };
  const oldIds = new Set<string>();
  if (oldMatchId) oldIds.add(oldMatchId);
  for (const m of oldTx.matches ?? []) if (m.contractId) oldIds.add(m.contractId);
  for (const id of oldIds) {
    const old = getW(id);
    if (!old) continue;
    const { txPatch, contractPatch } = reverseMatch(oldTx, old, todayKr());
    resolvedPatch = { ...txPatch, ...resolvedPatch };
    working.set(id, { ...old, ...contractPatch });
  }
  // 다중→단일/해제 collapse — matches 필드 삭제 (store 가 undefined→null 로 RTDB 필드 제거)
  if (wasMulti) resolvedPatch.matches = undefined;

  // 2) 새 단일 매칭 적용 (있고 입금액 > 0)
  if (newMatchId && newDeposit > 0) {
    const newContract = getW(newMatchId);
    if (newContract) {
      const txDate = patch.txDate ?? oldTx.txDate ?? todayKr();
      // 중복 감지 — 직접 수납 후 계좌 매칭 시 양쪽 등록 사고 방지
      const dup = detectDuplicateManualPayment(newContract, txDate, newDeposit);
      if (dup.found) {
        const ok = typeof window !== 'undefined' && window.confirm(
          `⚠ 중복 입금 의심\n\n` +
          `계약(${newContract.vehiclePlate ?? '?'} · ${newContract.customerName ?? '?'})의 ` +
          `${dup.matchSeq}회차에 같은 금액 ₩${newDeposit.toLocaleString()} 직접 수납(${dup.matchDate})이 이미 있습니다.\n\n` +
          `계속 매칭하면 미수금이 두 번 차감됩니다.\n진행할까요?`,
        );
        if (!ok) {
          // 매칭 취소 — 거래 자체 patch 만 적용 (matchedContractId 제외). 해제분은 커밋.
          delete resolvedPatch.matchedContractId;
          for (const c of working.values()) await updateContract(c);
          await updateBank(oldTx.id, resolvedPatch);
          return;
        }
      }
      // FIFO 분배 — 거래 금액만큼 미납 회차 순서대로 채움
      const mergedTx: BankTransaction = { ...oldTx, ...patch, matchedContractId: newMatchId };
      const { txPatch, contractPatch } = applyFifoPayment(mergedTx, newContract);
      resolvedPatch = { ...resolvedPatch, ...txPatch };
      working.set(newMatchId, { ...newContract, ...contractPatch });
    }
  }

  // 계약별 1회 커밋
  for (const c of working.values()) await updateContract(c);
  await updateBank(oldTx.id, resolvedPatch);
}

/**
 * 다중 매칭 적용 — 한 거래를 N개 계약에 분할 결제.
 *
 * 사용 예: 회사 일괄결제로 5개 계약 50만원씩 한 번에 250만원 입금.
 *
 * 처리:
 *  1) 기존 단일 매칭 있으면 reverse
 *  2) 기존 다중 매칭 있으면 각각 reverse
 *  3) 새 splits 각 (contractId, amount) 에 applyFifoPayment 분배
 *  4) BankTransaction.matches 배열 저장
 *
 * 합산: sum(splits[].amount) ≤ tx.amount (잔여는 미배분 — 수수료·반올림 등).
 */
export async function applyMultiContractMatch(
  oldTx: BankTransaction,
  splits: Array<{ contractId: string; amount: number }>,
  contracts: Contract[],
  updateBank: BankUpdater,
  updateContract: ContractUpdater,
): Promise<void> {
  // 계약별 최신 상태를 로컬 Map 으로 체이닝 — stale 스냅샷 기반 재적용 시
  // 옛 entry 미제거 상태 위에 새 entry 가 쌓여 이중 계상되던 것 방지.
  const working = new Map<string, Contract>();
  const getWorking = (id: string): Contract | undefined =>
    working.get(id) ?? contracts.find((c) => c.id === id);
  const setWorking = (c: Contract) => working.set(c.id, c);

  // 1) 기존 단일 매칭 reverse
  if (oldTx.matchedContractId) {
    const old = getWorking(oldTx.matchedContractId);
    if (old) {
      const { contractPatch } = reverseMatch(oldTx, old, todayKr());
      setWorking({ ...old, ...contractPatch });
    }
  }
  // 2) 기존 다중 매칭 reverse — payment entry txId 기준 제거
  for (const m of oldTx.matches ?? []) {
    const old = getWorking(m.contractId);
    if (!old) continue;
    const { contractPatch } = reverseMatch(oldTx, old, todayKr());
    setWorking({ ...old, ...contractPatch });
  }
  // 3) 새 매칭 적용 — 같은 계약에 split 이 2행이어도 체이닝돼 첫 분배가 유실되지 않음
  const appliedMatches: Array<{ contractId: string; amount: number; matchedAt: string }> = [];
  const matchedAt = new Date().toISOString();
  for (const s of splits) {
    if (s.amount <= 0) continue;
    const c = getWorking(s.contractId);
    if (!c) continue;
    // 거래의 일부 금액만 분배하기 위해 임시 tx 객체
    const partialTx: BankTransaction = { ...oldTx, amount: s.amount, matchedContractId: s.contractId };
    const { contractPatch } = applyFifoPayment(partialTx, c);
    setWorking({ ...c, ...contractPatch });
    appliedMatches.push({ contractId: s.contractId, amount: s.amount, matchedAt });
  }
  // 계약당 1회 커밋
  for (const c of working.values()) {
    await updateContract(c);
  }
  // 4) BankTx 패치 — matchedContractId 는 단일 매칭 호환용으로 첫번째 split 사용
  const txPatch: Partial<BankTransaction> = {
    matches: appliedMatches,
    matchedContractId: appliedMatches[0]?.contractId,
    matchedAt,
  };
  await updateBank(oldTx.id, txPatch);
}

/* CardTransaction — 매칭 변경/금액 변경 시 동일 패턴.
   CardTx 는 매출 (deposit 대신 amount), reverseMatch/applyFifoPayment 카드 변형은
   현재 receipt-match.ts 에 별도 export 없음. matchedContractId 만 단순 반영. */
type CardUpdater = (id: string, patch: Partial<CardTransaction>) => Promise<void> | void;

export async function updateCardTxWithMatchSync(
  oldTx: CardTransaction,
  patch: Partial<CardTransaction>,
  contracts: Contract[],
  updateCard: CardUpdater,
  updateContract: ContractUpdater,
): Promise<void> {
  const oldMatchId = oldTx.matchedContractId;
  // 'in' 으로 판정 — 명시적 undefined(해제)와 키 부재(유지)를 구분 (은행 버전과 동일).
  const newMatchId = 'matchedContractId' in patch ? patch.matchedContractId : oldMatchId;
  const newAmount = patch.amount ?? oldTx.amount ?? 0;
  const matchChanged = oldMatchId !== newMatchId;
  const amountChanged = oldMatchId && (oldTx.amount ?? 0) !== newAmount;

  if (!matchChanged && !amountChanged) {
    await updateCard(oldTx.id, patch);
    return;
  }

  let resolvedPatch: Partial<CardTransaction> = { ...patch };

  // 1) 이전 매칭 해제 — cardTxId 로 연결된 회차 결제 원복
  // 같은 계약 재적용(금액 변경) 시 해제 결과를 2단계 기준으로 (stale 원본이면 이중 차감)
  let reversedContract: Contract | undefined;
  if (oldMatchId) {
    const oldContract = contracts.find((c) => c.id === oldMatchId);
    if (oldContract) {
      const { txPatch, contractPatch } = reverseCardMatch(oldTx, oldContract, todayKr());
      resolvedPatch = { ...txPatch, ...resolvedPatch };
      reversedContract = { ...oldContract, ...contractPatch };
      await updateContract(reversedContract);
    }
  }

  // 2) 새 매칭 적용 — 금액 > 0 이면 FIFO 로 미납 회차 차감
  if (newMatchId && newAmount > 0) {
    const newContract = (newMatchId === oldMatchId && reversedContract)
      ? reversedContract
      : contracts.find((c) => c.id === newMatchId);
    if (newContract) {
      const mergedTx: CardTransaction = { ...oldTx, ...patch, matchedContractId: newMatchId };
      const { txPatch, contractPatch } = applyFifoCardPayment(mergedTx, newContract);
      resolvedPatch = { ...resolvedPatch, ...txPatch };
      await updateContract({ ...newContract, ...contractPatch });
    }
  }

  await updateCard(oldTx.id, resolvedPatch);
}
