/**
 * 업로드 처리 상태 — 모든 엑셀/OCR 업로드에 공용 type.
 *
 * 계좌·자동이체·카드매출·법인카드·계약·자산·과태료 등 모든 업로드에서
 * 같은 type 으로 각 업로드 화면이 결과를 표시.
 */

export type UploadRowStatus =
  | 'new'         // 신규 저장됨 (매칭 X)
  | 'matched'     // 신규 저장 + 자동 매칭됨
  | 'unmatched'   // 신규 저장 but 매칭 안 됨 (수동 매칭 필요)
  | 'duplicate'   // 중복 — 저장 skip
  | 'error';      // 파싱·검증 오류 — 저장 skip

export type UploadResultRow = {
  /** 시트 내 row 인덱스 (1-based 표시) */
  rowIndex: number;
  /** 사용자 식별용 라벨 — 한 줄 요약 (예: "2026-06-05 김OO 입금 100,000") */
  label: string;
  status: UploadRowStatus;
  /** 추가 안내 — 매칭된 계약번호 / 오류 사유 / 중복된 기존 거래 등 */
  message?: string;
};

export type UploadResult = {
  /** 업로드 종류 — '계좌' / '자동이체' / '카드매출' / '법인카드' / '계약' / '자산' / '과태료' */
  uploadKind: string;
  rows: UploadResultRow[];
  totalCount: number;
  newCount: number;
  matchedCount: number;
  unmatchedCount: number;
  duplicateCount: number;
  errorCount: number;
};

export function buildResultSummary(rows: UploadResultRow[], uploadKind: string): UploadResult {
  return {
    uploadKind,
    rows,
    totalCount: rows.length,
    newCount: rows.filter((r) => r.status === 'new').length,
    matchedCount: rows.filter((r) => r.status === 'matched').length,
    unmatchedCount: rows.filter((r) => r.status === 'unmatched').length,
    duplicateCount: rows.filter((r) => r.status === 'duplicate').length,
    errorCount: rows.filter((r) => r.status === 'error').length,
  };
}
