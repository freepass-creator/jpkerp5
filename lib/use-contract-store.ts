'use client';

/**
 * v4 호환 어댑터 — jpkerp5의 useContracts 를 v4 의 useContractStore 시그니처로 매핑.
 * 과태료 모듈에서 사용 — 차량번호로 활성 계약 찾기.
 */

import { useMemo } from 'react';
import { useContracts } from './firebase/contracts-store';
import type { Contract as JpkContract } from './types';

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
    customerKind: '개인',
    customerIdent: c.customerRegNoMasked ?? '',
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

/** 차량번호로 활성 계약 찾기 — v4 동일 로직. */
export function findContractByPlate(contracts: readonly Contract[], plate: string): Contract | null {
  const q = plate.replace(/\s/g, '').trim();
  if (!q) return null;
  const norm = (p: string) => p.replace(/\s/g, '');
  const candidates = contracts.filter((c) => norm(c.plate) === q);
  if (candidates.length === 0) return null;

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
