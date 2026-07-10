/**
 * Intake match — 단일 매칭기.
 *
 * 분류된 IntakeItem 을 기존 도메인과 연결.
 * 어떤 계약·차량·법인·임차인 record 에 묶일지 결정 (confidence + 후보).
 *
 * 통합 대상 (현 산발 로직):
 *   - lib/firebase/upload-auto-match.ts `tryAutoMatch` (모바일 업로드)
 *   - lib/use-contract-store.ts `findContractByPlate` (과태료)
 *   - lib/receipt-match.ts `autoMatchAll` (결제 매칭)
 *
 * 점진 마이그레이션:
 *   Phase 0 — 이 파일 (UI 영향 0)
 *   Phase 1 — 기존 매칭 호출자들이 이걸 호출하도록 리팩터
 *   Phase 2 — pending intake 의 candidate UI 가 이걸 호출
 */

import type { Contract, Vehicle } from '@/lib/types';
import type { MatchResult, IntakeKind } from './types';

/** 전화번호 정규화 — 숫자만. 공통 헬퍼. */
function normalizePhone(s: string): string {
  return (s ?? '').replace(/\D/g, '');
}

/* ────────────────────────── 입력 시그널 ────────────────────────── */

export type MatchSignals = {
  /** 계약번호 — 정확키, 가장 강한 신호(동명이인·오타 방어) */
  contractNo?: string;
  /** 차량번호 (정규화 전) */
  plate?: string;
  /** 전화번호 (정규화 전) */
  phone?: string;
  /** 면허번호 (digits) */
  licenseNo?: string;
  /** 주민/사업자/법인번호 (digits) */
  identNo?: string;
  /** 이름 — 동명이인 가능, weak 신호 */
  name?: string;
  /** 위반일·거래일 등 — period 내 계약 우선용 */
  eventDate?: string;
  /** 적요/메모 — plate suffix 매칭 (예: '박영협8309') */
  memo?: string;
};

/* ────────────────────────── 정규화 ────────────────────────── */

function normPlate(s: string): string {
  return s.replace(/\s+/g, '').replace(/[-_/\\.]/g, '').replace(/O/g, '0').replace(/I/g, '1');
}

function digits(s: string): string {
  return s.replace(/\D/g, '');
}

/* ────────────────────────── 후보 점수 ────────────────────────── */

type Candidate = {
  contractId?: string;
  vehicleId?: string;
  companyCode?: string;
  customerKey?: string;
  score: number;
  reasons: string[];
};

function scoreContract(
  c: Contract,
  signals: MatchSignals,
  vehicleByPlate: Map<string, Vehicle>,
): Candidate | null {
  let score = 0;
  const reasons: string[] = [];

  // 계약번호 — 정확키, 최강 신호(동명이인·오타 방어). 공백·구분자 무시 대문자 비교.
  if (signals.contractNo && c.contractNo) {
    const nn = (s: string) => s.replace(/[\s\-_/\\.]/g, '').toUpperCase();
    if (nn(signals.contractNo) === nn(c.contractNo)) {
      score += 100;
      reasons.push(`계약번호 정합 ${signals.contractNo}`);
    }
  }

  // 차량번호 — 강한 신호
  if (signals.plate) {
    const target = normPlate(signals.plate);
    if (c.vehiclePlate && normPlate(c.vehiclePlate) === target) {
      score += 50;
      reasons.push(`차번 정합 ${signals.plate}`);
    } else if (target.length >= 4 && c.vehiclePlate && normPlate(c.vehiclePlate).slice(-4) === target.slice(-4)) {
      score += 20;
      reasons.push('차번 suffix 4자리 일치');
    }
  }

  // 전화번호 — 강
  if (signals.phone) {
    const target = normalizePhone(signals.phone);
    if (target.length >= 7) {
      const p1 = normalizePhone(c.customerPhone1 ?? '');
      const p2 = normalizePhone(c.customerPhone2 ?? '');
      if (p1 === target || p2 === target) {
        score += 45;
        reasons.push(`전화 정합 ${signals.phone}`);
      } else if (p1.endsWith(target) || p2.endsWith(target)) {
        score += 15;
        reasons.push('전화 suffix 일치');
      }
    }
  }

  // 면허번호
  if (signals.licenseNo) {
    const d = digits(signals.licenseNo);
    if (d.length >= 10 && digits(c.customerLicenseNo ?? '') === d) {
      score += 40;
      reasons.push(`면허 정합 ${d}`);
    }
  }

  // 주민/사업자/법인번호
  if (signals.identNo) {
    const d = digits(signals.identNo);
    if (d.length >= 6 && digits(c.customerIdentNo ?? '') === d) {
      score += 40;
      reasons.push('식별번호 정합');
    }
  }

  // 이름 (weak — 동명이인)
  if (signals.name && c.customerName && c.customerName.trim() === signals.name.trim()) {
    score += 8;
    reasons.push(`이름 일치 ${signals.name}`);
  }

  // 적요 plate suffix 매칭
  if (signals.memo && c.vehiclePlate) {
    const last4 = normPlate(c.vehiclePlate).slice(-4);
    if (last4.length === 4 && signals.memo.includes(last4)) {
      score += 15;
      reasons.push(`적요에 차번 끝 4자리 (${last4})`);
    }
  }

  // 위반일/거래일이 계약 기간 안 — 보너스
  if (signals.eventDate && c.contractDate) {
    const end = c.returnScheduledDate;
    if (signals.eventDate >= c.contractDate && (!end || signals.eventDate <= end)) {
      score += 8;
      reasons.push('이벤트일이 계약 기간 안');
    }
  }

  if (score === 0) return null;

  // 활성 계약 가산
  if (c.status === '운행') { score += 3; reasons.push('운행'); }

  // vehicleId 찾기 — plate 정합되면 vehicle 도 같이
  let vehicleId: string | undefined;
  if (c.vehiclePlate) {
    const v = vehicleByPlate.get(normPlate(c.vehiclePlate));
    if (v) vehicleId = v.id;
  }

  return {
    contractId: c.id,
    vehicleId,
    customerKey: (c.customerIdentNo ?? '').replace(/\D/g, '') || undefined,
    score,
    reasons,
  };
}

function bucketConfidence(score: number, candidateCount: number): MatchResult['confidence'] {
  if (score >= 100) return 'high';   // 계약번호 정확키 — 단독 후보 아니어도 authoritative
  if (score >= 50 && candidateCount === 1) return 'high';
  if (score >= 50) return 'medium';   // 동점/동명이인 위험
  if (score >= 25) return 'medium';
  if (score >= 10) return 'low';
  return 'none';
}

/* ────────────────────────── 메인 엔트리 ────────────────────────── */

export function match(
  signals: MatchSignals,
  contracts: readonly Contract[],
  vehicles: readonly Vehicle[],
  _kind?: IntakeKind,
): MatchResult {
  const vehicleByPlate = new Map<string, Vehicle>();
  for (const v of vehicles) {
    if (v.plate) vehicleByPlate.set(normPlate(v.plate), v);
    if (v.plateHistory) {
      for (const p of v.plateHistory) {
        if (p) vehicleByPlate.set(normPlate(p), v);
      }
    }
  }

  const cands: Candidate[] = [];
  for (const c of contracts) {
    const s = scoreContract(c, signals, vehicleByPlate);
    if (s) cands.push(s);
  }
  cands.sort((a, b) => b.score - a.score);

  if (cands.length === 0) {
    return { confidence: 'none', reason: '매칭 후보 없음' };
  }

  const top = cands[0];
  const conf = bucketConfidence(top.score, cands.length);

  return {
    contractId: top.contractId,
    vehicleId: top.vehicleId,
    customerKey: top.customerKey,
    confidence: conf,
    candidates: cands.slice(0, 5).map((c) => ({
      contractId: c.contractId,
      vehicleId: c.vehicleId,
      score: c.score,
      reason: c.reasons.join(' / '),
    })),
    reason: top.reasons.join(' / '),
  };
}

/**
 * 자동 commit 임계값. high 만 자동 commit. medium/low 는 pending 으로 사용자 선택 대기.
 */
export function shouldAutoCommit(result: MatchResult): boolean {
  return result.confidence === 'high';
}
