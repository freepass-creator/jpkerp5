/**
 * 스위치플랜 마이그레이션 소스파일 자동 로더 (로컬 dev 전용).
 *
 * 브라우저는 디스크의 임의 파일을 못 읽으므로, 로컬 dev 서버(Node)가 고정 경로의
 * 사업현황.xlsx + 자금일보.xlsx 를 읽어 base64 로 넘긴다 → 마이그레이션 페이지가
 * 자동 파싱 → [전체 일괄 반영] 버튼 한 번으로 끝나게.
 *
 * 배포(production)에선 항상 403 — 서버 디스크 파일 노출 금지.
 * 경로는 env 로 오버라이드 가능(MIGRATE_BIZ_PATH / MIGRATE_JBO_PATH).
 */
import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import os from 'os';
import path from 'path';

export const runtime = 'nodejs';

const HOME = os.homedir();
const DEFAULT_BIZ = path.join(HOME, 'Downloads', '[스위치플랜] 사업현황.xlsx');
const DEFAULT_JBO = path.join(HOME, 'Documents', '카카오톡 받은 파일', '26년_스위치플랜_자금일보 (1).xlsx');

async function loadOne(p: string): Promise<{ name: string; b64: string; mtime: string } | null> {
  try {
    const buf = await readFile(p);
    const { mtime } = await import('fs/promises').then((m) => m.stat(p));
    return { name: path.basename(p), b64: buf.toString('base64'), mtime: mtime.toISOString() };
  } catch {
    return null;
  }
}

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: '로컬 dev 전용' }, { status: 403 });
  }
  const bizPath = process.env.MIGRATE_BIZ_PATH || DEFAULT_BIZ;
  const jboPath = process.env.MIGRATE_JBO_PATH || DEFAULT_JBO;
  const [bizStatus, jbo] = await Promise.all([loadOne(bizPath), loadOne(jboPath)]);
  return NextResponse.json({ ok: true, bizStatus, jbo, bizPath, jboPath });
}
