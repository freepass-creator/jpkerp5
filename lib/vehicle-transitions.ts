/**
 * 차량 상태 전이 = 체크리스트 게이팅.
 *
 * "그 상태로 가기 위한 준비를 체크로 완료하면 상태가 바뀐다"(사용자 요구).
 * 각 세부 상태마다 다음 단계로 가는 데 필요한 준비 항목(checklist)을 정의.
 *   · 데이터로 자동 판정되는 항목(등록증·보험·계약)은 auto → 자동 ✓ (수동 체크 불필요)
 *   · 나머지 수동 항목은 vehicle.prepChecks[key] 에 완료 일시 기록
 * 모든 항목이 충족되면 "다음 단계로" 활성 → vehicle.status 변경.
 *
 * 세부 19단계(라이프사이클)는 그대로. 여기선 "전이 흐름"만 명확히([[lib/vehicle-state]] 간편상태와 짝).
 */

import type { Vehicle, Contract, VehicleStatus } from './types';

export interface ChecklistItem {
  key: string;      // prepChecks 저장 키
  label: string;
  /** 데이터로 자동 충족되면 true (수동 체크 불필요) */
  auto?: (v: Vehicle, contract?: Contract | null) => boolean;
  /** 자동 판정 근거 표시용 */
  autoHint?: string;
}

export interface Transition {
  to: VehicleStatus;
  actionLabel: string;         // 버튼/설명 라벨
  checklist: ChecklistItem[];
}

/** 세부 상태 → 다음 전이(들). 메인 라이프사이클 위주. 정비/사고 등 즉시전이는 별도(체크 없음). */
export const VEHICLE_TRANSITIONS: Partial<Record<VehicleStatus, Transition[]>> = {
  '구매대기': [{
    to: '등록대기', actionLabel: '구매·등록 완료 → 등록대기',
    checklist: [
      { key: 'purchased', label: '차량 인수(구매) 완료' },
      { key: 'regInput', label: '자동차 등록증 입력', auto: (v) => !!v.vin, autoHint: '차대번호 입력됨' },
    ],
  }],
  '등록대기': [{
    to: '상품화대기', actionLabel: '보험·상품화 준비 → 상품화대기',
    checklist: [
      { key: 'insured', label: '보험 가입', auto: (v) => !!v.insuranceExpiryDate, autoHint: '보험 만기일 있음' },
      { key: 'prepPlan', label: '상품화 계획 수립' },
    ],
  }],
  '상품화대기': [{
    to: '상품화중', actionLabel: '상품화 착수 → 상품화중',
    checklist: [{ key: 'prepStart', label: '상품화 작업 착수' }],
  }],
  '상품화중': [{
    to: '상품대기', actionLabel: '상품화 완료 → 상품대기(영업가능)',
    checklist: [
      { key: 'exterior', label: '외관 점검·수리' },
      { key: 'interior', label: '내부 청소' },
      { key: 'mechanical', label: '정비·안전 점검' },
    ],
  }],
  '상품대기': [{
    to: '인도대기', actionLabel: '계약 체결 → 인도대기',
    checklist: [
      { key: 'contracted', label: '계약 체결', auto: (_v, c) => !!c && (c.status === '대기' || c.status === '운행'), autoHint: '계약 연결됨' },
      { key: 'deliveryReady', label: '인도 준비(정산·서류)' },
    ],
  }],
  '인도대기': [{
    to: '운행', actionLabel: '인도 완료 → 운행',
    checklist: [{ key: 'delivered', label: '차량 인도 완료' }],
  }],
  '운행': [
    {
      to: '종료대기', actionLabel: '정상 반납 예약 → 종료대기',
      checklist: [{ key: 'returnAgreed', label: '반납 의사·반납일 확정' }],
    },
    {
      // 회수(미납·채권보전) — 정상 반납과 다른 절차. 합의 없이 강제 회수.
      to: '반납', actionLabel: '회수(미납·채권보전) → 반납 입고',
      checklist: [
        { key: 'arrearsChecked', label: '미납 확인(연체 회차·금액)' },
        { key: 'recoveryNotice', label: '회수 통보 발송(내용증명 등)' },
        { key: 'locateVehicle', label: '차량 위치 확인(GPS)' },
        { key: 'recovered', label: '회수·입고 완료' },
      ],
    },
  ],
  '종료대기': [{
    to: '반납', actionLabel: '반납 입고 → 반납',
    checklist: [{ key: 'returnedIn', label: '차량 반납 입고' }],
  }],
  '반납': [{
    to: '휴차대기', actionLabel: '반납 점검 → 휴차대기',
    checklist: [{ key: 'returnInspect', label: '반납 점검(손상·정산)' }],
  }],
  '휴차대기': [{
    to: '매각검토', actionLabel: '매각 검토 → 매각검토',
    checklist: [{ key: 'disposalReview', label: '매각 여부 검토 착수' }],
  }],
  '매각검토': [{
    to: '매각대기', actionLabel: '매각 결정 → 매각대기',
    checklist: [
      { key: 'priceCheck', label: '시세 조사·견적' },
      { key: 'disposalDecided', label: '매각 결정' },
    ],
  }],
  '매각대기': [{
    to: '매각', actionLabel: '매각 완료 → 매각',
    checklist: [{ key: 'soldPaid', label: '매각 대금 수령' }],
  }],
};

/** 항목 충족? auto 판정 OR 수동 체크(prepChecks) */
export function isItemSatisfied(
  item: ChecklistItem, v: Vehicle, contract: Contract | null | undefined, prepChecks?: Record<string, string>,
): boolean {
  if (item.auto && item.auto(v, contract)) return true;
  return !!prepChecks?.[item.key];
}

/** 전이 준비 완료? 모든 체크리스트 항목 충족 */
export function isTransitionReady(
  t: Transition, v: Vehicle, contract: Contract | null | undefined, prepChecks?: Record<string, string>,
): boolean {
  return t.checklist.every((i) => isItemSatisfied(i, v, contract, prepChecks));
}

/** 현재 상태의 다음 전이(들) */
export function nextTransitions(status: VehicleStatus): Transition[] {
  return VEHICLE_TRANSITIONS[status] ?? [];
}

/** 전이별 진척도(충족/전체) */
export function transitionProgress(
  t: Transition, v: Vehicle, contract: Contract | null | undefined, prepChecks?: Record<string, string>,
): { done: number; total: number } {
  const done = t.checklist.filter((i) => isItemSatisfied(i, v, contract, prepChecks)).length;
  return { done, total: t.checklist.length };
}
