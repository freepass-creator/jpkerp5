/**
 * 한국식 표기 SSOT — 공문·계약서·증명서·내용증명 등 모든 인쇄/표시에 사용.
 *
 * **원칙: 이 파일이 한국식 변환의 단일 진실. 페이지 안에 직접 정의 금지.**
 *
 * 영문/일반 포맷은 lib/utils.ts (formatCurrency, formatDate, displayDate ...).
 * 한국식 (년월일/주민번호/한글금액) 만 여기.
 */

/* ────────────────── 날짜 ────────────────── */

export type KDateOptions = {
  /**
   * 빈값/잘못된 값 처리:
   *  - 'blank' (기본): '' 반환
   *  - 'underline': '____년 __월 __일' (계약서·증명서 빈칸용)
   *  - 'dash': '-'
   */
  empty?: 'blank' | 'underline' | 'dash';
  /**
   * 월·일 자릿수 패딩:
   *  - false (기본): `2026년 1월 5일`
   *  - true: `2026년 01월 05일` (정렬 필요할 때)
   */
  pad?: boolean;
};

/**
 * YYYY-MM-DD → "YYYY년 M월 D일".
 *
 *   fmtKDate('2026-06-20')                   → '2026년 6월 20일'
 *   fmtKDate('', { empty: 'underline' })     → '____년 __월 __일'
 *   fmtKDate('2026-06-20', { pad: true })    → '2026년 06월 20일'
 *
 * 입력이 Date 또는 ISO datetime 도 처리.
 */
export function fmtKDate(s: string | Date | null | undefined, opts: KDateOptions = {}): string {
  const emptyMode = opts.empty ?? 'blank';
  const emptyOut =
    emptyMode === 'underline' ? '____년 __월 __일'
    : emptyMode === 'dash' ? '-'
    : '';
  if (s == null || s === '') return emptyOut;

  let y: number, mo: number, d: number;
  if (s instanceof Date) {
    if (Number.isNaN(s.getTime())) return emptyOut;
    y = s.getFullYear(); mo = s.getMonth() + 1; d = s.getDate();
  } else {
    // 'YYYY-MM-DD' 또는 ISO datetime 또는 'YYYY/MM/DD'
    const str = String(s).slice(0, 10).replace(/\//g, '-');
    const parts = str.split('-');
    if (parts.length < 3) return emptyOut;
    y = Number(parts[0]); mo = Number(parts[1]); d = Number(parts[2]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return emptyOut;
  }
  if (opts.pad) {
    return `${y}년 ${String(mo).padStart(2, '0')}월 ${String(d).padStart(2, '0')}일`;
  }
  return `${y}년 ${mo}월 ${d}일`;
}

/** YYYY-MM-DD HH:MM:SS → "YYYY년 M월 D일 HH:MM". */
export function fmtKDateTime(s: string | Date | null | undefined): string {
  if (s == null || s === '') return '';
  const d = s instanceof Date ? s : new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${fmtKDate(d)} ${hh}:${mm}`;
}

/** YYYY-MM-DD → "M월 D일" (연도 생략 — 같은 해 안에서). */
export function fmtKMonthDay(s: string | Date | null | undefined): string {
  if (s == null || s === '') return '';
  const full = fmtKDate(s);
  const m = full.match(/(\d+)월 (\d+)일/);
  return m ? `${m[1]}월 ${m[2]}일` : '';
}

/* ────────────────── 금액 ────────────────── */

/** 한국식 콤마 (`1,000,000`). null/undefined → '' (또는 fallback). */
export function fmtKMoney(n?: number | null | string, fallback: string = ''): string {
  if (n == null || n === '') return fallback;
  const num = typeof n === 'number' ? n : Number(String(n).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(num)) return fallback;
  return num.toLocaleString('ko-KR');
}

const DIGITS_KR = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const PLACE_KR = ['', '십', '백', '천'];
const UNIT_KR = ['', '만', '억', '조', '경'];

/**
 * 숫자 → 한글 금액 표기. 영수증·증명서 본문에서 사용.
 *
 *   numberToKorean(500000)    → '오십만'
 *   numberToKorean(1234567)   → '일백이십삼만사천오백육십칠'
 *   numberToKorean(0)         → '영'
 *
 * 발급 양식에서 보통 끝에 '원정' 또는 '원' 붙임 — 호출자가 책임.
 */
export function numberToKorean(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '영';
  if (n < 0) return '-' + numberToKorean(-n);

  let result = '';
  let unitIdx = 0;
  let v = Math.floor(n);
  while (v > 0) {
    const chunk = v % 10000;
    if (chunk > 0) {
      let chunkStr = '';
      let c = chunk;
      let p = 0;
      while (c > 0) {
        const d = c % 10;
        if (d > 0) chunkStr = DIGITS_KR[d] + PLACE_KR[p] + chunkStr;
        c = Math.floor(c / 10);
        p += 1;
      }
      result = chunkStr + UNIT_KR[unitIdx] + result;
    }
    v = Math.floor(v / 10000);
    unitIdx += 1;
  }
  return result;
}

/** 한글 금액 + 단위. 영수증·증명서 표준 (예: '금 오십만원정'). */
export function fmtKMoneyHangul(n: number, suffix: string = '원정'): string {
  return `${numberToKorean(n)}${suffix}`;
}

/* ────────────────── 식별번호 마스킹 ────────────────── */

/**
 * 주민번호·사업자번호·법인번호 마스킹. lib/customer-match 의 canonical 을 wrap.
 * 빈값 처리 옵션:
 *  - 'blank' (기본): ''
 *  - 'underline': '____________' (계약서 빈칸)
 *
 * 자릿수별 처리:
 *  · 13자리 (주민번호):     YYMMDD-1******
 *  · 12자리 (외국인 등록):  XXXXXX-X******
 *  · 10자리 (사업자번호):   XXX-XX-XXXXX (마스킹 X, 공개정보)
 *  · 그 외: 뒤 4자리만 노출
 */
export type MaskOptions = { empty?: 'blank' | 'underline' };

export function fmtMaskedIdent(ident: string | undefined | null, opts: MaskOptions = {}): string {
  const emptyOut = opts.empty === 'underline' ? '____________' : '';
  if (!ident) return emptyOut;
  const digits = String(ident).replace(/\D/g, '');
  if (digits.length === 13) return `${digits.slice(0, 6)}-${digits.slice(6, 7)}******`;
  if (digits.length === 12) return `${digits.slice(0, 6)}-${digits.slice(6, 7)}******`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  if (digits.length <= 4) return digits;
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

/** 전화번호 마스킹 (010-1234-5678 → 010-****-5678). 가운데 4자리 마스킹. */
export function fmtMaskedPhone(phone: string | undefined | null): string {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 11) return `${digits.slice(0, 3)}-****-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-***-${digits.slice(6)}`;
  return phone;
}
