// 엑셀 파일 1개 → 자동 분류 + 미리보기 (한국 은행 export 호환)

import * as XLSX from 'xlsx';

export type UploadKind = '계약' | '계좌' | '카드' | '자동이체' | '미분류';

export type ParsedSheet = {
  fileName: string;
  sheetName: string;
  kind: UploadKind;
  detectedConfidence: number; // 0~1
  headerRow: number;
  headers: string[];
  rows: Record<string, unknown>[];
  rawAoa: unknown[][];
  /** 파일명에서 추정한 은행명 (KB/우리/신한/하나/농협/IBK/SC/카카오/토스/케이/새마을/우체국 등) */
  bankHint?: string;
};

/** 키워드 사전 — 헤더에 포함되면 해당 종류로 판정 */
const KIND_KEYWORDS: Record<Exclude<UploadKind, '미분류'>, string[]> = {
  계약: ['계약자명', '계약자', '계약일', '등록번호', '주민번호', '월대여료', '계약번호', '약정', '인도일', '반납예정'],
  계좌: [
    '거래일', '거래일자', '거래일시', '거래시각', '입금일', '출금일',
    '입금', '입금액', '받은금액', '출금', '출금액', '인출액', '지급액',
    '적요', '메모', '내용', '거래내용', '거래메모', '용도',
    '상대계좌', '상대', '예금주', '입금자', '입금자명', '송금인', '보낸이', '받는분', '수취인',
    '계좌번호', '잔액', '이체'
  ],
  카드: ['승인번호', '승인일', '카드번호', '카드', '매입금액', '카드사', '가맹점'],
  // CMS 자동이체 명세 — 회원명+수납금액+청구완납일자/청구월 조합
  자동이체: [
    '회원명', '회원번호', '납부자', '납부자명', '납부자 휴대전화',
    '수납금액', '청구금액', '청구월', '최초청구월', '청구완납일자', '결제일(납부기간)',
    '결제수단', '결제방식', '결제상태', '수납상태', '미수처리상태',
    'CMS', '자동이체', '이체출금', '집금',
  ],
};

/** 체크박스 / 일련번호 / 빈 UI 컬럼 — 헤더에서 제거 (신한 인터넷뱅킹 등) */
const CHECKBOX_HEADER_RE = /^(전체\s*선택|선택|체크|✓|☑|순번|no\.?|번호)$/i;

/** 푸터 / 합계 행 — 첫 비어있지 않은 셀이 합계성 키워드면 skip */
const FOOTER_RE = /^(합계|소계|총계|총\s*합계|이월|기말|기초|평균|건수|total)$/i;

/** 파일명에서 은행명 추정 — "KB_거래내역.xlsx" → "KB" */
const BANK_PATTERNS: Array<[RegExp, string]> = [
  [/(국민은행|KB(국민)?|kb)/i, 'KB'],
  [/(우리은행|우리|wooribank|woori)/i, '우리'],
  [/(신한은행|신한|shinhan)/i, '신한'],
  [/(하나은행|하나|kebhana|keb|hana)/i, '하나'],
  [/(농협은행|농협|nh|nonghyup)/i, '농협'],
  [/(IBK|기업은행|기업)/i, 'IBK'],
  [/(SC제일|sc제일|standard\s*chartered|sc)/i, 'SC제일'],
  [/(카카오뱅크|카카오|kakaobank|kakao)/i, '카카오뱅크'],
  [/(토스뱅크|toss\s*bank|tossbank)/i, '토스뱅크'],
  [/(케이뱅크|k.?bank|kbank)/i, '케이뱅크'],
  [/(새마을(금고)?|MG)/i, '새마을금고'],
  [/(우체국)/i, '우체국'],
  [/(수협)/i, '수협'],
  [/(부산은행|BNK부산|BNK)/i, '부산'],
  [/(대구은행|DGB)/i, '대구'],
  [/(광주은행|JB광주)/i, '광주'],
  [/(전북은행|JB전북)/i, '전북'],
  [/(경남은행)/i, '경남'],
  [/(제주은행)/i, '제주'],
  [/(씨티(은행)?|citi)/i, '씨티'],
];

function detectBankFromFileName(fileName: string): string | undefined {
  const name = fileName.replace(/\.[^.]+$/, '');  // 확장자 제거
  for (const [re, label] of BANK_PATTERNS) {
    if (re.test(name)) return label;
  }
  return undefined;
}

const HEADER_MIN_NON_EMPTY = 3;  // 4 → 3 (간단 신한 export 대응)
const LOOK_ROWS_MAX = 30;        // 12 → 30 (안내문 다수 은행 대응)

/** 헤더 행 자동 탐지 — 빈 셀이 적고 키워드 매치 많은 행 (상위 30행 스캔)
 *
 *  CMS 자동이체 명세는 '계약번호' 컬럼이 있어서 '계약' 으로 잘못 분류될 수 있음.
 *  → '회원명' + '수납금액' (또는 '청구완납일자') 둘 다 있으면 무조건 '자동이체' 우선.
 */
function detectHeaderRow(aoa: unknown[][]): { headerRow: number; kind: UploadKind; confidence: number } {
  let best = { headerRow: 0, kind: '미분류' as UploadKind, confidence: 0 };
  const lookRows = Math.min(aoa.length, LOOK_ROWS_MAX);
  for (let r = 0; r < lookRows; r++) {
    const row = aoa[r] || [];
    const cells = row.map((v) => String(v ?? '').trim());
    const nonEmpty = cells.filter((c) => c.length > 0).length;
    if (nonEmpty < HEADER_MIN_NON_EMPTY) continue;

    // CMS 자동이체 강제 인식 — 회원명 + (수납금액 OR 청구완납일자 OR 청구월)
    const hasMember = cells.some((c) => c === '회원명');
    const hasAutopaySignal = cells.some((c) => c === '수납금액' || c === '청구완납일자' || c === '청구월' || c === '청구금액');
    if (hasMember && hasAutopaySignal) {
      return { headerRow: r, kind: '자동이체' as UploadKind, confidence: 1 };
    }

    let bestKind: UploadKind = '미분류';
    let bestScore = 0;
    for (const [kind, kws] of Object.entries(KIND_KEYWORDS) as [Exclude<UploadKind, '미분류'>, string[]][]) {
      const hit = kws.filter((kw) => cells.some((c) => c.includes(kw))).length;
      if (hit > bestScore) {
        bestScore = hit;
        bestKind = kind;
      }
    }
    const confidence = bestScore / 4;
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
  const bankHint = detectBankFromFileName(file.name);

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: null }) as unknown[][];
    if (aoa.length < 2) continue;
    const det = detectHeaderRow(aoa);

    // 헤더 정규화 — `*` 접미사 제거
    const rawHeaders = (aoa[det.headerRow] || []).map((v, i) => {
      if (v == null || v === '') return `col${i + 1}`;
      return String(v).trim().replace(/\s*\*\s*$/, '').trim();
    });

    // 체크박스 / 일련번호 / UI 컬럼 인덱스 추출 → 제거
    const dropIdx = new Set<number>();
    rawHeaders.forEach((h, i) => { if (CHECKBOX_HEADER_RE.test(h)) dropIdx.add(i); });
    const headers = rawHeaders.filter((_, i) => !dropIdx.has(i));

    const dataRows = aoa.slice(det.headerRow + 1);
    const rows: Record<string, unknown>[] = dataRows
      // 빈 행 제거
      .filter((r) => r.some((v) => v != null && String(v).trim() !== ''))
      // 합계/소계 등 푸터 행 제거 — 첫 두 셀 검사
      .filter((r) => {
        const first = String(r[0] ?? '').trim();
        const second = String(r[1] ?? '').trim();
        if (FOOTER_RE.test(first) || FOOTER_RE.test(second)) return false;
        return true;
      })
      .map((r) => {
        // 체크박스 컬럼 제거 (헤더가 짧아진만큼 데이터도 짧게)
        const filtered = dropIdx.size === 0 ? r : r.filter((_, i) => !dropIdx.has(i));
        const obj: Record<string, unknown> = {};
        headers.forEach((h, i) => {
          obj[h] = filtered[i] ?? null;
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
      bankHint,
    });
  }
  return out;
}
