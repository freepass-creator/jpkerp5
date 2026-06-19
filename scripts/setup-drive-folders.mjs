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
  email: key.client_email,
  key: key.private_key,
  scopes: ['https://www.googleapis.com/auth/drive'],
  subject: env.GOOGLE_IMPERSONATE_USER,
});

const drive = google.drive({ version: 'v3', auth });
const rootId = env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
const folders = ['JPK문서', '계약', '자산', '보험', '일반'];
const created = {};

// 우선 JPK문서 폴더 (있으면 사용, 없으면 생성)
for (const name of folders) {
  // 이미 있는지 검색
  const parent = name === 'JPK문서' ? rootId : created['JPK문서'];
  if (!parent) { console.log(`! ${name} 부모 폴더 없음 (skip)`); continue; }
  const q = `'${parent}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const list = await drive.files.list({
    q, fields: 'files(id,name)',
    supportsAllDrives: true, includeItemsFromAllDrives: true,
    corpora: 'drive', driveId: rootId,
  });
  if (list.data.files.length > 0) {
    created[name] = list.data.files[0].id;
    console.log(`✓ ${name} 이미 존재 (id=${created[name]})`);
  } else {
    const r = await drive.files.create({
      requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] },
      fields: 'id,name',
      supportsAllDrives: true,
    });
    created[name] = r.data.id;
    console.log(`+ ${name} 생성 (id=${created[name]})`);
  }
}

console.log('\n폴더 구조 완성:');
console.log(`  JPK문서/ (${created['JPK문서']})`);
console.log(`    ├── 계약/ (${created['계약']})`);
console.log(`    ├── 자산/ (${created['자산']})`);
console.log(`    ├── 보험/ (${created['보험']})`);
console.log(`    └── 일반/ (${created['일반']})`);
