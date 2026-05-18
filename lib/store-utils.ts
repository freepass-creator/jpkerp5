/**
 * RTDB store 공용 유틸 — 모든 use-*-store 가 사용.
 *
 *  · stripUndef — RTDB 가 undefined 거부, 재귀 strip
 *  · asArray    — RTDB 가 sparse 배열을 object 로 저장하는 케이스 정규화
 */

/** 객체에서 undefined 값 재귀 제거 (RTDB write 직전). */
export function stripUndef<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripUndef) as unknown as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val !== undefined) out[k] = stripUndef(val);
    }
    return out as T;
  }
  return v;
}

/**
 * RTDB 의 array-or-object 노드 값을 배열로 정규화.
 * RTDB 는 인덱스 sparse 배열을 object 로 변환해 저장 (예: index 0,1,3 → {0:.., 1:.., 3:..}).
 * null/undefined/원시값은 빈 배열.
 */
export function asArray<T>(val: unknown): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter((x): x is T => x != null && typeof x === 'object');
  if (typeof val === 'object') return Object.values(val as Record<string, T>);
  return [];
}
