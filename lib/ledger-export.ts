/**
 * 자금일보 엑셀 내보내기 — 세무사 공유용.
 * 일자별 집계 시트 + 분개 원장 시트 두 장.
 */

import * as XLSX from 'xlsx-js-style';
import { todayKr } from './mock-data';

const FONT = '맑은 고딕';

const BORDER_THIN = {
  top:    { style: 'thin', color: { rgb: 'D0D0D0' } },
  bottom: { style: 'thin', color: { rgb: 'D0D0D0' } },
  left:   { style: 'thin', color: { rgb: 'D0D0D0' } },
  right:  { style: 'thin', color: { rgb: 'D0D0D0' } },
};

const styleTitle = {
  font: { name: FONT, sz: 14, bold: true, color: { rgb: 'FFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: '1B2A4A' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: BORDER_THIN,
};

const styleHeader = {
  font: { name: FONT, sz: 10, bold: true, color: { rgb: '1B2A4A' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'F0F2F5' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: BORDER_THIN,
};

const styleCell = {
  font: { name: FONT, sz: 10 },
  alignment: { vertical: 'center' },
  border: BORDER_THIN,
};

const styleNum = {
  ...styleCell,
  alignment: { vertical: 'center', horizontal: 'right' },
  numFmt: '#,##0',
};

const styleDate = {
  ...styleCell,
  alignment: { vertical: 'center', horizontal: 'center' },
};

const styleNegative = {
  ...styleNum,
  font: { name: FONT, sz: 10, color: { rgb: 'DC2626' } },
};

// 숫자 셀 — t:'n' 을 명시하지 않으면 xlsx-js-style 이 텍스트로 저장해 엑셀 합계·정렬이 안 됨.
const numCell = (v: number, s: Record<string, unknown> = styleNum) => ({ v, t: 'n' as const, s });

export type DailySummaryRow = {
  companyCode: string;
  date: string;
  txCount: number;
  deposit: number;
  withdraw: number;
  netChange: number;
  endBalance: number;
  depoSubjects: string;
  drawSubjects: string;
};

export type LedgerRow = {
  txDate: string;
  companyCode: string;
  account: string;
  subject: string;
  counterparty: string;
  memo: string;
  deposit: number;
  withdraw: number;
  balance: number;
  matchedContractNo: string;
  matchedScheduleSeq: number | '';
};

export function downloadDailyLedgerExcel(
  daily: DailySummaryRow[],
  ledger: LedgerRow[],
  meta?: { title?: string; period?: string },
) {
  const wb = XLSX.utils.book_new();

  // ── 시트 1: 일자별 집계 ──
  const summaryHeaders = ['회사', '일자', '거래수', '입금합계', '출금합계', '순증감', '잔액', '주요 입금 (계정과목)', '주요 출금 (계정과목)'];
  const summaryAoa: (string | number)[][] = [
    [meta?.title ?? '자금일보 — 일자별 집계'],
    [meta?.period ? `기간: ${meta.period}` : `기준: ${todayKr()}`],
    [],
    summaryHeaders,
    ...daily.map((r) => [
      r.companyCode || '(미지정)',
      r.date,
      r.txCount,
      r.deposit,
      r.withdraw,
      r.netChange,
      r.endBalance,
      r.depoSubjects,
      r.drawSubjects,
    ]),
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summaryAoa);

  // 셀 스타일
  ws1['A1'] = { v: meta?.title ?? '자금일보 — 일자별 집계', s: styleTitle };
  ws1['A2'] = { v: meta?.period ? `기간: ${meta.period}` : `기준: ${todayKr()}`, s: { font: { name: FONT, sz: 10, color: { rgb: '666666' } } } };

  // 헤더 (4행)
  for (let c = 0; c < summaryHeaders.length; c++) {
    const ref = XLSX.utils.encode_cell({ r: 3, c });
    ws1[ref] = { v: summaryHeaders[c], s: styleHeader };
  }

  // 데이터 (5행~)
  for (let i = 0; i < daily.length; i++) {
    const r = daily[i];
    const row = 4 + i;
    ws1[XLSX.utils.encode_cell({ r: row, c: 0 })] = { v: r.companyCode || '(미지정)', s: styleCell };
    ws1[XLSX.utils.encode_cell({ r: row, c: 1 })] = { v: r.date, s: styleDate };
    ws1[XLSX.utils.encode_cell({ r: row, c: 2 })] = numCell(r.txCount);
    ws1[XLSX.utils.encode_cell({ r: row, c: 3 })] = numCell(r.deposit);
    ws1[XLSX.utils.encode_cell({ r: row, c: 4 })] = numCell(r.withdraw);
    ws1[XLSX.utils.encode_cell({ r: row, c: 5 })] = numCell(r.netChange, r.netChange < 0 ? styleNegative : styleNum);
    ws1[XLSX.utils.encode_cell({ r: row, c: 6 })] = numCell(r.endBalance);
    ws1[XLSX.utils.encode_cell({ r: row, c: 7 })] = { v: r.depoSubjects, s: styleCell };
    ws1[XLSX.utils.encode_cell({ r: row, c: 8 })] = { v: r.drawSubjects, s: styleCell };
  }

  ws1['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },  // 타이틀 merge
    { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },  // 기간 merge
  ];
  ws1['!cols'] = [
    { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 40 }, { wch: 40 },
  ];
  ws1['!rows'] = [{ hpt: 26 }, { hpt: 16 }, { hpt: 8 }, { hpt: 22 }];

  XLSX.utils.book_append_sheet(wb, ws1, '일자별집계');

  // ── 시트 2: 분개 원장 ──
  const ledgerHeaders = ['거래일시', '회사', '계좌', '계정과목', '거래상대', '적요', '입금', '출금', '잔액', '매칭계약', '회차'];
  const ws2 = XLSX.utils.aoa_to_sheet([
    ['자금일보 — 거래 원장 (분개)'],
    [],
    ledgerHeaders,
    ...ledger.map((r) => [
      r.txDate, r.companyCode, r.account, r.subject, r.counterparty, r.memo,
      r.deposit, r.withdraw, r.balance, r.matchedContractNo, r.matchedScheduleSeq,
    ]),
  ]);
  ws2['A1'] = { v: '자금일보 — 거래 원장 (분개)', s: styleTitle };
  for (let c = 0; c < ledgerHeaders.length; c++) {
    const ref = XLSX.utils.encode_cell({ r: 2, c });
    ws2[ref] = { v: ledgerHeaders[c], s: styleHeader };
  }
  for (let i = 0; i < ledger.length; i++) {
    const r = ledger[i];
    const row = 3 + i;
    ws2[XLSX.utils.encode_cell({ r: row, c: 0 })] = { v: r.txDate, s: styleDate };
    ws2[XLSX.utils.encode_cell({ r: row, c: 1 })] = { v: r.companyCode, s: styleCell };
    ws2[XLSX.utils.encode_cell({ r: row, c: 2 })] = { v: r.account, s: styleCell };
    ws2[XLSX.utils.encode_cell({ r: row, c: 3 })] = { v: r.subject, s: styleCell };
    ws2[XLSX.utils.encode_cell({ r: row, c: 4 })] = { v: r.counterparty, s: styleCell };
    ws2[XLSX.utils.encode_cell({ r: row, c: 5 })] = { v: r.memo, s: styleCell };
    ws2[XLSX.utils.encode_cell({ r: row, c: 6 })] = numCell(r.deposit);
    ws2[XLSX.utils.encode_cell({ r: row, c: 7 })] = numCell(r.withdraw);
    ws2[XLSX.utils.encode_cell({ r: row, c: 8 })] = numCell(r.balance);
    ws2[XLSX.utils.encode_cell({ r: row, c: 9 })] = { v: r.matchedContractNo, s: styleCell };
    ws2[XLSX.utils.encode_cell({ r: row, c: 10 })] = typeof r.matchedScheduleSeq === 'number'
      ? numCell(r.matchedScheduleSeq)
      : { v: r.matchedScheduleSeq, s: styleNum };
  }
  ws2['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }];
  ws2['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 28 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 6 },
  ];
  ws2['!rows'] = [{ hpt: 26 }, { hpt: 8 }, { hpt: 22 }];
  XLSX.utils.book_append_sheet(wb, ws2, '거래원장');

  // 다운로드
  const fileName = `자금일보-${todayKr().replace(/-/g, '')}.xlsx`;
  XLSX.writeFile(wb, fileName, { bookType: 'xlsx', compression: true });
}
