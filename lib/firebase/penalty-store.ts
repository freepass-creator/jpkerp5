'use client';

import { useState } from 'react';
import { ref, set, remove as rtdbRemove, push } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth, pruneUndefined } from './client';
import { audit } from './audit-store';
import type { Penalty, PenaltyDocType } from '@/lib/types-penalty';
import type { PenaltyWorkItem } from '@/lib/penalty-pdf';
import { lockedUpdate } from './locked-update';
import { useCachedSnapshot, setCacheRows } from './cached-subscribe';

const PATH = dbPath('penalties');

// 모듈 상수 — stable transform reference (재마운트마다 새 subscribe 방지)
//
// ★ 저장 실형은 PenaltyWorkItem(snake_case + _phase, use-penalty-store.ts 가 write).
//   대시보드가 소비하는 Penalty(camelCase)로 정규화한다 — 안 하면 carNumber/status 가
//   전부 undefined 라 '과태료 미처리' KPI 가 전건 카운트되고 사이드리스트 차량번호가 '?' 로 뜸.
//    · _phase 'completed' → status '납부완료'(=처리완료, 미처리 카운트서 제외), 그 외 '접수'(미처리)
//    · soft delete(deletedAt) 제외
function penaltyTransform(val: unknown): Penalty[] {
  if (!val) return [];
  return Object.values<PenaltyWorkItem>(val as Record<string, PenaltyWorkItem>)
    .filter((p) => !p.deletedAt)
    .map((p): Penalty => ({
      id: p.id,
      docType: (p.doc_type || '기타') as PenaltyDocType,
      noticeNo: p.notice_no ?? '',
      issuer: p.issuer ?? '',
      issueDate: p.issue_date ?? '',
      violationDate: p.date ?? '',
      violationLocation: p.location || undefined,
      description: p.description || undefined,
      lawArticle: p.law_article || undefined,
      payerName: p.payer_name || undefined,
      carNumber: p.car_number ?? '',
      amount: p.amount ?? 0,
      penaltyAmount: p.penalty_amount || undefined,
      fineAmount: p.fine_amount || undefined,
      surcharge: p.surcharge_amount || undefined,
      tollAmount: p.toll_amount || undefined,
      dueDate: p.due_date || undefined,
      payAccount: p.pay_account || undefined,
      status: p._phase === 'completed' ? '납부완료' : '접수',
      fileName: p.fileName,
      fileDataUrl: p.fileDataUrl,
      createdAt: p.createdAt ?? '',
      updatedAt: p.updatedAt,
    }))
    .sort((a, b) => (b.issueDate ?? '').localeCompare(a.issueDate ?? ''));
}

export function usePenalties(): {
  penalties: Penalty[];
  loading: boolean;
  configured: boolean;
  add: (p: Omit<Penalty, 'id'>) => Promise<string>;
  update: (p: Penalty) => Promise<void>;
  remove: (id: string) => Promise<void>;
} {
  const { rows: penalties, loading } = useCachedSnapshot<Penalty>(PATH, penaltyTransform);
  const [configured] = useState(() => isFirebaseConfigured());

  return {
    penalties, loading, configured,
    add: async (p) => {
      if (!configured) {
        const id = `local-pen-${Date.now()}`;
        setCacheRows<Penalty>(PATH, (prev) => [{ ...p, id } as Penalty, ...prev]);
        return id;
      }
      await ensureAuth();
      const db = getRtdb();
      if (!db) return '';
      const newRef = push(ref(db, PATH));
      const id = newRef.key;
      if (!id) throw new Error('Firebase push failed: no key');
      await set(newRef, pruneUndefined({ ...p, id }));
      void audit.create('penalty', id, `과태료 등록 ${p.noticeNo ?? ''} ${p.carNumber} ${p.amount}원`);
      return id;
    },
    update: async (p) => {
      if (!configured) {
        setCacheRows<Penalty>(PATH, (prev) => prev.map((x) => (x.id === p.id ? p : x)));
        return;
      }
      await ensureAuth();
      const db = getRtdb();
      if (!db) return;
      // Optimistic Lock (ERP #22)
      await lockedUpdate<Penalty>(`${PATH}/${p.id}`, p.updatedAt, () => ({
        ...p, updatedAt: new Date().toISOString(),
      }));
      void audit.update('penalty', p.id, `과태료 수정 ${p.noticeNo ?? ''} ${p.carNumber}`);
    },
    remove: async (id) => {
      const target = penalties.find((p) => p.id === id);
      if (!configured) {
        setCacheRows<Penalty>(PATH, (prev) => prev.filter((x) => x.id !== id));
        return;
      }
      await ensureAuth();
      const db = getRtdb();
      if (!db) return;
      await rtdbRemove(ref(db, `${PATH}/${id}`));
      void audit.delete('penalty', id, `과태료 삭제 ${target?.noticeNo ?? id} ${target?.carNumber ?? ''}`);
    },
  };
}
