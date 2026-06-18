'use client';

/**
 * 회사명 표시 셀 — 비어있으면 빨강 경고 뱃지 '회사 미입력'.
 *
 *  <td><CompanyCell raw={c.company} master={companyMaster} /></td>
 *
 * raw 가 빈 문자열 또는 master 에서 매칭 안 됨 → '회사 미입력' 빨강 표시 (운영자 즉시 인지).
 * raw 매칭됨 → 회사명 normal 표시.
 *
 * 정책: 회사 없는 계약은 결제/매출/세금/감사 모두 영향 → 화면에서 항상 부각해야 함.
 */

import type { Company } from '@/lib/types';
import { displayCompanyName } from '@/lib/company-display';

export function CompanyCell({
  raw, master, fallbackBizRegNo, fallbackCorpRegNo, mono = false,
}: {
  raw: string | undefined;
  master: Company[] | undefined;
  fallbackBizRegNo?: string;
  fallbackCorpRegNo?: string;
  mono?: boolean;
}) {
  const name = displayCompanyName(raw, master ?? [], fallbackBizRegNo, fallbackCorpRegNo);
  if (!name) {
    return (
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 10, fontWeight: 600,
          padding: '2px 6px', borderRadius: 4,
          background: 'var(--red-bg)', color: 'var(--red-text)',
          border: '1px solid var(--red-text)',
          lineHeight: 1.2,
        }}
        title="이 계약에 회사가 입력되지 않았습니다 — 매출·세금·감사 분류 누락. 즉시 입력 필요."
      >
        회사 미입력
      </span>
    );
  }
  return <span className={mono ? 'mono' : undefined}>{name}</span>;
}
