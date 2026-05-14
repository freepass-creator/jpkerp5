// 엑셀 파일 1개 → 자동 분류 + 미리보기

import * as XLSX from 'xlsx';

export type UploadKind = '계약' | '계좌' | '카드' | '미분류';

export type ParsedSheet = {
  fileName: string;
  sheetName: string;
  kind: UploadKind;
  detectedConfidence: number; // 0~1
  headerRow: number;
  headers: string[];
  rows: Record<string, unknown>[];
  rawAoa: unknown[][];
};

/** 키워드 사전 — 헤더에 포함되면 해당 종류로 판정 */
const KIND_KEYWORDS: Record<Exclude<UploadKind, '미분류'>, string[]> = {
  계약: ['계약자명', '계약자', '계약일', '등록번호', '주민번호', '월대여료', '계약번호', '약정', '인도일', '반납예정'],
  계좌: ['입금일', '입금자', '거래일', '거래일자', '적요', '메모', '상대계좌', '예금주', '계좌번호', '이체'],
  카드: ['승인번호', '승인일', '카드번호', '카드', '매입금액', '카드사', '가맹점'],
};

const HEADER_MIN_NON_EMPTY = 4;

/** 헤더 행 자동 탐지 — 빈 셀이 적고 키워드 매치 많은 행 */
function detectHeaderRow(aoa: unknown[][]): { headerRow: number; kind: UploadKind; confidence: number } {
  let best = { headerRow: 0, kind: '미분류' as UploadKind, confidence: 0 };
  const lookRows = Math.min(aoa.length, 12);
  for (let r = 0; r < lookRows; r++) {
    const row = aoa[r] || [];
    const cells = row.map((v) => String(v ?? '').trim());
    const nonEmpty = cells.filter((c) => c.length > 0).length;
    if (nonEmpty < HEADER_MIN_NON_EMPTY) continue;
    // 키워드 점수
    let bestKind: UploadKind = '미분류';
    let bestScore = 0;
    for (const [kind, kws] of Object.entries(KIND_KEYWORDS) as [Exclude<UploadKind, '미분류'>, string[]][]) {
      const hit = kws.filter((kw) => cells.some((c) => c.includes(kw))).length;
      if (hit > bestScore) {
        bestScore = hit;
        bestKind = kind;
      }
    }
    const confidence = bestScore / 4; // 4개 이상 매치되면 1.0
    if (bestScore >= 2 && confidence > best.confidence) {
      best = { headerRow: r, kind: bestKind, confidence: Math.min(confidence, 1) };
    }
  }
  return best;
}

export async function parseExcelFile(file: File): Promise<ParsedSheet[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const out: ParsedSheet[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: null }) as unknown[][];
    if (aoa.length < 2) continue;
    const det = detectHeaderRow(aoa);
    const headers = (aoa[det.headerRow] || []).map((v, i) => (v == null || v === '' ? `col${i + 1}` : String(v).trim()));
    const dataRows = aoa.slice(det.headerRow + 1);
    const rows: Record<string, unknown>[] = dataRows
      .filter((r) => r.some((v) => v != null && String(v).trim() !== ''))
      .map((r) => {
        const obj: Record<string, unknown> = {};
        headers.forEach((h, i) => {
          obj[h] = r[i] ?? null;
        });
        return obj;
      });

    out.push({
      fileName: file.name,
      sheetName,
      kind: det.kind,
      detectedConfidence: det.confidence,
      headerRow: det.headerRow,
      headers,
      rows,
      rawAoa: aoa,
    });
  }
  return out;
}
