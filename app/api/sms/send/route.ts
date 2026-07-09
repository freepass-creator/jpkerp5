/**
 * SMS / 알림톡 발송 API — Aligo 카카오 알림톡 (실패 시 SMS failover).
 * freepasserp3/api/alimtalk.js 포팅.
 *
 * POST /api/sms/send
 *   { template_code, receiver_tel, variables: { _message, _subject } }
 *   또는 단순 SMS: { tel, message, subject? }
 *
 * Env (.env.local):
 *   ALIGO_API_KEY      Aligo API 키
 *   ALIGO_USER_ID      Aligo 계정 ID
 *   ALIGO_SENDER_KEY   카카오 비즈 발신프로필 키 (알림톡용)
 *   ALIGO_SENDER_TEL   발신자 전화번호 (-없이)
 *   ALIGO_FAILOVER     'sms' 면 알림톡 실패 시 SMS 자동 대체
 *   ALIGO_DRY_RUN      'true' 면 실제 발송 X — 콘솔 로그만 (개발용)
 *
 * Env 미설정 시 mock 응답 — 코드 흐름은 안 막힘.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getAdminRtdb } from '@/lib/firebase/admin';
import { randomUUID, createHash } from 'node:crypto';

export const runtime = 'nodejs';

type Body = {
  // 알림톡 (사전 승인 템플릿)
  template_code?: string;
  receiver_tel?: string;
  variables?: { _message?: string; _subject?: string };
  // 단순 SMS (템플릿 없음)
  tel?: string;
  message?: string;
  subject?: string;
  /** ERP #16 멱등성 — 클라이언트가 생성한 키. 같은 키로 다시 호출 시 기존 응답 그대로 반환. */
  idempotencyKey?: string;
};

const SMS_LOG_PATH = `${process.env.NEXT_PUBLIC_FIREBASE_DB_TENANT ?? 'jpkerp5'}/sms_log`;

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const actor = authResult;

  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 }); }

  // 단순 SMS 호환 — tel/message 만 와도 동작
  const tel = (body.receiver_tel ?? body.tel ?? '').replace(/[^\d]/g, '');
  const message = body.variables?._message ?? body.message ?? '';
  const subject = body.variables?._subject ?? body.subject ?? '';
  const template_code = body.template_code; // 있으면 알림톡, 없으면 SMS

  if (!tel || !message) {
    return NextResponse.json({ ok: false, error: 'tel & message required' }, { status: 400 });
  }

  // ── 멱등성 (ERP #16) ─────────────
  // idempotencyKey 명시되지 않으면 (tel + message + minute) 해시로 자동 생성 — 같은 1분 내 같은 메시지는 중복 차단.
  const opKey = body.idempotencyKey ?? createHash('sha256')
    .update(`${tel}|${message}|${Math.floor(Date.now() / 60000)}`)
    .digest('hex').slice(0, 32);

  let logRef: ReturnType<ReturnType<typeof getAdminRtdb>['ref']> | null = null;
  try {
    const db = getAdminRtdb();
    logRef = db.ref(`${SMS_LOG_PATH}/${opKey}`);
    const existing = await logRef.get();
    // 성공한 발송만 멱등 차단 — 실패·mock(ok:false)까지 막으면 같은 1분 내 재시도가
    // 영구 불가해진다(전송 실패 후 재발송 원천 차단). 실패 기록은 아래에서 덮어씀.
    if (existing.exists() && existing.val()?.ok === true) {
      const prev = existing.val();
      return NextResponse.json({ ...prev.response, idempotent: true, sentAt: prev.sentAt });
    }
  } catch (e) {
    console.warn('[sms idempotency check]', e);
    // 검사 실패 시 발송은 진행 (가용성 우선)
  }

  const apiKey    = process.env.ALIGO_API_KEY;
  const userId    = process.env.ALIGO_USER_ID;
  const senderKey = process.env.ALIGO_SENDER_KEY;
  const senderTel = process.env.ALIGO_SENDER_TEL;
  const failover  = process.env.ALIGO_FAILOVER === 'sms' ? 'Y' : 'N';
  const dryRun    = process.env.ALIGO_DRY_RUN === 'true';

  // ── 알림 ledger (ERP #27) — 발송 결과를 sms_log/{opKey} 에 영구 기록 ─────────────
  async function logAndReturn(payload: Record<string, unknown>): Promise<NextResponse> {
    if (logRef) {
      try {
        await logRef.set({
          opKey,
          actor: actor.email ?? actor.uid,
          tel,
          subject,
          message: message.length > 200 ? `${message.slice(0, 200)}…` : message,
          template_code: template_code ?? null,
          channel: (payload.channel as string) ?? null,
          ok: !!payload.ok,
          response: payload,
          sentAt: new Date().toISOString(),
        });
      } catch (e) { console.error('[sms log save]', e); }
    }
    return NextResponse.json(payload);
  }

  if (!apiKey || !userId || !senderTel) {
    console.warn('[sms] env not configured — mock response');
    return logAndReturn({ ok: false, mock: true, reason: 'ALIGO_* env not configured' });
  }

  if (dryRun) {
    console.log('[sms DRY_RUN]', { tel, subject, message, template_code });
    return logAndReturn({ ok: true, dryRun: true, tel, template_code });
  }

  // ── 알림톡 (template_code 있을 때) ─────────────
  if (template_code) {
    if (!senderKey) {
      return logAndReturn({ ok: false, error: 'ALIGO_SENDER_KEY 미설정 — 알림톡 발송 불가' });
    }
    const form = new URLSearchParams();
    form.append('apikey', apiKey);
    form.append('userid', userId);
    form.append('senderkey', senderKey);
    form.append('tpl_code', template_code);
    form.append('sender', senderTel);
    form.append('receiver_1', tel);
    form.append('subject_1', subject || ' ');
    form.append('message_1', message);
    if (failover === 'Y') {
      form.append('failover', 'Y');
      form.append('fsubject_1', subject || ' ');
      form.append('fmessage_1', message);
    }
    try {
      const r = await fetch('https://kakaoapi.aligo.in/akv10/alimtalk/send/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      const data = await r.json().catch(() => ({}));
      const ok = data.code === 0 || data.code === '0';
      return logAndReturn({ ok, channel: 'alimtalk', ...data });
    } catch (e) {
      console.error('[sms alimtalk]', e);
      return logAndReturn({ ok: false, channel: 'alimtalk', error: (e as Error).message ?? String(e) });
    }
  }

  // ── 일반 SMS (Aligo SMS API) ─────────────
  const form = new URLSearchParams();
  form.append('key', apiKey);
  form.append('user_id', userId);
  form.append('sender', senderTel);
  form.append('receiver', tel);
  form.append('msg', message);
  if (subject) form.append('title', subject);
  if (message.length > 90) form.append('msg_type', 'LMS'); // 90자 초과 = LMS

  try {
    const r = await fetch('https://apis.aligo.in/send/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = await r.json().catch(() => ({}));
    const ok = data.result_code === '1' || data.result_code === 1;
    return logAndReturn({ ok, channel: 'sms', ...data });
  } catch (e) {
    console.error('[sms sms]', e);
    return logAndReturn({ ok: false, channel: 'sms', error: (e as Error).message ?? String(e) });
  }
}
