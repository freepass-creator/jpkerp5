/**
 * 스위치플랜 마이그레이션 대사 — 사업현황 채권(기록 수납) ↔ 자금일보 실입금(계좌) + CMS 정산내역.
 *
 * "계좌기반 수납처리"의 검증판. 자금일보는 실제 계좌 입금(진실)이지만 CMS집금·카드집금은
 * 뭉텅이 합계로만 찍혀 계약별 귀속이 안 된다. CMS 정산내역(회원명에 차량번호)이 그 뭉텅이를
 * 계약별로 풀어준다 → 계약별 완전 대사.
 *
 * ⚠️ 읽기전용 대사표(파일↔파일). DB 반영·자동매칭 아님(씨앗 미수 이중차감 방지).
 * 기간 = 자금일보 커버 기간(예 2026-01~04). 사업현황 결제·CMS 정산도 같은 기간만.
 */

import type { SwitchplanParseResult } from './switchplan';
import type { JboParseResult } from './switchplan-jbo';
import type { CmsParseResult } from './switchplan-cms';

function normPlate(s: string): string {
  return (s ?? '').replace(/\s+/g, '').toLowerCase();
}

/** 직접 채널 — 차량번호가 붙어 계약별 귀속되는 입금 */
const DIRECT_CHANNEL: Record<string, 'rent' | 'deposit' | 'other'> = {
  '대여료': 'rent',
  '보증금': 'deposit',
  '위약금': 'other',
  '승계수수료': 'other',
};
/** 뭉텅이 채널 — 은행엔 합계로만. CMS는 정산내역으로 배분, 카드는 별도 필요 */
const LUMP_SUBJECT: Record<string, 'cms' | 'card'> = {
  'CMS집금': 'cms',
  '카드자동집금': 'card',
};

type Channels = { rent: number; cms: number; card: number; deposit: number; other: number };

export type ReconRow = {
  plate: string;
  bizTenants: string;
  jboTenants: string;
  bizPaid: number;
  rent: number; cms: number; card: number; deposit: number; other: number;
  jboTotal: number;
  diff: number;
  carry: number;
  status: '일치' | '채권>계좌' | '계좌>채권' | '계좌만' | '채권만';
};

export type ReconResult = {
  period: { from: string; to: string };
  hasCms: boolean;
  rows: ReconRow[];
  unmatchedReceiptNoPlate: number;   // 차량번호 없는 직접 수납(오분류 등)
  totals: {
    bizPaid: number;
    jboTotal: number;
    rent: number; cms: number; card: number; deposit: number; other: number;
    cmsLumpBank: number;   // 자금일보 CMS집금 뭉텅이(계좌 실제)
    cardLumpBank: number;  // 자금일보 카드자동집금 뭉텅이
    cmsAllocated: number;  // CMS 정산내역으로 계약별 배분된 합
    plates: number;
    bothPlates: number;
    bizOnly: number;
    jboOnly: number;
    absDiff: number;
    matchRate: number;
  };
};

const FLAG = 300_000;

export function reconcileSwitchplan(biz: SwitchplanParseResult, jbo: JboParseResult, cms?: CmsParseResult): ReconResult {
  const fromMonth = (jbo.totals.dateFrom || '').slice(0, 7);
  const toMonth = (jbo.totals.dateTo || '').slice(0, 7);
  const inPeriod = (m: string) => !!m && (!fromMonth || m >= fromMonth) && (!toMonth || m <= toMonth);

  // ── 자금일보: plate별 직접채널 + 뭉텅이 집계 ──
  const jboByPlate = new Map<string, Channels & { raw: string; tenants: Set<string> }>();
  let unmatchedReceiptNoPlate = 0;
  let cmsLumpBank = 0;
  let cardLumpBank = 0;
  for (const t of jbo.transactions) {
    if (t.deposit <= 0) continue;
    if (!inPeriod((t.date || '').slice(0, 7))) continue;
    const lump = LUMP_SUBJECT[t.subject];
    if (lump === 'cms') { cmsLumpBank += t.deposit; continue; }
    if (lump === 'card') { cardLumpBank += t.deposit; continue; }
    const ch = DIRECT_CHANNEL[t.subject];
    if (!ch) continue; // 수납성 아님
    const key = normPlate(t.plate);
    if (!key) { unmatchedReceiptNoPlate += t.deposit; continue; }
    const e = jboByPlate.get(key) ?? { rent: 0, cms: 0, card: 0, deposit: 0, other: 0, raw: t.plate, tenants: new Set<string>() };
    e[ch] += t.deposit;
    if (t.tenant) e.tenants.add(t.tenant);
    jboByPlate.set(key, e);
  }

  // ── CMS 정산내역: plate별 배분 (정산일 기간, 성공분) ──
  let cmsAllocated = 0;
  if (cms) {
    for (const t of cms.transactions) {
      if (!t.success || t.collected <= 0) continue;
      const m = (t.settleDate || t.chargeMonth || '').slice(0, 7);
      if (!inPeriod(m)) continue;
      const key = normPlate(t.plate);
      if (!key) { unmatchedReceiptNoPlate += t.collected; continue; }
      const e = jboByPlate.get(key) ?? { rent: 0, cms: 0, card: 0, deposit: 0, other: 0, raw: t.plate, tenants: new Set<string>() };
      e.cms += t.collected;
      cmsAllocated += t.collected;
      jboByPlate.set(key, e);
    }
  }

  // ── 사업현황: plate별 결제(기간) + carry ──
  const bizByPlate = new Map<string, { raw: string; bizPaid: number; carry: number; tenants: Set<string> }>();
  for (const c of [...biz.current, ...biz.returned]) {
    const key = normPlate(c.vehiclePlate);
    if (!key) continue;
    const e = bizByPlate.get(key) ?? { raw: c.vehiclePlate, bizPaid: 0, carry: 0, tenants: new Set<string>() };
    for (const l of c.ledger) { if (inPeriod(l.month)) e.bizPaid += l.paid; }
    e.carry += c.carryUnpaid;
    if (c.customerName) e.tenants.add(c.customerName);
    bizByPlate.set(key, e);
  }

  // ── 병합 ──
  const plates = new Set([...jboByPlate.keys(), ...bizByPlate.keys()]);
  const rows: ReconRow[] = [];
  const tot = { bizPaid: 0, jboTotal: 0, rent: 0, cms: 0, card: 0, deposit: 0, other: 0, bothPlates: 0, bizOnly: 0, jboOnly: 0, absDiff: 0 };

  for (const p of plates) {
    const j = jboByPlate.get(p);
    const b = bizByPlate.get(p);
    const rent = j?.rent ?? 0, cms_ = j?.cms ?? 0, card = j?.card ?? 0, deposit = j?.deposit ?? 0, other = j?.other ?? 0;
    const jboTotal = rent + cms_ + card + deposit + other;
    const bizPaid = b?.bizPaid ?? 0;
    const diff = bizPaid - jboTotal;

    let status: ReconRow['status'];
    if (!j) status = '채권만';
    else if (!b) status = '계좌만';
    else if (Math.abs(diff) <= FLAG) status = '일치';
    else if (diff > 0) status = '채권>계좌';
    else status = '계좌>채권';

    rows.push({
      plate: b?.raw || j?.raw || p,
      bizTenants: b ? [...b.tenants].join(',') : '',
      jboTenants: j ? [...j.tenants].join(',') : '',
      bizPaid, rent, cms: cms_, card, deposit, other, jboTotal, diff,
      carry: b?.carry ?? 0,
      status,
    });

    tot.bizPaid += bizPaid; tot.jboTotal += jboTotal;
    tot.rent += rent; tot.cms += cms_; tot.card += card; tot.deposit += deposit; tot.other += other;
    tot.absDiff += Math.abs(diff);
    if (j && b) tot.bothPlates++;
    else if (b) tot.bizOnly++;
    else tot.jboOnly++;
  }

  rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const denom = Math.max(tot.bizPaid, tot.jboTotal, 1);

  return {
    period: { from: fromMonth, to: toMonth },
    hasCms: !!cms,
    rows,
    unmatchedReceiptNoPlate,
    totals: {
      bizPaid: tot.bizPaid, jboTotal: tot.jboTotal,
      rent: tot.rent, cms: tot.cms, card: tot.card, deposit: tot.deposit, other: tot.other,
      cmsLumpBank, cardLumpBank, cmsAllocated,
      plates: plates.size, bothPlates: tot.bothPlates, bizOnly: tot.bizOnly, jboOnly: tot.jboOnly,
      absDiff: tot.absDiff,
      matchRate: Math.max(0, 1 - tot.absDiff / denom),
    },
  };
}
