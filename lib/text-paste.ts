/**
 * 텍스트 붙여넣기 → row[] 파서.
 *
 * 직원이 엑셀에서 죽 긁어 붙여넣는 경우를 처리.
 * 구분자 자동 감지:
 *   1. 탭 — Excel 기본 클립보드 포맷 (TSV)
 *   2. 다중 공백 (2+ 스페이스) — 표 텍스트를 그냥 복사한 경우
 *   3. 파이프 `|` — 마크다운 표
 *
 * 첫 번째 비어있지 않은 행 = 헤더, 그 다음 = 데이터.
 * 헤더가 한 컬럼만 잡힐 정도로 잘게 쪼개진다면 다중 공백 모드로 재시도.
 */

export type ParsedTextRow = Record<string, string>;
export type ParsedTextResult = {
  headers: string[];
  rows: ParsedTextRow[];
  delimiter: 'tab' | 'multispace' | 'pipe';
  rawLineCount: number;
};

function detectDelimiter(lines: string[]): 'tab' | 'multispace' | 'pipe' {
  // 처음 10줄 중 어느 하나라도 탭이 있으면 TSV
  if (lines.slice(0, 10).some((l) => l.includes('\t'))) return 'tab';
  // 파이프가 줄 안에 2개 이상이면 마크다운 표
  if (lines.slice(0, 10).some((l) => (l.match(/\|/g) ?? []).length >= 2)) return 'pipe';
  return 'multispace';
}

function splitLine(line: string, delimiter: 'tab' | 'multispace' | 'pipe'): string[] {
  if (delimiter === 'tab') return line.split('\t').map((c) => c.trim());
  if (delimiter === 'pipe') {
    return line
      .split('|')
      .map((c) => c.trim())
      .filter((_, i, arr) => !(i === 0 && arr[0] === '') && !(i === arr.length - 1 && arr[arr.length - 1] === ''));
  }
  // 다중 공백 — 2칸 이상 공백 단위로 split
  return line.split(/\s{2,}/).map((c) => c.trim()).filter((c) => c.length > 0);
}

/** 마크다운 표 구분선(`|---|---|`)은 건너뜀 */
function isSeparatorLine(line: string): boolean {
  const stripped = line.replace(/[\s|:\-]/g, '');
  return stripped.length === 0 && /[-]/.test(line);
}

export function parsePastedText(text: string): ParsedTextResult | null {
  const allLines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (allLines.length < 2) return null;

  const delimiter = detectDelimiter(allLines);

  // 헤더 — 첫 줄
  let headers = splitLine(allLines[0], delimiter);

  // 다중 공백 모드인데 헤더가 1개로만 잡히면 TSV 로 폴백 (탭이 진짜로 안 들어있는지 확인)
  if (delimiter === 'multispace' && headers.length <= 1 && allLines[0].includes('  ')) {
    // 이미 multispace인데 1개라면 의미 없음 — 다른 분리자 없으니 그대로
  }

  // 헤더 중복 (예: 빈 헤더 여럿) 처리 — 빈 헤더는 'col{i}' 로 채움
  headers = headers.map((h, i) => h || `col${i + 1}`);

  const rows: ParsedTextRow[] = [];
  for (let i = 1; i < allLines.length; i++) {
    const line = allLines[i];
    if (delimiter === 'pipe' && isSeparatorLine(line)) continue;
    const cols = splitLine(line, delimiter);
    if (cols.length === 0) continue;
    const row: ParsedTextRow = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? '';
    });
    rows.push(row);
  }

  if (rows.length === 0) return null;

  return {
    headers,
    rows,
    delimiter,
    rawLineCount: allLines.length,
  };
}
