/**
 * 교차 엔티티 정합성 점검 — v6(jpkerp6-app/app/integrity)의 dataChecks 를 v5로 백포트.
 *
 * v5 는 이미 risk-issues.ts 로 "계약 1건 내부" 리스크(미납·검사지연·보험만기)를 본다.
 * 여기서는 v5 에 없던 **마스터 간 참조무결성**만 추가 (중복 금지):
 *   1) plate 고아 — 계약/보험/과태료의 차량번호가 차량 마스터에 없음
 *   2) 날짜 역전 — 계약 시작일 > 반납예정일
 *   3) 핵심 필수 누락 — 마스터/계약의 필수 식별 필드 결손
 *
 * 순수 함수 (읽기 전용). 저장·기존 리스크 로직 무변경.
 */

import type { Contract, Vehicle, InsurancePolicy, BankTransaction, CardTransaction } from './types';
import type { PenaltyWorkItem } from './penalty-pdf';

export type IntegritySeverity = 'high' | 'mid';

export type IntegrityIssue = {
  sev: IntegritySeverity;
  kind: '필수누락' | '날짜역전' | 'plate고아' | '유령매칭';
  entity: '차량' | '계약' | '보험' | '과태료' | '거래';
  target: string;   // 사람이 식별할 라벨 (plate/이름)
  detail: string;
  plate?: string;
};

/** 차량번호 정규화 — 공백 제거. (OCR/입력 편차 흡수) */
function normPlate(p?: string): string {
  return (p ?? '').replace(/\s+/g, '');
}

/** 계약이 종료(반납/해지)됐는지 — 종료 계약은 고아·역전 검사 제외. */
function isEnded(c: Contract): boolean {
  return c.status === '해지' || !!c.returnedDate;
}

export type IntegrityInput = {
  vehicles: Vehicle[];
  contracts: Contract[];
  insurances: InsurancePolicy[];
  penalties: PenaltyWorkItem[];
  /** 유령 매칭 검사용 (선택) — 과거 '매칭 해제 미영속' 버그가 남긴 잔재 검출 */
  bankTx?: BankTransaction[];
  cardTx?: CardTransaction[];
};

export function computeDataIntegrity(input: IntegrityInput): IntegrityIssue[] {
  const { vehicles, contracts, insurances, penalties, bankTx = [], cardTx = [] } = input;
  const out: IntegrityIssue[] = [];

  // 차량 마스터 plate 집합 (변경 이력 포함) — 고아 판정용 O(1) 조회
  const plateSet = new Set<string>();
  for (const v of vehicles) {
    const p = normPlate(v.plate);
    if (p) plateSet.add(p);
    for (const h of v.plateHistory ?? []) {
      const hp = normPlate(h);
      if (hp) plateSet.add(hp);
    }
  }

  // 1) 필수 누락 — 차량
  for (const v of vehicles) {
    const miss: string[] = [];
    if (!normPlate(v.plate)) miss.push('차량번호');
    if (!v.model) miss.push('모델');
    if (miss.length) out.push({ sev: 'high', kind: '필수누락', entity: '차량', target: v.plate || v.id, detail: `${miss.join(', ')} 비어있음`, plate: v.plate });
  }

  // 1) 필수 누락 + 2) 날짜 역전 + 3) plate 고아 — 계약 (종료 계약 제외)
  for (const c of contracts) {
    if (isEnded(c)) continue;
    const label = `${c.vehiclePlate ?? '?'} · ${c.customerName ?? '?'}`;
    const miss: string[] = [];
    if (!normPlate(c.vehiclePlate)) miss.push('차량번호');
    if (!c.customerName) miss.push('임차인명');
    if (miss.length) out.push({ sev: 'high', kind: '필수누락', entity: '계약', target: label, detail: `${miss.join(', ')} 비어있음`, plate: c.vehiclePlate });

    if (c.contractDate && c.returnScheduledDate && c.contractDate > c.returnScheduledDate) {
      out.push({ sev: 'high', kind: '날짜역전', entity: '계약', target: label, detail: `계약일 ${c.contractDate} > 반납예정일 ${c.returnScheduledDate}`, plate: c.vehiclePlate });
    }

    const p = normPlate(c.vehiclePlate);
    if (p && !plateSet.has(p)) {
      out.push({ sev: 'mid', kind: 'plate고아', entity: '계약', target: label, detail: `차량 ${c.vehiclePlate} 가 차량 마스터에 없음`, plate: c.vehiclePlate });
    }
  }

  // 3) plate 고아 — 보험 (보험은 deletedAt 미사용 — 갱신 시 새 증권 추가)
  for (const ins of insurances) {
    const p = normPlate(ins.carNumber);
    if (p && !plateSet.has(p)) {
      out.push({ sev: 'mid', kind: 'plate고아', entity: '보험', target: `${ins.carNumber} · ${ins.insurer ?? ''}`.trim(), detail: `차량 ${ins.carNumber} 가 차량 마스터에 없음`, plate: ins.carNumber });
    }
  }

  // 3) plate 고아 — 과태료
  for (const pen of penalties) {
    if (pen.deletedAt) continue;
    const p = normPlate(pen.car_number);
    if (p && !plateSet.has(p)) {
      out.push({ sev: 'mid', kind: 'plate고아', entity: '과태료', target: `${pen.car_number} · ${pen.notice_no ?? ''}`.trim(), detail: `차량 ${pen.car_number} 가 차량 마스터에 없음`, plate: pen.car_number });
    }
  }

  // 4) 유령 매칭 — 거래는 matchedContractId 를 갖는데, 그 계약의 payments 에 해당 거래 entry 가 없음.
  //    과거 '매칭 해제 미영속' 버그(patch undefined 미기록)가 남긴 잔재: 화면에서 해제했지만
  //    거래엔 매칭이 살아있어 tx↔계약이 어긋난 상태. 해당 거래에서 매칭 해제→재매칭으로 정리.
  if (bankTx.length > 0 || cardTx.length > 0) {
    const contractById = new Map(contracts.map((c) => [c.id, c]));
    const hasEntry = (c: Contract, pred: (p: { txId?: string; cardTxId?: string }) => boolean): boolean =>
      (c.schedules ?? []).some((s) => (s.payments ?? []).some(pred));

    for (const t of bankTx) {
      if (!t.matchedContractId) continue;
      if ((t.amount ?? 0) <= 0) continue;              // 출금·0원은 회차 entry 없는 매칭도 정상
      if (t.settlementRole === 'item') continue;       // CMS 구성건은 집금건이 대표 매칭
      const c = contractById.get(t.matchedContractId);
      const label = `${(t.txDate ?? '').slice(0, 10)} ${t.counterparty ?? ''} ₩${(t.amount ?? 0).toLocaleString()}`.trim();
      if (!c) {
        out.push({ sev: 'high', kind: '유령매칭', entity: '거래', target: label, detail: '매칭된 계약이 존재하지 않음 (삭제됨) — 거래에서 매칭 해제 필요' });
      } else if (!hasEntry(c, (p) => p.txId === t.id)) {
        out.push({ sev: 'mid', kind: '유령매칭', entity: '거래', target: label, detail: `계약(${c.vehiclePlate ?? '?'} ${c.customerName ?? ''})에 이 입금 기록이 없음 — 매칭 해제 후 재매칭 권장`, plate: c.vehiclePlate });
      }
    }
    for (const t of cardTx) {
      if (!t.matchedContractId) continue;
      if ((t.amount ?? 0) <= 0 || t.kind === '법인카드') continue;
      const c = contractById.get(t.matchedContractId);
      const label = `${(t.txDate ?? '').slice(0, 10)} 카드 ${t.customerName ?? ''} ₩${(t.amount ?? 0).toLocaleString()}`.trim();
      if (!c) {
        out.push({ sev: 'high', kind: '유령매칭', entity: '거래', target: label, detail: '매칭된 계약이 존재하지 않음 (삭제됨) — 거래에서 매칭 해제 필요' });
      } else if (!hasEntry(c, (p) => p.cardTxId === t.id)) {
        out.push({ sev: 'mid', kind: '유령매칭', entity: '거래', target: label, detail: `계약(${c.vehiclePlate ?? '?'} ${c.customerName ?? ''})에 이 카드수납 기록이 없음 — 매칭 해제 후 재매칭 권장`, plate: c.vehiclePlate });
      }
    }
  }

  // high 먼저
  return out.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'high' ? -1 : 1));
}
