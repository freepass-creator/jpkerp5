'use client';

/**
 * 업로드 결과 패널 — 모든 업로드(계좌·자동이체·카드·계약·자산)에 공용.
 *
 * 사용:
 *   <UploadResultPanel result={uploadResult} />
 *
 * 표시:
 *   · 요약 카드 (신규/매칭/미매칭/중복/오류 건수)
 *   · row별 상태 표 (직원이 미매칭·오류 row 즉시 확인)
 *
 * 규격 통일 — 업로드 종류 무관하게 동일 톤.
 */

import type { UploadResult, UploadRowStatus } from '@/lib/upload-result';

const STATUS_LABEL: Record<UploadRowStatus, string> = {
  new: '신규',
  duplicate: '중복',
  matched: '매칭',
  unmatched: '미매칭',
  error: '오류',
};

const STATUS_COLOR: Record<UploadRowStatus, { bg: string; text: string }> = {
  new: { bg: 'var(--blue-bg, #dbeafe)', text: 'var(--blue-text, #1e40af)' },
  matched: { bg: 'var(--green-bg, #dcfce7)', text: 'var(--green-text, #15803d)' },
  unmatched: { bg: 'var(--orange-bg, #ffedd5)', text: 'var(--orange-text, #c2410c)' },
  duplicate: { bg: '#f4f4f5', text: '#71717a' },
  error: { bg: 'var(--red-bg, #fee2e2)', text: 'var(--red-text, #b91c1c)' },
};

export function UploadResultPanel({ result }: { result: UploadResult }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 요약 카드 5개 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
        <SummaryCard label="총건" value={result.newCount + result.matchedCount + result.unmatchedCount} tone="brand" />
        <SummaryCard label="매칭" value={result.matchedCount} tone="green" />
        <SummaryCard label="미매칭" value={result.unmatchedCount} tone="orange" />
        <SummaryCard label="중복" value={result.duplicateCount} tone="gray" />
        <SummaryCard label="오류" value={result.errorCount} tone="red" />
      </div>

      {/* row별 상태 표 (미매칭·오류 우선) */}
      {result.rows.length > 0 && (
        <table className="table" style={{ fontSize: 11 }}>
          <thead>
            <tr>
              <th className="num" style={{ width: 50 }}>#</th>
              <th>내용</th>
              <th style={{ width: 80 }}>상태</th>
              <th>메모</th>
            </tr>
          </thead>
          <tbody>
            {result.rows
              .slice()
              .sort((a, b) => {
                // 오류·미매칭·중복·매칭·신규 순
                const order: Record<UploadRowStatus, number> = { error: 0, unmatched: 1, duplicate: 2, matched: 3, new: 4 };
                return order[a.status] - order[b.status];
              })
              .slice(0, 50)
              .map((row, i) => {
                const c = STATUS_COLOR[row.status];
                return (
                  <tr key={i}>
                    <td className="num mono dim">{row.rowIndex + 1}</td>
                    <td>{row.label}</td>
                    <td>
                      <span style={{
                        padding: '1px 6px', borderRadius: 'var(--radius-sm)', fontSize: 10, fontWeight: 600,
                        background: c.bg, color: c.text, border: `1px solid ${c.text}`,
                      }}>{STATUS_LABEL[row.status]}</span>
                    </td>
                    <td className="dim" style={{ fontSize: 10 }}>{row.message ?? '-'}</td>
                  </tr>
                );
              })}
            {result.rows.length > 50 && (
              <tr>
                <td colSpan={4} className="muted center" style={{ padding: 8, fontSize: 11 }}>
                  ... 이하 {result.rows.length - 50}건 (상위 50건만 표시)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: 'brand' | 'green' | 'orange' | 'gray' | 'red' }) {
  const palette: Record<typeof tone, { bg: string; text: string }> = {
    brand: { bg: 'var(--brand-bg, #eef2ff)', text: 'var(--brand, #4338ca)' },
    green: { bg: 'var(--green-bg, #dcfce7)', text: 'var(--green-text, #15803d)' },
    orange: { bg: 'var(--orange-bg, #ffedd5)', text: 'var(--orange-text, #c2410c)' },
    gray: { bg: '#f4f4f5', text: '#71717a' },
    red: { bg: 'var(--red-bg, #fee2e2)', text: 'var(--red-text, #b91c1c)' },
  };
  const c = palette[tone];
  return (
    <div style={{
      padding: '8px 10px', borderRadius: 'var(--radius)',
      background: c.bg, color: c.text,
      textAlign: 'center', fontSize: 11, fontWeight: 600,
    }}>
      <div>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}
