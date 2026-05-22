// 엑셀 한 행 → DB 레코드 변환 + 자동 매칭 헬퍼

import type {
  Contract, Vehicle, CompanyCode, VehicleStatus, BankTransaction, CardTransaction, Company,
} from './types';
import { normalizeKoreanDate } from './parsers/date';
import { normalizeIdent, inferKind, formatIdent, type CustomerKind } from './ident';
import { generateSchedules, distributeUnpaid, computeCurrentSeq as computeCurrentSeqFromSchedules } from './payment-schedule';
import { todayKr } from './mock-data';

type Row = Record<string, unknown>;

/* ──────────────── 공통 유틸 ──────────────── */

const COMPANIES: CompanyCode[] = ['아이카', '달카', '렌트로', '직카', '기타'];

function toStr(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function toNum(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const cleaned = String(v).replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toDate(v: unknown): string {
  // 위임 — lib/parsers/date.ts 의 normalizeKoreanDate가 모든 포맷 처리:
  // yyyy-mm-dd / yy-mm-dd / yyyymmdd / yymmdd / yyyy.mm.dd / yyyy/mm/dd / 한글 / 엑셀 직렬
  if (v == null || v === '') return '';
  if (v instanceof Date) return normalizeKoreanDate(v);
  if (typeof v === 'number') return normalizeKoreanDate(v);
  return normalizeKoreanDate(String(v));
}

function pickCompany(v: unknown): CompanyCode {
  const s = toStr(v);
  for (const c of COMPANIES) if (s.includes(c)) return c;
  return '아이카';
}

function pickCustomerKind(v: unknown): CustomerKind | undefined {
  const s = toStr(v);
  if (!s) return undefined;
  if (s.includes('법인')) return '법인';
  if (s.includes('사업자') || s.includes('개인사업')) return '사업자';
  if (s.includes('개인')) return '개인';
  return undefined;
}

function pickVehicleStatus(v: unknown, hasDelivered: boolean): VehicleStatus {
  const s = toStr(v);
  const ALL: VehicleStatus[] = [
    '구매대기', '등록대기', '상품화대기', '상품화중', '상품대기', '운행',
    '휴차대기', '매각대기', '매각', '인도대기', '출고대기', '재고', '반납', '휴차', '임시배차', '정비', '사고',
  ];
  for (const x of ALL) if (s === x) return x;
  return hasDelivered ? '운행' : '구매대기';
}

/** 헤더 키 정규화 — 공백/별표/대소문자/괄호 등 무시 */
function normKey(s: string): string {
  return s.replace(/\s+/g, '').replace(/\*/g, '').replace(/[()]/g, '').toLowerCase();
}

/** 헤더 alias resolver — 다양한 컬럼명 허용 + fuzzy 매칭 (별표·공백·대소문자 무관) */
function get(row: Row, ...keys: string[]): unknown {
  // 1차: 정확 매칭
  for (const k of keys) {
    if (k in row && row[k] != null && row[k] !== '') return row[k];
  }
  // 2차: 정규화 매칭 (예: "차량번호" ↔ "차량번호 *" ↔ "차량 번호")
  const targets = new Set(keys.map(normKey));
  for (const [rowKey, rowVal] of Object.entries(row)) {
    if (rowVal == null || rowVal === '') continue;
    if (targets.has(normKey(rowKey))) return rowVal;
  }
  return undefined;
}

/* ──────────────── 차량 (자산) ──────────────── */

export function parseVehicleRow(row: Row): Omit<Vehicle, 'id'> | null {
  const plate = toStr(get(row, '차량번호', 'plate', '번호'));
  const model = toStr(get(row, '차종', '차명', 'model'));
  if (!plate && !model) return null;
  return {
    plate: plate || '미정',
    model: model || '미정',
    company: pickCompany(get(row, '회사', '법인', 'company')),
    status: pickVehicleStatus(get(row, '차량상태', 'status'), false),
    purchasedDate: toDate(get(row, '매입일', 'purchasedDate')) || undefined,
    registeredDate: toDate(get(row, '등록일', 'registeredDate')) || undefined,
    readiedDate: toDate(get(row, '상품화일', 'readiedDate')) || undefined,
    notes: toStr(get(row, '비고', 'notes')) || undefined,
    createdAt: new Date().toISOString(),
  };
}

/* ──────────────── 계약 ──────────────── */

export function parseContractRow(row: Row): Omit<Contract, 'id'> | null {
  const customerName = toStr(get(row, '계약자명', '계약자', '고객명', 'customerName'));
  const contractDate = toDate(get(row, '계약일', 'contractDate'));
  const monthlyRent = toNum(get(row, '월대여료', '월렌트료', '월 대여료', 'monthlyRent'));
  if (!customerName || !contractDate || monthlyRent <= 0) return null;

  const plate = toStr(get(row, '차량번호', 'vehiclePlate')) || '미정';
  const model = toStr(get(row, '차종', '차명', 'vehicleModel')) || '미정';
  const company = pickCompany(get(row, '회사', '법인', 'company'));
  const phone1 = toStr(get(row, '연락처', '연락처1', 'customerPhone1'));
  const returnScheduled = toDate(get(row, '반납예정일', '반납예정', 'returnScheduledDate'));
  const deliveredDate = toDate(get(row, '인도일', '출고일', 'deliveredDate'));
  const paymentDay = Math.min(31, Math.max(1, toNum(get(row, '결제일', 'paymentDay')) || 1));
  const deposit = toNum(get(row, '보증금', 'deposit'));
  const paymentMethod = toStr(get(row, '결제방법', 'paymentMethod')) || '이체';

  // termMonths 자동 계산
  let termMonths = toNum(get(row, '약정개월', '약정', 'termMonths'));
  if (!termMonths && returnScheduled) {
    const d1 = new Date(contractDate);
    const d2 = new Date(returnScheduled);
    termMonths = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24 * 30)));
  }
  if (!termMonths) termMonths = 12;

  const longTermRaw = toStr(get(row, '장단기', 'longTerm'));
  const longTerm = longTermRaw ? longTermRaw.includes('장기') : termMonths >= 12;

  // 등록번호 — 주민/사업자/법인 어느 거든 들어올 수 있음. 자릿수로 자동 추정.
  const identRaw = toStr(get(row, '등록번호', '주민번호', '사업자번호', '법인번호', 'customerRegNo', 'customerIdentNo'));
  const kindHint = pickCustomerKind(get(row, '구분', '계약자구분', 'customerKind'));
  const identDigits = normalizeIdent(identRaw);
  const customerKind = inferKind(identDigits, kindHint);
  const regNoMasked = identDigits ? formatIdent(identDigits, customerKind, { mask: true }) : undefined;

  const yy = contractDate.slice(2, 4);
  const mm = contractDate.slice(5, 7);
  const seqHash = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  const contractNo = `ICR-${yy}${mm}-${seqHash}`;

  const licenseNoRaw = toStr(get(row, '면허번호', 'customerLicenseNo', 'licenseNo'));
  const licenseTypeRaw = toStr(get(row, '면허종별', 'customerLicenseType', 'licenseType'));
  const driverNameRaw = toStr(get(row, '주운전자', 'driverName'));

  return {
    contractNo,
    company,
    manager: toStr(get(row, '담당자', 'manager')) || undefined,
    customerName,
    customerKind,
    customerIdentNo: identDigits || undefined,
    customerRegNoMasked: regNoMasked,
    customerLicenseNo: licenseNoRaw || undefined,
    customerLicenseType: licenseTypeRaw || undefined,
    driverName: driverNameRaw || undefined,
    customerPhone1: phone1,
    customerPhone2: toStr(get(row, '연락처2', 'customerPhone2')) || undefined,
    customerRegion: toStr(get(row, '지역', 'customerRegion')) || undefined,
    customerDistrict: toStr(get(row, '행정구', 'customerDistrict')) || undefined,
    vehiclePlate: plate,
    vehicleModel: model,
    vehicleStatus: pickVehicleStatus(get(row, '차량상태'), !!deliveredDate),
    contractDate,
    deliveredDate: deliveredDate || undefined,
    returnScheduledDate: returnScheduled || undefined,
    termMonths,
    longTerm,
    monthlyRent,
    deposit,
    paymentDay,
    paymentMethod,
    insuranceAge: toNum(get(row, '보험연령', 'insuranceAge')) || undefined,
    selfInsured: toStr(get(row, '자차여부', 'selfInsured')).includes('가입') || undefined,
    distanceLimitKm: toNum(get(row, '거리한도Km', '거리한도', 'distanceLimitKm')) || undefined,
    status: deliveredDate ? '운행' : '대기',
    notes: toStr(get(row, '비고', 'notes')) || undefined,
    currentSeq: 1,
    totalSeq: termMonths,
    unpaidAmount: 0,      // 초기값 — 수납 매칭 시 갱신
    unpaidSeqCount: 0,
  };
}

/* ──────────────── 현황 스냅샷 ──────────────── */

/**
 * 스냅샷 행 파싱 결과 — upsert 키는 차량번호.
 * 기존 contract 있으면 patch, 없으면 신규 생성.
 */
export type SnapshotPatch = {
  vehiclePlate: string;
  company: string;
  vehicleModel: string;
  customerName: string;
  customerPhone1: string;
  contractDate: string;
  returnScheduledDate: string;
  termMonths: number;
  deposit: number;
  monthlyRent: number;
  paymentDay: number;
  paymentMethod: string;
  vehicleStatus: VehicleStatus;
  insuranceAge?: number;
  currentSeq: number;
  unpaidAmount: number;
  unpaidSeqCount: number;
};

/** 계약시작일/계약종료일 셀 파싱 — 별도 두 셀. legacy "계약기간" 단일 셀도 fallback 처리. */
function parseContractPeriod(row: Row): { start: string; end: string; months: number } {
  let start = toDate(get(row, '계약시작일', '시작일', 'contractDate', 'startDate'));
  let end = toDate(get(row, '계약종료일', '종료일', 'returnScheduledDate', 'endDate'));

  // legacy "계약기간" 단일 셀 — "2026-01-01 ~ 2026-12-31"
  if (!start || !end) {
    const periodStr = toStr(get(row, '계약기간', 'contractPeriod', 'period'));
    if (periodStr) {
      const parts = periodStr.split(/\s*[~→]|(?<=\d)\s*-\s*(?=\d{4})|\s+to\s+/i)
        .map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        if (!start) start = toDate(parts[0]);
        if (!end) end = toDate(parts[1]);
      }
    }
  }

  if (!start) start = new Date().toISOString().slice(0, 10);

  let months = 12;
  if (start && end) {
    const d1 = new Date(start);
    const d2 = new Date(end);
    months = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24 * 30)));
  }
  return { start, end, months };
}

/** 계약시작일 → 오늘 기준 현재 회차 (1-indexed, termMonths로 clamp) */
function computeCurrentSeq(contractDate: string, termMonths: number): number {
  if (!contractDate) return 1;
  const start = new Date(contractDate);
  const today = new Date();
  const months = (today.getFullYear() - start.getFullYear()) * 12
    + (today.getMonth() - start.getMonth()) + 1;
  return Math.max(1, Math.min(termMonths, months));
}

/** 등록번호 정규화 — 하이픈/공백 제거 */
function normalizeRegNo(s: string): string {
  return s.replace(/[-\s]/g, '');
}

/** 회사명에서 법인 표기 제거 — "(주) 회사명" / "주식회사 회사명" / "회사명(주)" / "회사명 주식회사" → "회사명" */
function stripCorpPrefix(name: string): string {
  if (!name) return name;
  return name
    .replace(/\(주\)/g, ' ')
    .replace(/주식회사/g, ' ')
    .replace(/유한회사/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 법인등록번호 → 회사명 매핑. 회사 마스터의 법인번호와 매칭되면 회사명 반환 ((주)/주식회사 제거),
 * 미등록이면 입력값 그대로 반환 (CompanyDialog의 "미등록 법인" 섹션에 자동 노출됨).
 * fallback: 사업자번호 → 회사명 (구버전 호환).
 */
function resolveCompanyByRegNo(regNoOrName: string, companies?: Company[]): string {
  if (!regNoOrName) return '';
  const norm = normalizeRegNo(regNoOrName);
  if (companies && companies.length > 0) {
    // 1순위: 법인등록번호
    const byCorp = companies.find((c) => c.corpRegNo && normalizeRegNo(c.corpRegNo) === norm);
    if (byCorp) return stripCorpPrefix(byCorp.name);
    // 2순위: 사업자등록번호 (legacy 호환)
    const byBiz = companies.find((c) => c.bizRegNo && normalizeRegNo(c.bizRegNo) === norm);
    if (byBiz) return stripCorpPrefix(byBiz.name);
  }
  return regNoOrName;  // 미등록 — 사용자가 입력한 값 그대로
}

/**
 * 검증 결과 — 행 종류 3종 분류:
 *  - 'contract'    : 계약(임차 중) — plate + customerName + monthlyRent 모두 있음. contract UPSERT.
 *  - 'vehicle-only': 휴차(임차인 없음) — plate 만 있고 customerName 또는 monthlyRent 없음. vehicle 만 등록.
 *  - 'invalid'     : plate 마저 없으면 무시.
 *
 * 에러 사유 보존 → UI 에서 행별 표시.
 */
export type SnapshotKind = 'contract' | 'vehicle-only' | 'invalid';

export type SnapshotValidation = {
  kind: SnapshotKind;
  valid: boolean;
  patch?: SnapshotPatch;
  /** vehicle-only 일 때 — 휴차 차량 정보 */
  vehiclePatch?: { plate: string; model: string; company: string; vehicleStatus: VehicleStatus };
  errors: string[];
  raw: { plate: string; customer: string; monthlyRent: number; unpaid: number };
};

export function validateSnapshotRow(row: Row, companies?: Company[]): SnapshotValidation {
  const errors: string[] = [];
  const plate = toStr(get(row, '차량번호', 'vehiclePlate', 'plate'));
  const customerName = toStr(get(row, '계약자', '계약자명', 'customerName'));
  const monthlyRent = toNum(get(row, '월대여료', '월렌트료', 'monthlyRent'));
  const unpaidAmount = toNum(get(row, '현재미수', '미수금', 'unpaidAmount'));
  const raw = { plate, customer: customerName, monthlyRent, unpaid: unpaidAmount };

  // 차량번호도, 계약자도 없으면 진짜 빈 행 → 무시
  if (!plate && !customerName) {
    errors.push('차량번호·계약자 모두 누락');
    return { kind: 'invalid', valid: false, errors, raw };
  }

  // 차량번호 없고 계약자만 있음 → 차량 미정 계약 (구매대기)
  if (!plate && customerName) {
    if (monthlyRent <= 0) {
      errors.push('월대여료 누락 → 차량없는 계약 등록 불가');
      return { kind: 'invalid', valid: false, errors, raw };
    }
    const patch = parseSnapshotRow({ ...row, 차량번호: '미정' }, companies);
    if (!patch) {
      errors.push('파싱 실패');
      return { kind: 'invalid', valid: false, errors, raw };
    }
    patch.vehiclePlate = '미정';
    patch.vehicleStatus = '구매대기';
    errors.push('차량 미정 → 구매대기');
    return { kind: 'contract', valid: true, patch, errors, raw };
  }

  // 계약자 없거나 월대여료 0 → 휴차 차량 (vehicle-only)
  if (!customerName || monthlyRent <= 0) {
    const regNoOrName = toStr(get(row, '법인등록번호', '법인번호', '사업자번호', '회사명', '회사', 'corpRegNo', 'bizRegNo', 'company'));
    const company = resolveCompanyByRegNo(regNoOrName, companies) || '기타';
    const model = toStr(get(row, '차명', '차종', 'vehicleModel')) || '미정';
    const vehicleStatusRaw = toStr(get(row, '차량상태', '상태', 'vehicleStatus'));
    const vehicleStatus = pickVehicleStatus(vehicleStatusRaw, false);  // default 구매대기
    if (!customerName) errors.push(`계약자 없음 → ${vehicleStatus} 등록`);
    if (monthlyRent <= 0 && customerName) errors.push(`월대여료 0 → ${vehicleStatus} 등록`);
    return {
      kind: 'vehicle-only',
      valid: true,
      vehiclePatch: { plate, model, company, vehicleStatus },
      errors,
      raw,
    };
  }

  const patch = parseSnapshotRow(row, companies);
  if (!patch) {
    errors.push('파싱 실패');
    return { kind: 'invalid', valid: false, errors, raw };
  }
  return { kind: 'contract', valid: true, patch, errors: [], raw };
}

export function parseSnapshotRow(row: Row, companies?: Company[]): SnapshotPatch | null {
  const plate = toStr(get(row, '차량번호', '차량 번호', '차량NO', '차량No', '차량', '번호판', 'vehiclePlate', 'plate'));
  const customerName = toStr(get(row, '계약자', '계약자명', '임차인', '임차인명', '고객명', '고객', '대여자', '운전자', 'customerName'));
  const monthlyRent = toNum(get(row, '월대여료', '월 대여료', '월렌트료', '월렌트', '월세', '월 임차료', '임차료', '대여료', 'monthlyRent'));
  if (!plate || !customerName || monthlyRent <= 0) return null;

  const regNoOrName = toStr(get(row, '법인등록번호', '법인번호', '사업자번호', '회사명', '회사', 'corpRegNo', 'bizRegNo', 'company'));
  const company = resolveCompanyByRegNo(regNoOrName, companies);
  const vehicleModel = toStr(get(row, '차명', '차종', 'vehicleModel')) || '미정';
  const phone = toStr(get(row, '연락처', '연락처1', 'customerPhone1'));
  const period = parseContractPeriod(row);
  const deposit = toNum(get(row, '보증금', 'deposit'));
  const insuranceAge = toNum(get(row, '보험연령', 'insuranceAge')) || undefined;
  const paymentDayRaw = toNum(get(row, '결제일', '납기일', 'paymentDay'));
  const paymentDay = (paymentDayRaw >= 1 && paymentDayRaw <= 31)
    ? Math.floor(paymentDayRaw)
    : (period.start ? parseInt(period.start.slice(8, 10), 10) || 1 : 1);
  const paymentMethod = toStr(get(row, '결제방법', '결제수단', 'paymentMethod')) || '이체';
  // 손님 있는 계약 행은 차량상태 컬럼 무시 — 항상 '운행'
  const vehicleStatus: VehicleStatus = '운행';

  // 계약회차는 자동 계산 (계약시작일 ~ 오늘)
  const currentSeq = computeCurrentSeq(period.start, period.months);
  const unpaidAmount = toNum(get(row, '현재미수', '미수금', 'unpaidAmount'));
  const unpaidSeqCount = unpaidAmount > 0 && monthlyRent > 0
    ? Math.ceil(unpaidAmount / monthlyRent)
    : 0;

  return {
    vehiclePlate: plate,
    company,
    vehicleModel,
    customerName,
    customerPhone1: phone,
    contractDate: period.start,
    returnScheduledDate: period.end,
    termMonths: period.months,
    deposit,
    monthlyRent,
    paymentDay,
    paymentMethod,
    vehicleStatus,
    insuranceAge,
    currentSeq,
    unpaidAmount,
    unpaidSeqCount,
  };
}

/** 스냅샷 patch를 기존 Contract 위에 덮어 — 신규는 새 Contract 생성. 회차 스케줄도 자동 생성. */
export function applySnapshotToContract(
  existing: Contract | undefined,
  patch: SnapshotPatch,
): Contract | Omit<Contract, 'id'> {
  const today = todayKr();
  // 우선순위: patch.paymentDay (엑셀의 결제일 컬럼) > 기존 계약의 paymentDay > 1
  const paymentDay = patch.paymentDay || existing?.paymentDay || 1;

  // 회차 N개 생성 + 미수 자동 분배 (직전 회차부터 역순)
  const baseSchedules = generateSchedules({
    contractDate: patch.contractDate,
    termMonths: patch.termMonths,
    monthlyRent: patch.monthlyRent,
    paymentDay,
  });
  const distributed = distributeUnpaid(baseSchedules, patch.unpaidAmount, today);
  const currentSeqFromSched = computeCurrentSeqFromSchedules(distributed, today);

  if (existing) {
    return {
      ...existing,
      company: (patch.company || existing.company) as Contract['company'],
      vehiclePlate: patch.vehiclePlate,
      vehicleModel: patch.vehicleModel || existing.vehicleModel,
      vehicleStatus: patch.vehicleStatus || existing.vehicleStatus,
      customerName: patch.customerName || existing.customerName,
      customerPhone1: patch.customerPhone1 || existing.customerPhone1,
      contractDate: patch.contractDate || existing.contractDate,
      returnScheduledDate: patch.returnScheduledDate || existing.returnScheduledDate,
      termMonths: patch.termMonths || existing.termMonths,
      deposit: patch.deposit || existing.deposit,
      monthlyRent: patch.monthlyRent || existing.monthlyRent,
      paymentDay,
      paymentMethod: patch.paymentMethod || existing.paymentMethod,
      insuranceAge: patch.insuranceAge ?? existing.insuranceAge,
      currentSeq: currentSeqFromSched,
      totalSeq: Math.max(currentSeqFromSched, patch.termMonths),
      unpaidAmount: patch.unpaidAmount,
      unpaidSeqCount: patch.unpaidSeqCount,
      schedules: distributed,
    };
  }

  // 신규
  const yy = patch.contractDate.slice(2, 4);
  const mm = patch.contractDate.slice(5, 7);
  const seqHash = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return {
    contractNo: `ICR-${yy}${mm}-${seqHash}`,
    company: (patch.company || '기타') as Contract['company'],
    customerName: patch.customerName,
    customerPhone1: patch.customerPhone1,
    vehiclePlate: patch.vehiclePlate,
    vehicleModel: patch.vehicleModel,
    vehicleStatus: patch.vehicleStatus || '운행',
    contractDate: patch.contractDate,
    returnScheduledDate: patch.returnScheduledDate || undefined,
    termMonths: patch.termMonths,
    longTerm: patch.termMonths >= 12,
    monthlyRent: patch.monthlyRent,
    deposit: patch.deposit,
    insuranceAge: patch.insuranceAge,
    paymentDay,
    paymentMethod: patch.paymentMethod || '이체',
    status: '운행',
    currentSeq: currentSeqFromSched,
    totalSeq: Math.max(currentSeqFromSched, patch.termMonths),
    unpaidAmount: patch.unpaidAmount,
    unpaidSeqCount: patch.unpaidSeqCount,
    schedules: distributed,
  };
}

/* ──────────────── 은행 거래 (입금 + 출금) ──────────────── */

/**
 * 적요 / 거래내용 → method 자동 분류 (자금일보 ledger method 호환).
 * 키워드 기반 — 대소문자/공백 무시.
 */
function deriveBankMethod(summary: string, memo: string): string | undefined {
  const t = (summary + ' ' + memo).toUpperCase();
  if (!t.trim()) return undefined;
  if (t.includes('CMS') || t.includes('자동이체') || t.includes('자동') && t.includes('이체')) return '자동이체';
  if (t.includes('카드') || t.includes('VISA') || t.includes('마스터') || t.includes('JCB') || t.includes('BC')) return '카드';
  if (t.includes('ATM') || t.includes('무통장')) return '무통장';
  if (t.includes('현금')) return '현금';
  if (t.includes('이체') || t.includes('송금') || t.includes('타행') || t.includes('당행')) return '인터넷뱅킹';
  return undefined;
}

/**
 * 은행 통장 엑셀 한 행 파싱 — 입금·출금 모두 수용 (자금일보).
 * 한 줄에 입금/출금 둘 다 0이면 null (헤더 등 잡음).
 *
 * 대응 은행: KB·우리·신한·하나·농협·IBK·SC제일·카카오뱅크·토스뱅크·케이뱅크·새마을금고·우체국 등.
 * 컬럼명이 달라도 fuzzy alias 매칭으로 흡수.
 */
export function parseBankTxRow(row: Row, fileName: string, bankHint?: string): Omit<BankTransaction, 'id'> | null {
  const txDate = toDate(get(row,
    '거래일자', '거래일', '거래일시', '거래시각', '거래시간',
    '입금일', '출금일', '일자', '발생일', '발생일자', '처리일',
    'txDate', 'date',
  ));

  // 입출금 — 양수/음수 모두 처리. 일부 은행은 '금액' 단일 컬럼에 +/-로 표기.
  const deposit = toNum(get(row, '입금액', '입금', '받은금액', '받은액', '입금금액', '예입액', 'deposit', 'credit'));
  const withdraw = toNum(get(row, '출금액', '출금', '지급액', '인출액', '낸돈', '출금금액', 'withdraw', 'debit'));
  const amountSingle = toNum(get(row, '거래금액', '금액', '거래액', 'amount'));
  if (!txDate) return null;
  const useSingle = deposit <= 0 && withdraw <= 0 && Math.abs(amountSingle) > 0;
  const finalDeposit = useSingle ? (amountSingle > 0 ? amountSingle : 0) : deposit;
  const finalWithdraw = useSingle ? (amountSingle < 0 ? -amountSingle : 0) : withdraw;
  if (finalDeposit <= 0 && finalWithdraw <= 0) return null;

  // 거래상대 — 14가지 alias + memo fallback
  const counterparty = toStr(get(row,
    '입금자', '입금자명', '거래상대', '상대', '상대방',
    '예금주', '수취인', '받는분', '받는사람',
    '송금인', '보낸이', '보내는분', '의뢰인', '의뢰자',
    '상대계좌', '상대은행',
    'counterparty', 'name',
  ));

  // 적요 (BZ뱅크·CMS 등 결제 채널) — method 파생용
  const summary = toStr(get(row, '적요', '거래종류', '구분', 'summary'));
  // 내용·메모 (거래 메모) — fallback chain
  const memo = toStr(get(row,
    '내용', '거래내용', '거래메모', '메모', '용도', '비고',
    'memo', 'description', 'note',
  ));

  const balance = toNum(get(row, '잔액', '잔고', '거래후잔액', '거래후잔고', 'balance'));

  // counterparty 없으면 memo→summary로 fallback (signature dedup 호환)
  const cpFinal = counterparty || memo || summary || (finalWithdraw > 0 ? '(출금)' : '(미상)');
  const method = deriveBankMethod(summary, memo);

  return {
    txDate,
    amount: finalDeposit > 0 ? finalDeposit : 0,
    withdraw: finalWithdraw > 0 ? finalWithdraw : undefined,
    balance: balance > 0 ? balance : undefined,
    counterparty: cpFinal,
    memo: memo || summary || undefined,
    source: toStr(get(row, '은행', '거래은행', '은행명', 'source')) || bankHint || fileName,
    account: toStr(get(row, '계좌번호', '계좌', '나의계좌', '본인계좌', 'account')) || undefined,
    companyCode: toStr(get(row, '회사', '회사코드', 'companyCode')) || undefined,
    method,
    raw: row,
  };
}

/* ──────────────── 카드 매출 ──────────────── */

export function parseCardTxRow(row: Row, fileName: string): Omit<CardTransaction, 'id'> | null {
  const txDate = toDate(get(row, '승인일', '거래일', 'txDate'));
  const approvalNo = toStr(get(row, '승인번호', 'approvalNo'));
  const amount = toNum(get(row, '금액', '매입금액', 'amount'));
  if (!txDate || amount <= 0 || !approvalNo) return null;

  const cardRaw = toStr(get(row, '카드번호', 'cardLast4'));
  const last4 = (cardRaw.match(/\d{4}\s*$/) ?? [''])[0].trim() || undefined;

  return {
    txDate,
    amount,
    approvalNo,
    cardLast4: last4,
    customerName: toStr(get(row, '고객명', 'customerName')) || undefined,
    source: toStr(get(row, '카드사', 'source')) || fileName,
    raw: row,
  };
}

/* ──────────────── 수납 자동매칭 ──────────────── */

export type MatchResult = {
  txId: string;
  amount: number;
  contractId: string | null;
  customerName: string;
  reason: '이름+금액' | '이름only' | '미매칭';
};

/**
 * 트랜잭션 → 계약 매칭.
 * 우선순위:
 *   1) counterparty == customerName AND amount ≈ monthlyRent(±10%)
 *   2) counterparty == customerName
 *   3) 미매칭
 */
export function matchTransactions(
  txs: Array<{ id: string; amount: number; counterparty: string }>,
  contracts: Contract[]
): MatchResult[] {
  // 이름 색인 — O(N) 매칭
  const byName = new Map<string, Contract[]>();
  for (const c of contracts) {
    const k = c.customerName.trim();
    if (!k) continue;
    const arr = byName.get(k) || [];
    arr.push(c);
    byName.set(k, arr);
  }

  return txs.map((tx) => {
    const candidates = byName.get(tx.counterparty.trim()) || [];
    if (candidates.length === 0) {
      return { txId: tx.id, amount: tx.amount, contractId: null, customerName: tx.counterparty, reason: '미매칭' };
    }
    // 금액 일치 우선
    const exact = candidates.find((c) => {
      const diff = Math.abs(c.monthlyRent - tx.amount) / Math.max(1, c.monthlyRent);
      return diff <= 0.1;
    });
    if (exact) {
      return { txId: tx.id, amount: tx.amount, contractId: exact.id, customerName: tx.counterparty, reason: '이름+금액' };
    }
    // 이름만
    return { txId: tx.id, amount: tx.amount, contractId: candidates[0].id, customerName: tx.counterparty, reason: '이름only' };
  });
}

/**
 * 매칭 결과를 contract 캐시 필드에 반영 — Contract patch 리스트 반환.
 * 동일 contract에 여러 입금이 매칭되면 합산.
 */
export function applyPaymentsToContracts(
  contracts: Contract[],
  matches: MatchResult[]
): Contract[] {
  const byContract = new Map<string, MatchResult[]>();
  for (const m of matches) {
    if (!m.contractId) continue;
    const arr = byContract.get(m.contractId) || [];
    arr.push(m);
    byContract.set(m.contractId, arr);
  }

  const out: Contract[] = [];
  for (const [contractId, ms] of byContract) {
    const c = contracts.find((x) => x.id === contractId);
    if (!c) continue;
    const totalPaid = ms.reduce((s, m) => s + m.amount, 0);
    const lastM = ms[ms.length - 1];

    // 미수 차감
    const newUnpaid = Math.max(0, c.unpaidAmount - totalPaid);
    // 회차 진행 — totalPaid가 월대여료 N배 이상이면 N회차 advance
    const advancedSeq = Math.floor(totalPaid / Math.max(1, c.monthlyRent));
    const newCurrentSeq = Math.min(c.totalSeq, c.currentSeq + advancedSeq);
    const newSeqCount = newUnpaid === 0 ? 0 : Math.max(0, c.unpaidSeqCount - advancedSeq);

    out.push({
      ...c,
      unpaidAmount: newUnpaid,
      unpaidSeqCount: newSeqCount,
      currentSeq: newCurrentSeq,
      lastPaidAmount: lastM.amount,
      lastPaidDate: new Date().toISOString().slice(0, 10),
    });
  }
  return out;
}
