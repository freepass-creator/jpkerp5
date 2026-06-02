'use client';

/**
 * v4 호환 어댑터 — jpkerp5의 useContracts 를 v4 의 useContractStore 시그니처로 매핑.
 * 과태료 모듈에서 사용 — 차량번호로 활성 계약 찾기.
 */

import { useMemo } from 'react';
import { useContracts } from './firebase/contracts-store';
import type { Contract as JpkContract } from './types';
import { contractIdentMasked } from './ident';

export type Contract = {
  contractNo: string;
  plate: string;
  customerName: string;
  customerPhone: string;
  customerKind?: '개인' | '사업자';
  customerIdent?: string;
  customerAddress?: string;
  startDate: string;
  endDate: string;
  companyCode: string;
  status: '운행중' | '대기' | '만기' | '해지';
};

function adapt(c: JpkContract): Contract {
  return {
    contractNo: c.contractNo,
    plate: c.vehiclePlate,
    customerName: c.customerName,
    customerPhone: c.customerPhone1 ?? '',
    customerKind: c.customerKind === '법인' ? '사업자' : (c.customerKind ?? '개인'),
    customerIdent: contractIdentMasked(c),
    customerAddress: '',
    startDate: c.contractDate,
    endDate: c.returnScheduledDate ?? '',
    companyCode: c.company,
    status:
      c.status === '운행' ? '운행중'
      : c.status === '대기' ? '대기'
      : c.status === '반납' ? '만기'
      : '해지',
  };
}

/** v4 시그니처: [contracts, setter] — penalty 모듈은 read-only 사용. */
export function useContractStore(): readonly [Contract[], () => void] {
  const { contracts } = useContracts();
  const adapted = useMemo(() => contracts.map(adapt), [contracts]);
  return [adapted, () => {}];
}

/** 차량번호 정규화 — 공백/하이픈/점/괄호 등 모든 비-한글·숫자 제거. */
function normalizePlate(p: string): string {
  return (p ?? '').replace(/[^0-9가-힣]/g, '');
}

/**
 * 차량번호 + 위반일로 책임 계약 찾기.
 *   1순위: 위반일이 계약 기간 [startDate, endDate] 안에 들어가는 계약 (해지·만기 이력 포함)
 *   2순위: 위반일이 없거나 어느 계약 기간에도 안 맞으면 status 우선순위로 fallback
 *
 * 한 차량에 계약 이력 여러 개일 때 — 누가 그 시점 운전자였는지 명확히.
 */
export function findContractByPlate(
  contracts: readonly Contract[],
  plate: string,
  violationDate?: string,
): Contract | null {
  const q = normalizePlate(plate);
  if (!q) return null;
  const candidates = contracts.filter((c) => c.plate && normalizePlate(c.plate) === q);
  if (candidates.length === 0) return null;

  // 1순위 — 위반일이 계약 기간 안 (해지 이력도 포함)
  if (violationDate) {
    const inPeriod = candidates.filter((c) => {
      if (!c.startDate) return false;
      if (violationDate < c.startDate) return false;
      if (c.endDate && violationDate > c.endDate) return false;
      return true;
    });
    if (inPeriod.length > 0) {
      // 여러 건 겹칠 경우 startDate 늦은(=최신) 계약 우선
      inPeriod.sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
      return inPeriod[0];
    }
  }

  // 2순위 — status 활성 우선
  const STATUS_PRIORITY: Record<string, number> = {
    '운행중': 0, '대기': 1, '만기': 2, '해지': 3,
  };
  candidates.sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 99;
    const pb = STATUS_PRIORITY[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    return (b.startDate ?? '').localeCompare(a.startDate ?? '');
  });
  return candidates[0];
}
