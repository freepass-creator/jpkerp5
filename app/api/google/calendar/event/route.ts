/**
 * Google Calendar 이벤트 등록 API — 만기·검사·반납·할부일 등 일정 푸시.
 *
 * POST /api/google/calendar/event
 *   body: {
 *     summary: string,        // 제목 (예: "보험 만기: 12가1234 (현대해상)")
 *     description?: string,
 *     date: string,           // YYYY-MM-DD (종일 이벤트)
 *     dateEnd?: string,
 *     calendarId?: string,    // 기본: GOOGLE_CALENDAR_ID
 *     attendees?: string[],   // 참석자 이메일 (예: 담당자)
 *     reminders?: { method: 'email'|'popup'; minutes: number }[],
 *     metadata?: { kind: 'insurance'|'inspection'|'return'|'loan'|...; refId: string }
 *   }
 *
 *   response: { ok, eventId, htmlLink }
 *
 * 만기·검사 자동 푸시:
 *   서버에서 /lib/alerts.ts buildAllAlerts() 결과를 day-of-N 일 전에 큐로 → 이 API 호출.
 *   (현재는 수동 호출만 지원, 자동 스케줄러는 다음 단계)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getCalendarClient, workspaceConfigured } from '@/lib/google/client';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';

type Body = {
  summary: string;
  description?: string;
  date: string;
  dateEnd?: string;
  calendarId?: string;
  attendees?: string[];
  reminders?: { method: 'email' | 'popup'; minutes: number }[];
  metadata?: Record<string, string>;
};

export async function POST(req: NextRequest) {
  const cfg = workspaceConfigured();
  if (!cfg.ok) {
    return NextResponse.json({ ok: false, error: `Workspace 미설정: ${cfg.missing.join(', ')}` }, { status: 500 });
  }

  const actor = await requireAuth();
  if (actor instanceof NextResponse) return actor;

  try {
    const body = (await req.json()) as Body;
    if (!body.summary || !body.date) {
      return NextResponse.json({ ok: false, error: 'summary, date 필수' }, { status: 400 });
    }

    const calendarId = body.calendarId || process.env.GOOGLE_CALENDAR_ID || 'primary';
    const calendar = getCalendarClient();

    const event = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: body.summary,
        description: body.description,
        start: { date: body.date },                // 종일 이벤트 (시간대 영향 X)
        end:   { date: body.dateEnd || body.date },
        attendees: body.attendees?.map((email) => ({ email })),
        reminders: {
          useDefault: !body.reminders || body.reminders.length === 0,
          overrides: body.reminders,
        },
        extendedProperties: body.metadata ? { private: body.metadata } : undefined,
      },
      sendUpdates: body.attendees && body.attendees.length > 0 ? 'all' : 'none',
    });

    return NextResponse.json({
      ok: true,
      eventId: event.data.id,
      htmlLink: event.data.htmlLink,
      calendarId,
    });
  } catch (e) {
    console.error('[calendar/event]', e);
    return NextResponse.json({ ok: false, error: (e as Error).message ?? String(e) }, { status: 500 });
  }
}
