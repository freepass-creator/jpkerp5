/**
 * 회사명 표시 헬퍼.
 *
 * 규칙:
 *   1) 회사 마스터에 등록되어 있으면 → 접미사 제거한 회사명 ("주식회사 스위치플랜" → "스위치플랜")
 *   2) 등록 안 됨 + 사업자번호 있으면 → 사업자번호 뒷 5자리 (예: "67890")
 *   3) 등록 안 됨 + 법인등록번호만 → 법인등록번호 뒷 7자리
 *   4) 다 없으면 → 원본 그대로
 *
 * 사용 예:
 *   const shown = displayCompanyName(c.company, companies);   // "스위치플랜"
 *   const shown = displayCompanyName('스위치플랜 주식회사');     // "스위치플랜"
 *   const shown = displayCompanyName(undefined, [], '123-45-67890'); // "67890"
 */

import type { Company } from './types';
import { normalizeIdent } from './ident';

const CORP_SUFFIXES = [
  '주식회사', '유한회사', '유한책임회사', '합자회사', '합명회사',
  '(주)', '㈜', '(유)', '(합)', '(재)',
  '재단법인', '사단법인', '학교법인', '의료법인', '협동조합', '조합',
  '주식', // 일부 표기
];

/** "주식회사 스위치플랜" / "스위치플랜 (주)" / "㈜스위치플랜" → "스위치플랜" */
export function stripCorpSuffix(name: string): string {
  if (!name) return '';
  let n = name.trim();
  // 모든 접미사를 양쪽에서 제거 (1회 이상 반복할 수 있음)
  let prev = '';
  while (prev !== n) {
    prev = n;
    for (const suf of CORP_SUFFIXES) {
      // 접두/접미/중간 모두 제거
      n = n.replace(new RegExp(`\\s*${escapeRegex(suf)}\\s*`, 'g'), ' ').trim();
    }
  }
  return n.replace(/\s+/g, ' ').trim();
}

/** "스위치플랜 (Switch Plan Co.,Ltd)" / "Switch Plan 주식회사" → "스위치플랜" — 한글 회사명만 추출 */
export function stripCorpAndEnglish(name: string): string {
  if (!name) return '';
  let n = name.trim();
  // 1) 괄호와 괄호 안 내용 모두 제거 — (Switch Plan Co.,Ltd) / [영문명] / 【...】
  n = n.replace(/\([^)]*\)/g, ' ');
  n = n.replace(/\[[^\]]*\]/g, ' ');
  n = n.replace(/【[^】]*】/g, ' ');
  // 2) 법인 표기 (주식회사·㈜ 등) 제거
  n = stripCorpSuffix(n);
  // 3) 영문 법인 표기 (Inc., Corp., Ltd., Co., LLC, LLP) 제거
  n = n.replace(/\b(Inc|Corp|Corporation|Ltd|Limited|Co|Company|LLC|LLP|LP|Plc)\.?\b/gi, ' ').trim();
  // 4) 일반 영문 단어 제거 (한글 회사명만 남기기)
  n = n.replace(/[A-Za-z]+/g, ' ').trim();
  // 5) 쉼표·마침표 등 잔여 구두점 정리
  n = n.replace(/[,.]+/g, ' ').trim();
  // 6) 다중 공백 → 단일 공백
  return n.replace(/\s+/g, ' ').trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 사업자번호/법인번호 뒷자리로 회사명 대체 */
export function fallbackNameFromIdent(bizRegNo?: string, corpRegNo?: string): string {
  if (bizRegNo) {
    const d = normalizeIdent(bizRegNo);
    if (d.length === 10) return d.slice(5);     // 뒤 5자리
  }
  if (corpRegNo) {
    const d = normalizeIdent(corpRegNo);
    if (d.length === 13) return d.slice(6);     // 뒤 7자리
  }
  return '';
}

/**
 * Contract.company (회사명 또는 코드) + 회사 마스터 → 표시명.
 * 매스터에서 못 찾으면 사업자번호/법인번호 뒷자리로 대체.
 */
export function displayCompanyName(
  rawCompany: string | undefined,
  companies: Company[] = [],
  fallbackBizRegNo?: string,
  fallbackCorpRegNo?: string,
): string {
  const raw = (rawCompany ?? '').trim();
  if (!raw) {
    return fallbackNameFromIdent(fallbackBizRegNo, fallbackCorpRegNo) || '';
  }

  // 마스터에서 정확/접미사제거 매칭 시도
  const stripped = stripCorpSuffix(raw);
  const matched = companies.find((co) => {
    if (!co) return false;
    if (co.code === raw) return true;
    if (co.name === raw) return true;
    if (stripCorpSuffix(co.name) === stripped) return true;
    // raw가 법인번호/사업자번호 문자열이면 그것도 매칭
    if (co.corpRegNo && normalizeIdent(co.corpRegNo) === normalizeIdent(raw)) return true;
    if (co.bizRegNo && normalizeIdent(co.bizRegNo) === normalizeIdent(raw)) return true;
    return false;
  });

  if (matched) {
    return stripCorpSuffix(matched.name) || matched.name;
  }

  // 마스터 못 찾음 — 원본이 식별번호 모양이면 뒷자리 추출
  const digits = normalizeIdent(raw);
  if (digits.length === 13) return digits.slice(6);  // 법인번호 13자리 → 뒷 7자리
  if (digits.length === 10) return digits.slice(5);  // 사업자번호 10자리 → 뒷 5자리

  // 별도 인자로 들어온 식별번호 시도
  const fallback = fallbackNameFromIdent(fallbackBizRegNo, fallbackCorpRegNo);
  if (fallback) return fallback;

  // 최종 폴백 — 원본에서 접미사만 떼서 보여줌
  return stripped || raw;
}
