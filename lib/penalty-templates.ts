/**
 * 과태료 변경부과 PDF 페이지 HTML 템플릿.
 *
 * 출력 PDF 묶음 구조:
 *   공문 1 ~ K장 (위반 표 N건, 행 많으면 자동 페이지 분할)
 *   ↓
 *   [확인서ᵢ + 고지서ᵢ] 1:1 페어 × N건  (확인서 1장, 고지서 원본 1장씩)
 *
 * 디자인 source of truth: public/sample/penalty-docs.html
 */
import type { PenaltyWorkItem } from './penalty-pdf';
import type { Company } from './sample-companies';

const A4_W = 794;
const A4_H = 1123;

const NAVY = '#1B2A4A';
const STAMP_RED = '#C72020';

/* ────────────────── helpers ────────────────── */

function escapeHtml(s: string | undefined | null): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 2026. 4. 29. 형태 */
function formatKRDate(s?: string): string {
  if (!s) return '';
  const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.` : s;
}

/** 2026.01.15 형태 (표 안 짧은 형식) */
function formatShortDate(s?: string): string {
  if (!s) return '';
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : s;
}

/** "2026-01-15 14:32" 또는 "2026.01.15 14:32" 에서 시간 부분만 */
function extractTime(s?: string): string {
  if (!s) return '';
  const m = s.match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '';
}

function dash(v: string | undefined | null): string {
  return v && String(v).trim() ? escapeHtml(String(v)) : '—';
}

/* ────────────────── 공통 컨텍스트 ────────────────── */

export interface IssueContext {
  /** 발신 회사 정보 */
  company: Company;
  /** 회사 본사 주소 (sample-companies 의 hqAddress 사용) */
  hqAddress?: string;
  /** 홈페이지 URL */
  homepage?: string;
  /** 회사 직인 PNG (배경 투명). 없으면 자동 (직인생략) 라벨 */
  sealPngUrl?: string;

  /** 발급/발송 담당자 (로그인 staff 레코드) */
  staff: {
    department: string;       // 경영지원본부 총무팀
    name: string;             // 박영협
    title?: string;           // 과장
    phone: string;            // 02-1234-5678
    fax?: string;
    email: string;
  };

  /** 문서번호 — "{부서코드}-{YYYY}-{일련번호}" 형식. e.g. "총무팀-2026-00027" */
  docNo: string;
  /** 발송일 (ISO yyyy-MM-dd) */
  sendDate: string;
  /** 수신처 — "인천경찰서장" 등. 사용자가 입력 또는 item.issuer 에서 추출 */
  recipient: string;
}

/* ────────────────── 공통 CSS ────────────────── */

const PAGE_CSS = `
  * { box-sizing: border-box; }
  .page {
    width: ${A4_W}px;
    min-height: ${A4_H}px;
    padding: 56px 64px 96px;
    background: #fff;
    position: relative;
    font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
    color: #111;
    font-size: 13px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  /* ── 공문 영역 ── */
  .page-no {
    position: absolute; top: 56px; right: 64px;
    font-size: 11px; color: #6b7280;
    letter-spacing: 0.12em;
    font-family: 'Consolas', monospace;
  }
  .doc-head { text-align: center; margin-bottom: 24px; }
  .doc-head .org-name {
    font-size: 22px; font-weight: 700; letter-spacing: 0.02em;
    color: #111; line-height: 1.1;
  }

  .meta-block { margin: 0 0 18px; padding: 4px 0 8px; }
  .meta-block .row {
    display: grid; grid-template-columns: 78px 1fr;
    padding: 5px 0; font-size: 13.5px; align-items: baseline;
  }
  .meta-block .k {
    color: #111; font-weight: 500; letter-spacing: 0.02em;
  }
  .meta-block .row.title {
    border-bottom: 1px solid #111; padding-bottom: 9px;
  }
  .meta-block .row.title .v { font-weight: 600; }

  .body p { margin: 0 0 8px; line-height: 1.85; }

  .arrow {
    text-align: center; color: #111; font-weight: 600;
    margin: 18px 0 12px; letter-spacing: 0.4em; font-size: 12px;
  }

  .table-caption {
    text-align: right; font-size: 12px; color: #4b5563;
    margin: 4px 2px 6px;
  }
  .table-caption strong { color: ${NAVY}; font-weight: 700; margin: 0 2px; }

  /* 위반 표 */
  table.box {
    width: 100%; border-collapse: collapse; table-layout: auto;
  }
  table.box th, table.box td {
    border: 1px solid #c4c4c4; padding: 8px 12px;
    font-size: 12.5px; line-height: 1.5; vertical-align: middle;
  }
  table.box th {
    background: #f7f8fa; font-weight: 600; color: #111;
    text-align: center; font-size: 12px;
  }
  table.box .num-col { text-align: center; width: 32px; color: #6b7280; }

  .cont-marker {
    text-align: center; font-size: 11px; color: #6b7280;
    letter-spacing: 0.16em; margin: 14px 0;
  }

  .attach {
    margin-top: 18px; padding: 10px 14px;
    background: #f7f8fa; border-left: 3px solid #111; font-size: 12.5px;
  }
  .attach strong { font-weight: 600; margin-right: 8px; }

  /* 발신명의 */
  .sender-name {
    text-align: center; font-size: 22px; font-weight: 700;
    letter-spacing: 0.04em; margin: 36px 0 26px; color: #111;
  }

  /* 직인 슬롯 (공문/확인서 공통) */
  .seal-slot {
    display: inline-flex; align-items: center; justify-content: center;
    vertical-align: middle; margin-left: 12px; letter-spacing: normal;
  }
  .seal-slot .seal-png {
    width: 80px; height: 80px; object-fit: contain;
    transform: rotate(-4deg);
  }
  .seal-slot .seal-fallback {
    display: inline-block; font-size: 11px; font-weight: 500;
    color: #6b7280; letter-spacing: 0.04em;
    border: 1px solid #c4c4c4; padding: 3px 9px; border-radius: 2px;
  }

  /* 페이지 footer (하단 고정, 매 페이지 반복) */
  .page-footer {
    position: absolute;
    left: 64px; right: 64px; bottom: 36px;
    border-top: 1px solid #e5e7eb;
    padding-top: 10px;
    font-size: 11px; color: #111;
    line-height: 1.75; letter-spacing: 0.01em;
  }
  .page-footer .row { display: flex; gap: 16px; }
  .page-footer .k {
    color: #6b7280; letter-spacing: 0.2em; margin-right: 8px;
  }
  .page-footer .sep { color: #9ca3af; margin: 0 8px; }

  /* ── 확인서 영역 ── */
  .conf-head {
    display: flex; justify-content: space-between; align-items: baseline;
    padding-bottom: 14px; border-bottom: 1px solid #e5e7eb;
    margin-bottom: 30px;
  }
  .conf-head .brand {
    font-size: 12px; font-weight: 600; color: #111; letter-spacing: 0.02em;
  }
  .conf-title {
    font-size: 26px; font-weight: 700; letter-spacing: -0.01em;
    margin: 0 0 6px; color: #111;
  }
  .conf-subtitle {
    font-size: 12px; color: #6b7280; margin-bottom: 8px;
  }

  .info-section { margin-top: 22px; }
  .info-section .head {
    font-size: 10.5px; color: #6b7280; font-weight: 600;
    letter-spacing: 0.18em; text-transform: uppercase;
    margin-bottom: 10px; padding-left: 10px;
    border-left: 3px solid ${NAVY}; line-height: 1.2;
  }
  table.kv-table {
    width: 100%; border-collapse: collapse;
    border-top: 1px solid ${NAVY}; border-bottom: 1px solid #c4c4c4;
    font-size: 12.5px;
  }
  table.kv-table td {
    padding: 8px 12px; border-bottom: 1px solid #e5e7eb;
    vertical-align: middle; line-height: 1.5;
  }
  table.kv-table tr:last-child td { border-bottom: none; }
  table.kv-table td.k {
    background: #fafbfc; color: #6b7280;
    font-size: 11.5px; font-weight: 500;
    width: 110px; letter-spacing: 0.02em;
  }
  table.kv-table td.v.mono {
    font-family: 'Consolas', monospace;
    font-size: 12.5px; letter-spacing: 0.02em;
  }
  .tag {
    display: inline-block; background: #f7f8fa; color: #4b5563;
    font-size: 10.5px; font-weight: 500; padding: 2px 9px;
    border-radius: 3px; letter-spacing: 0.02em;
    margin-left: 6px; vertical-align: middle;
  }

  .pledge {
    margin: 24px 0 0; padding: 14px 18px;
    border: 1px solid #c4c4c4; background: #f7f8fa;
    line-height: 1.85; font-size: 12.5px;
  }
  .pledge .em { color: ${NAVY}; font-weight: 600; }

  .evidence {
    margin-top: 14px; padding: 10px 14px;
    border-left: 3px solid ${NAVY}; background: #fafbfc;
    font-size: 11.5px; color: #4b5563; line-height: 1.7;
  }
  .evidence-row { display: flex; gap: 14px; align-items: baseline; }
  .evidence-row .k {
    color: #111; font-weight: 600;
    letter-spacing: 0.04em; min-width: 80px;
  }
  .evidence-row .weak { color: #6b7280; }

  /* 확인서 signoff (양 당사자) */
  .signoff {
    margin-top: 40px; margin-bottom: 100px; text-align: center;
  }
  .signoff .row {
    display: flex; justify-content: space-between;
    align-items: flex-end; gap: 32px; text-align: left;
  }
  .party .role {
    font-size: 11px; color: #6b7280; margin-bottom: 6px;
  }
  .party .name-line {
    display: inline-flex; align-items: center; gap: 14px;
  }
  .party .name {
    font-size: 17px; font-weight: 700; letter-spacing: 0.01em;
  }
`;

/* ────────────────── 직인 / 서명 슬롯 ────────────────── */

function sealSlot(pngUrl: string | undefined, fallback: string): string {
  if (pngUrl) {
    return `<span class="seal-slot"><img class="seal-png" src="${escapeHtml(pngUrl)}" alt=""></span>`;
  }
  return `<span class="seal-slot"><span class="seal-fallback">${escapeHtml(fallback)}</span></span>`;
}

/* ────────────────── footer (매 페이지 동일) ────────────────── */

function renderFooter(ctx: IssueContext): string {
  const { staff, company, hqAddress, homepage, docNo, sendDate } = ctx;
  return `
    <div class="page-footer">
      <div class="row">
        <div>
          <span class="k">문서번호</span>${escapeHtml(docNo)}
          <span class="sep">/</span>
          <span class="k">발송일</span>${escapeHtml(formatKRDate(sendDate))}
        </div>
      </div>
      <div class="row">
        <div>
          <span class="k">담당부서</span>${escapeHtml(staff.department)}
          <span class="sep">/</span>
          <span class="k">담당자</span>${escapeHtml(`${staff.name}${staff.title ? ' ' + staff.title : ''}`)}
          <span class="sep">/</span>
          <span class="k">전화</span>${escapeHtml(staff.phone)}
          ${staff.fax ? `<span class="sep">/</span><span class="k">팩스</span>${escapeHtml(staff.fax)}` : ''}
          <span class="sep">/</span>
          ${escapeHtml(staff.email)}
        </div>
      </div>
      <div class="row">
        <div>
          <span class="k">본사</span>${escapeHtml(hqAddress || company.hqAddress)}
          ${homepage ? `<span class="sep">/</span>${escapeHtml(homepage)}` : ''}
        </div>
      </div>
    </div>
  `;
}

/* ────────────────── 위반 표 한 행 ────────────────── */

function renderRow(item: PenaltyWorkItem, no: number): string {
  const violDate = formatShortDate(item.date);
  const violTime = extractTime(item.date);
  const startDate = formatShortDate(item._contract?.start_date);
  const endDate = formatShortDate(item._contract?.end_date);
  const tenant = item._contract?.contractor_name || '미매칭';
  const desc = item.description || '—';
  const loc = item.location || '';
  const amount = item.amount ? item.amount.toLocaleString() : '—';

  return `
    <tr>
      <td class="num-col">${no}</td>
      <td>${escapeHtml(item.car_number)}</td>
      <td>${escapeHtml(tenant)}</td>
      <td>${escapeHtml(startDate)}</td>
      <td style="text-align:center;font-weight:700;color:${NAVY};font-variant-numeric:tabular-nums;">
        ${escapeHtml(violDate)}${violTime ? `<br><span style="font-size:11px;font-weight:600;">${escapeHtml(violTime)}</span>` : ''}
      </td>
      <td>${escapeHtml(endDate)}</td>
      <td>
        ${escapeHtml(desc)}
        ${loc ? `<br><span style="font-size:11px;color:#6b7280;">${escapeHtml(loc)}</span>` : ''}
      </td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;">${escapeHtml(amount)}</td>
    </tr>
  `;
}

function renderTableHeader(): string {
  return `
    <colgroup>
      <col style="width:30px"><col style="width:74px"><col style="width:64px">
      <col style="width:80px"><col style="width:108px"><col style="width:80px">
      <col><col style="width:72px">
    </colgroup>
    <tr>
      <th>No</th><th>차량번호</th><th>임차인</th>
      <th>계약시작</th><th style="background:#eef1f7;">위반일시</th><th>계약종료</th>
      <th>위반내용</th><th>금액(원)</th>
    </tr>
  `;
}

/* ────────────────── 공문 페이지 ────────────────── */

export interface OfficialPageArgs {
  ctx: IssueContext;
  /** 이 페이지에 그릴 항목들 (전체가 아닌 page slice) */
  pageItems: PenaltyWorkItem[];
  /** 전체 항목 수 (caption "총 N건" 표시용) */
  totalCount: number;
  /** 1-base 현재 페이지 번호 */
  pageNo: number;
  /** 전체 페이지 수 (공문만) */
  totalPages: number;
  /** 시작 No (이 페이지 첫 행의 일련번호) */
  startNo: number;
}

/** 공문 한 페이지 HTML 렌더 */
export function renderOfficialPageHtml(args: OfficialPageArgs): string {
  const { ctx, pageItems, totalCount, pageNo, totalPages, startNo } = args;
  const isFirstPage = pageNo === 1;
  const isLastPage = pageNo === totalPages;

  const rows = pageItems
    .map((item, idx) => renderRow(item, startNo + idx))
    .join('');

  const pageNoMarker = totalPages > 1
    ? `<div class="page-no">${pageNo} / ${totalPages}</div>` : '';

  const headerSection = isFirstPage ? `
    <div class="doc-head">
      <div class="org-name">${escapeHtml(ctx.company.name)}</div>
    </div>

    <div class="meta-block">
      <div class="row"><div class="k">수신</div><div class="v">${escapeHtml(ctx.recipient)}</div></div>
      <div class="row title"><div class="k">제목</div><div class="v">과태료(범칙금) 변경부과 요청 (${totalCount}건)</div></div>
    </div>

    <div class="body">
      <p>1. 귀 기관의 무궁한 발전을 기원하며, 평소 교통 업무 처리에 노고가 많으심에 깊은 감사를 드립니다.</p>
      <p>2. 귀 기관에서 당사에 부과한 과태료 고지서를 확인한 결과, 위반 당시 해당 차량은 자동차 임대차 계약에 따라 임차인이 직접 인수하여 운행 중이었던 것으로 확인되었습니다.</p>
      <p>3. 이에 실제 위반 주체인 임차인에게 과태료가 부과될 수 있도록 관련 증빙 서류를 제출하오니, 확인 후 재부과 조치하여 주시기 바랍니다.</p>
    </div>

    <div class="arrow">- 아 래 -</div>

    <div class="table-caption">총 <strong>${totalCount}건</strong></div>
  ` : `
    <div class="cont-marker" style="margin-top: 0;">— 앞 장에서 계속 —</div>
  `;

  const continuationMarker = !isLastPage
    ? `<div class="cont-marker">— 다음 장에 계속 —</div>` : '';

  const closingSection = isLastPage ? `
    <div class="attach">
      <strong>붙임</strong> 1. 건별 임대차계약 사실확인서 ${totalCount}부.&nbsp;&nbsp;
      2. 건별 과태료 고지서 사본 ${totalCount}부.&nbsp;&nbsp;끝.
    </div>

    <div class="sender-name">
      ${escapeHtml(ctx.company.name)}
      ${sealSlot(ctx.sealPngUrl, '[전자직인]')}
    </div>
  ` : '';

  return `
<style>${PAGE_CSS}</style>
<div class="page">
  ${pageNoMarker}
  ${headerSection}

  <table class="box"${isFirstPage ? '' : ' style="margin-top: 8px;"'}>
    ${renderTableHeader()}
    ${rows}
  </table>

  ${continuationMarker}
  ${closingSection}

  ${renderFooter(ctx)}
</div>
  `.trim();
}

/* ────────────────── 확인서 페이지 ────────────────── */

export interface ConfirmationArgs {
  ctx: IssueContext;
  item: PenaltyWorkItem;
  /** 임차인 서명 PNG (계약 시 받은 전자서명, 없으면 자동 [전자서명] 라벨) */
  contractorSignaturePng?: string;
  /** 전자계약 체결일 + 문서번호 (있으면 evidence 박스에 표시) */
  electronicContract?: { date: string; docNo: string };
  /** 확인서 발급번호 (e.g. "JPK-CONF-2026-0429-001") */
  confirmationDocNo: string;
  /** 자동차등록증 추가 항목 (asset 레코드에 채워져 있어야) */
  vehicleDetails?: {
    manufacturer?: string;
    car_name?: string;
    vin?: string;        // 차대번호
    year?: string;       // 연식
    color?: string;      // 색상
    fuel?: string;       // 사용연료
  };
}

export function renderConfirmationHtml(args: ConfirmationArgs): string {
  const { ctx, item, contractorSignaturePng, electronicContract, confirmationDocNo, vehicleDetails } = args;
  const c = item._contract ?? {};
  const v = vehicleDetails ?? {};

  const carName = v.car_name || item._asset?.detail_model || item._asset?.car_model || '—';
  const startDate = formatKRDate(c.start_date);
  const endDate = formatKRDate(c.end_date);

  // 임차인 정보
  const tenantTable = `
    <table class="kv-table">
      <colgroup><col style="width:110px"><col><col style="width:110px"><col></colgroup>
      <tr>
        <td class="k">성명</td><td class="v">${dash(c.contractor_name)} ${c.contractor_kind ? `<span class="tag">${escapeHtml(c.contractor_kind)}</span>` : ''}</td>
        <td class="k">연락처</td><td class="v mono">${dash(c.contractor_phone)}</td>
      </tr>
      <tr>
        <td class="k">${c.contractor_kind === '법인' ? '법인등록번호' : '주민등록번호'}</td>
        <td class="v mono">${dash(c.contractor_ident)}</td>
        <td class="k">면허번호</td><td class="v mono">—</td>
      </tr>
      <tr>
        <td class="k">주소</td><td class="v" colspan="3">${dash(c.contractor_address)}</td>
      </tr>
    </table>
  `;

  // 차량 정보
  const vehicleTable = `
    <table class="kv-table">
      <colgroup><col style="width:110px"><col><col style="width:110px"><col></colgroup>
      <tr>
        <td class="k">자동차등록번호</td><td class="v mono">${escapeHtml(item.car_number)}</td>
        <td class="k">제조사</td><td class="v">${dash(v.manufacturer || item._asset?.manufacturer)}</td>
      </tr>
      <tr>
        <td class="k">차명</td><td class="v" colspan="3">${escapeHtml(carName)}</td>
      </tr>
      <tr>
        <td class="k">차대번호</td><td class="v mono">${dash(v.vin)}</td>
        <td class="k">연식</td><td class="v mono">${dash(v.year)}</td>
      </tr>
      <tr>
        <td class="k">색상</td><td class="v">${dash(v.color)}</td>
        <td class="k">사용연료</td><td class="v">${dash(v.fuel)}</td>
      </tr>
    </table>
  `;

  // 계약 기간
  const periodTable = `
    <table class="kv-table">
      <colgroup><col style="width:110px"><col><col style="width:110px"><col></colgroup>
      <tr>
        <td class="k">시작일</td><td class="v mono">${escapeHtml(startDate)}</td>
        <td class="k">종료일</td><td class="v mono">${escapeHtml(endDate)}</td>
      </tr>
      <tr>
        <td class="k">계약유형</td>
        <td class="v" colspan="3">${dash(c.product_type || '장기렌트')}</td>
      </tr>
    </table>
  `;

  // 전자계약 근거 박스
  const evidenceBox = electronicContract ? `
    <div class="evidence">
      <div class="evidence-row">
        <span class="k">발급 근거</span>
        <span>본 확인서는 임차인의 <strong>전자서명</strong>이 포함된 자동차 임대차 전자계약을 기반으로 발급됩니다.</span>
      </div>
      <div class="evidence-row">
        <span class="k">계약 체결일</span>
        <span>${escapeHtml(formatKRDate(electronicContract.date))} <span class="weak">/ 전자계약 문서번호 ${escapeHtml(electronicContract.docNo)}</span></span>
      </div>
      <div class="evidence-row">
        <span class="k">서명 · 날인</span>
        <span>본 문서는 <strong>전자서명·전자직인</strong>으로 갈음하여 발급된 전자문서입니다.</span>
      </div>
    </div>
  ` : '';

  // footer 는 confirmationDocNo 로 override
  const confirmationCtx: IssueContext = { ...ctx, docNo: confirmationDocNo, sendDate: ctx.sendDate };
  // footer 라벨은 확인서 톤으로 살짝 조정 — 그냥 같은 함수 쓰되 별도 footer 만들 수도 있음

  return `
<style>${PAGE_CSS}</style>
<div class="page">
  <div class="conf-head">
    <div class="brand">${escapeHtml(ctx.company.name)}</div>
  </div>

  <h1 class="conf-title">자동차 임대차 계약 사실 확인서</h1>
  <div class="conf-subtitle">VEHICLE LEASE AGREEMENT CONFIRMATION</div>

  <div class="info-section">
    <div class="head">임차인</div>
    ${tenantTable}
  </div>

  <div class="info-section">
    <div class="head">계약 차량</div>
    ${vehicleTable}
  </div>

  <div class="info-section">
    <div class="head">계약 기간</div>
    ${periodTable}
  </div>

  <div class="pledge">
    당사는 위 임차인과 위 차량(<strong>${escapeHtml(item.car_number)}</strong>)에 대하여
    상기 계약기간(<strong>${escapeHtml(startDate)}</strong> ~ <strong>${escapeHtml(endDate)}</strong>)에
    걸친 자동차 임대차 계약을 체결하였으며, 해당 기간 중 위 차량이 임차인에게 인도되어
    점유·사용되었음을 <span class="em">사실</span>대로 확인합니다.
  </div>

  ${evidenceBox}

  <div class="signoff">
    <div class="row">
      <div class="party">
        <div class="role">임차인 (계약자)</div>
        <div class="name-line">
          <span class="name">${dash(c.contractor_name)}</span>
          ${sealSlot(contractorSignaturePng, '[전자서명]')}
        </div>
      </div>

      <div class="party">
        <div class="role">임대인</div>
        <div class="name-line">
          <span class="name">${escapeHtml(ctx.company.name)}</span>
          ${sealSlot(ctx.sealPngUrl, '[전자직인]')}
        </div>
      </div>
    </div>
  </div>

  ${renderFooter(confirmationCtx)}
</div>
  `.trim();
}

/* ────────────────── html2canvas 캡쳐 ────────────────── */

export async function htmlToImage(html: string): Promise<string> {
  const html2canvas = (await import('html2canvas')).default;
  const div = document.createElement('div');
  div.style.position = 'fixed';
  div.style.left = '-99999px';
  div.style.top = '0';
  div.style.width = `${A4_W}px`;
  div.style.height = `${A4_H}px`;
  div.innerHTML = html;
  document.body.appendChild(div);
  try {
    const canvas = await html2canvas(div, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
    });
    return canvas.toDataURL('image/jpeg', 0.92);
  } finally {
    document.body.removeChild(div);
  }
}

export const A4_PIXELS = { w: A4_W, h: A4_H };
export const ROWS_PER_OFFICIAL_PAGE = 13; // 20-건 샘플 기준 검증된 값
