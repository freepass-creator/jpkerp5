import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';
import { getAuth, onAuthStateChanged, type Auth } from 'firebase/auth';

/**
 * jpkerp5 Firebase 클라이언트 — RTDB + Auth.
 * 공유 Firebase 프로젝트(jpkerp)를 쓰지만 노드 prefix = '/jpkerp5/...' 로 독립.
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

/** 데이터 노드 prefix — v4는 root 직접 사용, v5는 /v5/... 로 분리. */
export const RTDB_ROOT = 'v5';

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

/** 현재 로그인 사용자의 Firebase ID 토큰 (없으면 ''). API 라우트 Authorization 헤더용 — 여러 곳 중복 취득 통합. */
export async function getCurrentIdToken(): Promise<string> {
  const user = getFirebaseAuth()?.currentUser;
  return user ? await user.getIdToken() : '';
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

export function dbPath(...parts: string[]): string {
  return [RTDB_ROOT, ...parts].filter(Boolean).join('/');
}

/**
 * RTDB 는 undefined 를 거부 — set/update 직전에 undefined 필드 제거.
 * JSON.stringify 가 undefined 를 자동 제거하므로 round-trip.
 * 중첩 객체·배열도 모두 처리됨.
 */
export function pruneUndefined<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
