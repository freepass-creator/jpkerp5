/**
 * 표준 컬럼 width 토큰 — 모든 list/detail 표가 동일 적용.
 *
 *  사용:
 *    <th style={{ width: COL.date }}>일자</th>
 *    <th style={COL.customer}>계약자</th>
 *    <th className="num" style={{ width: COL.money }}>월대여료</th>
 *
 *  같은 의미 = 같은 width.
 *  여기 값을 바꾸면 모든 표에 일관 반영.
 */

/** 단일 width 값 (px) */
export const COL = {
  /** 일자/계약일/만기일 — 90 */
  date: 90,
  /** 차량번호 (plate) — 96 */
  plate: 96,
  /** 회사 — 56 */
  company: 56,
  /** 계약번호/증권번호 — 110 */
  contractNo: 110,
  /** 연락처 — 110 */
  phone: 110,
  /** 금액 (월대여료/보증금/수납/비용/금액) — 110 num */
  money: 110,
  /** 상태 — 76 center */
  status: 76,
  /** 회차/cycle — 60 center */
  cycle: 60,
  /** 분류/category — 70 center */
  category: 70,
  /** 약정/term — 70 center */
  term: 70,
  /** 결제일 — 60 center */
  paymentDay: 60,
  /** 결제방법 — 80 center */
  paymentMethod: 80,
  /** 업체/vendor — 120 */
  vendor: 120,
  /** 주행거리 — 90 num */
  mileage: 90,
  /** 보험 (있음/없음) — 60 center */
  insuranceFlag: 60,
} as const;

/** flexible width (minWidth 만 — 남는 공간 채우는 컬럼용) */
export const COL_FLEX = {
  /** 계약자/고객명 — minWidth 180 */
  customer: { minWidth: 180 },
  /** 좁은 컨텍스트의 계약자 — minWidth 160 (nested 표) */
  customerNarrow: { minWidth: 160 },
  /** 제목/내용 — minWidth 180 */
  title: { minWidth: 180 },
  /** 비고/메모 — minWidth 140 */
  notes: { minWidth: 140 },
  /** 차종 — minWidth 130 */
  vehicleModel: { minWidth: 130 },
} as const;
