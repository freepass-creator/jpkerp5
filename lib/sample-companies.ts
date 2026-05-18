/**
 * 회사정보 — admin/company 페이지 + lib 재사용 (과태료 도장, 계좌내역 매칭 등).
 * 사업자등록증 OCR 결과 + 계좌/카드 정보까지 한 회사에 묶음.
 */

import type { AuditFields } from './audit-fields';

export type CompanyAccount = {
  bank: string;          // 은행명 (예: 신한, 국민)
  accountNo: string;     // 계좌번호
  holder?: string;       // 예금주 (회사명과 다를 때만)
  alias?: string;        // 별칭/용도 (예: 운영비, 자동이체 전용)
};

export type CompanyCard = {
  cardName: string;      // 카드 이름 (예: 법인 신한 BC)
  cardNo: string;        // 카드번호 (전체 또는 마스킹)
  brand?: string;        // 브랜드/카드사 (예: 신한, KB)
  alias?: string;        // 별칭/용도
};

export type Company = {
  code: string;                                    // CP01 — 사용자 부여
  name: string;                                    // 법인명/상호
  ceo: string;                                     // 대표자
  ceoType?: string;                                // 대표유형 (등록증 "(대표유형)" 칸 — 대부분 비어있음)
  bizNo: string;                                   // 사업자등록번호
  corpNo?: string;                                 // 법인등록번호 (법인만)
  hqAddress: string;                               // 본점주소
  bizAddress?: string;                             // 사업장주소 (본점과 다를 때)
  bizType: string;                                 // 업태 — 멀티값은 ", " join (예: "서비스, 부동산업")
  bizCategory: string;                             // 종목 — 멀티값은 ", " join (예: "렌터카, 매매업")
  phone: string;                                   // 대표전화
  fax?: string;                                    // 대표 팩스 (과태료/통행료 발신팩스 등에 사용)
  openDate?: string;                               // 개업연월일 YYYY-MM-DD
  email?: string;
  entityType?: 'corporate' | 'individual';         // 법인/개인
  // 등록증 하단부 — 발급 정보
  taxIssueDate?: string;                           // 등록증 발급일자 YYYY-MM-DD
  taxOffice?: string;                              // 발급 세무서 (예: "강서세무서")
  issueReason?: string;                            // 발급사유 (대부분 비어있음)
  singleTaxFlag?: boolean;                         // 사업자단위 과세 적용사업자 여부 (여=true, 부=false)
  accounts?: CompanyAccount[];
  cards?: CompanyCard[];
  /** 소프트 삭제 — 코드 영구 보존 (회사코드 재발급 금지, 자산·계약 역참조 무결성 유지). */
  deletedAt?: string;                              // 삭제 시각 ISO. 미설정이면 active.
} & AuditFields;

/** 회사 데이터는 사용자가 사업자등록증 OCR 또는 개별 입력으로 채움. 샘플 없음. */
export const SAMPLE_COMPANIES: Company[] = [];

export function findCompany(code?: string): Company | undefined {
  if (!code) return undefined;
  return SAMPLE_COMPANIES.find((c) => c.code === code);
}

/**
 * 회사명·식별번호 정규화. 비교 시 동일 회사를 가능한 한 일치시킴.
 *   "(주)", "주식회사", "㈜" 제거 + 공백/하이픈/언더바 제거 + 소문자.
 */
function normCompanyName(s: string): string {
  return s
    .replace(/\(주\)|㈜|주식회사/g, '')
    .replace(/[\s\-_·]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * 자동차등록증 ⑨성명·⑩법인등록번호 또는 보험증권 피보험자/사업자번호 로 회사 찾기.
 *   1) corpNo / bizNo exact (정확)
 *   2) 회사명 정규화 매칭 (`(주)` 제거 + 공백 무시 등)
 *   3) bizNo 마스킹 prefix (예: "158-81-*****") — 동일 prefix 회사가 유일할 때만 매칭
 */
export function findCompanyByOwner(
  ownerName: string | undefined,
  ownerRegNo: string | undefined,
  companies: readonly Company[],
): Company | undefined {
  const norm = (s?: string) => s?.replace(/[-\s]/g, '') ?? '';
  const reg = norm(ownerRegNo);
  const active = companies.filter((c) => !c.deletedAt);

  // 1) 정확 매칭 — corpNo / bizNo (마스킹 없을 때만)
  if (reg && !reg.includes('*')) {
    const byCorp = active.find((c) => c.corpNo && norm(c.corpNo) === reg);
    if (byCorp) return byCorp;
    const byBiz = active.find((c) => c.bizNo && norm(c.bizNo) === reg);
    if (byBiz) return byBiz;
  }

  // 2) 회사명 정규화 매칭
  const name = ownerName?.trim();
  if (name) {
    const target = normCompanyName(name);
    if (target) {
      const byName = active.find((c) => normCompanyName(c.name) === target);
      if (byName) return byName;
    }
  }

  // 3) 마스킹 사업자번호 prefix — "158-81-*****" → 살아있는 prefix 로 유일 회사 찾기
  if (reg && reg.includes('*')) {
    const prefix = reg.replace(/\*+.*$/, '');
    if (prefix.length >= 5) {
      const candidates = active.filter((c) => c.bizNo && norm(c.bizNo).startsWith(prefix));
      if (candidates.length === 1) return candidates[0];
    }
  }

  return undefined;
}

/** active 회사만 (UI 드롭다운·신규 매칭용). */
export function activeCompanies(companies: readonly Company[]): Company[] {
  return companies.filter((c) => !c.deletedAt);
}
