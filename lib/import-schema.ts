// icar001 — 신규 생성 시 엑셀에 들어가야 할 컬럼 명세
// 각 컬럼은 Contract / BankTransaction / CardTransaction 필드로 매핑됨

export type ColumnSpec = {
  /** 엑셀 헤더 라벨 — 사용자가 보는 컬럼명 */
  label: string;
  /** Contract / Tx 객체 필드 키 */
  field: string;
  required: boolean;
  /** 값 예시 — 템플릿/도움말용 */
  example: string;
  /** 부가 설명 */
  hint?: string;
};

/* ─────────────── 차량 등록 (회사 fleet에 차량 추가) ─────────────── */
export const VEHICLE_COLUMNS: ColumnSpec[] = [
  { label: '회사',         field: 'company',         required: true,  example: '아이카' },
  { label: '차종',         field: 'model',           required: true,  example: '카니발하이리무진' },
  { label: '차량번호',     field: 'plate',           required: false, example: '109호1234', hint: '구매 전이면 미정/공란' },
  { label: '차량상태',     field: 'vehicleStatus',   required: false, example: '구매대기', hint: '구매대기/등록대기/상품화중/인도대기/재고' },
  { label: '매입일',       field: 'purchasedDate',   required: false, example: '2026-05-09', hint: '입력 시 등록대기 이후' },
  { label: '등록일',       field: 'registeredDate',  required: false, example: '2026-05-12' },
  { label: '상품화일',     field: 'readiedDate',     required: false, example: '2026-05-15' },
  { label: '비고',         field: 'notes',           required: false, example: '벤츠코리아 발주' },
];

/* ─────────────── 계약 ─────────────── */
export const CONTRACT_COLUMNS: ColumnSpec[] = [
  { label: '회사',         field: 'company',          required: true,  example: '아이카', hint: '아이카/달카/렌트로/직카 중 하나' },
  { label: '차량번호',     field: 'vehiclePlate',     required: true,  example: '109호1234', hint: '미정/미발급 등 입력 시 구매대기 상태로 등록' },
  { label: '차종',         field: 'vehicleModel',     required: true,  example: '카니발하이리무진' },
  { label: '계약자명',     field: 'customerName',     required: true,  example: '김효진' },
  { label: '연락처',       field: 'customerPhone1',   required: true,  example: '010-1234-5678', hint: '문자 발송 시 사용' },
  { label: '계약일',       field: 'contractDate',     required: true,  example: '2026-05-01', hint: 'YYYY-MM-DD' },
  { label: '반납예정일',   field: 'returnScheduledDate', required: true, example: '2027-04-30' },
  { label: '월대여료',     field: 'monthlyRent',      required: true,  example: '1500000', hint: '원 단위 숫자' },
  { label: '결제일',       field: 'paymentDay',       required: true,  example: '15', hint: '매월 1~31일 중' },

  { label: '등록번호',     field: 'customerRegNo',    required: false, example: '900101-1234567', hint: '저장 시 마스킹' },
  { label: '연락처2',      field: 'customerPhone2',   required: false, example: '02-555-1234' },
  { label: '지역',         field: 'customerRegion',   required: false, example: '서울' },
  { label: '행정구',       field: 'customerDistrict', required: false, example: '강남구' },
  { label: '차량상태',     field: 'vehicleStatus',    required: false, example: '구매대기', hint: '구매대기/등록대기/상품화중/인도대기/운행' },
  { label: '인도일',       field: 'deliveredDate',    required: false, example: '2026-05-05', hint: '입력 시 계약완료 상태' },
  { label: '약정개월',     field: 'termMonths',       required: false, example: '12', hint: '미입력 시 계약일~반납예정일로 자동 계산' },
  { label: '장단기',       field: 'longTerm',         required: false, example: '장기', hint: '장기/단기 (12개월 이상 자동 장기)' },
  { label: '보증금',       field: 'deposit',          required: false, example: '2000000' },
  { label: '결제방법',     field: 'paymentMethod',    required: false, example: 'CMS', hint: 'CMS/카드/세금계산서/이체/후불/현금' },
  { label: '보험연령',     field: 'insuranceAge',     required: false, example: '26' },
  { label: '자차여부',     field: 'selfInsured',      required: false, example: '가입', hint: '가입/미가입' },
  { label: '거리한도Km',   field: 'distanceLimitKm',  required: false, example: '30000' },
  { label: '담당자',       field: 'manager',          required: false, example: '장근안' },
  { label: '비고',         field: 'notes',            required: false, example: '5/16 출고 예정' },
];

/* ─────────────── 계좌 입금 트랜잭션 ─────────────── */
export const BANK_TX_COLUMNS: ColumnSpec[] = [
  { label: '거래일자',     field: 'txDate',       required: true,  example: '2026-05-14' },
  { label: '입금자',       field: 'counterparty', required: true,  example: '김효진', hint: '계약자명과 자동 매칭' },
  { label: '입금액',       field: 'amount',       required: true,  example: '1500000', hint: '입금만 (출금 행은 무시)' },
  { label: '적요',         field: 'memo',         required: false, example: '5월 대여료' },
  { label: '잔액',         field: 'balance',      required: false, example: '12345678' },
  { label: '은행',         field: 'source',       required: false, example: 'KB', hint: 'KB/우리/신한/하나/농협 등' },
];

/* ─────────────── 자동이체 (CMS) 출금 결과 ─────────────── */
export const CMS_TX_COLUMNS: ColumnSpec[] = [
  { label: '출금일',       field: 'txDate',       required: true,  example: '2026-05-15', hint: '월별 출금 시도일' },
  { label: '고객명',       field: 'customerName', required: true,  example: '김효진', hint: '계약자명과 자동 매칭' },
  { label: '출금액',       field: 'amount',       required: true,  example: '1500000' },
  { label: '결과',         field: 'result',       required: true,  example: '성공', hint: '성공/실패/부분' },
  { label: '실패사유',     field: 'failReason',   required: false, example: '잔액부족', hint: '잔액부족/계좌오류/한도초과/해지 등' },
  { label: 'CMS번호',      field: 'cmsNo',        required: false, example: 'CMS-26-05-001234' },
  { label: '출금은행',     field: 'source',       required: false, example: 'KB' },
];

/* ─────────────── 카드 결제 트랜잭션 ─────────────── */
export const CARD_TX_COLUMNS: ColumnSpec[] = [
  { label: '승인일',       field: 'txDate',       required: true,  example: '2026-05-14' },
  { label: '승인번호',     field: 'approvalNo',   required: true,  example: '20260514001' },
  { label: '금액',         field: 'amount',       required: true,  example: '480000' },
  { label: '카드번호',     field: 'cardLast4',    required: false, example: '****-****-****-1234', hint: '뒷 4자리만 추출' },
  { label: '카드사',       field: 'source',       required: false, example: 'BC' },
  { label: '가맹점',       field: 'merchant',     required: false, example: 'icar 렌트' },
  { label: '고객명',       field: 'customerName', required: false, example: '강지훈', hint: '계약자명과 자동 매칭' },
];
