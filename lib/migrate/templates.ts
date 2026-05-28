/**
 * 계약이력 / 수납이력 horizontal 양식 파서 + 적용기
 *
 * 양식:
 *   계약이력: [차량번호] | [구분|고객명|인도일자|종료일자|반납일자|대여료|보증금|영업자] × N
 *   수납이력: [차량번호|계약자등록번호] | [청구금액|결제금액|결제일자|결제수단|미납금액] × N
 *
 * 1행 = 1차량(또는 1차량+1계약자). 우측 블록이 반복 = 직전 이력.
 */

import * as XLSX from 'xlsx-js-style';
import type { Contract, PaymentEntry, PaymentScheduleInline } from '@/lib/types';
import { CONTRACT_HISTORY_TEMPLATE, RECEIPT_HISTORY_TEMPLATE } from '@/lib/import-schema';
import { toDate as normalizeDate } from '@/lib/parse-helpers';
import { generateSchedules, distributeUnpaid } from '@/lib/payment-schedule';

/* ─────────────── 공통 유틸 ─────────────── */

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
}

function cellNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Math.round(v);
  const s = String(v).replace(/[^\d.-]/g, '');
  const n = Number(s);
  return isFinite(n) ? Math.round(n) : 0;
}

function normPlate(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

function normIdent(s: string): string {
  return s.replace(/[\s-]/g, '');
}

/** 등록번호 자릿수로 customer kind 추정 */
function inferKind(ident: string): '개인' | '사업자' | '법인' | undefined {
  const digits = normIdent(ident).replace(/\D/g, '');
  if (digits.length === 13) return '개인';
  if (digits.length === 10) return '사업자';
  if (digits.length === 12) return '법인';
  return undefined;
}

/* ─────────────── 계약이력 파서 ─────────────── */

export type ParsedContractRow = {
  vehiclePlate: string;
  company: string;
  vehicleModel: string;
  vehicleStatus: string;
  currentUnpaid: number;
  blocks: Array<{
    kind?: string;
    customerName: string;
    customerPhone1: string;
    deliveredDate: string;
    returnScheduledDate: string;
    returnedDate: string;
    monthlyRent: number;
    deposit: number;
    paymentDay: number;
    salesperson: string;
  }>;
};

export async function parseContractHistory(file: File): Promise<ParsedContractRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('시트가 비어있음');

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: null }) as unknown[][];

  // 헤더 행 찾기 — '차량번호' 가 들어간 행
  const headerRowIdx = aoa.findIndex((r) => r.some((v) => cellStr(v).includes('차량번호')));
  if (headerRowIdx < 0) throw new Error("'차량번호' 헤더를 찾을 수 없음");

  const headers = aoa[headerRowIdx].map(cellStr);
  const plateIdx = headers.findIndex((h) => h === '차량번호');
  const companyIdx = headers.findIndex((h) => h === '회사');
  const modelIdx = headers.findIndex((h) => h === '차종');
  const vstatusIdx = headers.findIndex((h) => h === '차량상태');
  const unpaidIdx = headers.findIndex((h) => h === '현재미수');
  // 첫 블록 컬럼 시작 인덱스 — '구분' 첫 등장
  const blockStartIdx = headers.findIndex((h) => h === '구분');
  if (blockStartIdx < 0) throw new Error("'구분' 컬럼을 찾을 수 없음");

  const blockSize = CONTRACT_HISTORY_TEMPLATE.blockColumns.length;  // 10
  const blockCount = Math.floor((headers.length - blockStartIdx) / blockSize);

  const dataRows = aoa.slice(headerRowIdx + 1);
  const out: ParsedContractRow[] = [];

  for (const r of dataRows) {
    const plate = cellStr(r[plateIdx >= 0 ? plateIdx : 0]);
    if (!plate) continue;

    const blocks: ParsedContractRow['blocks'] = [];
    for (let b = 0; b < blockCount; b++) {
      const base = blockStartIdx + b * blockSize;
      const name = cellStr(r[base + 1]);
      if (!name) continue;  // 고객명 없으면 블록 skip
      blocks.push({
        kind: cellStr(r[base + 0]) || undefined,
        customerName: name,
        customerPhone1: cellStr(r[base + 2]),
        deliveredDate: normalizeDate(cellStr(r[base + 3])) || '',
        returnScheduledDate: normalizeDate(cellStr(r[base + 4])) || '',
        returnedDate: normalizeDate(cellStr(r[base + 5])) || '',
        monthlyRent: cellNum(r[base + 6]),
        deposit: cellNum(r[base + 7]),
        paymentDay: cellNum(r[base + 8]),
        salesperson: cellStr(r[base + 9]),
      });
    }
    out.push({
      vehiclePlate: plate,
      company: companyIdx >= 0 ? cellStr(r[companyIdx]) : '',
      vehicleModel: modelIdx >= 0 ? cellStr(r[modelIdx]) : '',
      vehicleStatus: vstatusIdx >= 0 ? cellStr(r[vstatusIdx]) : '',
      currentUnpaid: unpaidIdx >= 0 ? cellNum(r[unpaidIdx]) : 0,
      blocks,
    });
  }

  return out;
}

/* ─────────────── 계약이력 적용기 ─────────────── */

export type ApplyContractResult = {
  contractsCreated: number;
  contractsUpdated: number;
  vehiclesTouched: number;
};

/**
 * 파싱 결과를 Contract[] 로 변환. 기존 contracts와 차량번호+계약자명 기준으로 dedupe.
 * 반환 — RTDB에 일괄 set 할 newContracts (id 미발급).
 */
export type IdleVehicle = {
  plate: string;
  model: string;
  company: Contract['company'];
  status: Contract['vehicleStatus'];
  notes: string;
};

export function buildContractsFromParsed(
  rows: ParsedContractRow[],
  existing: Contract[],
  existingVehiclePlates: Set<string>,
  fallbackCompany: Contract['company'] = '기타',
): {
  newOrUpdated: Array<Omit<Contract, 'id'> & { _existingId?: string }>;
  idleVehicles: IdleVehicle[];
  touched: Set<string>;
} {
  const today = new Date().toISOString().slice(0, 10);
  const touched = new Set<string>();
  const out: Array<Omit<Contract, 'id'> & { _existingId?: string }> = [];
  const idleVehicles: IdleVehicle[] = [];

  // 기존 인덱스
  const byPlatePerson = new Map<string, Contract>();
  for (const c of existing) {
    byPlatePerson.set(`${normPlate(c.vehiclePlate)}|${c.customerName.trim()}`, c);
  }

  let contractSeq = existing.length;

  for (const row of rows) {
    touched.add(normPlate(row.vehiclePlate));
    const rowCompany = (row.company?.trim() || fallbackCompany) as Contract['company'];

    // 휴차 차량 — 블록 0개. vehicles 노드에 등록 (운영현황 orphan으로 표시)
    if (row.blocks.length === 0) {
      const plateKey = row.vehiclePlate.trim();
      if (!existingVehiclePlates.has(plateKey)) {
        const idleStatus = (row.vehicleStatus?.trim() || '휴차대기') as Contract['vehicleStatus'];
        idleVehicles.push({
          plate: row.vehiclePlate,
          model: row.vehicleModel || '',
          company: rowCompany,
          status: idleStatus,
          notes: '계약이력 업로드 — 휴차',
        });
      }
      continue;
    }

    // 첫 블록 = 현재 계약자(반납일 없으면).
    const isFirstActive = row.blocks[0] && !row.blocks[0].returnedDate;

    for (let bi = 0; bi < row.blocks.length; bi++) {
      const b = row.blocks[bi];
      const isCurrent = bi === 0 && isFirstActive;
      const key = `${normPlate(row.vehiclePlate)}|${b.customerName.trim()}`;
      const exist = byPlatePerson.get(key);

      const contractDate = b.deliveredDate || today;
      const returnSch = b.returnScheduledDate || addMonths(contractDate, 12);
      const termMonths = monthDiff(contractDate, returnSch);
      const paymentDay = b.paymentDay > 0 ? b.paymentDay : (parseInt(contractDate.slice(8, 10), 10) || 1);

      // 차량상태: 명시값 우선, 없으면 자동 (반납일 유무로)
      const autoVStatus: Contract['vehicleStatus'] = isCurrent ? '운행' : (b.returnedDate ? '반납' : '운행');
      const rowVStatus = (row.vehicleStatus?.trim() || autoVStatus) as Contract['vehicleStatus'];
      // status (계약상태)도 차량상태에 맞춰 결정
      const contractStatus: Contract['status'] = b.returnedDate ? '반납' : (rowVStatus === '운행' || rowVStatus === '인도대기' || rowVStatus === '출고대기' ? '운행' : '대기');

      const base: Omit<Contract, 'id'> = {
        contractNo: exist?.contractNo ?? `ICR-${contractDate.slice(2, 7).replace('-', '')}-${String(++contractSeq).padStart(4, '0')}`,
        company: rowCompany,
        manager: b.salesperson || exist?.manager,
        customerName: b.customerName,
        customerKind: (b.kind as '개인' | '사업자' | '법인' | undefined) ?? exist?.customerKind,
        customerIdentNo: exist?.customerIdentNo,
        customerPhone1: b.customerPhone1 || exist?.customerPhone1 || '',
        vehiclePlate: row.vehiclePlate,
        vehicleModel: row.vehicleModel || exist?.vehicleModel || '',
        vehicleStatus: rowVStatus,
        contractDate,
        deliveredDate: b.deliveredDate || undefined,
        returnScheduledDate: returnSch,
        returnedDate: b.returnedDate || undefined,
        termMonths: Math.max(1, termMonths),
        longTerm: termMonths >= 12,
        monthlyRent: b.monthlyRent,
        deposit: b.deposit,
        paymentDay: Math.min(31, Math.max(1, paymentDay)),
        paymentMethod: exist?.paymentMethod ?? '이체',
        status: contractStatus,
        notes: exist?.notes,
        currentSeq: 1,
        totalSeq: Math.max(1, termMonths),
        unpaidAmount: 0,
        unpaidSeqCount: 0,
        lastPaidDate: exist?.lastPaidDate,
        schedules: exist?.schedules,
      };

      // 신규 schedule — 없을 때만 (있으면 그대로 둠 — 수납이력으로 덮음)
      if (!base.schedules && base.monthlyRent > 0) {
        const sch = generateSchedules({
          contractDate: base.contractDate,
          termMonths: base.termMonths,
          monthlyRent: base.monthlyRent,
          paymentDay: base.paymentDay,
        });
        let inlineList: PaymentScheduleInline[] = sch.map((s, i) => ({ ...s, id: `s${i + 1}` }) as PaymentScheduleInline);

        if (isCurrent && row.currentUnpaid > 0) {
          // 현재 계약자 + 미수 입력 있음 → 직전 회차부터 역순으로 자동 미납/부분납
          // lastPaidDate 비워두고 오늘 기준으로 미수 분배 (오늘 이전 회차들이 채워짐)
          inlineList = distributeUnpaid(inlineList, row.currentUnpaid, today);
          base.unpaidAmount = row.currentUnpaid;
          base.unpaidSeqCount = inlineList.filter((s) => s.status === '연체' || s.status === '부분납').length;
          const lastCompleted = inlineList.filter((s) => s.status === '완료').sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];
          if (lastCompleted) base.lastPaidDate = lastCompleted.paidAt ?? lastCompleted.dueDate;
        } else if (!exist?.lastPaidDate && !b.returnedDate) {
          // 수납이력 업로드 안 한 계약 + 미수 0 → lastPaidDate = 오늘
          // 오늘 기준 이전 회차는 정산 entry로 자동 완료 처리
          inlineList = distributeUnpaid(inlineList, 0, today, today);
          base.lastPaidDate = today;
        }
        base.schedules = inlineList;
      }

      out.push({ ...base, _existingId: exist?.id });
    }
  }

  return { newOrUpdated: out, idleVehicles, touched };
}

/* ─────────────── 수납이력 파서 ─────────────── */

export type ParsedReceiptRow = {
  vehiclePlate: string;
  customerIdentNo: string;
  payments: Array<{
    charged: number;
    amount: number;
    paymentDate: string;
    method: string;
    unpaidAmount: number;
  }>;
};

export async function parseReceiptHistory(file: File): Promise<ParsedReceiptRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('시트가 비어있음');

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: null }) as unknown[][];

  const headerRowIdx = aoa.findIndex((r) => r.some((v) => cellStr(v).includes('차량번호')));
  if (headerRowIdx < 0) throw new Error("'차량번호' 헤더를 찾을 수 없음");

  const headers = aoa[headerRowIdx].map(cellStr);
  // 첫 블록 시작 — '청구금액' 첫 등장
  const blockStartIdx = headers.findIndex((h) => h === '청구금액');
  if (blockStartIdx < 0) throw new Error("'청구금액' 컬럼을 찾을 수 없음");

  const blockSize = RECEIPT_HISTORY_TEMPLATE.blockColumns.length;  // 5
  const blockCount = Math.floor((headers.length - blockStartIdx) / blockSize);

  const dataRows = aoa.slice(headerRowIdx + 1);
  const out: ParsedReceiptRow[] = [];

  for (const r of dataRows) {
    const plate = cellStr(r[0]);
    const ident = cellStr(r[1]);
    if (!plate) continue;

    const payments: ParsedReceiptRow['payments'] = [];
    for (let b = 0; b < blockCount; b++) {
      const base = blockStartIdx + b * blockSize;
      const paymentDate = normalizeDate(cellStr(r[base + 2]));
      if (!paymentDate) continue;  // 결제일자 없으면 skip
      payments.push({
        charged: cellNum(r[base + 0]),
        amount: cellNum(r[base + 1]),
        paymentDate,
        method: cellStr(r[base + 3]),
        unpaidAmount: cellNum(r[base + 4]),
      });
    }
    out.push({ vehiclePlate: plate, customerIdentNo: ident, payments });
  }

  return out;
}

/* ─────────────── 수납이력 적용기 ─────────────── */

export type ApplyReceiptResult = {
  paymentsAdded: number;
  contractsBackfilled: number;
  unmatchedRows: ParsedReceiptRow[];
};

function mapMethod(m: string): PaymentEntry['source'] {
  const t = (m || '').toLowerCase();
  if (t.includes('카드')) return '카드';
  if (t.includes('현금')) return '현금';
  if (t.includes('cms') || t.includes('이체') || t.includes('계좌') || t.includes('입금') || t.includes('자동')) return '계좌';
  return '수동';
}

/**
 * 수납이력을 기존 contracts에 매칭해서 schedule.payments에 push.
 * 매칭 우선순위:
 *   1) (차량번호 + 등록번호) 정확 매칭
 *   2) 같은 차량의 contracts 중 등록번호가 비어있는 경우 → 등록번호 백필
 *   3) 매칭 실패 → unmatched로 보고
 */
export function applyReceiptsToContracts(
  rows: ParsedReceiptRow[],
  existing: Contract[],
): { writeBatch: Record<string, Contract>; result: ApplyReceiptResult } {
  const writeBatch: Record<string, Contract> = {};
  const unmatched: ParsedReceiptRow[] = [];
  let paymentsAdded = 0;
  let contractsBackfilled = 0;

  // 기존 인덱스 — plate별 contracts
  const byPlate = new Map<string, Contract[]>();
  for (const c of existing) {
    const k = normPlate(c.vehiclePlate);
    const arr = byPlate.get(k) ?? [];
    arr.push(c);
    byPlate.set(k, arr);
  }

  for (const row of rows) {
    const plateK = normPlate(row.vehiclePlate);
    const identK = normIdent(row.customerIdentNo);
    const candidates = byPlate.get(plateK) ?? [];
    if (candidates.length === 0) {
      unmatched.push(row);
      continue;
    }

    // 1) 등록번호 정확 매칭
    let target = candidates.find((c) => c.customerIdentNo && normIdent(c.customerIdentNo) === identK);

    // 2) 등록번호 빈 계약 + 같은 차량 — 백필
    if (!target) {
      target = candidates.find((c) => !c.customerIdentNo);
      if (target && identK) {
        target = { ...target, customerIdentNo: row.customerIdentNo, customerKind: target.customerKind ?? inferKind(row.customerIdentNo) };
        contractsBackfilled += 1;
      }
    }

    // 3) 그래도 없으면 = 가장 최근 계약(returnedDate 없는 운행) 또는 첫번째
    if (!target) {
      target = candidates.find((c) => !c.returnedDate) ?? candidates[0];
    }

    if (!target) {
      unmatched.push(row);
      continue;
    }

    // schedule이 없으면 생성
    const schedules: PaymentScheduleInline[] = writeBatch[target.id]?.schedules ?? target.schedules ?? [];
    let scheduleList = [...schedules];
    if (scheduleList.length === 0 && target.monthlyRent > 0) {
      const gen = generateSchedules({
        contractDate: target.contractDate,
        termMonths: Math.max(1, target.termMonths),
        monthlyRent: target.monthlyRent,
        paymentDay: target.paymentDay,
      });
      scheduleList = gen.map((s, i) => ({ ...s, id: `s${i + 1}` }) as PaymentScheduleInline);
    }

    // 각 결제를 가장 가까운 schedule.dueDate에 매칭. 없으면 첫 schedule.
    for (const p of row.payments) {
      const idx = pickClosestSchedule(scheduleList, p.paymentDate);
      if (idx < 0) continue;
      const entry: PaymentEntry = {
        date: p.paymentDate,
        amount: p.amount,
        source: mapMethod(p.method),
        memo: p.method || undefined,
      };
      const sc = scheduleList[idx];
      const payments = [...(sc.payments ?? []), entry];
      const paid = payments.reduce((sum, e) => sum + e.amount, 0);
      const lastDate = payments.map((e) => e.date).sort().pop();
      const newStatus: PaymentScheduleInline['status'] =
        paid >= sc.amount ? '완료' : paid > 0 ? '부분납' : sc.status;
      scheduleList[idx] = { ...sc, payments, paidAmount: paid, paidAt: lastDate, status: newStatus };
      paymentsAdded += 1;
    }

    // 캐시 재계산
    const todayK = new Date().toISOString().slice(0, 10);
    const unpaid = scheduleList.reduce((sum, s) => {
      if (s.dueDate > todayK) return sum;
      if (s.status === '완료' || s.status === '면제') return sum;
      return sum + Math.max(0, s.amount - s.paidAmount);
    }, 0);
    const unpaidSeqCount = scheduleList.filter((s) => s.dueDate <= todayK && s.status !== '완료' && s.status !== '면제').length;
    const lastP = scheduleList.flatMap((s) => s.payments ?? []).sort((a, b) => b.date.localeCompare(a.date))[0];

    writeBatch[target.id] = {
      ...target,
      schedules: scheduleList,
      unpaidAmount: unpaid,
      unpaidSeqCount,
      currentSeq: scheduleList.findIndex((s) => s.status !== '완료' && s.status !== '면제') + 1 || scheduleList.length,
      lastPaidDate: lastP?.date,
      lastPaidAmount: lastP?.amount,
    };
  }

  return { writeBatch, result: { paymentsAdded, contractsBackfilled, unmatchedRows: unmatched } };
}

function pickClosestSchedule(schedules: PaymentScheduleInline[], paymentDate: string): number {
  if (schedules.length === 0) return -1;
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < schedules.length; i++) {
    const diff = Math.abs(dateDiff(schedules[i].dueDate, paymentDate));
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function dateDiff(a: string, b: string): number {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return Math.round((tb - ta) / (1000 * 60 * 60 * 24));
}

function addMonths(yyyymmdd: string, months: number): string {
  const d = new Date(yyyymmdd);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function monthDiff(start: string, end: string): number {
  if (!start || !end) return 12;
  const ds = new Date(start);
  const de = new Date(end);
  const months = (de.getFullYear() - ds.getFullYear()) * 12 + (de.getMonth() - ds.getMonth());
  return Math.max(1, months);
}
