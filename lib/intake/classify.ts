/**
 * Intake classify — 단일 분류기.
 *
 * 모든 IntakeRaw 입력 (row / file / manual) → ClassifyResult { kind, confidence, alternatives, reason }.
 *
 * 통합 대상 (현 산발 로직 → 여기로 흡수):
 *   - components/create-dialog.tsx `parseAndDetectKind` (헤더 휴리스틱)
 *   - app/m/upload/page.tsx `inferKind` (MIME)
 *   - 각 OCR dialog 의 dialog-fixed kind (penalty/vehicle/insurance/business)
 *
 * 점진 마이그레이션:
 *   Phase 0 — 이 파일 신설 (UI 영향 0)
 *   Phase 1 — 기존 분류 호출자들이 이걸 호출하도록 리팩터
 *   Phase 2 — intake/ RTDB 노드에 ClassifyResult 저장
 */

import { normKey } from '@/lib/parse-helpers';
import type { ClassifyResult, IntakeKind, IntakeRaw } from './types';

/* ────────────────────────── 헤더 휴리스틱 ────────────────────────── */

/**
 * 도메인별 헤더 키워드 — production 검증된 lib/excel-detect.ts 의 KIND_KEYWORDS 와
 * 동일. 둘 다 같은 SSOT 를 봐야 회귀 0.
 *
 * 점수 계산: 헤더 셀에 키워드가 substring match 된 갯수 / 4 = confidence (cap 1.0).
 * 2 hit 이상이어야 후보로 인정.
 */
export const HEADER_KEYWORDS: Record<Exclude<IntakeKind, 'unknown' | 'photo' | 'audio-call' | 'document-misc'>, string[]> = {
  contract: ['계약자명', '계약자', '계약일', '등록번호', '주민번호', '월대여료', '계약번호', '약정', '인도일', '반납예정'],
  'bank-tx': [
    '거래일', '거래일자', '거래일시', '거래시각', '입금일', '출금일',
    '입금', '입금액', '받은금액', '출금', '출금액', '인출액', '지급액',
    '적요', '메모', '내용', '거래내용', '거래메모', '용도',
    '상대계좌', '상대', '예금주', '입금자', '입금자명', '송금인', '보낸이', '받는분', '수취인',
    '계좌번호', '잔액', '이체',
  ],
  'card-tx': ['승인번호', '승인일', '카드번호', '카드', '매입금액', '카드사', '가맹점'],
  // CMS 자동이체 명세 — 회원명+수납금액+청구완납일자/청구월 조합
  'auto-debit': [
    '회원명', '회원번호', '납부자', '납부자명', '납부자 휴대전화',
    '수납금액', '청구금액', '청구월', '최초청구월', '청구완납일자', '결제일(납부기간)',
    '결제수단', '결제방식', '결제상태', '수납상태', '미수처리상태',
    'CMS', '자동이체', '이체출금', '집금',
  ],
  vehicle:  ['차량번호', '차대번호', 'VIN', '제조사', '연식', '매입가', '매입일'],
  company:  ['상호', '대표자', '사업자등록번호', '법인등록번호', '소재지'],
  penalty:  ['고지서번호', '위반일시', '단속일', '위반장소', '과태료'],
  insurance: ['증권번호', '보험사', '보험기간', '담보종목', '피보험자'],
  loan:     ['할부사', '잔여원금', '월납입', '대출잔액', '할부원리금'],
  'snapshot-mixed': ['차량번호', '계약자', '월대여료', '현재미수'],
};

/**
 * 헤더 배열 → ClassifyResult.
 *
 * - **CMS 강제 룰**: 회원명 + (수납금액|청구완납일자|청구월|청구금액) → auto-debit confidence 1.0
 * - 그 외: KIND_KEYWORDS substring 매칭 갯수가 최고인 종류 선택.
 *   2 hit 미만이면 unknown.
 */
export function classifyByHeaders(headers: string[]): ClassifyResult | null {
  const cells = headers.map((h) => String(h ?? '').trim());

  // CMS 자동이체 강제 인식
  const hasMember = cells.some((c) => c === '회원명');
  const hasAutopaySignal = cells.some((c) =>
    c === '수납금액' || c === '청구완납일자' || c === '청구월' || c === '청구금액',
  );
  if (hasMember && hasAutopaySignal) {
    return { kind: 'auto-debit', confidence: 1.0, reason: 'CMS 강제 룰 (회원명 + 수납금액 등)' };
  }

  let bestKind: IntakeKind = 'unknown';
  let bestScore = 0;
  const scoredAll: Array<{ kind: IntakeKind; score: number }> = [];

  for (const [kindRaw, kws] of Object.entries(HEADER_KEYWORDS)) {
    const kind = kindRaw as IntakeKind;
    const hit = kws.filter((kw) => cells.some((c) => c.includes(kw))).length;
    if (hit > 0) scoredAll.push({ kind, score: hit });
    if (hit > bestScore) {
      bestScore = hit;
      bestKind = kind;
    }
  }
  if (bestScore < 2) return null;

  const confidence = Math.min(bestScore / 4, 1);
  // 차순위 후보
  scoredAll.sort((a, b) => b.score - a.score);
  const alts = scoredAll.slice(1, 4).map((s) => ({ kind: s.kind, confidence: Math.min(s.score / 4, 1) }));
  return {
    kind: bestKind,
    confidence,
    reason: `헤더 키워드 hit=${bestScore} / 4`,
    alternatives: alts.length > 0 ? alts : undefined,
  };
}

void normKey; // 향후 normalized 비교용 (현재는 raw substring)

/* ────────────────────────── MIME / 파일명 휴리스틱 ────────────────────────── */

function classifyByFile(file: { name: string; type: string }, ocrFields?: Record<string, unknown>): ClassifyResult {
  const lowerName = file.name.toLowerCase();
  const mime = file.type;

  // OCR fields 가 이미 있다면 그쪽이 가장 강한 단서
  if (ocrFields) {
    if (ocrFields['notice_no'] || ocrFields['violation_date'] || ocrFields['fine_amount']) {
      return { kind: 'penalty', confidence: 0.95, reason: 'OCR 필드: 고지서번호/위반일/과태료' };
    }
    if (ocrFields['vin'] || ocrFields['vehicle_format']) {
      return { kind: 'vehicle', confidence: 0.95, reason: 'OCR 필드: 차대번호/형식' };
    }
    if (ocrFields['policy_no'] || ocrFields['insurer']) {
      return { kind: 'insurance', confidence: 0.95, reason: 'OCR 필드: 증권번호/보험사' };
    }
    if (ocrFields['biz_reg_no'] && ocrFields['ceo']) {
      return { kind: 'company', confidence: 0.95, reason: 'OCR 필드: 사업자번호/대표' };
    }
  }

  // 파일명 키워드
  if (/과태료|위반|고지서|범칙/i.test(file.name)) {
    return { kind: 'penalty', confidence: 0.75, reason: '파일명: 과태료/위반/고지서' };
  }
  if (/등록증|registration|차량/i.test(file.name) && mime.startsWith('image/')) {
    return { kind: 'vehicle', confidence: 0.70, reason: '파일명: 등록증/차량 + 이미지' };
  }
  if (/보험|증권|policy/i.test(file.name)) {
    return { kind: 'insurance', confidence: 0.75, reason: '파일명: 보험/증권' };
  }
  if (/사업자|법인/i.test(file.name)) {
    return { kind: 'company', confidence: 0.70, reason: '파일명: 사업자/법인' };
  }

  // MIME fallback
  if (mime.startsWith('audio/')) {
    return { kind: 'audio-call', confidence: 0.85, reason: 'MIME: audio/*' };
  }
  if (mime.startsWith('image/')) {
    return { kind: 'photo', confidence: 0.55, reason: 'MIME: image/* (sub-type 추가 분류 필요)' };
  }
  if (mime === 'application/pdf' || mime.includes('pdf')) {
    return { kind: 'document-misc', confidence: 0.40, reason: 'MIME: PDF (내용 분류 필요)' };
  }

  return { kind: 'unknown', confidence: 0.0, reason: 'MIME/파일명 단서 없음' };
}

/* ────────────────────────── 메인 엔트리 ────────────────────────── */

export function classify(raw: IntakeRaw): ClassifyResult {
  if (raw.mode === 'manual') {
    // 수기 폼은 kind 가 박혀서 들어옴 — confidence 1.0
    return { kind: raw.kind, confidence: 1.0, reason: '수기 입력 — 폼이 명시' };
  }

  if (raw.mode === 'row') {
    const headers = raw.headerHint ?? Object.keys(raw.row);
    const byHeader = classifyByHeaders(headers);
    if (byHeader) return byHeader;
    return { kind: 'unknown', confidence: 0.0, reason: '헤더 매칭 실패 — 사용자 수동 분류 필요' };
  }

  // file
  return classifyByFile(raw.file, raw.ocrFields);
}

/**
 * 자동 commit 임계값. high (0.85↑) 면 즉시 commit 시도, 그 미만이면 사용자 확인 필요.
 */
export function shouldAutoCommit(result: ClassifyResult): boolean {
  return result.confidence >= 0.85 && result.kind !== 'unknown';
}
