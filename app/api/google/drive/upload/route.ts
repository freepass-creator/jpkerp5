/**
 * Google Drive 업로드 API — ERP 서류 (계약서·등록증·보험증권 등) 를 Workspace Drive 에 미러 백업.
 *
 * POST /api/google/drive/upload
 *   body: multipart/form-data
 *     file: 업로드 파일
 *     path: 분류 경로 (예: '계약/JPK본사/12가1234/CR-2026-001')
 *     fileName: 저장명 (예: '계약서.pdf')
 *
 *   response: { ok, fileId, webViewLink, folderPath }
 *
 * 폴더 구조:
 *   {GOOGLE_DRIVE_ROOT_FOLDER_ID}/
 *     계약/{회사}/{차량번호}/{계약번호}/계약서.pdf
 *     자산/{회사}/{차량번호}/등록증.pdf
 *     보험/{회사}/{차량번호}/보험증권_2026.pdf
 *
 * 정책: 미러 백업이라 ERP 흐름 무관 — Firebase Storage 가 primary.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getDriveClient, workspaceConfigured } from '@/lib/google/client';
import { requireAuth } from '@/lib/api-auth';
import { Readable } from 'stream';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

/** path 의 각 segment 폴더를 Drive 에 생성/조회. 경로 마지막 folder ID 반환. */
async function ensureFolderPath(drive: ReturnType<typeof getDriveClient>, segments: string[]): Promise<string> {
  if (!ROOT_FOLDER_ID) throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID 미설정');
  let parentId = ROOT_FOLDER_ID;
  for (const name of segments) {
    if (!name.trim()) continue;
    // 같은 parent 안에 같은 이름 폴더 존재?
    const escName = name.replace(/'/g, "\\'");
    const q = `name='${escName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
    const list = await drive.files.list({ q, fields: 'files(id,name)', pageSize: 1 });
    const existing = list.data.files?.[0];
    if (existing?.id) {
      parentId = existing.id;
      continue;
    }
    // 신규 생성
    const created = await drive.files.create({
      requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
      fields: 'id',
    });
    if (!created.data.id) throw new Error(`폴더 생성 실패: ${name}`);
    parentId = created.data.id;
  }
  return parentId;
}

export async function POST(req: NextRequest) {
  const cfg = workspaceConfigured();
  if (!cfg.ok) {
    return NextResponse.json({ ok: false, error: `Workspace 미설정: ${cfg.missing.join(', ')}` }, { status: 500 });
  }
  if (!ROOT_FOLDER_ID) {
    return NextResponse.json({ ok: false, error: 'GOOGLE_DRIVE_ROOT_FOLDER_ID 미설정' }, { status: 500 });
  }

  const actor = await requireAuth();
  if (actor instanceof NextResponse) return actor;

  try {
    const form = await req.formData();
    const file = form.get('file');
    const pathRaw = String(form.get('path') ?? '').trim();
    const fileName = String(form.get('fileName') ?? '').trim();

    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'file 필수' }, { status: 400 });
    if (!pathRaw)  return NextResponse.json({ ok: false, error: 'path 필수' },  { status: 400 });
    if (!fileName) return NextResponse.json({ ok: false, error: 'fileName 필수' }, { status: 400 });

    const segments = pathRaw.split('/').map((s) => s.trim()).filter(Boolean);
    const drive = getDriveClient();
    const folderId = await ensureFolderPath(drive, segments);

    // 파일 업로드
    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const stream = Readable.from(buffer);

    const created = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType: file.type || 'application/octet-stream',
        body: stream,
      },
      fields: 'id,webViewLink,webContentLink',
      supportsAllDrives: true,
    });

    return NextResponse.json({
      ok: true,
      fileId: created.data.id,
      webViewLink: created.data.webViewLink,
      folderPath: pathRaw,
      uploadedAt: new Date().toISOString(),
      uploadedBy: actor.email,
    });
  } catch (e) {
    console.error('[drive/upload]', e);
    return NextResponse.json({ ok: false, error: (e as Error).message ?? String(e) }, { status: 500 });
  }
}
