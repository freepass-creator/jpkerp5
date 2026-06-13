'use client';

import { useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile as fbUpdateProfile,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { ref, get, update as rtdbUpdate, onValue } from 'firebase/database';
import { getFirebaseAuth, getRtdb, dbPath, ensureAuth, pruneUndefined } from './firebase/client';

/**
 * jpkerp5 인증 — 이메일/비밀번호 (jpkerp-v4 패턴).
 *
 *  const { user, loading } = useAuth();
 *  await login(email, password);
 *  await signup({ email, password, displayName });
 *  await logout();
 */

let cache: User | null = null;
let initialized = false;
const listeners = new Set<(u: User | null) => void>();

if (typeof window !== 'undefined') {
  const auth = getFirebaseAuth();
  if (auth) {
    onAuthStateChanged(auth, (u) => {
      cache = u;
      initialized = true;
      listeners.forEach((l) => l(u));
      // 로그인 사용자 RTDB users/{uid} backfill — 기존 가입자도 명단에 보강
      if (u) {
        void upsertUserProfile({
          uid: u.uid,
          email: u.email ?? '',
          displayName: u.displayName ?? undefined,
        });
      }
    });
  } else {
    initialized = true;
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(cache);
  const [loading, setLoading] = useState<boolean>(!initialized);

  useEffect(() => {
    const fn = (u: User | null) => {
      setUser(u);
      setLoading(false);
    };
    listeners.add(fn);
    if (initialized) setLoading(false);
    return () => { listeners.delete(fn); };
  }, []);

  return { user, loading };
}

export async function login(email: string, password: string): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase Auth 미설정');
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function logout(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) return;
  try { await fbSignOut(auth); }
  catch (e) { console.error('[auth] logout failed', e); }
}

export async function resetPassword(email: string): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase Auth 미설정');
  await sendPasswordResetEmail(auth, email.trim());
}

export type SignupInput = {
  email: string;
  password: string;
  displayName: string;
  department?: string;
  phone?: string;
};

export async function signup(input: SignupInput): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase Auth 미설정');
  const cred = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
  await fbUpdateProfile(cred.user, { displayName: input.displayName.trim() });
  // RTDB users/{uid} 에 마스터 정보 저장 — admin SDK 없어도 staff 명단 조회 가능
  await upsertUserProfile({
    uid: cred.user.uid,
    email: input.email.trim(),
    displayName: input.displayName.trim(),
    department: input.department,
    phone: input.phone,
  });
}

export type UserProfile = {
  uid: string;
  email: string;
  displayName?: string;
  department?: string;
  phone?: string;
  createdAt?: string;
  lastSeenAt?: string;
};

/** users/ 라이브 구독 — 디스패치 받을 사람 selector 등에서 사용 */
export function useUsers(): UserProfile[] {
  const [list, setList] = useState<UserProfile[]>([]);
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try { await ensureAuth(); } catch { /* silent */ }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) return;
      unsub = onValue(ref(db, dbPath('users')), (snap) => {
        const val = (snap.val() ?? {}) as Record<string, UserProfile>;
        const users = Object.values(val).sort((a, b) =>
          (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email),
        );
        setList(users);
      });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, []);
  return list;
}

/** RTDB users/{uid} upsert — 가입/첫 로그인 시 호출. 기존 role 등 필드는 보존. */
export async function upsertUserProfile(input: {
  uid: string;
  email: string;
  displayName?: string;
  department?: string;
  phone?: string;
}): Promise<void> {
  try {
    await ensureAuth();
    const db = getRtdb();
    if (!db) return;
    const userRef = ref(db, dbPath('users', input.uid));
    const snap = await get(userRef);
    const existing = (snap.val() ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();
    const next = pruneUndefined({
      ...existing,
      uid: input.uid,
      email: input.email,
      displayName: input.displayName ?? (existing.displayName as string | undefined),
      department: input.department ?? (existing.department as string | undefined),
      phone: input.phone ?? (existing.phone as string | undefined),
      createdAt: (existing.createdAt as string | undefined) ?? now,
      lastSeenAt: now,
    });
    await rtdbUpdate(userRef, next);
  } catch (e) {
    console.warn('[auth] upsertUserProfile failed', e);
  }
}
