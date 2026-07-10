/**
 * 할부/리스 상환스케줄 — 두 경로로 같은 LoanScheduleRow[] 를 만든다.
 *   1) generateLoanSchedule : 원금·연이율·기간·상환방식 입력만으로 생성(표 없어도 됨, 금융사 공식)
 *   2) buildLoanScheduleFromOcr : 상환스케줄표 PDF OCR 결과(rows[])를 정규화
 *
 * 그리고 데이터는 홀로 안 산다([[feedback_data_always_links]]):
 *   · matchLoanPaymentsToWithdrawals : 각 회차(월불입금)를 은행 출금과 매칭(자금 연결)
 *   · summarizeLoanSchedule : 원금합(부채상환)/이자합(금융비용) — 회계 연결
 */

import type { LoanScheduleRow, LoanRepaymentMethod, LoanScheduleSource, BankTransaction } from './types';
import { addMonthsKeepDay } from './payment-schedule';

/**
 * 상환표 우선순위 — 업로드(OCR 상환스케줄표)가 생성(금리·기간 계산)보다 우선.
 * 저장 시 이 규칙으로 판단: incoming 을 반영해도 되나?
 *   · 업로드본은 항상 우선(생성값을 덮음)
 *   · 생성값은 기존 업로드본이 있으면 덮지 않음(추정치가 실문서를 못 이김)
 */
export function shouldReplaceLoanSchedule(
  current: LoanScheduleSource | undefined,
  incoming: LoanScheduleSource,
): boolean {
  if (incoming === 'uploaded') return true;
  return current !== 'uploaded';
}

const won = (n: number) => Math.round(n);

export interface GenerateLoanInput {
  principal: number;               // 할부원금(취득원가 − 선수금)
  annualRatePct: number;           // 연이율 % (예: 6.5)
  months: number;                  // 기간(회차 수)
  startDate: string;               // 첫 납입일 YYYY-MM-DD
  method?: LoanRepaymentMethod;    // 기본 원리금균등
}

export interface LoanScheduleResult {
  method: LoanRepaymentMethod;
  months: number;
  principal: number;
  monthlyPayment: number;          // 원리금균등이면 정액, 아니면 1회차 값(참고)
  totalRepayment: number;          // Σ payment
  totalInterest: number;           // Σ interest
  rows: LoanScheduleRow[];
}

/**
 * 금융사 방식 상환표 생성. 반올림 잔차는 마지막 회차 원금에서 흡수해 Σ원금=원금 보장.
 */
export function generateLoanSchedule(input: GenerateLoanInput): LoanScheduleResult {
  const method: LoanRepaymentMethod = input.method ?? '원리금균등';
  const P = Math.max(0, input.principal);
  const n = Math.max(1, Math.floor(input.months));
  const r = input.annualRatePct / 100 / 12; // 월이율

  const rows: LoanScheduleRow[] = [];
  let remaining = P;

  // 원리금균등 정액 월불입금
  let equalPayment = 0;
  if (method === '원리금균등') {
    equalPayment = r === 0 ? P / n : (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }
  const equalPrincipal = P / n; // 원금균등용

  for (let i = 1; i <= n; i++) {
    const isLast = i === n;
    const interest = won(remaining * r);
    let principal: number;
    let payment: number;

    if (method === '원리금균등') {
      payment = won(equalPayment);
      principal = payment - interest;
      if (isLast) { principal = remaining; payment = principal + interest; } // 잔차 흡수
    } else if (method === '원금균등') {
      principal = isLast ? remaining : won(equalPrincipal);
      payment = principal + interest;
    } else { // 만기일시
      principal = isLast ? remaining : 0;
      payment = principal + interest;
    }

    remaining = won(remaining - principal);
    if (isLast) remaining = 0;
    rows.push({
      seq: i,
      dueDate: addMonthsKeepDay(input.startDate, i - 1),
      principal,
      interest,
      payment,
      remainingPrincipal: Math.max(0, remaining),
    });
  }

  const s = summarizeLoanSchedule(rows);
  return {
    method, months: n, principal: P,
    monthlyPayment: rows[0]?.payment ?? 0,
    totalRepayment: s.paymentSum,
    totalInterest: s.interestSum,
    rows,
  };
}

/** 원금합/이자합/불입합 — 검산·회계 연결용 */
export function summarizeLoanSchedule(rows: readonly LoanScheduleRow[]): {
  principalSum: number; interestSum: number; paymentSum: number;
} {
  return rows.reduce(
    (a, r) => ({
      principalSum: a.principalSum + (r.principal ?? 0),
      interestSum: a.interestSum + (r.interest ?? 0),
      paymentSum: a.paymentSum + (r.payment ?? 0),
    }),
    { principalSum: 0, interestSum: 0, paymentSum: 0 },
  );
}

// ── OCR 경로 ────────────────────────────────────────────────────────
function num(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s원]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** 상환스케줄표 OCR(rows[{seq,due_date,principal,interest,payment,remaining_principal,prepayment}]) → LoanScheduleRow[] */
export function buildLoanScheduleFromOcr(raw: Record<string, unknown>): LoanScheduleRow[] {
  const arr = Array.isArray(raw.rows) ? raw.rows : [];
  return arr
    .map((it, i): LoanScheduleRow | null => {
      if (typeof it !== 'object' || it === null) return null;
      const o = it as Record<string, unknown>;
      const principal = num(o.principal);
      const interest = num(o.interest);
      let payment = num(o.payment);
      if (payment === 0 && (principal || interest)) payment = principal + interest; // 월불입 공란 보정
      return {
        seq: Number(o.seq ?? o.cycle ?? i + 1) || i + 1,
        dueDate: String(o.due_date ?? o.dueDate ?? '').slice(0, 10),
        principal, interest, payment,
        remainingPrincipal: num(o.remaining_principal ?? o.remainingPrincipal),
        prepayment: num(o.prepayment) || undefined,
      };
    })
    .filter((x): x is LoanScheduleRow => x !== null && (x.payment > 0 || x.principal > 0))
    .sort((a, b) => a.seq - b.seq);
}

// ── 관계: 회차 ↔ 은행 출금 매칭 ──────────────────────────────────────
function ymd(s: string): string { return (s ?? '').slice(0, 10); }
function dayDiff(a: string, b: string): number {
  const ta = new Date(ymd(a)).getTime(), tb = new Date(ymd(b)).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Infinity;
  return Math.abs(ta - tb) / 86400000;
}

export interface LoanPaymentMatch {
  rows: LoanScheduleRow[];   // matchedTxId/paidDate 채워진 사본
  matchedCount: number;
  matchedTxIds: string[];
}

/**
 * 각 회차 월불입금을 은행 출금과 매칭 — 자금 연결.
 *  기준: 출금(withdraw>0) 중 금액이 payment ±amountTol, 납입예정일 ±dateTol 안. 1:1 그리디.
 */
export function matchLoanPaymentsToWithdrawals(
  schedule: readonly LoanScheduleRow[],
  bankTx: readonly BankTransaction[],
  opts?: { amountTolerance?: number; dateToleranceDays?: number },
): LoanPaymentMatch {
  const amountTol = opts?.amountTolerance ?? 1000;      // 원리금균등이라도 회차별 ±천원 흔들림
  const dateTol = opts?.dateToleranceDays ?? 10;        // 자동이체일 전후
  const withdrawals = bankTx
    .filter((t) => (t.withdraw ?? 0) > 0)
    .map((t) => ({ id: t.id, date: ymd(t.txDate ?? ''), amt: t.withdraw ?? 0, used: false }));

  const rows = schedule.map((r) => ({ ...r }));
  const matchedTxIds: string[] = [];
  let matchedCount = 0;

  for (const row of rows) {
    let best: { i: number; score: number } | null = null;
    for (let i = 0; i < withdrawals.length; i++) {
      const w = withdrawals[i];
      if (w.used) continue;
      if (Math.abs(w.amt - row.payment) > amountTol) continue;
      const dd = dayDiff(w.date, row.dueDate);
      if (dd > dateTol) continue;
      const score = dd + Math.abs(w.amt - row.payment) / 1000;
      if (!best || score < best.score) best = { i, score };
    }
    if (best) {
      const w = withdrawals[best.i];
      w.used = true;
      row.matchedTxId = w.id;
      row.paidDate = w.date;
      matchedTxIds.push(w.id);
      matchedCount++;
    }
  }
  return { rows, matchedCount, matchedTxIds };
}
