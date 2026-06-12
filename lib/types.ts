// jpkerp5 — 미수/반납/수납 ERP 핵심 타입

/** 회사 식별 — 회사 마스터로 동적 관리. legacy 더미는 모두 제거됨. */
export type CompanyCode = string;

export type VehicleStatus =
  // ── 메인 라이프사이클 (X대기 → X완료 패턴) ──
  | '구매대기'      // → 구매완료 → 등록대기
  | '등록대기'      // → 등록완료 → 상품화대기
  | '상품화대기'    // → 상품화 착수 → 상품화중
  | '상품화중'      // → 상품화 완료 → 상품대기
  | '상품대기'      // 영업 가능 → 계약 생성 시 운행
  | '운행'          // 계약중 (표시: 계약중) → 반납예정일 D-90 진입 시 자동 만기임박
  | '연장대기'      // 운행 중 만기 임박 — 고객 연장 의사 있음, 새 조건 협의 중
  | '종료대기'      // 운행 중 만기 임박 — 고객 반납 의사 확정, 반납일 약속 잡음
  | '휴차대기'      // 반납 후 대기 → 매각/재상품화 결정
  | '매각검토'      // 휴차 차량 매각 여부 검토 중 (시세조사·견적·내부논의). 결론 후 매각대기 또는 휴차/재상품화
  | '매각대기'      // → 매각 완료 → 매각
  | '매각'          // terminal
  // ── legacy / 부수 ──
  | '인도대기' | '출고대기' | '재고' | '반납' | '휴차' | '임시배차' | '정비' | '사고';

export type ContractStatus = '대기' | '운행' | '반납' | '해지' | '채권';

/** 결제방법 — 자유 입력 (CMS/카드/세금계산서/이체/후불/현금/기타 + 모빌러그장기/카랜장기/장기CMS 등 외부 채널) */
export type PaymentMethod = string;

/** 계약 = 고객/차량/일정/금액 라이프사이클 1회분 */
export type Contract = {
  id: string;
  contractNo: string;          // ICR-YYMM-XXXX
  company: CompanyCode;
  manager?: string;            // 담당자
  // 고객 (임베드)
  customerName: string;
  customerKind?: '개인' | '사업자' | '법인';
  /** 식별번호 — kind에 따라 주민번호/사업자번호/법인번호 1개. raw 그대로 저장 */
  customerIdentNo?: string;
  /** @deprecated customerIdentNo + customerKind 로 derive — 호환 위해 유지, 신규 코드는 maskIdent() 사용 */
  customerRegNoMasked?: string;
  customerPhone1: string;
  customerPhone2?: string;
  customerRegion?: string;
  customerDistrict?: string;
  // 면허 — RIMS 조회용 (계약자 본인 또는 주운전자)
  customerLicenseNo?: string;        // 면허번호 (예: 11-12-345678-90)
  customerLicenseStatus?: '정상' | '정지' | '취소' | '만료' | '결격' | '확인불가' | '미조회';
  customerLicenseCheckedAt?: string; // 마지막 RIMS 조회 시각 (ISO)
  customerLicenseExpiry?: string;    // RIMS 응답의 만료일
  customerLicenseType?: string;      // 1종/2종 등
  /** 면허증 OCR 원본 파일 — 검증 + 영구 보관 (보험증권 패턴) */
  customerLicenseCertUrl?: string;
  customerLicenseCertFileName?: string;
  customerLicenseCertUploadedAt?: string;
  // 주운전자 — 법인 계약일 때 또는 계약자 ≠ 운전자일 때만. 비어있으면 customerName이 운전자.
  driverName?: string;
  /** 주운전자 식별번호 — 주민번호(개인). 만연령·보험가능연령 매칭용. 비어있으면 customerIdentNo 사용 */
  driverIdentNo?: string;
  // 차량 (임베드)
  vehiclePlate: string;
  vehicleModel: string;            // 자동 결합 풀네임 (예: '현대 아반떼 더 뉴 그랜저 GN7 가솔린 3.5 AWD 캘리그래피')
  vehicleStatus: VehicleStatus;
  // 5단 분류 (나중에 카탈로그 cascade 도입 시 인덱스/필터로 활용)
  vehicleMaker?: string;           // 제조사 (dropdown) — '현대'
  vehicleModelLine?: string;       // 모델 (dropdown) — '그랜저'
  vehicleSubModel?: string;        // 세부모델 (input) — '더 뉴 그랜저 GN7'
  vehicleVariant?: string;         // 모델구분 (input) — '가솔린 3.5 AWD' (연료·엔진·구동·인승)
  vehicleTrim?: string;            // 트림 (input) — '캘리그래피'
  // 차량별 고유 입력
  vehicleOptions?: string;         // 선택옵션 자유 입력 (예: '선루프, 풀옵션, 18인치휠')
  vehicleExteriorColor?: string;   // 외부 색상 (예: '화이트 펄')
  vehicleInteriorColor?: string;   // 내부 색상 (예: '베이지')
  // 기간
  contractDate: string;             // YYYY-MM-DD — 계약 체결일
  purchasedDate?: string;           // 차량 매입 완료일 (→ 등록대기)
  registeredDate?: string;          // 등록 완료일 (→ 상품화중)
  readiedDate?: string;             // 상품화 완료일 (→ 인도대기)
  deliveryScheduledDate?: string;
  deliveredDate?: string;           // 인도/출고 실제일 (→ 계약중)
  returnScheduledDate?: string;
  returnedDate?: string;
  termMonths: number;
  longTerm: boolean;
  // 금액
  monthlyRent: number;
  deposit: number;
  paymentDay: number;          // 매월 결제일 (1~31)
  paymentMethod: PaymentMethod;
  /**
   * 결제 시기 — 선불(당월 1일 인출) vs 후불(말일 결제)
   * default = '선불' (입력 안 했을 때 안전 가정)
   */
  paymentTiming?: '선불' | '후불';
  // 옵션
  insuranceAge?: number;
  selfInsured?: boolean;
  distanceLimitKm?: number;
  // 휴차기간 — vehicleStatus === '휴차' 일 때 사용
  idleSince?: string;       // 휴차 시작일
  idleUntil?: string;       // 휴차 종료 예정일 (정비 완료 예상 등)
  idleReason?: string;      // 사유 (사고/정비/대기 등)
  idleLocation?: string;    // 현재 위치 — 휴차 차량 보관 장소 (예: 본사 차고지, 분당 주차장 B-12)
  idleContact?: string;     // 위치 담당자 연락처 (보관소 관리자 등)
  // 임시배차 — vehicleStatus === '임시배차' 일 때
  tempReplacementPlate?: string;  // 실제로 나간 대체 차량번호 (예: K5 계약인데 K8 임시 출고)
  tempReplacementModel?: string;  // 대체 차종
  tempReason?: string;            // 임시배차 사유 (원본 차량 어디 있는지 등)
  tempSince?: string;             // 임시배차 시작일
  // 알림 대기 — 어떤 차량이 휴차/반납 되면 통보 (Phase 2)
  notifyOnAvailable?: string[];   // 차량번호 배열 — 이 차량들이 복귀하면 알림
  // 계약서 파일 (Firebase Storage)
  contractDocUrl?: string;        // 계약서 PDF/이미지 다운로드 URL
  contractDocFileName?: string;   // 원본 파일명
  contractDocUploadedAt?: string; // ISO timestamp — 업로드 시각
  // 시동제어 (미수 채권 회수용 — 차량 원격 시동 차단 상태)
  engineDisabled?: boolean;
  engineDisabledAt?: string;     // ISO timestamp — 제어 발효 시각
  engineDisabledBy?: string;     // 등록자 email
  engineDisabledReason?: string;
  // 컴플라이언스 (계약상태 산출용)
  inspectionDueDate?: string;  // 다음 정기검사 예정일 (지나면 미수검)
  insuranceExpiryDate?: string; // 자동차보험 만기일
  vehicleTaxDueDate?: string;  // 자동차세 납부일
  hasViolations?: boolean;     // 과태료/단속 미처리 있음
  violationSince?: string;     // 위반 발생일
  // 상태
  status: ContractStatus;
  notes?: string;
  /**
   * 종료 사유 — 계약이 status 변경되어 종료될 때 명시. 과태료 부과 근거.
   *
   *  · 정상종료: 약정 만기 도래 + 정산 완료
   *  · 중도해지: 약정 만기 전 해지 (위약금 부과 근거)
   *  · 채권보전: 미수 잔액 남은 채로 종료 (채권 추심 대상)
   */
  endReason?: '정상종료' | '중도해지' | '채권보전';
  endedAt?: string;              // 종료 처리 일자 (YYYY-MM-DD)
  unpaidAtEnd?: number;          // 종료 시점 미수 잔액 (채권보전 산출 근거)
  earlyTerminationFee?: number;  // 중도해지 위약금 (부과 근거)
  endNotes?: string;             // 종료 사유 부연 (담당자 메모, 추심 단계 등)
  /** 선도구매 — 계약자 없이 회사가 미리 차량 구매 (재고 확보용) */
  isInventoryPurchase?: boolean;
  // 계약서 발송 상태
  documentStatus?: '미발송' | '발송완료' | '열람' | '서명완료' | '거절';
  documentSentAt?: string;       // ISO timestamp
  documentSentChannel?: '이메일' | 'SMS' | '카톡';
  documentSentTo?: string;
  documentSignedAt?: string;
  // 파생 (캐시) - 리스트 성능용
  currentSeq: number;          // 현재 회차 (최근 완료 + 1)
  totalSeq: number;            // 총 회차 = termMonths
  lastPaidDate?: string;
  lastPaidAmount?: number;
  unpaidAmount: number;        // 미수 합
  unpaidSeqCount: number;      // 미납 회차 수
  // 회차 스케줄 — 운영현황 업로드 시 자동 생성 + 미수 분배 (lib/payment-schedule.ts)
  schedules?: PaymentScheduleInline[];
  // 활성 리스크 이슈 (lib/risk-issues.ts 가 동적 계산 — 저장 X)
  // 운영현황 → 떨어진 계약은 receivables 페이지에서 자동 감지
};

/** 리스크 이슈 — 각 이슈는 "발생일" 기준 D+N으로 추적 */
export type RiskIssueKind =
  | '미납'        // schedules에 연체/부분납 있음 — 발생일 = 가장 오래된 미납 회차 dueDate
  | '검사지연'    // inspectionDueDate < today — 발생일 = inspectionDueDate
  | '보험만료'    // insuranceExpiryDate < today — 발생일 = insuranceExpiryDate
  | '등록증만료'  // (Vehicle 측 데이터) — 발생일 = registrationExpiry
  | '과태료'      // hasViolations + violationSince — 발생일 = violationSince
  | '면허'        // customerLicenseStatus = 정지/취소/만료
  | '사고'        // 사고 미해결 — 발생일 = 사고 접수일
  | '시동제어'    // engineDisabled = true — 발생일 = engineDisabledAt
  | '내용증명'    // 발송 후 미해결 — 발생일 = 발송일 (history_entries)
  | '채권화';     // status = '채권' — 발생일 = 채권 전이일

export type RiskResolveKind = '정상화' | '회수' | '매각' | '면제' | '기간연장';

export type RiskIssue = {
  contractId: string;
  kind: RiskIssueKind;
  issueDate: string;             // YYYY-MM-DD — 발생한 날짜 ⭐
  daysOverdue: number;           // today - issueDate (자동 계산)
  // 부가 정보 (이슈별)
  amount?: number;               // 금액 (미납·과태료 등)
  meta?: Record<string, string | number | boolean>;
  // 종결 (resolvedAt 있으면 종결, 없으면 진행중)
  resolvedAt?: string;
  resolvedKind?: RiskResolveKind;
  resolvedNote?: string;
};

/** 회차당 개별 납부 entry — 분납·선납 모두 수용 */
export type PaymentEntry = {
  date: string;          // YYYY-MM-DD — 실제 입금일
  amount: number;
  /** 출처 — 정산(스냅샷 자동완료) / 계좌·카드(자금일보 매칭) / 현금·수동(직접 등록) */
  source: '정산' | '계좌' | '카드' | '현금' | '수동';
  txId?: string;         // BankTransaction.id (source='계좌')
  cardTxId?: string;     // CardTransaction.id (source='카드')
  memo?: string;
  by?: string;           // 등록자 email (수동·현금 entry)
  at?: string;           // 등록 시각 ISO
};

/** 청구할인 entry — 회차 청구금액을 차감 (자가조치/보상/사은품 등) */
export type DiscountEntry = {
  date: string;          // YYYY-MM-DD
  amount: number;        // 할인액 (양수로 저장, 표시는 마이너스)
  reason?: '자가조치' | '보상' | '사은품' | '캠페인' | '기타';
  memo?: string;
  by?: string;
  at?: string;
};

/** Contract에 인라인으로 박는 회차. (PaymentSchedule 전체 모델의 contract-scope subset) */
export type PaymentScheduleInline = {
  seq: number;
  dueDate: string;
  amount: number;             // 청구금액 (원본 — 변경되지 않음)
  status: ScheduleStatus;
  /** 분납·선납 누적 — 빈 배열이면 미납. legacy: 없으면 paidAmount에서 derive. */
  payments?: PaymentEntry[];
  /** 청구할인 누적 — sum(discounts.amount)만큼 청구금액 차감됨 */
  discounts?: DiscountEntry[];
  /** sum(payments.amount) — payments에서 derive되지만 캐시 (legacy 호환) */
  paidAmount: number;
  /** sum(discounts.amount) — discounts에서 derive 캐시 */
  discountAmount?: number;
  /** 가장 최근 payments.date — legacy 호환 */
  paidAt?: string;
  notes?: string;
};

/** 수납 스케줄 1회차 */
export type ScheduleStatus = '예정' | '완료' | '부분납' | '연체' | '면제';

export type PaymentSchedule = {
  id: string;
  contractId: string;
  seq: number;                 // 회차
  dueDate: string;             // YYYY-MM-DD
  amount: number;
  status: ScheduleStatus;
  paidAmount: number;
  paidAt?: string;
  matches?: Array<{ txId: string; amount: number; matchedAt: string }>;
  notes?: string;
};

/** 은행 거래 — 입금·출금 통합 (자금일보 ledger entry 역할) */
export type BankTransaction = {
  id: string;
  txDate: string;              // YYYY-MM-DD (HH:mm 가능)
  /** 입금액 — 양수, 출금이면 0 또는 미입력 */
  amount: number;
  /** 출금액 — 양수 (입금 거래는 0/미입력) */
  withdraw?: number;
  /** 잔액 (해당 거래 직후) */
  balance?: number;
  counterparty: string;        // 입금자/상대 (출금이면 수취인)
  memo?: string;               // 적요/내용
  note?: string;               // 사용자 메모 (인라인 편집)
  /** 차량번호 직접 입력 — 매칭 계약 없을 때 자금일보에서 수기로 연결 */
  linkedVehiclePlate?: string;
  /** 거래처(계약자/공급사 등) 직접 입력 — 매칭 계약 외 자유 입력 */
  linkedCustomerName?: string;
  source?: string;             // KB/우리/신한/하나/농협 등 — 은행
  account?: string;            // 계좌번호 (회사 마스터의 BankAccount.accountNo와 매칭)
  companyCode?: string;        // 회사 코드 (자금일보 회사별 집계용)
  /** 결제 채널 — 적요에서 파생. 자동이체/카드/무통장/현금/인터넷뱅킹 */
  method?: string;
  /** 계정과목 — 분개. ledger-subjects.ts 의 enum */
  subject?: string;
  matchedContractId?: string;
  matchedScheduleId?: string;
  matchedScheduleSeq?: number; // schedule 의 회차 번호 (인라인 schedules 매칭용)
  matchedAt?: string;          // 매칭 처리 시각 (ISO)
  matchedBy?: string;          // 매칭 처리자 (이메일/uid)
  /** CMS 집금 정산 ID — 1 deposit ↔ N 개별 CMS 거래 묶음. settlementRole='deposit' 가 집금건, 'item' 이 개별 CMS */
  settlementId?: string;
  settlementRole?: 'deposit' | 'item';
  /** 정산 메타 (집금건에만 저장) — 묶음 총액, 수수료 등 */
  settlementGrossAmount?: number;   // 개별 CMS 합계
  settlementFeeAmount?: number;     // 수수료 = gross - 실 입금액
  settlementItemCount?: number;     // 묶음 건수
  raw?: Record<string, unknown>;
};

/** 카드 입금 트랜잭션 */
export type CardTransaction = {
  id: string;
  /** 거래 종류 — '매출' (손님이 우리에게 카드 결제, 수입) / '법인카드' (직원이 법인카드로 지출) */
  kind?: '매출' | '법인카드';
  txDate: string;
  amount: number;
  approvalNo: string;
  cardLast4?: string;
  customerName?: string;       // 매출: 결제 고객명 / 법인카드: 가맹점명 가능
  source?: string;             // 카드사 (KB / 신한 / 현대 / BC 등)
  companyCode?: string;        // 어느 회사의 거래·카드인지
  // ─── 법인카드 전용 ───
  merchant?: string;           // 가맹점명 (어디서 썼는지)
  category?: string;           // 용도 분류 (식비 / 주유 / 통행료 / 사무용품 / 정비 / 기타)
  usedBy?: string;             // 사용 직원 (이메일 또는 이름)
  approver?: string;           // 승인자 (관리자 검토 후)
  approved?: boolean;          // 결재 완료 여부
  // ─── 매칭 ───
  matchedContractId?: string;
  matchedScheduleId?: string;
  /** 카드사 집금 정산 ID — 1 BankTransaction deposit ↔ N CardTransaction 묶음. role='item' 만 카드 측에 표시 */
  settlementId?: string;
  raw?: Record<string, unknown>;
};

/** 이력 — 두 가지 귀속 방식
 *  - scope='vehicle': 차량(plate)에 영구 귀속. 계약이 바뀌어도 그 차량에 계속 따라감. 정비/검사/사고/보험 등.
 *  - scope='contract': 그 계약에만 귀속. 계약 종료 시 그 계약 아카이브에 남음. 분쟁/클레임/메모 등.
 */
export type HistoryScope = 'vehicle' | 'contract';

export type HistoryCategory =
  // 차량 이력 (vehicle scope)
  | '정비' | '사고' | '검사' | '세차' | '위반' | '보험' | '부품교체'
  // 계약 이력 (contract scope)
  | '분쟁' | '클레임' | '수납이슈' | '메모' | '연락기록' | '법적조치'
  // 공통
  | '기타';

export type HistoryEntry = {
  id: string;
  scope: HistoryScope;
  contractId?: string;      // scope='contract'일 때 필수 / scope='vehicle'일 때 발생 시점 컨텍스트로 기록
  vehiclePlate?: string;    // scope='vehicle'일 때 필수
  date: string;             // YYYY-MM-DD
  category: HistoryCategory;
  title: string;
  description?: string;
  cost?: number;
  status: '완료' | '진행' | '예정';
  vendor?: string;
  /** 첨부 — OCR/파일 업로드 원본 (보험증권 패턴) */
  fileUrl?: string;
  fileName?: string;
  fileUploadedAt?: string;
  mileage?: number;
  /**
   * 카테고리별 상세 데이터 — 자유 형식 (스키마는 카테고리별 컨벤션):
   *  · 상품화: { workKind, workStatus }
   *  · 정비:   { maintType, workStatus }
   *  · 사고:   { accType, accRole, faultPct, accidentStatus, insTypes[],
   *             rentalCar, ourInsurance, otherInsurance, insuranceNo, insuranceContact,
   *             otherInsuranceNo, otherInsuranceContact,
   *             otherPlate, otherName, otherPhone, location,
   *             insuranceAmount, deductibleAmount, deductiblePaid, deductibleStatus }
   *  · 보험:   { insKind, insuranceCompany, ageAfter }
   *  · 세차:   { washType }
   *  · 위반:   { penaltyType, dueDate, location, payer, paidStatus }
   */
  meta?: Record<string, unknown>;
  createdAt: string;
  createdBy?: string;
};

/** legacy alias — 점진적 제거 */
export type VehicleHistoryCategory = HistoryCategory;
export type VehicleHistoryEntry = HistoryEntry;

/** 회사 마스터 — 법인 정보 + 계좌/카드 */
export type BankAccount = {
  id: string;
  bankName: string;       // KB / 우리 / 신한 / 하나 / 농협 등
  accountNo: string;      // 계좌번호
  accountHolder: string;  // 예금주 (회사명과 다를 수 있음)
  nickname?: string;      // 계좌 별명 — 입출금 내역에 표시. 없으면 계좌번호 전체 표시
  purpose?: string;       // 대여료수납/보증금/관리비 등
  isDefault?: boolean;
};

export type CorporateCard = {
  id: string;
  cardName: string;       // 카드 명 (예: 법인 BC, 운영비 카드)
  cardCompany: string;    // 카드사 (KB/신한/현대 등)
  cardLast4: string;      // 끝 4자리
  purpose?: string;       // 차량유지비/주유/유료도로 등
  holder?: string;        // 카드 명의자
};

export type LocationKind = '사무실' | '차고지' | '주차장';

export type CompanyLocation = {
  id: string;
  kind: LocationKind;
  name: string;            // 본사 / 강남지점 / 분당 차고지 등
  address: string;
  phone?: string;
  capacity?: number;       // 주차장 — 수용 대수
  notes?: string;
};

export type CompanyDocument = {
  id: string;
  title: string;           // 사업자등록증 / 법인등기부 / 인감증명 등
  fileUrl?: string;        // Firebase Storage URL (Phase 2)
  fileName?: string;
  uploadedAt: string;
  notes?: string;
};

export type Company = {
  id: string;
  code: string;                  // CP01 / CP02 — 자동 부여 (영구·재발급 X)
  name: string;                  // 회사명 (계약의 company 코드와 매칭)
  bizRegNo?: string;             // 사업자등록번호 (123-45-67890)
  corpRegNo?: string;            // 법인등록번호 (110111-1234567)
  ceo?: string;                  // 대표자
  address?: string;
  bizType?: string;              // 업태
  bizItem?: string;              // 종목
  mainPhone?: string;            // 대표 전화번호 — 손님 페이지 노출
  customerServicePhone?: string; // 고객센터 전화 (별도 운영 시) — 손님 페이지 노출
  /** 운영 구분 — 위탁/직영/기타. OCR/미지정 시 기본 '기타' */
  partnerKind?: '위탁' | '직영' | '기타';
  /** 표기명 — 화면에 노출할 짧은 명칭 (예: 정식 '스위치플랜 주식회사' / 표기 '스위치플랜'). 비어있으면 stripCorpAndEnglish(name) 자동 표시 */
  displayName?: string;
  /** 회사 정보 — 홈페이지·실무 담당자 */
  homepage?: string;             // 회사 홈페이지 URL
  contactName?: string;          // 실무 담당자 이름
  contactRole?: string;          // 직책 (예: 매니저)
  contactPhone?: string;
  contactEmail?: string;
  /** 법인 도장(인영) — 누끼 처리된 PNG. 내용증명·계약서 발신인란에 합성 */
  stampUrl?: string;
  stampFileName?: string;
  stampUploadedAt?: string;
  accounts: BankAccount[];       // 계좌 N개
  cards?: CorporateCard[];       // 법인카드 N개
  locations?: CompanyLocation[]; // 사무실/차고지/주차장 통합
  documents?: CompanyDocument[]; // 사업자등록증/등기부/인감 등 서류
  notes?: string;
  createdAt: string;
};

/** 차량 마스터 — 등록증 기준 (plate + model + company만). 디테일은 나중. */
export type Vehicle = {
  id: string;
  plate: string;            // 차량번호 (unique) — 자동차등록번호
  model: string;            // 풀네임 (5단 자동결합 또는 자유 입력)
  company: CompanyCode;
  status: VehicleStatus;    // 구매대기/등록대기/상품화중/상품대기 등
  purchasedDate?: string;
  registeredDate?: string;
  readiedDate?: string;
  notes?: string;
  currentContractId?: string;  // 운행중이면 계약 ID
  createdAt: string;

  // ─── 제조사 스펙 (5단 분류) ───
  vehicleMaker?: string;       // ① 제조사 — '현대'
  vehicleModelLine?: string;   // ② 모델 — '그랜저'
  vehicleSubModel?: string;    // ③ 세부모델 — '더 뉴 그랜저 GN7'
  vehicleVariant?: string;     // ④ 모델구분 — '가솔린 3.5 AWD'
  vehicleTrim?: string;        // ⑤ 트림 — '캘리그래피'
  vehicleOptions?: string;     // 선택옵션 자유 입력
  exteriorColor?: string;      // 외부 색상
  interiorColor?: string;      // 내부 색상

  // ─── 자동차 등록증 정보 ───
  vin?: string;                // 차대번호
  manufacturedDate?: string;   // 제작연월일 (YYYY-MM-DD)
  firstRegisteredDate?: string;// 최초등록일 (YYYY-MM-DD)
  fuelType?: string;           // 사용연료
  displacementCc?: number;     // 배기량 (cc)
  seatingCapacity?: number;    // 승차정원
  garage?: string;             // 사용본거지 (차고지 주소)
  ownerName?: string;          // 소유자명
  registrationCertUrl?: string;       // 등록증 첨부 URL (Firebase Storage)
  registrationCertFileName?: string;  // 원본 파일명
  registrationCertUploadedAt?: string;// ISO timestamp
  insuranceCertUrl?: string;          // 보험가입증명서 첨부 URL (Firebase Storage)
  insuranceCertFileName?: string;
  insuranceCertUploadedAt?: string;
  /** 할부계약서 첨부 — OCR/파일 업로드 시 자동 보관 (보험증권 패턴) */
  loanContractUrl?: string;
  loanContractFileName?: string;
  loanContractUploadedAt?: string;
  /** 정기검사증 첨부 */
  inspectionCertUrl?: string;
  inspectionCertFileName?: string;
  inspectionCertUploadedAt?: string;
  /** GPS 설치 증빙 (영수증·설치확인서) */
  gpsInstallUrl?: string;
  gpsInstallFileName?: string;
  gpsInstallUploadedAt?: string;
  /** 매각계약서·매도증 */
  disposalCertUrl?: string;
  disposalCertFileName?: string;
  disposalCertUploadedAt?: string;

  // ─── 자동차등록증 추가 필드 (v4 자산등록현황 컬럼 대응) ───
  assetCode?: string;          // 자산코드 — 회사 scope (예: CP02VH0001), 자동 발급
  vehicleType?: string;        // 차종 (경형 승용 / 중형 승용 / 대형 승용 / SUV / 화물 등)
  vehicleUsage?: string;       // 용도 (자가용 / 영업용 / 관용)
  vehicleFormat?: string;      // 형식 (예: JA51BA-T6-P)
  engineFormat?: string;       // 원동기형식 (예: G3LA / G4KR)
  ownerRegNo?: string;         // 성명/명칭의 생년월일 또는 법인등록번호 (110111-XXXXXXX)
  specMgmtNo?: string;         // 제원관리번호 (예: A01-1-00062-0)
  vehicleLength?: number;      // 길이 (mm)
  vehicleWidth?: number;       // 너비 (mm)
  vehicleHeight?: number;      // 높이 (mm)
  totalWeight?: number;        // 총중량 (kg)
  // ─── 매입 정보 ───
  purchasePrice?: number;
  insuranceAge?: number;

  // ─── 자산 관리 정보 (보험/할부/GPS) — 자산관리 표 컬럼 ───
  insuranceCompany?: string;       // 보험사 (예: 삼성화재)
  insurancePolicyNo?: string;      // 증권번호
  insuranceExpiryDate?: string;    // 자동차보험 만기일 (YYYY-MM-DD)
  loanCompany?: string;            // 할부사 (예: 현대캐피탈)
  loanMonths?: number;             // 할부개월 (예: 60)
  loanRemainingPrincipal?: number; // 잔여원금 (원)
  loanStartDate?: string;          // 할부 개시일
  loanCashOnly?: boolean;          // 할부 없음 (현금 일시불) — 명시적 표시. 미입력과 구분
  gpsProvider?: string;            // GPS 공급사 (예: 마카롱)
  gpsDeviceId?: string;            // GPS 단말번호

  // ─── 계약사실확인서 (자동차매매·임대차 등) ───
  contractDocUrl?: string;          // Firebase Storage URL
  contractDocFileName?: string;     // 원본 파일명
  contractDocUploadedAt?: string;   // ISO timestamp
  contractDocOcrAt?: string;        // OCR 처리 시각 (재처리 추적용)
  contractDocSeller?: string;       // 매도인 (또는 임대인)
  contractDocBuyer?: string;        // 매수인 (또는 임차인) — 보통 회사
  contractDocDate?: string;         // 계약 체결일 (YYYY-MM-DD)
  contractDocPrice?: number;        // 매매가 / 임대료 (원)
  contractDocNotes?: string;        // 비고 (특약 등)
};

/** 거래처 마스터 — 계약자 외 공급사·협력사·외주업체 등 */
export type Vendor = {
  id: string;
  name: string;                       // 거래처명 (필수)
  kind?: '공급사' | '협력사' | '외주' | '고객' | '기타';
  bizNo?: string;                     // 사업자등록번호 (10자리)
  ceo?: string;                       // 대표
  bizType?: string;                   // 업태
  bizCategory?: string;               // 종목
  address?: string;
  phone?: string;
  email?: string;
  /** 어느 회사가 거래하는 거래처인지 — 회사 분리 시 사용. 미지정이면 전체 공유 */
  companyCode?: CompanyCode;
  notes?: string;
  createdAt: string;
  createdBy?: string;
};

/** 감사 로그 — 모든 변경 추적 (누가 / 언제 / 무엇을) */
export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'match' | 'unmatch' | 'login' | 'logout' | 'import' | 'export';

export type AuditEntityType =
  | 'contract' | 'company' | 'vehicle'
  | 'bank_tx' | 'card_tx' | 'schedule'
  | 'penalty' | 'license' | 'document'
  | 'system';

export type AuditLog = {
  id: string;
  at: string;              // ISO timestamp
  by?: string;             // 사용자 email (없으면 시스템)
  byUid?: string;          // Firebase UID
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;       // 대상 ID (있을 때)
  label: string;           // 1줄 요약 (예: "ICR-2605-0001 1회차 자동매칭 ₩1,500,000")
  before?: Record<string, unknown>;  // 변경 전 (선택)
  after?: Record<string, unknown>;   // 변경 후 (선택)
};

/** 연락 기록 (미수관리) */
export type ContactLog = {
  id: string;
  contractId: string;
  at: string;
  method: '전화' | '문자' | '방문' | '카톡' | '메모';
  by?: string;
  response?: string;
  nextPromise?: string;        // 다음 약속일
  notes?: string;
};

/** 할 일 담당자 1명 — 각자 인지·완료 상태 보유 */
export type ManualTodoAssignee = {
  name: string;
  ack?: string;          // ISO — 인지 시각 (확인했음)
  done?: string;         // ISO — 완료 시각
};

/** 달력 수동 스케줄 — 자동 집계(만기/반납/신규) 외 사용자가 직접 등록하는 일정 */
export type ManualSchedule = {
  id: string;
  date: string;          // YYYY-MM-DD
  title: string;
  time?: string;         // HH:MM (선택)
  done?: boolean;        // 처리 완료 여부
  doneAt?: string;       // 완료 ISO
  notes?: string;
  createdAt: string;
  createdBy?: string;
};

/** 할 일 후속 기록 1건 — 진행 상황·통화·메모 */
export type ManualTodoFollowup = {
  id: string;
  at: string;            // ISO
  by: string;            // 작성자명 (자유 텍스트)
  note: string;
};

/** 수동 입력 할 일 — 대시보드 공유 칠판 보드. 자동 업무는 달력에서 처리 */
export type ManualTodo = {
  id: string;
  title: string;
  priority: 'high' | 'mid' | 'low';
  assignees: ManualTodoAssignee[];   // 복수 담당자 (빈 배열 가능)
  followups?: ManualTodoFollowup[];   // 후속 진행 기록
  dueDate?: string;        // YYYY-MM-DD
  doneAt?: string;         // 전체 완료 시각 (모든 담당자 완료 시 자동 또는 수동 일괄 처리)
  createdAt: string;
  createdBy?: string;
  notes?: string;
};

/** 보험증권 분납 회차 — 1회차는 가입시 paid:true 자동 */
export type InsuranceInstallment = {
  cycle: number;
  dueDate: string;       // YYYY-MM-DD
  amount: number;        // 원
  paid?: boolean;
  paidDate?: string;
};

/**
 * 자동차보험증권 / 렌터카공제 마스터.
 * OCR 결과를 그대로 담을 수 있게 모든 필드 optional.
 * 갱신 시 새 증권 추가 — 이전 증권은 deletedAt 처리하지 말고 endDate로 자연 종료.
 */
export type InsurancePolicy = {
  id: string;
  companyCode?: string;
  vehicleId?: string;          // 매칭된 차량 (carNumber → Vehicle.plate 매칭)
  fileUrl?: string;
  fileName?: string;
  uploadedAt?: string;

  // 보험사·증권 정보
  insurer?: string;
  productName?: string;
  policyNo?: string;
  contractor?: string;
  insured?: string;
  bizNo?: string;

  // 기간
  startDate?: string;
  endDate?: string;

  // 차량
  carNumber?: string;
  carName?: string;
  carYear?: number;
  carClass?: string;
  displacement?: number;
  seats?: number;
  vehicleValueMan?: number;
  accessoryValueMan?: number;
  accessories?: string;

  // 운전 조건
  driverScope?: string;
  driverAge?: string;
  deductibleMan?: number;

  // 가입담보
  covPersonal1?: string;
  covPersonal2?: string;
  covProperty?: string;
  covSelfAccident?: string;
  covUninsured?: string;
  covSelfVehicle?: string;
  covEmergency?: string;

  // 보험료
  paidPremium?: number;
  totalPremium?: number;

  // 자동이체 + 분납
  autoDebitBank?: string;
  autoDebitAccount?: string;
  autoDebitHolder?: string;
  installments?: InsuranceInstallment[];

  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
};
