/**
 * 날짜 정규화 헬퍼 — OCR / 외부 입력 → ISO (YYYY-MM-DD) 변환.
 *
 * Gemini 가 한글 날짜 ("2017년 01월 01일") 또는 점·슬래시 구분자 ("2017.01.01", "2017/01/01")
 * 로 추출하는 경우 form date input 이 거부 → 빈 문자열 처리하던 문제 회피.
 */

/**
 * 한글/구분자 날짜 → ISO yyyy-MM-dd. 변환 실패 시 빈 문자열.
 *
 *   normalizeKoreanDate('2017년 01월 01일')  → '2017-01-01'
 *   normalizeKoreanDate('2017.01.01')         → '2017-01-01'
 *   normalizeKoreanDate('2017/01/01')         → '2017-01-01'
 *   normalizeKoreanDate('2017-01-01')         → '2017-01-01'
 *   normalizeKoreanDate(null) / 알 수 없는 포맷 → ''
 */
export function normalizeKoreanDate(s: string | null | undefined): string {
  if (!s) return '';
  const t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return '';
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
