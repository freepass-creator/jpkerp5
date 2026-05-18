/**
 * Concurrency-limited parallel runner.
 * 워커 N개가 큐를 소비하는 패턴 — Promise.all과 달리 한번에 N개 이상 돌지 않음.
 * Gemini OCR 같이 외부 API rate limit이 있는 작업에 사용.
 */
export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let next = 0;
  const total = items.length;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= total) return;
      await fn(items[i], i);
    }
  };
  const n = Math.min(limit, total);
  await Promise.all(Array.from({ length: n }, worker));
}
