/**
 * 시뮬 — 자금일보 파서. 계좌별/계정과목별 집계 + 자금이동(sweep) 제외.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx-js-style';
import { parseSwitchplanJbo } from '@/lib/migrate/switchplan-jbo';

function buildJbo(): ArrayBuffer {
  const header = ['거래월', '거래일', '거래일시', '적요', '입금액', '출금액', '내용', '잔액', '거래점', '계정과목', '차량번호', '임차인', '세부차종', '비고', '구분'];
  const op = [
    ['▶운영계좌(1868)'],
    header,
    ['1', '2', '2026.01.02 09:43:59', 'BZ뱅크', 2770000, 0, '6166에서868', 2770000, '가양역', '자금이동', '', '', '', '', ''],
    ['1', '3', '2026.01.03 10:00:00', '출금', 0, 500000, '수수료', 0, '', '이체수수료', '', '', '', '', ''],
  ];
  const biz = [
    ['▶영업계좌(6616)'],
    header,
    ['1', '1', '2026.01.01 20:40:02', 'FB이체', 200000, 0, '백민정', 200000, '판교', '대여료', '120라5445', '백민정', '레이', '', ''],
    ['1', '5', '2026.01.05 11:00:00', 'FB이체', 360000, 0, '김철수', 560000, '', '대여료', '11가1111', '김철수', '아반떼', '', ''],
  ];
  const carData = [['차량 데이터'], ['plate'], ['11가1111']]; // skip 대상

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(op), '운영계좌(신한1868)');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(biz), '영업계좌(신한6616)');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(carData), '차량 데이터');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('switchplan jbo parser', () => {
  const res = parseSwitchplanJbo(buildJbo());

  it('계좌 시트만 파싱 (차량데이터 skip)', () => {
    expect(res.totals.count).toBe(4);
    expect(res.totals.accounts).toBe(2);
    expect(res.totals.subjects).toBe(3); // 자금이동/이체수수료/대여료
  });

  it('자금이동(sweep) 제외 실입금', () => {
    expect(res.totals.deposit).toBe(3330000);
    expect(res.totals.sweepDeposit).toBe(2770000);
    expect(res.totals.realDeposit).toBe(560000);
    expect(res.totals.realWithdraw).toBe(500000); // 이체수수료
  });

  it('계정과목별 집계 — 대여료 2건 56만', () => {
    const rent = res.bySubject.find((s) => s.subject === '대여료')!;
    expect(rent.deposit).toBe(560000);
    expect(rent.count).toBe(2);
  });

  it('거래일시 → 날짜 범위', () => {
    expect(res.totals.dateFrom).toBe('2026-01-01');
    expect(res.totals.dateTo).toBe('2026-01-05');
  });
});
