import { readFileSync } from 'fs';
import { google } from 'googleapis';

const envText = readFileSync('.env.local', 'utf-8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2];
}
const raw = env.GOOGLE_SERVICE_ACCOUNT_KEY;
const decoded = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8');
const key = JSON.parse(decoded);

const auth = new google.auth.JWT({
  email: key.client_email, key: key.private_key,
  scopes: ['https://www.googleapis.com/auth/drive'],
  subject: env.GOOGLE_IMPERSONATE_USER,
});
const drive = google.drive({ version: 'v3', auth });
const sharedDriveId = '0ALp5cUm1kqTvUk9PVA';      // 공유드라이브 루트
const jpkRootId     = env.GOOGLE_DRIVE_ROOT_FOLDER_ID;  // JPK문서 (이미 만든 것)

console.log('=== 1. 기존 빈 폴더 정리 (계약/자산/보험/일반) ===');
const listOld = await drive.files.list({
  q: `'${jpkRootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  fields: 'files(id,name)',
  supportsAllDrives: true, includeItemsFromAllDrives: true,
  corpora: 'drive', driveId: sharedDriveId,
});
const toDelete = ['계약', '자산', '보험', '일반'];
for (const f of listOld.data.files ?? []) {
  if (toDelete.includes(f.name)) {
    await drive.files.delete({ fileId: f.id, supportsAllDrives: true });
    console.log(`  - 삭제 ${f.name}`);
  }
}

console.log('\n=== 2. 새 구조 생성 ===');
async function ensureFolder(name, parent) {
  const q = `'${parent}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const list = await drive.files.list({
    q, fields: 'files(id,name)',
    supportsAllDrives: true, includeItemsFromAllDrives: true,
    corpora: 'drive', driveId: sharedDriveId,
  });
  if (list.data.files?.length) return list.data.files[0].id;
  const r = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] },
    fields: 'id', supportsAllDrives: true,
  });
  return r.data.id;
}

const asset    = await ensureFolder('자산관리', jpkRootId);
const contract = await ensureFolder('계약관리', jpkRootId);
const general  = await ensureFolder('일반관리', jpkRootId);

const corp     = await ensureFolder('법인',      general);
const penalty  = await ensureFolder('과태료',    general);
const cert     = await ensureFolder('내용증명',  general);

console.log(`  + 자산관리/      (${asset})`);
console.log(`  + 계약관리/      (${contract})`);
console.log(`  + 일반관리/      (${general})`);
console.log(`    + 법인/        (${corp})`);
console.log(`    + 과태료/      (${penalty})`);
console.log(`    + 내용증명/    (${cert})`);

console.log('\n=== 3. .env.local 추가용 ID (이 값들 출력) ===');
console.log(`GOOGLE_DRIVE_FOLDER_ASSET=${asset}`);
console.log(`GOOGLE_DRIVE_FOLDER_CONTRACT=${contract}`);
console.log(`GOOGLE_DRIVE_FOLDER_GENERAL=${general}`);
console.log(`GOOGLE_DRIVE_FOLDER_CORP=${corp}`);
console.log(`GOOGLE_DRIVE_FOLDER_PENALTY=${penalty}`);
console.log(`GOOGLE_DRIVE_FOLDER_CERT=${cert}`);
