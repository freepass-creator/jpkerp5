'use client';

/**
 * 계약서 양식 검수 페이지.
 * 좌측: 입력 사이드 패널
 * 우측: A4 미리보기 (Paged.js로 페이지 분할 + @page 정밀 마진/번호)
 *
 * 양식 확정 후 /contract/[contractId] 에 같은 구조 적용.
 */

import { useCallback, useEffect, useState } from 'react';
import { Printer, FloppyDisk } from '@phosphor-icons/react';
import { todayKr } from '@/lib/mock-data';
import { stripCorpSuffix } from '@/lib/company-display';

/* ─── 자동 연동 헬퍼 ─── */
function addMonths(yyyymmdd: string, months: number): string {
  if (!yyyymmdd) return '';
  const d = new Date(yyyymmdd);
  if (isNaN(d.getTime())) return '';
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // 말일 조정 (예: 1/31 + 1개월 = 2/28)
  if (d.getDate() !== day) d.setDate(0);
  return d.toISOString().slice(0, 10);
}
function diffMonths(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 30.4375)));
}
function fmtPhone(s: string): string {
  const d = s.replace(/\D/g, '');
  if (d.startsWith('02')) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}
function fmtIdent(s: string): string {
  const d = s.replace(/\D/g, '');
  if (d.length === 13) return `${d.slice(0, 6)}-${d.slice(6)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  if (d.length === 12) return `${d.slice(0, 6)}-${d.slice(6)}`;
  return s;
}

const STANDARD_TERMS = [
  { title: '제1조 (목적)', body: '본 계약은 임대인이 임차인에게 별지 기재 자동차(이하 "본 차량")를 임대하고, 임차인이 이에 따른 대여료를 지급하는 데 필요한 사항을 정함을 목적으로 한다.' },
  { title: '제2조 (계약기간 및 대여료)', body: '계약기간은 별지에 명시한 기간으로 하며, 대여료 및 보증금은 별지의 금액으로 한다. 대여료는 매월 지정 결제일에 임대인이 지정한 계좌로 납부한다.' },
  { title: '제3조 (차량의 인도 및 반환)', body: '① 임대인은 본 차량을 약정한 일시에 임차인에게 인도한다. ② 임차인은 계약기간 만료 시 본 차량을 인도 당시 상태로 임대인에게 반환한다.' },
  { title: '제4조 (임차인의 의무)', body: '① 임차인은 도로교통법 등 관계 법령을 준수하여 본 차량을 운행한다. ② 본 차량의 무단 양도·전대·담보 제공·개조를 할 수 없다. ③ 정기검사·소모품 교체 등 일상 관리 의무를 진다. ④ 대여료 연체 시 시동제어·계약해지·차량 회수 등의 조치가 있을 수 있음을 인지한다.' },
  { title: '제5조 (사고 및 손해)', body: '① 임차인의 과실로 발생한 사고·도난·파손에 대한 책임은 임차인이 진다. ② 자기차량손해 자기부담금, 면책금 등은 임차인이 부담한다. ③ 사고 발생 시 임차인은 즉시 임대인에게 통지하여야 한다.' },
  { title: '제6조 (보험)', body: '본 차량의 자동차보험은 임대인이 가입한다. 임차인은 보험약관에서 정한 운전자 연령·범위 등을 준수한다.' },
  { title: '제7조 (위약금 및 중도해지)', body: '① 임차인이 계약 기간 중 임의로 해지하는 경우 중도해지 위약금을 부과한다. 계약일로부터 1년 이내 보증금의 30%, 1년 초과 20%. ② 임차인의 귀책사유로 임대인이 해지하는 경우에도 위 위약금이 적용된다.' },
  { title: '제8조 (시동제어 및 회수)', body: '① 임차인이 정당한 사유 없이 대여료를 연체하거나 본 계약상 의무를 위반한 경우, 임대인은 사전 통지 후 본 차량의 시동을 원격으로 제어할 수 있다. ② 위 조치에도 시정되지 않을 경우 임대인은 본 차량을 회수할 수 있으며, 회수 비용은 임차인이 부담한다.' },
  { title: '제9조 (정기검사·과태료)', body: '① 운행 중 발생한 교통법규 위반·과태료·범칙금 등은 모두 임차인이 부담한다. ② 자동차 정기검사는 임차인이 책임지고 받으며, 미이행 시 발생하는 일체의 불이익은 임차인이 부담한다.' },
  { title: '제10조 (개인정보 처리)', body: '임대인은 「개인정보 보호법」에 따라 본 계약의 이행을 위해 임차인의 개인정보를 수집·이용하며, 보유 및 이용기간은 계약 종료 후 5년으로 한다.' },
  { title: '제11조 (기타)', body: '본 계약에 정하지 아니한 사항은 관계 법령 및 일반 상관례에 따른다. 본 계약과 관련하여 분쟁이 발생할 경우 임대인의 본점 소재지 관할 법원을 합의 관할 법원으로 한다.' },
];

const SAMPLE_COMPANY = {
  name: '스위치플랜(주)',
  ceo: '박영현',
  bizRegNo: '110-86-XXXXX',
  address: '경기도 김포시 고촌읍 아라육로 152번길 45, A동 229호',
  bank: '신한은행',
  accountNo: '140-014-386616',
  accountHolder: '스위치플랜(주)',
};

function fmtCurrency(n: number): string { return n.toLocaleString('ko-KR'); }
function fmtKDate(s: string): string {
  if (!s) return '____년 __월 __일';
  const [y, m, d] = s.split('-');
  return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`;
}
function maskIdent(ident?: string): string {
  if (!ident) return '____________';
  const digits = ident.replace(/\D/g, '');
  if (digits.length === 13) return `${digits.slice(0, 6)}-${digits.slice(6, 7)}******`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 7)}***`;
  if (digits.length === 12) return `${digits.slice(0, 6)}-${digits.slice(6, 7)}******`;
  return ident;
}

type FormType = 'full' | 'simple';

export default function ContractPreviewPage() {
  const [formType, setFormType] = useState<FormType>('full');

  // 회사
  const [coName, setCoName] = useState(SAMPLE_COMPANY.name);
  const [coCeo, setCoCeo] = useState(SAMPLE_COMPANY.ceo);
  const [coBizNo, setCoBizNo] = useState(SAMPLE_COMPANY.bizRegNo);
  const [coAddr, setCoAddr] = useState(SAMPLE_COMPANY.address);
  const [coBank, setCoBank] = useState(SAMPLE_COMPANY.bank);
  const [coAcct, setCoAcct] = useState(SAMPLE_COMPANY.accountNo);
  const [coHolder, setCoHolder] = useState(SAMPLE_COMPANY.accountHolder);

  // 임차인
  const [cName, setCName] = useState('홍길동');
  const [cIdent, setCIdent] = useState('900101-1234567');
  const [cPhone, setCPhone] = useState('010-1234-5678');
  const [cAddr, setCAddr] = useState('서울특별시 강남구 ○○로 ○○');
  const [cLicense, setCLicense] = useState('11-12-345678-90');
  const [cLicenseType, setCLicenseType] = useState('1종 보통');

  // 차량
  const [plate, setPlate] = useState('15두2255');
  const [model, setModel] = useState('스팅어');
  const [deliveryAddr, setDeliveryAddr] = useState('서울특별시 강남구 ○○로 ○○');

  // 조건
  const [contractDate, setContractDate] = useState('2026-05-29');
  const [endDate, setEndDate] = useState('2027-05-28');
  const [termMonths, setTermMonths] = useState(12);
  const [monthlyRent, setMonthlyRent] = useState(650000);
  const [deposit, setDeposit] = useState(1000000);
  const [paymentDay, setPaymentDay] = useState(25);
  const [paymentMethod, setPaymentMethod] = useState('CMS');
  // 보증금 수동 편집 여부 — 월대여료 변경 시 미편집인 경우만 자동 채움
  const [depositTouched, setDepositTouched] = useState(false);
  // 결제일 수동 편집 여부 — 인도일 변경 시 미편집인 경우만 자동 채움
  const [paymentDayTouched, setPaymentDayTouched] = useState(false);

  // 발행
  const [issuedDate, setIssuedDate] = useState('2026-05-29');
  const [specialNote, setSpecialNote] = useState('');

  /* ─── 자동 연동 핸들러 ─── */
  // 인도일자 변경 → 종료일 자동 + 결제일 자동 (미편집인 경우)
  const handleStartChange = useCallback((newStart: string) => {
    setContractDate(newStart);
    if (newStart && termMonths > 0) {
      setEndDate(addMonths(newStart, termMonths));
    }
    if (!paymentDayTouched && newStart) {
      const day = parseInt(newStart.slice(8, 10), 10);
      if (day >= 1 && day <= 31) setPaymentDay(day);
    }
  }, [termMonths, paymentDayTouched]);

  // 약정개월 변경 → 종료일 자동
  const handleTermChange = useCallback((newTerm: number) => {
    setTermMonths(newTerm);
    if (contractDate && newTerm > 0) {
      setEndDate(addMonths(contractDate, newTerm));
    }
  }, [contractDate]);

  // 종료일 직접 변경 → 약정개월 역산
  const handleEndChange = useCallback((newEnd: string) => {
    setEndDate(newEnd);
    if (contractDate && newEnd) {
      const m = diffMonths(contractDate, newEnd);
      if (m > 0) setTermMonths(m);
    }
  }, [contractDate]);

  // 월대여료 변경 → 보증금 디폴트 자동 (미편집 시 월대여료 1배)
  const handleMonthlyChange = useCallback((newRent: number) => {
    setMonthlyRent(newRent);
    if (!depositTouched && newRent > 0) {
      setDeposit(newRent);
    }
  }, [depositTouched]);

  const isLongTerm = termMonths >= 12;

  useEffect(() => { setIssuedDate(todayKr()); setContractDate(todayKr()); }, []);

  return (
    <div className="ctr-shell">
      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css');

        /* ─── 좌측 패널 ─── */
        .ctr-shell {
          font-family: 'Pretendard Variable', Pretendard, sans-serif;
          background: #fafafa;
          min-height: 100vh;
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 0;
        }
        .ctr-side {
          background: #fff;
          border-right: 1px solid #e7e5e4;
          padding: 20px 18px;
          height: 100vh;
          overflow-y: auto;
          font-size: 12px;
          position: sticky;
          top: 0;
        }
        .ctr-side h3 {
          margin: 18px 0 8px;
          font-size: 11px;
          font-weight: 600;
          color: #71717a;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .ctr-side h3:first-of-type { margin-top: 0; }
        .ctr-row { display: grid; grid-template-columns: 80px 1fr; gap: 6px; align-items: center; margin-bottom: 4px; }
        .ctr-row label { color: #a1a1aa; font-size: 11px; }
        .ctr-row input, .ctr-row select, .ctr-row textarea {
          height: 28px; padding: 0 8px; font: inherit; font-size: 12px;
          border: 1px solid #e4e4e7; border-radius: 4px; background: #fff; width: 100%;
          transition: border-color 0.15s;
        }
        .ctr-row input:focus, .ctr-row select:focus, .ctr-row textarea:focus {
          outline: none; border-color: #1B2A4A;
        }
        .ctr-row textarea { height: auto; min-height: 36px; padding: 6px 8px; resize: vertical; }
        .ctr-form-toggle { display: flex; gap: 4px; margin-bottom: 16px; padding: 4px; background: #f4f4f5; border-radius: 6px; }
        .ctr-form-toggle button {
          flex: 1; height: 30px; font: inherit; font-size: 12px;
          border: 0; background: transparent; border-radius: 4px; cursor: pointer;
          color: #52525b; font-weight: 500;
        }
        .ctr-form-toggle button.active { background: #fff; color: #1B2A4A; font-weight: 700;
          box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
        .ctr-actions { margin-top: 22px; display: flex; gap: 6px; padding-top: 16px; border-top: 1px solid #f4f4f5; }
        .ctr-actions button { flex: 1; height: 34px; font: inherit; font-size: 12px; font-weight: 600;
          border: 1px solid #e4e4e7; background: #fff; border-radius: 5px; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center; gap: 5px; color: #18181b; }
        .ctr-actions button:hover { background: #f4f4f5; }
        .ctr-actions button.primary { background: #1B2A4A; color: #fff; border-color: #1B2A4A; }
        .ctr-actions button.primary:hover { background: #0F1B35; }
        .preview-tag { display: inline-block; background: #ecfeff; color: #155e75; padding: 3px 10px; border-radius: 99px; font-size: 10px; font-weight: 600; margin-bottom: 14px; letter-spacing: 0.02em; }

        /* ─── 우측 미리보기 (Paged.js 영역) ─── */
        .ctr-preview-wrap {
          background: #e7e5e4;
          padding: 32px 24px;
          overflow-y: auto;
          height: 100vh;
          display: flex;
          justify-content: center;
          align-items: flex-start;
        }
        .ctr-paper {
          width: 794px;
          min-height: 1123px;
          background: #fff;
          padding: 60px 56px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          box-sizing: border-box;
        }

        /* @page CSS — 인쇄 시만 */
        @page {
          size: A4;
          margin: 18mm 16mm 22mm 16mm;
        }

        /* ─── 한국 자동차 임대차 계약서 디자인 ─── */
        .doc { font-family: 'Pretendard Variable', sans-serif; color: #18181b; font-size: 10.5pt; line-height: 1.65; letter-spacing: -0.005em; }

        /* 상단 헤더 — 큰 정식 제목 + 회사 정보 */
        .doc-head {
          margin-bottom: 24px;
          text-align: center;
          padding: 10px 0 20px;
          border-bottom: 3px double #18181b;
        }
        .doc-head .corp {
          font-size: 9pt;
          color: #71717a;
          margin-bottom: 6px;
          letter-spacing: 0.1em;
        }
        .doc-head h1 {
          margin: 0;
          font-size: 26pt;
          font-weight: 800;
          letter-spacing: 0.5em;
          padding-left: 0.5em;
        }
        .doc-head .sub {
          margin-top: 8px;
          font-size: 10pt;
          color: #52525b;
          font-weight: 500;
        }
        .doc-head .doc-no {
          margin-top: 10px;
          font-size: 9pt;
          color: #71717a;
          font-variant-numeric: tabular-nums;
        }

        /* 섹션 헤더 — 좌측 컬러 바 + 텍스트 */
        .doc-section { margin-top: 20px; break-inside: avoid; }
        .doc-section-label {
          font-size: 11pt;
          font-weight: 700;
          color: #18181b;
          margin-bottom: 6px;
          padding-left: 10px;
          border-left: 4px solid #1B2A4A;
          line-height: 1.2;
        }

        /* 정보 grid — 명확한 borders */
        .doc-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          border: 1px solid #18181b;
        }
        .doc-grid.single-col { grid-template-columns: 1fr; }
        .doc-field {
          display: grid;
          grid-template-columns: 100px 1fr;
          padding: 8px 12px;
          border-bottom: 1px solid #d4d4d8;
          font-size: 10pt;
          background: #fff;
        }
        .doc-field.full { grid-column: 1 / -1; }
        .doc-field .k {
          color: #52525b;
          font-size: 9.5pt;
          font-weight: 600;
          letter-spacing: 0.02em;
          background: #f4f4f5;
          margin: -8px -12px -8px -12px;
          padding: 8px 12px;
          display: flex;
          align-items: center;
        }
        .doc-field .v { color: #18181b; font-weight: 500; padding-left: 8px; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
        .doc-field .v.strong { font-weight: 700; }
        .doc-field .v.mono { font-variant-numeric: tabular-nums; }
        .doc-field .v.num { font-variant-numeric: tabular-nums; font-weight: 700; }
        .doc-field .v .muted { color: #71717a; font-weight: 400; font-size: 9.5pt; }

        /* 마지막 행 border 제거 */
        .doc-grid > .doc-field:nth-last-of-type(1),
        .doc-grid > .doc-field:nth-last-of-type(2) { border-bottom: none; }
        .doc-grid.single-col > .doc-field:nth-last-of-type(1) { border-bottom: none; }

        /* 특약 박스 */
        .doc-special {
          margin-top: 8px;
          padding: 14px 16px;
          background: #fff7ed;
          border: 1px solid #fb923c;
          border-radius: 4px;
          font-size: 10pt;
          line-height: 1.7;
          white-space: pre-line;
        }

        /* 약관 */
        .doc-terms { margin-top: 18px; font-size: 9.5pt; line-height: 1.65; columns: 1; }
        .doc-terms article { break-inside: avoid; margin-bottom: 10px; }
        .doc-terms .term-title { font-weight: 700; color: #18181b; margin-bottom: 2px; font-size: 10pt; }
        .doc-terms .term-body { color: #27272a; }

        /* 전용 안내 */
        .doc-notice { margin-top: 26px; padding: 16px 20px; background: #fafaf9; border-radius: 4px; font-size: 10pt; line-height: 1.7; color: #44403c; border: 1px dashed #d4d4d8; }
        .doc-notice .notice-label { font-size: 10pt; font-weight: 700; color: #1B2A4A; margin-bottom: 6px; }

        /* 첨부 확인 */
        .doc-attach { margin-top: 16px; padding: 12px 14px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 9.5pt; color: #52525b; }
        .doc-attach .label { font-weight: 700; color: #18181b; margin-bottom: 4px; }
        .doc-attach .checks { display: flex; flex-wrap: wrap; gap: 12px; }
        .doc-attach .check { display: inline-flex; align-items: center; gap: 4px; }
        .doc-attach .check::before {
          content: '☐';
          font-size: 12pt;
          color: #71717a;
        }

        /* 서명·날인 영역 */
        .doc-signing { margin-top: 40px; break-inside: avoid; padding-top: 24px; border-top: 2px solid #18181b; }
        .doc-signing-date {
          text-align: center;
          font-size: 14pt;
          font-weight: 700;
          margin-bottom: 32px;
          letter-spacing: 0.05em;
        }
        .doc-signing-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
        .doc-signing-parties .party {
          border: 1px solid #18181b;
          padding: 16px 18px;
          background: #fff;
          position: relative;
        }
        .doc-signing-parties .party .role {
          position: absolute;
          top: -10px;
          left: 12px;
          background: #fff;
          padding: 0 8px;
          font-size: 9pt;
          font-weight: 700;
          color: #1B2A4A;
          letter-spacing: 0.06em;
        }
        .doc-signing-parties .party .name {
          font-size: 15pt;
          font-weight: 800;
          margin: 6px 0 10px;
          padding-right: 60px;
          position: relative;
          min-height: 56px;
        }
        .doc-signing-parties .party .name .seal {
          position: absolute;
          right: 0;
          top: -6px;
          width: 56px;
          height: 56px;
          border: 2px dashed #d4d4d8;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 8pt;
          color: #a1a1aa;
          font-weight: 500;
        }
        .doc-signing-parties .party .meta { font-size: 9.5pt; color: #52525b; line-height: 1.85; }
        .doc-signing-parties .party .meta .row { display: flex; gap: 4px; }
        .doc-signing-parties .party .meta .row .k { color: #a1a1aa; min-width: 52px; }
        .doc-signing-parties .party .meta .mono { font-variant-numeric: tabular-nums; }

        /* 페이지 푸터 회사 정보 */
        .doc-foot { margin-top: 40px; text-align: center; font-size: 8.5pt; color: #a1a1aa; padding-top: 8px; border-top: 1px solid #f4f4f5; }

        /* 인쇄 시 좌측/배경 숨김, paper만 노출 */
        @media print {
          .ctr-shell { display: block; background: #fff; }
          .ctr-side { display: none; }
          .ctr-preview-wrap { padding: 0; background: #fff; height: auto; overflow: visible; display: block; }
          .ctr-paper { width: auto; min-height: auto; padding: 0; box-shadow: none; }
        }
      `}</style>

      {/* 좌측 입력 패널 */}
      <aside className="ctr-side">
        <span className="preview-tag">미리보기 · 더미 데이터</span>

        <div className="ctr-form-toggle">
          <button type="button" className={formType === 'full' ? 'active' : ''} onClick={() => setFormType('full')}>정식 계약서</button>
          <button type="button" className={formType === 'simple' ? 'active' : ''} onClick={() => setFormType('simple')}>전용 계약서</button>
        </div>

        <h3>발행</h3>
        <div className="ctr-row"><label>작성일</label><input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} /></div>

        <h3>임대인 (회사)</h3>
        <div className="ctr-row"><label>상호</label><input value={coName} onChange={(e) => setCoName(e.target.value)} /></div>
        <div className="ctr-row"><label>대표자</label><input value={coCeo} onChange={(e) => setCoCeo(e.target.value)} /></div>
        <div className="ctr-row"><label>사업자번호</label><input value={coBizNo} onChange={(e) => setCoBizNo(e.target.value)} /></div>
        <div className="ctr-row"><label>주소</label><textarea value={coAddr} onChange={(e) => setCoAddr(e.target.value)} /></div>
        <div className="ctr-row"><label>은행</label><input value={coBank} onChange={(e) => setCoBank(e.target.value)} /></div>
        <div className="ctr-row"><label>계좌번호</label><input value={coAcct} onChange={(e) => setCoAcct(e.target.value)} /></div>
        <div className="ctr-row"><label>예금주</label><input value={coHolder} onChange={(e) => setCoHolder(e.target.value)} /></div>

        <h3>임차인 (손님)</h3>
        <div className="ctr-row"><label>성명</label><input value={cName} onChange={(e) => setCName(e.target.value)} /></div>
        <div className="ctr-row"><label>등록번호</label>
          <input
            value={cIdent}
            onChange={(e) => setCIdent(fmtIdent(e.target.value))}
            placeholder="900101-1234567"
            inputMode="numeric"
          />
        </div>
        <div className="ctr-row"><label>연락처</label>
          <input
            value={cPhone}
            onChange={(e) => setCPhone(fmtPhone(e.target.value))}
            placeholder="010-1234-5678"
            inputMode="tel"
          />
        </div>
        <div className="ctr-row"><label>주소</label><textarea value={cAddr} onChange={(e) => setCAddr(e.target.value)} /></div>
        <div className="ctr-row"><label>면허번호</label><input value={cLicense} onChange={(e) => setCLicense(e.target.value)} placeholder="11-12-345678-90" /></div>
        <div className="ctr-row"><label>면허종</label>
          <select value={cLicenseType} onChange={(e) => setCLicenseType(e.target.value)}>
            <option>1종 보통</option><option>1종 대형</option><option>1종 소형</option>
            <option>2종 보통</option><option>2종 소형</option><option>2종 원동기</option>
          </select>
        </div>

        <h3>차량 · 인도</h3>
        <div className="ctr-row"><label>차량번호</label><input value={plate} onChange={(e) => setPlate(e.target.value.replace(/\s+/g, ''))} placeholder="15두2255" /></div>
        <div className="ctr-row"><label>차종</label><input value={model} onChange={(e) => setModel(e.target.value)} placeholder="스팅어" /></div>
        <div className="ctr-row"><label>인도 장소</label><textarea value={deliveryAddr} onChange={(e) => setDeliveryAddr(e.target.value)} /></div>

        <h3>
          대여 조건
          {termMonths > 0 && (
            <span style={{ marginLeft: 8, padding: '1px 6px', background: isLongTerm ? '#dbeafe' : '#fef9c3', color: isLongTerm ? '#1e40af' : '#854d0e', borderRadius: 3, fontSize: 9, fontWeight: 600, letterSpacing: 0 }}>
              {isLongTerm ? '장기' : '단기'}
            </span>
          )}
        </h3>
        <div className="ctr-row"><label>인도일자</label><input type="date" value={contractDate} onChange={(e) => handleStartChange(e.target.value)} /></div>
        <div className="ctr-row"><label>약정개월</label>
          <input type="number" value={termMonths} onChange={(e) => handleTermChange(Number(e.target.value) || 0)} />
        </div>
        <div className="ctr-row"><label>계약종료</label>
          <input type="date" value={endDate} onChange={(e) => handleEndChange(e.target.value)} />
        </div>
        <div className="ctr-row"><label>월 대여료</label>
          <input
            type="text"
            inputMode="numeric"
            value={monthlyRent ? monthlyRent.toLocaleString() : ''}
            onChange={(e) => handleMonthlyChange(parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0)}
            placeholder="원 단위"
          />
        </div>
        <div className="ctr-row"><label>보증금
          {!depositTouched && monthlyRent > 0 && (
            <div style={{ fontSize: 9, color: '#a1a1aa', marginTop: 1 }}>자동: 월대여료 × 1</div>
          )}
        </label>
          <input
            type="text"
            inputMode="numeric"
            value={deposit ? deposit.toLocaleString() : ''}
            onChange={(e) => { setDeposit(parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0); setDepositTouched(true); }}
            placeholder="원 단위"
          />
        </div>
        <div className="ctr-row"><label>결제일
          {!paymentDayTouched && contractDate && (
            <div style={{ fontSize: 9, color: '#a1a1aa', marginTop: 1 }}>자동: 인도일</div>
          )}
        </label>
          <input
            type="number" min={1} max={31}
            value={paymentDay}
            onChange={(e) => { setPaymentDay(Number(e.target.value) || 1); setPaymentDayTouched(true); }}
          />
        </div>
        <div className="ctr-row"><label>결제방법</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option>CMS</option><option>이체</option><option>카드</option><option>현금</option><option>후불</option>
          </select>
        </div>

        <h3>특약</h3>
        <textarea value={specialNote} onChange={(e) => setSpecialNote(e.target.value)} placeholder="추가 특약 사항 (있을 경우만)" style={{ minHeight: 60, width: '100%', padding: 8, fontSize: 12, fontFamily: 'inherit', border: '1px solid #e4e4e7', borderRadius: 4, resize: 'vertical' }} />

        <div className="ctr-actions">
          <button type="button" disabled title="더미 데이터 — 발행 기록 비활성">
            <FloppyDisk size={13} /> 기록
          </button>
          <button type="button" className="primary" onClick={() => window.print()}>
            <Printer size={13} /> 인쇄
          </button>
        </div>
      </aside>

      {/* 우측 미리보기 (A4 직접 렌더) */}
      <div className="ctr-preview-wrap">
        <div className="ctr-paper">
        <div className="doc">
          <div className="doc-head">
            <div className="corp">{stripCorpSuffix(coName)}</div>
            <h1>{formType === 'full' ? '자동차 대여 계약서' : '자동차 대여 계약서'}</h1>
            <div className="sub">{formType === 'full' ? '표준약관에 따른 정식 계약' : '약식 계약 · 표준약관 준용'}</div>
            <div className="doc-no">계약번호 No. {plate || '___'}-{contractDate.replace(/-/g, '')}</div>
          </div>

          <div className="doc-section">
            <div className="doc-section-label">제1관 · 계약 당사자</div>
            <div className="doc-grid single-col">
              <div className="doc-field">
                <span className="k">임대인</span>
                <span className="v strong">{stripCorpSuffix(coName)} <span className="muted">· 대표 {coCeo}</span></span>
              </div>
              <div className="doc-field">
                <span className="k">사업자등록번호</span>
                <span className="v mono">{coBizNo}</span>
              </div>
              <div className="doc-field">
                <span className="k">소재지</span>
                <span className="v">{coAddr}</span>
              </div>
              <div className="doc-field">
                <span className="k">임차인</span>
                <span className="v strong">{cName} <span className="muted">· {maskIdent(cIdent)}</span></span>
              </div>
              <div className="doc-field">
                <span className="k">연락처</span>
                <span className="v mono">{cPhone}</span>
              </div>
              <div className="doc-field">
                <span className="k">주소</span>
                <span className="v">{cAddr}</span>
              </div>
              <div className="doc-field">
                <span className="k">면허</span>
                <span className="v mono">{cLicense} <span className="muted">({cLicenseType})</span></span>
              </div>
            </div>
          </div>

          <div className="doc-section">
            <div className="doc-section-label">제2관 · 임대 차량</div>
            <div className="doc-grid">
              <div className="doc-field"><span className="k">차량번호</span><span className="v strong mono">{plate || '미정'}</span></div>
              <div className="doc-field"><span className="k">차종</span><span className="v">{model}</span></div>
              <div className="doc-field"><span className="k">인도일자</span><span className="v mono">{contractDate}</span></div>
              <div className="doc-field"><span className="k">인도 장소</span><span className="v">{deliveryAddr || '_______________'}</span></div>
            </div>
          </div>

          <div className="doc-section">
            <div className="doc-section-label">제3관 · 대여 조건</div>
            <div className="doc-grid single-col">
              <div className="doc-field">
                <span className="k">계약기간</span>
                <span className="v">{fmtKDate(contractDate)} ~ {fmtKDate(endDate)} <span className="muted">· 총 {termMonths}개월 {termMonths >= 12 ? '(장기)' : '(단기)'}</span></span>
              </div>
            </div>
            <div className="doc-grid" style={{ marginTop: 0, borderTop: 0 }}>
              <div className="doc-field"><span className="k">월 대여료</span><span className="v num">₩ {fmtCurrency(monthlyRent)}</span></div>
              <div className="doc-field"><span className="k">보증금</span><span className="v num">₩ {fmtCurrency(deposit)}</span></div>
              <div className="doc-field"><span className="k">결제일</span><span className="v">매월 {paymentDay}일</span></div>
              <div className="doc-field"><span className="k">결제방법</span><span className="v">{paymentMethod}</span></div>
            </div>
            <div className="doc-grid single-col" style={{ marginTop: 0, borderTop: 0 }}>
              <div className="doc-field">
                <span className="k">납부 계좌</span>
                <span className="v mono">{coBank} {coAcct} <span className="muted">· 예금주 {coHolder}</span></span>
              </div>
            </div>
          </div>

          <div className="doc-attach">
            <div className="label">첨부 서류 확인 · CHECK BEFORE SIGN</div>
            <div className="checks">
              <span className="check">임차인 신분증 사본</span>
              <span className="check">운전면허증 사본</span>
              <span className="check">자동차등록증</span>
              <span className="check">보증금 입금 확인</span>
            </div>
          </div>

          {specialNote && (
            <div className="doc-section">
              <div className="doc-section-label">특약 사항</div>
              <div className="doc-special">{specialNote}</div>
            </div>
          )}

          {formType === 'full' && (
            <div className="doc-section">
              <div className="doc-section-label">표준 약관</div>
              <div className="doc-terms">
                {STANDARD_TERMS.map((t) => (
                  <article key={t.title}>
                    <div className="term-title">{t.title}</div>
                    <div className="term-body">{t.body}</div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {formType === 'simple' && (
            <div className="doc-notice">
              <div className="notice-label">안내</div>
              본 계약은 임대인·임차인 간 신뢰관계를 바탕으로 한 약식 계약서로, 자동차 대여 표준약관(별도 약정)에 준하여 운영됩니다. 연체·사고·과태료·정기검사 등에 관한 책임은 표준약관에 따릅니다. 중도해지 시 잔여 대여료의 일정 비율을 위약금으로 부과할 수 있습니다.
            </div>
          )}

          <div className="doc-signing">
            <div className="doc-signing-date">{fmtKDate(issuedDate)}</div>
            <div className="doc-signing-parties">
              <div className="party">
                <div className="role">임 대 인 · LESSOR</div>
                <div className="name">{stripCorpSuffix(coName)} <span className="seal">인</span></div>
                <div className="meta">
                  <div className="row"><span className="k">대표</span><span>{coCeo}</span></div>
                  <div className="row"><span className="k">사업자</span><span className="mono">{coBizNo}</span></div>
                  <div className="row"><span className="k">주소</span><span>{coAddr}</span></div>
                </div>
              </div>
              <div className="party">
                <div className="role">임 차 인 · LESSEE</div>
                <div className="name">{cName} <span className="seal">인</span></div>
                <div className="meta">
                  <div className="row"><span className="k">등록번호</span><span className="mono">{maskIdent(cIdent)}</span></div>
                  <div className="row"><span className="k">연락처</span><span className="mono">{cPhone}</span></div>
                  <div className="row"><span className="k">주소</span><span>{cAddr}</span></div>
                </div>
              </div>
            </div>
          </div>

          <div className="doc-foot">
            {stripCorpSuffix(coName)} · 사업자등록번호 {coBizNo} · {coAddr}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
