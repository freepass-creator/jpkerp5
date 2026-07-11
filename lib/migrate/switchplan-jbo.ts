/**
 * 스위치플랜 「자금일보.xlsx」 파서 — 현금 SSOT (계정과목·차량·임차인 pre-tagged).
 *
 * 시트: 운영계좌(신한1868)·영업계좌(신한6616)·운영계좌(농협3781)·영업계좌(농협5311)·차량데이터.
 * 컬럼: 거래월/거래일/거래일시/적요/입금액/출금액/내용/잔액/거래점/계정과목/차량번호/임차인/세부차종/비고/구분.
 *
 * ⚠️ 이 파서는 요약·프리뷰 전용이다. bankTransactions 로 커밋 + 수납 자동매칭은
 *    씨앗 미수(carry)가 이미 2026 입금을 반영 → 이중차감 위험 → 별도 결정 후.
 */

import * as XLSX from 'xlsx-js-style';

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

/** "2026.01.01 20:40:02" / "2026-01-01" / Date → YYYY-MM-DD */
function parseTxDate(dtRaw: string, monthRaw: string, dayRaw: string, fallbackYear: number): string {
  const m = dtRaw.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const mo = cellNum(monthRaw);
  const dy = cellNum(dayRaw);
  if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
    return `${fallbackYear}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}`;
  }
  return '';
}

export type JboTx = {
  account: string;      // 계좌(시트명)
  date: string;         // YYYY-MM-DD
  memo: string;         // 적요
  deposit: number;      // 입금액
  withdraw: number;     // 출금액
  detail: string;       // 내용 (입금자명 등)
  subject: string;      // 계정과목
  plate: string;        // 차량번호
  tenant: string;       // 임차인
  model: string;        // 세부차종
  note: string;         // 비고
};

export type JboAgg = { deposit: number; withdraw: number; count: number };

export type JboParseResult = {
  transactions: JboTx[];
  byAccount: Array<{ account: string } & JboAgg>;
  bySubject: Array<{ subject: string } & JboAgg>;
  totals: {
    count: number;
    deposit: number;
    withdraw: number;
    sweepDeposit: number;   // 계정과목 '자금이동' (계좌간 sweep — 매출 아님)
    sweepWithdraw: number;
    realDeposit: number;    // sweep 제외 입금
    realWithdraw: number;   // sweep 제외 출금
    accounts: number;
    subjects: number;
    dateFrom: string;
    dateTo: string;
  };
  warnings: string[];
};

const SWEEP_SUBJECT = '자금이동';

export function parseSwitchplanJbo(buf: ArrayBuffer, fallbackYear = 2026): JboParseResult {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const warnings: string[] = [];
  const transactions: JboTx[] = [];

  for (const sn of wb.SheetNames) {
    if (/차량\s*데이터|차량데이터/.test(sn)) continue; // 계좌 시트만
    const sheet = wb.Sheets[sn];
    if (!sheet) continue;
    const G = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
    const hRow = G.findIndex((r) => (r as unknown[]).some((v) => cellStr(v) === '계정과목'));
    if (hRow < 0) { warnings.push(`${sn}: '계정과목' 헤더 없음 — skip`); continue; }
    const h = (G[hRow] as unknown[]).map(cellStr);
    const ci = (lbl: string) => h.findIndex((x) => x === lbl);
    const col = {
      month: ci('거래월'), day: ci('거래일'), dt: ci('거래일시'), memo: ci('적요'),
      deposit: ci('입금액'), withdraw: ci('출금액'), detail: ci('내용'),
      subject: ci('계정과목'), plate: ci('차량번호'), tenant: ci('임차인'),
      model: ci('세부차종'), note: ci('비고'),
    };
    const gs = (row: unknown[], c: number) => (c >= 0 ? cellStr(row[c]) : '');
    const gn = (row: unknown[], c: number) => (c >= 0 ? cellNum(row[c]) : 0);
    for (let r = hRow + 1; r < G.length; r++) {
      const row = G[r] as unknown[];
      const deposit = gn(row, col.deposit);
      const withdraw = gn(row, col.withdraw);
      if (deposit === 0 && withdraw === 0) continue;
      const date = parseTxDate(gs(row, col.dt), gs(row, col.month), gs(row, col.day), fallbackYear);
      transactions.push({
        account: sn,
        date,
        memo: gs(row, col.memo),
        deposit, withdraw,
        detail: gs(row, col.detail),
        subject: gs(row, col.subject) || '(미분류)',
        plate: gs(row, col.plate),
        tenant: gs(row, col.tenant),
        model: gs(row, col.model),
        note: gs(row, col.note),
      });
    }
  }

  // 집계
  const accMap = new Map<string, JboAgg>();
  const subMap = new Map<string, JboAgg>();
  let deposit = 0;
  let withdraw = 0;
  let sweepDeposit = 0;
  let sweepWithdraw = 0;
  let dateFrom = '';
  let dateTo = '';
  for (const t of transactions) {
    deposit += t.deposit; withdraw += t.withdraw;
    if (t.subject === SWEEP_SUBJECT) { sweepDeposit += t.deposit; sweepWithdraw += t.withdraw; }
    const a = accMap.get(t.account) ?? { deposit: 0, withdraw: 0, count: 0 };
    a.deposit += t.deposit; a.withdraw += t.withdraw; a.count += 1; accMap.set(t.account, a);
    const s = subMap.get(t.subject) ?? { deposit: 0, withdraw: 0, count: 0 };
    s.deposit += t.deposit; s.withdraw += t.withdraw; s.count += 1; subMap.set(t.subject, s);
    if (t.date) {
      if (!dateFrom || t.date < dateFrom) dateFrom = t.date;
      if (!dateTo || t.date > dateTo) dateTo = t.date;
    }
  }

  const byAccount = [...accMap.entries()].map(([account, v]) => ({ account, ...v }));
  const bySubject = [...subMap.entries()].map(([subject, v]) => ({ subject, ...v }))
    .sort((a, b) => (b.deposit + b.withdraw) - (a.deposit + a.withdraw));

  return {
    transactions,
    byAccount,
    bySubject,
    totals: {
      count: transactions.length,
      deposit, withdraw,
      sweepDeposit, sweepWithdraw,
      realDeposit: deposit - sweepDeposit,
      realWithdraw: withdraw - sweepWithdraw,
      accounts: accMap.size,
      subjects: subMap.size,
      dateFrom, dateTo,
    },
    warnings,
  };
}
