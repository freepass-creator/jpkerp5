'use client';

import { useState } from 'react';
import { ref, set, update as rtdbUpdate, remove as rtdbRemove, push } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth, pruneUndefined } from './client';
import { useDataContext } from '@/lib/data-context';
import type { Company } from '@/lib/types';
import { lockedUpdate } from './locked-update';
import { audit } from './audit-store';

import { genCode } from '@/lib/code';

const COMPANIES_PATH = dbPath('companies');

/** 새 회사 코드 — 6자 영문·숫자 난수 (prefix 없음). 기존과 충돌 시 재시도. */
export function nextCompanyCode(existing: Company[]): string {
  const used = new Set(existing.map((c) => c.code).filter(Boolean));
  return genCode(6, used);
}

export function useCompanies(): {
  companies: Company[];
  loading: boolean;
  configured: boolean;
  add: (c: Omit<Company, 'id'>) => Promise<string>;
  update: (c: Company) => Promise<void>;
  remove: (id: string) => Promise<void>;
} {
  const { companies, companiesLoading } = useDataContext();
  const [configured] = useState(() => isFirebaseConfigured());

  return {
    companies,
    loading: companiesLoading,
    configured,
    add: async (c) => {
      // 코드 미지정 시 자동 부여 (CP01 ~)
      const code = c.code && c.code.trim() ? c.code : nextCompanyCode(companies);
      const payload = { ...c, code };
      if (!configured) return `local-${Date.now()}`;
      await ensureAuth();
      const db = getRtdb(); if (!db) return '';
      const newRef = push(ref(db, COMPANIES_PATH));
      const id = newRef.key;
      if (!id) throw new Error('Firebase push failed: no key');
      await set(newRef, pruneUndefined({ ...payload, id }));
      void audit.create('company', id, `법인 등록 ${payload.name ?? ''} ${payload.bizRegNo ?? payload.corpRegNo ?? ''}`.trim());
      return id;
    },
    update: async (c) => {
      if (!configured) return;
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      // Optimistic Lock (ERP #22)
      await lockedUpdate<Company>(`${COMPANIES_PATH}/${c.id}`, c.updatedAt, () => ({
        ...c, updatedAt: new Date().toISOString(),
      }));
      void audit.update('company', c.id, `법인 수정 ${c.name ?? ''}`.trim());
    },
    remove: async (id) => {
      if (!configured) return;
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      const target = companies.find((x) => x.id === id);
      await rtdbRemove(ref(db, `${COMPANIES_PATH}/${id}`));
      void audit.delete('company', id, `법인 삭제 ${target?.name ?? id}`);
    },
  };
}
