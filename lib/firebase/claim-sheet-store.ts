'use client';

/**
 * 채권 시트 — 엑셀(채권불러오기.xlsx 등)을 업로드한 그대로 보관 + 표시.
 * 계산/매칭 없음 — 원본 그리드를 그대로 저장하고 그대로 그림 (다른 탭처럼 매번 새 업로드로 교체).
 */

import { useEffect, useState } from 'react';
import { ref, set, onValue } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth, pruneUndefined } from './client';

export type Cell = string | number | null;

export type ClaimSheet = {
  /** 1행 — 컬럼 헤더 그대로 (NO, 소속, 코드명, ... 청구금액, 결제금액, 결제일자, 결제수단, 미납금액 반복) */
  headers: Cell[];
  /** 0행 — 월별 합계/라벨 행 (있으면 그대로, 없으면 빈 배열) */
  topRow: Cell[];
  /** 2행부터 끝까지 — 데이터 행 그대로 */
  rows: Cell[][];
  fileName: string;
  sheetName: string;
  uploadedAt: string;
};

const PATH = dbPath('claim_sheet');

export function useClaimSheet(): {
  sheet: ClaimSheet | null;
  loading: boolean;
  save: (sheet: ClaimSheet) => Promise<void>;
  clear: () => Promise<void>;
} {
  const [sheet, setSheet] = useState<ClaimSheet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured()) { setLoading(false); return; }
    const db = getRtdb();
    if (!db) { setLoading(false); return; }
    const unsub = onValue(ref(db, PATH), (snap) => {
      setSheet(snap.val());
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return {
    sheet,
    loading,
    save: async (next) => {
      await ensureAuth();
      const db = getRtdb();
      if (!db) return;
      await set(ref(db, PATH), pruneUndefined(next));
    },
    clear: async () => {
      await ensureAuth();
      const db = getRtdb();
      if (!db) return;
      await set(ref(db, PATH), null);
    },
  };
}
