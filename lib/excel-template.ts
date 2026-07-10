/**
 * 엑셀 일괄 등록 템플릿 생성 — 모던 미니멀 양식 (2026 리디자인).
 *
 * 구조:
 *   1행    타이틀        남색 밴드 + 화이트 볼드 (merge)
 *   2~N행  안내 노트      화이트 배경 + 슬레이트 회색 (형광 제거)
 *   N+1행  스페이서       얇은 흰 줄
 *   N+2행  그룹 색 띠      남색=필수 / 회색=선택 (연속 구간 merge)
 *   N+3행  헤더           남색 솔리드 + 화이트 볼드 (필수엔 *)
 *   N+4행  예시           연한 고스트 행 (italic) — 금액은 #,##0
 *   N+5~   빈 입력 행      지브라 스트라이프 + 옅은 그리드, 금액칸 천단위 서식
 *
 * 헤더행에 오토필터. 금액 컬럼은 숫자서식(#,##0)이 셀에 박혀 사용자 입력도 자동 콤마.
 * 모든 셀 맑은 고딕.
 */

import * as XLSX from 'xlsx-js-style';
import type { ColumnSpec, HorizontalTemplateSpec } from './import-schema';

type Cell = { v: string | number; s?: Record<string, unknown> };

const FONT = '맑은 고딕';

/* ── 팔레트 (모던 미니멀) ── */
const NAVY = '1B2A4A';       // 브랜드 남색 (헤더/타이틀)
const NAVY_TINT = 'E8EEF6';  // 필수 그룹 띠
const SLATE = '64748B';      // 노트/보조 텍스트
const SLATE_TINT = 'F1F3F5'; // 선택 그룹 띠
const SAMPLE_BG = 'F8FAFC';  // 예시행 배경
const SAMPLE_TX = '94A3B8';  // 예시행 텍스트
const INK = '1F2937';        // 입력 텍스트
const ZEBRA = 'FAFBFC';      // 지브라 행
const GRID = 'EEF1F4';       // 옅은 그리드
const WHITE = 'FFFFFF';

/* 금액 컬럼(천단위 콤마 + 우측정렬) 판별 */
const AMOUNT_FIELDS = new Set([
  'monthlyRent', 'deposit', 'unpaidAmount', 'currentUnpaid', 'amount',
  'withdraw', 'balance', 'totalAmount', 'price', 'monthlyFee',
]);
const isAmount = (f?: string) => !!f && AMOUNT_FIELDS.has(f);

const border = (rgb = GRID) => ({
  top: { style: 'thin', color: { rgb } },
  bottom: { style: 'thin', color: { rgb } },
  left: { style: 'thin', color: { rgb } },
  right: { style: 'thin', color: { rgb } },
});

const styleTitle = {
  font: { name: FONT, sz: 15, bold: true, color: { rgb: WHITE } },
  alignment: { horizontal: 'center', vertical: 'center' },
  fill: { patternType: 'solid', fgColor: { rgb: NAVY } },
};

const styleNote = {
  font: { name: FONT, sz: 9, color: { rgb: SLATE } },
  alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  fill: { patternType: 'solid', fgColor: { rgb: WHITE } },
};

const styleSpacer = { fill: { patternType: 'solid', fgColor: { rgb: WHITE } } };

const styleGroup = (required: boolean) => ({
  font: { name: FONT, sz: 9, bold: true, color: { rgb: required ? NAVY : SLATE } },
  alignment: { horizontal: 'center', vertical: 'center' },
  fill: { patternType: 'solid', fgColor: { rgb: required ? NAVY_TINT : SLATE_TINT } },
});

const styleHeader = {
  font: { name: FONT, sz: 10.5, bold: true, color: { rgb: WHITE } },
  alignment: { horizontal: 'center', vertical: 'center' },
  fill: { patternType: 'solid', fgColor: { rgb: NAVY } },
  border: border(NAVY),
};

const styleSample = (amount: boolean) => ({
  font: { name: FONT, sz: 10, italic: true, color: { rgb: SAMPLE_TX } },
  alignment: { horizontal: amount ? 'right' : 'left', vertical: 'center' },
  fill: { patternType: 'solid', fgColor: { rgb: SAMPLE_BG } },
  border: border(),
  ...(amount ? { numFmt: '#,##0' } : {}),
});

const styleCell = (amount: boolean, zebra: boolean) => ({
  font: { name: FONT, sz: 10, color: { rgb: INK } },
  alignment: { horizontal: amount ? 'right' : 'left', vertical: 'center' },
  fill: { patternType: 'solid', fgColor: { rgb: zebra ? ZEBRA : WHITE } },
  border: border(),
  ...(amount ? { numFmt: '#,##0' } : {}),
});

/* 필수/선택 연속 구간 → 그룹 색 띠 merge 용 */
function runsOf(columns: ColumnSpec[]) {
  const runs: { start: number; end: number; required: boolean }[] = [];
  columns.forEach((c, i) => {
    const req = !!c.required;
    const last = runs[runs.length - 1];
    if (last && last.required === req) last.end = i;
    else runs.push({ start: i, end: i, required: req });
  });
  return runs;
}

/* 금액 예시값을 실제 숫자로(서식 적용되게) */
function sampleValue(c: ColumnSpec): string | number {
  if (isAmount(c.field) && c.example != null && /^\d+$/.test(String(c.example))) return Number(c.example);
  return c.example ?? '';
}

export function downloadTemplate(
  filename: string,
  columns: ColumnSpec[],
  opts: {
    title: string;       // 예: '계약 일괄 등록 양식'
    notes?: string[];    // 안내 노트 (선택)
    emptyRows?: number;  // 빈 행 수 (기본 20)
  },
) {
  const ncols = columns.length;
  const lastCol = colLetter(ncols - 1);
  const rows: Cell[][] = [];
  const merges: XLSX.Range[] = [];
  const reqCount = columns.filter((c) => c.required).length;

  // 1) 타이틀
  rows.push([{ v: opts.title, s: styleTitle }, ...filler(ncols - 1, { s: styleTitle })]);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: ncols - 1 } });

  // 2) 안내 노트
  const notes: string[] = [
    `필수 ${reqCount}개 · 선택 ${ncols - reqCount}개  —  아래 색 띠로 구분 (남색 = 필수, 회색 = 선택)`,
    ...(opts.notes ?? []),
    `금액은 숫자만 — 천단위 콤마 자동. 회색 예시 행은 지우고 그 아래부터 입력하세요.`,
  ];
  for (const note of notes) {
    const r = rows.length;
    rows.push([{ v: note, s: styleNote }, ...filler(ncols - 1, { s: styleNote })]);
    merges.push({ s: { r, c: 0 }, e: { r, c: ncols - 1 } });
  }

  // 3) 스페이서
  rows.push(filler(ncols, { s: styleSpacer }));

  // 4) 그룹 색 띠 (필수/선택)
  const bandIdx = rows.length;
  const band: Cell[] = columns.map((c) => ({ v: '', s: styleGroup(!!c.required) }));
  for (const run of runsOf(columns)) {
    band[run.start] = { v: run.required ? '● 필수 입력' : '선택', s: styleGroup(run.required) };
    if (run.end > run.start) merges.push({ s: { r: bandIdx, c: run.start }, e: { r: bandIdx, c: run.end } });
  }
  rows.push(band);

  // 5) 헤더
  const headerIdx = rows.length;
  rows.push(columns.map((c) => ({ v: `${c.label}${c.required ? ' *' : ''}`, s: styleHeader })));

  // 6) 예시 (고스트)
  rows.push(columns.map((c) => ({ v: sampleValue(c), s: styleSample(isAmount(c.field)) })));

  // 7) 빈 입력 행 (지브라)
  const emptyN = opts.emptyRows ?? 20;
  for (let i = 0; i < emptyN; i++) {
    rows.push(columns.map((c) => ({ v: '', s: styleCell(isAmount(c.field), i % 2 === 1) })));
  }

  const ws = buildSheet(rows, merges);

  // 컬럼 너비 — 금액칸은 넉넉히
  ws['!cols'] = columns.map((c) => ({
    wch: isAmount(c.field)
      ? 14
      : Math.max(10, Math.min(28, Math.max(c.label.length + 3, String(c.example ?? '').length + 2))),
  }));

  // 행 높이
  ws['!rows'] = rows.map((_, i) => {
    if (i === 0) return { hpt: 30 };            // 타이틀
    if (i <= notes.length) return { hpt: 16 };  // 노트
    if (i === notes.length + 1) return { hpt: 6 };  // 스페이서
    if (i === bandIdx) return { hpt: 18 };      // 그룹 띠
    if (i === headerIdx) return { hpt: 24 };    // 헤더
    return { hpt: 19 };
  });

  // 오토필터 (헤더행)
  ws['!autofilter'] = { ref: `A${headerIdx + 1}:${lastCol}${rows.length}` };
  ws['!ref'] = `A1:${lastCol}${rows.length}`;

  writeBook(ws, filename);
}

function filler(n: number, cell: Partial<Cell> = {}): Cell[] {
  return Array.from({ length: n }, () => ({ v: '', ...cell }));
}

/* ─────────────── Horizontal 양식 (좌측 고정 + 우측 블록 반복) ─────────────── */
const styleBlockLabel = (kind: 'fixed' | 'even' | 'odd') => ({
  font: { name: FONT, sz: 9, bold: true, color: { rgb: kind === 'odd' ? SLATE : NAVY } },
  alignment: { horizontal: 'center', vertical: 'center' },
  fill: { patternType: 'solid', fgColor: { rgb: kind === 'odd' ? SLATE_TINT : NAVY_TINT } },
});

export function downloadHorizontalTemplate(spec: HorizontalTemplateSpec, opts: { emptyRows?: number } = {}) {
  const { fixedColumns, blockColumns, blockRepeat, title, notes, filename } = spec;
  const totalCols = fixedColumns.length + blockColumns.length * blockRepeat;
  const lastCol = colLetter(totalCols - 1);
  const rows: Cell[][] = [];
  const merges: XLSX.Range[] = [];

  // 1) 타이틀
  rows.push([{ v: title, s: styleTitle }, ...filler(totalCols - 1, { s: styleTitle })]);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } });

  // 2) 노트
  const allNotes = [
    `좌측 ${fixedColumns.length}칸 고정 + 우측 ${blockColumns.length}칸 블록 × ${blockRepeat}회 반복  —  * 표시 = 필수`,
    ...notes,
    `금액은 숫자만 — 천단위 콤마 자동.`,
  ];
  for (const note of allNotes) {
    const r = rows.length;
    rows.push([{ v: note, s: styleNote }, ...filler(totalCols - 1, { s: styleNote })]);
    merges.push({ s: { r, c: 0 }, e: { r, c: totalCols - 1 } });
  }

  // 3) 스페이서
  rows.push(filler(totalCols, { s: styleSpacer }));

  // 4) 블록 라벨 행 (고정 / 1 / 2 / ...)
  const labelIdx = rows.length;
  const blockLabelRow: Cell[] = [];
  blockLabelRow.push({ v: '고정', s: styleBlockLabel('fixed') });
  for (let i = 1; i < fixedColumns.length; i++) blockLabelRow.push({ v: '', s: styleBlockLabel('fixed') });
  if (fixedColumns.length > 1) {
    merges.push({ s: { r: labelIdx, c: 0 }, e: { r: labelIdx, c: fixedColumns.length - 1 } });
  }
  for (let b = 0; b < blockRepeat; b++) {
    const startCol = fixedColumns.length + b * blockColumns.length;
    const kind = b % 2 === 0 ? 'even' : 'odd';
    blockLabelRow.push({ v: `${b + 1}`, s: styleBlockLabel(kind) });
    for (let i = 1; i < blockColumns.length; i++) blockLabelRow.push({ v: '', s: styleBlockLabel(kind) });
    if (blockColumns.length > 1) {
      merges.push({ s: { r: labelIdx, c: startCol }, e: { r: labelIdx, c: startCol + blockColumns.length - 1 } });
    }
  }
  rows.push(blockLabelRow);

  // 5) 헤더 (남색 통일)
  const headerIdx = rows.length;
  const headerRow: Cell[] = [];
  for (const c of fixedColumns) headerRow.push({ v: `${c.label}${c.required ? ' *' : ''}`, s: styleHeader });
  for (let b = 0; b < blockRepeat; b++) {
    for (const c of blockColumns) headerRow.push({ v: `${c.label}${c.required ? ' *' : ''}`, s: styleHeader });
  }
  rows.push(headerRow);

  // 6) 예시 1행 (첫 블록만)
  const sampleRow: Cell[] = [];
  for (const c of fixedColumns) sampleRow.push({ v: sampleValue(c), s: styleSample(isAmount(c.field)) });
  for (let b = 0; b < blockRepeat; b++) {
    for (const c of blockColumns) {
      sampleRow.push({ v: b === 0 ? sampleValue(c) : '', s: styleSample(isAmount(c.field)) });
    }
  }
  rows.push(sampleRow);

  // 7) 빈 입력 행 (지브라)
  const emptyN = opts.emptyRows ?? 30;
  const allCols = [...fixedColumns, ...Array.from({ length: blockRepeat }, () => blockColumns).flat()];
  for (let i = 0; i < emptyN; i++) {
    rows.push(allCols.map((c) => ({ v: '', s: styleCell(isAmount(c.field), i % 2 === 1) })));
  }

  const ws = buildSheet(rows, merges);

  // 컬럼 너비
  const widths: { wch: number }[] = [];
  for (const c of fixedColumns) widths.push({ wch: isAmount(c.field) ? 14 : Math.max(10, Math.min(28, c.label.length + 4)) });
  for (let b = 0; b < blockRepeat; b++) {
    for (const c of blockColumns) widths.push({ wch: isAmount(c.field) ? 13 : Math.max(9, Math.min(22, c.label.length + 2)) });
  }
  ws['!cols'] = widths;

  // 행 높이
  ws['!rows'] = rows.map((_, i) => {
    if (i === 0) return { hpt: 30 };
    if (i <= allNotes.length) return { hpt: 16 };
    if (i === allNotes.length + 1) return { hpt: 6 };
    if (i === labelIdx) return { hpt: 18 };
    if (i === headerIdx) return { hpt: 24 };
    return { hpt: 19 };
  });

  ws['!autofilter'] = { ref: `A${headerIdx + 1}:${lastCol}${rows.length}` };
  ws['!ref'] = `A1:${lastCol}${rows.length}`;

  writeBook(ws, filename);
}

/* ─────────────── 공용 ─────────────── */
function buildSheet(rows: Cell[][], merges: XLSX.Range[]) {
  const aoa = rows.map((r) => r.map((c) => c.v));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) continue;
      cell.s = rows[r][c].s ?? styleSpacer;
    }
  }
  ws['!merges'] = merges;
  return ws;
}

function writeBook(ws: XLSX.WorkSheet, filename: string) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '양식');
  XLSX.writeFile(wb, filename);
}

function colLetter(idx: number): string {
  let s = '';
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}
