/**
 * 계약 리스트 / 미수 리스트 엑셀 내보내기.
 * lib/ledger-export.ts 와 동일 스타일 (JPK 네이비 헤더 + 천단위 콤마).
 */

import * as XLSX from 'xlsx-js-style';
import type { Contract } from './types';
import { contractIdentMasked } from './ident';
import { displayCompanyName } from './company-display';
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
const styleRedNum = {
  ...styleNum,
  font: { name: FONT, sz: 10, color: { rgb: 'DC2626' }, bold: true },
};

type CompanyMaster = Parameters<typeof displayCompanyName>[1];

/**
 * 계약 리스트 export — 현재 표시중인 contracts 전체.
 * 컬럼: 계약번호 · 회사 · 차량번호 · 차종 · 계약자 · 구분 · 등록번호(마스킹) · 연락처
 *      · 계약일 · 반납예정 · 회차 · 월대여료 · 미수 · 미납회차 · 상태 · 담당자
 */
export function downloadContractsExcel(
  contracts: Contract[],
  companyMaster: CompanyMaster,
  meta?: { title?: string; filter?: string; fileName?: string; sheetName?: string },
) {
  const wb = XLSX.utils.book_new();
  const title = meta?.title ?? '계약 리스트';
  const filter = meta?.filter ? `필터: ${meta.filter}` : `전체: ${contracts.length}건`;

  const headers = [
    '계약번호', '회사', '차량번호', '차종', '계약자', '구분', '등록번호', '연락처',
    '계약일', '반납예정', '회차', '월대여료', '미수', '미납회차', '상태', '담당자',
  ];
  const aoa = [
    [title], [filter, `기준일: ${todayKr()}`], [],
    headers,
    ...contracts.map((c) => [
      c.contractNo ?? '',
      displayCompanyName(c.company, companyMaster),
      c.vehiclePlate,
      c.vehicleModel,
      c.customerName,
      c.customerKind ?? '',
      contractIdentMasked(c),
      c.customerPhone1 ?? '',
      c.contractDate,
      c.returnScheduledDate ?? '',
      `${c.currentSeq}/${c.totalSeq}`,
      c.monthlyRent ?? 0,
      c.unpaidAmount ?? 0,
      c.unpaidSeqCount ?? 0,
      c.status,
      c.manager ?? '',
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws['A1'] = { v: title, s: styleTitle };
  ws['A2'] = { v: filter, s: { font: { name: FONT, sz: 10, color: { rgb: '666666' } } } };
  ws['B2'] = { v: `기준일: ${todayKr()}`, s: { font: { name: FONT, sz: 10, color: { rgb: '666666' } } } };
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
  ];

  for (let c = 0; c < headers.length; c++) {
    ws[XLSX.utils.encode_cell({ r: 3, c })] = { v: headers[c], s: styleHeader };
  }
  for (let i = 0; i < contracts.length; i++) {
    const c = contracts[i];
    const row = 4 + i;
    const set = (col: number, v: string | number, s = styleCell) => {
      ws[XLSX.utils.encode_cell({ r: row, c: col })] = { v, s };
    };
    set(0, c.contractNo ?? '');
    set(1, displayCompanyName(c.company, companyMaster));
    set(2, c.vehiclePlate);
    set(3, c.vehicleModel);
    set(4, c.customerName);
    set(5, c.customerKind ?? '');
    set(6, contractIdentMasked(c));
    set(7, c.customerPhone1 ?? '');
    set(8, c.contractDate, styleDate);
    set(9, c.returnScheduledDate ?? '', styleDate);
    set(10, `${c.currentSeq}/${c.totalSeq}`, styleDate);
    set(11, c.monthlyRent ?? 0, styleNum);
    set(12, c.unpaidAmount ?? 0, (c.unpaidAmount ?? 0) > 0 ? styleRedNum : styleNum);
    set(13, c.unpaidSeqCount ?? 0, styleNum);
    set(14, c.status);
    set(15, c.manager ?? '');
  }
  ws['!cols'] = [
    { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 6 },
    { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 12 },
    { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 10 },
  ];
  ws['!rows'] = [{ hpt: 26 }, { hpt: 16 }, { hpt: 8 }, { hpt: 22 }];

  XLSX.utils.book_append_sheet(wb, ws, meta?.sheetName ?? '계약');
  const baseName = meta?.fileName ?? (meta?.title ? meta.title.replace(/\s+/g, '-') : '계약리스트');
  const fname = `${baseName}-${todayKr().replace(/-/g, '')}.xlsx`;
  XLSX.writeFile(wb, fname, { bookType: 'xlsx', compression: true });
}

/**
 * 미수 리스트 export — unpaidAmount > 0 인 계약만.
 * 컬럼: 회사 · 차량번호 · 계약자 · 연락처 · 계약일 · 회차 · 월대여료 · 미수 · 미납회차 · 연체일수 · 담당자
 */
export function downloadOverdueExcel(
  contracts: Contract[],
  companyMaster: CompanyMaster,
) {
  const wb = XLSX.utils.book_new();
  const overdueContracts = contracts
    .filter((c) => (c.unpaidAmount ?? 0) > 0)
    .sort((a, b) => (b.unpaidAmount ?? 0) - (a.unpaidAmount ?? 0));

  const title = '미수 리스트';
  const summary = `${overdueContracts.length}건 · 합계 ₩${overdueContracts.reduce((s, c) => s + (c.unpaidAmount ?? 0), 0).toLocaleString('ko-KR')}`;

  const headers = [
    '회사', '차량번호', '차종', '계약자', '연락처', '계약일', '회차',
    '월대여료', '미수금', '미납회차', '연체일수', '담당자',
  ];
  const aoa = [
    [title], [summary, `기준일: ${todayKr()}`], [],
    headers,
    ...overdueContracts.map((c) => {
      // 가장 오래된 미납 회차의 dueDate 로 연체일수 계산
      const earliestOverdue = (c.schedules ?? [])
        .filter((s) => s.status === '연체' || s.status === '부분납')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
      const days = earliestOverdue
        ? Math.max(0, Math.round((new Date(todayKr()).getTime() - new Date(earliestOverdue.dueDate).getTime()) / 86400000))
        : 0;
      return [
        displayCompanyName(c.company, companyMaster),
        c.vehiclePlate, c.vehicleModel, c.customerName,
        c.customerPhone1 ?? '',
        c.contractDate, `${c.currentSeq}/${c.totalSeq}`,
        c.monthlyRent ?? 0, c.unpaidAmount ?? 0, c.unpaidSeqCount ?? 0,
        days, c.manager ?? '',
      ];
    }),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws['A1'] = { v: title, s: styleTitle };
  ws['A2'] = { v: summary, s: { font: { name: FONT, sz: 10, color: { rgb: 'DC2626' }, bold: true } } };
  ws['B2'] = { v: `기준일: ${todayKr()}`, s: { font: { name: FONT, sz: 10, color: { rgb: '666666' } } } };
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];

  for (let c = 0; c < headers.length; c++) {
    ws[XLSX.utils.encode_cell({ r: 3, c })] = { v: headers[c], s: styleHeader };
  }
  for (let i = 0; i < overdueContracts.length; i++) {
    const c = overdueContracts[i];
    const earliestOverdue = (c.schedules ?? [])
      .filter((s) => s.status === '연체' || s.status === '부분납')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    const days = earliestOverdue
      ? Math.max(0, Math.round((new Date(todayKr()).getTime() - new Date(earliestOverdue.dueDate).getTime()) / 86400000))
      : 0;
    const row = 4 + i;
    const set = (col: number, v: string | number, s = styleCell) => {
      ws[XLSX.utils.encode_cell({ r: row, c: col })] = { v, s };
    };
    set(0, displayCompanyName(c.company, companyMaster));
    set(1, c.vehiclePlate);
    set(2, c.vehicleModel);
    set(3, c.customerName);
    set(4, c.customerPhone1 ?? '');
    set(5, c.contractDate, styleDate);
    set(6, `${c.currentSeq}/${c.totalSeq}`, styleDate);
    set(7, c.monthlyRent ?? 0, styleNum);
    set(8, c.unpaidAmount ?? 0, styleRedNum);
    set(9, c.unpaidSeqCount ?? 0, styleNum);
    set(10, days, days >= 30 ? styleRedNum : styleNum);
    set(11, c.manager ?? '');
  }
  ws['!cols'] = [
    { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 12 },
    { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 10 },
  ];
  ws['!rows'] = [{ hpt: 26 }, { hpt: 16 }, { hpt: 8 }, { hpt: 22 }];

  XLSX.utils.book_append_sheet(wb, ws, '미수');
  const fname = `미수리스트-${todayKr().replace(/-/g, '')}.xlsx`;
  XLSX.writeFile(wb, fname, { bookType: 'xlsx', compression: true });
}
