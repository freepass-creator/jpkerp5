/**
 * 시뮬 — 채권 ↔ 계좌·CMS 대사.
 * 핵심: 직접 대여료(차량태깅)는 계약별 매칭, CMS집금은 라벨 있으면 채널집계·없으면 미귀속(뭉텅이).
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx-js-style';
import { parseSwitchplanWorkbook } from '@/lib/migrate/switchplan';
import { parseSwitchplanJbo } from '@/lib/migrate/switchplan-jbo';
import { reconcileSwitchplan } from '@/lib/migrate/switchplan-recon';

function bizBuf(): ArrayBuffer {
  const r1 = ['NO', '소속', '코드명', '보증금', '대여료', '분납여부', '보증금이체일', '결제일', '최초등록일', '차량번호', '시작', '종료', '청구금액', '결제금액', '결제일자', '결제수단', '미납금액', '청구금액', '결제금액', '결제일자', '결제수단', '미납금액'];
  const r0: (string | number)[] = new Array(r1.length).fill('');
  r0[14] = '26년 2월'; r0[19] = '26년 1월';
  const row11 = [1, '본사', '김철수', 0, 500000, '무보증', '', '10일', '2025-01-10', '11가1111', '2025-01-10', '2027-01-09', 500000, 500000, '2026-02-10', '자동', 0, 500000, 500000, '2026-01-10', '자동', 0];
  const row22 = [2, '본사', '박영수', 0, 300000, '무보증', '', '5일', '2025-06-05', '22나2222', '2025-06-05', '2027-06-04', 0, 0, '', '', 0, 300000, 300000, '2026-01-05', '자동', 0];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([r0, r1, row11, row22]), '채권');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

function jboBuf(): ArrayBuffer {
  const h = ['거래월', '거래일', '거래일시', '적요', '입금액', '출금액', '내용', '잔액', '거래점', '계정과목', '차량번호', '임차인', '세부차종', '비고', '구분'];
  const op = [
    ['▶영업'], h,
    ['1', '10', '2026.01.10 10:00:00', '이체', 500000, 0, '김철수', 500000, '', '대여료', '11가1111', '김철수', '아반떼', '', ''],
    ['2', '15', '2026.02.15 10:00:00', 'CMS', 500000, 0, '집금', 0, '', 'CMS집금', '', '', '', '', ''],       // 라벨없음
    ['1', '5', '2026.01.05 09:00:00', 'CMS', 300000, 0, '집금', 0, '', 'CMS집금', '22나2222', '박영수', 'K5', '', ''], // 라벨있음
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(op), '영업계좌(신한6616)');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('switchplan recon', () => {
  const biz = parseSwitchplanWorkbook(bizBuf(), '2026-07-11');
  const jbo = parseSwitchplanJbo(jboBuf());
  const r = reconcileSwitchplan(biz, jbo);

  it('기간 = 자금일보 커버 기간', () => {
    expect(r.period.from).toBe('2026-01');
    expect(r.period.to).toBe('2026-02');
  });

  it('라벨없는 CMS집금은 미귀속(뭉텅이)', () => {
    expect(r.unmatchedReceiptNoPlate).toBe(500000);
    expect(r.totals.cms).toBe(300000); // 라벨있는 것만 채널집계
    expect(r.totals.rent).toBe(500000);
  });

  it('직접 대여료 계약: 채권>계좌 (나머지는 CMS 뭉텅이)', () => {
    const row = r.rows.find((x) => x.plate === '11가1111')!;
    expect(row.bizPaid).toBe(1000000);   // 1·2월 결제
    expect(row.rent).toBe(500000);       // 직접 대여료만 태깅
    expect(row.jboTotal).toBe(500000);
    expect(row.diff).toBe(500000);
    expect(row.status).toBe('채권>계좌');
  });

  it('라벨있는 CMS 계약: 일치', () => {
    const row = r.rows.find((x) => x.plate === '22나2222')!;
    expect(row.bizPaid).toBe(300000);
    expect(row.cms).toBe(300000);
    expect(row.diff).toBe(0);
    expect(row.status).toBe('일치');
  });
});
