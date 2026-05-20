/**
 * Google Gemini 기반 문서 구조화 추출 엔드포인트.
 *
 *   POST /api/ocr/extract  (multipart/form-data)
 *     - file: File (PDF | JPG | PNG)
 *     - type: 'vehicle_reg' | 'business_reg' | 'penalty'
 *
 *   → { ok: true, extracted: { ... }, model: 'gemini-2.5-flash' }
 *
 * GEMINI_API_KEY 필요. 503/429는 자동 재시도.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MODEL = 'gemini-2.5-flash';

/**
 * 자동차등록증 본문 ① ~ ⑩ + 헤더(최초등록일·문서확인번호) + 1.제원 ⑪ ~ ㉔ + 4.검사 ㉚~㉟ 표기 항목만.
 * 등록증에 없는 추측 항목(제조사·모델명·세부모델·트림·색상·구동방식 등)은 의도적으로 제외.
 */
const VEHICLE_REG_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    // 헤더
    document_no: { type: Type.STRING, nullable: true, description: '문서확인번호 (등록증 우상단)' },
    first_registration_date: { type: Type.STRING, nullable: true, description: '최초등록일 YYYY-MM-DD' },
    cert_issue_date: { type: Type.STRING, nullable: true, description: '등록증 발급일 YYYY-MM-DD' },
    // 본문 ① ~ ⑩
    car_number: { type: Type.STRING, nullable: true, description: '① 자동차등록번호 (예: 01도9893)' },
    category_hint: { type: Type.STRING, nullable: true, description: '② 차종 (경형 승용 / 대형 승용 등)' },
    usage_type: { type: Type.STRING, nullable: true, description: '③ 용도 (자가용 / 영업용 등)' },
    car_name: { type: Type.STRING, nullable: true, description: '④ 차명 — 등록증에 적힌 그대로 (지프/짚/JEEP 등 임의 변환 절대 금지). 예: "모닝", "아슬란", "Model 3 Long Range", "지프 랭글러"' },
    type_number: { type: Type.STRING, nullable: true, description: '⑤ 형식 (예: JA51BA-T6-P)' },
    car_year_month: { type: Type.STRING, nullable: true, description: '⑤ 제작연월 YYYY-MM (예: 2017-09)' },
    vin: { type: Type.STRING, nullable: true, description: '⑥ 차대번호' },
    engine_type: { type: Type.STRING, nullable: true, description: '⑦ 원동기형식' },
    address: { type: Type.STRING, nullable: true, description: '⑧ 사용본거지' },
    owner_name: { type: Type.STRING, nullable: true, description: '⑨ 성명(명칭)' },
    owner_biz_no: { type: Type.STRING, nullable: true, description: '⑩ 생년월일/법인등록번호' },
    // 1. 제원 ⑪ ~ ㉔
    approval_number: { type: Type.STRING, nullable: true, description: '⑪ 제원관리번호(형식승인번호)' },
    length_mm: { type: Type.INTEGER, nullable: true, description: '⑫ 길이 mm' },
    width_mm: { type: Type.INTEGER, nullable: true, description: '⑬ 너비 mm' },
    height_mm: { type: Type.INTEGER, nullable: true, description: '⑭ 높이 mm' },
    gross_weight_kg: { type: Type.INTEGER, nullable: true, description: '⑮ 총중량 kg' },
    seats: { type: Type.INTEGER, nullable: true, description: '⑯ 승차정원' },
    max_load_kg: { type: Type.INTEGER, nullable: true, description: '⑰ 최대적재량 kg' },
    displacement: { type: Type.INTEGER, nullable: true, description: '⑱ 배기량 cc' },
    rated_output: { type: Type.STRING, nullable: true, description: '⑲ 정격출력 (예: 76/6200)' },
    cylinders: { type: Type.STRING, nullable: true, description: '⑳ 기통수' },
    fuel_type: { type: Type.STRING, nullable: true, description: '㉑ 연료종류 (예: 휘발유(무연))' },
    fuel_efficiency: { type: Type.NUMBER, nullable: true, description: '㉑ 연료소비율 km/L' },
    // 4. 검사 ㉚ ~ ㉟
    inspection_from: { type: Type.STRING, nullable: true, description: '㉚ 검사 유효기간 시작 YYYY-MM-DD' },
    inspection_to: { type: Type.STRING, nullable: true, description: '㉛ 검사 유효기간 만료 YYYY-MM-DD' },
    mileage: { type: Type.INTEGER, nullable: true, description: '㉝ 주행거리 km' },
    inspection_type: { type: Type.STRING, nullable: true, description: '㉟ 검사 구분 (예: 종합검사(경과))' },
    // 푸터
    acquisition_price: { type: Type.INTEGER, nullable: true, description: '자동차 출고(취득)가격 원' },
  },
  required: [
    'document_no', 'first_registration_date', 'cert_issue_date',
    'car_number', 'category_hint', 'usage_type', 'car_name', 'type_number', 'car_year_month',
    'vin', 'engine_type', 'address', 'owner_name', 'owner_biz_no',
    'approval_number', 'length_mm', 'width_mm', 'height_mm', 'gross_weight_kg',
    'seats', 'max_load_kg', 'displacement', 'rated_output', 'cylinders',
    'fuel_type', 'fuel_efficiency',
    'inspection_from', 'inspection_to', 'mileage', 'inspection_type',
    'acquisition_price',
  ],
};

const BUSINESS_REG_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    biz_no: { type: Type.STRING, nullable: true, description: '등록번호 XXX-XX-XXXXX' },
    corp_no: { type: Type.STRING, nullable: true, description: '법인등록번호 XXXXXX-XXXXXXX (법인만)' },
    partner_name: { type: Type.STRING, nullable: true, description: '법인명(단체명) — 주식회사 포함 그대로' },
    ceo: { type: Type.STRING, nullable: true, description: '대표자 이름 (예: "조규진"). 라벨 텍스트는 절대 값으로 가져오지 말 것' },
    ceo_type: { type: Type.STRING, nullable: true, description: '대표유형 — 라벨 "(대표유형)" 옆 값. 칸 자체가 비어있으면 null. **"대표유형" 같은 라벨 텍스트 자체를 값으로 절대 가져오지 말 것**' },
    open_date: { type: Type.STRING, nullable: true, description: '개업연월일 YYYY-MM-DD' },
    address: { type: Type.STRING, nullable: true, description: '사업장 소재지' },
    hq_address: { type: Type.STRING, nullable: true, description: '본점 소재지 (사업장과 같으면 같은 값)' },
    industry: { type: Type.STRING, nullable: true, description: '업태 — 여러 개면 콤마 join (예: "서비스, 부동산업")' },
    category: { type: Type.STRING, nullable: true, description: '종목 — 여러 개면 콤마 join (예: "렌터카, 매매업")' },
    email: { type: Type.STRING, nullable: true, description: '전자세금계산서 전용 전자우편주소' },
    entity_type: { type: Type.STRING, enum: ['corporate', 'individual'] },
    // 추가 — 등록증 하단부
    issue_date: { type: Type.STRING, nullable: true, description: '발급일자 YYYY-MM-DD (등록증 하단)' },
    tax_office: { type: Type.STRING, nullable: true, description: '발급 세무서 (예: "강서세무서")' },
    issue_reason: { type: Type.STRING, nullable: true, description: '발급사유 — 비어있을 수 있음 (신규/정정/재발급 등)' },
    single_tax_flag: { type: Type.BOOLEAN, nullable: true, description: '사업자단위 과세 적용사업자 여부 — 여(✓) true / 부(✓) false' },
  },
  required: [
    'biz_no', 'corp_no', 'partner_name', 'ceo', 'ceo_type', 'open_date', 'address',
    'hq_address', 'industry', 'category', 'email', 'entity_type',
    'issue_date', 'tax_office', 'issue_reason', 'single_tax_flag',
  ],
};

const INSTALLMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    cycle: { type: Type.INTEGER, description: '회차 (1, 2, 3, ...)' },
    due_date: { type: Type.STRING, nullable: true, description: '납부일 YYYY-MM-DD' },
    amount: { type: Type.INTEGER, nullable: true, description: '회차 금액(원)' },
  },
  required: ['cycle', 'due_date', 'amount'],
};

const INSURANCE_POLICY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    insurer: { type: Type.STRING, nullable: true, description: '보험사 (예: DB손해보험, 전국렌터카공제조합)' },
    product_name: { type: Type.STRING, nullable: true, description: '상품명 (예: 프로미카다이렉트업무용(베이직형)자동차보험)' },
    policy_no: { type: Type.STRING, nullable: true, description: '증권번호/공제번호' },
    contractor: { type: Type.STRING, nullable: true, description: '계약자 명' },
    insured: { type: Type.STRING, nullable: true, description: '피보험자 명' },
    biz_no: { type: Type.STRING, nullable: true, description: '계약자 사업자번호 (예: 158-81-*****)' },
    start_date: { type: Type.STRING, nullable: true, description: '보험 시작일 YYYY-MM-DD' },
    end_date: { type: Type.STRING, nullable: true, description: '보험 종료일(만기) YYYY-MM-DD' },
    car_number: { type: Type.STRING, nullable: true, description: '차량번호 (\\d{2,3}[가-힣]\\d{4})' },
    car_name: { type: Type.STRING, nullable: true, description: '차명' },
    car_year: { type: Type.INTEGER, nullable: true, description: '연식 4자리' },
    car_class: { type: Type.STRING, nullable: true, description: '차종 (예: 승용대형_세단)' },
    displacement: { type: Type.INTEGER, nullable: true, description: '배기량 cc' },
    seats: { type: Type.INTEGER, nullable: true, description: '정원' },
    vehicle_value_man: { type: Type.INTEGER, nullable: true, description: '차량가액(만원)' },
    accessory_value_man: { type: Type.INTEGER, nullable: true, description: '부속가액(만원)' },
    accessories: { type: Type.STRING, nullable: true, description: '부속품 텍스트 그대로' },
    driver_scope: { type: Type.STRING, nullable: true, description: '운전가능범위 (누구나운전/임직원한정/기타)' },
    driver_age: { type: Type.STRING, nullable: true, description: '운전가능연령 (만21/24/26/30/35세이상한정 등)' },
    deductible_man: { type: Type.INTEGER, nullable: true, description: '물적사고할증금액(만원)' },
    cov_personal_1: { type: Type.STRING, nullable: true, description: '대인배상Ⅰ 한도/내용' },
    cov_personal_2: { type: Type.STRING, nullable: true, description: '대인배상Ⅱ 한도 (예: 1인당 무한)' },
    cov_property: { type: Type.STRING, nullable: true, description: '대물배상 한도 (예: 1사고당 3억원)' },
    cov_self_accident: { type: Type.STRING, nullable: true, description: '자기신체사고 또는 자동차상해 한도' },
    cov_uninsured: { type: Type.STRING, nullable: true, description: '무보험차상해 한도' },
    cov_self_vehicle: { type: Type.STRING, nullable: true, description: '자기차량손해 한도/공제 (미가입이면 미가입)' },
    cov_emergency: { type: Type.STRING, nullable: true, description: '긴급출동(프로미카SOS 등) 내용' },
    paid_premium: { type: Type.INTEGER, nullable: true, description: '납입한 보험료(원)' },
    total_premium: { type: Type.INTEGER, nullable: true, description: '총보험료(원)' },
    auto_debit_bank: { type: Type.STRING, nullable: true, description: '분납 자동이체 은행 (예: 신한은행(통합))' },
    auto_debit_account: { type: Type.STRING, nullable: true, description: '자동이체 계좌번호 (마스킹 포함)' },
    auto_debit_holder: { type: Type.STRING, nullable: true, description: '자동이체 예금주' },
    installments: {
      type: Type.ARRAY,
      description: '분납 회차별 정보. 비고란의 "분납보험료: 2회차: ... / 3회차: ..." 항목을 회차/날짜/금액으로 분해. 1회차는 보통 가입시 납입한 보험료',
      items: INSTALLMENT_SCHEMA,
    },
  },
  required: [
    'insurer', 'product_name', 'policy_no', 'contractor', 'insured', 'biz_no',
    'start_date', 'end_date', 'car_number', 'car_name', 'car_year', 'car_class',
    'displacement', 'seats', 'vehicle_value_man', 'accessory_value_man', 'accessories',
    'driver_scope', 'driver_age', 'deductible_man',
    'cov_personal_1', 'cov_personal_2', 'cov_property', 'cov_self_accident',
    'cov_uninsured', 'cov_self_vehicle', 'cov_emergency',
    'paid_premium', 'total_premium',
    'auto_debit_bank', 'auto_debit_account', 'auto_debit_holder',
    'installments',
  ],
};

const DEPOSIT_INSTALLMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    cycle: { type: Type.INTEGER, description: '회차 (1, 2, 3)' },
    amount: { type: Type.INTEGER, nullable: true, description: '회차별 보증금 (원)' },
  },
  required: ['cycle', 'amount'],
};

const RENTAL_CONTRACT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    // 계약 메타
    contract_no: { type: Type.STRING, nullable: true, description: '계약서 번호 (있으면)' },
    contract_date: { type: Type.STRING, nullable: true, description: '계약 체결일 YYYY-MM-DD' },

    // 임차인 (계약자)
    contractor_name: { type: Type.STRING, nullable: true, description: '임차인 성명' },
    contractor_kind: { type: Type.STRING, nullable: true, enum: ['개인', '사업자', '법인'] },
    contractor_ident: { type: Type.STRING, nullable: true, description: '주민번호 (XXXXXX-XXXXXXX) 또는 사업자등록번호 (XXX-XX-XXXXX)' },
    contractor_license_no: { type: Type.STRING, nullable: true, description: '운전면허번호 (XX-XX-XXXXXX-XX)' },
    contractor_phone: { type: Type.STRING, nullable: true, description: '임차인 휴대전화' },
    contractor_address: { type: Type.STRING, nullable: true, description: '주소 / 실거주지' },
    contractor_emergency_phone: { type: Type.STRING, nullable: true, description: '비상연락처/가족연락처' },
    contractor_emergency_relation: { type: Type.STRING, nullable: true, description: '비상연락처 관계 (부/모/배우자/자녀 등)' },
    contractor_biz_name: { type: Type.STRING, nullable: true, description: '개인사업자 상호 (있을 때)' },
    contractor_biz_address: { type: Type.STRING, nullable: true, description: '사업장 소재지' },

    // 차량
    car_number: { type: Type.STRING, nullable: true, description: '차량번호 \\d{2,3}[가-힣]\\d{4}' },
    car_name: { type: Type.STRING, nullable: true, description: '차종/모델명 (예: G80, 올 뉴 K3 1.6 가솔린 럭셔리 A/T)' },
    fuel: { type: Type.STRING, nullable: true, description: '연료 (가솔린/디젤/하이브리드/전기 등)' },
    color: { type: Type.STRING, nullable: true, description: '색상 (예: 화이트/블랙)' },
    options: { type: Type.STRING, nullable: true, description: '옵션 (선루프, 후방카메라 등)' },
    maintenance_product: { type: Type.STRING, nullable: true, description: '정비상품 (정비제외/엔진오일 연1회 등)' },
    engine_oil_service: { type: Type.BOOLEAN, nullable: true, description: '엔진오일 연1회 가입 여부 (정비상품/특약/체크박스 기준)' },
    inspection_service: { type: Type.BOOLEAN, nullable: true, description: '검사대행 가입 여부' },

    // 계약 기간
    rental_period_months: { type: Type.INTEGER, nullable: true, description: '대여기간 개월. "차량 인도일로부터 48개월" → 48' },
    start_date: { type: Type.STRING, nullable: true, description: '계약시작일 YYYY-MM-DD' },
    end_date: { type: Type.STRING, nullable: true, description: '계약종료일 YYYY-MM-DD' },
    driver_age_min: { type: Type.INTEGER, nullable: true, description: '운전자 최소 연령. "만 26세이상" → 26' },
    initial_mileage_km: { type: Type.INTEGER, nullable: true, description: '현재 주행거리 km (계약 시점)' },
    annual_mileage_limit_km: { type: Type.INTEGER, nullable: true, description: '연간 약정 주행거리 km. "3.0만Km" → 30000' },
    excess_mileage_fee_kr: { type: Type.INTEGER, nullable: true, description: '약정 초과 km당 부과 (국산). "초과시 1km 당 국산 200원" → 200' },
    excess_mileage_fee_foreign: { type: Type.INTEGER, nullable: true, description: '약정 초과 km당 부과 (수입). "수입 400원" → 400' },

    // 결제
    monthly_amount: { type: Type.INTEGER, nullable: true, description: '월 대여료 (원, VAT 포함)' },
    deposit_total: { type: Type.INTEGER, nullable: true, description: '보증금 합계 (원). 분납이면 회차별 합산' },
    deposit_installments: {
      type: Type.ARRAY,
      description: '보증금 분납 회차별. 일시납이면 [{cycle:1, amount:전체}]. 분납이면 1·2·3회차 모두',
      items: DEPOSIT_INSTALLMENT_SCHEMA,
    },
    purchase_option_amount: { type: Type.STRING, nullable: true, description: '인수가격. "만기협의"/숫자/null' },
    payment_account_bank: { type: Type.STRING, nullable: true, description: '입금계좌 은행 (예: 신한은행)' },
    payment_account_no: { type: Type.STRING, nullable: true, description: '입금계좌번호 (140-013-750928)' },
    payment_account_holder: { type: Type.STRING, nullable: true, description: '입금계좌 예금주 (회사명)' },
    autopay_day: { type: Type.INTEGER, nullable: true, description: '자동이체일 (5/10/15/20/25 중 1, 체크된 거 우선)' },

    // 자동이체신청서 (CMS) — 보통 9페이지
    auto_debit_bank: { type: Type.STRING, nullable: true, description: '자동이체 출금은행 (CMS 신청서)' },
    auto_debit_account: { type: Type.STRING, nullable: true, description: '자동이체 출금계좌번호' },
    auto_debit_holder: { type: Type.STRING, nullable: true, description: '자동이체 예금주' },

    // 자동차보험 (계약서 본문에 명시된 것)
    insurer: { type: Type.STRING, nullable: true, description: '보험사 (예: DB손해보험, 전국렌터카공제조합)' },
    deductible_min: { type: Type.INTEGER, nullable: true, description: '자차 면책금 최소 (만원). "최소 50만원" → 50' },
    deductible_max: { type: Type.INTEGER, nullable: true, description: '자차 면책금 최대 (만원). "최대 100만원" → 100' },
    deductible_rate: { type: Type.NUMBER, nullable: true, description: '자차 면책 비율 (예: 0.2 = 20%). "사고처리 비용의 20%" → 0.2' },

    // 승계 (양도/양수, 1페이지에 승계 확인서 있을 때만)
    predecessor_name: { type: Type.STRING, nullable: true, description: '승계 (양도인) 이름 — 이전 계약자' },
    predecessor_phone: { type: Type.STRING, nullable: true, description: '승계 (양도인) 연락처' },
    succeeded_at: { type: Type.STRING, nullable: true, description: '승계 일자 YYYY-MM-DD' },

    // 회사 (임대인)
    company_name: { type: Type.STRING, nullable: true, description: '렌트회사명' },
    company_ceo: { type: Type.STRING, nullable: true, description: '대표자' },
    company_biz_no: { type: Type.STRING, nullable: true, description: '회사 사업자번호' },
    company_phone: { type: Type.STRING, nullable: true, description: '회사 연락처' },
    company_address: { type: Type.STRING, nullable: true, description: '회사 주소' },
  },
  required: [
    'contract_no', 'contract_date',
    'contractor_name', 'contractor_kind', 'contractor_ident', 'contractor_license_no',
    'contractor_phone', 'contractor_address',
    'contractor_emergency_phone', 'contractor_emergency_relation',
    'contractor_biz_name', 'contractor_biz_address',
    'car_number', 'car_name', 'fuel', 'color', 'options', 'maintenance_product',
    'engine_oil_service', 'inspection_service',
    'rental_period_months', 'start_date', 'end_date',
    'driver_age_min', 'initial_mileage_km', 'annual_mileage_limit_km',
    'excess_mileage_fee_kr', 'excess_mileage_fee_foreign',
    'monthly_amount', 'deposit_total', 'deposit_installments',
    'purchase_option_amount', 'payment_account_bank', 'payment_account_no',
    'payment_account_holder', 'autopay_day',
    'auto_debit_bank', 'auto_debit_account', 'auto_debit_holder',
    'insurer', 'deductible_min', 'deductible_max', 'deductible_rate',
    'predecessor_name', 'predecessor_phone', 'succeeded_at',
    'company_name', 'company_ceo', 'company_biz_no', 'company_phone', 'company_address',
  ],
};

const LICENSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    license_no: { type: Type.STRING, nullable: true, description: '면허번호 (XX-XX-XXXXXX-XX 12자리 숫자, 하이픈 포함 그대로)' },
    license_type: { type: Type.STRING, nullable: true, description: '면허종류 (1종 보통, 2종 보통, 1종 대형, 1종 특수, 2종 소형 등)' },
    holder_name: { type: Type.STRING, nullable: true, description: '성명' },
    resident_no: { type: Type.STRING, nullable: true, description: '주민등록번호 앞 6자리만 (생년월일 부분, YYMMDD)' },
    birth_date: { type: Type.STRING, nullable: true, description: '생년월일 YYYY-MM-DD (주민번호 7번째 자리로 세기 결정 — 1/2→19xx, 3/4→20xx)' },
    address: { type: Type.STRING, nullable: true, description: '주소' },
    issue_date: { type: Type.STRING, nullable: true, description: '발급일 YYYY-MM-DD' },
    expiry_date: { type: Type.STRING, nullable: true, description: '적성검사기간 만료일 또는 갱신만료일 YYYY-MM-DD' },
    serial_no: { type: Type.STRING, nullable: true, description: '카드 일련번호/연번 (우상단)' },
    conditions: { type: Type.STRING, nullable: true, description: '조건 (예: A (수동), 자동, 안경 등)' },
    issuer: { type: Type.STRING, nullable: true, description: '발급기관 (예: 서울지방경찰청장)' },
  },
  required: [
    'license_no', 'license_type', 'holder_name', 'resident_no', 'birth_date',
    'address', 'issue_date', 'expiry_date', 'serial_no', 'conditions', 'issuer',
  ],
};

const PENALTY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    doc_type: { type: Type.STRING, nullable: true, description: '과태료/범칙금/통행료/주정차위반/속도위반/신호위반/기타' },
    notice_no: { type: Type.STRING, nullable: true, description: '고지서번호 (있으면)' },
    issuer: { type: Type.STRING, nullable: true, description: '발급기관 (예: ○○경찰서, ○○시청)' },
    issue_date: { type: Type.STRING, nullable: true, description: '발송일/발급일 YYYY-MM-DD' },
    car_number: { type: Type.STRING, nullable: true, description: '차량번호 (정확히 \\d{2,3}[가-힣]\\d{4})' },
    date: { type: Type.STRING, nullable: true, description: '위반일시 YYYY-MM-DD HH:mm (시간 없으면 YYYY-MM-DD)' },
    location: { type: Type.STRING, nullable: true, description: '위반장소' },
    description: { type: Type.STRING, nullable: true, description: '위반내용 (예: 주정차위반, 속도위반(50km/h 초과))' },
    law_article: { type: Type.STRING, nullable: true, description: '적용법조 (예: 도로교통법 제32조)' },
    amount: { type: Type.INTEGER, nullable: true, description: '실제 부과 금액 (원). 과태료 또는 통행료 등 메인 금액' },
    due_date: { type: Type.STRING, nullable: true, description: '납부기한 YYYY-MM-DD' },
    pay_account: { type: Type.STRING, nullable: true, description: '납부 가상계좌 (은행 + 계좌번호)' },
  },
  required: [
    'doc_type', 'notice_no', 'issuer', 'issue_date', 'car_number',
    'date', 'location', 'description', 'law_article',
    'amount', 'due_date', 'pay_account',
  ],
};

interface TypeSpec {
  label: string;
  prompt: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any;
}

const TYPE_SPECS: Record<string, TypeSpec> = {
  vehicle_reg: {
    label: '자동차등록증',
    prompt: `이 문서는 한국 자동차등록증입니다.

## 절대 규칙 — 텍스트 원본 보존

**모든 텍스트 필드는 등록증에 적힌 그대로 추출. 절대 정규화·표준화·번역·교정 금지.**

특히 차명(car_name) 같은 외래어 한글 표기:
- 등록증에 "지프" 라고 적혀 있으면 → "지프" (절대 "짚"으로 변환 X)
- 등록증에 "짚" 이라고 적혀 있으면 → "짚" (절대 "지프"로 변환 X)
- 등록증에 "JEEP" 영문 표기면 → "JEEP" 그대로
- "모닝", "아슬란", "Model 3 Long Range", "올 뉴 K3 1.6 가솔린 럭셔리 A/T" 같은 띄어쓰기·괄호·영문혼용 모두 등록증 표기 그대로
- 같은 차종이라도 발급 시점·제조사 등록 방식에 따라 표기가 다를 수 있음 — 등록증이 진리

차명·차종·용도·연료·주소·제조사명 등 모든 한글/영문 필드 동일 원칙. 정규화 매핑테이블 사용 절대 금지.

## car_number (① 자동차등록번호) — 가장 중요

- 등록증 최상단 표 첫 행 ① 자동차등록번호 칸에 적혀 있음 (차종 / 용도 같은 행)
- 한국 번호판 포맷 \`\\d{2,3}[가-힣]\\d{4}\` (예: "01도9893", "15가4481", "123가4567")
- **외산차도 동일** — Tesla / BMW / Mercedes / MINI / Audi 등 한국 등록증엔 한국번호판 표기 (예: "15가4481" Model 3 Long Range)
- 중간에 공백·점·하이픈·전각 숫자 있어도 raw 그대로 반환 (서버에서 정규화)
- 17자 영문+숫자 = 차대번호(VIN) → 절대 car_number 아님
- 한글 한 글자가 반드시 들어감 (가/나/다/도/마/바/사/아/저/허 등) — 영문이면 plate 아님
- 차량번호판 칸이 비어있거나 신차 미발급 상태일 때만 null`,
    schema: VEHICLE_REG_SCHEMA,
  },
  business_reg: {
    label: '사업자등록증',
    prompt: `이 문서는 한국 사업자등록증 (법인 또는 개인) 입니다.

핵심 추출 규칙:
- biz_no: 등록번호 XXX-XX-XXXXX
- corp_no: 법인등록번호 XXXXXX-XXXXXXX (개인사업자면 null)
- partner_name: 법인명(단체명) — "주식회사 OOO" 그대로
- ceo: 대표자 이름. (대표유형) 표기는 ceo_type 으로 분리
- open_date / issue_date: "2017 년 01 월 01 일" 같은 한글 표기도 YYYY-MM-DD 로 변환
- address: 사업장 소재지
- hq_address: 본점 소재지 (사업장과 동일하면 같은 값 그대로)
- industry: 업태 — **여러 개일 수 있음**. 등록증 표 안에 줄 바꿔 여러 항목이면 콤마+공백 join. 예: "서비스" + "부동산업" → "서비스, 부동산업"
- category: 종목 — 동일 규칙. 예: "렌터카, 매매업"
- tax_office: 세무서장 위 표기 (예: "강서세무서")
- single_tax_flag: 사업자단위 과세 적용사업자 여부. 여(✓) → true, 부(✓) → false. 둘 다 비면 null
- issue_reason: 발급사유 칸 — 보통 비어있음. 비었으면 null
- entity_type: "법인사업자" → corporate, 개인 → individual

값 없으면 null. 한글 그대로 보존 (정규화 X).`,
    schema: BUSINESS_REG_SCHEMA,
  },
  insurance_policy: {
    label: '자동차보험증권',
    prompt: `이 문서는 한국의 자동차보험증권(또는 렌터카공제 가입증명서)입니다. 보통 1쪽 단위로 1대 차량의 보험 정보를 담고 있습니다.

## 핵심 추출 규칙

- **insurer**: 상단 로고/문구로 식별. "DB손해보험"·"DB손해보험주식회사" → "DB손해보험". "전국렌터카공제조합"·"KRMA" → "전국렌터카공제조합". 그 외는 원문.
- **product_name**: "프로미카다이렉트업무용(베이직형)자동차보험", "플러스자동차공제" 등 상단 상품명 텍스트 그대로.
- **policy_no**: "증권번호" 또는 "공제번호" 라벨 옆 값. 하이픈 포함 그대로.
- **start_date / end_date**: "보험기간 YYYY년 MM월 DD일 ~ YYYY년 MM월 DD일" → YYYY-MM-DD 두 개로 분해.
- **car_number**: 정확히 \`\\d{2,3}[가-힣]\\d{4}\` 포맷. 한글 없거나 하이픈/17자면 무조건 null.
- **car_year**: "연식 2017년" → 2017 (정수).
- **car_class**: "승용대형_세단 (2,500cc초과)" 같은 텍스트 그대로.
- **displacement**: "3,342CC" → 3342 (정수).
- **seats**: "정원 5 명" → 5.
- **vehicle_value_man / accessory_value_man**: "차량가액(부속가액) 1,331 만원(20만원)" → vehicle=1331, accessory=20.
- **accessories**: "블랙박스, 파노라마선루프" 등 부속품란 원문.
- **driver_scope**: "누구나운전" / "임직원한정" / "가족운전" 등.
- **driver_age**: "만21세이상한정", "만35세이상한정" 등.
- **deductible_man**: "(물적사고할증금액 : 200만원)" → 200.
- **cov_personal_1**: 대인배상Ⅰ 셀 ("자배법시행령에서 규정한 한도" 등).
- **cov_personal_2**: 대인배상Ⅱ 셀 ("1인당 무한" 등).
- **cov_property**: 대물배상 셀.
- **cov_self_accident**: "자기신체사고" 또는 "자동차상해" 한도 텍스트.
- **cov_uninsured**: 무보험차상해.
- **cov_self_vehicle**: 자기차량손해. "미가입"이면 "미가입".
- **cov_emergency**: "프로미카SOS 긴급출동서비스 (6)회, 긴급견인(40Km)" 같이 통째로.
- **paid_premium / total_premium**: "납입한 보험료 1,002,090 원", "총보험료 1,388,610 원" → 콤마 제거 정수.

## 분납 자동이체 / 회차별 분납

비고란에 "분납 자동이체 : 신한은행(통합) / 14001438**** / 스위치플랜(주)" 형태로 들어 있음:
- **auto_debit_bank** = "신한은행(통합)"
- **auto_debit_account** = "14001438****"  (마스킹 그대로)
- **auto_debit_holder** = "스위치플랜(주)"

그 다음 줄 "분납보험료: 2회차: 2026.04.14 / 77,300원, 3회차: 2026.05.14 / 77,300원, 4회차: ..." 형태:
- **installments**: 배열로 분해. **1회차 = 가입시 납입(= paid_premium 액수, due_date=start_date)**로 추가하고, 그 뒤 2회차/3회차/.../6회차 순서대로.
  예) 보험기간 2026-03-14 시작, 납입한보험료 1,002,090원, 분납 2회차 2026.04.14 / 77,300원 ...
  → installments = [
       { cycle: 1, due_date: "2026-03-14", amount: 1002090 },
       { cycle: 2, due_date: "2026-04-14", amount: 77300 },
       { cycle: 3, due_date: "2026-05-14", amount: 77300 },
       ...
     ]

분납 정보가 아예 없는 일시납 증권은 installments에 [{cycle:1, due_date:start_date, amount:total_premium}] 한 건만 넣음.

값 없으면 null. 차량번호는 포맷 안 맞으면 무조건 null.`,
    schema: INSURANCE_POLICY_SCHEMA,
  },
  rental_contract: {
    label: '자동차 렌탈(대여) 계약서',
    prompt: `이 PDF는 한국 시설대여 계약서 (자동차 임대차)입니다. 보통 다중 페이지 PDF 이며 페이지/섹션별로 정보가 흩어져 있을 수 있습니다:
- 1페이지: 차량·기간·결제 요약
- 2페이지: 임차인 인적사항·계약조건·결제방법·해지수수료
- 3페이지: 자동차보험 사항·정비서비스·특약사항
- 4페이지: 임대차 계약 사실 확인서
- 5페이지: 개인정보 동의서
- 9페이지: 자동이체신청서 (CMS) — auto_debit_bank/account/holder 여기서 추출
- 1페이지에 승계 확인서가 있을 때만 — predecessor_name/phone, succeeded_at

## 핵심 추출 규칙

### 임차인 (계약자)
- **contractor_name**: 성명 셀의 이름. "홍길동" 등
- **contractor_kind**: "개인사업자(해당 시 기입)" 박스에 사업자정보가 채워져 있으면 "사업자". 사업자 정보가 비어있고 주민번호만 있으면 "개인". 법인이면 "법인"
- **contractor_ident**: 주민번호(XXXXXX-XXXXXXX) 또는 사업자등록번호(XXX-XX-XXXXX). 신분에 맞는 거 우선
- **contractor_license_no**: 면허번호 (XX-XX-XXXXXX-XX 포맷)
- **contractor_phone**: 전화번호 / 휴대전화
- **contractor_address**: 주소 / 실거주지 (서울/경기 등)
- **contractor_emergency_phone**: "비상연락처" 또는 "가족 연락처" 셀의 번호
- **contractor_emergency_relation**: 비상연락처 옆/괄호 안에 있는 관계 — "부", "모", "배우자", "자녀", "형제" 등
- **contractor_biz_name**: 개인사업자 박스의 "상호" (있을 때)
- **contractor_biz_address**: "사업장소재지"

### 차량
- **car_number**: 정확히 \`\\d{2,3}[가-힣]\\d{4}\` 포맷. "12가1234" 등. "차량번호(차대번호)" 셀 또는 상단 "계약서 번호" 줄 참고. 한글 없거나 17자 차대번호면 무조건 null
- **car_name**: "대여차종(모델명, 트림)" 셀. "G80", "올 뉴 K3 1.6 가솔린 럭셔리 A/T" 등
- **fuel**: "연료" 셀. "가솔린", "디젤", "하이브리드", "전기"
- **color**: "색상" 셀. "화이트/블랙", "흰색" 등 그대로
- **options**: "옵션" 셀. "선루프" 등
- **maintenance_product**: "정비상품" 셀. "정비제외" / "엔진오일 연1회" 등 한글 표기 그대로 보존
- **engine_oil_service**: 정비상품 본문 또는 특약/체크박스에 "엔진오일 서비스", "엔진오일 연1회" 라벨이 보이면 true. "정비제외"이거나 미언급이면 false
- **inspection_service**: "검사대행", "정기검사 대행" 라벨이 보이면 true. 미언급이면 false

### 계약 기간 / 주행거리
- **rental_period_months**: "대여기간" / "차량 인도일로부터 N개월". "차량 인도일로부터 48개월" → 48
- **start_date**: "계약시작일" YYYY-MM-DD. 비어있으면 null
- **end_date**: "계약종료일" YYYY-MM-DD. 비어있으면 null
- **driver_age_min**: "운전자 연령". "만 26세이상" → 26
- **initial_mileage_km**: "현재 주행거리" / "인수 시점 주행거리". "100,000Km" → 100000
- **annual_mileage_limit_km**: "연간 약정 주행거리". "3.0만Km" → 30000
- **excess_mileage_fee_kr / excess_mileage_fee_foreign**: "약정 초과시 1km 당 국산 200원, 수입 400원" → kr=200, foreign=400. 한 가지만 표기되면 다른 쪽은 null

### 결제
- **monthly_amount**: "월 대여료" 큰 숫자. "1,000,000" → 1000000
- **deposit_total**: 1·2·3회차 보증금 합. 일시납이면 1회차만
- **deposit_installments**: 보증금 분납 박스. "보증금 분납 여부 = 일시납"이면 1회차만, 분납이면 회차별 모두. amount 비어있으면 null로 (cycle만 채움)
- **purchase_option_amount**: "인수가격" 셀. "만기협의" / 숫자 / null
- **payment_account_bank**: "대여료 입금계좌" 라인의 은행명 (예: "신한은행")
- **payment_account_no**: 입금계좌번호 (140-013-750928 등)
- **payment_account_holder**: 입금계좌 예금주 = 회사명
- **autopay_day**: "대여료 자동이체일" 라인. 5/10/15/20/25 중 □ 체크된 거 우선. 체크 인식 어려우면 가장 명확한 숫자 1개

### 자동이체신청서 (CMS, 보통 9페이지)
- **auto_debit_bank**: 출금은행 (예: "국민은행", "신한은행")
- **auto_debit_account**: 출금계좌번호 (마스킹/하이픈 포함 그대로)
- **auto_debit_holder**: 예금주 (보통 임차인 본인)

### 자동차보험 (3페이지 보험 섹션)
- **insurer**: "보험사" / "보험회사" 셀. 예: "DB손해보험", "전국렌터카공제조합"
- **deductible_rate / deductible_min / deductible_max**: 자차면책금 문장 분해. "사고처리 비용의 20% 최소 50만원 ~ 최대 100만원" → rate=0.2, min=50, max=100. "%" 만 있고 만원 표기 없으면 rate 만 채움

### 승계 (1페이지 승계 확인서, 있을 때만)
- **predecessor_name**: 양도인 (이전 계약자) 이름
- **predecessor_phone**: 양도인 연락처
- **succeeded_at**: 승계 일자 YYYY-MM-DD ("YYYY년 MM월 DD일" 표기도 ISO 변환)

### 회사 (임대인)
- **company_name**: "렌트회사" 셀 또는 표지의 큰 회사명
- **company_ceo**: "대표자"
- **company_biz_no**: 회사 사업자번호 (XXX-XX-XXXXX)
- **company_phone**: 회사 연락처 (1544-3871 등)
- **company_address**: 회사 주소

## 추출 원칙
1. 라벨이 같은 줄/셀 또는 인접 셀에 있는 값을 우선 매칭
2. "년 월 일" 형태인데 빈 칸이면 null (placeholder)
3. 금액은 콤마 제거 후 정수
4. 차량번호 포맷 안 맞으면 무조건 null
5. 값 없으면 null. 한글 표기 그대로 보존 (정규화·번역 금지)`,
    schema: RENTAL_CONTRACT_SCHEMA,
  },
  license: {
    label: '운전면허증',
    prompt: `이 이미지는 한국 운전면허증 카드 (모바일 면허증 포함) 입니다.

## 핵심 필드

- **license_no**: 면허번호. 한국 면허번호는 \`\\d{2}-\\d{2}-\\d{6}-\\d{2}\` 패턴 (예: "11-12-345678-90"). 카드 정면 큰 글씨로 표기. 하이픈 그대로 보존.
- **license_type**: "1종 보통", "2종 보통", "1종 대형", "1종 특수(대형견인/소형견인/구난)", "2종 소형", "2종 원동기" 등 그대로.
- **holder_name**: 성명. 한자 병기 시 한글만.
- **resident_no**: 주민번호 앞 6자리(생년월일 부분)만. 뒷자리 1자(성별)는 birth_date 계산에만 사용. 풀 주민번호 저장 X.
- **birth_date**: 주민번호 7번째 자리로 세기 판정 — 1·2 → 19xx, 3·4 → 20xx, 5·6 → 19xx(외국인), 7·8 → 20xx(외국인). YYMMDD + 세기 → YYYY-MM-DD.
- **address**: 주소 (시/도 ~ 상세). 카드에 적힌 그대로.
- **issue_date**: 발급일 YYYY-MM-DD.
- **expiry_date**: "적성검사기간 ~ YYYY.MM.DD" 또는 "갱신만료일 YYYY.MM.DD". YYYY-MM-DD 로 변환.
- **serial_no**: 카드 우상단 연번/일련번호 (있을 때).
- **conditions**: 조건 (예: "A 수동", "안경", "자동변속기"). 비면 null.
- **issuer**: 발급기관 (예: "서울지방경찰청장", "경기남부지방경찰청장").

## 추출 원칙

- 값 없으면 null. 절대 추측 X.
- 카드가 일부만 보이거나 광택/그림자로 안 보이는 글자는 null.
- 주민번호 뒷 7자리는 절대 추출 X (개인정보 보호).
- birth_date 는 resident_no 앞 6자리 + 7번째 자리 조합으로 계산.`,
    schema: LICENSE_SCHEMA,
  },
  penalty: {
    label: '과태료/범칙금/통행료 고지서',
    prompt: `이 문서는 한국의 과태료·범칙금·통행료·주정차위반·속도위반·신호위반 등 교통 관련 부과 고지서입니다.

## 핵심 필드

- **car_number** (차량번호): 정확히 \`\\d{2,3}[가-힣]\\d{4}\` 포맷. 예 "01도9893", "12가3456". 한글이 없거나 하이픈 포함이면 절대 차량번호 아님.
- **doc_type** (구분): 다음 중 하나로 분류 — "과태료", "범칙금", "통행료", "주정차위반", "속도위반", "신호위반", "기타". 문서에 "통행료"가 있으면 "통행료". "주정차"는 "주정차위반". "속도"+"과태료"면 "속도위반". "신호"+"과태료"면 "신호위반". 기본은 "과태료".
- **notice_no** (고지서번호): 고지서 우상단 또는 OMR 영역의 번호. 하이픈/공백 제거.
- **issuer** (발급기관): "○○경찰서", "○○시청", "○○구청", "○○영업소" 등. 문서 발신/직인.
- **issue_date** (발송일): YYYY-MM-DD.
- **date** (위반일시): YYYY-MM-DD HH:mm (시간 표시 있을 때). 시간 없으면 YYYY-MM-DD.
- **location** (위반장소): 도로명·지번 그대로. 통행료면 영업소/대교/터널 이름.
- **description** (위반내용): "속도위반(50km/h 초과)", "주정차금지위반" 등 구체. 통행료면 "통행료 미납".
- **law_article** (적용법조): "도로교통법 제xx조" 형식.
- **amount** (금액): 실제 부과 금액(원) — 정수. 과태료/범칙금/통행료 중 메인 금액 하나.
- **due_date** (납부기한): YYYY-MM-DD.
- **pay_account** (납부계좌): "농협 123-4567-8901" 같이 은행+계좌 결합.

## 추출 원칙

1. 라벨이 같은 줄 또는 바로 다음 줄에 있는 값을 우선 매칭.
2. 금액은 콤마 제거 후 정수로 변환.
3. 라벨에 매칭되는 값이 명확하지 않으면 null.
4. 차량번호는 위 포맷에 안 맞으면 무조건 null.`,
    schema: PENALTY_SCHEMA,
  },
};

export async function POST(req: NextRequest) {
  // 인증 — Authorization: Bearer <Firebase ID token> (직원만)
  const actor = await requireAuth();
  if (actor instanceof NextResponse) return actor;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'GEMINI_API_KEY 환경변수 미설정' },
      { status: 500 },
    );
  }

  let docType: string | null;
  let file: File | null;
  try {
    const formData = await req.formData();
    docType = String(formData.get('type') || '');
    file = formData.get('file') as File | null;
  } catch (err) {
    return NextResponse.json({ ok: false, error: `FormData 파싱 실패: ${(err as Error).message}` }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ ok: false, error: 'file 필드 누락' }, { status: 400 });
  }
  const spec = TYPE_SPECS[docType ?? ''];
  if (!spec) {
    return NextResponse.json({ ok: false, error: `지원하지 않는 type: ${docType}` }, { status: 400 });
  }

  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: '파일 크기는 20MB 이하만 가능' }, { status: 413 });
  }

  const arrayBuf = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuf).toString('base64');
  const mediaType = file.type || inferMediaTypeFromName(file.name);

  const ai = new GoogleGenAI({ apiKey });

  async function callWithRetry(): Promise<Awaited<ReturnType<typeof ai.models.generateContent>>> {
    const maxRetries = 3;
    let lastErr: unknown;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await ai.models.generateContent({
          model: MODEL,
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: mediaType, data: base64 } },
              { text: spec.prompt },
            ],
          }],
          config: {
            responseMimeType: 'application/json',
            responseSchema: spec.schema,
            temperature: 0,
            ...(MODEL.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            maxOutputTokens: 2048,
          },
        });
      } catch (err) {
        lastErr = err;
        const msg = (err as { message?: string })?.message ?? '';
        const isRetryable = msg.includes('503') || msg.includes('429') || msg.includes('UNAVAILABLE') || msg.includes('RESOURCE_EXHAUSTED');
        if (!isRetryable || attempt === maxRetries - 1) throw err;
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 8000) + Math.random() * 1000;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw lastErr;
  }

  try {
    const response = await callWithRetry();
    const text = response.text;
    if (!text) {
      return NextResponse.json({ ok: false, error: 'Gemini 응답에 텍스트 없음' }, { status: 502 });
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: `JSON 파싱 실패: ${(err as Error).message}`, raw: text },
        { status: 502 },
      );
    }

    // 차량번호 후처리 — 한국 plate 패턴 다단계 추출:
    //   1) 전각 숫자(０-９) → 반각 정규화
    //   2) wrapping text 안 plate 부분 매칭 ("차량번호: 15가4481" / "[15가4481]" 등)
    //   3) 그래도 없으면 전체 응답 JSON 에서 plate 패턴 fallback 찾기 (Gemini 가
    //      car_number 필드에 못 넣고 다른 곳에 흘려보낸 케이스 — 예: 외산차)
    //   VIN(영문+숫자 17자) 은 한글이 없으니 자동 배제.
    const PLATE_RE = /(\d{2,3})\s*[\-.·]?\s*([가-힣])\s*[\-.·]?\s*(\d{4})/;
    const normalize = (s: unknown): string => String(s ?? '')
      .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));

    const plateDebug: {
      stage: 0 | 1 | 2 | 3;
      original: unknown;
      stage3_attempts?: Array<{ prompt_idx: number; raw: string; error?: string }>;
    } = { stage: 0, original: parsed.car_number };

    if (docType === 'vehicle_reg' || docType === 'penalty' || docType === 'insurance_policy' || docType === 'rental_contract') {
      // 1차: car_number 필드 매칭
      let extracted: string | null = null;
      if (parsed.car_number) {
        const m = normalize(parsed.car_number).match(PLATE_RE);
        if (m) { extracted = `${m[1]}${m[2]}${m[3]}`; plateDebug.stage = 1; }
      }
      // 2차 fallback: 전체 응답에서 plate 패턴 찾기 (Gemini 누락 대비)
      if (!extracted) {
        const blob = normalize(JSON.stringify(parsed));
        const m = blob.match(PLATE_RE);
        if (m) { extracted = `${m[1]}${m[2]}${m[3]}`; plateDebug.stage = 2; }
      }
      // 3차 fallback (vehicle_reg 한정): 병렬 plate-only Gemini 호출 (multi-prompt).
      // Gemini Vision 은 temperature:0 이어도 동일 입력에 대해 non-deterministic 한
      // 케이스가 있어 (특히 Tesla 같은 외산차 등록증) — 다른 prompt 3개 동시 호출 후
      // 첫 매칭을 채택. 1개라도 hit 하면 OK 라 신뢰성↑.
      if (!extracted && docType === 'vehicle_reg') {
        const PLATE_PROMPTS = [
          '이 한국 자동차등록증의 ① 자동차등록번호 칸에 적힌 차량번호판만 답하세요. 포맷: \\d{2,3}[가-힣]\\d{4} (예: 15가4481, 01도9893). 다른 설명 없이 번호판 문자열만.',
          '이 자동차등록증 첫 페이지의 가장 위쪽 표 ① 칸 (차종 / 용도 같은 행) 에 있는 한국 번호판을 그대로 옮겨 적으세요. 예: 15가4481. 다른 텍스트 금지.',
          'Read the Korean license plate from the ① 자동차등록번호 cell of this 자동차등록증 (top-left of the main table on page 1). Format: digits + 한글 + digits like 15가4481. Output ONLY the plate string.',
        ];
        plateDebug.stage3_attempts = [];
        const attempts = await Promise.all(PLATE_PROMPTS.map(async (prompt, idx) => {
          try {
            const r = await ai.models.generateContent({
              model: MODEL,
              contents: [{
                role: 'user',
                parts: [
                  { inlineData: { mimeType: mediaType, data: base64 } },
                  { text: prompt },
                ],
              }],
              config: {
                temperature: 0,
                // 3차 fallback 은 thinking 활성화 — 메인 schema-mode 가 못 잡은 어려운 케이스라
                // Gemini 가 직접 추론하게 두는 게 신뢰성↑. 출력은 plate 만이라 비용 영향 작음.
                ...(MODEL.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 1024 } } : {}),
                maxOutputTokens: 2048,
              },
            });
            const raw = normalize(r.text ?? '');
            return { prompt_idx: idx, raw };
          } catch (err) {
            return { prompt_idx: idx, raw: '', error: (err as Error).message };
          }
        }));
        plateDebug.stage3_attempts = attempts;
        for (const a of attempts) {
          const m = a.raw.match(PLATE_RE);
          if (m) { extracted = `${m[1]}${m[2]}${m[3]}`; plateDebug.stage = 3; break; }
        }
      }
      parsed.car_number = extracted;
    }

    if (docType === 'vehicle_reg' && !parsed.detail_model && parsed.car_name) {
      const cleanedName = String(parsed.car_name).replace(/\s*\([^)]*\)/g, '').trim();
      if (cleanedName) parsed.detail_model = cleanedName;
    }

    return NextResponse.json({
      ok: true,
      doc_type: docType,
      doc_label: spec.label,
      extracted: parsed,
      model: MODEL,
      _debug: { plate: plateDebug },
      usage: {
        input_tokens: response.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      },
    });
  } catch (err) {
    const e = err as { status?: number; message?: string };
    const msg = e.message || String(err);
    const status = typeof e.status === 'number' ? e.status : 500;
    return NextResponse.json({ ok: false, error: `Gemini API 실패: ${msg}` }, { status });
  }
}

function inferMediaTypeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    default: return 'application/octet-stream';
  }
}
