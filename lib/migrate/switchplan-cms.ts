/**
 * 스위치플랜 CMS 정산내역 파서 — 「정산일_회원상세_결제내역_YYYY.xlsx」.
 *
 * 효성CMS 집금은 은행(자금일보)에 뭉텅이 합계로만 찍혀 계약별 귀속이 안 된다.
 * 이 정산내역이 그 뭉텅이를 계약별로 푼다: 회원명에 차량번호가 박혀 있어(예
 * "827버3872 전국연합누수119(조일연)") 수납금액을 차량(계약)별로 배분할 수 있다.
 *
 * 컬럼: 회원번호/회원명/청구월/결제상태/결제수단/정산일/결제일/수납금액/미납금액/공급가액/부가세/비고…
 */

import * as XLSX from 'xlsx-js-style';

const PLATE_RE = /\d{2,3}[가-힣]\d{4}/;

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
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Math.round(v);
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return isFinite(n) ? Math.round(n) : 0;
}
function normDate(s: string): string {
  const m = cellStr(s).match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
}

export type CmsRow = {
  plate: string;         // 회원명에서 추출
  memberName: string;    // 원문 회원명
  chargeMonth: string;   // 청구월 (YYYY-MM)
  settleDate: string;    // 정산일 (은행 집금일) YYYY-MM-DD
  payDate: string;       // 결제일
  status: string;        // 결제상태 (완납/결제실패 등)
  method: string;        // 결제수단 (CMS/카드…)
  collected: number;     // 수납금액 (성공분)
  unpaid: number;        // 미납금액
  vat: number;           // 부가세
  reason: string;        // 비고 (실패사유)
  success: boolean;
};

export type CmsParseResult = {
  transactions: CmsRow[];
  totals: {
    count: number;
    collected: number;    // 성공 수납금액 합
    failedAmt: number;    // 실패 미납금액 합
    failCount: number;
    plates: number;
    withPlate: number;    // 차량번호 추출 성공 건수
    dateFrom: string;
    dateTo: string;
  };
  warnings: string[];
};

export function parseSwitchplanCms(buf: ArrayBuffer): CmsParseResult {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const warnings: string[] = [];
  const transactions: CmsRow[] = [];

  for (const sn of wb.SheetNames) {
    const G = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, blankrows: false, defval: '' });
    const hRow = G.findIndex((r) => (r as unknown[]).some((v) => cellStr(v) === '회원명'));
    if (hRow < 0) { warnings.push(`${sn}: '회원명' 헤더 없음 — skip`); continue; }
    const h = (G[hRow] as unknown[]).map(cellStr);
    const ci = (...labels: string[]) => { for (const l of labels) { const i = h.indexOf(l); if (i >= 0) return i; } return -1; };
    const col = {
      member: ci('회원명'), cmonth: ci('청구월'), status: ci('결제상태', '수납상태'),
      method: ci('결제수단'), settle: ci('정산일'), pay: ci('결제일'),
      collected: ci('수납금액'), unpaid: ci('미납금액'), vat: ci('부가세'),
      charged: ci('청구금액'), reason: ci('비고'),
    };
    const gs = (row: unknown[], c: number) => (c >= 0 ? cellStr(row[c]) : '');
    const gn = (row: unknown[], c: number) => (c >= 0 ? cellNum(row[c]) : 0);
    for (let r = hRow + 1; r < G.length; r++) {
      const row = G[r] as unknown[];
      const memberName = gs(row, col.member);
      if (!memberName) continue;
      const pm = memberName.match(PLATE_RE);
      const plate = pm ? pm[0] : '';
      const status = gs(row, col.status);
      // 수납금액 우선, 없으면(구 CMS.xlsx) 완납일 때 청구금액
      let collected = gn(row, col.collected);
      if (col.collected < 0 && /완납/.test(status)) collected = gn(row, col.charged);
      const success = collected > 0 || /완납/.test(status);
      const cm = gs(row, col.cmonth).match(/(\d{4})[.\-/](\d{1,2})/);
      transactions.push({
        plate,
        memberName,
        chargeMonth: cm ? `${cm[1]}-${cm[2].padStart(2, '0')}` : '',
        settleDate: normDate(gs(row, col.settle)) || normDate(gs(row, col.pay)),
        payDate: normDate(gs(row, col.pay)),
        status,
        method: gs(row, col.method) || 'CMS',
        collected: success ? collected : 0,
        unpaid: gn(row, col.unpaid),
        vat: gn(row, col.vat),
        reason: gs(row, col.reason),
        success,
      });
    }
  }

  const plates = new Set<string>();
  let collected = 0, failedAmt = 0, failCount = 0, withPlate = 0, dateFrom = '', dateTo = '';
  for (const t of transactions) {
    if (t.plate) { plates.add(t.plate); withPlate++; }
    if (t.success) collected += t.collected; else { failedAmt += t.unpaid; failCount++; }
    const d = t.settleDate;
    if (d) { if (!dateFrom || d < dateFrom) dateFrom = d; if (!dateTo || d > dateTo) dateTo = d; }
  }

  return {
    transactions,
    totals: { count: transactions.length, collected, failedAmt, failCount, plates: plates.size, withPlate, dateFrom, dateTo },
    warnings,
  };
}
