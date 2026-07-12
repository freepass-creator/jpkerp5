/**
 * 시뮬 — 현재 미수 검증(채권 ↔ CMS).
 * 허수 미수: 그 달 CMS가 걷혔는데 채권은 미납 → 직원 수납누락 적발.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx-js-style';
import { parseSwitchplanWorkbook } from '@/lib/migrate/switchplan';
import { parseSwitchplanCms } from '@/lib/migrate/switchplan-cms';
import { verifyMisuVsCms } from '@/lib/migrate/switchplan-verify';

function bizBuf(): ArrayBuffer {
  const r1 = ['NO', '소속', '코드명', '보증금', '대여료', '분납여부', '보증금이체일', '결제일', '최초등록일', '차량번호', '시작', '종료', '청구금액', '결제금액', '결제일자', '결제수단', '미납금액'];
  const r0: (string | number)[] = new Array(r1.length).fill('');
  r0[14] = '26년 6월';
  // A: 6월 청구 50만 결제 0 → 미납 (그런데 CMS는 6월 걷힘 → 허수)
  const rowA = [1, '본사', '김철수', 0, 500000, '무보증', '', '10일', '2025-01-10', '11가1111', '2025-01-10', '2028-01-09', 500000, 0, '', '', 500000];
  // B: 6월 청구 30만 결제 30만 (완납) → 정상
  const rowB = [2, '본사', '박영수', 0, 300000, '무보증', '', '10일', '2025-06-05', '22나2222', '2025-06-05', '2028-06-04', 300000, 300000, '2026-06-10', '자동', 0];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([r0, r1, rowA, rowB]), '채권');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

function cmsBuf(): ArrayBuffer {
  const h = ['NO.', '회원번호', '회원명', '청구월', '결제상태', '결제수단', '정산일', '결제일', '수납금액', '미납금액', '부가세', '비고'];
  const rows = [
    h,
    [1, '000', '11가1111 김철수', '2026/06', '완납', 'CMS', '2026-06-10', '2026-06-10', 500000, 0, 50000, ''], // 걷힘 → 채권 미납이면 허수
    [2, '001', '22나2222 박영수', '2026/06', '완납', 'CMS', '2026-06-10', '2026-06-10', 300000, 0, 30000, ''], // 걷힘·채권도 완납 → 정상
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('switchplan misu verify', () => {
  const biz = parseSwitchplanWorkbook(bizBuf(), '2026-07-11');
  const cms = parseSwitchplanCms(cmsBuf());
  const r = verifyMisuVsCms(biz, cms, '2026-07-11', 6);

  it('허수 미수 적발 — CMS 걷혔는데 채권 미납', () => {
    expect(r.summary.falseMisuCount).toBe(1);
    expect(r.summary.falseMisuAmount).toBe(500000);
    const a = r.rows.find((x) => x.plate === '11가1111')!;
    expect(a.verdict).toBe('허수의심');
    expect(a.falseMisu).toBe(500000);
    expect(a.staffMisu).toBe(500000); // 채권 미수 = 전액 허수
  });

  it('정상 — CMS 걷히고 채권도 완납', () => {
    const b = r.rows.find((x) => x.plate === '22나2222')!;
    expect(b.verdict).toBe('정상');
    expect(b.falseMisu).toBe(0);
  });
});
