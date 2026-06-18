'use client';

/**
 * 수납증·영수증 A4 문서 — 인쇄·PDF 출력용.
 *
 * 표준 한국 영수증 양식:
 *  · 상단: 회사 로고/명·사업자번호·주소·연락처
 *  · 중앙 큰 글씨: "영수증"
 *  · 본문: 영수자(손님)·금액(한글+숫자)·명목·기간·차량번호·회차
 *  · 하단: 발행일 + 회사 인감 자리
 *
 * 사용:
 *   <ReceiptDocument
 *     issuerCompany={...}
 *     receiverName="홍길동"
 *     amount={500000}
 *     purpose="대여료"
 *     period="2026-08 (5회차)"
 *     vehiclePlate="12가1234"
 *     paymentDate="2026-08-05"
 *     receiptNo="REC-2026-001"
 *   />
 */

import type { Company } from '@/lib/types';

function numberToKorean(n: number): string {
  if (n === 0) return '영';
  if (n < 0) return '-' + numberToKorean(-n);
  const units = ['', '만', '억', '조'];
  const digitsKor = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const placeKor = ['', '십', '백', '천'];
  let result = '';
  let unitIdx = 0;
  let v = n;
  while (v > 0) {
    const chunk = v % 10000;
    if (chunk > 0) {
      let chunkStr = '';
      let c = chunk;
      let p = 0;
      while (c > 0) {
        const d = c % 10;
        if (d > 0) {
          chunkStr = digitsKor[d] + placeKor[p] + chunkStr;
        }
        c = Math.floor(c / 10);
        p += 1;
      }
      result = chunkStr + units[unitIdx] + result;
    }
    v = Math.floor(v / 10000);
    unitIdx += 1;
  }
  return result + '원정';
}

export function ReceiptDocument({
  issuerCompany,
  receiverName,
  receiverPhone,
  amount,
  purpose,
  period,
  vehiclePlate,
  paymentDate,
  receiptNo,
  manager,
}: {
  issuerCompany: Company | undefined;
  receiverName: string;
  receiverPhone?: string;
  amount: number;
  purpose: string;           // 예: '대여료', '보증금', '연체료'
  period?: string;           // 예: '2026-08 (5회차)'
  vehiclePlate?: string;
  paymentDate: string;       // YYYY-MM-DD
  receiptNo?: string;        // 영수증 번호 (선택)
  manager?: string;          // 발행 담당자
}) {
  const issuerName = issuerCompany?.name || '회사명 미입력';
  const issuerBizNo = issuerCompany?.bizRegNo || '';
  const issuerCeo = issuerCompany?.ceo || '';
  const issuerAddr = issuerCompany?.address || '';
  const issuerPhone = issuerCompany?.mainPhone || issuerCompany?.customerServicePhone || '';

  const amountKor = numberToKorean(amount);
  const amountNum = amount.toLocaleString('ko-KR');

  return (
    <div className="receipt-document">
      {/* 상단 헤더 — 발행회사 정보 */}
      <header className="rcp-header">
        <div className="rcp-issuer">
          <div className="rcp-issuer-name">{issuerName}</div>
          <div className="rcp-issuer-meta">
            {issuerCeo && <span>대표 {issuerCeo}</span>}
            {issuerBizNo && <span>· 사업자 {issuerBizNo}</span>}
          </div>
          {issuerAddr && <div className="rcp-issuer-addr">{issuerAddr}</div>}
          {issuerPhone && <div className="rcp-issuer-phone">TEL {issuerPhone}</div>}
        </div>
        {receiptNo && <div className="rcp-receipt-no">No. {receiptNo}</div>}
      </header>

      {/* 타이틀 */}
      <div className="rcp-title">영 수 증</div>

      {/* 본문 — 영수자 / 금액 / 명목 */}
      <section className="rcp-body">
        <div className="rcp-row">
          <span className="rcp-label">영 수 자</span>
          <span className="rcp-value">{receiverName} 귀하</span>
        </div>
        <div className="rcp-row rcp-row-amount">
          <span className="rcp-label">금 액</span>
          <span className="rcp-value">
            <span className="rcp-amount-kor">{amountKor}</span>
            <span className="rcp-amount-num">(₩{amountNum})</span>
          </span>
        </div>
        <div className="rcp-row">
          <span className="rcp-label">명 목</span>
          <span className="rcp-value">{purpose}{period && ` — ${period}`}</span>
        </div>
        {vehiclePlate && (
          <div className="rcp-row">
            <span className="rcp-label">차 량 번 호</span>
            <span className="rcp-value mono">{vehiclePlate}</span>
          </div>
        )}
        <div className="rcp-row">
          <span className="rcp-label">영 수 일</span>
          <span className="rcp-value mono">{paymentDate}</span>
        </div>
        {receiverPhone && (
          <div className="rcp-row">
            <span className="rcp-label">연 락 처</span>
            <span className="rcp-value mono">{receiverPhone}</span>
          </div>
        )}
      </section>

      {/* 발행 안내문 + 인감 자리 */}
      <section className="rcp-confirm">
        <p>위 금액을 정히 영수합니다.</p>
      </section>

      {/* 발행 정보 */}
      <footer className="rcp-footer">
        <div className="rcp-issue-date">
          {paymentDate.slice(0, 4)}년 {paymentDate.slice(5, 7)}월 {paymentDate.slice(8, 10)}일
        </div>
        <div className="rcp-issuer-block">
          <div className="rcp-issuer-line">발행 {issuerName}</div>
          {issuerCeo && <div className="rcp-issuer-line">대표 {issuerCeo} (인)</div>}
          {manager && <div className="rcp-issuer-line dim">담당 {manager}</div>}
        </div>
      </footer>
    </div>
  );
}

export const RECEIPT_PRINT_CSS = `
.receipt-document {
  width: 210mm;
  min-height: 297mm;
  padding: 25mm 30mm;
  background: #fff;
  color: #000;
  font-family: 'Pretendard', -apple-system, sans-serif;
  font-size: 12pt;
  line-height: 1.5;
  box-sizing: border-box;
  position: relative;
}
.rcp-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 2px solid #000;
  padding-bottom: 8mm;
  margin-bottom: 12mm;
}
.rcp-issuer-name { font-size: 18pt; font-weight: 700; }
.rcp-issuer-meta { font-size: 10pt; color: #333; margin-top: 2mm; }
.rcp-issuer-meta span { margin-right: 8px; }
.rcp-issuer-addr { font-size: 10pt; color: #333; margin-top: 1mm; }
.rcp-issuer-phone { font-size: 10pt; color: #333; margin-top: 1mm; font-family: monospace; }
.rcp-receipt-no { font-size: 11pt; font-family: monospace; color: #555; }
.rcp-title {
  text-align: center;
  font-size: 28pt;
  font-weight: 700;
  letter-spacing: 12px;
  padding: 8mm 0 12mm;
  border-bottom: 1px solid #ccc;
  margin-bottom: 10mm;
}
.rcp-body { margin: 0 0 15mm; }
.rcp-row {
  display: flex;
  align-items: baseline;
  gap: 8mm;
  padding: 4mm 0;
  border-bottom: 1px dotted #aaa;
}
.rcp-row-amount {
  padding: 8mm 0;
  background: #fafafa;
  border: 1px solid #ddd;
  padding-left: 8mm;
  margin: 4mm 0;
}
.rcp-label {
  width: 25mm;
  font-weight: 600;
  flex-shrink: 0;
}
.rcp-value { flex: 1; }
.rcp-value.mono { font-family: monospace; }
.rcp-amount-kor {
  font-size: 16pt;
  font-weight: 700;
  margin-right: 12px;
}
.rcp-amount-num {
  font-family: monospace;
  font-size: 14pt;
  color: #555;
}
.rcp-confirm {
  text-align: center;
  font-size: 13pt;
  margin: 15mm 0;
  font-weight: 500;
}
.rcp-footer {
  text-align: center;
  margin-top: 20mm;
}
.rcp-issue-date {
  font-size: 14pt;
  font-weight: 600;
  margin-bottom: 8mm;
}
.rcp-issuer-block {
  display: inline-block;
  text-align: left;
  border-top: 1px solid #000;
  padding-top: 6mm;
  min-width: 60mm;
}
.rcp-issuer-line {
  font-size: 12pt;
  margin-bottom: 2mm;
}
.rcp-issuer-line.dim { font-size: 10pt; color: #555; }

@page { size: A4; margin: 0; }
@media print {
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 210mm;
    background: #fff !important;
  }
  .receipt-document {
    box-shadow: none;
    margin: 0;
    page-break-inside: avoid;
  }
}
`;
