import 'server-only';
import { initializeApp, getApps, cert, applicationDefault, type ServiceAccount, type App } from 'firebase-admin/app';
import { getDatabase, type Database } from 'firebase-admin/database';

/**
 * Firebase Admin SDK — 서버 전용. 클라이언트 코드에서 import 금지 (server-only).
 *
 * 인증 우선순위:
 *  1. FIREBASE_ADMIN_KEY (JSON 문자열) — 서비스계정 키 통째로 env 에 박음 (Vercel 등 배포)
 *  2. GOOGLE_APPLICATION_CREDENTIALS 환경 변수 (로컬 gcloud)
 *  3. applicationDefault() — Vercel/GCP 자동 감지
 *
 * 손님 페이지가 RTDB 비인증 read 없이도 매칭 가능하게 하기 위함.
 * (RTDB Rules 는 contracts/* 비인증 read 차단 — firebase-rules.md 참고)
 */

let _app: App | null = null;
let _db: Database | null = null;

function getApp(): App {
  if (_app) return _app;
  const existing = getApps()[0];
  if (existing) {
    _app = existing;
    return _app;
  }

  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  if (!databaseURL) {
    throw new Error('Firebase Admin: NEXT_PUBLIC_FIREBASE_DATABASE_URL 누락');
  }
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  const rawKey = process.env.FIREBASE_ADMIN_KEY;
  if (rawKey) {
    let parsed: ServiceAccount;
    try {
      parsed = JSON.parse(rawKey) as ServiceAccount;
    } catch (e) {
      throw new Error(`Firebase Admin: FIREBASE_ADMIN_KEY JSON 파싱 실패 — ${(e as Error).message}`);
    }
    _app = initializeApp({ credential: cert(parsed), databaseURL, projectId });
    return _app;
  }

  // fallback — gcloud / Vercel 자동. projectId 명시 (verifyIdToken 등 일부 API 가 요구)
  _app = initializeApp({ credential: applicationDefault(), databaseURL, projectId });
  return _app;
}

export function getAdminRtdb(): Database {
  if (!_db) _db = getDatabase(getApp());
  return _db;
}
