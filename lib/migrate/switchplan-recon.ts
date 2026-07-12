/**
 * 스위치플랜 마이그레이션 대사 — 사업현황 채권(기록 수납) ↔ 자금일보 실입금(3채널).
 *
 * "계좌기반 수납처리"의 검증판: 직원이 채권에 손으로 적은 수납이, 실제 계좌·CMS·카드
 * 입금과 계약(차량)별로 맞는지 대조한다. 자금일보가 차량번호·임차인을 태깅해둔 덕에
 * 계약별 귀속이 직접 된다.
 *
 * ⚠️ 읽기전용 대사표(파일↔파일). DB 반영·자동매칭 아님(씨앗 미수 이중차감 방지).
 * 기간은 자금일보 커버 기간(예 2026-01~04)으로 자동 한정 — 사업현황 결제도 같은 기간만 합산.
 */

import type { SwitchplanParseResult } from './switchplan';
import type { JboParseResult } from './switchplan-jbo';

function normPlate(s: string): string {
  return (s ?? '').replace(/\s+/g, '').toLowerCase();
}

/** 자금일보 계정과목 → 수납 채널 (없으면 수납성 아님 → 제외) */
const RECEIPT_CHANNEL: Record<string, 'rent' | 'cms' | 'card' | 'deposit' | 'other'> = {
  '대여료': 'rent',
  'CMS집금': 'cms',
  '카드자동집금': 'card',
  '보증금': 'deposit',
  '위약금': 'other',
  '승계수수료': 'other',
};

type Channels = { rent: number; cms: number; card: number; deposit: number; other: number };

export type ReconRow = {
  plate: string;            // 표시용 차량번호
  bizTenants: string;       // 사업현황 코드명(들)
  jboTenants: string;       // 자금일보 임차인(들)
  bizPaid: number;          // 사업현황 결제(기간)
  rent: number; cms: number; card: number; deposit: number; other: number;
  jboTotal: number;         // 자금일보 실입금(기간, 3채널+)
  diff: number;             // bizPaid − jboTotal
  carry: number;            // 현재 미수(전체기간 carry)
  status: '일치' | '채권>계좌' | '계좌>채권' | '계좌만' | '채권만';
};

export type ReconResult = {
  period: { from: string; to: string };
  rows: ReconRow[];
  unmatchedReceiptNoPlate: number;   // 차량번호 없는 수납성 입금 합 (집금 라벨없음 등)
  totals: {
    bizPaid: number;
    jboTotal: number;
    rent: number; cms: number; card: number; deposit: number; other: number;
    plates: number;
    bothPlates: number;    // 양쪽 다 있는 차량
    bizOnly: number;       // 사업현황 결제만
    jboOnly: number;       // 자금일보 입금만
    absDiff: number;       // Σ|diff|
    matchRate: number;     // 1 − Σ|diff| / max(bizPaid, jboTotal)
  };
};

const FLAG = 300_000; // 이보다 크게 벌어지면 확인 대상

export function reconcileSwitchplan(biz: SwitchplanParseResult, jbo: JboParseResult): ReconResult {
  const fromMonth = (jbo.totals.dateFrom || '').slice(0, 7);
  const toMonth = (jbo.totals.dateTo || '').slice(0, 7);
  const inPeriod = (m: string) => !!m && (!fromMonth || m >= fromMonth) && (!toMonth || m <= toMonth);

  // ── 자금일보: plate별 수납 채널 집계 (기간) ──
  const jboByPlate = new Map<string, Channels & { raw: string; tenants: Set<string> }>();
  let unmatchedReceiptNoPlate = 0;
  for (const t of jbo.transactions) {
    if (t.deposit <= 0) continue;
    const ch = RECEIPT_CHANNEL[t.subject];
    if (!ch) continue; // 수납성 아님(자금이동·차입금·매각 등 제외)
    if (!inPeriod((t.date || '').slice(0, 7))) continue;
    const key = normPlate(t.plate);
    if (!key) { unmatchedReceiptNoPlate += t.deposit; continue; }
    const e = jboByPlate.get(key) ?? { rent: 0, cms: 0, card: 0, deposit: 0, other: 0, raw: t.plate, tenants: new Set<string>() };
    e[ch] += t.deposit;
    if (t.tenant) e.tenants.add(t.tenant);
    jboByPlate.set(key, e);
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

  // ── 병합 대사 ──
  const plates = new Set([...jboByPlate.keys(), ...bizByPlate.keys()]);
  const rows: ReconRow[] = [];
  const tot = { bizPaid: 0, jboTotal: 0, rent: 0, cms: 0, card: 0, deposit: 0, other: 0, bothPlates: 0, bizOnly: 0, jboOnly: 0, absDiff: 0 };

  for (const p of plates) {
    const j = jboByPlate.get(p);
    const b = bizByPlate.get(p);
    const rent = j?.rent ?? 0, cms = j?.cms ?? 0, card = j?.card ?? 0, deposit = j?.deposit ?? 0, other = j?.other ?? 0;
    const jboTotal = rent + cms + card + deposit + other;
    const bizPaid = b?.bizPaid ?? 0;
    const diff = bizPaid - jboTotal;

    let status: ReconRow['status'];
    if (!j) status = '채권만';
    else if (!b) status = '계좌만';
    else if (Math.abs(diff) <= FLAG) status = '일치';
    else if (diff > 0) status = '채권>계좌';
    else status = '계좌>채권';

    rows.push({
      plate: (b?.raw || j?.raw || p),
      bizTenants: b ? [...b.tenants].join(',') : '',
      jboTenants: j ? [...j.tenants].join(',') : '',
      bizPaid, rent, cms, card, deposit, other, jboTotal, diff,
      carry: b?.carry ?? 0,
      status,
    });

    tot.bizPaid += bizPaid; tot.jboTotal += jboTotal;
    tot.rent += rent; tot.cms += cms; tot.card += card; tot.deposit += deposit; tot.other += other;
    tot.absDiff += Math.abs(diff);
    if (j && b) tot.bothPlates++;
    else if (b) tot.bizOnly++;
    else tot.jboOnly++;
  }

  rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const denom = Math.max(tot.bizPaid, tot.jboTotal, 1);
  return {
    period: { from: fromMonth, to: toMonth },
    rows,
    unmatchedReceiptNoPlate,
    totals: {
      bizPaid: tot.bizPaid, jboTotal: tot.jboTotal,
      rent: tot.rent, cms: tot.cms, card: tot.card, deposit: tot.deposit, other: tot.other,
      plates: plates.size, bothPlates: tot.bothPlates, bizOnly: tot.bizOnly, jboOnly: tot.jboOnly,
      absDiff: tot.absDiff,
      matchRate: Math.max(0, 1 - tot.absDiff / denom),
    },
  };
}
