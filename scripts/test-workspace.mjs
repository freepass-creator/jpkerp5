import { readFileSync } from 'fs';
import { google } from 'googleapis';

// .env.local 수동 파싱 (dotenv 없이)
const envText = readFileSync('.env.local', 'utf-8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2];
}

const raw = env.GOOGLE_SERVICE_ACCOUNT_KEY;
const decoded = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8');
const key = JSON.parse(decoded);

const impersonate = env.GOOGLE_IMPERSONATE_USER;
const folderId = env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

console.log('client_email:', key.client_email);
console.log('impersonate :', impersonate);
console.log('folder_id   :', folderId);
console.log('');

const auth = new google.auth.JWT({
  email: key.client_email,
  key: key.private_key,
  scopes: ['https://www.googleapis.com/auth/drive'],
  subject: impersonate,
});

try {
  await auth.authorize();
  console.log('✅ JWT 인증 성공 (도메인 위임 OK)');
} catch (e) {
  console.log('❌ JWT 인증 실패:', e.message);
  process.exit(1);
}

const drive = google.drive({ version: 'v3', auth });
try {
  const r = await drive.files.get({ fileId: folderId, fields: 'id,name,mimeType,driveId', supportsAllDrives: true });
  console.log('✅ Drive 폴더 접근 OK:', r.data);
} catch (e) {
  console.log('❌ Drive 폴더 접근 실패:', e.message);
}
