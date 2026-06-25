'use client';

/**
 * 회계기간 마감 SSOT — ERP #18.
 *
 * 마감된 월(YYYY-MM)의 거래·결제·정산 데이터는 수정 차단.
 * 정정이 필요하면 신규 거래 (전기오류수정) 로 처리.
 *
 * 구조:
 *   closed_periods/
 *     2025-12/
 *       closedAt: ISO timestamp
 *       closedBy: 이메일 (또는 uid)
 *       note?: 마감 사유 메모
 *
 * 사용:
 *   const { closedPeriods } = useClosedPeriods();
 *   if (isPeriodClosed(closedPeriods, '2025-12')) → 수정 차단
 *
 *   admin UI:
 *   await closePeriod('2025-12', '2025년 12월 결산 완료');
 *   await reopenPeriod('2025-12', '오류 수정 필요');
 */

import { useEffect, useState } from 'react';
import { ref, onValue, set, remove as rtdbRemove } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth } from './client';
import { audit } from './audit-store';

export type ClosedPeriod = {
  closedAt: string;
  closedBy: string;
  note?: string;
  /** 재오픈 이력 — 마감 → 재오픈 → 재마감 추적 */
  reopenHistory?: Array<{ at: string; by: string; reason?: string }>;
};

export type ClosedPeriodsMap = Record<string, ClosedPeriod>; // YYYY-MM → entry

const PATH = dbPath('closed_periods');

// ── 모듈-level cache (페이지 이동·재진입 시 깜빡임 0) ──
const closedCache: { rec: ClosedPeriodsMap; loading: boolean; subscribed: boolean; listeners: Set<() => void> } = {
  rec: {}, loading: true, subscribed: false, listeners: new Set(),
};
function notifyClosedCache(): void { for (const fn of closedCache.listeners) fn(); }
async function ensureClosedSubscribed(): Promise<void> {
  if (closedCache.subscribed) return;
  closedCache.subscribed = true;
  if (!isFirebaseConfigured()) { closedCache.loading = false; notifyClosedCache(); return; }
  try { await ensureAuth(); } catch { closedCache.loading = false; notifyClosedCache(); return; }
  const db = getRtdb();
  if (!db) { closedCache.loading = false; notifyClosedCache(); return; }
  onValue(ref(db, PATH), (snap) => {
    closedCache.rec = (snap.val() as ClosedPeriodsMap) ?? {};
    closedCache.loading = false;
    notifyClosedCache();
  }, () => { closedCache.loading = false; notifyClosedCache(); });
}

export function useClosedPeriods(): {
  closedPeriods: ClosedPeriodsMap;
  loading: boolean;
} {
  const [, force] = useState(0);
  useEffect(() => {
    const rerender = () => force((x) => x + 1);
    closedCache.listeners.add(rerender);
    void ensureClosedSubscribed();
    return () => { closedCache.listeners.delete(rerender); };
  }, []);
  return { closedPeriods: closedCache.rec, loading: closedCache.loading };
}

/** YYYY-MM 이 마감 상태인가? */
export function isPeriodClosed(map: ClosedPeriodsMap, yyyymm: string): boolean {
  return !!map[yyyymm]?.closedAt;
}

/** 날짜(YYYY-MM-DD)가 마감된 회계기간 안에 있는가? */
export function isDateInClosedPeriod(map: ClosedPeriodsMap, date: string | undefined): boolean {
  if (!date || date.length < 7) return false;
  return isPeriodClosed(map, date.slice(0, 7));
}

/** 회계기간 마감 — master 권한 사용자가 호출 */
export async function closePeriod(yyyymm: string, actor: string, note?: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error('Firebase 미설정');
  await ensureAuth();
  const db = getRtdb();
  if (!db) throw new Error('RTDB 미설정');
  const entry: ClosedPeriod = {
    closedAt: new Date().toISOString(),
    closedBy: actor,
    note,
  };
  await set(ref(db, `${PATH}/${yyyymm}`), entry);
  void audit.create('system', `closed-${yyyymm}`, `회계기간 마감 ${yyyymm}`, { yyyymm, note });
}

/** 회계기간 재오픈 — 위험 작업, audit 강제 */
export async function reopenPeriod(yyyymm: string, actor: string, reason: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error('Firebase 미설정');
  if (!reason || !reason.trim()) throw new Error('재오픈 사유 필수');
  await ensureAuth();
  const db = getRtdb();
  if (!db) throw new Error('RTDB 미설정');
  await rtdbRemove(ref(db, `${PATH}/${yyyymm}`));
  void audit.delete('system', `closed-${yyyymm}`, `회계기간 재오픈 ${yyyymm} — ${reason}`, { yyyymm, reason });
}

/** 수정 차단 에러 — 마감 검사에서 사용 */
export class PeriodClosedError extends Error {
  constructor(public yyyymm: string) {
    super(`회계기간 마감됨 — ${yyyymm}월 거래는 수정할 수 없습니다. 정정은 신규 분개(전기오류수정)로 처리하세요.`);
    this.name = 'PeriodClosedError';
  }
}
