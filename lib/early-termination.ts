/**
 * 중도해지 위약금 상시 계산 (#반납 위약금).
 *
 * 위약금율(%)은 계약조건(계약서)에서 = Contract.earlyTerminationRate. 상시 "지금 반납 시 위약금 얼마" 계산.
 * 위약금 = 잔여기간(개월) × 월대여료 × 요율. 만기 도래(정상종료)면 0.
 */

import type { Contract } from './types';
import { addMonthsKeepDay } from './payment-schedule';
import { monthsBetween } from './utils';

export type EarlyTerminationCalc = {
  rate: number;            // 위약금율(%)
  isEarly: boolean;        // asOf 가 만기 전인가(중도해지 대상)
  remainingMonths: number; // 잔여 개월
  monthlyRent: number;
  fee: number;             // 위약금 = 잔여개월 × 월대여료 × 요율
  maturity: string;        // 약정 만기일
};

/** 기준일(asOf, 보통 오늘/반납예정일)에 지금 반납하면 부과될 중도해지 위약금 상시 계산. */
export function computeEarlyTerminationFee(c: Contract, asOf: string): EarlyTerminationCalc {
  const rate = c.earlyTerminationRate ?? 0;
  const monthlyRent = c.monthlyRent ?? 0;
  const maturity = c.contractDate ? addMonthsKeepDay(c.contractDate, c.termMonths ?? 0) : '';
  const isEarly = !!maturity && asOf < maturity;
  const remainingMonths = isEarly ? monthsBetween(asOf, maturity) : 0;
  const fee = Math.round(remainingMonths * monthlyRent * (rate / 100));
  return { rate, isEarly, remainingMonths, monthlyRent, fee, maturity };
}
