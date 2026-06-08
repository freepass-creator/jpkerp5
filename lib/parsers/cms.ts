/**
 * CMS 자동이체 명세 파서.
 *
 * 표준 헤더 (사용자 sources/CMS 결제완료만 필터.xlsx 기준 28컬럼):
 *   NO. / 회원번호 / 계약번호 / 회원명 / 최초청구월 / 청구월 / 납부자 휴대전화 / 상품 /
 *   수납상태 / 결제상태 / 결제방식 / 결제수단 / 약정일 / 청구타입 / 미수처리상태 /
 *   결제일(납부기간) / 청구금액 / 공급가액 / 부가세 / 수납금액 / 미납금액 / 취소금액 /
 *   환불금액 / 청구완납일자 / 비고 / 결제결과 / 회원구분 / 담당관리자
 *
 * 매핑 (BankTransaction subset):
 *   counterparty  ← 회원명
 *   amount        ← 수납금액 (수납완료된 것만, 없으면 청구금액)
 *   txDate        ← 청구완납일자 (없으면 결제일/청구월)
 *   memo          ← 상품 + 청구월 + 결제수단
 *   source        ← '자동이체'  (자금일보에서 채널 구분)
 *   account       ← '회원번호' (CMS-ID 자리)
 *   linkedCustomerName ← 회원명 (매칭 추정용)
 *   raw           ← 원본 row
 */

import type { BankTransaction } from '@/lib/types';
import { normalizeKoreanDate } from './date';

function pick(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}
function pickNum(row: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = row[k];
    if (v != null && v !== '') {
      const cleaned = String(v).replace(/[^\d.-]/g, '');
      const n = Number(cleaned);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

export function parseCmsTxRow(row: Record<string, unknown>, fileName: string): Omit<BankTransaction, 'id'> | null {
  const customerName = pick(row, '회원명', '고객명', '납부자', '납부자명');
  if (!customerName) return null;

  const memberId = pick(row, '회원번호', '고객번호');
  const contractNo = pick(row, '계약번호');
  const product = pick(row, '상품', '상품명');
  const billMonth = pick(row, '청구월', '최초청구월');
  const payMethod = pick(row, '결제수단', '결제방식');

  // 수납완료된 것만 BankTx로 인정 (수납금액 > 0)
  // 청구금액·미납금액은 fallback (직원이 raw 보기용)
  const amount = pickNum(row, '수납금액', '청구금액');
  if (amount <= 0) return null;

  // 일자 우선순위: 청구완납일자 > 결제일(납부기간) > 약정일
  const dateRaw = pick(row, '청구완납일자', '결제일(납부기간)', '약정일');
  const txDate = normalizeKoreanDate(dateRaw) || dateRaw;
  if (!txDate) return null;

  const memo = [product, billMonth, payMethod].filter(Boolean).join(' / ');

  return {
    txDate,
    amount,
    withdraw: undefined,
    counterparty: customerName,
    memo: memo || undefined,
    source: '자동이체',           // 자금일보에서 '자동이체' 채널로 분류
    account: memberId || undefined,  // CMS는 계좌번호 자리에 회원번호(CMS-ID)
    linkedCustomerName: customerName,  // 자동 매칭 후보
    raw: { ...row, _file: fileName, _contractNo: contractNo },
  };
}

/**
 * 시트 전체에서 CMS 형식인지 자동 감지 — 헤더에 '회원명' + '수납금액' 또는 '청구완납일자' 있으면 CMS.
 */
export function looksLikeCmsSheet(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.trim()));
  return set.has('회원명') && (set.has('수납금액') || set.has('청구완납일자'));
}
