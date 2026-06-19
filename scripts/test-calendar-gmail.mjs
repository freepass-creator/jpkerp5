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

function buildAuth(scope) {
  return new google.auth.JWT({
    email: key.client_email, key: key.private_key,
    scopes: [scope], subject: env.GOOGLE_IMPERSONATE_USER,
  });
}

// Calendar 테스트 (목록 조회)
try {
  const auth = buildAuth('https://www.googleapis.com/auth/calendar');
  const cal = google.calendar({ version: 'v3', auth });
  const r = await cal.calendarList.list({ maxResults: 3 });
  console.log('✅ Calendar OK — 캘린더 수:', r.data.items?.length ?? 0);
  if (r.data.items?.[0]) console.log('   첫 캘린더:', r.data.items[0].summary);
} catch (e) {
  console.log('❌ Calendar 실패:', e.message);
}

// Gmail 테스트 (프로필 조회 — 발송 X, 권한만 확인)
try {
  const auth = buildAuth('https://www.googleapis.com/auth/gmail.send');
  const gmail = google.gmail({ version: 'v1', auth });
  // gmail.send 권한 만으로는 profile 못 부르니, 그냥 인증만 확인
  await auth.authorize();
  console.log('✅ Gmail JWT 인증 OK (실 발송은 별도 테스트)');
} catch (e) {
  console.log('❌ Gmail 실패:', e.message);
}
