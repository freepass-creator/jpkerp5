// 엑셀 한 행 → DB 레코드 변환 + 자동 매칭 헬퍼

import type {
  Contract, Vehicle, CompanyCode, VehicleStatus, BankTransaction, CardTransaction,
} from './types';

type Row = Record<string, unknown>;

/* ──────────────── 공통 유틸 ──────────────── */

const COMPANIES: CompanyCode[] = ['아이카', '달카', '렌트로', '직카', '기타'];

function toStr(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function toNum(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const cleaned = String(v).replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toDate(v: unknown): string {
  if (v == null || v === '') return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  // 이미 YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // YYYY/MM/DD or YYYY.MM.DD
  const m = s.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // 엑셀 시리얼 숫자
  const n = Number(s);
  if (Number.isFinite(n) && n > 25000 && n < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return '';
}

function pickCompany(v: unknown): CompanyCode {
  const s = toStr(v);
  for (const c of COMPANIES) if (s.includes(c)) return c;
  return '아이카';
}

function pickVehicleStatus(v: unknown, hasDelivered: boolean): VehicleStatus {
  const s = toStr(v);
  const ALL: VehicleStatus[] = [
    '구매대기', '등록대기', '상품화대기', '상품화중', '상품대기', '운행',
    '휴차대기', '매각대기', '매각', '인도대기', '출고대기', '재고', '반납', '휴차', '임시배차', '정비', '사고',
  ];
  for (const x of ALL) if (s === x) return x;
  return hasDelivered ? '운행' : '구매대기';
}

function maskRegNo(raw: string): string {
  // 900101-1234567 → 900101-1******
  const clean = raw.replace(/\s/g, '');
  if (/^\d{6}-?\d{7}$/.test(clean)) {
    const front = clean.slice(0, 6);
    const back = clean.length === 13 ? clean.slice(6) : clean.slice(7);
    return `${front}-${back[0]}******`;
  }
  return raw;
}

/** 헤더 alias resolver — 다양한 컬럼명 허용 */
function get(row: Row, ...keys: string[]): unknown {
  for (const k of keys) {
    if (k in row && row[k] != null && row[k] !== '') return row[k];
  }
  return undefined;
}

/* ──────────────── 차량 (자산) ──────────────── */

export function parseVehicleRow(row: Row): Omit<Vehicle, 'id'> | null {
  const plate = toStr(get(row, '차량번호', 'plate', '번호'));
  const model = toStr(get(row, '차종', '차명', 'model'));
  if (!plate && !model) return null;
  return {
    plate: plate || '미정',
    model: model || '미정',
    company: pickCompany(get(row, '회사', '법인', 'company')),
    status: pickVehicleStatus(get(row, '차량상태', 'status'), false),
    purchasedDate: toDate(get(row, '매입일', 'purchasedDate')) || undefined,
    registeredDate: toDate(get(row, '등록일', 'registeredDate')) || undefined,
    readiedDate: toDate(get(row, '상품화일', 'readiedDate')) || undefined,
    notes: toStr(get(row, '비고', 'notes')) || undefined,
    createdAt: new Date().toISOString(),
  };
}

/* ──────────────── 계약 ──────────────── */

export function parseContractRow(row: Row): Omit<Contract, 'id'> | null {
  const customerName = toStr(get(row, '계약자명', '계약자', '고객명', 'customerName'));
  const contractDate = toDate(get(row, '계약일', 'contractDate'));
  const monthlyRent = toNum(get(row, '월대여료', '월렌트료', '월 대여료', 'monthlyRent'));
  if (!customerName || !contractDate || monthlyRent <= 0) return null;

  const plate = toStr(get(row, '차량번호', 'vehiclePlate')) || '미정';
  const model = toStr(get(row, '차종', '차명', 'vehicleModel')) || '미정';
  const company = pickCompany(get(row, '회사', '법인', 'company'));
  const phone1 = toStr(get(row, '연락처', '연락처1', 'customerPhone1'));
  const returnScheduled = toDate(get(row, '반납예정일', '반납예정', 'returnScheduledDate'));
  const deliveredDate = toDate(get(row, '인도일', '출고일', 'deliveredDate'));
  const paymentDay = Math.min(31, Math.max(1, toNum(get(row, '결제일', 'paymentDay')) || 1));
  const deposit = toNum(get(row, '보증금', 'deposit'));
  const paymentMethod = toStr(get(row, '결제방법', 'paymentMethod')) || '이체';

  // termMonths 자동 계산
  let termMonths = toNum(get(row, '약정개월', '약정', 'termMonths'));
  if (!termMonths && returnScheduled) {
    const d1 = new Date(contractDate);
    const d2 = new Date(returnScheduled);
    termMonths = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24 * 30)));
  }
  if (!termMonths) termMonths = 12;

  const longTermRaw = toStr(get(row, '장단기', 'longTerm'));
  const longTerm = longTermRaw ? longTermRaw.includes('장기') : termMonths >= 12;

  const regNoRaw = toStr(get(row, '등록번호', '주민번호', 'customerRegNo'));
  const regNoMasked = regNoRaw ? maskRegNo(regNoRaw) : undefined;

  const yy = contractDate.slice(2, 4);
  const mm = contractDate.slice(5, 7);
  const seqHash = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  const contractNo = `ICR-${yy}${mm}-${seqHash}`;

  return {
    contractNo,
    company,
    manager: toStr(get(row, '담당자', 'manager')) || undefined,
    customerName,
    customerRegNoMasked: regNoMasked,
    customerPhone1: phone1,
    customerPhone2: toStr(get(row, '연락처2', 'customerPhone2')) || undefined,
    customerRegion: toStr(get(row, '지역', 'customerRegion')) || undefined,
    customerDistrict: toStr(get(row, '행정구', 'customerDistrict')) || undefined,
    vehiclePlate: plate,
    vehicleModel: model,
    vehicleStatus: pickVehicleStatus(get(row, '차량상태'), !!deliveredDate),
    contractDate,
    deliveredDate: deliveredDate || undefined,
    returnScheduledDate: returnScheduled || undefined,
    termMonths,
    longTerm,
    monthlyRent,
    deposit,
    paymentDay,
    paymentMethod,
    insuranceAge: toNum(get(row, '보험연령', 'insuranceAge')) || undefined,
    selfInsured: toStr(get(row, '자차여부', 'selfInsured')).includes('가입') || undefined,
    distanceLimitKm: toNum(get(row, '거리한도Km', '거리한도', 'distanceLimitKm')) || undefined,
    status: deliveredDate ? '운행' : '대기',
    notes: toStr(get(row, '비고', 'notes')) || undefined,
    currentSeq: 1,
    totalSeq: termMonths,
    unpaidAmount: 0,      // 초기값 — 수납 매칭 시 갱신
    unpaidSeqCount: 0,
  };
}

/* ──────────────── 은행 입금 ──────────────── */

export function parseBankTxRow(row: Row, fileName: string): Omit<BankTransaction, 'id'> | null {
  const txDate = toDate(get(row, '거래일자', '거래일', '입금일', 'txDate'));
  const counterparty = toStr(get(row, '입금자', '상대', '예금주', 'counterparty'));
  const amount = toNum(get(row, '입금액', '금액', 'amount'));
  if (!txDate || amount <= 0 || !counterparty) return null;

  return {
    txDate,
    amount,
    counterparty,
    memo: toStr(get(row, '적요', '메모', 'memo')) || undefined,
    source: toStr(get(row, '은행', 'source')) || fileName,
    raw: row,
  };
}

/* ──────────────── 카드 매출 ──────────────── */

export function parseCardTxRow(row: Row, fileName: string): Omit<CardTransaction, 'id'> | null {
  const txDate = toDate(get(row, '승인일', '거래일', 'txDate'));
  const approvalNo = toStr(get(row, '승인번호', 'approvalNo'));
  const amount = toNum(get(row, '금액', '매입금액', 'amount'));
  if (!txDate || amount <= 0 || !approvalNo) return null;

  const cardRaw = toStr(get(row, '카드번호', 'cardLast4'));
  const last4 = (cardRaw.match(/\d{4}\s*$/) ?? [''])[0].trim() || undefined;

  return {
    txDate,
    amount,
    approvalNo,
    cardLast4: last4,
    customerName: toStr(get(row, '고객명', 'customerName')) || undefined,
    source: toStr(get(row, '카드사', 'source')) || fileName,
    raw: row,
  };
}

/* ──────────────── 수납 자동매칭 ──────────────── */

export type MatchResult = {
  txId: string;
  amount: number;
  contractId: string | null;
  customerName: string;
  reason: '이름+금액' | '이름only' | '미매칭';
};

/**
 * 트랜잭션 → 계약 매칭.
 * 우선순위:
 *   1) counterparty == customerName AND amount ≈ monthlyRent(±10%)
 *   2) counterparty == customerName
 *   3) 미매칭
 */
export function matchTransactions(
  txs: Array<{ id: string; amount: number; counterparty: string }>,
  contracts: Contract[]
): MatchResult[] {
  // 이름 색인 — O(N) 매칭
  const byName = new Map<string, Contract[]>();
  for (const c of contracts) {
    const k = c.customerName.trim();
    if (!k) continue;
    const arr = byName.get(k) || [];
    arr.push(c);
    byName.set(k, arr);
  }

  return txs.map((tx) => {
    const candidates = byName.get(tx.counterparty.trim()) || [];
    if (candidates.length === 0) {
      return { txId: tx.id, amount: tx.amount, contractId: null, customerName: tx.counterparty, reason: '미매칭' };
    }
    // 금액 일치 우선
    const exact = candidates.find((c) => {
      const diff = Math.abs(c.monthlyRent - tx.amount) / Math.max(1, c.monthlyRent);
      return diff <= 0.1;
    });
    if (exact) {
      return { txId: tx.id, amount: tx.amount, contractId: exact.id, customerName: tx.counterparty, reason: '이름+금액' };
    }
    // 이름만
    return { txId: tx.id, amount: tx.amount, contractId: candidates[0].id, customerName: tx.counterparty, reason: '이름only' };
  });
}

/**
 * 매칭 결과를 contract 캐시 필드에 반영 — Contract patch 리스트 반환.
 * 동일 contract에 여러 입금이 매칭되면 합산.
 */
export function applyPaymentsToContracts(
  contracts: Contract[],
  matches: MatchResult[]
): Contract[] {
  const byContract = new Map<string, MatchResult[]>();
  for (const m of matches) {
    if (!m.contractId) continue;
    const arr = byContract.get(m.contractId) || [];
    arr.push(m);
    byContract.set(m.contractId, arr);
  }

  const out: Contract[] = [];
  for (const [contractId, ms] of byContract) {
    const c = contracts.find((x) => x.id === contractId);
    if (!c) continue;
    const totalPaid = ms.reduce((s, m) => s + m.amount, 0);
    const lastM = ms[ms.length - 1];

    // 미수 차감
    const newUnpaid = Math.max(0, c.unpaidAmount - totalPaid);
    // 회차 진행 — totalPaid가 월대여료 N배 이상이면 N회차 advance
    const advancedSeq = Math.floor(totalPaid / Math.max(1, c.monthlyRent));
    const newCurrentSeq = Math.min(c.totalSeq, c.currentSeq + advancedSeq);
    const newSeqCount = newUnpaid === 0 ? 0 : Math.max(0, c.unpaidSeqCount - advancedSeq);

    out.push({
      ...c,
      unpaidAmount: newUnpaid,
      unpaidSeqCount: newSeqCount,
      currentSeq: newCurrentSeq,
      lastPaidAmount: lastM.amount,
      lastPaidDate: new Date().toISOString().slice(0, 10),
    });
  }
  return out;
}
