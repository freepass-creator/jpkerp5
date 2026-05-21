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

/** 헤더 alias resolver — 다양한 컬럼명 허용 */
function get(row: Row, ...keys: string[]): unknown {
  for (const k of keys) {
    if (k in row && row[k] != null && row[k] !== '') return row[k];
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

/**
 * 법인등록번호 → 회사명 매핑. 회사 마스터의 법인번호와 매칭되면 회사명 반환,
 * 미등록이면 입력값 그대로 반환 (CompanyDialog의 "미등록 법인" 섹션에 자동 노출됨).
 * fallback: 사업자번호 → 회사명 (구버전 호환).
 */
function resolveCompanyByRegNo(regNoOrName: string, companies?: Company[]): string {
  if (!regNoOrName) return '';
  const norm = normalizeRegNo(regNoOrName);
  if (companies && companies.length > 0) {
    // 1순위: 법인등록번호
    const byCorp = companies.find((c) => c.corpRegNo && normalizeRegNo(c.corpRegNo) === norm);
    if (byCorp) return byCorp.name;
    // 2순위: 사업자등록번호 (legacy 호환)
    const byBiz = companies.find((c) => c.bizRegNo && normalizeRegNo(c.bizRegNo) === norm);
    if (byBiz) return byBiz.name;
  }
  return regNoOrName;  // 미등록 — 사용자가 입력한 값 그대로
}

export function parseSnapshotRow(row: Row, companies?: Company[]): SnapshotPatch | null {
  const plate = toStr(get(row, '차량번호', 'vehiclePlate', 'plate'));
  const customerName = toStr(get(row, '계약자', '계약자명', 'customerName'));
  const monthlyRent = toNum(get(row, '월대여료', '월렌트료', 'monthlyRent'));
  if (!plate || !customerName || monthlyRent <= 0) return null;

  const regNoOrName = toStr(get(row, '법인등록번호', '법인번호', '사업자번호', '회사명', '회사', 'corpRegNo', 'bizRegNo', 'company'));
  const company = resolveCompanyByRegNo(regNoOrName, companies);
  const vehicleModel = toStr(get(row, '차명', '차종', 'vehicleModel')) || '미정';
  const phone = toStr(get(row, '연락처', '연락처1', 'customerPhone1'));
  const period = parseContractPeriod(row);
  const deposit = toNum(get(row, '보증금', 'deposit'));
  const insuranceAge = toNum(get(row, '보험연령', 'insuranceAge')) || undefined;

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
  const paymentDay = existing?.paymentDay ?? 1;

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
      customerName: patch.customerName || existing.customerName,
      customerPhone1: patch.customerPhone1 || existing.customerPhone1,
      contractDate: patch.contractDate || existing.contractDate,
      returnScheduledDate: patch.returnScheduledDate || existing.returnScheduledDate,
      termMonths: patch.termMonths || existing.termMonths,
      deposit: patch.deposit || existing.deposit,
      monthlyRent: patch.monthlyRent || existing.monthlyRent,
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
    vehicleStatus: '운행',
    contractDate: patch.contractDate,
    returnScheduledDate: patch.returnScheduledDate || undefined,
    termMonths: patch.termMonths,
    longTerm: patch.termMonths >= 12,
    monthlyRent: patch.monthlyRent,
    deposit: patch.deposit,
    insuranceAge: patch.insuranceAge,
    paymentDay,
    paymentMethod: '이체',
    status: '운행',
    currentSeq: currentSeqFromSched,
    totalSeq: Math.max(currentSeqFromSched, patch.termMonths),
    unpaidAmount: patch.unpaidAmount,
    unpaidSeqCount: patch.unpaidSeqCount,
    schedules: distributed,
  };
}

/* ──────────────── 은행 입금 ──────────────── */

export function parseBankTxRow(row: Row, fileName: string): Omit<BankTransaction, 'id'> | null {
  const txDate = toDate(get(row, '거래일자', '거래일', '입금일', 'txDate'));
  const counterparty = toStr(get(row, '입금자', '상대', '예금주', 'counterparty'));
  const amount = toNum(get(row, '입금액', '금액', 'amount'));
  if (!txDate || amount <= 0 || !counterparty) return null;

  return {
    txDate,
    amount,
    counterparty,
    memo: toStr(get(row, '적요', '메모', 'memo')) || undefined,
    source: toStr(get(row, '은행', 'source')) || fileName,
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
