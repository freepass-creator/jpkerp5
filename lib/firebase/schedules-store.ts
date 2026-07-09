'use client';

/**
 * 달력 수동 스케줄 — `schedules/{id}` RTDB.
 * 자동 집계(만기·반납·신규)와 별개로 사용자가 일자에 등록하는 메모/일정.
 */

import { useState } from 'react';
import { ref, set, update as rtdbUpdate, remove as rtdbRemove, push } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth, pruneUndefined } from './client';
import { audit } from './audit-store';
import type { ManualSchedule } from '@/lib/types';
import { useCachedSnapshot, setCacheRows } from './cached-subscribe';

const PATH = dbPath('schedules');

export function useSchedules() {
  const { rows: schedules, loading } = useCachedSnapshot<ManualSchedule>(PATH);
  const [configured] = useState(() => isFirebaseConfigured());

  return {
    schedules,
    loading,
    configured,

    add: async (s: Omit<ManualSchedule, 'id'>): Promise<string> => {
      if (!configured) {
        const id = `local-${Date.now()}`;
        setCacheRows<ManualSchedule>(PATH, (prev) => [...prev, { ...s, id }]);
        return id;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return '';
      const newRef = push(ref(db, PATH));
      const id = newRef.key;
      if (!id) throw new Error('Firebase push failed');
      await set(newRef, pruneUndefined({ ...s, id } as Record<string, unknown>));
      void audit.create('system', id, `스케줄 추가 ${s.date} ${s.title}`);
      return id;
    },

    remove: async (id: string): Promise<void> => {
      if (!configured) {
        setCacheRows<ManualSchedule>(PATH, (prev) => prev.filter((x) => x.id !== id));
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbRemove(ref(db, `${PATH}/${id}`));
      void audit.delete('system', id, `스케줄 삭제 ${id}`);
    },

    toggleDone: async (id: string, done: boolean): Promise<void> => {
      // 재오픈 시 doneAt 은 null 로 — undefined 는 pruneUndefined 가 걷어내 RTDB 필드가
      // 안 지워지고 stale 완료시각이 남음 (RTDB 는 null 이라야 필드 삭제).
      const patch = { done, doneAt: done ? new Date().toISOString() : null };
      if (!configured) {
        setCacheRows<ManualSchedule>(PATH, (prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbUpdate(ref(db, `${PATH}/${id}`), pruneUndefined(patch as Record<string, unknown>));
      void audit.update('system', id, `스케줄 ${done ? '완료' : '재오픈'} ${id}`);
    },
  };
}

/** 미해소 = done 아니고 + 날짜 지남 (오늘 포함 안 함) */
export function isScheduleStale(s: import('@/lib/types').ManualSchedule, today: string): boolean {
  if (s.done) return false;
  return s.date < today;
}
