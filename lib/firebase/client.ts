import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth } from 'firebase/auth';

/**
 * icar001 Firebase 클라이언트 — RTDB.
 * jpkerp 프로젝트 재사용, 노드 prefix = '/icar001/...'
 * .env.local 의 NEXT_PUBLIC_FIREBASE_* 필요.
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

/** icar001 데이터 노드 prefix — jpkerp와 분리 */
export const ICAR_ROOT = 'icar001';

let _app: FirebaseApp | null = null;
let _rtdb: Database | null = null;

/** Firebase 환경변수 셋업 여부 */
export function isFirebaseConfigured(): boolean {
  return !!firebaseConfig.apiKey;
}

/** 설정 안 됐으면 null 반환 (throw 하지 않음) */
export function getFirebaseApp(): FirebaseApp | null {
  if (_app) return _app;
  const existing = getApps()[0];
  if (existing) {
    _app = existing;
    return _app;
  }
  if (!isFirebaseConfigured()) {
    if (typeof window !== 'undefined') {
      console.warn('[icar] Firebase 미설정 — Vercel/로컬 .env에 NEXT_PUBLIC_FIREBASE_* 등록 필요. 임시로 mock 데이터로 동작.');
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

let _auth: Auth | null = null;
let _authReady: Promise<void> | null = null;

/** 익명 로그인 보장 — jpkerp RTDB rules가 auth != null 요구하므로 필요 */
export function ensureAuth(): Promise<void> {
  if (_authReady) return _authReady;
  const app = getFirebaseApp();
  if (!app) return Promise.resolve();
  _auth = getAuth(app);
  _authReady = new Promise<void>((resolve, reject) => {
    onAuthStateChanged(_auth!, async (user) => {
      if (user) {
        resolve();
      } else {
        try {
          await signInAnonymously(_auth!);
          resolve();
        } catch (err) {
          console.error('[icar] 익명 로그인 실패 — Firebase Console에서 Authentication → Sign-in method → Anonymous 활성화 필요:', err);
          reject(err);
        }
      }
    });
  });
  return _authReady;
}

/** /icar001/{path} 경로 헬퍼 */
export function icarPath(...parts: string[]): string {
  return [ICAR_ROOT, ...parts].filter(Boolean).join('/');
}
