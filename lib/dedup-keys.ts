/**
 * 도메인별 중복검증 키 — lib/dedup.ts 의 dedupAgainst() 와 함께 사용.
 *
 *   const { unique, duplicates } = dedupAgainst(newBankTxs, existingBankTxs, bankTxKeys);
 */

import type { KeyFn } from './dedup';
import type { BankTransaction, CardTransaction, Contract, Vehicle } from './types';

/** 공백·하이픈·괄호 제거, 소문자 */
function norm(s: string | undefined | null): string {
  return (s ?? '').replace(/[\s\-()]/g, '').toLowerCase();
}

/**
 * 은행 거래 — 같은 거래 두 번 저장 방지.
 * 우선순위: 거래일+금액+상대방+계좌 (가장 강한 키) → 거래일+금액+적요 (계좌 모를 때)
 */
export const bankTxKeys: KeyFn<Pick<BankTransaction,
  'txDate' | 'amount' | 'withdraw' | 'counterparty' | 'account' | 'memo'
>> = (tx) => {
  const date = tx.txDate?.slice(0, 10) ?? '';
  const amount = tx.amount || 0;
  const withdraw = tx.withdraw || 0;
  const cp = norm(tx.counterparty);
  const acc = norm(tx.account);
  const memo = norm(tx.memo).slice(0, 40);
  if (!date) return [];
  return [
    // 가장 강한 키 — 모든 필드 조합
    `${date}|${amount}|${withdraw}|${cp}|${acc}`,
    // 계좌 없을 때 — 메모로 보완
    cp ? `${date}|${amount}|${withdraw}|${cp}|${memo}` : '',
  ];
};

/**
 * 카드 거래 — 승인번호가 핵심.
 */
export const cardTxKeys: KeyFn<Pick<CardTransaction,
  'txDate' | 'amount' | 'approvalNo' | 'cardLast4'
>> = (tx) => {
  const approval = norm(tx.approvalNo);
  const date = tx.txDate?.slice(0, 10) ?? '';
  const amount = tx.amount || 0;
  const last4 = norm(tx.cardLast4);
  return [
    // 1순위 — 승인번호 (보통 unique). 취소전표(음수)는 원거래와 같은 승인번호를 쓰므로
    // '|취소' suffix 로 구분 — 없으면 취소가 원거래 중복으로 오인돼 silently drop 됐음.
    approval ? `approval:${approval}${amount < 0 ? '|취소' : ''}` : '',
    // 2순위 — 일자+금액+카드뒤4 (승인번호 없을 때)
    !approval && date ? `compose:${date}|${amount}|${last4}` : '',
  ];
};

/** 차량 — 차량번호 unique. */
export const vehicleKeys: KeyFn<Pick<Vehicle, 'plate'>> = (v) => {
  const p = norm(v.plate);
  if (!p || p === '미정') return [];  // 미정 plate는 dedup 제외
  return [`plate:${p}`];
};

/**
 * 계약 — 계약번호 우선, 없으면 차량번호+계약일+고객 조합.
 */
export const contractKeys: KeyFn<Pick<Contract,
  'contractNo' | 'vehiclePlate' | 'contractDate' | 'customerName'
>> = (c) => {
  const no = norm(c.contractNo);
  const plate = norm(c.vehiclePlate);
  const date = c.contractDate ?? '';
  const name = norm(c.customerName);
  return [
    no ? `no:${no}` : '',
    plate && plate !== '미정' && date ? `compose:${plate}|${date}|${name}` : '',
  ];
};
