/**
 * 스위치플랜 「사업현황.xlsx」 원본 → jpkerp5 씨앗(SNAPSHOT)/이력 어댑터
 *
 * 원본은 사람이 보기 좋게 가로로 펼친 다중시트 양식이라 표준 임포터가 그대로 못 먹는다.
 * 이 어댑터가 원본을 파싱해서:
 *   1) 채권 시트(운행중 계약) → SNAPSHOT Row[] (현재미수=carry 씨앗) → 기존 parseSnapshotRow/applySnapshotToContract
 *   2) 반납 시트(종료 계약)   → 이력 레코드 (잔여 미수는 추심 대상)
 *   3) 3정의 대조표(carry / gross / pastDue) — 직원이 "엑셀 원본 vs ERP 계산"을 나란히 검토
 *
 * 미수 정의(중요):
 *   - carry   = 직원이 유지하는 미납칸 running balance(도래 최신월) = 현재 outstanding. 묶음결제·정산 반영됨 → 씨앗값.
 *   - gross   = Σ청구 − Σ결제 (clamp≥0). 반납 정산(보증금상계·대손) 못 봄 → 교차검증용.
 *   - pastDue = 도래월별 max(0,청구−결제) 합. 묶음결제 시 과대 → 참고용.
 * 세 값이 어긋나는 계약이 곧 직원 검토 대상(과태료월·과오납·정산).
 */

import * as XLSX from 'xlsx-js-style';
import type { Contract, Vehicle, PaymentScheduleInline } from '@/lib/types';
import { generateSchedules, distributeUnpaid } from '@/lib/payment-schedule';

/* ─────────────── 셀 유틸 ─────────────── */

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
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return isFinite(n) ? Math.round(n) : 0;
}

function normPlate(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

function monthOfLabel(s: string): string {
  const m = String(s).match(/(\d{2})년\s*(\d{1,2})월/);
  return m ? `20${m[1]}-${m[2].padStart(2, '0')}` : '';
}

function monthOfDate(s: string): string {
  const m = cellStr(s).match(/(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : '';
}

function addMonth(ym: string, k: number): string {
  if (!ym) return '';
  const parts = ym.split('-').map(Number);
  let y = parts[0];
  let m = parts[1] + k;
  y += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12 + 12) % 12 + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function payDayNum(s: string): number {
  const raw = cellStr(s);
  if (/말/.test(raw)) return 31;
  const m = raw.match(/(\d{1,2})/);
  return m ? Math.min(31, Math.max(1, Number(m[1]))) : 1;
}

function addMonthsStr(yyyymmdd: string, months: number): string {
  if (!yyyymmdd) return '';
  const d = new Date(yyyymmdd);
  if (isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function monthDiff(start: string, end: string): number {
  if (!start || !end) return 12;
  const ds = new Date(start);
  const de = new Date(end);
  if (isNaN(ds.getTime()) || isNaN(de.getTime())) return 12;
  return (de.getFullYear() - ds.getFullYear()) * 12 + (de.getMonth() - ds.getMonth());
}

/* ─────────────── 타입 ─────────────── */

export type SwitchplanLedgerEntry = {
  month: string;        // YYYY-MM (채권=R0라벨, 반납=결제일자 앵커보간)
  charged: number;      // 청구금액
  paid: number;         // 결제금액
  paidDate: string;     // 결제일자
  method: string;       // 결제수단 (자동/입금/카드…)
  carry: number;        // 미납금액 (running balance 스냅샷)
};

export type SwitchplanContract = {
  source: '운행중' | '종료';   // 채권 / 반납
  vehiclePlate: string;
  branch: string;              // 소속 (본사/LC/대전 등) — 회사 아님, 지점
  customerName: string;        // 코드명
  monthlyRent: number;
  deposit: number;
  paymentDay: number;
  contractStart: string;
  contractEnd: string;
  ledger: SwitchplanLedgerEntry[];
  // 미수 3정의
  carryUnpaid: number;         // 씨앗값 — 도래 최신월 running balance
  grossUnpaid: number;         // Σ청구−Σ결제 clamp
  pastDueUnpaid: number;       // 도래월별 clamp 합
  futureBilled: number;        // 미래 선청구(도래전, 미수 아님)
  hasPenaltyMonth: boolean;    // 청구≠대여료 월 존재(과태료 가산 등)
  hasOverpay: boolean;         // 결제>청구 월 존재(묶음결제·과오납)
  ledgerMonths: number;
  // enrichment (조인)
  customerIdentNo?: string;
  customerPhone1?: string;
  customerKind?: string;
  vehicleModel?: string;
};

export type SwitchplanParseResult = {
  current: SwitchplanContract[];   // 채권 (운행중)
  returned: SwitchplanContract[];  // 반납 (종료)
  vehicles: SwitchplanVehicle[];   // 자산 (차량 마스터)
  totals: {
    countCurrent: number;
    countReturned: number;
    carryCurrent: number;
    carryReturned: number;
    grossCurrent: number;
    grossReturned: number;
    pastDueCurrent: number;
    pastDueReturned: number;
    futureBilled: number;
    penaltyCount: number;
    overpayCount: number;
  };
  warnings: string[];
};

type RawContract = Omit<
  SwitchplanContract,
  'carryUnpaid' | 'grossUnpaid' | 'pastDueUnpaid' | 'futureBilled' | 'hasPenaltyMonth' | 'hasOverpay' | 'ledgerMonths'
>;

/* ─────────────── 고객(기준) 조인 인덱스 ─────────────── */

type CustomerInfo = { ident: string; phone: string; kind: string; name: string };

function buildCustomerIndex(wb: XLSX.WorkBook): {
  byPlate: Map<string, CustomerInfo>;
  byPlateName: Map<string, string>;   // plate|name → ident
} {
  const byPlate = new Map<string, CustomerInfo>();
  const byPlateName = new Map<string, string>();
  const sheet = wb.Sheets['고객(기준)'] ?? wb.Sheets['고객'];
  if (!sheet) return { byPlate, byPlateName };
  const G = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
  if (G.length === 0) return { byPlate, byPlateName };
  const h = (G[0] as unknown[]).map(cellStr);
  const ci = (lbl: string) => h.findIndex((x) => x === lbl);
  const cPlate = ci('차량번호');
  const cIdent = ci('주민/법인번호');
  const cPhone = ci('본인연락처');
  const cKind = ci('구분');
  const cName = ci('코드명');
  for (let r = 1; r < G.length; r++) {
    const row = G[r] as unknown[];
    const plate = normPlate(cellStr(row[cPlate]));
    if (!plate) continue;
    const info: CustomerInfo = {
      ident: cIdent >= 0 ? cellStr(row[cIdent]) : '',
      phone: cPhone >= 0 ? cellStr(row[cPhone]) : '',
      kind: cKind >= 0 ? cellStr(row[cKind]) : '',
      name: cName >= 0 ? cellStr(row[cName]) : '',
    };
    if (!byPlate.has(plate)) byPlate.set(plate, info);
    if (info.name && info.ident) byPlateName.set(`${plate}|${info.name}`, info.ident);
  }
  return { byPlate, byPlateName };
}

/* ─────────────── 자산 시트 → 차량 마스터 ─────────────── */

export type SwitchplanVehicle = {
  vehiclePlate: string;
  division: string;             // 구분 (구독/LC구독)
  garage: string;               // 등록지 (김포 등)
  acquisitionDate: string;      // 취득일
  firstRegisteredDate: string;  // 최초등록일
  vin: string;                  // 차대번호
  maker: string;
  modelLine: string;
  subModel: string;
  fullModel: string;            // 결합 풀네임
  year: number;                 // 연식
  displacementCc: number;       // 배기량
  fuel: string;                 // 연료
  trim: string;                 // 트림
  options: string;              // 선택옵션
  exteriorColor: string;
  interiorColor: string;
  consumerPrice: number;        // 소비자가격
  vehiclePrice: number;         // 차량가격
  purchasePrice: number;        // 실제구입가격
  acqCostTotal: number;         // 취득 부대비용 합
  acqCostBreakdown: string;     // 내역 (사람이 읽는 문자열)
  gps: string;
};

function normDateStr(s: string): string {
  const m = cellStr(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? m[0] : '';
}

function buildVehicles(wb: XLSX.WorkBook): SwitchplanVehicle[] {
  const out: SwitchplanVehicle[] = [];
  const sheet = wb.Sheets['자산'];
  if (!sheet) return out;
  const G = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
  if (G.length === 0) return out;
  const h = (G[0] as unknown[]).map(cellStr);
  const ci = (lbl: string) => h.findIndex((x) => x === lbl);
  const col = {
    plate: ci('차량번호'), division: ci('구분'), garage: ci('등록지'),
    acq: ci('취득일'), firstReg: ci('최초등록일'), vin: ci('차대번호'),
    maker: ci('제조사'), model: ci('모델'), sub: ci('세부모델'), year: ci('연식'),
    disp: ci('배기량'), fuel: ci('연료'), trim: ci('트림'), options: ci('선택옵션'),
    ext: ci('외장색상'), int: ci('내장색상'),
    consumer: ci('소비자가격'), vprice: ci('차량가격'), purchase: ci('실제구입가격'),
    acqTax: ci('취등록세'), sellCost: ci('매도비'), perfIns: ci('성능보험료'),
    transfer: ci('이전대행료'), bond: ci('지역공채'), stamp: ci('인지대'), etcFee: ci('기타수수료'),
    gps: ci('GPS'),
  };
  const get = (row: unknown[], c: number) => (c >= 0 ? cellStr(row[c]) : '');
  const getN = (row: unknown[], c: number) => (c >= 0 ? cellNum(row[c]) : 0);
  for (let r = 1; r < G.length; r++) {
    const row = G[r] as unknown[];
    const plate = get(row, col.plate);
    if (!plate) continue;
    const maker = get(row, col.maker);
    const modelLine = get(row, col.model);
    const subModel = get(row, col.sub);
    const fullModel = [maker, subModel || modelLine].filter(Boolean).join(' ').trim();
    const parts: Array<[string, number]> = [
      ['취등록세', getN(row, col.acqTax)], ['매도비', getN(row, col.sellCost)],
      ['성능보험료', getN(row, col.perfIns)], ['이전대행료', getN(row, col.transfer)],
      ['지역공채', getN(row, col.bond)], ['인지대', getN(row, col.stamp)],
      ['기타수수료', getN(row, col.etcFee)],
    ];
    const acqCostTotal = parts.reduce((s, [, v]) => s + v, 0);
    const acqCostBreakdown = parts.filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v.toLocaleString()}`).join(' · ');
    out.push({
      vehiclePlate: plate,
      division: get(row, col.division),
      garage: get(row, col.garage),
      acquisitionDate: normDateStr(get(row, col.acq)),
      firstRegisteredDate: normDateStr(get(row, col.firstReg)),
      vin: get(row, col.vin),
      maker, modelLine, subModel, fullModel,
      year: getN(row, col.year),
      displacementCc: getN(row, col.disp),
      fuel: get(row, col.fuel),
      trim: get(row, col.trim),
      options: get(row, col.options),
      exteriorColor: get(row, col.ext),
      interiorColor: get(row, col.int),
      consumerPrice: getN(row, col.consumer),
      vehiclePrice: getN(row, col.vprice),
      purchasePrice: getN(row, col.purchase),
      acqCostTotal,
      acqCostBreakdown,
      gps: get(row, col.gps),
    });
  }
  return out;
}

/** 파싱된 자산 → Vehicle 필드 패치 (id/status/createdAt 제외 — 병합은 호출측) */
export function buildVehicleFields(a: SwitchplanVehicle, company: string): Partial<Omit<Vehicle, 'id' | 'status' | 'createdAt'>> {
  const clean = <T,>(v: T | '' | 0 | undefined): T | undefined => (v === '' || v === 0 || v === undefined ? undefined : v);
  const notesParts = [
    a.division ? `구분 ${a.division}` : '',
    a.acqCostTotal > 0 ? `취득부대 ${a.acqCostTotal.toLocaleString()}(${a.acqCostBreakdown})` : '',
    a.consumerPrice > 0 ? `소비자가 ${a.consumerPrice.toLocaleString()}` : '',
    a.gps && a.gps !== '-' ? `GPS ${a.gps}` : '',
  ].filter(Boolean);
  return {
    plate: a.vehiclePlate,
    company: company as Vehicle['company'],
    model: a.fullModel || undefined,
    vehicleMaker: clean(a.maker),
    vehicleModelLine: clean(a.modelLine),
    vehicleSubModel: clean(a.subModel),
    vehicleTrim: clean(a.trim),
    vehicleOptions: clean(a.options),
    exteriorColor: clean(a.exteriorColor),
    interiorColor: clean(a.interiorColor),
    fuelType: clean(a.fuel),
    displacementCc: clean(a.displacementCc),
    vin: clean(a.vin),
    garage: clean(a.garage),
    firstRegisteredDate: clean(a.firstRegisteredDate),
    acquisitionDate: clean(a.acquisitionDate),
    // 실 매입가: 실제구입가격이 대부분 공란 → 차량가격 fallback
    purchasePrice: clean(a.purchasePrice || a.vehiclePrice),
    notes: notesParts.length ? notesParts.join(' / ') : undefined,
  } as Partial<Omit<Vehicle, 'id' | 'status' | 'createdAt'>>;
}

/* ─────────────── 원장 시트 파서 (채권/반납 공통) ─────────────── */

function parseLedgerSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  source: '운행중' | '종료',
  hasMonthRow: boolean,
  warnings: string[],
): RawContract[] {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    warnings.push(`시트 없음: ${sheetName}`);
    return [];
  }
  const G = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
  const hRow = hasMonthRow ? 1 : 0;
  const H = (G[hRow] as unknown[] | undefined)?.map(cellStr) ?? [];
  const M = hasMonthRow ? ((G[0] as unknown[] | undefined)?.map(cellStr) ?? []) : null;
  const ci = (lbl: string) => H.findIndex((x) => x === lbl);
  const col = {
    소속: ci('소속'),
    코드명: ci('코드명'),
    보증금: ci('보증금'),
    대여료: ci('대여료'),
    결제일: ci('결제일'),
    차량번호: ci('차량번호'),
    시작: ci('시작'),
    종료: ci('종료'),
  };
  const base = ci('청구금액');
  if (base < 0 || col.차량번호 < 0) {
    warnings.push(`${sheetName}: 헤더('청구금액'/'차량번호') 인식 실패`);
    return [];
  }
  const nBlocks = Math.floor((H.length - base) / 5);

  const out: RawContract[] = [];
  const seen = new Set<string>();

  for (let r = hRow + 1; r < G.length; r++) {
    const row = G[r] as unknown[];
    const plateRaw = cellStr(row[col.차량번호]);
    const plate = normPlate(plateRaw);
    const name = col.코드명 >= 0 ? cellStr(row[col.코드명]) : '';
    if (!plate) continue;
    if (!name) continue; // 공백 코드명 = 중복/스필오버 아티팩트 → 제외

    const pDay = col.결제일 >= 0 ? payDayNum(cellStr(row[col.결제일])) : 1;
    const ledger: SwitchplanLedgerEntry[] = [];
    for (let b = 0; b < nBlocks; b++) {
      const o = base + b * 5;
      const charged = cellNum(row[o]);
      const paid = cellNum(row[o + 1]);
      const paidDate = cellStr(row[o + 2]);
      const method = cellStr(row[o + 3]);
      const carry = cellNum(row[o + 4]);
      if (!(charged > 0 || paid > 0 || carry > 0)) continue;
      let month = M ? monthOfLabel(M[o + 2] ?? '') : '';
      if (!month) month = monthOfDate(paidDate);
      ledger.push({ month, charged, paid, paidDate, method, carry, idx: b } as SwitchplanLedgerEntry & { idx: number });
    }
    if (ledger.length === 0) continue;

    // 반납: 월 라벨 없는 블록 앵커 보간 (idx 클수록 과거)
    if (!hasMonthRow) {
      const withIdx = ledger as Array<SwitchplanLedgerEntry & { idx: number }>;
      for (const e of withIdx) {
        if (e.month) continue;
        let anchor: (SwitchplanLedgerEntry & { idx: number }) | null = null;
        for (const a of withIdx) {
          if (!a.month) continue;
          if (!anchor || Math.abs(a.idx - e.idx) < Math.abs(anchor.idx - e.idx)) anchor = a;
        }
        if (anchor) e.month = addMonth(anchor.month, anchor.idx - e.idx);
      }
    }

    // 완전중복 제거 (plate|name|원장서명)
    const sig = `${plate}|${name}|${ledger.map((e) => `${e.charged}:${e.paid}`).join(',')}`;
    if (seen.has(sig)) continue;
    seen.add(sig);

    out.push({
      source,
      vehiclePlate: plateRaw,
      branch: col.소속 >= 0 ? cellStr(row[col.소속]) : '',
      customerName: name,
      monthlyRent: col.대여료 >= 0 ? cellNum(row[col.대여료]) : 0,
      deposit: col.보증금 >= 0 ? cellNum(row[col.보증금]) : 0,
      paymentDay: pDay,
      contractStart: col.시작 >= 0 ? cellStr(row[col.시작]) : '',
      contractEnd: col.종료 >= 0 ? cellStr(row[col.종료]) : '',
      ledger: ledger.map(({ month, charged, paid, paidDate, method, carry }) => ({ month, charged, paid, paidDate, method, carry })),
    });
  }
  return out;
}

/* ─────────────── 미수 3정의 계산 ─────────────── */

function computeUnpaid(c: RawContract, curMonth: string, todayDay: number): SwitchplanContract {
  let sumCharged = 0;
  let sumPaid = 0;
  let pastDue = 0;
  let futureBilled = 0;
  let carrySeed = 0;
  let seedMonth = '';
  let hasPenaltyMonth = false;
  let hasOverpay = false;

  const isDue = (month: string): boolean => {
    if (!month) return true; // 월 미상 → 도래로 간주(보수적)
    if (month < curMonth) return true;
    if (month > curMonth) return false;
    return todayDay >= c.paymentDay;
  };

  for (const e of c.ledger) {
    const eff = e.charged > 0 ? e.charged : (e.paid > 0 ? e.paid : 0);
    sumCharged += eff;
    sumPaid += e.paid;
    if (c.monthlyRent > 0 && e.charged > 0 && Math.abs(e.charged - c.monthlyRent) > 1000) hasPenaltyMonth = true;
    if (e.paid > eff + 1000) hasOverpay = true;
    if (isDue(e.month)) {
      pastDue += Math.max(0, eff - e.paid);
      // 씨앗 carry = 도래월 중 최신월의 running balance
      if (e.month && (seedMonth === '' || e.month > seedMonth)) {
        seedMonth = e.month;
        carrySeed = e.carry;
      }
    } else {
      futureBilled += Math.max(0, eff - e.paid);
    }
  }

  return {
    ...c,
    carryUnpaid: Math.max(0, carrySeed),
    grossUnpaid: Math.max(0, sumCharged - sumPaid),
    pastDueUnpaid: pastDue,
    futureBilled,
    hasPenaltyMonth,
    hasOverpay,
    ledgerMonths: c.ledger.length,
  };
}

/* ─────────────── 메인 ─────────────── */

export function parseSwitchplanWorkbook(buf: ArrayBuffer, asOf?: string): SwitchplanParseResult {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const warnings: string[] = [];

  const now = asOf ? new Date(asOf) : new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const todayDay = now.getDate();

  const custIdx = buildCustomerIndex(wb);
  const vehicleList = buildVehicles(wb);
  const modelIdx = new Map<string, string>();
  for (const v of vehicleList) {
    const key = normPlate(v.vehiclePlate);
    if (v.fullModel && !modelIdx.has(key)) modelIdx.set(key, v.fullModel);
  }

  const enrich = (c: SwitchplanContract): SwitchplanContract => {
    const key = normPlate(c.vehiclePlate);
    const info = custIdx.byPlate.get(key);
    const identByName = custIdx.byPlateName.get(`${key}|${c.customerName}`);
    return {
      ...c,
      customerIdentNo: identByName || (info?.name === c.customerName ? info?.ident : undefined) || undefined,
      customerPhone1: info?.name === c.customerName ? info?.phone : undefined,
      customerKind: info?.name === c.customerName ? info?.kind : undefined,
      vehicleModel: modelIdx.get(key),
    };
  };

  const currentRaw = parseLedgerSheet(wb, '채권', '운행중', true, warnings);
  const returnedRaw = parseLedgerSheet(wb, '반납', '종료', false, warnings);

  const current = currentRaw.map((c) => enrich(computeUnpaid(c, curMonth, todayDay)));
  const returned = returnedRaw.map((c) => enrich(computeUnpaid(c, curMonth, todayDay)));

  const sum = (arr: SwitchplanContract[], f: (c: SwitchplanContract) => number) => arr.reduce((s, c) => s + f(c), 0);

  return {
    current,
    returned,
    vehicles: vehicleList,
    totals: {
      countCurrent: current.length,
      countReturned: returned.length,
      carryCurrent: sum(current, (c) => c.carryUnpaid),
      carryReturned: sum(returned, (c) => c.carryUnpaid),
      grossCurrent: sum(current, (c) => c.grossUnpaid),
      grossReturned: sum(returned, (c) => c.grossUnpaid),
      pastDueCurrent: sum(current, (c) => c.pastDueUnpaid),
      pastDueReturned: sum(returned, (c) => c.pastDueUnpaid),
      futureBilled: sum(current, (c) => c.futureBilled) + sum(returned, (c) => c.futureBilled),
      penaltyCount: [...current, ...returned].filter((c) => c.hasPenaltyMonth).length,
      overpayCount: [...current, ...returned].filter((c) => c.hasOverpay).length,
    },
    warnings,
  };
}

/* ─────────────── SNAPSHOT Row[] 변환 (운행중 → 씨앗) ─────────────── */

export type SnapshotSeedRow = Record<string, string | number>;

/**
 * 운행중 계약(채권)을 기존 SNAPSHOT 임포터가 먹는 Row[] 로 변환.
 * 현재미수 = carryUnpaid(직원 running balance). company 는 단일 회사키로 채운다(회사격리 이후 정교화).
 */
export function toSnapshotRows(res: SwitchplanParseResult, companyKey: string): SnapshotSeedRow[] {
  return res.current.map((c) => {
    const row: SnapshotSeedRow = {
      회사: companyKey,
      계약자: c.customerName,
      차량번호: c.vehiclePlate,
      월대여료: c.monthlyRent,
      보증금: c.deposit,
      결제일: c.paymentDay,
      현재미수: c.carryUnpaid,
    };
    if (c.contractStart) row['계약시작일'] = c.contractStart;
    if (c.contractEnd) row['계약종료일'] = c.contractEnd;
    if (c.customerIdentNo) row['등록번호'] = c.customerIdentNo;
    if (c.customerPhone1) row['연락처'] = c.customerPhone1;
    if (c.customerKind) row['구분'] = c.customerKind;
    if (c.vehicleModel) row['차종'] = c.vehicleModel;
    return row;
  });
}

/* ─────────────── 반납(종료) → 계약 이력 레코드 ─────────────── */

/**
 * 종료 계약(반납 시트)을 Contract 이력 레코드로 변환.
 * - 씨앗 아님: status='반납', vehicleStatus='반납', returnedDate 세팅 → 손바뀜 연속성.
 * - 잔여미수(carry>0)면 endReason='채권보전'(추심 대상), unpaidAtEnd=carry.
 * - 스케줄은 generateSchedules + distributeUnpaid(carry, 반납일) 로 잔여를 직전 회차에 분배.
 * - contractNo 는 비워둠 → 커밋 시 assignContractNos 가 채움.
 */
export function toReturnedContracts(res: SwitchplanParseResult, company: string): Array<Omit<Contract, 'id'>> {
  const out: Array<Omit<Contract, 'id'>> = [];
  for (const c of res.returned) {
    const months = c.ledger.map((e) => e.month).filter(Boolean).sort();
    const firstMonth = months[0];
    const lastMonth = months[months.length - 1];
    const contractDate = c.contractStart || (firstMonth ? `${firstMonth}-01` : '');
    if (!contractDate) continue; // 시작·원장월 모두 없으면 skip
    const returnScheduledDate = c.contractEnd
      || (lastMonth ? addMonthsStr(`${lastMonth}-01`, 1) : addMonthsStr(contractDate, 12));
    // 반납일 = 원장 마지막 결제일, 없으면 종료예정일
    const lastPaid = c.ledger.map((e) => e.paidDate).filter(Boolean).sort().pop() || '';
    const returnedDate = lastPaid || returnScheduledDate || contractDate;
    const termMonths = Math.max(1, monthDiff(contractDate, returnScheduledDate));
    const paymentDay = Math.min(31, Math.max(1, c.paymentDay || 1));

    let schedules: PaymentScheduleInline[] = [];
    if (c.monthlyRent > 0) {
      const gen = generateSchedules({ contractDate, termMonths, monthlyRent: c.monthlyRent, paymentDay });
      schedules = gen.map((s, i) => ({ ...s, id: `s${i + 1}` }) as PaymentScheduleInline);
      schedules = distributeUnpaid(schedules, c.carryUnpaid, returnedDate);
    }
    const unpaidSeqCount = schedules.filter((s) => s.status === '연체' || s.status === '부분납').length;
    const lastCompleted = schedules.filter((s) => s.status === '완료').sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];

    out.push({
      contractNo: '',
      company: company as Contract['company'],
      customerName: c.customerName,
      customerKind: c.customerKind as Contract['customerKind'],
      customerIdentNo: c.customerIdentNo,
      customerPhone1: c.customerPhone1 || '',
      vehiclePlate: c.vehiclePlate,
      vehicleModel: c.vehicleModel || '미정',
      vehicleStatus: '반납',
      contractDate,
      returnScheduledDate,
      returnedDate,
      termMonths,
      longTerm: termMonths >= 12,
      monthlyRent: c.monthlyRent,
      deposit: c.deposit,
      paymentDay,
      paymentMethod: '이체',
      status: '반납',
      endReason: c.carryUnpaid > 0 ? '채권보전' : '정상종료',
      endedAt: returnedDate,
      unpaidAtEnd: c.carryUnpaid > 0 ? c.carryUnpaid : undefined,
      currentSeq: schedules.length || 1,
      totalSeq: Math.max(1, termMonths),
      unpaidAmount: c.carryUnpaid,
      unpaidSeqCount,
      lastPaidDate: lastCompleted?.paidAt ?? lastCompleted?.dueDate,
      schedules,
      notes: `반납 이력 이관${c.branch ? ` (${c.branch})` : ''}`,
    });
  }
  return out;
}
