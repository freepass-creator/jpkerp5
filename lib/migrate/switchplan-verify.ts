/**
 * 스위치플랜 현재 미수 검증 — 채권(직원 기록) ↔ CMS 정산내역 계약×월 교차검증.
 *
 * 목표: 직원이 정리한 「현재 미수」에서 틀린 걸 잡아준다. 깨끗한 신호만:
 *  ★ 허수 미수: (차량,월) 단위로 CMS가 그 달 실제로 걷혔는데(성공) 채권은 그 달 미납으로 남김
 *     → 돈은 들어왔는데 직원이 수납 기록을 빠뜨림 = 안 받은 게 아닌데 미수로 잡힌 것.
 *     CMS가 그 달 돈을 받았다는 건 확실하므로(직접납부 오탐 없음) 신뢰도 높음.
 *  · 참고(누락): CMS 최종 미수납인데 채권 미수 없음 — 직접납부로 해소됐을 수 있어 오탐多 → 참고만.
 *
 * (재결제 중복은 (차량,청구월) 최종상태로 제거.)
 */

import type { SwitchplanParseResult } from './switchplan';
import type { CmsParseResult } from './switchplan-cms';

function normPlate(s: string): string {
  return (s ?? '').replace(/\s+/g, '').toLowerCase();
}
function addMonthStr(ym: string, k: number): string {
  const [y, m] = ym.split('-').map(Number);
  let yy = y, mm = m + k;
  yy += Math.floor((mm - 1) / 12); mm = ((mm - 1) % 12 + 12) % 12 + 1;
  return `${yy}-${String(mm).padStart(2, '0')}`;
}

export type MisuVerifyRow = {
  plate: string;
  tenant: string;
  staffMisu: number;        // 채권 현재 미수(carry)
  falseMisu: number;        // ★허수 미수: CMS 걷힌 달인데 채권 미납인 금액 합
  falseMonths: string;      // 해당 월들
  cmsFinalUnpaid: number;   // 참고: CMS 최종 미수납(직접납부로 해소 가능 → 오탐多)
  verdict: '허수의심' | '누락참고' | '정상' | 'CMS무관';
  note: string;
};

export type MisuVerifyResult = {
  window: { from: string; to: string };
  rows: MisuVerifyRow[];
  summary: {
    checked: number;
    falseMisuCount: number;   // 허수 미수 의심 계약 수
    falseMisuAmount: number;  // 허수 미수 의심 총액
    missingRefCount: number;  // 누락 참고 건수
    ok: number;
  };
};

const GAP = 500_000; // 이보다 크게 걸릴 때만 (조금 누락은 직원 재량)

export function verifyMisuVsCms(biz: SwitchplanParseResult, cms: CmsParseResult, asOf: string, windowMonths = 6): MisuVerifyResult {
  const asMonth = asOf.slice(0, 7);
  const fromMonth = addMonthStr(asMonth, -(windowMonths - 1));
  const inWin = (m: string) => !!m && m >= fromMonth && m <= asMonth;

  // ── 채권 (차량,월) 단위: 그 달 청구/결제/미납 ──
  const bizMonth = new Map<string, { charged: number; paid: number }>();
  const bizByPlate = new Map<string, { carry: number; tenant: string; raw: string }>();
  for (const c of [...biz.current, ...biz.returned]) {
    const key = normPlate(c.vehiclePlate);
    if (!key) continue;
    const e = bizByPlate.get(key) ?? { carry: 0, tenant: c.customerName, raw: c.vehiclePlate };
    e.carry += c.carryUnpaid;
    bizByPlate.set(key, e);
    for (const l of c.ledger) {
      if (!inWin(l.month)) continue;
      const gk = `${key}|${l.month}`;
      const m = bizMonth.get(gk) ?? { charged: 0, paid: 0 };
      m.charged += l.charged > 0 ? l.charged : (l.paid > 0 ? l.paid : 0);
      m.paid += l.paid;
      bizMonth.set(gk, m);
    }
  }

  // ── CMS (차량,청구월) 최종상태 ──
  const cmsMonth = new Map<string, { anySuccess: boolean; collected: number; charge: number; raw: string; plate: string }>();
  for (const t of cms.transactions) {
    const cm = (t.chargeMonth || t.settleDate || '').slice(0, 7);
    if (!inWin(cm)) continue;
    const key = normPlate(t.plate);
    if (!key) continue;
    const gk = `${key}|${cm}`;
    const e = cmsMonth.get(gk) ?? { anySuccess: false, collected: 0, charge: 0, raw: t.plate, plate: key };
    if (t.success) { e.anySuccess = true; e.collected += t.collected; }
    e.charge = Math.max(e.charge, t.unpaid, t.collected);
    cmsMonth.set(gk, e);
  }

  // ── 교차: 허수(그달 CMS걷힘 && 채권미납) / 누락참고(그달 CMS최종실패) ──
  type Agg = { false: number; falseMonths: string[]; finalUnpaid: number; collected: number; raw: string; plate: string };
  const agg = new Map<string, Agg>();
  const getAgg = (plate: string, raw: string) => {
    const a = agg.get(plate) ?? { false: 0, falseMonths: [], finalUnpaid: 0, collected: 0, raw, plate };
    agg.set(plate, a); return a;
  };
  for (const [gk, cm] of cmsMonth) {
    const [plate, month] = gk.split('|');
    const bm = bizMonth.get(gk);
    const bizShort = bm ? Math.max(0, bm.charged - bm.paid) : 0;
    const a = getAgg(plate, cm.raw);
    if (cm.anySuccess) {
      a.collected += cm.collected;
      // CMS는 그 달 걷혔는데 채권은 그 달 미납 → 허수
      if (cm.collected > 0 && bizShort > 0) { a.false += Math.min(cm.collected, bizShort); a.falseMonths.push(month); }
    } else {
      a.finalUnpaid += cm.charge; // 참고용
    }
  }

  const rows: MisuVerifyRow[] = [];
  const sum = { checked: 0, falseMisuCount: 0, falseMisuAmount: 0, missingRefCount: 0, ok: 0 };
  const plates = new Set([...bizByPlate.keys(), ...agg.keys()]);
  for (const p of plates) {
    const b = bizByPlate.get(p);
    const a = agg.get(p);
    const staffMisu = b?.carry ?? 0;
    const falseMisu = a?.false ?? 0;
    const finalUnpaid = a?.finalUnpaid ?? 0;
    const hasCms = !!a && (a.false > 0 || a.finalUnpaid > 0 || a.collected > 0);
    if (!hasCms) { rows.push({ plate: b?.raw || p, tenant: b?.tenant ?? '', staffMisu, falseMisu: 0, falseMonths: '', cmsFinalUnpaid: 0, verdict: 'CMS무관', note: '' }); continue; }
    sum.checked++;
    let verdict: MisuVerifyRow['verdict'] = '정상';
    let note = '';
    if (falseMisu >= GAP) {
      verdict = '허수의심';
      note = `CMS가 ${a!.falseMonths.join(',')} 걷혔는데 채권은 미납 → 수납 기록 누락(허수) ${Math.round(falseMisu / 10000)}만`;
      sum.falseMisuCount++; sum.falseMisuAmount += falseMisu;
    } else if (finalUnpaid >= GAP && staffMisu < GAP) {
      verdict = '누락참고';
      note = `CMS 최종 미수납 ${Math.round(finalUnpaid / 10000)}만인데 채권 미수 적음(직접납부면 정상 — 참고)`;
      sum.missingRefCount++;
    } else { verdict = '정상'; sum.ok++; }
    rows.push({ plate: b?.raw || a!.raw, tenant: b?.tenant ?? '', staffMisu, falseMisu, falseMonths: a?.falseMonths.join(',') ?? '', cmsFinalUnpaid: finalUnpaid, verdict, note });
  }

  const rank = (v: MisuVerifyRow['verdict']) => (v === '허수의심' ? 0 : v === '누락참고' ? 1 : v === '정상' ? 2 : 3);
  rows.sort((a, b) => rank(a.verdict) - rank(b.verdict) || (b.falseMisu - a.falseMisu) || (b.cmsFinalUnpaid - a.cmsFinalUnpaid));

  return { window: { from: fromMonth, to: asMonth }, rows, summary: sum };
}
