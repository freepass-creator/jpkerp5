import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

/**
 * 팩스 발송 — 과태료 변경부과 고지서 팩스 전송.
 *
 * ⚠️ 현재 팩스 프로바이더(예: 뿌리오/네이버웍스 팩스/모바일팩스 API)가 연동되지 않았다.
 * 기존엔 이 라우트 자체가 없어 fetch 가 404 → JSON 파싱 실패 → "발송 실패"로만 떠서
 * 사용자가 원인을 알 수 없었다. 여기서 **미설정 사실을 명확히 안내**한다.
 *
 * 실연동 시: FAX_PROVIDER_KEY 등 env 확인 후 아래 TODO 부분에 프로바이더 호출 구현.
 */
export async function POST() {
  const actor = await requireAuth();
  if (actor instanceof NextResponse) return actor;

  const providerKey = process.env.FAX_PROVIDER_KEY;
  if (!providerKey) {
    // 미설정 — UI(FaxSendDialog)가 ok:false + message 를 그대로 노출.
    return NextResponse.json({
      ok: false,
      message: '팩스 발송이 아직 설정되지 않았습니다 (팩스 프로바이더 미연동). 관리자에게 문의하거나 변경부과 PDF를 내려받아 직접 발송하세요.',
    });
  }

  // TODO: 프로바이더 연동 — FormData(sender/receiver/title/memo/file_N) → 팩스 API 전송.
  return NextResponse.json({
    ok: false,
    message: '팩스 발송 연동이 준비 중입니다.',
  });
}
