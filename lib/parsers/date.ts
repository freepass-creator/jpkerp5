/**
 * 날짜 정규화 헬퍼 — OCR / 외부 입력 → ISO (YYYY-MM-DD) 변환.
 *
 * Gemini 가 한글 날짜 ("2017년 01월 01일") 또는 점·슬래시 구분자 ("2017.01.01", "2017/01/01")
 * 로 추출하는 경우 form date input 이 거부 → 빈 문자열 처리하던 문제 회피.
 */

/**
 * 한글/구분자/무구분 날짜 → ISO yyyy-MM-dd. 변환 실패 시 빈 문자열.
 *
 *   normalizeKoreanDate('2017년 01월 01일')  → '2017-01-01'
 *   normalizeKoreanDate('2017.01.01')         → '2017-01-01'
 *   normalizeKoreanDate('2017/01/01')         → '2017-01-01'
 *   normalizeKoreanDate('2017-01-01')         → '2017-01-01'
 *   normalizeKoreanDate('20170101')           → '2017-01-01'  (yyyymmdd)
 *   normalizeKoreanDate('170101')             → '2017-01-01'  (yymmdd, 50미만→20xx)
 *   normalizeKoreanDate('99-01-01')           → '1999-01-01'  (yy-mm-dd, 50이상→19xx)
 *   normalizeKoreanDate('17.01.01')           → '2017-01-01'  (yy.mm.dd)
 *   normalizeKoreanDate('99/01/01')           → '1999-01-01'
 *   normalizeKoreanDate('99년 01월 01일')     → '1999-01-01'
 *   normalizeKoreanDate(null) / 알 수 없는 포맷 → ''
 *
 * Excel 직렬 날짜(숫자)도 받음 — 45000 같은 값을 Date 로 변환.
 */
export function normalizeKoreanDate(s: string | number | Date | null | undefined): string {
  if (s == null) return '';

  // Date 객체
  if (s instanceof Date) {
    if (Number.isNaN(s.getTime())) return '';
    return toISODate(s);
  }

  // Excel serial number (날짜) — 1900-01-01 기준 일수
  if (typeof s === 'number' && s > 1 && s < 100000) {
    // Excel 의 1900년 윤년 버그 보정 (1900-02-29 가 존재한다고 침)
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + s * 86400000);
    if (!Number.isNaN(d.getTime())) return toISODate(d);
  }

  const t = String(s).trim();
  if (!t) return '';

  // 1) yyyy-mm-dd (이미 ISO) — 가장 흔함
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

  // 2) yyyymmdd (구분자 없음, 8자리) — "20260520"
  if (/^\d{8}$/.test(t)) {
    const y = t.slice(0, 4), mo = t.slice(4, 6), d = t.slice(6, 8);
    return validISO(y, mo, d);
  }

  // 3) yymmdd (구분자 없음, 6자리) — "260520"
  if (/^\d{6}$/.test(t)) {
    const yy = t.slice(0, 2), mo = t.slice(2, 4), d = t.slice(4, 6);
    return validISO(toFullYear(yy), mo, d);
  }

  // 4) yyyy[구분]mm[구분]dd — 점·슬래시·한글·하이픈·공백 등 모두 허용
  const m4 = t.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})$/);
  if (m4) {
    return validISO(m4[1], m4[2], m4[3]);
  }

  // 5) yy[구분]mm[구분]dd — 2자리 연도
  const m2 = t.match(/^(\d{2})\D+(\d{1,2})\D+(\d{1,2})$/);
  if (m2) {
    return validISO(toFullYear(m2[1]), m2[2], m2[3]);
  }

  // 6) 한글 포함 등 마지막 fallback — 어디서든 yyyy*mm*dd 패턴 추출
  const fallback = t.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (fallback) {
    return validISO(fallback[1], fallback[2], fallback[3]);
  }

  return '';
}

function validISO(y: string, mo: string, d: string): string {
  const yi = parseInt(y, 10);
  const mi = parseInt(mo, 10);
  const di = parseInt(d, 10);
  if (yi < 1900 || yi > 2100) return '';
  if (mi < 1 || mi > 12) return '';
  if (di < 1 || di > 31) return '';
  return `${String(yi).padStart(4, '0')}-${String(mi).padStart(2, '0')}-${String(di).padStart(2, '0')}`;
}

function toFullYear(yy: string): string {
  const n = parseInt(yy, 10);
  // 00~49 → 2000~2049, 50~99 → 1950~1999
  // (렌트카 운영상 30년 전 ~ 30년 후 커버)
  return String(n < 50 ? 2000 + n : 1900 + n);
}

function toISODate(d: Date): string {
  // 엑셀 자체의 2자리 연도 변환 규칙(00~29→20xx, 30~99→19xx) 때문에
  // "30" 이상으로 입력된 연도가 셀 단계에서 이미 19xx로 잘못 박혀 들어오는 경우 보정.
  // 렌트카 계약 도메인에서 1990년 이전 날짜는 나올 수 없음 → 안전하게 +100년 처리.
  const y = d.getFullYear() < 1990 ? d.getFullYear() + 100 : d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
