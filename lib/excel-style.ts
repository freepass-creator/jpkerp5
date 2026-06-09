/**
 * 엑셀 export 공용 스타일 — 모든 export 가 동일 ERP 톤.
 *   · JPK 네이비 (#1B2A4A) 타이틀 행
 *   · 옅은 회색 (#F0F2F5) 헤더 + 네이비 글자
 *   · 천단위 콤마 / 가운데 정렬 / thin border (D0D0D0)
 *   · 빨간 강조 (#DC2626) — 미수·연체 등
 */

export const EXCEL_FONT = '맑은 고딕';

export const EXCEL_BORDER_THIN = {
  top:    { style: 'thin', color: { rgb: 'D0D0D0' } },
  bottom: { style: 'thin', color: { rgb: 'D0D0D0' } },
  left:   { style: 'thin', color: { rgb: 'D0D0D0' } },
  right:  { style: 'thin', color: { rgb: 'D0D0D0' } },
};

export const STYLE_TITLE = {
  font: { name: EXCEL_FONT, sz: 14, bold: true, color: { rgb: 'FFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: '1B2A4A' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: EXCEL_BORDER_THIN,
};

export const STYLE_META = {
  font: { name: EXCEL_FONT, sz: 9, italic: true, color: { rgb: '595959' } },
  alignment: { horizontal: 'left', vertical: 'center' },
};

export const STYLE_HEADER = {
  font: { name: EXCEL_FONT, sz: 10, bold: true, color: { rgb: '1B2A4A' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'F0F2F5' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: EXCEL_BORDER_THIN,
};

export const STYLE_CELL = {
  font: { name: EXCEL_FONT, sz: 10 },
  alignment: { vertical: 'center', wrapText: false },
  border: EXCEL_BORDER_THIN,
};

export const STYLE_MONO = {
  ...STYLE_CELL,
  font: { name: 'Consolas', sz: 10 },
};

export const STYLE_CENTER = {
  ...STYLE_CELL,
  alignment: { vertical: 'center', horizontal: 'center' },
};

export const STYLE_NUM = {
  ...STYLE_CELL,
  alignment: { vertical: 'center', horizontal: 'right' },
  numFmt: '#,##0',
};

export const STYLE_RED_NUM = {
  ...STYLE_NUM,
  font: { name: EXCEL_FONT, sz: 10, color: { rgb: 'DC2626' }, bold: true },
};

export const STYLE_BRAND_NUM = {
  ...STYLE_NUM,
  font: { name: EXCEL_FONT, sz: 10, color: { rgb: '1B2A4A' }, bold: true },
  fill: { patternType: 'solid', fgColor: { rgb: 'EEF2F7' } },
};

export const STYLE_DATE = {
  ...STYLE_CELL,
  alignment: { vertical: 'center', horizontal: 'center' },
};
