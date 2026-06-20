#!/usr/bin/env node
/**
 * RTDB 전체 backup → JSON 파일.
 * ERP #20: 일일 export 자동화 토대 (Cloud Scheduler / GitHub Actions 호출 가능).
 *
 * 환경변수:
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_SERVICE_ACCOUNT_KEY (JSON 경로 또는 inline JSON)
 *   FIREBASE_DATABASE_URL (예: https://jpkerp5-default-rtdb.firebaseio.com)
 *   BACKUP_DIR (기본 ./.backups)
 *
 * 사용:
 *   node scripts/backup-rtdb.mjs            # 전체 root snapshot
 *   node scripts/backup-rtdb.mjs --path=contracts  # 특정 path 만
 *
 * 자동화:
 *   GitHub Actions cron 또는 별도 서버에서 일일 실행.
 *   파일명: backup-YYYY-MM-DD-HHMMSS.json (이전 백업 보존, 사용자가 retention 관리)
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [k, v] = arg.replace(/^--/, '').split('=');
  acc[k] = v ?? true;
  return acc;
}, {});

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const KEY = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
const DB_URL = process.env.FIREBASE_DATABASE_URL;
const BACKUP_DIR = process.env.BACKUP_DIR ?? '.backups';
const NODE_PATH = args.path ?? '';

if (!PROJECT_ID || !KEY || !DB_URL) {
  console.error('ERR: FIREBASE_PROJECT_ID / FIREBASE_SERVICE_ACCOUNT_KEY / FIREBASE_DATABASE_URL 환경변수 필요');
  process.exit(1);
}

async function loadKey() {
  if (KEY.startsWith('{')) return JSON.parse(KEY);
  const raw = await readFile(KEY, 'utf-8');
  return JSON.parse(raw);
}

async function getAccessToken(key) {
  const { JWT } = await import('google-auth-library');
  const jwt = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/firebase.database',
             'https://www.googleapis.com/auth/userinfo.email'],
  });
  const { access_token } = await jwt.authorize();
  return access_token;
}

function fetchJson(url, token) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { Authorization: `Bearer ${token}` },
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

(async () => {
  console.log(`[backup-rtdb] project=${PROJECT_ID} path=${NODE_PATH || '/'}`);
  const key = await loadKey();
  const token = await getAccessToken(key);
  const dbUrlBase = DB_URL.replace(/\/$/, '');
  const targetPath = NODE_PATH ? `/${NODE_PATH}.json` : '/.json';
  const data = await fetchJson(`${dbUrlBase}${targetPath}`, token);

  if (!existsSync(BACKUP_DIR)) await mkdir(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').replace(/T/, '_').slice(0, 19);
  const fileName = `backup-${ts}${NODE_PATH ? `-${NODE_PATH.replace(/\//g, '_')}` : ''}.json`;
  const fullPath = path.join(BACKUP_DIR, fileName);
  await writeFile(fullPath, JSON.stringify(data, null, 2), 'utf-8');

  const sizeKb = Math.round(JSON.stringify(data).length / 1024);
  const entityCount = Object.keys(data ?? {}).length;
  console.log(`[backup-rtdb] OK → ${fullPath} (${sizeKb} KB, ${entityCount} root entities)`);
})().catch((e) => {
  console.error('[backup-rtdb] FAIL:', e);
  process.exit(1);
});
