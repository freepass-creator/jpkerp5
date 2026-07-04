/**
 * Gmail 발송 API — 송장·미수 안내·만기 통지 등 이메일 발송.
 *
 * POST /api/google/gmail/send
 *   body: {
 *     to: string | string[],   // 수신자 이메일 (콤마 또는 배열)
 *     subject: string,
 *     bodyText?: string,        // 평문
 *     bodyHtml?: string,        // HTML (bodyText 우선순위 낮음)
 *     attachments?: { fileName, mimeType, contentBase64 }[],
 *     cc?: string | string[],
 *     bcc?: string | string[],
 *     from?: string,            // 미설정 시 GMAIL_SENDER 또는 impersonate user
 *   }
 *
 *   response: { ok, messageId }
 *
 * 발신: Service Account Domain-Wide Delegation 으로 GOOGLE_IMPERSONATE_USER 권한 사용.
 *   환경변수 GMAIL_SENDER 가 지정되면 from 주소로 사용.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getGmailClient, workspaceConfigured } from '@/lib/google/client';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';

type Attachment = { fileName: string; mimeType: string; contentBase64: string };
type Body = {
  to: string | string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: Attachment[];
  cc?: string | string[];
  bcc?: string | string[];
  from?: string;
};

function toCsv(v: string | string[] | undefined): string | undefined {
  if (!v) return undefined;
  if (Array.isArray(v)) return v.join(', ');
  return v;
}

/** RFC 5322 MIME 메시지 build (multipart/alternative + 첨부 multipart/mixed) */
function buildRfc822(b: Body, from: string): string {
  const to = toCsv(b.to);
  const cc = toCsv(b.cc);
  const bcc = toCsv(b.bcc);

  const boundary = `==BOUNDARY_${Date.now().toString(36)}`;
  const altBoundary = `==ALT_${Date.now().toString(36)}`;
  const subject = `=?UTF-8?B?${Buffer.from(b.subject, 'utf-8').toString('base64')}?=`;

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : '',
    bcc ? `Bcc: ${bcc}` : '',
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
  ].filter(Boolean);

  const text = b.bodyText ?? '';
  const html = b.bodyHtml ?? '';

  if (!b.attachments || b.attachments.length === 0) {
    // alternative only
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    const partText = text ? [
      `--${altBoundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      text,
    ].join('\r\n') : '';
    const partHtml = html ? [
      `--${altBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      html,
    ].join('\r\n') : '';
    return [
      headers.join('\r\n'),
      '',
      partText,
      partHtml,
      `--${altBoundary}--`,
      '',
    ].filter(Boolean).join('\r\n');
  }

  // mixed (alternative + attachments)
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

  const altSection = [
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    text ? [
      `--${altBoundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      text,
    ].join('\r\n') : '',
    html ? [
      `--${altBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      html,
    ].join('\r\n') : '',
    `--${altBoundary}--`,
    '',
  ].filter(Boolean).join('\r\n');

  const attachSections = b.attachments.map((a) => [
    `--${boundary}`,
    `Content-Type: ${a.mimeType}; name="${a.fileName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${a.fileName}"`,
    '',
    a.contentBase64.replace(/(.{76})/g, '$1\r\n'),
  ].join('\r\n')).join('\r\n');

  return [
    headers.join('\r\n'),
    '',
    altSection,
    attachSections,
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

export async function POST(req: NextRequest) {
  const cfg = workspaceConfigured();
  if (!cfg.ok) {
    return NextResponse.json({ ok: false, error: `Workspace 미설정: ${cfg.missing.join(', ')}` }, { status: 500 });
  }
  const actor = await requireAuth();
  if (actor instanceof NextResponse) return actor;
  void actor;

  try {
    const body = (await req.json()) as Body;
    if (!body.to || !body.subject) {
      return NextResponse.json({ ok: false, error: 'to, subject 필수' }, { status: 400 });
    }

    // 발신자(임퍼소네이션 대상)는 서버 env 고정 — body.from 을 수용하면 인증된 직원이
    // 도메인 내 임의 계정으로 발신 위장 가능 (Domain-Wide Delegation 오남용 차단)
    const from = process.env.GMAIL_SENDER || process.env.GOOGLE_IMPERSONATE_USER;
    if (!from) return NextResponse.json({ ok: false, error: 'GMAIL_SENDER env 필요' }, { status: 500 });

    const gmail = getGmailClient(from);
    const raw = buildRfc822(body, from);
    const encoded = Buffer.from(raw, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const sent = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded },
    });

    return NextResponse.json({
      ok: true,
      messageId: sent.data.id,
      threadId: sent.data.threadId,
    });
  } catch (e) {
    console.error('[gmail/send]', e);
    return NextResponse.json({ ok: false, error: (e as Error).message ?? String(e) }, { status: 500 });
  }
}
