/**
 * 업로드 은행 파일 → 회사 마스터 계좌 자동감지.
 *
 * 은행 export 파일은 계좌번호가 **시트명**("영업계좌(신한6616)")·**제목행**("예금주 … (140-014-381868)")·
 * **파일명**에만 있고 개별 거래 행엔 없다. 이 유틸이 그 위치에서 계좌번호(전체 또는 끝자리)를 뽑아
 * 회사 마스터 계좌와 매칭 → 업로드 시 계좌 드롭다운을 자동 선택한다.
 *
 * 원칙: **정밀 우선**. 확신 있을 때만(전체번호 일치 OR 괄호 끝자리 유일+은행일치) 매칭하고,
 *       애매하면 null 을 반환해 기존 동작(사용자 수동 선택)을 유지한다. 오탐으로 잘못 태깅하는 것보다
 *       한 번 더 손이 가는 편이 안전(수납·지출·sweep·계정과목·대사 전부 계좌에 의존).
 */

export type AccountCandidate = {
  key: string;        // 매칭 결과로 돌려줄 식별자 (create-dialog payAccountOpts.key)
  accountNo: string;  // 마스터 계좌번호 (대시 포함 가능: "140-014-381868")
  bankName?: string;  // 은행명 — 동일 은행 다계좌 구분·끝자리 오탐 방지용
};

export type AccountDetection = {
  key: string;
  matchedOn: 'full' | `tail:${string}`;  // 전체번호 일치 / 괄호 끝자리 일치
  digits: string;                          // 매칭된 마스터 계좌 숫자열 (디버그·테스트)
};

const onlyDigits = (s?: string): string => (s ?? '').replace(/\D+/g, '');

// 은행명 정규화 — 파일명/시트명/제목행에서 은행을 식별해 끝자리 매칭 시 다른 은행 오탐을 차단.
// 짧은 영문 토큰(kb/sc/nh)이 무관 문자열에 걸릴 위험은 한글 표기를 앞에 두어 완화하고,
// 애매하면 어차피 매칭 실패 → 수동으로 떨어지므로 안전하다.
const BANK_ALIASES: Array<[RegExp, string]> = [
  [/신한|shinhan/i, '신한'],
  [/국민|kb국민|\bkb\b/i, 'KB'],
  [/우리|woori/i, '우리'],
  [/하나|keb|외환/i, '하나'],
  [/농협|단위농협|축협|nonghyup|\bnh\b/i, '농협'],
  [/기업은행|기업|ibk/i, '기업'],
  [/새마을|mg새마을|saemaul/i, '새마을'],
  [/우체국|우정사업|post/i, '우체국'],
  [/카카오|kakao/i, '카카오뱅크'],
  [/토스|toss/i, '토스뱅크'],
  [/케이뱅크|k뱅크|kbank/i, '케이뱅크'],
  [/수협|suhyup/i, '수협'],
  [/부산은행|부산/i, '부산'],
  [/경남은행|경남/i, '경남'],
  [/대구은행|대구|dgb/i, '대구'],
  [/광주은행|광주/i, '광주'],
  [/전북은행|전북/i, '전북'],
  [/스탠다드|sc제일|\bsc\b/i, 'SC'],
  [/씨티|citi/i, '씨티'],
];

/** 텍스트에서 첫 은행명을 식별. 없으면 undefined. */
export function detectBankLabel(text?: string): string | undefined {
  const t = text ?? '';
  for (const [re, label] of BANK_ALIASES) if (re.test(t)) return label;
  return undefined;
}

/**
 * 텍스트에 등장하는 **모든** 은행명 집합. (우선순위 첫매칭이 아니라 전부 수집 —
 * 농협 명세서에 '신한' 이체메모가 섞여도 농협 후보를 배제하지 않도록.)
 */
export function detectBankLabels(text?: string): Set<string> {
  const t = text ?? '';
  const out = new Set<string>();
  for (const [re, label] of BANK_ALIASES) if (re.test(t)) out.add(label);
  return out;
}

/**
 * rawAoa 의 헤더행 위쪽(제목/예금주/계좌번호 밴드) 텍스트만 이어붙인다.
 * headerRow<=0 이면 위쪽 밴드가 없으므로 빈 문자열.
 */
export function titleBandText(rawAoa?: unknown[][], headerRow = 0): string {
  if (!Array.isArray(rawAoa) || headerRow <= 0) return '';
  return rawAoa
    .slice(0, headerRow)
    .flat()
    .map((c) => (c == null ? '' : String(c)))
    .join(' ');
}

/**
 * 시트명·파일명·제목행에서 계좌번호를 뽑아 후보 마스터 계좌와 매칭.
 * 유일하게 확신 가는 계좌 1개일 때만 반환, 아니면 null.
 */
export function detectUploadAccount(
  src: { sheetName?: string; fileName?: string; titleText?: string },
  candidates: AccountCandidate[],
): AccountDetection | null {
  const hay = [src.sheetName, src.fileName, src.titleText].filter(Boolean).join('  ');
  if (!hay.trim() || candidates.length === 0) return null;
  const banksInHay = detectBankLabels(hay);

  // (1) 전체 계좌번호: 대시형 3~4그룹(신한 XXX-XX-XXXXXX, 농협 XXX-XXXX-XXXX-XX) 또는 8자리+ 연속숫자.
  //     4그룹(농협 등 13자리)까지 잡아야 truncate 로 인한 미스매치 방지.
  const fullDigits = new Set(
    [...hay.matchAll(/\d{2,4}-\d{2,4}-\d{2,7}(?:-\d{2,4})?|\d{8,}/g)]
      .map((m) => onlyDigits(m[0]))
      .filter((d) => d.length >= 8),
  );
  // (2) 괄호 안 끝자리: "(신한1868)" → "1868". 오탐 방지:
  //     · 전화번호 그룹(010-…) 통째 제외  · 숫자 run 2개+ 그룹(전화/날짜/기간) 제외  · 4자리 연도 제외.
  const parenTails: string[] = [];
  for (const m of hay.matchAll(/\(([^)]{0,24})\)/g)) {
    const inner = m[1];
    if (/01[0-9][-.\s]?\d{3,4}[-.\s]?\d{4}/.test(inner)) continue; // 전화번호
    const runs = [...inner.matchAll(/\d{3,}/g)].map((d) => d[0]);
    if (runs.length !== 1) continue;                              // 애매(전화/날짜/기간 등)
    if (/^(19|20)\d\d$/.test(runs[0])) continue;                  // 연도
    parenTails.push(runs[0]);
  }

  const hits: AccountDetection[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const md = onlyDigits(c.accountNo);
    if (md.length < 4 || seen.has(c.key)) continue;
    // 전체 일치 (최고 신뢰)
    if (fullDigits.has(md)) {
      hits.push({ key: c.key, matchedOn: 'full', digits: md });
      seen.add(c.key);
      continue;
    }
    // 괄호 끝자리 suffix 일치 — 은행 문맥이 확인될 때만 채택(은행명 없는 괄호숫자 '(2026)' 등 오탐 차단).
    // 실제 은행 export 는 시트명/파일명에 은행명이 항상 있으므로 recall 손실 없음.
    const tail = parenTails.find((t) => t.length >= 4 && t.length < md.length && md.endsWith(t));
    if (tail) {
      if (banksInHay.size === 0) continue;
      const candBank = detectBankLabel(c.bankName);
      if (candBank && !banksInHay.has(candBank)) continue;
      hits.push({ key: c.key, matchedOn: `tail:${tail}`, digits: md });
      seen.add(c.key);
    }
  }

  if (hits.length === 0) return null;
  // 전체번호 일치가 정확히 1개면 최우선. 2개 이상이면 모순 → 수동.
  const fulls = hits.filter((h) => h.matchedOn === 'full');
  if (fulls.length === 1) return fulls[0];
  if (fulls.length > 1) return null;
  // 끝자리 매칭만 있을 땐 유일할 때만 채택.
  return hits.length === 1 ? hits[0] : null;
}
