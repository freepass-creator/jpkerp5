'use client';

/**
 * 내용증명 (최고서) — 단건/일괄 공용 렌더 컴포넌트.
 *
 * 단건: app/notice/cert/[contractId]/page.tsx 에서 form 으로 입력받은 값을 prop 으로 전달
 * 일괄: app/notice/cert/bulk/page.tsx 에서 contract 별 기본값으로 다수 인스턴스 렌더
 *
 * 한 페이지 = A4 1장 (210×297mm), page-break-after: always.
 * 양식은 한국 표준 내용증명 우편 양식 — 발신/수신/제목 + 본문 6항 + 청구금액 표 + 발신인란.
 */

import type { Contract, Company } from '@/lib/types';
import { stripCorpSuffix } from '@/lib/company-display';

export type CertDocProps = {
  contract: Contract;
  senderCompany?: Company;
  /** 작성일 (발송일) YYYY-MM-DD */
  issuedDate: string;
  /** 계약 해지일 — 미입력 시 반납일 또는 작성일 */
  terminationDate: string;
  /** 차량 실제 반납일 */
  returnedDate?: string;
  /** 납부 기일 (보통 작성일 + 14일) */
  paymentDueDate: string;
  /** 추가 청구 항목 */
  repairCost?: number;
  overrunCost?: number;
  towingCost?: number;
  /** 위약금률 — 계산 측에서 전달 (기본 30%) */
  penaltyRate?: number;
  /** 담당자 */
  contactName?: string;
  contactPhone?: string;
  /** 문서번호 — 자동 생성 (issuedDate + index) */
  docNo?: string;
  /** 일괄 출력 시 인덱스 표시 */
  pageIndex?: number;
  pageTotal?: number;
};

function fmtCurrency(n: number): string { return (n ?? 0).toLocaleString('ko-KR'); }

function fmtKDate(s: string): string {
  if (!s) return '____년 __월 __일';
  const [y, m, d] = s.split('-');
  return `${y}년 ${parseInt(m, 10)}월 ${parseInt(d, 10)}일`;
}

export function CertDocument({
  contract, senderCompany,
  issuedDate, terminationDate, returnedDate, paymentDueDate,
  repairCost = 0, overrunCost = 0, towingCost = 0,
  penaltyRate = 0.3,
  contactName, contactPhone,
  docNo, pageIndex, pageTotal,
}: CertDocProps) {
  const deposit = contract.deposit ?? 0;
  const unpaid = contract.unpaidAmount ?? 0;
  const penaltyAmount = Math.round(deposit * penaltyRate);
  const totalCharged = unpaid + penaltyAmount + repairCost + overrunCost + towingCost;
  const totalNet = Math.max(0, totalCharged - deposit);

  const senderName = senderCompany?.name || contract.company;
  const senderShort = stripCorpSuffix(senderName || '');
  const senderRep = senderCompany?.ceo || '대표이사';
  const senderAddr = senderCompany?.address || '';
  const senderBiz = senderCompany?.bizRegNo || '';
  const senderPhone = senderCompany?.mainPhone || senderCompany?.customerServicePhone || '';
  const senderAccount = senderCompany?.accounts?.[0];

  const customerAddr = [contract.customerRegion, contract.customerDistrict].filter(Boolean).join(' ');
  const finalDocNo = docNo || `NCM-${issuedDate.replace(/-/g, '')}-${pageIndex ? String(pageIndex).padStart(3, '0') : '001'}`;

  return (
    <article className="cert-document">
      <header className="cd-header">
        <div className="cd-mark">내 · 용 · 증 · 명 · 우 · 편</div>
        <h1>최&nbsp;고&nbsp;서</h1>
        <div className="cd-subtitle">대여계약 해지 및 정산 통보</div>
      </header>

      <div className="cd-meta-row">
        <span>문서번호 <strong>{finalDocNo}</strong></span>
        {pageIndex && pageTotal ? (
          <span>{pageTotal}건 중 {pageIndex}번째</span>
        ) : (
          <span>1 / 1</span>
        )}
      </div>

      <section className="cd-party">
        <div className="cd-party-row">
          <span className="cd-party-label">수&nbsp;신&nbsp;인</span>
          <div className="cd-party-body">
            <div><span className="cd-field">성&nbsp;명</span> <strong>{contract.customerName}</strong> 귀하</div>
            <div><span className="cd-field">주&nbsp;소</span> {customerAddr || '___________________________________'}</div>
            <div><span className="cd-field">연락처</span> {contract.customerPhone1 || '___________________'}</div>
          </div>
        </div>
        <div className="cd-party-row">
          <span className="cd-party-label">발&nbsp;신&nbsp;인</span>
          <div className="cd-party-body">
            <div><span className="cd-field">상&nbsp;호</span> <strong>{senderName}</strong></div>
            <div><span className="cd-field">대&nbsp;표</span> {senderRep}{senderBiz ? <> &nbsp;·&nbsp; 사업자등록 {senderBiz}</> : null}</div>
            <div><span className="cd-field">주&nbsp;소</span> {senderAddr || '___________________________________'}</div>
            {senderPhone && <div><span className="cd-field">연락처</span> {senderPhone}</div>}
          </div>
        </div>
        <div className="cd-subject">
          <span className="cd-party-label">제&nbsp;&nbsp;&nbsp;&nbsp;목</span>
          <strong>대여료 미납에 따른 계약 해지 통보 및 차량 회수·정산 청구의 件</strong>
        </div>
      </section>

      <section className="cd-body">
        <ol>
          <li>
            발신인은 귀하와 <strong>{fmtKDate(contract.contractDate)}</strong>자로 자동차 임대차 계약
            (계약번호 <strong className="mono">{contract.contractNo}</strong>,
            차량번호 <strong className="mono">{contract.vehiclePlate}</strong>)을 체결하였으나,
            귀하는 <strong>{contract.unpaidSeqCount ?? 0}회차 대여료 합계 금 {fmtCurrency(unpaid)}원</strong>을 미납하였습니다.
            본사의 수차례 독촉에도 변제가 이루어지지 않은 바, 본 임대차 계약을
            <strong> {fmtKDate(terminationDate)}자로 해지</strong>함을 통보드립니다.
          </li>

          <li>
            귀하는 <strong>{fmtKDate(paymentDueDate)}까지</strong> 하기 (표 2) 금액을
            발신인 지정 계좌로 납입하시고 <strong>임대차량을 즉시 반환</strong>하시기 바랍니다.
          </li>

          <li>
            기일까지 미이행 시 발신인은 <strong>차량 강제회수 및 민·형사상 법적 조치</strong>
            (손해배상 청구, 사기·횡령 고소, 한국신용정보원 채무불이행자 등록 등)에 착수할 예정입니다.
            본 내용증명은 향후 법적 절차에서 증거자료로 사용됩니다.
          </li>
        </ol>
      </section>

      <section className="cd-tables">
        <div className="cd-table-title">[표 1] 계약 내용</div>
        <table className="cd-table">
          <tbody>
            <tr>
              <th>계약 차량</th><td>{contract.vehicleModel || '-'}</td>
              <th>차량번호</th><td className="mono">{contract.vehiclePlate}</td>
            </tr>
            <tr>
              <th>계약일</th><td>{contract.contractDate}</td>
              <th>약정 종료일</th><td>{contract.returnScheduledDate || '-'}</td>
            </tr>
            <tr>
              <th>월 대여료</th><td className="num">₩ {fmtCurrency(contract.monthlyRent ?? 0)}</td>
              <th>보증금</th><td className="num">₩ {fmtCurrency(deposit)}</td>
            </tr>
            <tr>
              <th>계약 해지일</th><td>{terminationDate}</td>
              <th>차량 반납일</th><td>{returnedDate || '미반납'}</td>
            </tr>
          </tbody>
        </table>

        <div className="cd-table-title">[표 2] 청구 금액</div>
        <table className="cd-table cd-table--calc">
          <tbody>
            <tr>
              <th style={{ width: '50%' }}>구&nbsp;&nbsp;&nbsp;분</th>
              <th style={{ width: '25%' }}>금액 (원)</th>
              <th>비&nbsp;&nbsp;&nbsp;고</th>
            </tr>
            <tr>
              <td>미납 대여료</td>
              <td className="num">{fmtCurrency(unpaid)}</td>
              <td>{contract.unpaidSeqCount ?? 0}회차</td>
            </tr>
            <tr>
              <td>중도 해지 위약금</td>
              <td className="num">{fmtCurrency(penaltyAmount)}</td>
              <td>보증금 × {(penaltyRate * 100).toFixed(0)}%</td>
            </tr>
            {repairCost > 0 && (
              <tr><td>차량 수리비</td><td className="num">{fmtCurrency(repairCost)}</td><td>차량 원상복귀</td></tr>
            )}
            {overrunCost > 0 && (
              <tr><td>거리 초과 사용료</td><td className="num">{fmtCurrency(overrunCost)}</td><td>주행거리 초과</td></tr>
            )}
            {towingCost > 0 && (
              <tr><td>견인비</td><td className="num">{fmtCurrency(towingCost)}</td><td>회수 시 발생</td></tr>
            )}
            <tr className="cd-subtotal">
              <td>소&nbsp;계 (A)</td>
              <td className="num">{fmtCurrency(totalCharged)}</td>
              <td>-</td>
            </tr>
            <tr>
              <td>보증금 충당 (B)</td>
              <td className="num" style={{ color: '#1d4ed8' }}>- {fmtCurrency(deposit)}</td>
              <td>보증금 상계</td>
            </tr>
            <tr className="cd-total">
              <td>최종 청구 금액 (A − B)</td>
              <td className="num">{fmtCurrency(totalNet)}</td>
              <td>본 통지서 청구액</td>
            </tr>
          </tbody>
        </table>

        {senderAccount && (
          <div className="cd-account">
            <strong>납입 계좌</strong> &nbsp;
            {senderAccount.bankName} {senderAccount.accountNo}
            {senderAccount.accountHolder ? ` (예금주: ${senderAccount.accountHolder})` : ''}
          </div>
        )}
      </section>

      {(contactName || contactPhone) && (
        <div className="cd-contact">
          <strong>문의·납부 확인 담당</strong> {contactName || '___'}{contactPhone ? ` · ${contactPhone}` : ''}
        </div>
      )}

      <footer className="cd-signature">
        <div className="cd-issued">{fmtKDate(issuedDate)}</div>
        <div className="cd-signer">
          <div className="cd-signer-line">발&nbsp;신&nbsp;인</div>
          <div className="cd-signer-name">{senderShort}</div>
          <div className="cd-signer-rep">
            <span>대표 {senderRep}</span>
            {senderCompany?.stampUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="cd-stamp" src={senderCompany.stampUrl} alt="법인 인영" />
            ) : (
              <span className="cd-stamp-placeholder">(인)</span>
            )}
          </div>
        </div>
      </footer>
    </article>
  );
}

/** A4 인쇄용 CSS — global style 태그로 페이지에 한 번만 박아두면 모든 .cert-document 가 적용받음 */
export const CERT_PRINT_CSS = `
  .cert-document {
    width: 210mm;
    /* 화면에선 297mm 표시, 인쇄는 page-break-inside: avoid + 컴팩트 내용으로 자연스럽게 1장 fit */
    min-height: 297mm;
    padding: 12mm 14mm;
    background: #fff;
    box-sizing: border-box;
    font-family: 'Pretendard Variable', Pretendard, 'Malgun Gothic', sans-serif;
    color: #0b1220;
    font-size: 9pt;
    line-height: 1.45;
    box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    page-break-inside: avoid;
    break-inside: avoid;
    page-break-after: always;
    break-after: page;
  }
  .cert-document:last-child { page-break-after: auto; break-after: auto; }
  .cert-document .mono { font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
  .cert-document .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }

  /* Header */
  .cd-header { text-align: center; margin-bottom: 2px; }
  .cd-mark { font-size: 7pt; letter-spacing: 0.3em; color: #52525b; padding-left: 0.3em; }
  .cd-header h1 {
    font-size: 20pt; font-weight: 900; letter-spacing: 0.45em;
    padding-left: 0.45em;
    margin: 1px 0 1px;
    color: #0b1220;
  }
  .cd-subtitle {
    font-size: 9pt; color: #3f3f46; letter-spacing: 0.08em; font-weight: 500;
  }

  /* Meta row */
  .cd-meta-row {
    display: flex; justify-content: space-between;
    font-size: 8pt; color: #52525b;
    margin-top: 4px; padding-bottom: 2px;
    border-bottom: 1.2px solid #0b1220;
  }

  /* Party block */
  .cd-party {
    margin-top: 4px; padding-bottom: 2px;
    border-bottom: 1px solid #d4d4d8;
  }
  .cd-party-row {
    display: grid; grid-template-columns: 60px 1fr;
    gap: 0 8px; padding: 2px 0;
    border-bottom: 1px dashed #e4e4e7;
  }
  .cd-party-row:last-of-type { border-bottom: none; }
  .cd-party-label {
    font-weight: 700; font-size: 8.5pt; color: #0b1220;
    background: #f4f4f5; padding: 0 6px; align-self: start;
    border: 1px solid #d4d4d8;
    line-height: 1.5;
  }
  .cd-party-body div { font-size: 9pt; line-height: 1.5; }
  .cd-field {
    display: inline-block; width: 38px;
    font-size: 8pt; color: #71717a; margin-right: 3px;
  }
  .cd-subject {
    display: grid; grid-template-columns: 60px 1fr;
    gap: 8px; padding: 4px 0 2px;
    font-size: 9.5pt;
  }
  .cd-subject strong { color: #0b1220; }

  /* Body */
  .cd-body { margin: 4px 0 4px; }
  .cd-body ol { margin: 0; padding-left: 18px; counter-reset: cd-li; }
  .cd-body ol li {
    margin-bottom: 3px; padding-left: 2px;
    font-size: 9pt; line-height: 1.55;
  }
  .cd-body strong { font-weight: 700; color: #0b1220; }

  /* Tables */
  .cd-tables { margin: 4px 0 2px; }
  .cd-table-title {
    font-size: 8.5pt; font-weight: 700; color: #0b1220;
    margin: 4px 0 1px;
  }
  .cd-table {
    width: 100%; border-collapse: collapse;
    font-size: 8.5pt; margin-bottom: 2px;
    border-top: 1.2px solid #0b1220;
    border-bottom: 1.2px solid #0b1220;
  }
  .cd-table th, .cd-table td {
    padding: 2px 6px; border-bottom: 1px solid #e4e4e7;
    vertical-align: middle;
    line-height: 1.35;
  }
  .cd-table th {
    background: #f4f4f5; font-weight: 700;
    color: #18181b; text-align: left;
    width: 22%;
  }
  .cd-table--calc tbody tr:first-child th {
    text-align: center;
  }
  .cd-table--calc .cd-subtotal td {
    background: #fafafa; font-weight: 700;
    border-top: 1px solid #0b1220;
  }
  .cd-table--calc .cd-total td {
    background: #0b1220; color: #fff; font-weight: 800;
    font-size: 9.5pt;
  }

  .cd-account {
    margin: 2px 0 4px; padding: 4px 8px;
    background: #f4f4f5; border-left: 3px solid #0b1220;
    font-size: 8.5pt;
  }
  .cd-account strong { margin-right: 4px; }

  .cd-contact {
    margin: 4px 0 0; font-size: 8.5pt; color: #18181b;
  }

  /* Signature */
  .cd-signature {
    margin-top: 8px; padding-top: 6px;
    border-top: 1.2px solid #0b1220;
    display: flex; justify-content: space-between;
    align-items: flex-end;
  }
  .cd-issued { font-size: 10pt; font-weight: 700; letter-spacing: 0.05em; }
  .cd-signer { text-align: right; }
  .cd-signer-line { font-size: 8pt; color: #71717a; letter-spacing: 0.2em; }
  .cd-signer-name { font-size: 12pt; font-weight: 900; margin-top: 1px; }
  .cd-signer-rep {
    display: inline-flex; align-items: center; gap: 6px;
    margin-top: 1px; font-size: 9.5pt;
  }
  .cd-stamp { height: 42px; width: auto; object-fit: contain; }
  .cd-stamp-placeholder {
    display: inline-flex; align-items: center; justify-content: center;
    width: 36px; height: 36px;
    border: 1.5px solid #dc2626; color: #dc2626;
    border-radius: 50%; font-size: 8.5pt; font-weight: 800;
    transform: rotate(-6deg);
  }

  /* 인쇄 — 브라우저 기본 여백 강제 0 + 1장 fit */
  @page { size: A4; margin: 0; }
  @media print {
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 210mm;
      background: #fff !important;
    }
    .cert-document {
      box-shadow: none;
      margin: 0;
      min-height: auto;
      page-break-inside: avoid;
      break-inside: avoid;
    }
  }
`;
