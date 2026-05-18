/**
 * 범용 중복검증 엔진.
 *
 * 도메인 (과태료 / 계좌내역 / 자동이체 / 법인카드 등) 마다 같은 패턴 — 신규 batch 항목들을
 * 기존 항목들과 비교해 중복 식별 — 이 반복되므로 표준 시그니처로 한 번만 정의.
 *
 * 사용법:
 *   const result = dedupAgainst(newItems, existingItems, item => [
 *     item.notice_no,                       // 1순위 키
 *     `${item.car_number}|${item.date}`,    // 2순위 키 (튜플)
 *   ]);
 *   // result.unique     = 신규 추가 가능한 항목들
 *   // result.duplicates = 기존/배치 안에서 매칭된 항목들 (사유와 함께)
 *
 * 도메인 키는 도메인별 lib 에 정의 (e.g. lib/penalty-dedup.ts).
 */

export interface DuplicateInfo<T> {
  /** 중복으로 판정된 신규 항목 */
  item: T;
  /** 매칭된 키 (어떤 키로 중복 판정됐는지 — UI 표시용) */
  matchedKey: string;
  /** 매칭된 기존 항목 (없을 수 있음 — 같은 batch 안 자체 중복인 경우) */
  matchedExisting?: T;
  /** 매칭 출처: 기존 데이터 vs 같은 batch 안 자체 중복 */
  source: 'existing' | 'batch';
}

export interface DedupResult<T> {
  /** 중복 아닌 항목 — 추가 가능 */
  unique: T[];
  /** 중복 항목 + 매칭 정보 */
  duplicates: Array<DuplicateInfo<T>>;
}

/**
 * 키 추출 함수 — 한 항목에서 중복 판정에 쓸 키 1~N 개 반환.
 * 빈 문자열/undefined 키는 무시 (e.g. notice_no 없는 항목은 그 키 skip).
 * 키 우선순위는 배열 순서 — 앞쪽 키부터 시도하고 먼저 매칭되는 것 사용.
 */
export type KeyFn<T> = (item: T) => Array<string | undefined | null>;

/**
 * 새 batch 를 기존 데이터와 비교해서 중복 식별.
 * 효율: O(N + M), Map 기반 lookup. (N = newItems, M = existing)
 */
export function dedupAgainst<T>(
  newItems: T[],
  existing: T[],
  keyFn: KeyFn<T>,
): DedupResult<T> {
  const existingKeys = new Map<string, T>();
  for (const e of existing) {
    for (const k of keyFn(e)) {
      if (k) existingKeys.set(k, e);
    }
  }

  const unique: T[] = [];
  const duplicates: DuplicateInfo<T>[] = [];
  const seenInBatch = new Map<string, T>();

  for (const item of newItems) {
    const keys = keyFn(item);
    let matched: { key: string; existing?: T; source: 'existing' | 'batch' } | null = null;

    for (const k of keys) {
      if (!k) continue;
      const ex = existingKeys.get(k);
      if (ex) { matched = { key: k, existing: ex, source: 'existing' }; break; }
      const bt = seenInBatch.get(k);
      if (bt) { matched = { key: k, existing: bt, source: 'batch' }; break; }
    }

    if (matched) {
      duplicates.push({
        item,
        matchedKey: matched.key,
        matchedExisting: matched.existing,
        source: matched.source,
      });
    } else {
      unique.push(item);
      // 다음 batch 항목들이 이 항목과 중복인지 잡기 위해 모든 키를 batch map 에 등록
      for (const k of keys) {
        if (k) seenInBatch.set(k, item);
      }
    }
  }

  return { unique, duplicates };
}

/**
 * 단일 리스트 내 자체 중복만 검사 (기존 데이터 없음).
 * 사용 예: 한 번에 업로드한 N 개 파일 안에 중복 있는지.
 */
export function dedupSelf<T>(items: T[], keyFn: KeyFn<T>): DedupResult<T> {
  return dedupAgainst(items, [], keyFn);
}

/**
 * 한 항목이 기존 리스트와 중복인지만 빠르게 체크 (boolean).
 * 키 추출 비용이 큰 경우는 기존 리스트의 keys map 을 외부에서 캐싱해서 buildKeyIndex 사용 권장.
 */
export function isDuplicate<T>(item: T, existing: T[], keyFn: KeyFn<T>): DuplicateInfo<T> | null {
  const idx = buildKeyIndex(existing, keyFn);
  return matchAgainstIndex(item, idx, keyFn);
}

/**
 * 같은 기존 리스트에 대해 여러 번 중복 검사할 때 효율을 위한 사전 인덱스.
 *   const idx = buildKeyIndex(existing, keyFn);
 *   for (const newItem of stream) {
 *     const dup = matchAgainstIndex(newItem, idx, keyFn);
 *     if (dup) { ... }
 *   }
 */
export function buildKeyIndex<T>(items: T[], keyFn: KeyFn<T>): Map<string, T> {
  const m = new Map<string, T>();
  for (const item of items) {
    for (const k of keyFn(item)) {
      if (k) m.set(k, item);
    }
  }
  return m;
}

export function matchAgainstIndex<T>(
  item: T,
  index: Map<string, T>,
  keyFn: KeyFn<T>,
): DuplicateInfo<T> | null {
  for (const k of keyFn(item)) {
    if (!k) continue;
    const ex = index.get(k);
    if (ex) return { item, matchedKey: k, matchedExisting: ex, source: 'existing' };
  }
  return null;
}
