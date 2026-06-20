'use client';

/**
 * 정책 SSOT — 회사 운영 정책을 코드에서 데이터로 분리.
 *
 * v6 의 POLICY_DEF + pol('insExpiry') 패턴 v5 도입.
 *
 * 현재 v5 의 임박일·연체일은 코드에 박힘 (예: alerts.ts 의 `<= 30`, `<= 7`).
 * 회사가 정책 변경 시 (예: 임박 30일 → 45일) 코드 수정 필요.
 *
 * 도입 후:
 *   import { pol } from '@/lib/policy';
 *   if (days <= pol('insExpiry')) { ... }     // 30일 (기본) 또는 회사가 settings 에서 변경
 *
 * Firebase RTDB `policy/{key}: number` 노드 사용. master 만 변경 가능 (Rules 추가 필요).
 * 미설정 시 POLICY_DEF 의 default 값.
 *
 * 점진적 도입: 기존 코드는 안 건드림. 새 코드부터 pol() 호출. 또는 명시적으로 교체.
 *
 * v7 으로 갈 때 그대로 매핑 (v6 의 pol() 과 호환).
 */

import { useState, useEffect } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth } from './firebase/client';
import { audit } from './firebase/audit-store';

/**
 * 정책 정의 — 추가/수정 시 여기만 변경.
 * 각 정책: label (settings UI 표시) · default 값 · 단위.
 */
export const POLICY_DEF = {
  insExpiry:      { label: '보험 만기 임박 알림', default: 30, unit: '일 전', group: '자산' },
  inspExpiry:     { label: '정기검사 임박 알림',   default: 30, unit: '일 전', group: '자산' },
  contractExpiry: { label: '계약 만기 임박 알림',   default: 30, unit: '일 전', group: '계약' },
  licenseExpiry:  { label: '면허 만기 임박 알림',   default: 30, unit: '일 전', group: '계약' },
  arrearsLock:    { label: '연체 시동제어 기준',   default: 3,  unit: '일 (D+)', group: '리스크' },
  arrearsLegal:   { label: '연체 내용증명 기준',   default: 10, unit: '일 (D+)', group: '리스크' },
  arrearsDebt:    { label: '연체 채권화 검토 기준', default: 30, unit: '일 (D+)', group: '리스크' },
  depositReturn:  { label: '보증금 반환 기한',     default: 5,  unit: '정산 후 일', group: '수납' },
  urgentDays:     { label: '긴급 알림 (D-N 이내)', default: 7,  unit: '일',        group: '자산' },
} as const;

export type PolicyKey = keyof typeof POLICY_DEF;

const PATH = dbPath('policy');

/** 현재 메모리에 캐시된 정책 값 (모든 useEffect 호출이 공유) */
let policyCache: Partial<Record<PolicyKey, number>> = {};
let policyLoaded = false;
let policySubscribed = false;

/** 정책 값 조회 — undefined 면 default. SSR 안전 (cache 만 사용). */
export function pol(key: PolicyKey): number {
  const cached = policyCache[key];
  if (cached != null) return cached;
  return POLICY_DEF[key].default;
}

/** 모든 정책 값 한 번에 (settings 페이지용) */
export function allPolicies(): Record<PolicyKey, number> {
  const out = {} as Record<PolicyKey, number>;
  for (const k of Object.keys(POLICY_DEF) as PolicyKey[]) {
    out[k] = pol(k);
  }
  return out;
}

/** 정책 값 변경 (master 만 호출. Rules 가 권한 강제) */
export async function setPolicy(key: PolicyKey, value: number): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  const safe = Math.max(0, Math.floor(Number(value) || 0));
  await set(ref(db, `${PATH}/${key}`), safe);
  policyCache[key] = safe;
  void audit.update('system', 'policy', `정책 변경 — ${POLICY_DEF[key].label} = ${safe}${POLICY_DEF[key].unit}`);
}

/**
 * 정책 실시간 구독 hook — Provider 또는 settings 페이지에서 호출.
 * 호출 안 해도 pol() 은 default 반환 (안전 fallback).
 */
export function usePolicies(): {
  policies: Record<PolicyKey, number>;
  loading: boolean;
  setPolicy: typeof setPolicy;
} {
  const [policies, setPolicies] = useState<Record<PolicyKey, number>>(allPolicies);
  const [loading, setLoading] = useState(!policyLoaded);
  const [configured] = useState(() => isFirebaseConfigured());

  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    if (policySubscribed) {
      setPolicies(allPolicies());
      setLoading(false);
      return;
    }
    policySubscribed = true;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try { await ensureAuth(); } catch { setLoading(false); return; }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) { setLoading(false); return; }
      unsub = onValue(ref(db, PATH), (snap) => {
        const val = (snap.val() as Record<string, number> | null) ?? {};
        policyCache = {};
        for (const k of Object.keys(POLICY_DEF) as PolicyKey[]) {
          if (typeof val[k] === 'number') policyCache[k] = val[k];
        }
        policyLoaded = true;
        setPolicies(allPolicies());
        setLoading(false);
      }, () => { setLoading(false); });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [configured]);

  return { policies, loading, setPolicy };
}

/**
 * 사용 예 (점진적 도입):
 *
 *   // 기존:
 *   if (days <= 30) toast.warning(...)
 *
 *   // 도입 후:
 *   if (days <= pol('insExpiry')) toast.warning(...)
 *
 *   // settings 페이지:
 *   const { policies, setPolicy } = usePolicies();
 *   <input value={policies.insExpiry} onChange={(e) => setPolicy('insExpiry', Number(e.target.value))} />
 *
 * v7 로 갈 때:
 *   v6 의 pol('insExpiry') 와 1:1 매핑. 마이그레이션 cost 0.
 */
