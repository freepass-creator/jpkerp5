/**
 * 보험증권 list 엑셀 다운로드 — JPK ERP 톤.
 * 1~6회차 + 전체 담보 + 자동이체 정보 모두 포함.
 */

import * as XLSX from 'xlsx-js-style';
import type { Vehicle, InsurancePolicy } from './types';
import { displayCompanyName } from './company-display';
import { todayKr } from './mock-data';
import {
  STYLE_TITLE, STYLE_META, STYLE_HEADER, STYLE_CELL, STYLE_MONO,
  STYLE_CENTER, STYLE_NUM, STYLE_BRAND_NUM, STYLE_DATE,
} from './excel-style';

type Row = { v: Vehicle; policy?: InsurancePolicy | undefined };

type CompanyMaster = Parameters<typeof displayCompanyName>[1];

type Cell = { v: string | number; s?: Record<string, unknown>; t?: string };

/** 헤더 정의 — label, key, width, style */
const COLUMNS: Array<{ label: string; w: number; align?: 'num' | 'mono' | 'date' | 'center'; brand?: boolean }> = [
  { label: '회사',          w: 12 },
  { label: '차량번호',      w: 12, align: 'mono' },
  { label: '차명',          w: 18 },
  { label: '보험사',        w: 14 },
  { label: '상품명',        w: 28 },
  { label: '증권번호',      w: 20, align: 'mono' },
  { label: '계약자',        w: 14 },
  { label: '피보험자',      w: 14 },
  { label: '사업자번호',    w: 16, align: 'mono' },
  { label: '시작일',        w: 12, align: 'date' },
  { label: '만기일',        w: 12, align: 'date' },
  { label: '운전자범위',    w: 14 },
  { label: '운전가능연령',  w: 14 },
  { label: '연식',          w: 8,  align: 'num' },
  { label: '배기량',        w: 10, align: 'num' },
  { label: '승차정원',      w: 8,  align: 'num' },
  { label: '차량가액(만원)',w: 12, align: 'num' },
  { label: '대인배상Ⅰ',     w: 14 },
  { label: '대인배상Ⅱ',     w: 14 },
  { label: '대물배상',      w: 14 },
  { label: '자기신체사고',  w: 18 },
  { label: '무보험차상해',  w: 14 },
  { label: '자기차량손해',  w: 14 },
  { label: '긴급출동',      w: 18 },
  { label: '1회차(산출)',   w: 14, align: 'num', brand: true },
  { label: '2회차',         w: 13, align: 'num' },
  { label: '3회차',         w: 13, align: 'num' },
  { label: '4회차',         w: 13, align: 'num' },
  { label: '5회차',         w: 13, align: 'num' },
  { label: '6회차',         w: 13, align: 'num' },
  { label: '총보험료',      w: 14, align: 'num', brand: true },
  { label: '이체은행',      w: 14 },
  { label: '이체계좌',      w: 18, align: 'mono' },
  { label: '이체예금주',    w: 14 },
];

function styleFor(col: typeof COLUMNS[number], val: string | number): Record<string, unknown> {
  if (col.brand) return STYLE_BRAND_NUM;
  if (col.align === 'num') return STYLE_NUM;
  if (col.align === 'mono') return STYLE_MONO;
  if (col.align === 'date') return STYLE_DATE;
  if (col.align === 'center') return STYLE_CENTER;
  // 자유 텍스트인데 숫자만 있는 케이스 회피
  return typeof val === 'number' ? STYLE_NUM : STYLE_CELL;
}

function cyc(p: InsurancePolicy | undefined, n: number): number | '' {
  return p?.installments?.find((i) => i.cycle === n)?.amount ?? '';
}

export function downloadInsuranceExcel(
  rows: Row[],
  companyMaster: CompanyMaster,
  opts?: { fileName?: string; title?: string },
): { ok: true; count: number } | { ok: false; reason: 'empty' } {
  if (rows.length === 0) return { ok: false, reason: 'empty' };

  const title = opts?.title ?? '보험증권 일람';
  const meta = `생성일: ${todayKr()} · 총 ${rows.length}건`;

  // 1) 타이틀 (전체 폭 merge)
  // 2) 메타 (전체 폭 merge)
  // 3) 빈 행
  // 4) 헤더
  // 5+: 데이터
  const aoa: Cell[][] = [];

  // row 0 — title
  const titleRow: Cell[] = COLUMNS.map((_, idx) => ({ v: idx === 0 ? title : '', s: STYLE_TITLE }));
  aoa.push(titleRow);

  // row 1 — meta
  const metaRow: Cell[] = COLUMNS.map((_, idx) => ({ v: idx === 0 ? meta : '', s: STYLE_META }));
  aoa.push(metaRow);

  // row 2 — blank
  aoa.push(COLUMNS.map(() => ({ v: '', s: STYLE_CELL })));

  // row 3 — header
  aoa.push(COLUMNS.map((c) => ({ v: c.label, s: STYLE_HEADER })));

  // 데이터
  for (const { v, policy: p } of rows) {
    const values: (string | number)[] = [
      v.company ? displayCompanyName(v.company, companyMaster) : '',
      v.plate ?? '',
      v.vehicleModelLine || v.model || '',
      p?.insurer ?? v.insuranceCompany ?? '',
      p?.productName ?? '',
      p?.policyNo ?? v.insurancePolicyNo ?? '',
      p?.contractor ?? '',
      p?.insured ?? '',
      p?.bizNo ?? '',
      p?.startDate ?? '',
      p?.endDate ?? v.insuranceExpiryDate ?? '',
      p?.driverScope ?? '',
      p?.driverAge ?? '',
      p?.carYear ?? '',
      p?.displacement ?? '',
      p?.seats ?? '',
      p?.vehicleValueMan ?? '',
      p?.covPersonal1 ?? '',
      p?.covPersonal2 ?? '',
      p?.covProperty ?? '',
      p?.covSelfAccident ?? '',
      p?.covUninsured ?? '',
      p?.covSelfVehicle ?? '',
      p?.covEmergency ?? '',
      cyc(p, 1),
      cyc(p, 2),
      cyc(p, 3),
      cyc(p, 4),
      cyc(p, 5),
      cyc(p, 6),
      p?.totalPremium ?? '',
      p?.autoDebitBank ?? '',
      p?.autoDebitAccount ?? '',
      p?.autoDebitHolder ?? '',
    ];
    aoa.push(values.map((val, idx) => ({ v: val, s: styleFor(COLUMNS[idx], val) })));
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // 컬럼 폭
  ws['!cols'] = COLUMNS.map((c) => ({ wch: c.w }));

  // merge — title + meta 행 전체 폭
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: COLUMNS.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: COLUMNS.length - 1 } },
  ];

  // 행 높이 (title 28, meta 18, header 28, 데이터 20)
  ws['!rows'] = [{ hpt: 28 }, { hpt: 18 }, { hpt: 8 }, { hpt: 28 }];

  // freeze pane (헤더 4행 + 좌측 차량번호 2열 고정)
  ws['!views'] = [{ ySplit: 4, xSplit: 2, topLeftCell: 'C5', state: 'frozen' }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '보험증권');
  const fileName = opts?.fileName ?? `보험증권_${rows.length}건_${todayKr()}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { ok: true, count: rows.length };
}
