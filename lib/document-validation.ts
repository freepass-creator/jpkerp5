/**
 * 서류 검증 — OCR 로 추출된 서류 데이터 vs 계약 데이터 비교.
 *
 * 사용 흐름:
 *   1) 사용자가 계약 상세에서 등록증/보험증권/할부스케줄 업로드
 *   2) OCR (또는 수동 입력) 으로 핵심 값 추출
 *   3) validateDocument() 로 contract 와 비교 → 불일치 리스트 반환
 *   4) UI 에 빨간색으로 mismatch 표시
 */

import type { Contract } from './types';

export type DocumentKind =
  | '자동차등록증'
  | '보험증권'
  | '할부스케줄'
  | '계약서'
  | '기타';

/** 추출된 서류 필드 — 모든 필드 optional (서류마다 다른 항목 가짐) */
export type DocumentData = {
  // 자동차등록증
  vehiclePlate?: string;      // 차량번호
  vehicleModel?: string;      // 차명
  vehicleVin?: string;        // 차대번호
  vehicleYear?: string;       // 연식
  vehicleOwner?: string;      // 소유자
  vehicleOwnerRegNo?: string; // 소유자 법인번호

  // 보험증권
  insurer?: string;           // 보험사
  insuredName?: string;       // 피보험자
  insuranceStart?: string;    // 보험시작일
  insuranceEnd?: string;      // 보험종료일
  insuranceAge?: number;      // 운전자 연령제한 (만 N세)
  insuranceDriverScope?: string; // 누구나/지정1인/지정복수

  // 할부스케줄
  installmentTotal?: number;  // 할부 총액
  installmentMonths?: number; // 회차 수
  installmentMonthly?: number;// 월 할부금
  installmentStart?: string;  // 시작일

  // 손님 (계약서 / 신분증)
  customerBirth?: string;     // YYYY-MM-DD
};

export type ValidationLevel = 'error' | 'warn' | 'info';

export type ValidationIssue = {
  field: string;              // contract field 명 (예: 'vehiclePlate')
  label: string;              // UI 표시명
  level: ValidationLevel;
  contractValue: string;
  documentValue: string;
  message: string;
};

/** 등록번호 정규화 (하이픈/공백 제거) */
function norm(s?: string): string {
  return (s ?? '').replace(/[-\s]/g, '').trim();
}

/** 문자열 비교 (대소문자·공백 무시) */
function eq(a?: string, b?: string): boolean {
  return norm(a).toLowerCase() === norm(b).toLowerCase();
}

/**
 * 서류 데이터 vs 계약 비교 — 불일치 issue 리스트 반환.
 * doc 의 각 필드 중 contract 와 다른 것을 찾아 표시.
 */
export function validateDocument(
  doc: DocumentData,
  contract: Contract,
  kind: DocumentKind,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // ── 공통: 차량번호 ──
  if (doc.vehiclePlate && contract.vehiclePlate && !eq(doc.vehiclePlate, contract.vehiclePlate)) {
    issues.push({
      field: 'vehiclePlate', label: '차량번호',
      level: 'error',
      contractValue: contract.vehiclePlate,
      documentValue: doc.vehiclePlate,
      message: `계약(${contract.vehiclePlate}) ≠ 서류(${doc.vehiclePlate})`,
    });
  }

  // ── 공통: 차명 ──
  if (doc.vehicleModel && contract.vehicleModel && !eq(doc.vehicleModel, contract.vehicleModel)) {
    issues.push({
      field: 'vehicleModel', label: '차명',
      level: 'warn',
      contractValue: contract.vehicleModel,
      documentValue: doc.vehicleModel,
      message: '차명 표기 차이',
    });
  }

  // ── 자동차등록증 전용 ──
  if (kind === '자동차등록증') {
    // 소유자 = 회사명 (법인 차량인 경우)
    if (doc.vehicleOwner && contract.company && !eq(doc.vehicleOwner, contract.company)) {
      issues.push({
        field: 'company', label: '소유자(회사)',
        level: 'warn',
        contractValue: contract.company,
        documentValue: doc.vehicleOwner,
        message: '계약의 회사와 등록증 소유자가 다름',
      });
    }
  }

  // ── 보험증권 전용 ──
  if (kind === '보험증권') {
    // 피보험자 = 회사명
    if (doc.insuredName && contract.company && !eq(doc.insuredName, contract.company)) {
      issues.push({
        field: 'company', label: '피보험자',
        level: 'warn',
        contractValue: contract.company,
        documentValue: doc.insuredName,
        message: '계약의 회사와 보험 피보험자가 다름',
      });
    }
    // 연령 제한 (보험증권 vs 계약상의 보험연령 셋팅)
    if (doc.insuranceAge != null && contract.insuranceAge != null
        && doc.insuranceAge !== contract.insuranceAge) {
      issues.push({
        field: 'insuranceAge', label: '보험연령',
        level: 'error',
        contractValue: `만 ${contract.insuranceAge}세`,
        documentValue: `만 ${doc.insuranceAge}세`,
        message: `보험 연령제한 불일치 — 계약은 ${contract.insuranceAge}세, 증권은 ${doc.insuranceAge}세`,
      });
    }
    // ★ 고객 연령 < 보험 운전자 연령제한 → 운전 불가 (치명적 오류)
    const customerBirth = doc.customerBirth ?? contractCustomerBirthFromMasked(contract);
    if (customerBirth && doc.insuranceAge != null) {
      const customerAge = ageFromBirthYYYYMMDD(customerBirth, contract.contractDate || todayISO());
      if (customerAge < doc.insuranceAge) {
        issues.push({
          field: 'insuranceAge', label: '운전자 연령',
          level: 'error',
          contractValue: `손님 만 ${customerAge}세 (${customerBirth})`,
          documentValue: `보험 만 ${doc.insuranceAge}세 이상`,
          message: `손님(${customerAge}세)이 보험 연령제한(${doc.insuranceAge}세)에 미달 — 운전 불가`,
        });
      }
    }
    // 보험기간 ⊃ 계약기간 (보험이 계약기간 전체를 커버해야 함)
    if (doc.insuranceStart && doc.insuranceEnd && contract.contractDate && contract.returnScheduledDate) {
      if (doc.insuranceStart > contract.contractDate) {
        issues.push({
          field: 'insuranceStart', label: '보험 시작일',
          level: 'error',
          contractValue: contract.contractDate,
          documentValue: doc.insuranceStart,
          message: `보험이 계약 시작보다 늦음 (계약 ${contract.contractDate}, 보험 ${doc.insuranceStart})`,
        });
      }
      if (doc.insuranceEnd < contract.returnScheduledDate) {
        issues.push({
          field: 'insuranceEnd', label: '보험 종료일',
          level: 'error',
          contractValue: contract.returnScheduledDate,
          documentValue: doc.insuranceEnd,
          message: `보험이 계약 종료보다 빠름 (계약 ${contract.returnScheduledDate}, 보험 ${doc.insuranceEnd})`,
        });
      }
    }
  }

  // ── 할부스케줄 전용 ──
  if (kind === '할부스케줄') {
    // 회차 = termMonths
    if (doc.installmentMonths != null && contract.termMonths
        && doc.installmentMonths !== contract.termMonths) {
      issues.push({
        field: 'termMonths', label: '약정개월',
        level: 'warn',
        contractValue: String(contract.termMonths),
        documentValue: String(doc.installmentMonths),
        message: `계약 ${contract.termMonths}개월 ≠ 할부 ${doc.installmentMonths}회차`,
      });
    }
    // 월 할부금 ≈ monthlyRent (±10%)
    if (doc.installmentMonthly != null && contract.monthlyRent) {
      const diff = Math.abs(doc.installmentMonthly - contract.monthlyRent) / contract.monthlyRent;
      if (diff > 0.1) {
        issues.push({
          field: 'monthlyRent', label: '월 할부금',
          level: 'warn',
          contractValue: `${contract.monthlyRent.toLocaleString()}원`,
          documentValue: `${doc.installmentMonthly.toLocaleString()}원`,
          message: `월 할부금이 계약 월대여료와 10% 이상 차이`,
        });
      }
    }
  }

  return issues;
}

/** Issue 들을 level 별로 분류 — UI 요약 */
export function summarizeIssues(issues: ValidationIssue[]): {
  errors: number;
  warns: number;
  infos: number;
  ok: boolean;
} {
  return {
    errors: issues.filter((i) => i.level === 'error').length,
    warns: issues.filter((i) => i.level === 'warn').length,
    infos: issues.filter((i) => i.level === 'info').length,
    ok: issues.length === 0,
  };
}

/** YYYY-MM-DD 생년월일 → 기준일 시점 만 나이 */
export function ageFromBirthYYYYMMDD(birth: string, asOf: string): number {
  const b = new Date(birth);
  const t = new Date(asOf);
  let age = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--;
  return age;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 마스킹된 등록번호에서 생년월일 복원 — 주민번호 형식 '900101-1******' 만 */
function contractCustomerBirthFromMasked(contract: import('./types').Contract): string | undefined {
  const m = contract.customerRegNoMasked;
  if (!m) return undefined;
  const match = m.match(/^(\d{2})(\d{2})(\d{2})-([12])/);
  if (!match) return undefined;
  const [, yy, mm, dd, g] = match;
  // 1: 1900s 남자, 2: 1900s 여자, 3: 2000s 남자, 4: 2000s 여자
  const century = (g === '1' || g === '2') ? 1900 : 2000;
  return `${century + parseInt(yy, 10)}-${mm}-${dd}`;
}
