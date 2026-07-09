'use client';

/**
 * 모듈 on/off SSOT — 회사 운영 규모에 맞게 기능 모듈 토글.
 *
 * v6 의 MODULES + modOn(k) 패턴 v5 도입.
 *
 * 예: 작은 회사 = 수납 모듈 off → 회차표·미수 계산 등 안 보임
 *     모든 회사 = 코어(운영·리스크) 는 항상 ON, 끄기 불가
 *
 * 사용:
 *   import { modOn } from '@/lib/modules';
 *   if (modOn('수납')) renderScheduleTable();
 *
 *   // settings:
 *   const { modules, toggleModule } = useModules();
 *   <Toggle on={modules.수납} onChange={() => toggleModule('수납')} />
 *
 * 기존 코드 안 건드림 — 새 컴포넌트만 modOn() 호출. 또는 명시적 교체.
 *
 * v7 으로 갈 때 v6 의 modOn() 과 1:1 매핑.
 */

import { useState, useEffect } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth } from './firebase/client';
import { audit } from './firebase/audit-store';

/** 토글 가능한 모듈 정의 (코어=운영·리스크 는 항상 ON, 여기 없음) */
export const MODULES = {
  자산:   { label: '자산 관리',   default: true,  desc: '차량 등록·할부·보험·검사·GPS' },
  계약:   { label: '계약 관리',   default: true,  desc: '계약자·계약 조건·금액·기간' },
  수납:   { label: '수납 관리',   default: true,  desc: '회차표·자동매칭·미수금 계산' },
  사진:   { label: '차량 사진',   default: false, desc: '인도·반납 사진 갤러리' },
  정비:   { label: '정비 이력',   default: true,  desc: '정비·세차·부품교체 이력' },
  과태료: { label: '과태료',     default: true,  desc: 'OCR 등록·임차인 매칭·통보' },
  보험:   { label: '보험증권',   default: true,  desc: '증권 OCR·만기 관리' },
} as const;

export type ModuleKey = keyof typeof MODULES;

const PATH = dbPath('modules');

let moduleCache: Partial<Record<ModuleKey, boolean>> = {};
let moduleLoaded = false;
let moduleSubscribed = false;

/** 모듈 ON 여부 — undefined 면 default. SSR 안전. */
export function modOn(key: ModuleKey): boolean {
  const cached = moduleCache[key];
  if (cached != null) return cached;
  return MODULES[key].default;
}

/** 모든 모듈 상태 한 번에 */
export function allModules(): Record<ModuleKey, boolean> {
  const out = {} as Record<ModuleKey, boolean>;
  for (const k of Object.keys(MODULES) as ModuleKey[]) {
    out[k] = modOn(k);
  }
  return out;
}

/** 모듈 토글 (master 만) */
export async function setModule(key: ModuleKey, on: boolean): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await ensureAuth();
  const db = getRtdb();
  if (!db) return;
  await set(ref(db, `${PATH}/${key}`), on);
  moduleCache[key] = on;
  void audit.update('system', 'modules', `모듈 ${on ? 'ON' : 'OFF'} — ${MODULES[key].label}`);
}

/** 모듈 실시간 구독 hook */
export function useModules(): {
  modules: Record<ModuleKey, boolean>;
  loading: boolean;
  toggleModule: (key: ModuleKey) => Promise<void>;
} {
  const [modules, setModules] = useState<Record<ModuleKey, boolean>>(allModules);
  const [loading, setLoading] = useState(!moduleLoaded);
  const [configured] = useState(() => isFirebaseConfigured());

  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    if (moduleSubscribed) {
      setModules(allModules());
      setLoading(false);
      return;
    }
    moduleSubscribed = true;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try { await ensureAuth(); } catch { setLoading(false); return; }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) { setLoading(false); return; }
      unsub = onValue(ref(db, PATH), (snap) => {
        const val = (snap.val() as Record<string, boolean> | null) ?? {};
        moduleCache = {};
        for (const k of Object.keys(MODULES) as ModuleKey[]) {
          if (typeof val[k] === 'boolean') moduleCache[k] = val[k];
        }
        moduleLoaded = true;
        setModules(allModules());
        setLoading(false);
      }, () => { setLoading(false); });
    })();
    // unmount 시 플래그 리셋 — 안 하면 재방문 시 재구독을 건너뛰어 모듈 토글 UI 가 얼어붙음
    // (useModules 소비자는 settings 페이지 단독). policy.ts usePolicies 와 동일 처리.
    return () => { cancelled = true; if (unsub) unsub(); moduleSubscribed = false; };
  }, [configured]);

  async function toggleModule(key: ModuleKey): Promise<void> {
    const current = modOn(key);
    await setModule(key, !current);
  }

  return { modules, loading, toggleModule };
}

/**
 * v7 으로 갈 때:
 *   v6 의 MODULES = ['자산','계약','수납','사진'] 와 modOn(k) 그대로 사용.
 *   v5 의 정비/과태료/보험 모듈은 v7 카탈로그 정리 시 흡수.
 */
