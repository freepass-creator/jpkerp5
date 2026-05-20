/**
 * 데이터 고유 코드 생성 — prefix 없이 짧은 영문·숫자 난수.
 * 모든 entity 공통 사용 (회사·차량·계약 등 어떤 마스터든).
 *
 *   genCode()       → 'K7M3A9' (6자)
 *   genCode(4)      → 'A9X2'
 *   genCode(6, used) → 기존 set 와 충돌 없는 신규 코드
 */

// 헷갈리는 글자 제외 (0/O, 1/I/L)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function genCode(len = 6, used?: Set<string>): string {
  for (let i = 0; i < 50; i++) {
    let s = '';
    for (let j = 0; j < len; j++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!used || !used.has(s)) return s;
  }
  // 극한 — 길이 늘려 재시도
  return genCode(len + 2, used);
}
