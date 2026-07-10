/**
 * 차량 「간편 상태」 — 2축 파생 SSOT.
 *
 * 문제: VehicleStatus 19개는 "차량 준비 축"과 "계약(판매) 축"을 한 칸에 욱여넣어 복잡.
 * 해법: 세부 19단계는 그대로 두고(155곳 회귀 없음), 여기서 **두 축을 조합한 헤드라인 상태**를 산출.
 *   · 차량 준비 축: 미확보 → 준비중 → 영업가능 → 운행 → 반납유휴 → 매각
 *   · 계약(판매) 축: 미계약 / 계약됨(인도 전) / 운행중 / 종료
 * → "계약됐는데 차 소싱 필요", "계약됨·상품화 중(인도 준비)" 같은 실제 상태가 한눈에.
 *
 * 데이터는 홀로 안 산다([[feedback_data_always_links]]): 차량 status × 그 차의 계약을 함께 본다.
 */

import type { VehicleStatus, ContractStatus, Contract, Vehicle } from './types';

/** 차량 준비 축 — 세부 19단계의 대분류 */
export type VehiclePrepStage = '미확보' | '준비중' | '영업가능' | '운행' | '반납유휴' | '매각';

/** 계약(판매) 축 */
export type SaleAxis = '미계약' | '계약됨' | '운행중' | '종료';

/** StatusBadge 와 호환되는 tone 부분집합 */
export type StateTone = 'red' | 'orange' | 'amber' | 'green' | 'blue' | 'gray';

export interface SimpleVehicleState {
  prep: VehiclePrepStage;
  sale: SaleAxis;
  /** 헤드라인 조합 라벨 — 화면에 이거 하나로 */
  label: string;
  tone: StateTone;
  /** 원본 세부 상태(전이·상세용) */
  detailStatus: VehicleStatus;
}

/** 세부 19단계 → 준비 축 대분류 */
const PREP_STAGE: Record<VehicleStatus, VehiclePrepStage> = {
  '구매대기': '미확보',
  '등록대기': '준비중', '상품화대기': '준비중', '상품화중': '준비중', '인도대기': '준비중', '출고대기': '준비중',
  '상품대기': '영업가능', '재고': '영업가능',
  '운행': '운행', '연장대기': '운행', '종료대기': '운행', '임시배차': '운행',
  '반납': '반납유휴', '휴차대기': '반납유휴', '휴차': '반납유휴', '정비': '반납유휴', '사고': '반납유휴',
  '매각검토': '매각', '매각대기': '매각', '매각': '매각',
};

export function vehiclePrepStage(status: VehicleStatus): VehiclePrepStage {
  return PREP_STAGE[status] ?? '준비중';
}

export function saleAxisFromContract(c?: { status?: ContractStatus } | null): SaleAxis {
  if (!c) return '미계약';
  switch (c.status) {
    case '운행': return '운행중';
    case '대기': return '계약됨';   // 계약 체결, 인도 전
    case '반납':
    case '해지':
    case '채권': return '종료';
    default:    return '미계약';
  }
}

/** 차량의 대표 계약 선택 — 운행 > 대기 > 최근 계약일 */
export function pickVehicleContract(plate: string | undefined, contracts: readonly Contract[]): Contract | undefined {
  if (!plate) return undefined;
  const mine = contracts.filter((c) => c.vehiclePlate === plate);
  if (mine.length === 0) return undefined;
  return (
    mine.find((c) => c.status === '운행') ??
    mine.find((c) => c.status === '대기') ??
    [...mine].sort((a, b) => (b.contractDate ?? '').localeCompare(a.contractDate ?? ''))[0]
  );
}

function buildLabel(prep: VehiclePrepStage, sale: SaleAxis, status: VehicleStatus): { label: string; tone: StateTone } {
  // 매각 계열 — 계약 무관, 처분 흐름
  if (prep === '매각') {
    if (status === '매각') return { label: '매각 완료', tone: 'gray' };
    if (status === '매각대기') return { label: '매각 대기', tone: 'amber' };
    return { label: '매각 검토', tone: 'amber' };
  }

  // 운행 — 손님한테 나가 있음
  if (prep === '운행') {
    if (status === '연장대기') return { label: '운행중 · 연장 협의', tone: 'blue' };
    if (status === '종료대기') return { label: '운행중 · 반납 예정', tone: 'orange' };
    if (status === '임시배차') return { label: '임시배차', tone: 'blue' };
    return { label: '운행중 (손님)', tone: 'green' };
  }

  // 반납 / 유휴 / 정비 / 사고
  if (prep === '반납유휴') {
    if (status === '정비') return { label: '정비 중', tone: 'orange' };
    if (status === '사고') return { label: '사고 처리', tone: 'red' };
    if (status === '반납') return { label: '반납 입고', tone: 'blue' };
    return { label: '유휴 · 처분 검토', tone: 'gray' };
  }

  // 계약됨인데 아직 안 나감 = 팔렸지만 차량 준비/소싱 필요
  if (sale === '계약됨') {
    if (prep === '미확보') return { label: '계약됨 · 차량 소싱 필요', tone: 'red' };
    if (prep === '영업가능') return { label: '계약됨 · 인도 대기', tone: 'blue' };
    const sub =
      status === '상품화중' ? '상품화 중' :
      status === '상품화대기' ? '상품화 대기' :
      status === '인도대기' || status === '출고대기' ? '인도 준비' :
      status === '등록대기' ? '등록 준비' : '준비 중';
    return { label: `계약됨 · ${sub}`, tone: 'orange' };
  }

  // 미계약
  if (prep === '미확보') return { label: '차량 미확보', tone: 'gray' };
  if (prep === '영업가능') return { label: '재고 · 영업가능', tone: 'green' };
  const sub =
    status === '상품화중' ? '상품화 중' :
    status === '상품화대기' ? '상품화 대기' :
    status === '등록대기' ? '등록 준비' :
    status === '인도대기' || status === '출고대기' ? '인도 준비' : '준비 중';
  return { label: `${sub} · 미계약`, tone: 'gray' };
}

/** 세부 status + 계약 → 간편 상태(조합 라벨) */
export function simpleVehicleState(status: VehicleStatus, contract?: { status?: ContractStatus } | null): SimpleVehicleState {
  const prep = vehiclePrepStage(status);
  const sale = saleAxisFromContract(contract);
  const { label, tone } = buildLabel(prep, sale, status);
  return { prep, sale, label, tone, detailStatus: status };
}

/** 편의 — 차량 + 계약목록 → 간편 상태 */
export function resolveVehicleState(vehicle: Pick<Vehicle, 'status' | 'plate'>, contracts: readonly Contract[]): SimpleVehicleState {
  return simpleVehicleState(vehicle.status, pickVehicleContract(vehicle.plate, contracts));
}

/** 준비 축 6단계 표시 순서 (필터·정렬용) */
export const PREP_STAGE_ORDER: VehiclePrepStage[] = ['미확보', '준비중', '영업가능', '운행', '반납유휴', '매각'];
