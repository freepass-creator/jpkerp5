/**
 * Firebase Storage — 손님 노출용 서류(등록증/보험증명/계약서) 업로드 헬퍼.
 *
 *   const { url, fileName, uploadedAt } = await uploadDocument({
 *     kind: 'registration',
 *     ownerKey: vehiclePlate,
 *     file,
 *   });
 *
 * 경로 규약 — gs://{bucket}/jpkerp5/{kind}/{ownerKey}/{timestamp}-{filename}
 *   · kind:    registration | insurance | contract
 *   · ownerKey: 차량번호 또는 계약번호 (한글 등 특수문자 그대로 OK — Storage가 인코딩)
 *
 * Storage Rules는 RTDB와 동일하게 'auth != null' 만 체크. 손님 페이지는 익명 인증 통과.
 */

import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getFirebaseApp } from './client';

export type DocKind = 'registration' | 'insurance' | 'contract';

const DOC_PREFIX = 'jpkerp5';

export type UploadedDoc = {
  url: string;
  fileName: string;
  uploadedAt: string;
  /** Storage 내부 경로 — 추후 삭제용 */
  path: string;
};

function safeFileName(name: string): string {
  // 파일명 그대로 유지, 다만 '/' 만 안전하게 치환
  return name.replace(/\//g, '_');
}

export async function uploadDocument(opts: {
  kind: DocKind;
  ownerKey: string;
  file: File;
}): Promise<UploadedDoc> {
  const app = getFirebaseApp();
  if (!app) throw new Error('Firebase 미설정');
  const storage = getStorage(app);
  const ts = Date.now();
  const fileName = safeFileName(opts.file.name);
  const path = `${DOC_PREFIX}/${opts.kind}/${opts.ownerKey}/${ts}-${fileName}`;
  const r = storageRef(storage, path);
  await uploadBytes(r, opts.file, {
    contentType: opts.file.type || 'application/octet-stream',
  });
  const url = await getDownloadURL(r);
  return {
    url,
    fileName: opts.file.name,
    uploadedAt: new Date(ts).toISOString(),
    path,
  };
}

/** 기존 파일 삭제 — 교체/제거 시 호출 (실패해도 무시) */
export async function deleteDocumentByUrl(url: string | undefined): Promise<void> {
  if (!url) return;
  try {
    const app = getFirebaseApp();
    if (!app) return;
    const storage = getStorage(app);
    // getDownloadURL이 반환한 URL은 ref()에 그대로 넘길 수 없으니, 그 URL을 만든 ref를 다시 만들기 위해 path를 별도로 보관해야 함.
    // path 없이 url만 들어왔다면 best-effort — Storage SDK는 https URL→ref 직접 변환을 지원함.
    const r = storageRef(storage, url);
    await deleteObject(r);
  } catch {
    /* 이미 없거나 권한 문제 — 무시 */
  }
}
