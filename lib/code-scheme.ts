/**
 * 코드체계 SSOT (#쓰기경로 v6정합) — 랜덤 대신 순번·불변·회사 prefix 자연키.
 *
 * v6 문서ID = `${companyId}__${자연키}` 기반이라 코드가 순번·유일·안정이어야 이관이 1:1.
 * 데이터 재입력 전제 → 생성기만 바꾸면 됨(백필 불필요).
 *
 *   회사코드   : CP01, CP02 …            (시스템 순번, 불변·재발급 X)
 *   자산코드   : CP02VH0001              (회사 scope 순번)
 *   계약번호   : CP01-2607-0001          (회사·월 scope 순번, 표시·PK)
 */

const pad = (n: number, w: number) => String(n).padStart(w, '0');

/** 회사 코드 — CP01, CP02 … (기존 최대 순번 +1). */
export function nextCompanyCode(companies: ReadonlyArray<{ code?: string }>): string {
  let max = 0;
  for (const c of companies) {
    const m = /^CP(\d{2,})$/.exec((c.code ?? '').trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `CP${pad(max + 1, 2)}`;
}

/** 자산코드 — {회사}VH{순번4}. 예: CP02VH0001. 회사 scope 순번(+offset 로 배치 지원). */
export function nextAssetCode(
  companyCode: string,
  vehicles: ReadonlyArray<{ assetCode?: string }>,
  offset = 0,
): string {
  const prefix = `${companyCode}VH`;
  const re = new RegExp(`^${companyCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}VH(\\d+)$`);
  let max = 0;
  for (const v of vehicles) {
    const m = re.exec((v.assetCode ?? '').trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}${pad(max + 1 + offset, 4)}`;
}

/** 계약번호 — {회사}-{YYMM}-{순번4}. 예: CP01-2607-0001. 회사·월 scope 순번(+offset 로 배치 지원). */
export function nextContractNo(
  companyCode: string,
  contracts: ReadonlyArray<{ contractNo?: string }>,
  yymm: string,
  offset = 0,
): string {
  const prefix = `${companyCode}-${yymm}-`;
  let max = 0;
  for (const c of contracts) {
    const no = (c.contractNo ?? '').trim();
    if (no.startsWith(prefix)) {
      const n = parseInt(no.slice(prefix.length), 10);
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }
  return `${prefix}${pad(max + 1 + offset, 4)}`;
}

/** YYYY-MM-DD → YYMM (계약번호용). */
export function yymmOf(dateIso: string): string {
  return (dateIso ?? '').slice(2, 7).replace('-', '');
}

/**
 * 배치 계약들에 회사·월 scope 순번 계약번호 재할당 (기존 + 배치 내 누적 offset).
 * import/일괄생성이 Math.random 충돌위험 대신 순번을 갖게 함. company 이름→code resolve.
 */
export function assignContractNos<T extends { company?: string; contractDate?: string }>(
  batch: T[],
  existing: ReadonlyArray<{ contractNo?: string }>,
  companies: ReadonlyArray<{ code?: string; name?: string }>,
): (T & { contractNo: string })[] {
  const codeOf = (co?: string) => companies.find((x) => x.code === co || x.name === co)?.code ?? co ?? 'CP00';
  const counts = new Map<string, number>();
  return batch.map((c) => {
    const cc = codeOf(c.company);
    const yymm = yymmOf(c.contractDate ?? '');
    const key = `${cc}|${yymm}`;
    const offset = counts.get(key) ?? 0;
    counts.set(key, offset + 1);
    return { ...c, contractNo: nextContractNo(cc, existing, yymm, offset) };
  });
}
