'use client';

/**
 * 엑셀 내보내기 — 정형 스타일 (굴림체, 헤더 회색배경, 셀 테두리, freeze).
 * exceljs는 ~1MB라 lazy import (엑셀 버튼 누를 때만 다운로드).
 */

export type ExcelColumn = {
  key: string;
  header: string;
  width?: number;
  type?: 'text' | 'number' | 'date' | 'mono';
  getter?: (row: Record<string, unknown>) => unknown;
};

type Options = {
  title: string;
  subtitle?: string;
  columns: ExcelColumn[];
  rows: Record<string, unknown>[];
  fileName?: string;
};

export async function exportToExcel(opts: Options) {
  const { default: ExcelJS } = await import('exceljs');

  const FONT_BODY = { name: '굴림체', size: 10 };
  const FONT_MONO = { name: 'Consolas', size: 10 };
  const FONT_HEADER = { name: '굴림체', size: 10, bold: true, color: { argb: 'FF111827' } };
  const FONT_TITLE = { name: '굴림체', size: 14, bold: true, color: { argb: 'FF1B2A4A' } };

  const FILL_HEADER = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFAFAFA' } };
  const FILL_TITLE = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFFFF' } };

  const BORDER_THIN = { style: 'thin' as const, color: { argb: 'FFE5E7EB' } };
  const BORDER_STRONG = { style: 'thin' as const, color: { argb: 'FFD1D5DB' } };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'JPK ERP v4';
  wb.created = new Date();

  const sheet = wb.addWorksheet(opts.title.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: opts.subtitle ? 4 : 3 }],
  });

  sheet.columns = opts.columns.map((c) => ({
    key: c.key,
    width: c.width ?? defaultWidth(c.type),
  }));

  const titleRow = sheet.addRow([opts.title]);
  sheet.mergeCells(titleRow.number, 1, titleRow.number, opts.columns.length);
  titleRow.getCell(1).font = FONT_TITLE;
  titleRow.getCell(1).fill = FILL_TITLE;
  titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
  titleRow.height = 26;

  if (opts.subtitle) {
    const subRow = sheet.addRow([opts.subtitle]);
    sheet.mergeCells(subRow.number, 1, subRow.number, opts.columns.length);
    subRow.getCell(1).font = { ...FONT_BODY, color: { argb: 'FF6B7280' } };
    subRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    subRow.height = 18;
  }

  sheet.addRow([]);

  const headerRow = sheet.addRow(opts.columns.map((c) => c.header));
  headerRow.eachCell((cell) => {
    cell.font = FONT_HEADER;
    cell.fill = FILL_HEADER;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { top: BORDER_STRONG, bottom: BORDER_STRONG, left: BORDER_THIN, right: BORDER_THIN };
  });
  headerRow.height = 22;

  for (const r of opts.rows) {
    const values = opts.columns.map((c) => {
      const v = c.getter ? c.getter(r) : (r as Record<string, unknown>)[c.key];
      return v ?? '';
    });
    const row = sheet.addRow(values);
    opts.columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.font = c.type === 'mono' || c.type === 'number' || c.type === 'date' ? FONT_MONO : FONT_BODY;
      cell.alignment = {
        vertical: 'middle',
        horizontal: c.type === 'number' ? 'right' : 'left',
        wrapText: false,
      };
      if (c.type === 'number') cell.numFmt = '#,##0';
      cell.border = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };
    });
    row.height = 18;
  }

  const buf = await wb.xlsx.writeBuffer();
  const fileName = opts.fileName ?? `${opts.title}-${todayStr()}.xlsx`;
  triggerDownload(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
}

function defaultWidth(type?: ExcelColumn['type']): number {
  switch (type) {
    case 'number': return 14;
    case 'date':   return 18;
    case 'mono':   return 16;
    default:       return 14;
  }
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
