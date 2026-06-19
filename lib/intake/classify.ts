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

type HeaderRule = {
  kind: IntakeKind;
  /** 필수 헤더 (모두 등장해야 매칭). normKey 적용 후 비교. */
  must: string[];
  /** 추가 가점 헤더 — 등장하면 confidence 상승 */
  bonus?: string[];
  baseConfidence: number;
};

const HEADER_RULES: HeaderRule[] = [
  {
    kind: 'contract',
    must: ['계약자', '계약일'],
    bonus: ['월대여료', '월렌트료', '차량번호', '반납예정'],
    baseConfidence: 0.85,
  },
  {
    kind: 'bank-tx',
    must: ['거래일'],
    bonus: ['입금액', '출금액', '잔액', '거래내역', '적요'],
    baseConfidence: 0.85,
  },
  {
    kind: 'card-tx',
    must: ['승인'],
    bonus: ['가맹점', '카드번호', '승인번호', '매출금액', '카드사'],
    baseConfidence: 0.80,
  },
  {
    kind: 'auto-debit',
    must: ['자동이체'],
    bonus: ['고객명', '이체일', '금액'],
    baseConfidence: 0.85,
  },
  {
    kind: 'vehicle',
    must: ['차량번호'],
    bonus: ['차대번호', 'VIN', '제조사', '연식', '매입가', '매입일'],
    baseConfidence: 0.65,
  },
  {
    kind: 'snapshot-mixed',
    must: ['차량번호', '계약자', '월대여료', '현재미수'],
    bonus: ['반납예정', '결제일'],
    baseConfidence: 0.90,
  },
];

function classifyByHeaders(headers: string[]): ClassifyResult | null {
  const normSet = new Set(headers.map(normKey));
  const scored: Array<ClassifyResult> = [];
  for (const rule of HEADER_RULES) {
    const allMust = rule.must.every((m) => Array.from(normSet).some((h) => h.includes(normKey(m))));
    if (!allMust) continue;
    const bonus = (rule.bonus ?? []).reduce(
      (n, b) => n + (Array.from(normSet).some((h) => h.includes(normKey(b))) ? 1 : 0),
      0,
    );
    const confidence = Math.min(0.99, rule.baseConfidence + bonus * 0.03);
    scored.push({
      kind: rule.kind,
      confidence,
      reason: `헤더 매칭: ${rule.must.join('+')}${bonus > 0 ? ` (+ 보조 ${bonus})` : ''}`,
    });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.confidence - a.confidence);
  const best = scored[0];
  const alts = scored.slice(1).map((s) => ({ kind: s.kind, confidence: s.confidence }));
  return { ...best, alternatives: alts.length > 0 ? alts : undefined };
}

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
