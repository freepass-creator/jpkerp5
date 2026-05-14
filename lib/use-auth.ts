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
import { getFirebaseAuth } from './firebase/client';

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
}
