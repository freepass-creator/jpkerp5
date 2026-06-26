/**
 * 페이지 간 공통 필터 헬퍼.
 *
 * 운영현황 / 리스크관리 / 입출금관리 가 각자 구현하던 회사 필터·정규화 로직을 통일.
 */

import { stripCorpSuffix } from './company-display';

/**
 * 데이터 배열에서 사용중인 회사 옵션 목록 추출 — 알파벳 정렬.
 *
 *   const companyOptions = useMemo(
 *     () => buildCompanyOptions(contracts, (c) => c.company),
 *     [contracts],
 *   );
 *
 * '주식회사 OO' / 'OO 주식회사' / '(주)OO' / 'OO(주)' 는 모두 같은 회사로 묶임
 * (stripCorpSuffix 로 정규화 후 dedupe — 표기만 다른 중복 옵션 방지).
 *
 * '전체' 같은 표시 옵션은 호출 측에서 prepend 또는 별도 처리.
 */
export function buildCompanyOptions<T>(items: readonly T[], getter: (item: T) => string | undefined): string[] {
  const set = new Set<string>();
  for (const item of items) {
    const k = getter(item);
    if (k) set.add(stripCorpSuffix(k) || k);
  }
  return Array.from(set).sort();
}

/**
 * 회사 필터 조건 검사 — 'all' 통과, 외엔 법인 접두/접미 표기 무시하고 비교.
 *
 *   if (!matchesCompanyFilter(t.companyCode, companyFilter)) return false;
 *   if (!matchesCompanyFilter(contract.company, companyFilter)) return false;
 */
export function matchesCompanyFilter(itemCompany: string | undefined, filterValue: string): boolean {
  if (filterValue === 'all' || filterValue === '전체') return true;
  if (!itemCompany) return false;
  const normItem = stripCorpSuffix(itemCompany) || itemCompany;
  const normFilter = stripCorpSuffix(filterValue) || filterValue;
  return normItem === normFilter;
}

/**
 * 텍스트 검색 매처 — 다중 필드를 합쳐 lowercase 비교.
 *
 *   if (!matchesSearch(q, [t.counterparty, t.memo, contract?.vehiclePlate])) return false;
 */
export function matchesSearch(query: string, fields: Array<string | undefined>): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

/** 거래·계약에서 회사 키 추출 — companyCode 우선, fallback contract.company */
export function resolveCompanyKey(
  tx: { companyCode?: string; matchedContractId?: string },
  contractById?: ReadonlyMap<string, { company?: string }>,
): string | undefined {
  if (tx.companyCode) return tx.companyCode;
  if (tx.matchedContractId && contractById) {
    return contractById.get(tx.matchedContractId)?.company;
  }
  return undefined;
}
