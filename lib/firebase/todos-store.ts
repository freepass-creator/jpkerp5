'use client';

/**
 * 공유 할 일 보드 — `todos/{id}` RTDB.
 * 자동 업무는 달력에서 처리하므로 보드는 사용자가 직접 입력하는 액션 항목 전용.
 * 담당자 복수 지정 가능, 각자 인지·완료 상태 보유, 후속 진행 메모 누적.
 */

import { useState } from 'react';
import { ref, set, update as rtdbUpdate, remove as rtdbRemove, push } from 'firebase/database';
import { getRtdb, dbPath, isFirebaseConfigured, ensureAuth, pruneUndefined } from './client';
import { audit } from './audit-store';
import type { ManualTodo, ManualTodoAssignee, ManualTodoFollowup } from '@/lib/types';
import { useCachedSnapshot, setCacheRows } from './cached-subscribe';

const PATH = dbPath('todos');

/** assignees 가 1명 이상 있고 그 모두가 done 시각을 가지면 전체 완료로 본다 */
export function isTodoAllDone(t: ManualTodo): boolean {
  if (t.doneAt) return true;
  if (!t.assignees || t.assignees.length === 0) return false;
  return t.assignees.every((a) => !!a.done);
}

function rid(): string {
  return `fu-${Math.floor(Math.random() * 1_000_000_000).toString(36)}-${Math.floor(Math.random() * 1_000_000).toString(36)}`;
}

// 모듈 상수 — stable transform
function todosTransform(val: unknown): ManualTodo[] {
  if (!val) return [];
  return Object.values<ManualTodo>(val as Record<string, ManualTodo>).map((t) => ({
    ...t,
    assignees: Array.isArray(t.assignees) ? t.assignees : [],
  }));
}

export function useTodos() {
  const { rows: todos, loading } = useCachedSnapshot<ManualTodo>(PATH, todosTransform);
  const [configured] = useState(() => isFirebaseConfigured());

  async function persistUpdate(id: string, partial: Partial<ManualTodo>, auditLabel: string) {
    if (!configured) {
      setCacheRows<ManualTodo>(PATH, (prev) => prev.map((x) => (x.id === id ? { ...x, ...partial } : x)));
      return;
    }
    await ensureAuth();
    const db = getRtdb(); if (!db) return;
    await rtdbUpdate(ref(db, `${PATH}/${id}`), pruneUndefined(partial as unknown as Record<string, unknown>));
    void audit.update('system', id, auditLabel);
  }

  return {
    todos,
    loading,
    configured,

    add: async (t: Omit<ManualTodo, 'id'>): Promise<string> => {
      const payload: Omit<ManualTodo, 'id'> = {
        ...t,
        assignees: t.assignees ?? [],
      };
      if (!configured) {
        const id = `local-${Date.now()}`;
        setCacheRows<ManualTodo>(PATH, (prev) =>[...prev, { ...payload, id }]);
        return id;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return '';
      const newRef = push(ref(db, PATH));
      const id = newRef.key;
      if (!id) throw new Error('Firebase push failed');
      await set(newRef, pruneUndefined({ ...payload, id } as Record<string, unknown>));
      void audit.create('system', id, `할 일 추가 ${t.title}`);
      return id;
    },

    update: async (t: ManualTodo): Promise<void> => {
      if (!configured) {
        setCacheRows<ManualTodo>(PATH, (prev) =>prev.map((x) => (x.id === t.id ? t : x)));
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbUpdate(ref(db, `${PATH}/${t.id}`), pruneUndefined(t as unknown as Record<string, unknown>));
      void audit.update('system', t.id, `할 일 수정 ${t.title}`);
    },

    remove: async (id: string): Promise<void> => {
      if (!configured) {
        setCacheRows<ManualTodo>(PATH, (prev) =>prev.filter((x) => x.id !== id));
        return;
      }
      await ensureAuth();
      const db = getRtdb(); if (!db) return;
      await rtdbRemove(ref(db, `${PATH}/${id}`));
      void audit.delete('system', id, `할 일 삭제 ${id}`);
    },

    /** 담당자 한 명의 상태 토글 (인지/완료) — kind: 'ack' | 'done' */
    setAssigneeState: async (id: string, name: string, kind: 'ack' | 'done', on: boolean): Promise<void> => {
      const cur = todos.find((x) => x.id === id);
      if (!cur) return;
      const ts = new Date().toISOString();
      const nextAssignees: ManualTodoAssignee[] = (cur.assignees ?? []).map((a) => {
        if (a.name !== name) return a;
        if (kind === 'ack') return { ...a, ack: on ? ts : undefined };
        // done 토글 시 ack 도 자동 채움
        return { ...a, done: on ? ts : undefined, ack: on ? (a.ack ?? ts) : a.ack };
      });
      // 전체 done 자동 채움/해제
      const allDone = nextAssignees.length > 0 && nextAssignees.every((a) => !!a.done);
      const doneAt = allDone ? ts : undefined;
      await persistUpdate(
        id,
        { assignees: nextAssignees, doneAt },
        `할 일 ${name} ${kind === 'ack' ? '인지' : '완료'} ${on ? '체크' : '해제'}`,
      );
    },

    /** 전체 일괄 완료/재오픈 */
    setAllDone: async (id: string, on: boolean): Promise<void> => {
      const cur = todos.find((x) => x.id === id);
      if (!cur) return;
      const ts = new Date().toISOString();
      const nextAssignees: ManualTodoAssignee[] = (cur.assignees ?? []).map((a) => ({
        ...a,
        done: on ? (a.done ?? ts) : undefined,
        ack: on ? (a.ack ?? ts) : a.ack,
      }));
      await persistUpdate(
        id,
        { assignees: nextAssignees, doneAt: on ? ts : undefined },
        `할 일 ${on ? '일괄완료' : '재오픈'}`,
      );
    },

    /** 후속 메모 추가 */
    addFollowup: async (id: string, by: string, note: string): Promise<void> => {
      const cur = todos.find((x) => x.id === id);
      if (!cur) return;
      const entry: ManualTodoFollowup = {
        id: rid(),
        at: new Date().toISOString(),
        by: by.trim() || '익명',
        note: note.trim(),
      };
      const next = [...(cur.followups ?? []), entry];
      await persistUpdate(id, { followups: next }, `할 일 후속메모 +1 (${entry.by})`);
    },

    /** 후속 메모 삭제 */
    removeFollowup: async (id: string, followupId: string): Promise<void> => {
      const cur = todos.find((x) => x.id === id);
      if (!cur) return;
      const next = (cur.followups ?? []).filter((f) => f.id !== followupId);
      await persistUpdate(id, { followups: next }, `할 일 후속메모 삭제`);
    },
  };
}
