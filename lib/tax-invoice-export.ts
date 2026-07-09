/**
 * 세금계산서 일괄 발행 엑셀 — 전자세금계산서(셀렉션 등) 시스템 업로드용.
 *
 * 우리 시스템에 별도 entity 없이, contracts(매출) → 엑셀 row 변환.
 * 사용 흐름:
 *   1) 자금일보 BottomBar [세금계산서 엑셀] 클릭
 *   2) 이번 달 B2B 활성 계약 자동 모음 → toSelectionRow
 *   3) xlsx 다운로드 → 외부 시스템 일괄 업로드
 *
 * 헤더 (sources/셀렉션세금계산서_대량.xlsx 기준 — 표준 양식, 회사 무관):
 *   작성일자 / 공급받는자 등록번호 / 상호 / 성명 / 사업장주소 / 업태 / 종목 / 이메일1·2
 *   품목1~4 / 규격1~4 / 수량1~4 / 단가1~4 / 공급가액1~4 / 부가세1~4
 *   합계 공급가액 / 합계 부가세 / 비고
 */

import * as XLSX from 'xlsx';
import type { Contract } from '@/lib/types';
import { isContractEnded } from '@/lib/contract-lifecycle';

type SelectionRow = Record<string, string | number>;

/** 1 계약 → 1 발행 row (월대여료 1품목 가정). 부가세 포함 가격 → 분리 */
export function contractToSelectionRow(c: Contract, billingMonth: string): SelectionRow {
  const total = c.monthlyRent ?? 0;
  const supply = Math.round(total / 1.1);
  const vat = total - supply;
  const today = new Date().toISOString();
  // 전자세금계산서 업로드용 작성일자는 YYYY-MM-DD 전체 (기존엔 '일(DD)'만 넣어 날짜 파싱 실패)
  const writeDate = today.slice(0, 10);

  return {
    '작성일자': writeDate,
    '공급받는자 등록번호': c.customerIdentNo ?? '',
    '공급받는자 상호': c.customerName ?? '',
    '공급받는자 성명': '',                       // contracts에 ceo 없음 — 비워서 사용자 채움
    '공급받는자 사업장주소': '',
    '공급받는자 업태': '',
    '공급받는자 종목': '',
    '공급받는자 이메일1': '',
    '공급받는자 이메일2': '',
    '품목1': `자동차 렌탈 대여료 ${billingMonth}`,
    '규격1': c.vehiclePlate ?? '',
    '수량1': 1,
    '단가1': supply,
    '공급가액1': supply,
    '부가세1': vat,
    '품목2': '', '규격2': '', '수량2': '', '단가2': '', '공급가액2': '', '부가세2': '',
    '품목3': '', '규격3': '', '수량3': '', '단가3': '', '공급가액3': '', '부가세3': '',
    '품목4': '', '규격4': '', '수량4': '', '단가4': '', '공급가액4': '', '부가세4': '',
    '합계 공급가액': supply,
    '합계 부가세': vat,
    '비고': `${c.contractNo ?? ''} · ${c.vehiclePlate ?? ''}`,
  };
}

/** B2B 활성 계약만 필터 + 엑셀 다운로드. snapshots = 발행 대상 contract list (frozen ledger 기록용). */
export function downloadTaxInvoiceExcel(
  contracts: Contract[],
  opts?: { billingMonth?: string; fileName?: string },
): { ok: true; count: number; snapshots: Contract[] } | { ok: false; reason: 'no-contracts' } {
  const billingMonth = opts?.billingMonth ?? new Date().toISOString().slice(0, 7);

  // 활성 + B2B 계약만 (개인 계약은 영수증 처리).
  //   종료 판정은 SSOT isContractEnded — 하드코딩 나열은 '채권'(회수불가 채권화)을
  //   빠뜨려 악성채권 건에 세금계산서가 발행됐음.
  const candidates = contracts.filter((c) =>
    !isContractEnded(c)
    && (c.customerKind === '사업자' || c.customerKind === '법인')
    && (c.monthlyRent ?? 0) > 0
  );

  if (candidates.length === 0) {
    return { ok: false, reason: 'no-contracts' };
  }

  const rows = candidates.map((c) => contractToSelectionRow(c, billingMonth));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '세금계산서');
  const fileName = opts?.fileName ?? `세금계산서_${billingMonth}_${candidates.length}건.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { ok: true, count: candidates.length, snapshots: candidates };
}
