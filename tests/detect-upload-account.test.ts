/**
 * 업로드 계좌 자동감지 — 시트명/제목행/파일명 → 마스터 계좌 매칭.
 * 정밀 우선: 확신 유일매칭만 채택, 애매하면 null(수동 유지).
 */
import { describe, it, expect } from 'vitest';
import { detectUploadAccount, detectBankLabel, detectBankLabels, titleBandText, type AccountCandidate } from '@/lib/detect-upload-account';

// 스위치플랜 실제 시트 꼬리(1868/6616/3781/5311) 반영한 마스터 후보
const CAND: AccountCandidate[] = [
  { key: 'co1::140-014-381868', accountNo: '140-014-381868', bankName: '신한' }, // 끝 1868
  { key: 'co1::140-014-386616', accountNo: '140-014-386616', bankName: '신한' }, // 끝 6616
  { key: 'co1::302-1234-3781',  accountNo: '302-1234-3781',  bankName: '농협' }, // 끝 3781
  { key: 'co1::302-5678-5311',  accountNo: '302-5678-5311',  bankName: '농협' }, // 끝 5311
];

describe('detectUploadAccount — 시트명 끝자리', () => {
  it('영업계좌(신한6616) → 신한 6616 유일 매칭', () => {
    const d = detectUploadAccount({ sheetName: '영업계좌(신한6616)' }, CAND);
    expect(d?.key).toBe('co1::140-014-386616');
    expect(d?.matchedOn).toBe('tail:6616');
  });

  it('운영계좌(신한1868) → 신한 1868 매칭', () => {
    expect(detectUploadAccount({ sheetName: '운영계좌(신한1868)' }, CAND)?.key).toBe('co1::140-014-381868');
  });

  it('운영계좌(농협3781) → 농협 3781 매칭', () => {
    expect(detectUploadAccount({ sheetName: '운영계좌(농협3781)' }, CAND)?.key).toBe('co1::302-1234-3781');
  });
});

describe('detectUploadAccount — 전체 계좌번호(제목행/파일명)', () => {
  it('제목행 대시형 전체번호 → full 매칭 (거래기간 연도 노이즈 무시)', () => {
    const d = detectUploadAccount(
      { titleText: '예금주 홍길동  신한은행 140-014-381868  거래기간 2026.01.01 ~ 2026.06.30' },
      CAND,
    );
    expect(d?.key).toBe('co1::140-014-381868');
    expect(d?.matchedOn).toBe('full');
  });

  it('파일명에 대시형 전체번호 → full 매칭', () => {
    expect(detectUploadAccount({ fileName: '2026_영업_140-014-386616.xlsx' }, CAND)?.matchedOn).toBe('full');
  });
});

describe('detectUploadAccount — 은행 구분·애매성', () => {
  it('끝자리 충돌: 다른 은행 6616 이 있어도 시트의 은행명(신한)으로 좁힘', () => {
    const cand = [...CAND, { key: 'co1::302-9999-6616', accountNo: '302-9999-6616', bankName: '농협' }];
    expect(detectUploadAccount({ sheetName: '영업계좌(신한6616)' }, cand)?.key).toBe('co1::140-014-386616');
  });

  it('끝자리 충돌 + 후보 은행명 미상 → 애매 → null(수동)', () => {
    const cand: AccountCandidate[] = [
      { key: 'a', accountNo: '140-014-386616' },      // 은행명 없음
      { key: 'b', accountNo: '302-9999-6616' },      // 은행명 없음
    ];
    expect(detectUploadAccount({ sheetName: '(6616)' }, cand)).toBeNull();
  });

  it('은행 문맥 없는 괄호숫자((6616)) → 끝자리 매칭 안 함 → null', () => {
    const cand: AccountCandidate[] = [{ key: 'only', accountNo: '140-014-386616', bankName: '신한' }];
    expect(detectUploadAccount({ sheetName: '거래내역(6616)' }, cand)).toBeNull();
    // 은행명이 들어오면 매칭
    expect(detectUploadAccount({ sheetName: '신한 거래내역(6616)' }, cand)?.key).toBe('only');
  });

  it('괄호 밖 자유 숫자(연도 등)는 끝자리로 안 씀 — 오탐 방지', () => {
    const cand: AccountCandidate[] = [{ key: 'x', accountNo: '111-11-112026', bankName: '신한' }]; // 끝 2026
    expect(detectUploadAccount({ sheetName: '2026년 영업계좌 거래내역' }, cand)).toBeNull();
  });

  it('아무 숫자 없음 → null', () => {
    expect(detectUploadAccount({ sheetName: '거래내역', fileName: 'export.xlsx' }, CAND)).toBeNull();
  });

  it('후보 없음 → null', () => {
    expect(detectUploadAccount({ sheetName: '영업계좌(신한6616)' }, [])).toBeNull();
  });
});

describe('detectUploadAccount — 새 포맷·오탐 방지 (적대 검증 반영)', () => {
  it('농협 4그룹 13자리 전체번호 full 매칭 (truncate 안 됨)', () => {
    const cand: AccountCandidate[] = [{ key: 'nh', accountNo: '301-0123-4567-89', bankName: '농협' }];
    const d = detectUploadAccount({ titleText: '농협 301-0123-4567-89 거래내역' }, cand);
    expect(d?.key).toBe('nh');
    expect(d?.matchedOn).toBe('full');
  });

  it('마스터가 대시 없는 숫자만이어도 full 매칭', () => {
    const cand: AccountCandidate[] = [{ key: 'x', accountNo: '140014381868', bankName: '신한' }];
    expect(detectUploadAccount({ titleText: '신한 140-014-381868' }, cand)?.matchedOn).toBe('full');
  });

  it('파일 텍스트가 대시 없는 숫자열이어도 full 매칭 (\\d{8,})', () => {
    const cand: AccountCandidate[] = [{ key: 'x', accountNo: '140-014-381868', bankName: '신한' }];
    expect(detectUploadAccount({ titleText: '예금주 140014381868' }, cand)?.matchedOn).toBe('full');
  });

  it('8자리 날짜(20260101)는 계좌로 오인 안 함', () => {
    const cand: AccountCandidate[] = [{ key: 'x', accountNo: '140-014-381868', bankName: '신한' }];
    expect(detectUploadAccount({ titleText: '거래기간 20260101 20260630' }, cand)).toBeNull();
  });

  it('괄호 안 전화번호(010-3781-5555)는 끝자리로 안 씀', () => {
    const cand: AccountCandidate[] = [{ key: 'nh', accountNo: '302-1234-3781', bankName: '농협' }];
    expect(detectUploadAccount({ sheetName: '농협 운영계좌', titleText: '예금주 홍길동 연락처(010-3781-5555)' }, cand)).toBeNull();
  });

  it('괄호 안 연도(2026)는 끝자리로 안 씀', () => {
    const cand: AccountCandidate[] = [{ key: 'x', accountNo: '140-014-382026', bankName: '신한' }];
    expect(detectUploadAccount({ sheetName: '신한 거래내역(2026)' }, cand)).toBeNull();
  });

  it('서로 다른 전체번호 2개 동시 등장 → 모순 → null', () => {
    const cand: AccountCandidate[] = [
      { key: 'a', accountNo: '140-014-381868', bankName: '신한' },
      { key: 'b', accountNo: '140-014-386616', bankName: '신한' },
    ];
    expect(detectUploadAccount({ titleText: '신한 140-014-381868 및 140-014-386616' }, cand)).toBeNull();
  });

  it('같은 은행 두 계좌가 같은 끝자리 → 유일하지 않음 → null', () => {
    const cand: AccountCandidate[] = [
      { key: 'a', accountNo: '140-014-381868', bankName: '신한' },
      { key: 'b', accountNo: '140-999-991868', bankName: '신한' },
    ];
    expect(detectUploadAccount({ sheetName: '신한 영업계좌(1868)' }, cand)).toBeNull();
  });

  it('kb 경계: OKBANK 문자열이 농협 매칭을 막지 않음', () => {
    const cand: AccountCandidate[] = [{ key: 'nh', accountNo: '302-1234-3781', bankName: '농협' }];
    expect(detectUploadAccount({ fileName: 'OKBANK_농협거래내역(3781).xlsx' }, cand)?.key).toBe('nh');
  });

  it('상대은행(신한) 이체메모가 섞여도 농협 후보를 배제하지 않음', () => {
    const cand: AccountCandidate[] = [{ key: 'nh', accountNo: '302-1234-3781', bankName: '농협' }];
    expect(detectUploadAccount({ sheetName: '농협 운영계좌(3781)', titleText: '신한은행으로 이체 메모' }, cand)?.key).toBe('nh');
  });
});

describe('titleBandText / detectBankLabel', () => {
  it('detectBankLabels 는 등장한 모든 은행 수집', () => {
    const s = detectBankLabels('신한에서 농협으로 이체');
    expect(s.has('신한')).toBe(true);
    expect(s.has('농협')).toBe(true);
  });

  it('헤더행 위쪽 밴드만 이어붙임', () => {
    const aoa = [['예금주 홍길동 140-014-381868'], ['거래일', '입금액'], ['1', '100']];
    expect(titleBandText(aoa, 1)).toContain('381868');
  });
  it('headerRow=0 이면 밴드 없음', () => {
    expect(titleBandText([['거래일', '입금액']], 0)).toBe('');
  });
  it('은행명 식별', () => {
    expect(detectBankLabel('신한은행 거래내역')).toBe('신한');
    expect(detectBankLabel('농협 운영계좌')).toBe('농협');
    expect(detectBankLabel('제목없음')).toBeUndefined();
  });
});
