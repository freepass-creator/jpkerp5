import type { Contract, BankTransaction, CardTransaction, PaymentSchedule } from './types';

/* 기준일: 2026-05-14 (실데이터 더미파일과 동일 월) */
const TODAY = '2026-05-14';

/** 더미파일 시트2 행 6~30 + 다양한 케이스 추가 (총 30건) */
export const MOCK_CONTRACTS: Contract[] = [
  // [r6] 아이카/김효진1 — 정상 운행, 미수 없음
  {
    id: 'c001', contractNo: 'ICR-2604-0001',
    company: '아이카', manager: '장근안',
    customerName: '김효진', customerRegNoMasked: '900101-1******',
    customerPhone1: '010-1234-0001',
    customerRegion: '용인', customerDistrict: '수지구',
    vehiclePlate: '109호1234', vehicleModel: '신형G90', vehicleStatus: '운행',
    contractDate: '2026-04-01', deliveredDate: '2026-04-03',
    returnScheduledDate: '2027-04-02',
    termMonths: 12, longTerm: true,
    monthlyRent: 3000000, deposit: 5000000, paymentDay: 1,
    paymentMethod: '이체',
    insuranceAge: 35, selfInsured: true, distanceLimitKm: 50000,
    status: '운행',
    currentSeq: 2, totalSeq: 12,
    lastPaidDate: '2026-05-01', lastPaidAmount: 3000000,
    unpaidAmount: 0, unpaidSeqCount: 0,
  },
  // [r7] 아이카/김효진2 — 5월 미납
  {
    id: 'c002', contractNo: 'ICR-2603-0002',
    company: '아이카', manager: '장근안',
    customerName: '김효진2', customerRegNoMasked: '880515-2******',
    customerPhone1: '010-1234-0002',
    customerRegion: '수원시', customerDistrict: '영통구',
    vehiclePlate: '109호1235', vehicleModel: '카니발하이리무진', vehicleStatus: '운행',
    contractDate: '2026-03-10', deliveredDate: '2026-03-12',
    returnScheduledDate: '2026-09-11',
    termMonths: 6, longTerm: false,
    monthlyRent: 2800000, deposit: 3000000, paymentDay: 12,
    paymentMethod: '세금계산서',
    insuranceAge: 30, selfInsured: false, distanceLimitKm: 20000,
    status: '채권',
    currentSeq: 3, totalSeq: 6,
    lastPaidDate: '2026-04-12', lastPaidAmount: 2800000,
    unpaidAmount: 2800000, unpaidSeqCount: 1,
  },
  // [r8] 아이카/김효진3 — 부분납 (1,317,000 잔액)
  {
    id: 'c003', contractNo: 'ICR-2510-0003',
    company: '아이카', manager: '장근안',
    customerName: '김효진3', customerRegNoMasked: '750822-1******',
    customerPhone1: '010-1234-0003',
    customerRegion: '대전시', customerDistrict: '유성구',
    vehiclePlate: '109호1236', vehicleModel: '벤츠e200', vehicleStatus: '운행',
    contractDate: '2025-10-15', deliveredDate: '2025-10-16',
    returnScheduledDate: '2026-10-15',
    termMonths: 12, longTerm: true,
    monthlyRent: 1617000, deposit: 2000000, paymentDay: 15,
    paymentMethod: '모빌러그장기',
    insuranceAge: 50, selfInsured: true, distanceLimitKm: 30000,
    status: '채권',
    currentSeq: 7, totalSeq: 12,
    lastPaidDate: '2026-05-15', lastPaidAmount: 300000,
    unpaidAmount: 1317000, unpaidSeqCount: 1,
  },
  // [r9] 아이카/김효진4 — 장기 정상
  {
    id: 'c004', contractNo: 'ICR-2602-0004',
    company: '아이카', manager: '이수민',
    customerName: '김효진4', customerRegNoMasked: '920303-2******',
    customerPhone1: '010-1234-0004',
    customerRegion: '서울시', customerDistrict: '강남구',
    vehiclePlate: '109호1237', vehicleModel: '제네시스GV80', vehicleStatus: '운행',
    contractDate: '2026-02-01', deliveredDate: '2026-02-02',
    returnScheduledDate: '2027-02-01',
    termMonths: 12, longTerm: true,
    monthlyRent: 2053650, deposit: 3000000, paymentDay: 1,
    paymentMethod: 'CMS',
    insuranceAge: 33, selfInsured: true, distanceLimitKm: 40000,
    status: '운행',
    currentSeq: 4, totalSeq: 12,
    lastPaidDate: '2026-05-01', lastPaidAmount: 2053650,
    unpaidAmount: 0, unpaidSeqCount: 0,
  },
  // [r10] 아이카/김효진5 — 1,000,000 미수 + 정기검사 미수검
  {
    id: 'c005', contractNo: 'ICR-2511-0005',
    company: '아이카', manager: '이수민',
    customerName: '김효진5', customerRegNoMasked: '950707-1******',
    customerPhone1: '010-1234-0005',
    customerRegion: '인천', customerDistrict: '연수구',
    vehiclePlate: '109호1238', vehicleModel: '쏘렌토MQ4', vehicleStatus: '운행',
    contractDate: '2025-11-05', deliveredDate: '2025-11-06',
    returnScheduledDate: '2026-11-05',
    termMonths: 12, longTerm: true,
    monthlyRent: 1000000, deposit: 1500000, paymentDay: 5,
    paymentMethod: '카드',
    insuranceAge: 28, selfInsured: false, distanceLimitKm: 30000,
    inspectionDueDate: '2026-04-15',  // 미수검 발생
    status: '운행',
    currentSeq: 7, totalSeq: 12,
    lastPaidDate: '2026-04-05', lastPaidAmount: 1000000,
    unpaidAmount: 1000000, unpaidSeqCount: 1,
    notes: '4/15 정기검사 미수검 — 고객 통보 필요',
  },
  // [r11] 아이카/김효진6 — 90,000 잔액
  {
    id: 'c006', contractNo: 'ICR-2509-0006',
    company: '아이카', manager: '박지훈',
    customerName: '김효진6', customerRegNoMasked: '870212-2******',
    customerPhone1: '010-1234-0006',
    customerRegion: '부산', customerDistrict: '해운대구',
    vehiclePlate: '109호1239', vehicleModel: '아우디Q5', vehicleStatus: '운행',
    contractDate: '2025-09-10', deliveredDate: '2025-09-11',
    returnScheduledDate: '2026-09-10',
    termMonths: 12, longTerm: true,
    monthlyRent: 1997000, deposit: 2500000, paymentDay: 10,
    paymentMethod: 'CMS',
    insuranceAge: 38, selfInsured: true, distanceLimitKm: 35000,
    status: '운행',
    currentSeq: 9, totalSeq: 12,
    lastPaidDate: '2026-05-10', lastPaidAmount: 1907000,
    unpaidAmount: 90000, unpaidSeqCount: 1,
  },
  // [r14] 아이카/김효진9 — 700,000 1회 미수
  {
    id: 'c009', contractNo: 'ICR-2603-0009',
    company: '아이카', manager: '박지훈',
    customerName: '김효진9', customerRegNoMasked: '930515-1******',
    customerPhone1: '010-1234-0009',
    customerRegion: '대구', customerDistrict: '수성구',
    vehiclePlate: '109호1242', vehicleModel: '카니발9인승', vehicleStatus: '운행',
    contractDate: '2026-03-20', deliveredDate: '2026-03-22',
    returnScheduledDate: '2026-06-21',
    termMonths: 3, longTerm: false,
    monthlyRent: 700000, deposit: 500000, paymentDay: 22,
    paymentMethod: '이체',
    insuranceAge: 26, selfInsured: false, distanceLimitKm: 10000,
    status: '운행',
    currentSeq: 2, totalSeq: 3,
    lastPaidDate: '2026-04-22', lastPaidAmount: 700000,
    unpaidAmount: 700000, unpaidSeqCount: 1,
  },
  // [r15] 아이카/김효진10 — 큰 미수 1,364,640
  {
    id: 'c010', contractNo: 'ICR-2507-0010',
    company: '아이카', manager: '장근안',
    customerName: '김효진10', customerRegNoMasked: '900909-2******',
    customerPhone1: '010-1234-0010',
    customerRegion: '광주', customerDistrict: '서구',
    vehiclePlate: '109호1243', vehicleModel: '카니발노블레스', vehicleStatus: '운행',
    contractDate: '2025-07-15', deliveredDate: '2025-07-16',
    returnScheduledDate: '2026-07-15',
    termMonths: 12, longTerm: true,
    monthlyRent: 1364640, deposit: 1500000, paymentDay: 15,
    paymentMethod: '카랜장기',
    insuranceAge: 31, selfInsured: true, distanceLimitKm: 40000,
    status: '채권',
    currentSeq: 11, totalSeq: 12,
    lastPaidDate: '2026-04-15', lastPaidAmount: 1364640,
    unpaidAmount: 1364640, unpaidSeqCount: 1,
  },
  // [r19] 아이카/김효진14 — 부분납 + 위반 (과태료)
  {
    id: 'c014', contractNo: 'ICR-2604-0014',
    company: '아이카', manager: '이수민',
    customerName: '김효진14', customerRegNoMasked: '860304-1******',
    customerPhone1: '010-1234-0014',
    customerRegion: '용인', customerDistrict: '기흥구',
    vehiclePlate: '109호1247', vehicleModel: '스타리아라운지', vehicleStatus: '운행',
    contractDate: '2026-04-20', deliveredDate: '2026-04-21',
    returnScheduledDate: '2026-10-20',
    termMonths: 6, longTerm: false,
    monthlyRent: 1306500, deposit: 1000000, paymentDay: 21,
    paymentMethod: '세금계산서',
    insuranceAge: 39, selfInsured: false, distanceLimitKm: 25000,
    hasViolations: true, violationSince: '2026-05-02',
    status: '운행',
    currentSeq: 1, totalSeq: 6,
    lastPaidDate: '2026-04-21', lastPaidAmount: 800000,
    unpaidAmount: 506500, unpaidSeqCount: 1,
    notes: '5/2 속도위반 과태료 7만원 미처리',
  },
  // [r22] 아이카/김효진17 — 1,069,010 미수
  {
    id: 'c017', contractNo: 'ICR-2602-0017',
    company: '아이카', manager: '박지훈',
    customerName: '김효진17', customerRegNoMasked: '780111-1******',
    customerPhone1: '010-1234-0017',
    customerRegion: '천안', customerDistrict: '동남구',
    vehiclePlate: '109호1250', vehicleModel: 'BMW520i', vehicleStatus: '운행',
    contractDate: '2026-02-15', deliveredDate: '2026-02-16',
    returnScheduledDate: '2027-02-15',
    termMonths: 12, longTerm: true,
    monthlyRent: 1069010, deposit: 1500000, paymentDay: 16,
    paymentMethod: '후불',
    insuranceAge: 47, selfInsured: true, distanceLimitKm: 30000,
    status: '채권',
    currentSeq: 3, totalSeq: 12,
    lastPaidDate: '2026-04-16', lastPaidAmount: 1069010,
    unpaidAmount: 1069010, unpaidSeqCount: 1,
  },
  // [r25] 김효진20 — 큰 미수
  {
    id: 'c020', contractNo: 'ICR-2511-0020',
    company: '아이카', manager: '장근안',
    customerName: '김효진20', customerRegNoMasked: '850727-2******',
    customerPhone1: '010-1234-0020',
    customerRegion: '청주', customerDistrict: '서원구',
    vehiclePlate: '109호1253', vehicleModel: '쏘렌토하이브리드', vehicleStatus: '운행',
    contractDate: '2025-11-25', deliveredDate: '2025-11-27',
    returnScheduledDate: '2026-05-26',
    termMonths: 6, longTerm: false,
    monthlyRent: 850000, deposit: 800000, paymentDay: 26,
    paymentMethod: '세금계산서',
    insuranceAge: 40, selfInsured: false, distanceLimitKm: 20000,
    status: '채권',
    currentSeq: 6, totalSeq: 6,
    lastPaidDate: '2026-04-26', lastPaidAmount: 850000,
    unpaidAmount: 850000, unpaidSeqCount: 1,
  },
  // 차량구매 단계 — 외제차 계약, 매입 대기
  {
    id: 'c045', contractNo: 'ICR-2605-0045',
    company: '아이카', manager: '장근안',
    customerName: '최강민', customerRegNoMasked: '780303-1******',
    customerPhone1: '010-2200-0001',
    customerRegion: '서울', customerDistrict: '강남구',
    vehiclePlate: '미정', vehicleModel: '벤츠S580마이바흐', vehicleStatus: '구매대기',
    contractDate: '2026-05-05',
    returnScheduledDate: '2027-05-04',
    termMonths: 12, longTerm: true,
    monthlyRent: 4500000, deposit: 8000000, paymentDay: 5,
    paymentMethod: '이체',
    insuranceAge: 48, selfInsured: true, distanceLimitKm: 25000,
    status: '대기',
    currentSeq: 0, totalSeq: 12,
    unpaidAmount: 0, unpaidSeqCount: 0,
    notes: '벤츠코리아 발주 — 6월 중순 입고 예정',
  },
  // 차량구매 (특수차)
  {
    id: 'c046', contractNo: 'ICR-2605-0046',
    company: '달카', manager: '최영민',
    customerName: '윤재호', customerRegNoMasked: '820720-1******',
    customerPhone1: '010-2200-0002',
    customerRegion: '경기', customerDistrict: '용인시',
    vehiclePlate: '미정', vehicleModel: '카니발하이리무진9인승', vehicleStatus: '구매대기',
    contractDate: '2026-05-12',
    returnScheduledDate: '2027-11-11',
    termMonths: 18, longTerm: true,
    monthlyRent: 1900000, deposit: 3000000, paymentDay: 12,
    paymentMethod: 'CMS',
    insuranceAge: 44, selfInsured: true, distanceLimitKm: 40000,
    status: '대기',
    currentSeq: 0, totalSeq: 18,
    unpaidAmount: 0, unpaidSeqCount: 0,
    notes: '기아 본사 발주 (개조차 — 약 3주 소요)',
  },
  // 선도구매 (계약자 없이 재고 확보용)
  {
    id: 'c047a', contractNo: 'INV-2605-0001',
    company: '아이카', manager: '장근안',
    customerName: '(선도구매)', customerPhone1: '-',
    vehiclePlate: '미정', vehicleModel: '카니발KA4 9인승', vehicleStatus: '구매대기',
    contractDate: '2026-05-10',
    termMonths: 0, longTerm: false,
    monthlyRent: 0, deposit: 0, paymentDay: 1,
    paymentMethod: '이체',
    status: '대기',
    currentSeq: 0, totalSeq: 0,
    unpaidAmount: 0, unpaidSeqCount: 0,
    isInventoryPurchase: true,
    notes: '재고 확보 — 6월 모빌러그 장기 캠페인 대비',
  },
  {
    id: 'c047b', contractNo: 'INV-2605-0002',
    company: '달카', manager: '최영민',
    customerName: '(선도구매)', customerPhone1: '-',
    vehiclePlate: '미정', vehicleModel: '아반떼CN7', vehicleStatus: '구매대기',
    contractDate: '2026-05-11',
    termMonths: 0, longTerm: false,
    monthlyRent: 0, deposit: 0, paymentDay: 1,
    paymentMethod: '이체',
    status: '대기',
    currentSeq: 0, totalSeq: 0,
    unpaidAmount: 0, unpaidSeqCount: 0,
    isInventoryPurchase: true,
    notes: '재고 — 단기 사고대차 대비 5대 중 2대',
  },
  // 등록대기 (매입 끝, 번호판/등록 진행중)
  {
    id: 'c047', contractNo: 'ICR-2604-0047',
    company: '아이카', manager: '장근안',
    customerName: '신민철', customerRegNoMasked: '830505-1******',
    customerPhone1: '010-2200-0003',
    customerRegion: '서울', customerDistrict: '서초구',
    vehiclePlate: '미발급', vehicleModel: 'BMW530i', vehicleStatus: '등록대기',
    contractDate: '2026-04-25', purchasedDate: '2026-05-09',
    returnScheduledDate: '2027-04-24',
    termMonths: 12, longTerm: true,
    monthlyRent: 1850000, deposit: 2500000, paymentDay: 9,
    paymentMethod: 'CMS',
    insuranceAge: 43, selfInsured: true, distanceLimitKm: 30000,
    status: '대기',
    currentSeq: 0, totalSeq: 12,
    unpaidAmount: 0, unpaidSeqCount: 0,
    notes: '5/9 매입 완료 — 등기소 5/15 예정',
  },
  // 상품화중 (등록 끝, 클리닝·점검·세팅)
  {
    id: 'c048', contractNo: 'ICR-2604-0048',
    company: '달카', manager: '최영민',
    customerName: '한승우', customerRegNoMasked: '910812-1******',
    customerPhone1: '010-2200-0004',
    customerRegion: '경기', customerDistrict: '안산시',
    vehiclePlate: '경기56자7788', vehicleModel: '아반떼CN7', vehicleStatus: '상품화중',
    contractDate: '2026-04-20', purchasedDate: '2026-05-01', registeredDate: '2026-05-10',
    returnScheduledDate: '2027-04-19',
    termMonths: 12, longTerm: true,
    monthlyRent: 520000, deposit: 800000, paymentDay: 10,
    paymentMethod: '이체',
    insuranceAge: 35, selfInsured: false, distanceLimitKm: 25000,
    status: '대기',
    currentSeq: 0, totalSeq: 12,
    unpaidAmount: 0, unpaidSeqCount: 0,
    notes: '등록 완료 — 폴리싱·블랙박스 설치중',
  },
  // 인도대기 (상품화 끝, 출고일 잡힘)
  {
    id: 'c049', contractNo: 'ICR-2605-0049',
    company: '아이카', manager: '이수민',
    customerName: '진예진', customerRegNoMasked: '930621-2******',
    customerPhone1: '010-2200-0005',
    customerRegion: '인천', customerDistrict: '부평구',
    vehiclePlate: '109호5577', vehicleModel: '쏘렌토MQ4', vehicleStatus: '인도대기',
    contractDate: '2026-04-28', purchasedDate: '2026-05-04', registeredDate: '2026-05-09', readiedDate: '2026-05-12',
    deliveryScheduledDate: '2026-05-16', returnScheduledDate: '2027-05-15',
    termMonths: 12, longTerm: true,
    monthlyRent: 880000, deposit: 1200000, paymentDay: 16,
    paymentMethod: '카드',
    insuranceAge: 33, selfInsured: true, distanceLimitKm: 30000,
    status: '대기',
    currentSeq: 0, totalSeq: 12,
    unpaidAmount: 0, unpaidSeqCount: 0,
    notes: '5/16 오전 10시 인천 영업소 출고 예정',
  },
  // 달카 — 신규 출고대기
  {
    id: 'c050', contractNo: 'ICR-2605-0050',
    company: '달카', manager: '최영민',
    customerName: '이정수', customerRegNoMasked: '880901-1******',
    customerPhone1: '010-9000-0001',
    customerRegion: '서울', customerDistrict: '송파구',
    vehiclePlate: '서울32가1234', vehicleModel: '아반떼CN7', vehicleStatus: '출고대기',
    contractDate: '2026-05-10', deliveryScheduledDate: '2026-05-16',
    returnScheduledDate: '2027-05-15',
    termMonths: 12, longTerm: true,
    monthlyRent: 550000, deposit: 1000000, paymentDay: 16,
    paymentMethod: 'CMS',
    insuranceAge: 36, selfInsured: true, distanceLimitKm: 30000,
    status: '대기',
    currentSeq: 0, totalSeq: 12,
    unpaidAmount: 0, unpaidSeqCount: 0,
  },
  // 달카 — 신규 출고대기
  {
    id: 'c051', contractNo: 'ICR-2605-0051',
    company: '달카', manager: '최영민',
    customerName: '박서연', customerRegNoMasked: '950212-2******',
    customerPhone1: '010-9000-0002',
    customerRegion: '경기', customerDistrict: '성남시',
    vehiclePlate: '경기45나5678', vehicleModel: '카니발KA4', vehicleStatus: '출고대기',
    contractDate: '2026-05-12', deliveryScheduledDate: '2026-05-15',
    returnScheduledDate: '2027-05-14',
    termMonths: 12, longTerm: true,
    monthlyRent: 1200000, deposit: 2000000, paymentDay: 15,
    paymentMethod: '카드',
    insuranceAge: 29, selfInsured: true, distanceLimitKm: 30000,
    status: '대기',
    currentSeq: 0, totalSeq: 12,
    unpaidAmount: 0, unpaidSeqCount: 0,
  },
  // 렌트로 — 곧 반납예정 + 정기검사 임박
  {
    id: 'c060', contractNo: 'ICR-2505-0060',
    company: '렌트로', manager: '한지원',
    customerName: '정민호', customerRegNoMasked: '720414-1******',
    customerPhone1: '010-7700-0001',
    customerRegion: '인천', customerDistrict: '남동구',
    vehiclePlate: '인천67다7890', vehicleModel: '그랜저GN7', vehicleStatus: '운행',
    contractDate: '2025-05-20', deliveredDate: '2025-05-22',
    returnScheduledDate: '2026-05-19',
    termMonths: 12, longTerm: true,
    monthlyRent: 1500000, deposit: 2000000, paymentDay: 22,
    paymentMethod: 'CMS',
    insuranceAge: 54, selfInsured: true, distanceLimitKm: 35000,
    inspectionDueDate: '2026-05-01',  // 미수검
    status: '운행',
    currentSeq: 12, totalSeq: 12,
    lastPaidDate: '2026-04-22', lastPaidAmount: 1500000,
    unpaidAmount: 0, unpaidSeqCount: 0,
  },
  // 렌트로 — 반납 5/18
  {
    id: 'c061', contractNo: 'ICR-2505-0061',
    company: '렌트로', manager: '한지원',
    customerName: '오현준', customerRegNoMasked: '901130-1******',
    customerPhone1: '010-7700-0002',
    customerRegion: '서울', customerDistrict: '마포구',
    vehiclePlate: '서울89라1122', vehicleModel: '쏘나타DN8', vehicleStatus: '운행',
    contractDate: '2025-05-18', deliveredDate: '2025-05-18',
    returnScheduledDate: '2026-05-18',
    termMonths: 12, longTerm: true,
    monthlyRent: 700000, deposit: 1000000, paymentDay: 18,
    paymentMethod: '이체',
    insuranceAge: 34, selfInsured: false, distanceLimitKm: 25000,
    status: '운행',
    currentSeq: 12, totalSeq: 12,
    lastPaidDate: '2026-04-18', lastPaidAmount: 700000,
    unpaidAmount: 700000, unpaidSeqCount: 1,
  },
  // 직카 — 단기 사고대차
  {
    id: 'c070', contractNo: 'ICR-2605-0070',
    company: '직카', manager: '윤소영',
    customerName: '강지훈', customerRegNoMasked: '890605-1******',
    customerPhone1: '010-5500-0001',
    customerRegion: '용인', customerDistrict: '수지구',
    vehiclePlate: '경기12마3456', vehicleModel: '아반떼AD', vehicleStatus: '운행',
    contractDate: '2026-05-08', deliveredDate: '2026-05-08',
    returnScheduledDate: '2026-05-22',
    termMonths: 1, longTerm: false,
    monthlyRent: 480000, deposit: 0, paymentDay: 22,
    paymentMethod: '카드',
    insuranceAge: 37, selfInsured: false, distanceLimitKm: 5000,
    status: '운행',
    currentSeq: 1, totalSeq: 1,
    unpaidAmount: 0, unpaidSeqCount: 0,
  },
  // 직카 — 반납 임박 (5/16)
  {
    id: 'c071', contractNo: 'ICR-2604-0071',
    company: '직카', manager: '윤소영',
    customerName: '서나영', customerRegNoMasked: '930828-2******',
    customerPhone1: '010-5500-0002',
    customerRegion: '수원', customerDistrict: '권선구',
    vehiclePlate: '경기34바4567', vehicleModel: 'K5', vehicleStatus: '운행',
    contractDate: '2026-04-17', deliveredDate: '2026-04-17',
    returnScheduledDate: '2026-05-16',
    termMonths: 1, longTerm: false,
    monthlyRent: 540000, deposit: 200000, paymentDay: 17,
    paymentMethod: '카드',
    insuranceAge: 31, selfInsured: false, distanceLimitKm: 3000,
    status: '운행',
    currentSeq: 1, totalSeq: 1,
    lastPaidDate: '2026-04-17', lastPaidAmount: 540000,
    unpaidAmount: 0, unpaidSeqCount: 0,
  },
  // 휴차 (자차사고) — 계약 유지중
  {
    id: 'c075', contractNo: 'ICR-2604-0075',
    company: '아이카', manager: '이수민',
    customerName: '문지영', customerRegNoMasked: '910418-2******',
    customerPhone1: '010-3300-0001',
    customerRegion: '서울', customerDistrict: '영등포구',
    vehiclePlate: '109호3019', vehicleModel: 'BMW520d', vehicleStatus: '휴차',
    contractDate: '2026-04-01', deliveredDate: '2026-04-03',
    returnScheduledDate: '2027-04-02',
    termMonths: 12, longTerm: true,
    monthlyRent: 1750000, deposit: 2000000, paymentDay: 3,
    paymentMethod: 'CMS',
    insuranceAge: 33, selfInsured: true, distanceLimitKm: 35000,
    idleSince: '2026-05-08', idleReason: '자차사고 입고',
    status: '운행',
    currentSeq: 2, totalSeq: 12,
    lastPaidDate: '2026-04-03', lastPaidAmount: 1750000,
    unpaidAmount: 1750000, unpaidSeqCount: 1,
    notes: '5/8 자차사고 입고 — 외판 수리중',
  },
  // 휴차 (정비)
  {
    id: 'c076', contractNo: 'ICR-2602-0076',
    company: '달카', manager: '최영민',
    customerName: '권태우', customerRegNoMasked: '850207-1******',
    customerPhone1: '010-3300-0002',
    customerRegion: '경기', customerDistrict: '안양시',
    vehiclePlate: '경기78사1212', vehicleModel: '쏘렌토MQ4', vehicleStatus: '휴차',
    contractDate: '2026-02-10', deliveredDate: '2026-02-12',
    returnScheduledDate: '2027-02-11',
    termMonths: 12, longTerm: true,
    monthlyRent: 880000, deposit: 1000000, paymentDay: 12,
    paymentMethod: '이체',
    insuranceAge: 41, selfInsured: false, distanceLimitKm: 30000,
    idleSince: '2026-05-10', idleUntil: '2026-05-20', idleReason: '엔진 정비',
    status: '운행',
    currentSeq: 4, totalSeq: 12,
    lastPaidDate: '2026-05-12', lastPaidAmount: 880000,
    unpaidAmount: 0, unpaidSeqCount: 0,
    notes: '엔진 정비 입고 (예상 5/20 완료)',
  },
  // 반납 완료 (단기)
  {
    id: 'c090', contractNo: 'ICR-2604-0090',
    company: '직카', manager: '윤소영',
    customerName: '안성훈', customerRegNoMasked: '870611-1******',
    customerPhone1: '010-5500-0003',
    customerRegion: '인천', customerDistrict: '계양구',
    vehiclePlate: '인천34아5678', vehicleModel: 'K3', vehicleStatus: '재고',
    contractDate: '2026-04-01', deliveredDate: '2026-04-01',
    returnScheduledDate: '2026-05-01', returnedDate: '2026-05-02',
    termMonths: 1, longTerm: false,
    monthlyRent: 450000, deposit: 100000, paymentDay: 1,
    paymentMethod: '카드',
    insuranceAge: 39, selfInsured: false, distanceLimitKm: 3000,
    status: '반납',
    currentSeq: 1, totalSeq: 1,
    lastPaidDate: '2026-04-01', lastPaidAmount: 450000,
    unpaidAmount: 0, unpaidSeqCount: 0,
  },
  // 반납 완료 (장기)
  {
    id: 'c091', contractNo: 'ICR-2504-0091',
    company: '렌트로', manager: '한지원',
    customerName: '조은혜', customerRegNoMasked: '950822-2******',
    customerPhone1: '010-7700-0003',
    customerRegion: '서울', customerDistrict: '강서구',
    vehiclePlate: '서울12카3344', vehicleModel: '투싼NX4', vehicleStatus: '재고',
    contractDate: '2025-04-15', deliveredDate: '2025-04-16',
    returnScheduledDate: '2026-04-14', returnedDate: '2026-04-30',
    termMonths: 12, longTerm: true,
    monthlyRent: 850000, deposit: 1000000, paymentDay: 16,
    paymentMethod: 'CMS',
    insuranceAge: 31, selfInsured: true, distanceLimitKm: 30000,
    status: '반납',
    currentSeq: 12, totalSeq: 12,
    lastPaidDate: '2026-04-16', lastPaidAmount: 850000,
    unpaidAmount: 0, unpaidSeqCount: 0,
  },
  // 큰 미수 — 채권 회수 대상
  {
    id: 'c080', contractNo: 'ICR-2501-0080',
    company: '아이카', manager: '장근안',
    customerName: '홍길동', customerRegNoMasked: '700101-1******',
    customerPhone1: '010-0000-0080', customerPhone2: '010-0000-0081',
    customerRegion: '서울', customerDistrict: '구로구',
    vehiclePlate: '109호9999', vehicleModel: '카니발하이리무진', vehicleStatus: '운행',
    contractDate: '2025-01-10', deliveredDate: '2025-01-12',
    returnScheduledDate: '2026-01-09', returnedDate: undefined,
    termMonths: 12, longTerm: true,
    monthlyRent: 2200000, deposit: 3000000, paymentDay: 12,
    paymentMethod: '후불',
    insuranceAge: 56, selfInsured: false, distanceLimitKm: 30000,
    status: '채권',
    currentSeq: 12, totalSeq: 12,
    lastPaidDate: '2026-01-12', lastPaidAmount: 1100000,
    unpaidAmount: 9450000, unpaidSeqCount: 4,
    notes: '회수 진행 중 — 변호사 의뢰',
  },
];

/* 출고 일정 — 미인도된 계약 */
export type DeliveryItem = {
  contractId: string;
  scheduledDate: string;
  customerName: string;
  vehiclePlate: string;
  vehicleModel: string;
  company: string;
  manager?: string;
  status: '예정' | '지연';
};

/* 반납 일정 — 진행중인 계약의 반납예정일 (30일 이내) */
export type ReturnItem = {
  contractId: string;
  scheduledDate: string;
  customerName: string;
  vehiclePlate: string;
  vehicleModel: string;
  company: string;
  manager?: string;
  status: '예정' | '지연';
};

/* 연체 — 반납지연(반납일 지났는데 반납·연장 안함) + 결제지연(미수 + 1개월 경과) */
export type OverdueItem = {
  contractId: string;
  type: '반납지연' | '결제지연';
  customerName: string;
  vehiclePlate: string;
  vehicleModel: string;
  company: string;
  manager?: string;
  referenceDate: string;   // 기준일 (반납예정일 또는 결제예정일)
  overdueDays: number;
  unpaidAmount?: number;
};

export function buildDeliveries(contracts: Contract[], today: string): DeliveryItem[] {
  const out: DeliveryItem[] = [];
  for (const c of contracts) {
    if (c.deliveryScheduledDate && !c.deliveredDate) {
      out.push({
        contractId: c.id,
        scheduledDate: c.deliveryScheduledDate,
        customerName: c.customerName,
        vehiclePlate: c.vehiclePlate,
        vehicleModel: c.vehicleModel,
        company: c.company,
        manager: c.manager,
        status: c.deliveryScheduledDate < today ? '지연' : '예정',
      });
    }
  }
  out.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  return out;
}

export function buildReturns(contracts: Contract[], today: string, withinDays = 30): ReturnItem[] {
  const out: ReturnItem[] = [];
  const horizon = addDays(today, withinDays);
  for (const c of contracts) {
    if (!c.returnScheduledDate || c.returnedDate) continue;
    if (c.status !== '운행') continue;
    if (c.returnScheduledDate > horizon) continue;
    out.push({
      contractId: c.id,
      scheduledDate: c.returnScheduledDate,
      customerName: c.customerName,
      vehiclePlate: c.vehiclePlate,
      vehicleModel: c.vehicleModel,
      company: c.company,
      manager: c.manager,
      status: c.returnScheduledDate < today ? '지연' : '예정',
    });
  }
  out.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  return out;
}

/* 휴차 현황 — vehicleStatus === '휴차' */
export type IdleItem = {
  contractId: string;
  customerName: string;
  vehiclePlate: string;
  vehicleModel: string;
  company: string;
  manager?: string;
  reason?: string;
};

export function buildIdle(contracts: Contract[]): IdleItem[] {
  return contracts
    .filter((c) => c.vehicleStatus === '휴차')
    .map((c) => ({
      contractId: c.id,
      customerName: c.customerName,
      vehiclePlate: c.vehiclePlate,
      vehicleModel: c.vehicleModel,
      company: c.company,
      manager: c.manager,
      reason: c.notes,
    }));
}

/** 연체 모음 — 반납지연 + 결제지연. overdueDays 큰 순. */
export function buildOverdue(contracts: Contract[], today: string): OverdueItem[] {
  const out: OverdueItem[] = [];
  for (const c of contracts) {
    // 반납 지연 — 반납예정일 지났는데 미반납·미연장
    if (c.returnScheduledDate && !c.returnedDate && c.status === '운행' && c.returnScheduledDate < today) {
      out.push({
        contractId: c.id, type: '반납지연',
        customerName: c.customerName, vehiclePlate: c.vehiclePlate,
        vehicleModel: c.vehicleModel, company: c.company, manager: c.manager,
        referenceDate: c.returnScheduledDate,
        overdueDays: daysBetween(c.returnScheduledDate, today),
      });
    }
    // 결제 지연 — 미수 있고 마지막 입금 + 35일 경과 (한 달 + 그레이스 5일)
    if (c.unpaidAmount > 0) {
      const refDate = c.lastPaidDate || c.contractDate;
      const expected = addDays(refDate, 35);
      if (expected < today) {
        out.push({
          contractId: c.id, type: '결제지연',
          customerName: c.customerName, vehiclePlate: c.vehiclePlate,
          vehicleModel: c.vehicleModel, company: c.company, manager: c.manager,
          referenceDate: expected,
          overdueDays: daysBetween(expected, today),
          unpaidAmount: c.unpaidAmount,
        });
      }
    }
  }
  out.sort((a, b) => b.overdueDays - a.overdueDays);
  return out;
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

function addDays(yyyymmdd: string, days: number): string {
  const d = new Date(yyyymmdd);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 최근 입금 트랜잭션 mock — 계좌 엑셀 업로드 결과 */
export const MOCK_BANK_TX: BankTransaction[] = [
  { id: 'b001', txDate: '2026-05-14', amount: 3000000, counterparty: '김효진', memo: '5월 대여료', source: 'KB', matchedContractId: 'c001' },
  { id: 'b002', txDate: '2026-05-14', amount: 2053650, counterparty: '김효진4', memo: 'CMS', source: 'KB', matchedContractId: 'c004' },
  { id: 'b003', txDate: '2026-05-13', amount: 540000, counterparty: '서나영', memo: '단기렌트', source: '우리' },           // 미매칭
  { id: 'b004', txDate: '2026-05-13', amount: 1907000, counterparty: '김효진6', memo: '월대여료', source: 'KB', matchedContractId: 'c006' },
  { id: 'b005', txDate: '2026-05-12', amount: 850000, counterparty: '미상', memo: '입금자 미상', source: '신한' },         // 미매칭
  { id: 'b006', txDate: '2026-05-12', amount: 1500000, counterparty: '정민호', memo: '5월 마지막 회차', source: 'KB', matchedContractId: 'c060' },
  { id: 'b007', txDate: '2026-05-11', amount: 300000, counterparty: '김효진3', memo: '부분입금', source: 'KB', matchedContractId: 'c003' },
  { id: 'b008', txDate: '2026-05-11', amount: 250000, counterparty: '박지영', memo: '대여료 일부', source: '농협' },        // 미매칭
  { id: 'b009', txDate: '2026-05-10', amount: 1200000, counterparty: '최영민', memo: '계약중간정산', source: 'KB' },         // 미매칭 (담당자명이 입금자로 잘못 적힘)
];

/** 미매칭 입금 트랜잭션만 추출 */
export function getUnmatchedBank(): BankTransaction[] {
  return MOCK_BANK_TX.filter((t) => !t.matchedContractId).sort((a, b) => b.txDate.localeCompare(a.txDate));
}

/** 자동이체 (CMS) 출금 결과 mock */
export type CmsTransaction = {
  id: string;
  txDate: string;
  customerName: string;
  amount: number;
  result: '성공' | '실패' | '부분';
  failReason?: string;
  cmsNo?: string;
  source?: string;
  matchedContractId?: string;
};

export const MOCK_CMS_TX: CmsTransaction[] = [
  { id: 'm001', txDate: '2026-05-01', customerName: '김효진', amount: 3000000, result: '성공', cmsNo: 'CMS-2605-001', source: 'KB', matchedContractId: 'c001' },
  { id: 'm002', txDate: '2026-05-01', customerName: '김효진4', amount: 2053650, result: '성공', cmsNo: 'CMS-2605-002', source: 'KB', matchedContractId: 'c004' },
  { id: 'm003', txDate: '2026-05-10', customerName: '김효진6', amount: 1997000, result: '부분', failReason: '한도초과 (1,907,000 출금)', cmsNo: 'CMS-2605-010', source: 'KB', matchedContractId: 'c006' },
  { id: 'm004', txDate: '2026-05-12', customerName: '김효진8', amount: 1339000, result: '실패', failReason: '잔액부족', cmsNo: 'CMS-2605-013', source: 'KB' },          // 미매칭
  { id: 'm005', txDate: '2026-05-12', customerName: '권태우', amount: 880000, result: '성공', cmsNo: 'CMS-2605-014', source: '농협', matchedContractId: 'c076' },
];

export const MOCK_CARD_TX: CardTransaction[] = [
  { id: 'k001', txDate: '2026-05-14', amount: 480000, approvalNo: '20260514001', cardLast4: '1234', customerName: '강지훈', source: 'BC', matchedContractId: 'c070' },
  { id: 'k002', txDate: '2026-05-08', amount: 540000, approvalNo: '20260508002', cardLast4: '5678', customerName: '서나영', source: '삼성', matchedContractId: 'c071' },
];

export { TODAY };
