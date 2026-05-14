// icar001 — 미수/반납/수납 ERP 핵심 타입

export type CompanyCode = '아이카' | '달카' | '렌트로' | '직카' | '기타';

export type VehicleStatus =
  // ── 메인 라이프사이클 (X대기 → X완료 패턴) ──
  | '구매대기'      // → 구매완료 → 등록대기
  | '등록대기'      // → 등록완료 → 상품화대기
  | '상품화대기'    // → 상품화 착수 → 상품화중
  | '상품화중'      // → 상품화 완료 → 상품대기
  | '상품대기'      // 영업 가능 → 계약 생성 시 운행
  | '운행'          // 계약중 → 반납회수 → 휴차대기
  | '휴차대기'      // 반납 후 대기 → 매각/재상품화 결정
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
  customerRegNoMasked?: string; // 마스킹 표시용
  customerPhone1: string;
  customerPhone2?: string;
  customerRegion?: string;
  customerDistrict?: string;
  // 차량 (임베드)
  vehiclePlate: string;
  vehicleModel: string;
  vehicleStatus: VehicleStatus;
  // 기간
  contractDate: string;             // YYYY-MM-DD — 계약 체결일
  purchasedDate?: string;           // 차량 매입 완료일 (→ 등록대기)
  registeredDate?: string;          // 등록 완료일 (→ 상품화중)
  readiedDate?: string;             // 상품화 완료일 (→ 인도대기)
  deliveryScheduledDate?: string;
  deliveredDate?: string;           // 인도/출고 실제일 (→ 계약완료)
  returnScheduledDate?: string;
  returnedDate?: string;
  termMonths: number;
  longTerm: boolean;
  // 금액
  monthlyRent: number;
  deposit: number;
  paymentDay: number;          // 매월 결제일 (1~31)
  paymentMethod: PaymentMethod;
  // 옵션
  insuranceAge?: number;
  selfInsured?: boolean;
  distanceLimitKm?: number;
  // 휴차기간 — vehicleStatus === '휴차' 일 때 사용
  idleSince?: string;       // 휴차 시작일
  idleUntil?: string;       // 휴차 종료 예정일 (정비 완료 예상 등)
  idleReason?: string;      // 사유 (사고/정비/대기 등)
  // 임시배차 — vehicleStatus === '임시배차' 일 때
  tempReplacementPlate?: string;  // 실제로 나간 대체 차량번호 (예: K5 계약인데 K8 임시 출고)
  tempReplacementModel?: string;  // 대체 차종
  tempReason?: string;            // 임시배차 사유 (원본 차량 어디 있는지 등)
  tempSince?: string;             // 임시배차 시작일
  // 알림 대기 — 어떤 차량이 휴차/반납 되면 통보 (Phase 2)
  notifyOnAvailable?: string[];   // 차량번호 배열 — 이 차량들이 복귀하면 알림
  // 컴플라이언스 (계약상태 산출용)
  inspectionDueDate?: string;  // 다음 정기검사 예정일 (지나면 미수검)
  hasViolations?: boolean;     // 과태료/단속 미처리 있음
  violationSince?: string;     // 위반 발생일
  // 상태
  status: ContractStatus;
  notes?: string;
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

/** 은행 입금 트랜잭션 */
export type BankTransaction = {
  id: string;
  txDate: string;
  amount: number;
  counterparty: string;        // 입금자/상대
  memo?: string;
  source?: string;             // KB/우리/신한 등
  matchedContractId?: string;
  matchedScheduleId?: string;
  raw?: Record<string, unknown>;
};

/** 카드 입금 트랜잭션 */
export type CardTransaction = {
  id: string;
  txDate: string;
  amount: number;
  approvalNo: string;
  cardLast4?: string;
  customerName?: string;
  source?: string;
  matchedContractId?: string;
  matchedScheduleId?: string;
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
  | '분쟁' | '클레임' | '수납이슈' | '메모' | '연락기록'
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
  mileage?: number;
  createdAt: string;
  createdBy?: string;
};

/** legacy alias — 점진적 제거 */
export type VehicleHistoryCategory = HistoryCategory;
export type VehicleHistoryEntry = HistoryEntry;

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
