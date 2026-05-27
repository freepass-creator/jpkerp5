/**
 * 엑셀 행 파싱 공용 헬퍼 — toStr / toNum / toDate / get (fuzzy alias).
 *
 * parseVehicleRow / parseContractRow / parseBankTxRow / parseCardTxRow / parseSnapshotRow
 * 등 모든 row parser 가 공유.
 *
 *   const date = toDate(get(row, '거래일자', '거래일', 'txDate'));
 *   const amt  = toNum(get(row, '입금액', 'amount'));
 */

import { normalizeKoreanDate } from './parsers/date';

export type Row = Record<string, unknown>;

/** unknown → trimmed string (Date 객체면 YYYY-MM-DD). null/undefined → '' */
export function toStr(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

/** unknown → number. 통화 기호·콤마 제거. 변환 실패 → 0 */
export function toNum(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const cleaned = String(v).replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * unknown → YYYY-MM-DD. 모든 한국식 포맷 + 엑셀 직렬 처리.
 * 위임: lib/parsers/date.ts 의 normalizeKoreanDate
 *
 * 지원: yyyy-mm-dd / yy-mm-dd / yyyymmdd / yymmdd / yyyy.mm.dd / yyyy/mm/dd / 한글날짜 / 엑셀 직렬
 */
export function toDate(v: unknown): string {
  if (v == null || v === '') return '';
  if (v instanceof Date) return normalizeKoreanDate(v);
  if (typeof v === 'number') return normalizeKoreanDate(v);
  return normalizeKoreanDate(String(v));
}

/** 헤더 키 정규화 — 공백/별표/대소문자/괄호 제거 */
export function normKey(s: string): string {
  return s.replace(/\s+/g, '').replace(/\*/g, '').replace(/[()]/g, '').toLowerCase();
}

/**
 * 헤더 alias resolver — 다양한 컬럼명 허용 + fuzzy 매칭.
 *
 * 1차: 정확 매칭 / 2차: 정규화 매칭 (공백·별표·괄호·대소문자 무관)
 *
 *   get(row, '거래일자', '거래일', 'txDate')
 *   → row['거래일자'] || row['거래일'] || row['txDate'] || 정규화 매칭 → undefined
 */
export function get(row: Row, ...keys: string[]): unknown {
  // 1차: 정확 매칭
  for (const k of keys) {
    if (k in row && row[k] != null && row[k] !== '') return row[k];
  }
  // 2차: 정규화 매칭
  const targets = new Set(keys.map(normKey));
  for (const [rowKey, rowVal] of Object.entries(row)) {
    if (rowVal == null || rowVal === '') continue;
    if (targets.has(normKey(rowKey))) return rowVal;
  }
  return undefined;
}
