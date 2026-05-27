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
  { label: '회사',         field: 'company',         required: true,  example: '회사명' },
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
  { label: '회사',         field: 'company',          required: true,  example: '회사명', hint: '회사 마스터에 등록된 회사명' },
  { label: '차량번호',     field: 'vehiclePlate',     required: true,  example: '109호1234', hint: '미정/미발급 등 입력 시 구매대기 상태로 등록' },
  { label: '차종',         field: 'vehicleModel',     required: true,  example: '카니발하이리무진' },
  { label: '계약자명',     field: 'customerName',     required: true,  example: '김효진' },
  { label: '연락처',       field: 'customerPhone1',   required: true,  example: '010-1234-5678', hint: '문자 발송 시 사용' },
  { label: '계약일',       field: 'contractDate',     required: true,  example: '2026-05-01', hint: '2026-05-01 / 260501 / 26.5.1 / 엑셀 날짜 모두 OK' },
  { label: '반납예정일',   field: 'returnScheduledDate', required: true, example: '2027-04-30' },
  { label: '월대여료',     field: 'monthlyRent',      required: true,  example: '1500000', hint: '원 단위 숫자' },
  { label: '결제일',       field: 'paymentDay',       required: true,  example: '15', hint: '매월 1~31일 중' },

  { label: '구분',         field: 'customerKind',     required: false, example: '개인', hint: '개인/사업자/법인 — 미입력 시 등록번호 자릿수로 자동 추정' },
  { label: '등록번호',     field: 'customerIdentNo',  required: false, example: '900101-1234567', hint: '주민/사업자/법인 번호 — 자릿수로 자동 구분. 표시는 마스킹' },
  { label: '연락처2',      field: 'customerPhone2',   required: false, example: '02-555-1234' },
  { label: '지역',         field: 'customerRegion',   required: false, example: '서울' },
  { label: '행정구',       field: 'customerDistrict', required: false, example: '강남구' },
  { label: '차량상태',     field: 'vehicleStatus',    required: false, example: '구매대기', hint: '구매대기/등록대기/상품화중/인도대기/운행' },
  { label: '인도일',       field: 'deliveredDate',    required: false, example: '2026-05-05', hint: '입력 시 계약중 상태' },
  { label: '약정개월',     field: 'termMonths',       required: false, example: '12', hint: '미입력 시 계약일~반납예정일로 자동 계산' },
  { label: '장단기',       field: 'longTerm',         required: false, example: '장기', hint: '장기/단기 (12개월 이상 자동 장기)' },
  { label: '보증금',       field: 'deposit',          required: false, example: '2000000' },
  { label: '결제방법',     field: 'paymentMethod',    required: false, example: 'CMS', hint: 'CMS/카드/세금계산서/이체/후불/현금' },
  { label: '보험연령',     field: 'insuranceAge',     required: false, example: '26' },
  { label: '자차여부',     field: 'selfInsured',      required: false, example: '가입', hint: '가입/미가입' },
  { label: '거리한도Km',   field: 'distanceLimitKm',  required: false, example: '30000' },
  { label: '담당자',       field: 'manager',          required: false, example: '장근안' },
  { label: '주운전자',     field: 'driverName',       required: false, example: '박영협', hint: '법인 계약 시 실제 운전자명. 개인/사업자는 비워두면 계약자명이 운전자' },
  { label: '면허번호',     field: 'customerLicenseNo', required: false, example: '15-02-008830-07', hint: '운전자 면허번호 12자리. 하이픈 무관' },
  { label: '면허종별',     field: 'customerLicenseType', required: false, example: '1종 보통', hint: '1종 대형/1종 보통/1종 소형/2종 보통/2종 소형/2종 원동기' },
  { label: '비고',         field: 'notes',            required: false, example: '5/16 출고 예정' },
];

/* ─────────────── 현황 스냅샷 (운영중 계약 상태 일괄 반영) ─────────────── */
/**
 * 기존 운영중인 계약들의 현재 상태를 일괄 업로드해서 계약 마스터에 반영.
 * 차량번호 기준으로 upsert (있으면 갱신, 없으면 신규).
 * 업로드 후 수납 엑셀 매칭은 정상 동작 — 미수금이 차감됨.
 */
export const SNAPSHOT_COLUMNS: ColumnSpec[] = [
  { label: '법인등록번호', field: 'corpRegNo',     required: true,  example: '110111-1234567', hint: '회사 마스터의 법인등록번호로 자동 매칭 → 회사명 결정 ((주)/주식회사 자동 제거). 미등록은 입력값 그대로.' },
  { label: '차량번호',   field: 'vehiclePlate',    required: false, example: '109호1234',  hint: 'UPSERT 키 — 동일 번호 있으면 갱신. 비어있고 계약자만 있으면 구매대기 계약으로 신규 등록' },
  { label: '차명',       field: 'vehicleModel',    required: false, example: 'K5' },
  { label: '계약자',     field: 'customerName',    required: false, example: '홍길동', hint: '비어있고 차량번호만 있으면 휴차 차량으로 등록' },
  { label: '구분',       field: 'customerKind',    required: false, example: '개인', hint: '개인/사업자/법인 — 미입력 시 자동 추정' },
  { label: '등록번호',   field: 'customerIdentNo', required: false, example: '900101-1234567', hint: '주민/사업자/법인 번호 — 자릿수로 자동 구분' },
  { label: '연락처',     field: 'customerPhone1',  required: false, example: '010-1234-5678' },
  { label: '계약시작일', field: 'contractDate',    required: true,  example: '2026-01-01',  hint: '2026-01-01 / 260101 / 26.1.1 / 엑셀 날짜 모두 OK' },
  { label: '계약종료일', field: 'returnScheduledDate', required: true, example: '2026-12-31', hint: '2026-12-31 / 261231 / 26.12.31' },
  { label: '차량상태',   field: 'vehicleStatus',   required: false, example: '상품대기',     hint: '계약자 없는 행(휴차 차량)에만 적용됨 — 구매대기/등록대기/상품화대기/상품화중/상품대기/휴차대기/매각대기/매각/정비/사고/반납. 계약자 있으면 자동 운행' },
  { label: '결제일',     field: 'paymentDay',      required: false, example: '15',          hint: '매월 1~31일 결제일. 미입력 시 계약시작일의 일자 적용 — 미납일수 계산 기준' },
  { label: '결제방법',   field: 'paymentMethod',   required: false, example: 'CMS',         hint: 'CMS / 카드 / 이체 / 현금 / 후불' },
  { label: '보증금',     field: 'deposit',         required: false, example: '2000000',     hint: '원 단위' },
  { label: '월대여료',   field: 'monthlyRent',     required: false, example: '1500000',     hint: '원 단위 (월 청구금액). 계약자 있을 땐 사실상 필수' },
  { label: '보험연령',   field: 'insuranceAge',    required: false, example: '26',          hint: '만 N세 — 자동차보험 운전자 연령제한' },
  { label: '마지막입금일', field: 'lastPaidDate',  required: false, example: '2026-04-25',  hint: '마지막으로 입금된 회차의 결제일. 이 날짜 이전 회차는 자동 완료 처리. 비우면 오늘 기준으로 역순 분배' },
  { label: '현재미수',   field: 'unpaidAmount',    required: false, example: '1500000',     hint: '오늘 기준 미수 합계 (원). 0이면 정상. 마지막입금일 이후 ~ 오늘까지 회차에 역순으로 분배' },
];

/* ─────────────── 계좌 거래내역 (입금 + 출금) ─────────────── */
export const BANK_TX_COLUMNS: ColumnSpec[] = [
  { label: '거래일자',     field: 'txDate',       required: true,  example: '2026-05-14' },
  { label: '입금액',       field: 'amount',       required: false, example: '1500000', hint: '입금 행만' },
  { label: '출금액',       field: 'withdraw',     required: false, example: '350000',  hint: '출금 행만 (수수료/이체 등)' },
  { label: '잔액',         field: 'balance',      required: false, example: '12345678', hint: '거래 직후 잔액' },
  { label: '거래상대',     field: 'counterparty', required: false, example: '김효진',  hint: '입금자 또는 수취인 — 계약자명과 자동매칭' },
  { label: '적요',         field: 'memo',         required: false, example: '5월 대여료 / 수수료 등' },
  { label: '계좌번호',     field: 'account',      required: false, example: '110-123-456789', hint: '회사 마스터의 계좌와 자동 매칭' },
  { label: '은행',         field: 'source',       required: false, example: 'KB',  hint: 'KB/우리/신한/하나/농협 등' },
  { label: '회사',         field: 'companyCode',  required: false, example: '아이카', hint: '미지정 시 계좌번호로 자동 매핑' },
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

/* ─────────────── Horizontal 양식 (좌측 고정 + 우측 블록 반복) ─────────────── */
/**
 * 시트형 양식. 1행 = 1차량. 우측으로 갈수록 직전 계약/결제 이력이 반복 누적된다.
 * 사용처: 계약이력 / 수납이력 일괄 마이그레이션.
 */
export type HorizontalTemplateSpec = {
  /** 다운로드 파일명 */
  filename: string;
  /** 시트 타이틀 */
  title: string;
  /** 사용자 가이드 노트 */
  notes: string[];
  /** 좌측 고정 컬럼 (차량번호, 등록번호 등) */
  fixedColumns: ColumnSpec[];
  /** 반복 블록 컬럼 (계약자 1명분 또는 결제 1건분) */
  blockColumns: ColumnSpec[];
  /** 다운로드 시 빈 블록 반복 개수 */
  blockRepeat: number;
};

/* ─────────────── 계약이력 (차량 단위, 우측으로 직전 계약 반복) ─────────────── */
export const CONTRACT_HISTORY_TEMPLATE: HorizontalTemplateSpec = {
  filename: '계약이력.xlsx',
  title: '계약이력 일괄 등록',
  notes: [
    '· 1행 = 1차량. 우측으로 갈수록 직전 계약자.',
    '· 좌측 고정 = 차량 정보(차량번호/회사/차종). 우측 블록 = 계약자별 정보.',
    '· 첫 블록 = 현재 계약자(가장 최근). 비어있으면 휴차로 등록.',
    '· 같은 차량번호가 이미 있으면 기존 차량에 계약 이력 누적.',
    '· 등록번호는 수납이력.xlsx 에서 매칭으로 자동 백필.',
  ],
  fixedColumns: [
    { label: '차량번호',   field: 'vehiclePlate',  required: true,  example: '41구1614',   hint: '한국식 차량번호. 동일 번호는 1대로 통합' },
    { label: '회사',       field: 'company',       required: false, example: '스위치플랜', hint: '회사 마스터에 등록된 이름. 미입력 시 기타' },
    { label: '차종',       field: 'vehicleModel',  required: false, example: 'K5',         hint: '차량 모델명' },
    { label: '차량상태',   field: 'vehicleStatus', required: false, example: '운행',       hint: '운행/휴차/휴차대기/상품화중/매각/정비/사고 등. 비우면 반납일 유무로 자동' },
  ],
  blockColumns: [
    { label: '구분',     field: 'kind',                required: false, example: '개인',       hint: '개인/사업자/법인' },
    { label: '고객명',   field: 'customerName',        required: true,  example: '조해인',     hint: '비어있으면 해당 블록 무시' },
    { label: '연락처',   field: 'customerPhone1',      required: false, example: '010-1234-5678' },
    { label: '인도일자', field: 'deliveredDate',       required: false, example: '2025-04-22' },
    { label: '종료일자', field: 'returnScheduledDate', required: false, example: '2026-04-21' },
    { label: '반납일자', field: 'returnedDate',        required: false, example: '',           hint: '반납 완료된 계약만. 비어있으면 운행중' },
    { label: '대여료',   field: 'monthlyRent',         required: false, example: '650000',     hint: '월 단위 (원)' },
    { label: '보증금',   field: 'deposit',             required: false, example: '0' },
    { label: '결제일',   field: 'paymentDay',          required: false, example: '25',         hint: '매월 결제일 1~31. 미입력 시 인도일자의 일자' },
    { label: '영업자',   field: 'salesperson',         required: false, example: '장근안' },
  ],
  blockRepeat: 5,
};

/* ─────────────── 수납이력 (차량+등록번호 키, 우측으로 결제 반복) ─────────────── */
export const RECEIPT_HISTORY_TEMPLATE: HorizontalTemplateSpec = {
  filename: '수납이력.xlsx',
  title: '수납이력 일괄 등록',
  notes: [
    '· 1행 = 1계약(차량+등록번호 조합). 우측으로 갈수록 과거 결제.',
    '· 차량번호 + 계약자등록번호로 계약을 찾아 결제 이력 누적.',
    '· 등록번호가 새 값이면 해당 차량의 계약자명과 자동 매칭 시도.',
    '· 결제일자가 비어있으면 해당 블록 무시.',
  ],
  fixedColumns: [
    { label: '차량번호',       field: 'vehiclePlate',    required: true, example: '41구1614' },
    { label: '계약자등록번호', field: 'customerIdentNo', required: true, example: '900101-1234567', hint: '주민/사업자/법인 번호. 자릿수로 자동 구분. 표시는 마스킹' },
  ],
  blockColumns: [
    { label: '청구금액', field: 'charged',     required: false, example: '650000',      hint: '비어있으면 결제금액으로 가정' },
    { label: '결제금액', field: 'amount',      required: true,  example: '650000',      hint: '실제 입금된 금액' },
    { label: '결제일자', field: 'paymentDate', required: true,  example: '2025-05-25',  hint: '비어있으면 해당 블록 무시' },
    { label: '결제수단', field: 'method',      required: false, example: '계좌이체',    hint: 'CMS/카드/이체/현금/세금계산서/후불' },
    { label: '미납금액', field: 'unpaidAmount', required: false, example: '0',          hint: '청구 - 결제. 0이면 완납' },
  ],
  blockRepeat: 20,
};
