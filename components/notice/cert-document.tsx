'use client';

/**
 * 내용증명 (계약 해지·차량 반환 통지서) — 단건/일괄 공용 렌더 컴포넌트.
 *
 * 단건: app/notice/cert/[contractId]/page.tsx 에서 form 으로 입력받은 값을 prop 으로 전달
 * 일괄: app/notice/cert/bulk/page.tsx 에서 contract 별 기본값으로 다수 인스턴스 렌더
 *
 * 한 페이지 = A4 1장 (210×297mm), page-break-after: always.
 * 양식은 한국 표준 내용증명 우편 양식 — 발신/수신/제목 + 본문 6항 + 청구금액 표 + 발신인란.
 */

import type { Contract, Company } from '@/lib/types';
import { stripCorpSuffix } from '@/lib/company-display';
import { monthsBetween } from '@/lib/utils';
import { getExpiryDate } from '@/lib/contract-stage';

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
  /** 보증금 기준 위약금률 — 기본 30% */
  penaltyRate?: number;
  /** 잔여 계약기간 위약금률 — (잔여개월 × 월대여료) × 이 비율. 기본 10% */
  earlyTerminationRate?: number;
  /** 담당자 */
  contactName?: string;
  contactPhone?: string;
  /** 문서번호 — 자동 생성 (issuedDate + index) */
  docNo?: string;
  /** 일괄 출력 시 인덱스 표시 */
  pageIndex?: number;
  pageTotal?: number;
};

import { fmtKDate as fmtKDateBase, fmtKMoney } from '@/lib/format/korean';

function fmtCurrency(n: number): string { return fmtKMoney(n ?? 0); }

/** 계약서·증명서 빈칸 모드 (__년 __월 __일) */
function fmtKDate(s: string): string {
  return fmtKDateBase(s, { empty: 'underline' });
}

export function CertDocument({
  contract, senderCompany,
  issuedDate, terminationDate, returnedDate, paymentDueDate,
  repairCost = 0, overrunCost = 0, towingCost = 0,
  penaltyRate,
  earlyTerminationRate = 0.1,
  contactName, contactPhone,
  docNo, pageIndex, pageTotal,
}: CertDocProps) {
  const deposit = contract.deposit ?? 0;
  const unpaid = contract.unpaidAmount ?? 0;
  // 계약 진행 개월수 — 1년 미만 30%, 1년 이상 20% (통상 룰)
  const monthsServed = monthsBetween(contract.contractDate, terminationDate);
  const effectivePenaltyRate = penaltyRate ?? (monthsServed < 12 ? 0.3 : 0.2);
  const penaltyAmount = Math.round(deposit * effectivePenaltyRate);
  // 잔여 계약기간 위약금 — 해지일 기준 약정종료일까지 남은 개월수 × 월대여료 × 비율
  const monthsRemaining = monthsBetween(terminationDate, contract.returnScheduledDate ?? '');
  const earlyTermPenalty = Math.round(monthsRemaining * (contract.monthlyRent ?? 0) * earlyTerminationRate);
  const totalCharged = unpaid + penaltyAmount + earlyTermPenalty + repairCost + overrunCost + towingCost;
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

  const recipientAddr = customerAddr || '';
  void senderBiz; void senderShort;  // 페이지푸터에서 사용 안 함

  // 계약 종료일 — 만기 SSOT(getExpiryDate: 문자열 addMonths, 월말 clamp) 재사용
  const contractEndDate = getExpiryDate(contract) ?? '';

  // 잔여 계약기간 — 해지일 ~ 약정 종료일까지 (년/개월/일)
  const remainingYMD = (() => {
    if (!terminationDate || !contractEndDate) return null;
    const a = new Date(terminationDate);
    const b = new Date(contractEndDate);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b <= a) return null;
    let years = b.getFullYear() - a.getFullYear();
    let months = b.getMonth() - a.getMonth();
    let days = b.getDate() - a.getDate();
    if (days < 0) {
      months -= 1;
      const prevMonthLastDay = new Date(b.getFullYear(), b.getMonth(), 0).getDate();
      days += prevMonthLastDay;
    }
    if (months < 0) { years -= 1; months += 12; }
    return { years, months, days };
  })();
  const remainingLabel = remainingYMD
    ? [
        remainingYMD.years > 0 ? `${remainingYMD.years}년` : '',
        remainingYMD.months > 0 ? `${remainingYMD.months}개월` : '',
        remainingYMD.days > 0 ? `${remainingYMD.days}일` : '',
      ].filter(Boolean).join(' ') || '0일'
    : '';

  return (
    <article className="cert-document">
      {/* 상단 압박 — 내용증명 (단순 큰 글씨, 라인 없음) */}
      <header className="cd-doc-head">
        <div className="cd-stamp-title">내&nbsp;&nbsp;용&nbsp;&nbsp;증&nbsp;&nbsp;명</div>
      </header>

      {/* 수신 / 발신 / 제목 — 본문 표(.cd-kv)와 동일 룩으로 통일 */}
      <table className="cd-kv cd-meta-kv">
        <colgroup>
          <col style={{ width: '110px' }} /><col />
        </colgroup>
        <tbody>
          <tr>
            <td className="cd-k">수&nbsp;신</td>
            <td className="cd-v">
              <div><strong>{contract.customerName}</strong> 귀하</div>
              <div className="cd-sub"><span className="cd-sub-k">주&nbsp;소</span>{recipientAddr || <span className="cd-blank">—</span>}</div>
            </td>
          </tr>
          <tr>
            <td className="cd-k">발&nbsp;신</td>
            <td className="cd-v">
              <div><strong>{senderName}</strong></div>
              <div className="cd-sub"><span className="cd-sub-k">주&nbsp;소</span>{senderAddr || <span className="cd-blank">—</span>}</div>
              <div className="cd-sub"><span className="cd-sub-k">연락처</span>{senderPhone || <span className="cd-blank">—</span>}</div>
              {(contactName || contactPhone) && (
                <div className="cd-sub">
                  <span className="cd-sub-k">담&nbsp;당</span>
                  {contactName || '___'}{contactPhone ? ` (${contactPhone})` : ''}
                </div>
              )}
            </td>
          </tr>
          <tr className="cd-meta-title-row">
            <td className="cd-k">제&nbsp;목</td>
            <td className="cd-v"><strong>계약 해지에 따른 차량 반환 및 회수 예정 통지서</strong></td>
          </tr>
        </tbody>
      </table>

      {/* 본문 narrative — 공문 번호 형식 (1.) */}
      <ol className="cd-body cd-ol-numbered" start={1}>
        <li>
          귀하는 당사와 자동차 임대차 계약을 체결하고 아래 차량을 인도받아 사용 중이나,
          대여료가 약정 납부일을 지나 상당 기간 미납되었습니다.
          이에 당사는 계약에서 정한 차량 회수 사유가 발생한 것으로 보아 위 자동차 임대차 계약을 해지하고,
          귀하에게 아래 청구 금액의 납부 및 차량 반환을 통지합니다.
        </li>
      </ol>


      {/* 1. 계약 정보 및 회수 대상 */}
      <div className="cd-caption">계약 정보 및 회수 대상</div>
      <table className="cd-kv">
        <colgroup>
          <col style={{ width: '110px' }} /><col />
          <col style={{ width: '110px' }} /><col />
        </colgroup>
        <tbody>
          <tr>
            <td className="cd-k">차량명</td><td className="cd-v">{contract.vehicleModel || '-'}</td>
            <td className="cd-k">차량번호</td><td className="cd-v mono">{contract.vehiclePlate}</td>
          </tr>
          <tr>
            <td className="cd-k">월 대여료</td><td className="cd-v num">₩ {fmtCurrency(contract.monthlyRent ?? 0)}</td>
            <td className="cd-k">보증금</td><td className="cd-v num">₩ {fmtCurrency(deposit)}</td>
          </tr>
          <tr>
            <td className="cd-k">계약 기간</td>
            <td className="cd-v">
              {contract.contractDate || '-'} ~ {contractEndDate || '-'}
              {contract.termMonths ? <span className="cd-sub-inline"> · {contract.termMonths}개월</span> : null}
            </td>
            <td className="cd-k">잔여 계약기간</td>
            <td className="cd-v">
              {remainingLabel ? (
                <><strong>{remainingLabel}</strong><span className="cd-sub-inline"> · 해지일 기준</span></>
              ) : '-'}
            </td>
          </tr>
          <tr>
            <td className="cd-k">계약 해지일</td><td className="cd-v">{terminationDate}</td>
            <td className="cd-k">차량 반환 여부</td><td className="cd-v">{returnedDate ? `${returnedDate} 반납` : '미반납'}</td>
          </tr>
        </tbody>
      </table>

      {/* 2. 청구 금액 — 동일 룩(.cd-kv) + 헤더/소계/최종 row */}
      <div className="cd-caption">청구 금액</div>
      <table className="cd-kv cd-kv-charge">
        <colgroup>
          <col /><col style={{ width: '130px' }} /><col style={{ width: '38%' }} />
        </colgroup>
        <thead>
          <tr><th>구&nbsp;분</th><th className="num">금액 (원)</th><th>비&nbsp;고</th></tr>
        </thead>
        <tbody>
          <tr><td>미납 대여료</td><td className="num">{fmtCurrency(unpaid)}</td><td className="cd-note-cell">{contract.unpaidSeqCount ?? 0}회차</td></tr>
          <tr><td>중도 해지 위약금</td><td className="num">{fmtCurrency(penaltyAmount)}</td><td className="cd-note-cell">보증금 × {(effectivePenaltyRate * 100).toFixed(0)}% ({monthsServed < 12 ? '1년 미만' : '1년 경과'})</td></tr>
          {earlyTermPenalty > 0 && (
            <tr><td>잔여기간 위약금</td><td className="num">{fmtCurrency(earlyTermPenalty)}</td><td className="cd-note-cell">잔여 {monthsRemaining}개월 × 월대여료 × {(earlyTerminationRate * 100).toFixed(0)}%</td></tr>
          )}
          {repairCost > 0 && (<tr><td>차량 수리비</td><td className="num">{fmtCurrency(repairCost)}</td><td className="cd-note-cell">차량 원상복귀</td></tr>)}
          {overrunCost > 0 && (<tr><td>거리 초과 사용료</td><td className="num">{fmtCurrency(overrunCost)}</td><td className="cd-note-cell">주행거리 초과</td></tr>)}
          {towingCost > 0 && (<tr><td>견인비</td><td className="num">{fmtCurrency(towingCost)}</td><td className="cd-note-cell">회수 시 발생</td></tr>)}
          <tr className="cd-sub"><td>소&nbsp;계</td><td className="num">{fmtCurrency(totalCharged)}</td><td className="cd-note-cell">—</td></tr>
          <tr><td>보증금 충당</td><td className="num">− {fmtCurrency(deposit)}</td><td className="cd-note-cell">보증금 상계</td></tr>
          <tr className="cd-total"><td>최종 청구 금액</td><td className="num">{fmtCurrency(totalNet)} 원</td><td className="cd-note-cell">본 통지서 청구액</td></tr>
        </tbody>
      </table>

      {/* 후단 narrative — 공문 번호 형식 (2./3./4.) */}
      <ol className="cd-body cd-ol-numbered" start={2}>
        <li>
          귀하는 위 표에 기재된 마감일까지 청구 금액 전액을 납부하고 해당 차량을 당사에 반환하여야 합니다.
          납입 계좌는{' '}
          {senderAccount
            ? <strong>{senderAccount.bankName} {senderAccount.accountNo}{senderAccount.accountHolder ? ` (예금주 ${senderAccount.accountHolder})` : ''}</strong>
            : <span>본 통지서 발신처로 문의 바랍니다</span>}
          {' '}입니다.
        </li>
        <li>
          본 청구 금액에는 차량 회수 후 검수 과정에서 확인될 수 있는 원상복구 비용, 차량 파손에 따른 손해배상금,
          미납 과태료·범칙금·견인료·보관료·회수 비용 등 부대비용은 포함되어 있지 않으며, 회수 및 검수 완료 후 별도 청구될 수 있습니다.
        </li>
        <li>
          위 기한까지 이행되지 않을 경우 당사는 별도 추가 통지 없이 차량 회수 절차를 진행하며,
          미납금 및 손해배상금에 대하여 지급명령·민사소송·강제집행 등 법적 절차 및 사안에 따라 형사 고소를 검토할 수 있습니다.
          본 통지서는 향후 관련 법적 절차에서 증거자료로 사용될 수 있습니다. &nbsp;<strong>끝.</strong>
        </li>
      </ol>

      {/* 발송일자 — 발신명의 위 가운데 (통상 공문) */}
      <div className="cd-issued-date">{fmtKDate(issuedDate)}</div>

      {/* 발신명의 */}
      <div className="cd-sender">
        {senderName}
        <span className="cd-seal">
          {senderCompany?.stampUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={senderCompany.stampUrl} alt="" />
          ) : (
            <span className="cd-seal-fb">(직인생략)</span>
          )}
        </span>
      </div>

      {/* 페이지 footer — 부가 메타정보 */}
      <footer className="cd-footer">
        <div className="cd-footer-row">
          <span><span className="cd-k">문서번호</span> {finalDocNo}</span>
          <span className="cd-footer-pageno">
            {pageIndex && pageTotal ? `${pageIndex} / ${pageTotal}` : '1 / 1'}
          </span>
        </div>
      </footer>
    </article>
  );
}

/** A4 인쇄용 CSS — global style 태그로 페이지에 한 번만 박아두면 모든 .cert-document 가 적용받음 */
export const CERT_PRINT_CSS = `
  .cert-document {
    width: 210mm;
    min-height: 297mm;
    padding: 10mm 13mm 16mm;            /* bottom 16mm: footer 영역 확보 */
    background: #fff;
    box-sizing: border-box;
    position: relative;                  /* footer absolute 기준 */
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
  .cert-document * { box-sizing: border-box; }
  .cert-document .mono { font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
  .cert-document .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }

  .cert-document { position: relative; }

  /* ── 상단 내용증명 (단순 가운데 큰 글씨) ── */
  .cd-doc-head {
    text-align: center;
    margin: 4px 0 14px;
  }
  .cd-stamp-title {
    font-size: 20.5pt; font-weight: 900;
    letter-spacing: 0.4em; padding-left: 0.4em;
    color: #111; line-height: 1;
  }

  /* ── 수신/발신/제목 표 (.cd-kv 룩 그대로) ── */
  .cd-meta-kv { margin-bottom: 16px; }
  .cd-meta-kv .cd-v .cd-sub {
    font-size: 9.5pt; color: #4b5563; margin-top: 2px;
    display: flex; gap: 6px; align-items: baseline;
  }
  .cd-meta-kv .cd-v .cd-sub-k {
    color: #6b7280; font-weight: 500; font-size: 9pt;
    letter-spacing: 0.04em; min-width: 38px;
  }
  .cd-meta-kv .cd-v .cd-blank {
    color: #c4c4c4; letter-spacing: 0.4em;
  }
  .cd-meta-kv .cd-meta-title-row td {
    border-top: 1px solid #9ca3af;
    padding-top: 8px; padding-bottom: 8px;
  }
  .cd-meta-kv .cd-meta-title-row .cd-v strong {
    font-size: 11.5pt; font-weight: 700;
  }

  /* ── 본문 ── */
  .cd-body { margin: 6px 0 2px; }
  .cd-body p { margin: 0 0 5px; line-height: 1.7; font-size: 10pt; color: #111; }
  .cd-body strong { color: #111; font-weight: 700; }

  /* 공문 번호 형식 — 1. 2. 3. */
  ol.cd-ol-numbered {
    list-style: none; padding-left: 0; margin: 10px 0 12px;
    counter-reset: cd-num;
  }
  ol.cd-ol-numbered > li {
    counter-increment: cd-num;
    position: relative;
    padding-left: 22px;
    margin-bottom: 7px;
    font-size: 10pt; line-height: 1.7; color: #111;
  }
  ol.cd-ol-numbered > li::before {
    content: counter(cd-num) ".";
    position: absolute; left: 0; top: 0;
    font-weight: 700; color: #111; letter-spacing: 0.02em;
  }
  ol.cd-ol-numbered[start="2"] { counter-reset: cd-num 1; }

  /* 발송일자 — 발신명의 위 가운데 (통상 공문). 본문↔날짜↔발신 사이 한 칸씩 */
  .cd-issued-date {
    text-align: center; margin: 30px 0 20px;
    font-size: 11pt; font-weight: 600; letter-spacing: 0.06em;
    color: #111;
  }
  .cd-sub-inline { color: #6b7280; font-size: 9.5pt; }

  /* ── 계약 정보 KV 표 (모든 표 공통) ── */
  .cd-kv {
    width: 100%; border-collapse: collapse; font-size: 9.5pt;
    border-top: 1px solid #9ca3af; border-bottom: 1px solid #9ca3af;
    margin-bottom: 8px;
  }
  .cd-kv td {
    padding: 5px 9px; border-bottom: 1px solid #e5e7eb;
    line-height: 1.45; vertical-align: middle;
  }
  .cd-kv tr:last-child td { border-bottom: none; }
  .cd-kv td.cd-k {
    background: #fafbfc; color: #6b7280;
    font-size: 9.5pt; font-weight: 500;
    width: 110px; letter-spacing: 0.02em;
  }

  /* ── 표 캡션 (좌측 정렬, 표 위) ── */
  .cd-caption {
    text-align: left; font-size: 9.5pt; color: #111;
    margin: 14px 0 5px; font-weight: 700;
    letter-spacing: 0.04em;
    padding-left: 8px; border-left: 3px solid #6b7280;
    line-height: 1.2;
  }

  /* ── 청구 금액 표 — .cd-kv 룩 확장 ── */
  .cd-kv-charge thead th {
    background: #fafbfc; font-weight: 600;
    color: #111; text-align: center; font-size: 9.5pt;
    padding: 6px 9px; border-bottom: 1px solid #9ca3af;
  }
  .cd-kv-charge thead th.num { text-align: right; }
  .cd-kv-charge td { padding: 5px 9px; }
  .cd-kv-charge td.cd-note-cell {
    color: #6b7280; font-size: 9.5pt;
  }
  .cd-kv-charge .cd-sub td {
    background: #fafbfc; font-weight: 700;
    border-top: 1px solid #c4c4c4;
  }
  .cd-kv-charge .cd-total td {
    background: #f4f4f5; font-weight: 800; font-size: 11pt;
    border-top: 1px solid #6b7280;
  }
  .cd-kv-charge .cd-total td.cd-note-cell {
    color: #111; font-weight: 600; font-size: 10pt;
  }

  /* ── 첨부 박스 (과태료 공문 .attach) ── */
  .cd-attach {
    margin-top: 8px; padding: 7px 11px;
    background: #f7f8fa; border-left: 3px solid #111;
    font-size: 9pt; color: #111; line-height: 1.6;
  }
  .cd-attach strong { font-weight: 600; margin-right: 6px; }
  .cd-attach em { font-style: normal; font-weight: 600; color: #111; }
  .cd-attach-warn { border-left-color: #b91c1c; }

  /* ── 발신명의 (letter-spacing 으로 마지막 자 잘림 방지: padding-left) ── */
  .cd-sender {
    text-align: center; font-size: 14.5pt; font-weight: 700;
    letter-spacing: 0.04em; padding-left: 0.04em;
    margin: 6px 0 8px; color: #111;
  }
  .cd-seal {
    display: inline-flex; align-items: center; justify-content: center;
    vertical-align: middle; margin-left: 8px;
  }
  .cd-seal img {
    width: 42px; height: 42px; object-fit: contain; transform: rotate(-4deg);
  }
  .cd-seal-fb {
    font-size: 8.5pt; font-weight: 500; color: #6b7280;
    letter-spacing: 0.04em; border: 1px solid #c4c4c4;
    padding: 2px 7px; border-radius: 2px;
  }

  /* ── 페이지 footer (absolute로 페이지 바닥 고정 — 본문 길이 무관) ── */
  .cd-footer {
    position: absolute;
    left: 0; right: 0; bottom: 6mm;
    padding: 6px 13mm 0;
    border-top: 1px solid #e5e7eb;
    font-size: 8.5pt; color: #111; line-height: 1.45;
  }
  .cd-footer-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; }
  .cd-footer-row.dim { color: #6b7280; margin-top: 1px; }
  .cd-footer .cd-k {
    color: #6b7280; letter-spacing: 0.16em; margin-right: 5px;
  }
  .cd-footer .cd-sep { color: #c4c4c4; }
  .cd-footer-pageno {
    margin-left: auto; color: #6b7280;
    font-family: 'Consolas', monospace; letter-spacing: 0.08em;
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
      /* 화면과 동일하게 A4 1장 fit + footer absolute 위치 유지 */
      min-height: 297mm;
      page-break-inside: avoid;
      break-inside: avoid;
    }
  }
`;
