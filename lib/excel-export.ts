'use client';

/**
 * 엑셀 내보내기 — JPK ERP 표준 스타일 (xlsx-js-style + lib/excel-style.ts).
 * 모든 list 페이지에서 동일 톤. ExcelJS → xlsx-js-style 마이그 (1MB → 200KB + 일관 스타일).
 */

import * as XLSX from 'xlsx-js-style';
import {
  STYLE_TITLE, STYLE_META, STYLE_HEADER, STYLE_CELL, STYLE_MONO,
  STYLE_CENTER, STYLE_NUM, STYLE_DATE,
} from './excel-style';

export type ExcelColumn<T = Record<string, unknown>> = {
  key: string;
  header: string;
  width?: number;
  type?: 'text' | 'number' | 'date' | 'mono' | 'center';
  getter?: (row: T) => unknown;
};

type Options<T = Record<string, unknown>> = {
  title: string;
  subtitle?: string;
  columns: ExcelColumn<T>[];
  rows: T[];
  sheetName?: string;
  fileName?: string;
  /** freeze pane — 좌측 N 열 고정 (헤더는 항상 4행 고정) */
  freezeLeftCols?: number;
};

type Cell = { v: string | number; s?: Record<string, unknown> };

function styleFor(type?: ExcelColumn['type'], v?: unknown): Record<string, unknown> {
  if (type === 'number') return STYLE_NUM;
  if (type === 'mono') return STYLE_MONO;
  if (type === 'date') return STYLE_DATE;
  if (type === 'center') return STYLE_CENTER;
  return typeof v === 'number' ? STYLE_NUM : STYLE_CELL;
}

function defaultWidth(type?: ExcelColumn['type']): number {
  switch (type) {
    case 'number': return 14;
    case 'date':   return 14;
    case 'mono':   return 16;
    case 'center': return 12;
    default:       return 14;
  }
}

export function exportToExcel<T = Record<string, unknown>>(opts: Options<T>): { ok: true; count: number } | { ok: false; reason: 'empty' } {
  if (opts.rows.length === 0) return { ok: false, reason: 'empty' };

  const ncols = opts.columns.length;
  const aoa: Cell[][] = [];

  // row 0 — title
  aoa.push(opts.columns.map((_, i) => ({ v: i === 0 ? opts.title : '', s: STYLE_TITLE })));

  // row 1 — subtitle (meta)
  aoa.push(opts.columns.map((_, i) => ({ v: i === 0 ? (opts.subtitle ?? '') : '', s: STYLE_META })));

  // row 2 — blank spacer
  aoa.push(opts.columns.map(() => ({ v: '', s: STYLE_CELL })));

  // row 3 — header
  aoa.push(opts.columns.map((c) => ({ v: c.header, s: STYLE_HEADER })));

  // 데이터
  for (const r of opts.rows) {
    const cells: Cell[] = opts.columns.map((c) => {
      const raw = c.getter ? c.getter(r) : (r as Record<string, unknown>)[c.key];
      const v = (raw == null ? '' : raw) as string | number;
      return { v, s: styleFor(c.type, v) };
    });
    aoa.push(cells);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // 컬럼 폭
  ws['!cols'] = opts.columns.map((c) => ({ wch: c.width ?? defaultWidth(c.type) }));

  // merge — title + meta 전체 폭
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: ncols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: ncols - 1 } },
  ];

  // 행 높이
  ws['!rows'] = [{ hpt: 28 }, { hpt: 18 }, { hpt: 8 }, { hpt: 28 }];

  // freeze — 헤더 4행 + 좌측 N열
  const xSplit = opts.freezeLeftCols ?? 0;
  ws['!views'] = [{ ySplit: 4, xSplit, topLeftCell: `${colLetter(xSplit)}5`, state: 'frozen' }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (opts.sheetName ?? opts.title).slice(0, 31));
  // fileName 미지정 시 title-날짜.xlsx 자동, 지정했고 확장자 없으면 -날짜.xlsx 자동 append
  const fileName = opts.fileName
    ? (opts.fileName.endsWith('.xlsx') ? opts.fileName : `${opts.fileName}-${todayStr()}.xlsx`)
    : `${opts.title}-${todayStr()}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { ok: true, count: opts.rows.length };
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function colLetter(n: number): string {
  if (n < 26) return String.fromCharCode(65 + n);
  return String.fromCharCode(64 + Math.floor(n / 26)) + String.fromCharCode(65 + (n % 26));
}
