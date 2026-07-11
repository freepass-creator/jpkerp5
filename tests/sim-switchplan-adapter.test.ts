/**
 * 시뮬 — 스위치플랜 사업현황 원본(가로 다중시트) → SNAPSHOT 씨앗 어댑터.
 * 합성 워크북을 만들어 파싱하고, 미수 3정의(carry/gross/pastDue)가 의도대로 나오는지 검증.
 * 핵심 불변식:
 *   - 정상 계약: carry = gross = pastDue.
 *   - 묶음결제(2개월치 한번에): per-월 pastDue는 과대, carry/gross는 정상 → 발산 증명.
 *   - 공백 코드명 행(중복/스필오버 아티팩트)은 제외.
 *   - 씨앗 Row의 현재미수 = carryUnpaid.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx-js-style';
import { parseSwitchplanWorkbook, toSnapshotRows } from '@/lib/migrate/switchplan';

function buildWorkbook(): ArrayBuffer {
  // ── 채권(운행중): R0=월라벨, R1=필드헤더, 데이터 R2+ ──
  const chaekwonHeader = [
    'NO', '소속', '코드명', '보증금', '대여료', '분납여부', '보증금이체일', '결제일', '최초등록일', '차량번호', '시작', '종료',
    '청구금액', '결제금액', '결제일자', '결제수단', '미납금액',
    '청구금액', '결제금액', '결제일자', '결제수단', '미납금액',
    '청구금액', '결제금액', '결제일자', '결제수단', '미납금액',
  ];
  const chaekwonMonthRow: (string | number)[] = new Array(chaekwonHeader.length).fill('');
  chaekwonMonthRow[14] = '26년 7월'; // block0 결제일자 위치
  chaekwonMonthRow[19] = '26년 6월'; // block1
  chaekwonMonthRow[24] = '26년 5월'; // block2

  // A: 정상(7월 미납 1회차) — carry=gross=pastDue=500,000
  const rowA = [
    1, '본사', '김철수', 0, 500000, '무보증', '', '10일', '2025-01-10', '11가1111', '2025-01-10', '2027-01-09',
    500000, 0, '', '', 500000,
    500000, 500000, '2026-06-10', '자동', 0,
    500000, 500000, '2026-05-10', '자동', 0,
  ];
  // B: 묶음결제(6월에 2개월치 100만) — gross=0, carry=0, pastDue=500,000(과대), 과오납 플래그
  const rowB = [
    2, '본사', '박영수', 0, 500000, '무보증', '', '10일', '2025-02-10', '22나2222', '2025-02-10', '2027-02-09',
    0, 0, '', '', 0,
    500000, 1000000, '2026-06-10', '자동', 0,
    500000, 0, '', '', 500000,
  ];
  // 공백 코드명 아티팩트 — 제외돼야 함
  const rowBlank = [
    3, '', '', '', '', '', '', '', '', '33가3333', '', '',
    500000, 0, '', '', 500000,
    0, 0, '', '', 0,
    0, 0, '', '', 0,
  ];
  const chaekwon = [chaekwonMonthRow, chaekwonHeader, rowA, rowB, rowBlank];

  // ── 반납(종료): R0=필드헤더(월라벨 없음), 데이터 R1+ ──
  const banapHeader = [
    'NO', '소속', '코드명', '보증금', '대여료', '분납여부', '보증금이체일', '결제일', '', '차량번호', '시작', '종료',
    '청구금액', '결제금액', '결제일자', '결제수단', '미납금액',
    '청구금액', '결제금액', '결제일자', '결제수단', '미납금액',
  ];
  // C: 종료·완납 — carry=gross=pastDue=0
  const rowC = [
    '', 'LC', '이영희', 0, 400000, '무보증', '', '30일', '', '44라4444', '2024-06-30', '2025-06-29',
    400000, 400000, '2025-05-30', '입금', 0,
    400000, 400000, '2025-04-30', '입금', 0,
  ];
  const banap = [banapHeader, rowC];

  // ── 고객(기준) ──
  const gogaek = [
    ['NO', '계약번호', '대여처', '코드명', '차량번호', '최초등록일', '구분', '주민/법인번호', '주소지(대표자개인)', '본인연락처'],
    [1, '', '', '김철수', '11가1111', '', '개인', '900101-1234567', '', '010-1111-1111'],
    [2, '', '', '박영수', '22나2222', '', '개인', '880202-1234567', '', '010-2222-2222'],
  ];

  // ── 자산 ──
  const jasan = [
    [' ', '구분', '차량번호', '등록지', '취득일', '최초등록일', '차령만료일', '차대번호', '제조사', '모델', '세부모델'],
    [1, '구독', '11가1111', '김포', '', '', '', 'VIN1', '현대', '아반떼', '아반떼 AD'],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(chaekwon), '채권');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(banap), '반납');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(gogaek), '고객(기준)');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(jasan), '자산');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return out as ArrayBuffer;
}

describe('switchplan adapter', () => {
  const res = parseSwitchplanWorkbook(buildWorkbook(), '2026-07-15');

  it('공백 코드명 행 제외 + 시트 분리', () => {
    expect(res.current.length).toBe(2);   // A, B (blank 제외)
    expect(res.returned.length).toBe(1);  // C
  });

  it('정상 계약 A: carry=gross=pastDue', () => {
    const a = res.current.find((c) => c.customerName === '김철수')!;
    expect(a.carryUnpaid).toBe(500000);
    expect(a.grossUnpaid).toBe(500000);
    expect(a.pastDueUnpaid).toBe(500000);
    expect(a.hasOverpay).toBe(false);
    expect(a.customerIdentNo).toBe('900101-1234567'); // 고객 조인
    expect(a.vehicleModel).toBe('현대 아반떼 아반떼 AD'); // 자산 조인
  });

  it('묶음결제 B: carry/gross 정상, pastDue 과대 발산', () => {
    const b = res.current.find((c) => c.customerName === '박영수')!;
    expect(b.carryUnpaid).toBe(0);
    expect(b.grossUnpaid).toBe(0);
    expect(b.pastDueUnpaid).toBe(500000); // per-월 클램프 과대
    expect(b.hasOverpay).toBe(true);
  });

  it('종료·완납 C: 잔여 0', () => {
    const c = res.returned.find((x) => x.customerName === '이영희')!;
    expect(c.carryUnpaid).toBe(0);
    expect(c.grossUnpaid).toBe(0);
  });

  it('합계: carry(₩50만)와 pastDue(₩100만)가 갈린다 — 검토대상 발생', () => {
    expect(res.totals.carryCurrent).toBe(500000);
    expect(res.totals.grossCurrent).toBe(500000);
    expect(res.totals.pastDueCurrent).toBe(1000000);
    expect(res.totals.overpayCount).toBe(1);
  });

  it('SNAPSHOT 씨앗 Row: 현재미수 = carryUnpaid', () => {
    const rows = toSnapshotRows(res, '스위치플랜');
    expect(rows.length).toBe(2);
    const a = rows.find((r) => r['계약자'] === '김철수')!;
    expect(a['현재미수']).toBe(500000);
    expect(a['차량번호']).toBe('11가1111');
    expect(a['등록번호']).toBe('900101-1234567');
    expect(a['회사']).toBe('스위치플랜');
  });
});
