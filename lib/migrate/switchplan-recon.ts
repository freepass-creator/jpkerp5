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

type Channels = { rent: number; deposit: number; other: number };

export type ReconRow = {
  plate: string;
  bizTenants: string;
  jboTenants: string;
  bizPaid: number;
  rent: number; deposit: number; other: number;
  cmsSuccess: number;   // CMS 정산 성공(진단) — 겹침 시 이미 대여료에 포함
  cmsFailed: number;    // CMS 결제실패 미납(→ 미수 신호)
  cmsInTotal: number;   // jboTotal 에 실제 반영된 CMS(직접대여료 없는 CMS-only 만)
  jboTotal: number;     // 계좌 실입금(직접대여료 + 보증금 + CMS-only)
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
    rent: number; deposit: number; other: number;
    cmsLumpBank: number;    // 자금일보 CMS집금 뭉텅이(계좌 실제)
    cardLumpBank: number;   // 자금일보 카드자동집금 뭉텅이
    cmsSuccess: number;     // CMS 정산 성공수납 합(기간)
    cmsFailed: number;      // CMS 결제실패 미납 합 → 미수 신호
    cmsInTotal: number;     // jboTotal 에 반영된 CMS(CMS-only 계약만, 겹침 제외)
    overlapCount: number;   // 직접대여료+CMS 둘다인 계약 수(이중계상 방지 대상)
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
    const e = jboByPlate.get(key) ?? { rent: 0, deposit: 0, other: 0, raw: t.plate, tenants: new Set<string>() };
    e[ch] += t.deposit;
    if (t.tenant) e.tenants.add(t.tenant);
    jboByPlate.set(key, e);
  }

  // ── CMS 정산내역: plate별 성공/최종미납 ──
  //  · jboTotal엔 직접대여료 없는 CMS-only만 반영(겹침은 이미 '대여료' 태깅 → 이중계상 방지, 진단만)
  //  · 재결제(재시도)는 (plate,청구월) 단위로 묶어 "그 달에 한 번이라도 성공하면 미납 0" → 최종미납만 미수신호
  const cmsByPlate = new Map<string, { success: number; failed: number; raw: string }>();
  let cmsSuccessTot = 0, cmsFailedTot = 0;
  if (cms) {
    const monthAgg = new Map<string, { plate: string; raw: string; anySuccess: boolean; collected: number; charge: number }>();
    for (const t of cms.transactions) {
      const m = (t.settleDate || t.chargeMonth || '').slice(0, 7);
      if (!inPeriod(m)) continue;
      const key = normPlate(t.plate);
      if (!key) { if (t.success) unmatchedReceiptNoPlate += t.collected; continue; }
      const gk = `${key}|${t.chargeMonth || m}`;
      const e = monthAgg.get(gk) ?? { plate: key, raw: t.plate, anySuccess: false, collected: 0, charge: 0 };
      if (t.success) { e.anySuccess = true; e.collected += t.collected; }
      e.charge = Math.max(e.charge, t.unpaid, t.collected); // 그 달 청구액 추정
      monthAgg.set(gk, e);
    }
    for (const e of monthAgg.values()) {
      const ce = cmsByPlate.get(e.plate) ?? { success: 0, failed: 0, raw: e.raw };
      if (e.anySuccess) { ce.success += e.collected; cmsSuccessTot += e.collected; }
      else { ce.failed += e.charge; cmsFailedTot += e.charge; } // 최종미납(재시도 중복 제거)
      cmsByPlate.set(e.plate, ce);
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
  const plates = new Set([...jboByPlate.keys(), ...bizByPlate.keys(), ...cmsByPlate.keys()]);
  const rows: ReconRow[] = [];
  const tot = { bizPaid: 0, jboTotal: 0, rent: 0, deposit: 0, other: 0, bothPlates: 0, bizOnly: 0, jboOnly: 0, absDiff: 0 };
  let overlapCount = 0, cmsInTotalSum = 0;

  for (const p of plates) {
    const j = jboByPlate.get(p);
    const b = bizByPlate.get(p);
    const cm = cmsByPlate.get(p);
    const rent = j?.rent ?? 0, deposit = j?.deposit ?? 0, other = j?.other ?? 0;
    const cmsSuccess = cm?.success ?? 0, cmsFailed = cm?.failed ?? 0;
    if (rent > 0 && cmsSuccess > 0) overlapCount++;
    // 겹침 이중계상 방지: 직접대여료 있으면 CMS는 이미 그 안에 포함 → jboTotal 미반영(진단만)
    const cmsInTotal = rent > 0 ? 0 : cmsSuccess;
    cmsInTotalSum += cmsInTotal;
    const jboTotal = rent + deposit + other + cmsInTotal;
    const bizPaid = b?.bizPaid ?? 0;
    const diff = bizPaid - jboTotal;
    const hasJbo = !!j || cmsInTotal > 0;

    let status: ReconRow['status'];
    if (!hasJbo) status = '채권만';
    else if (!b) status = '계좌만';
    else if (Math.abs(diff) <= FLAG) status = '일치';
    else if (diff > 0) status = '채권>계좌';
    else status = '계좌>채권';

    rows.push({
      plate: b?.raw || j?.raw || cm?.raw || p,
      bizTenants: b ? [...b.tenants].join(',') : '',
      jboTenants: j ? [...j.tenants].join(',') : '',
      bizPaid, rent, deposit, other, cmsSuccess, cmsFailed, cmsInTotal, jboTotal, diff,
      carry: b?.carry ?? 0,
      status,
    });

    tot.bizPaid += bizPaid; tot.jboTotal += jboTotal;
    tot.rent += rent; tot.deposit += deposit; tot.other += other;
    tot.absDiff += Math.abs(diff);
    if (hasJbo && b) tot.bothPlates++;
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
      rent: tot.rent, deposit: tot.deposit, other: tot.other,
      cmsLumpBank, cardLumpBank,
      cmsSuccess: cmsSuccessTot, cmsFailed: cmsFailedTot, cmsInTotal: cmsInTotalSum,
      overlapCount,
      plates: plates.size, bothPlates: tot.bothPlates, bizOnly: tot.bizOnly, jboOnly: tot.jboOnly,
      absDiff: tot.absDiff,
      matchRate: Math.max(0, 1 - tot.absDiff / denom),
    },
  };
}
