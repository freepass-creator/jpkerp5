import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';
import { getAuth, onAuthStateChanged, type Auth } from 'firebase/auth';

/**
 * jpkerp5 Firebase 클라이언트 — RTDB + Auth.
 * jpkerp 프로젝트 재사용, 노드 prefix = '/icar001/...' (icar001과 데이터 공유)
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ?? '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
};

/** 데이터 노드 prefix — jpkerp ERP 와 분리 */
export const ICAR_ROOT = 'icar001';

let _app: FirebaseApp | null = null;
let _rtdb: Database | null = null;
let _auth: Auth | null = null;

export function isFirebaseConfigured(): boolean {
  return !!firebaseConfig.apiKey;
}

export function getFirebaseApp(): FirebaseApp | null {
  if (_app) return _app;
  const existing = getApps()[0];
  if (existing) {
    _app = existing;
    return _app;
  }
  if (!isFirebaseConfigured()) {
    if (typeof window !== 'undefined') {
      console.warn('[jpkerp5] Firebase 미설정 — .env에 NEXT_PUBLIC_FIREBASE_* 등록 필요');
    }
    return null;
  }
  _app = initializeApp(firebaseConfig);
  return _app;
}

export function getRtdb(): Database | null {
  if (_rtdb) return _rtdb;
  const app = getFirebaseApp();
  if (!app) return null;
  _rtdb = getDatabase(app);
  return _rtdb;
}

export function getFirebaseAuth(): Auth | null {
  if (_auth) return _auth;
  const app = getFirebaseApp();
  if (!app) return null;
  _auth = getAuth(app);
  return _auth;
}

/**
 * RTDB 호출 전 로그인 상태 보장 — 미로그인이면 reject.
 * AuthGate 가 화면을 가리고 있으므로 사용자는 정상적으로 도달하면 항상 로그인 상태.
 */
export function ensureAuth(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    if (auth.currentUser) {
      resolve();
      return;
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      if (user) resolve();
      else reject(new Error('미로그인 — 로그인 후 다시 시도'));
    });
  });
}

export function icarPath(...parts: string[]): string {
  return [ICAR_ROOT, ...parts].filter(Boolean).join('/');
}
