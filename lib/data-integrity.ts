/**
 * 교차 엔티티 정합성·연동 점검 — "입력한 데이터가 뭐가 빠졌나 + 서로 물려 도나".
 *
 * v5 는 이미 risk-issues.ts 로 "계약 1건 내부" 리스크(미납·검사지연·보험만기)를 본다.
 * 여기서는 v5 에 없던 **마스터 간 참조무결성 + 연동 끊김**을 본다 (중복 금지):
 *   1) plate 고아 — 계약/보험/과태료의 차량번호가 차량 마스터에 없음
 *   2) 날짜 역전 — 계약 시작일 > 반납예정일
 *   3) 필수/완전성 누락 — 마스터·계약의 식별·과금 필드 결손 (회차 미생성 포함)
 *   4) 유령 매칭 — 거래는 계약을 가리키는데 계약엔 그 입금 기록 없음
 *   5) 연동 끊김 — 운행 차량인데 계약 없음 / 수입 거래가 계약에 안 물림(미수·자금일보 미반영)
 *
 * 순수 함수 (읽기 전용). 저장·기존 리스크 로직 무변경.
 */

import type { Contract, Vehicle, InsurancePolicy, BankTransaction, CardTransaction } from './types';
import type { PenaltyWorkItem } from './penalty-pdf';
import { isContractEnded } from './contract-lifecycle';

export type IntegritySeverity = 'high' | 'mid';

export type IntegrityIssue = {
  sev: IntegritySeverity;
  kind: '필수누락' | '날짜역전' | 'plate고아' | '유령매칭' | '회차미생성' | '차량-계약' | '미매칭수입';
  entity: '차량' | '계약' | '보험' | '과태료' | '거래';
  target: string;   // 사람이 식별할 라벨 (plate/이름)
  detail: string;
  plate?: string;
};

/** 차량번호 정규화 — 공백 제거. (OCR/입력 편차 흡수) */
function normPlate(p?: string): string {
  return (p ?? '').replace(/\s+/g, '');
}

/** 계약이 종료(반납/해지/채권)됐는지 — SSOT 위임. 종료 계약은 고아·역전·완전성 검사 제외.
 *  (로컬 판정은 '반납'·'채권'을 빠뜨려 회수불가 채권 계약에 허위 경고를 냈음) */
function isEnded(c: Contract): boolean {
  return isContractEnded(c);
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

    // 완전성 — 인도된 계약인데 수납 회차 미생성 → 미수 계산·수납 매칭이 아예 불가.
    //   (recalcContract 는 회차 없으면 미수를 손대지 않으므로 조용히 누락됨)
    if (c.deliveredDate && (c.monthlyRent ?? 0) > 0 && (!c.schedules || c.schedules.length === 0)) {
      out.push({ sev: 'high', kind: '회차미생성', entity: '계약', target: label, detail: '인도된 계약인데 수납 회차가 없음 — 미수·수납 매칭 불가 (계약 상세에서 저장 시 회차 재생성)', plate: c.vehiclePlate });
    }
    // 완전성 — 인도된 활성 계약인데 월대여료 0 → 과금·미수 계산 불가 (구조적 이상).
    //   (연락처 등 필드 단위 완전성은 계약 상세의 레코드별 점검에서. 전역 목록엔 구조 이상만.)
    if (c.deliveredDate && (c.monthlyRent ?? 0) <= 0) {
      out.push({ sev: 'mid', kind: '필수누락', entity: '계약', target: label, detail: '인도된 계약인데 월대여료 0 — 과금·미수 계산 불가', plate: c.vehiclePlate });
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

  // 5) 연동 끊김 — 운행 차량인데 연결된 활성 계약 없음.
  //    "이 차가 어디 나가있나"를 계약이 못 받쳐줌 → 실물·상태 불일치.
  const activeContractPlates = new Set<string>();
  for (const c of contracts) {
    if (isContractEnded(c)) continue;
    const p = normPlate(c.vehiclePlate);
    if (p) activeContractPlates.add(p);
  }
  for (const v of vehicles) {
    if (v.status !== '운행') continue;
    const p = normPlate(v.plate);
    const linked =
      (p && activeContractPlates.has(p)) ||
      (v.plateHistory ?? []).some((h) => { const hp = normPlate(h); return hp && activeContractPlates.has(hp); });
    if (!linked) {
      out.push({ sev: 'mid', kind: '차량-계약', entity: '차량', target: v.plate || v.id, detail: '운행 상태인데 연결된 활성 계약이 없음 — 실제 임차 여부·차량 상태 확인', plate: v.plate });
    }
  }

  // 5) 연동 끊김 — 수입 거래가 계약에 안 물림 → 미수 차감·자금일보 반영이 안 됨.
  //    (돈은 들어왔는데 어느 계약 건지 시스템이 모르는 상태 — 자금일보에서 매칭 필요)
  let unmatchedCard = 0, unmatchedCardAmt = 0;
  for (const t of cardTx) {
    if ((t.amount ?? 0) <= 0) continue;
    if (t.kind === '법인카드') continue;              // 지출은 계약 매칭 대상 아님
    if (t.matchedContractId) continue;
    unmatchedCard += 1; unmatchedCardAmt += (t.amount ?? 0);
  }
  if (unmatchedCard > 0) {
    out.push({ sev: 'mid', kind: '미매칭수입', entity: '거래', target: `카드매출 ${unmatchedCard}건`, detail: `계약 미매칭 카드매출 ${unmatchedCard}건 · ₩${unmatchedCardAmt.toLocaleString()} — 미수·자금일보에 반영 안 됨. 자금일보에서 매칭 필요` });
  }
  let unmatchedCms = 0, unmatchedCmsAmt = 0;
  for (const t of bankTx) {
    if (t.settlementRole !== 'item') continue;        // CMS 자동이체 구성건
    if (t.matchedContractId) continue;
    unmatchedCms += 1; unmatchedCmsAmt += (t.amount ?? 0);
  }
  if (unmatchedCms > 0) {
    out.push({ sev: 'mid', kind: '미매칭수입', entity: '거래', target: `자동이체 ${unmatchedCms}건`, detail: `계약 미매칭 CMS 자동이체 ${unmatchedCms}건 · ₩${unmatchedCmsAmt.toLocaleString()} — 미수 차감 안 됨. 자금일보에서 매칭 필요` });
  }

  // high 먼저
  return out.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'high' ? -1 : 1));
}
