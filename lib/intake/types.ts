/**
 * Intake — 모든 데이터의 단일 입구.
 *
 * 비전 (docs/data-pipeline-audit.md):
 *   "모든 데이터 한곳에서 수집 → 분류 → 매칭 → 페이지별 뿌리기"
 *   각 페이지는 read-only, 입력·수정은 intake 한곳에서.
 *
 * 이 파일은 SSOT 타입 정의. classify/match 가 이걸 인풋·아웃풋으로 사용.
 *
 * 점진 마이그레이션 — Phase 0 (현재):
 *   1) 타입·분류기·매칭기를 lib/intake/ 에 모음 (UI 영향 0)
 *   2) 기존 입구 7곳이 점차 이걸 호출하도록 리팩터
 *   3) intake/ RTDB 노드 신설 + 단일 inbox UI
 *   4) 페이지에서 CRUD 떼서 read-only 화
 */

import type { CardTransaction, BankTransaction, Vehicle, Contract, Company } from '@/lib/types';
import type { PenaltyWorkItem } from '@/lib/penalty-pdf';
import type { Row } from '@/lib/parse-helpers';

/**
 * 입구 종류 — 누가 이걸 던졌는지.
 * UI 동선 안내·디버깅·통계용. classify/match 동작에 영향 X.
 */
export type IntakeSource =
  | 'desktop-excel'        // CreateDialog 엑셀 import
  | 'desktop-ocr-penalty'  // 과태료 dialog
  | 'desktop-ocr-vehicle'  // 등록증 dialog
  | 'desktop-ocr-insurance' // 보험증권 dialog
  | 'desktop-ocr-business' // 사업자등록증 dialog
  | 'mobile-upload'        // /m/upload 드래그·파일선택
  | 'manual-form';         // 페이지 안 다이얼로그 폼 (이행 후 사라질 예정)

/**
 * Intake 가 분류 후 판정한 도메인 종류.
 * 도메인 노드 (vehicles/contracts/...) 와 1:1 대응.
 */
export type IntakeKind =
  | 'contract'         // 계약
  | 'vehicle'          // 자산 (등록증·매입정보)
  | 'company'          // 법인 (사업자등록증)
  | 'bank-tx'          // 은행 거래 (입출금)
  | 'card-tx'          // 카드 거래 (매출/법인카드)
  | 'auto-debit'       // 자동이체 등록
  | 'penalty'          // 과태료 고지서
  | 'insurance'        // 보험증권
  | 'loan'             // 할부·리스 계약
  | 'photo'            // 차량 사진 (출고/반납/상품)
  | 'audio-call'       // 통화녹음
  | 'document-misc'    // 기타 첨부 문서
  | 'snapshot-mixed'   // 현황 스냅샷 (한 시트에 여러 도메인)
  | 'unknown';

/**
 * Raw 입력 형태 — 분류기가 다룰 수 있어야 하는 모든 모양.
 */
export type IntakeRaw =
  | { mode: 'row'; row: Row; sheetName?: string; headerHint?: string[] }
  | { mode: 'file'; file: { name: string; type: string; size: number }; dataUrl?: string; ocrFields?: Record<string, unknown> }
  | { mode: 'manual'; kind: IntakeKind; payload: Record<string, unknown> };

/**
 * 분류기 결과.
 */
export type ClassifyResult = {
  /** 가장 가능성 높은 종류 */
  kind: IntakeKind;
  /** 0~1. 1=확실, 0.3 이하=거의 모름 */
  confidence: number;
  /** 차순위 후보 (수동 분류 다이얼로그용). 비어있을 수 있음. */
  alternatives?: Array<{ kind: IntakeKind; confidence: number }>;
  /** 분류 근거 — 디버깅·사용자 안내용 */
  reason: string;
};

/**
 * 매칭기 결과 — 어느 계약/차량/법인과 묶일지.
 * 모든 도메인 입력이 공통으로 사용. 도메인별 필요한 ref 만 채움.
 */
export type MatchResult = {
  contractId?: string;
  vehicleId?: string;
  companyCode?: string;
  customerKey?: string;
  /** 매칭 신뢰도 — confidence 가 high 일 때만 자동 commit, 아니면 pending */
  confidence: 'high' | 'medium' | 'low' | 'none';
  /** 후보 N건 (medium/low 일 때 사용자 선택용) */
  candidates?: Array<{
    contractId?: string;
    vehicleId?: string;
    score: number;
    reason: string;
  }>;
  reason: string;
};

/**
 * Intake item — RTDB intake/{id} 에 저장될 single record.
 * 분류·매칭 진행 단계를 status 로 추적.
 */
export type IntakeStatus = 'classifying' | 'matching' | 'matched' | 'pending' | 'committed' | 'rejected';

export type IntakeItem = {
  id: string;
  source: IntakeSource;
  status: IntakeStatus;
  /** Raw 원본 — OCR 사진은 dataUrl, 엑셀 행은 row, 수기 폼은 payload */
  raw: IntakeRaw;
  /** classifier 가 채움 */
  classify?: ClassifyResult;
  /** matcher 가 채움 */
  match?: MatchResult;
  /** 사용자가 직접 보정한 분류 결과 (옵션) */
  overrideKind?: IntakeKind;
  /** 사용자가 직접 보정한 매칭 결과 (옵션) */
  overrideMatch?: Partial<MatchResult>;
  /** commit 후 어떤 도메인 노드의 어떤 ID 로 들어갔는지 */
  committed?: { node: string; id: string }[];
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
  /** 거부 사유 (status=rejected) */
  rejectReason?: string;
};

/**
 * 커밋 결과 — 분류·매칭 끝나면 도메인 노드에 어떻게 들어갔는지 보고.
 * 한 intake 가 여러 노드로 갈 수 있음 (예: 계약 1건 → contracts + vehicles 자동생성).
 */
export type CommitResult = {
  ok: boolean;
  writes: Array<{ node: string; id: string; op: 'create' | 'update' }>;
  errors?: string[];
};

/**
 * 도메인별 patch 타입 — kind 별로 그 도메인 노드에 들어갈 데이터.
 * classifier 가 kind 만 정하고, 별도 parser 가 raw 를 patch 로 변환.
 */
export type DomainPatch =
  | { kind: 'contract';   patch: Partial<Omit<Contract, 'id'>> }
  | { kind: 'vehicle';    patch: Partial<Omit<Vehicle, 'id'>> }
  | { kind: 'company';    patch: Partial<Omit<Company, 'id'>> }
  | { kind: 'bank-tx';    patch: Partial<Omit<BankTransaction, 'id'>> }
  | { kind: 'card-tx';    patch: Partial<Omit<CardTransaction, 'id'>> }
  | { kind: 'penalty';    patch: Partial<Omit<PenaltyWorkItem, 'id'>> };
