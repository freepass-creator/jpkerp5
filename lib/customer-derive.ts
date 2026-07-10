/**
 * 고객 마스터 파생 (#R5) — 계약에 임베드된 고객정보를 등록번호 기준 dedup 해 Customer 마스터로 통합.
 *
 * 원천(계약의 customerName/IdentNo/Phone)은 그대로 유지. 이 파생은 "동일인 여러 계약 연결" + v6 customer 이관 정합.
 * 결정적 id(dedup 키 기반)라 재실행 멱등 — 같은 계약셋이면 같은 고객 id.
 */

import type { Contract, Customer } from './types';
import { normName } from './receipt-match';

/** 고객 dedup 키 — 등록번호(주민/사업자) 우선, 없으면 이름+전화. RTDB 키로 안전한 문자만. */
export function customerKey(c: { customerIdentNo?: string; customerName?: string; customerPhone1?: string }): string {
  const id = (c.customerIdentNo ?? '').replace(/\D/g, '');
  if (id) return `id_${id}`;
  const nm = normName(c.customerName ?? '').replace(/[.#$/[\]]/g, '');
  const ph = (c.customerPhone1 ?? '').replace(/\D/g, '');
  return `np_${nm || 'x'}_${ph || 'x'}`;
}

/** 계약들 → 고객 마스터 dedup 파생 + 계약→고객 매핑. 재실행 멱등(결정적 id). */
export function deriveCustomers(contracts: Contract[]): {
  customers: Customer[];
  contractToCustomer: Record<string, string>;
} {
  const byKey = new Map<string, Customer>();
  const contractToCustomer: Record<string, string> = {};

  for (const c of contracts) {
    if (!c.id) continue;
    if (!c.customerName && !c.customerIdentNo) continue; // 식별 불가 계약은 스킵
    const key = customerKey(c);
    contractToCustomer[c.id] = key;

    let cust = byKey.get(key);
    if (!cust) {
      cust = { id: key, name: c.customerName ?? '', contractIds: [], payerAliases: [] };
      byKey.set(key, cust);
    }
    cust.contractIds!.push(c.id);

    // 빈 필드만 보강 (첫 non-empty 유지 — 원천 훼손 없음)
    if (!cust.identNo && c.customerIdentNo) cust.identNo = c.customerIdentNo;
    if (!cust.kind && c.customerKind) cust.kind = c.customerKind;
    if (!cust.name && c.customerName) cust.name = c.customerName;
    if (!cust.phone1 && c.customerPhone1) cust.phone1 = c.customerPhone1;
    if (!cust.phone2 && c.customerPhone2) cust.phone2 = c.customerPhone2;
    if (!cust.companyCode && c.company) cust.companyCode = c.company;

    // 입금자명 별칭 통합 — 다른 이름·payerAliases 를 고객 단위로 승격(자동매칭·회수에 활용)
    const aliases = cust.payerAliases!;
    for (const a of c.payerAliases ?? []) if (a && !aliases.includes(a)) aliases.push(a);
    if (c.customerName && c.customerName !== cust.name && !aliases.includes(c.customerName)) aliases.push(c.customerName);
  }

  return { customers: [...byKey.values()], contractToCustomer };
}
