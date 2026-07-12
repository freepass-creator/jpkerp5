/**
 * 시뮬 — 채권 ↔ 계좌·CMS 대사.
 * 모델: 직접채널(대여료 등, 차량태깅)은 계약별 귀속. CMS집금·카드집금은 은행에 뭉텅이 →
 * CMS 정산내역(회원명에 차량번호)으로만 계약별 배분.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx-js-style';
import { parseSwitchplanWorkbook } from '@/lib/migrate/switchplan';
import { parseSwitchplanJbo } from '@/lib/migrate/switchplan-jbo';
import { parseSwitchplanCms } from '@/lib/migrate/switchplan-cms';
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
    ['1', '10', '2026.01.10 10:00:00', '이체', 500000, 0, '김철수', 500000, '', '대여료', '11가1111', '김철수', '아반떼', '', ''],   // 직접 대여료
    ['1', '15', '2026.01.15 10:00:00', 'CMS', 300000, 0, '집금', 0, '', 'CMS집금', '', '', '', '', ''],                          // CMS 뭉텅이(라벨없음)
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(op), '영업계좌(신한6616)');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

function cmsBuf(): ArrayBuffer {
  const h = ['NO.', '회원번호', '회원명', '청구월', '결제상태', '결제수단', '정산일', '결제일', '수납금액', '미납금액', '부가세', '비고'];
  const rows = [
    h,
    [1, '000', '22나2222 박영수', '2026/01', '완납', 'CMS', '2026-01-15', '2026-01-15', 300000, 0, 30000, ''],
    [2, '001', '99하9999 실패맨', '2026/01', '결제실패', 'CMS', '2026-01-15', '2026-01-15', 0, 500000, 0, '잔액부족'],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('switchplan recon + CMS', () => {
  const biz = parseSwitchplanWorkbook(bizBuf(), '2026-07-11');
  const jbo = parseSwitchplanJbo(jboBuf());
  const cms = parseSwitchplanCms(cmsBuf());

  it('CMS 파서 — 성공/실패 + 차량태깅', () => {
    expect(cms.totals.count).toBe(2);
    expect(cms.totals.withPlate).toBe(2);
    expect(cms.totals.collected).toBe(300000);
    expect(cms.totals.failCount).toBe(1);
  });

  it('CMS 없이 — CMS집금은 뭉텅이(계좌), 22나2222는 채권만', () => {
    const r = reconcileSwitchplan(biz, jbo);
    expect(r.totals.cmsLumpBank).toBe(300000);
    expect(r.hasCms).toBe(false);
    const row22 = r.rows.find((x) => x.plate === '22나2222')!;
    expect(row22.status).toBe('채권만');       // 계좌 직접입금 없음(뭉텅이라 미귀속)
    expect(row22.cms).toBe(0);
  });

  it('CMS 배분 — 22나2222 뭉텅이가 계약에 붙어 일치', () => {
    const r = reconcileSwitchplan(biz, jbo, cms);
    expect(r.hasCms).toBe(true);
    expect(r.totals.cmsAllocated).toBe(300000);
    expect(r.totals.cmsLumpBank).toBe(300000); // 교차검증: 배분 = 뭉텅이
    const row22 = r.rows.find((x) => x.plate === '22나2222')!;
    expect(row22.cms).toBe(300000);
    expect(row22.status).toBe('일치');
  });

  it('직접 대여료 계약(11가1111)은 CMS 무관하게 매칭', () => {
    const r = reconcileSwitchplan(biz, jbo, cms);
    const row11 = r.rows.find((x) => x.plate === '11가1111')!;
    expect(row11.rent).toBe(500000);
    expect(row11.bizPaid).toBe(500000); // 기간=자금일보 커버(1월)만
    expect(row11.status).toBe('일치');
  });
});
