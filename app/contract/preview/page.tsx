'use client';

/**
 * 계약서 양식 검수 페이지.
 * 좌측: 입력 사이드 패널
 * 우측: A4 시설대여 계약서 (스위치플랜 기존 양식 기반)
 *
 * 기존 PDF 3개 분석 결과 — 시설대여 계약서 본문 (PDF 3페이지) 베이스로 작업.
 * 추후 보험/정비 (4p) / 사실확인서 (5p) / 동의서 (6p) / 운전자격 (7p) / 인수증 (8p) / 약관 (10-13p) 추가 가능.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Printer, FilePdf, FloppyDisk } from '@phosphor-icons/react';
import { todayKr } from '@/lib/mock-data';
import { stripCorpSuffix } from '@/lib/company-display';
import { toast } from '@/lib/toast';

/* ─── PDF 생성 (freepasserp3 패턴 차용) ─── */
const CDN = {
  html2canvas: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
  jsPDF: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
};
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`스크립트 로드 실패: ${src}`));
    document.head.appendChild(s);
  });
}
async function paperToPdf(paper: HTMLElement, filename: string): Promise<void> {
  await loadScript(CDN.html2canvas);
  await loadScript(CDN.jsPDF);
  const html2canvas = (window as unknown as { html2canvas: (el: HTMLElement, opts: Record<string, unknown>) => Promise<HTMLCanvasElement> }).html2canvas;
  const jsPDF = (window as unknown as { jspdf: { jsPDF: new (opts: Record<string, unknown>) => {
    internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
    addImage: (canvas: HTMLCanvasElement, fmt: string, x: number, y: number, w: number, h: number, alias?: string, comp?: string) => void;
    addPage: () => void;
    save: (name: string) => void;
  } }}).jspdf.jsPDF;

  const canvas = await html2canvas(paper, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    windowWidth: paper.scrollWidth,
    windowHeight: paper.scrollHeight,
  });
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;
  let remaining = imgH;
  let position = 0;
  pdf.addImage(canvas, 'JPEG', 0, position, imgW, imgH, '', 'FAST');
  remaining -= pageH;
  while (remaining > 0) {
    position -= pageH;
    pdf.addPage();
    pdf.addImage(canvas, 'JPEG', 0, position, imgW, imgH, '', 'FAST');
    remaining -= pageH;
  }
  pdf.save(filename);
}

/* ─── 자동 연동 헬퍼 ─── */
function addMonths(yyyymmdd: string, months: number): string {
  if (!yyyymmdd) return '';
  const d = new Date(yyyymmdd);
  if (isNaN(d.getTime())) return '';
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
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
function fmtCurrency(n: number): string { return n.toLocaleString('ko-KR'); }
function fmtKDate(s: string): string {
  if (!s) return '____년 __월 __일';
  const [y, m, d] = s.split('-');
  return `${y}년 ${parseInt(m).toString().padStart(2, '0')}월 ${parseInt(d).toString().padStart(2, '0')}일`;
}
function maskIdent(ident?: string): string {
  if (!ident) return '____________';
  const digits = ident.replace(/\D/g, '');
  if (digits.length === 13) return `${digits.slice(0, 6)}-${digits.slice(6, 7)}******`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 7)}***`;
  if (digits.length === 12) return `${digits.slice(0, 6)}-${digits.slice(6, 7)}******`;
  return ident;
}

/* JPK 본 양식 — 제이피케이모빌리티 ㈜ 기준 더미 (PDF 그대로) */
const SAMPLE = {
  company: { name: '제이피케이모빌리티 ㈜', ceo: '박영현', bizRegNo: '379-88-01956', phone: '1544-3871', address: '경기도 김포시 고촌읍 아라육로152번길 45, 에이동 2층 229호(국민차매매단지)', bank: '신한은행', accountNo: '140-013-750928' },
  customer: {
    name: '홍길동', ident: '123456-1234567', license: '12-12-123456-12', phone: '010-1234-1234',
    address: '서울', familyPhone: '', familyRelation: '',
  },
  vehicle: { plate: '12가1234', model: 'G80', trim: '', fuel: '가솔린', color: '화이트 / 블랙', options: '선루프', mileage: '100,000Km' },
  terms: { contractDate: '2026-01-01', endDate: '2030-01-01', termMonths: 48, monthlyRent: 1000000, deposit: 1000000, acquireType: '만기협의', annualMileage: '2.0만Km', paymentDay: 0, paymentMethod: 'CMS', acquirePrice: '만기협의' },
};

type DocVariant = '시설대여' | '자동차 렌탈(대여)';

export default function ContractPreviewPage() {
  // 회사
  const [coName, setCoName] = useState(SAMPLE.company.name);
  const [coCeo, setCoCeo] = useState(SAMPLE.company.ceo);
  const [coBizNo, setCoBizNo] = useState(SAMPLE.company.bizRegNo);
  const [coPhone, setCoPhone] = useState(SAMPLE.company.phone);
  const [coAddr, setCoAddr] = useState(SAMPLE.company.address);
  const [coBank, setCoBank] = useState(SAMPLE.company.bank);
  const [coAcct, setCoAcct] = useState(SAMPLE.company.accountNo);

  // 임차인
  const [cName, setCName] = useState(SAMPLE.customer.name);
  const [cIdent, setCIdent] = useState(SAMPLE.customer.ident);
  const [cLicense, setCLicense] = useState(SAMPLE.customer.license);
  const [cPhone, setCPhone] = useState(SAMPLE.customer.phone);
  const [cAddr, setCAddr] = useState(SAMPLE.customer.address);
  const [cFamilyPhone, setCFamilyPhone] = useState(SAMPLE.customer.familyPhone);
  const [cFamilyRel, setCFamilyRel] = useState(SAMPLE.customer.familyRelation);

  // 차량
  const [plate, setPlate] = useState(SAMPLE.vehicle.plate);
  const [model, setModel] = useState(SAMPLE.vehicle.model);
  const [fuel, setFuel] = useState(SAMPLE.vehicle.fuel);
  const [color, setColor] = useState(SAMPLE.vehicle.color);
  const [options, setOptions] = useState(SAMPLE.vehicle.options);
  const [mileage, setMileage] = useState(SAMPLE.vehicle.mileage);

  // 조건
  const [contractDate, setContractDate] = useState(SAMPLE.terms.contractDate);
  const [endDate, setEndDate] = useState(SAMPLE.terms.endDate);
  const [termMonths, setTermMonths] = useState(SAMPLE.terms.termMonths);
  const [monthlyRent, setMonthlyRent] = useState(SAMPLE.terms.monthlyRent);
  const [deposit, setDeposit] = useState(SAMPLE.terms.deposit);
  const [paymentDay, setPaymentDay] = useState(SAMPLE.terms.paymentDay);
  const [paymentMethod, setPaymentMethod] = useState(SAMPLE.terms.paymentMethod);
  const [annualMileage, setAnnualMileage] = useState(SAMPLE.terms.annualMileage);
  const [acquireType, setAcquireType] = useState(SAMPLE.terms.acquireType);
  const [acquirePrice, setAcquirePrice] = useState(SAMPLE.terms.acquirePrice);
  const [depositTouched, setDepositTouched] = useState(false);

  // 발행
  const [issuedDate, setIssuedDate] = useState('2026-03-25');
  const [specialNote, setSpecialNote] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);

  // 양식 / 표지 보증금 분납
  const [docVariant, setDocVariant] = useState<DocVariant>('시설대여');
  const [depositMethod, setDepositMethod] = useState<'일시납' | '분납'>('일시납');
  const [deposit1, setDeposit1] = useState<number>(1000000);
  const [deposit2, setDeposit2] = useState<number>(0);
  const [deposit3, setDeposit3] = useState<number>(0);

  useEffect(() => { setIssuedDate(todayKr()); }, []);

  const handlePdfDownload = useCallback(async () => {
    if (!paperRef.current) return;
    setPdfBusy(true);
    try {
      const fname = `시설대여계약서_${plate || 'no-plate'}_${cName || 'no-name'}_${issuedDate}.pdf`;
      await paperToPdf(paperRef.current, fname);
    } catch (err) {
      console.error('[contract/preview] PDF 생성 실패', err);
      toast.error('PDF 생성 실패 — 콘솔 확인');
    } finally {
      setPdfBusy(false);
    }
  }, [plate, cName, issuedDate]);

  const handleStartChange = useCallback((newStart: string) => {
    setContractDate(newStart);
    if (newStart && termMonths > 0) setEndDate(addMonths(newStart, termMonths));
  }, [termMonths]);
  const handleTermChange = useCallback((newTerm: number) => {
    setTermMonths(newTerm);
    if (contractDate && newTerm > 0) setEndDate(addMonths(contractDate, newTerm));
  }, [contractDate]);
  const handleEndChange = useCallback((newEnd: string) => {
    setEndDate(newEnd);
    if (contractDate && newEnd) {
      const m = diffMonths(contractDate, newEnd);
      if (m > 0) setTermMonths(m);
    }
  }, [contractDate]);
  const handleMonthlyChange = useCallback((newRent: number) => {
    setMonthlyRent(newRent);
    if (!depositTouched && newRent > 0) setDeposit(newRent);
  }, [depositTouched]);

  return (
    <div className="ctr-shell">
      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css');

        /* ─── 디자인 토큰 (JPK 네이비 + 모던 톤) ─── */
        :root {
          --ink: #0b1220;
          --ink-soft: #1e293b;
          --mute: #475569;
          --muted2: #64748b;
          --line: #d6dbe3;
          --line-strong: #b6bcc7;
          --bg-soft: #f4f6f9;
          --bg-tint: #eef1f5;
          --accent: #1B2A4A;
          --accent-soft: rgba(27,42,74,.06);
          --danger: #b91c1c;
          --danger-soft: #fef2f2;
          --warn-bg: #fffbeb;
          --warn-line: #fde68a;
        }

        .ctr-shell {
          font-family: 'Pretendard Variable', sans-serif;
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
        .ctr-side h3 { margin: 18px 0 8px; font-size: 11px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.06em; }
        .ctr-side h3:first-of-type { margin-top: 0; }
        .ctr-row { display: grid; grid-template-columns: 80px 1fr; gap: 6px; align-items: center; margin-bottom: 4px; }
        .ctr-row label { color: #a1a1aa; font-size: 11px; }
        .ctr-row input, .ctr-row select, .ctr-row textarea {
          height: 28px; padding: 0 8px; font: inherit; font-size: 12px;
          border: 1px solid #e4e4e7; border-radius: 4px; background: #fff; width: 100%;
        }
        .ctr-row input:focus, .ctr-row select:focus, .ctr-row textarea:focus { outline: none; border-color: #1B2A4A; }
        .ctr-row textarea { height: auto; min-height: 36px; padding: 6px 8px; resize: vertical; }
        .ctr-actions { margin-top: 22px; display: flex; gap: 6px; padding-top: 16px; border-top: 1px solid #f4f4f5; }
        .ctr-actions button { flex: 1; height: 34px; font: inherit; font-size: 12px; font-weight: 600;
          border: 1px solid #e4e4e7; background: #fff; border-radius: 5px; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center; gap: 5px; color: #18181b; }
        .ctr-actions button.primary { background: #1B2A4A; color: #fff; border-color: #1B2A4A; }
        .preview-tag { display: inline-block; background: #ecfeff; color: #155e75; padding: 3px 10px; border-radius: 99px; font-size: 10px; font-weight: 600; margin-bottom: 14px; }

        .ctr-preview-wrap {
          background: #e7e5e4;
          padding: 24px 24px 64px;
          overflow-y: auto;
          height: 100vh;
          display: flex;
          justify-content: center;
          align-items: flex-start;
        }
        /* 여러 페이지 컨테이너 — html2canvas 캡처 대상 */
        .ctr-pages { display: flex; flex-direction: column; gap: 16px; }

        /* A4 정확치 — 210mm × 297mm. min-height + 자연 흐름.
           overflow 보이게 → 한 페이지 넘치면 사용자가 즉시 인지.
           flex column + push-bottom 로 서명란 자동 하단 고정 (freepasserp3 패턴) */
        .ctr-paper {
          width: 210mm;
          min-height: 297mm;
          background: #fff;
          padding: 12mm 14mm;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          box-sizing: border-box;
          position: relative;
          display: flex;
          flex-direction: column;
        }
        .ctr-paper .ip-doc { display: flex; flex-direction: column; flex: 1; min-height: 0; }
        .push-bottom { margin-top: auto; }

        /* 종이 안 297mm 라인 = A4 한 페이지 경계 (화면 가이드) */
        .ctr-paper::after {
          content: '';
          position: absolute;
          left: 0; right: 0;
          top: 297mm;
          border-top: 1.5px dashed #dc2626;
          pointer-events: none;
          z-index: 5;
        }
        /* 한 페이지 넘침 경고 — 297mm 초과 영역에 옅은 빨강 배경 */
        .ctr-paper.overflowing { box-shadow: 0 4px 20px rgba(220,38,38,0.25), 0 0 0 2px #dc2626; }
        .overflow-warning {
          position: absolute;
          left: 14mm; right: 14mm;
          top: calc(297mm - 22px);
          background: #dc2626;
          color: #fff;
          font-size: 8pt;
          font-weight: 700;
          padding: 3px 10px;
          z-index: 6;
          text-align: center;
          letter-spacing: 1px;
        }
        @page { size: A4; margin: 0; }

        /* ─── 시설대여 계약서 ─── */
        .ip-doc {
          font-family: 'Pretendard Variable', sans-serif;
          color: #18181b;
          font-size: 9pt;
          line-height: 1.4;
        }
        /* 표/섹션 페이지 분리 방지 */
        .ip-section, .ip-table, .ip-sign, .ip-consent, .ip-top {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .ip-table tr { break-inside: avoid; page-break-inside: avoid; }

        /* 상단 — 계약서 번호 + 경고박스 + 일차인 박스 */
        .ip-top {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px;
          margin-bottom: 6px;
          align-items: flex-start;
        }
        .ip-doc-no {
          font-size: 8pt;
          color: #52525b;
          border-bottom: 1px solid #71717a;
          padding-bottom: 2px;
          width: 200px;
        }
        .ip-warn-box {
          border: 1.5px dashed #dc2626;
          padding: 4px 8px;
          font-size: 8pt;
          line-height: 1.5;
          color: #18181b;
        }
        .ip-warn-box .em { color: #dc2626; font-weight: 700; }
        .ip-warn-box .sub { font-size: 7.5pt; color: #52525b; margin-top: 2px; }
        .ip-signer-box {
          border: 1px solid var(--ink);
          padding: 8px 14px;
          font-size: 9pt;
          min-width: 220px;
          display: flex;
          align-items: center;
          gap: 14px;
          background: #fff;
        }
        .ip-signer-box .label { color: var(--mute); font-size: 8.5pt; line-height: 1.3; font-weight: 600; letter-spacing: 1px; }
        .ip-signer-box .label-sub { color: var(--mute); font-size: 7.5pt; }
        .ip-signer-box .name { font-weight: 800; font-size: 13pt; letter-spacing: -0.3px; color: var(--ink); }
        .ip-signer-box .seal {
          width: 38px; height: 38px;
          border: 1.5px solid var(--danger);
          color: var(--danger);
          border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 8pt; font-weight: 700;
          margin-left: auto;
          transform: rotate(-8deg);
        }

        /* 제목 */
        .ip-title {
          text-align: center;
          font-size: 22pt;
          font-weight: 800;
          letter-spacing: 0.22em;
          padding-left: 0.22em;
          margin: 8px 0 2px;
        }
        .ip-vehicle-no { text-align: center; font-size: 9pt; font-weight: 600; color: #52525b; margin-bottom: 8px; }

        /* 섹션 라벨 */
        .ip-section { margin-top: 6px; }
        .ip-section-label {
          font-size: 9pt;
          font-weight: 700;
          margin-bottom: 2px;
          color: #18181b;
        }
        .ip-section-label .req-note { font-size: 7.5pt; color: #71717a; font-weight: 400; float: right; }
        .ip-section-label .unit-note { font-size: 7.5pt; color: #71717a; font-weight: 400; float: right; }

        /* 표 — 한국 정통 */
        .ip-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 8.5pt;
          table-layout: fixed;
        }
        .ip-table th, .ip-table td {
          border: 1px solid #71717a;
          padding: 3px 6px;
          vertical-align: middle;
          word-break: keep-all;
        }
        .ip-table th {
          background: #e4e4e7;
          font-weight: 600;
          color: #18181b;
          text-align: center;
          font-size: 8pt;
        }
        .ip-table td { background: #fff; }
        .ip-table td.center { text-align: center; }
        .ip-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
        .ip-table td.strong { font-weight: 700; font-size: 9.5pt; text-align: right; padding-right: 10px; }
        .ip-table td.mono { font-variant-numeric: tabular-nums; }
        .ip-table .key { background: #e4e4e7; font-weight: 600; text-align: center; font-size: 8pt; }
        .ip-table .em { color: #dc2626; font-weight: 700; }

        /* 동의/체크 */
        .ip-check-row {
          display: flex;
          gap: 14px;
          font-size: 8pt;
          align-items: center;
        }
        .ip-check { display: inline-flex; align-items: center; gap: 3px; }
        .ip-check::before { content: '□'; font-size: 10pt; color: #71717a; }
        .ip-check.checked::before { content: '☑'; color: #18181b; }

        /* 임차인 동의문 */
        .ip-consent {
          font-size: 8pt;
          line-height: 1.5;
          color: #18181b;
          margin: 8px 0 4px;
          font-weight: 600;
        }
        .ip-consent-sub {
          font-size: 9pt;
          font-weight: 700;
          color: #dc2626;
          text-align: center;
          margin: 4px 0;
          letter-spacing: 0.04em;
        }

        /* 서명란 — 한국 계약서 표준 격식 */
        .ip-sign {
          margin-top: 14px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 28px;
          padding-top: 14px;
          border-top: 1.5px solid var(--ink);
        }
        .ip-sign .col { font-size: 9pt; }
        .ip-sign .role {
          font-weight: 700; color: var(--mute);
          font-size: 9pt; letter-spacing: 0.5px;
          margin-bottom: 10px; text-transform: none;
        }
        .ip-sign .box {
          background: var(--bg-soft);
          border: 1px solid var(--line-strong);
          padding: 18px 18px;
          min-height: 62px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .ip-sign .box .name {
          font-size: 18pt; font-weight: 800;
          letter-spacing: -0.5px; color: var(--ink);
        }
        .ip-sign .box .seal {
          width: 48px; height: 48px;
          border: 1.5px solid var(--danger);
          color: var(--danger);
          border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 9pt; font-weight: 700;
          transform: rotate(-8deg);
        }
        .ip-sign .info { margin-top: 10px; font-size: 9pt; line-height: 1.7; color: var(--ink-soft); }
        .ip-sign .info .row { display: flex; gap: 6px; }
        .ip-sign .info .k { color: var(--mute); min-width: 64px; font-weight: 500; }
        .ip-sign .info .v { color: var(--ink); font-weight: 600; }
        .ip-sign .corp { font-size: 13pt; font-weight: 800; color: var(--ink); letter-spacing: -0.3px; }
        .ip-sign .ceo { font-size: 10pt; color: var(--ink-soft); margin-top: 6px; }
        .ip-sign .tel { font-size: 9pt; color: var(--mute); margin-top: 4px; font-variant-numeric: tabular-nums; }

        /* ─── 표지 페이지 (ERP 톤) ─── */
        /* 상단 메타바 — 좌: 브랜드, 우: 계약번호·일자 */
        .ip-cv-meta {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          padding-bottom: 10px;
          border-bottom: 1.5px solid var(--ink);
          margin-bottom: 32px;
        }
        .ip-cv-meta .brand {
          font-size: 12pt; font-weight: 800;
          color: var(--ink); letter-spacing: -0.3px;
        }
        .ip-cv-meta .right {
          text-align: right;
          font-size: 8.5pt; color: var(--ink);
          font-weight: 500; line-height: 1.7;
          font-variant-numeric: tabular-nums;
        }
        .ip-cv-meta .right .lbl {
          color: var(--mute); font-weight: 700;
          letter-spacing: 1.5px; margin-right: 4px;
        }

        /* 큰 제목 영역 — 영문 메인, 한글 부제 */
        .ip-cv-eyebrow {
          text-align: center;
          font-size: 10pt;
          color: var(--accent);
          font-weight: 700;
          letter-spacing: 6px;
          text-transform: uppercase;
          margin: 0 0 8px;
        }
        .ip-cv-title {
          text-align: center;
          font-size: 24pt;
          font-weight: 800;
          letter-spacing: -0.5px;
          margin: 0 0 4px;
          color: var(--ink);
        }
        .ip-cv-rule {
          width: 32px; height: 2.5px;
          background: var(--accent);
          margin: 14px auto 14px;
        }
        .ip-cv-plate {
          text-align: center;
          font-size: 9pt;
          color: var(--mute);
          margin: 0 0 24px;
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.15em;
          font-weight: 600;
        }
        .ip-cv-plate .lbl { color: var(--mute); font-weight: 700; margin-right: 6px; }

        /* 표지 정보 카드 그리드 — ERP 톤 */
        .ip-cv-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin: 12px 0;
        }
        .ip-cv-box {
          border: 1px solid var(--line);
          border-radius: 3px;
          background: #fff;
          overflow: hidden;
        }
        .ip-cv-box .head {
          background: var(--bg-soft);
          padding: 7px 14px;
          font-size: 7.5pt;
          font-weight: 700;
          color: var(--mute);
          letter-spacing: 2px;
          text-transform: uppercase;
          border-bottom: 1px solid var(--line);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .ip-cv-box .head .kr {
          color: var(--ink-soft);
          letter-spacing: 0;
          font-weight: 600;
          text-transform: none;
          font-size: 8.5pt;
        }
        .ip-cv-box .body { padding: 10px 14px; }
        .ip-cv-row {
          display: grid;
          grid-template-columns: 90px 1fr;
          gap: 10px;
          padding: 6px 0;
          font-size: 9pt;
          align-items: baseline;
          border-bottom: 1px solid #eef0f4;
        }
        .ip-cv-row:last-child { border-bottom: none; }
        .ip-cv-row .k { color: var(--mute); font-weight: 500; font-size: 8.5pt; letter-spacing: 0.2px; }
        .ip-cv-row .v { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
        .ip-cv-row .v.mute { color: var(--muted2); font-weight: 500; }
        .ip-cv-row .v .unit { font-size: 8pt; color: var(--mute); font-weight: 500; margin-left: 2px; }

        /* 회사 푸터 — 미니멀 */
        .ip-cv-corp {
          margin-top: 16px;
          border-top: 1.5px solid var(--ink);
          padding-top: 16px;
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 18px;
          align-items: center;
        }
        .ip-cv-corp .label {
          font-size: 7.5pt; color: var(--mute);
          font-weight: 700; letter-spacing: 3px;
          text-transform: uppercase;
          writing-mode: horizontal-tb;
          padding-right: 16px;
          border-right: 1px solid var(--line);
        }
        .ip-cv-corp .info { display: flex; flex-direction: column; gap: 4px; }
        .ip-cv-corp .info .name {
          font-size: 13pt; font-weight: 800;
          color: var(--ink); letter-spacing: -0.3px;
        }
        .ip-cv-corp .info .meta {
          font-size: 8.5pt; color: var(--mute);
          font-variant-numeric: tabular-nums;
          line-height: 1.7;
        }
        .ip-cv-corp .info .meta strong { color: var(--ink-soft); font-weight: 700; margin-right: 4px; }

        /* ── A4 페이지 분할 보조 ── */
        /* 섹션(헤더 + 표 묶음)은 페이지 안에서 안 잘리도록 */
        .doc-block { break-inside: avoid; page-break-inside: avoid; }
        .doc-tbl tr { break-inside: avoid; page-break-inside: avoid; }
        .doc-tbl thead { break-after: avoid; page-break-after: avoid; }

        /* ─── 표준 ERP 페이지 헤더 / 타이틀 / 푸터 ─── */
        .doc-page-h {
          display: flex; justify-content: space-between; align-items: flex-end;
          padding-bottom: 8px; margin-bottom: 6px;
          border-bottom: 1px solid var(--ink);
        }
        .doc-page-h .left { display: flex; flex-direction: column; gap: 2px; }
        .doc-page-h .left .brand {
          font-size: 9pt; color: var(--ink); font-weight: 800;
          letter-spacing: -0.2px;
        }
        .doc-page-h .left .kind {
          font-size: 10pt; font-weight: 800; color: var(--ink);
          letter-spacing: -0.2px;
        }
        .doc-page-h .right {
          text-align: right;
          font-size: 8.5pt; color: var(--mute);
          font-weight: 500; line-height: 1.6;
        }
        .doc-page-h .right .contractNo {
          color: var(--ink); font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        .doc-page-h .right .pageNo {
          color: var(--mute); font-size: 8pt; letter-spacing: 1px;
        }

        /* 본문 페이지용 — 작고 좌측 정렬 */
        .doc-page-title {
          margin: 10px 0 8px;
          font-size: 14pt; font-weight: 800;
          color: var(--ink);
          letter-spacing: -0.3px;
        }
        /* 별격 페이지(약관/동의서 등) 가운데 정렬 큰 제목 */
        .doc-page-title.center {
          text-align: center;
          font-size: 18pt; margin: 14px 0 16px;
        }

        /* ─── 통일 표 시스템 (.doc-*) ─── 대기업 계약서 톤 */
        .doc-sec {
          display: flex; align-items: baseline; gap: 8px;
          margin: 10px 0 5px;
          font-size: 10pt;
          font-weight: 700;
          color: var(--ink);
          letter-spacing: -0.2px;
        }
        .doc-sec .n {
          font-size: 10pt;
          color: var(--ink);
          font-weight: 700;
          margin-right: 4px;
        }
        .doc-sec .meta {
          margin-left: auto;
          font-size: 8.5pt;
          color: var(--mute);
          font-weight: 500;
        }

        /* freepasserp3 표 패턴 차용 — 좌우 보더 X, 상하 굵게, 행 간 옅게 */
        .doc-tbl {
          width: 100%;
          border-collapse: collapse;
          font-size: 9pt;
          background: #fff;
          border-top: 1.5px solid var(--ink);
          border-bottom: 1.5px solid var(--ink);
        }
        .doc-tbl th, .doc-tbl td {
          border: none;
          padding: 6px 11px;
          vertical-align: middle;
          height: 28px;
          line-height: 1.5;
          text-align: left;
        }
        /* 긴 본문 셀(note)은 별도 padding으로 답답함 줄임 */
        .doc-tbl td.note { padding: 7px 11px; }
        /* 행 간 옅은 구분선 */
        .doc-tbl tbody tr + tr > th,
        .doc-tbl tbody tr + tr > td { border-top: 1px solid #eef0f4; }
        /* thead 아래 라인 */
        .doc-tbl thead th { border-bottom: 1px solid var(--line); }
        /* 세로 라인 — 키-값 사이만 아주 옅게 */
        .doc-tbl tbody th + td,
        .doc-tbl tbody th + th { border-left: 1px solid #eef0f4; }

        .doc-tbl th {
          background: var(--bg-soft);
          color: var(--mute);
          font-weight: 500;
          font-size: 8.5pt;
          text-align: left;
        }
        .doc-tbl thead th {
          font-weight: 600;
          color: var(--ink-soft);
          text-align: center;
        }
        .doc-tbl td {
          color: var(--ink);
          font-weight: 500;
        }
        .doc-tbl td.center { text-align: center; }
        .doc-tbl td.right { text-align: right; }
        .doc-tbl td.amt {
          text-align: right;
          font-variant-numeric: tabular-nums;
          font-weight: 700;
          padding-right: 14px;
        }
        .doc-tbl td.amt.lg { font-size: 10.5pt; letter-spacing: -0.2px; }
        .doc-tbl td.note { font-size: 8.5pt; color: var(--ink-soft); line-height: 1.65; font-weight: 500; }
        .doc-tbl td.empty { color: #c9ced6; text-align: center; font-weight: 400; }
        .doc-tbl td .em { color: var(--danger); font-weight: 700; }
        .doc-tbl td strong { color: var(--ink); font-weight: 700; }
        .doc-tbl td .sub { font-size: 8pt; color: var(--mute); font-weight: 500; }
        .doc-tbl .chk { display: inline-block; margin: 0 8px; color: var(--mute); font-size: 9pt; font-weight: 500; }
        .doc-tbl .chk::before { content: '☐'; margin-right: 3px; }
        .doc-tbl .chk.on { color: var(--ink); font-weight: 700; }
        .doc-tbl .chk.on::before { content: '☑'; color: var(--accent); }

        /* ─── 모던 ERP 컴포넌트 (mc-*) ─── (현재 사용 최소화, 일부 페이지에서만) */

        /* 섹션 헤더 — 번호 배지 + 제목 + 우측 메타 */
        .mc-sec-h {
          display: flex; align-items: baseline; gap: 10px;
          margin: 12px 0 8px;
          padding-bottom: 6px;
          border-bottom: 1.5px solid var(--ink);
        }
        .mc-sec-h .num {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 22px; height: 20px; padding: 0 6px;
          background: var(--accent); color: #fff;
          font-size: 9pt; font-weight: 800;
          border-radius: 3px; letter-spacing: 0.5px;
          align-self: center;
        }
        .mc-sec-h .ttl { font-size: 12pt; font-weight: 800; color: var(--ink); letter-spacing: -0.3px; }
        .mc-sec-h .meta {
          margin-left: auto; font-size: 8.5pt; font-weight: 500; color: var(--mute);
          letter-spacing: 0.2px;
        }

        /* Key-Value Grid (3열) */
        .mc-kv {
          display: grid; grid-template-columns: repeat(3, 1fr);
          border: 1px solid var(--line); border-radius: 4px;
          overflow: hidden; background: #fff;
        }
        .mc-kv .cell {
          padding: 7px 12px;
          border-right: 1px solid var(--line);
          border-bottom: 1px solid var(--line);
          display: flex; flex-direction: column; gap: 2px;
          min-height: 38px;
          justify-content: center;
        }
        .mc-kv .cell:nth-child(3n) { border-right: none; }
        .mc-kv .cell.full { grid-column: 1 / -1; }
        .mc-kv .cell.wide { grid-column: span 2; }
        .mc-kv .cell.last-row { border-bottom: none; }
        .mc-kv .k {
          font-size: 8pt; color: var(--mute);
          font-weight: 600; letter-spacing: 0.3px;
        }
        .mc-kv .v {
          font-size: 9.5pt; font-weight: 600; color: var(--ink);
          font-variant-numeric: tabular-nums;
        }
        .mc-kv .v .sub { color: var(--mute); font-weight: 500; font-size: 8pt; margin-left: 4px; }
        .mc-kv .v.danger { color: var(--danger); }
        .mc-kv .v.mute { color: var(--muted2); font-weight: 500; }
        .mc-kv .v.long { font-size: 8.5pt; font-weight: 500; color: var(--ink-soft); line-height: 1.5; }

        /* 강조 통계 카드 */
        .mc-stat-row {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 8px; margin: 8px 0;
        }
        .mc-stat {
          padding: 10px 14px;
          border: 1px solid var(--line);
          background: #fff;
          border-radius: 4px;
        }
        .mc-stat .lbl { font-size: 8.5pt; color: var(--mute); font-weight: 600; letter-spacing: 0.3px; }
        .mc-stat .val {
          font-size: 17pt; font-weight: 800; color: var(--ink);
          letter-spacing: -0.5px; margin-top: 4px;
          font-variant-numeric: tabular-nums;
        }
        .mc-stat .val .unit { font-size: 10pt; color: var(--mute); font-weight: 500; margin-left: 2px; }
        .mc-stat.key {
          border-top: 2.5px solid var(--accent);
          background: var(--bg-soft);
        }

        /* 경고 스트립 */
        .mc-warn {
          border-left: 3px solid var(--danger);
          background: var(--danger-soft);
          padding: 10px 14px;
          border-radius: 0 4px 4px 0;
          margin: 10px 0;
        }
        .mc-warn .head { font-size: 9.5pt; font-weight: 800; color: var(--ink); margin-bottom: 4px; letter-spacing: -0.2px; }
        .mc-warn .body { font-size: 8.5pt; color: var(--ink-soft); line-height: 1.65; }
        .mc-warn .body .em { color: var(--danger); font-weight: 800; }
        .mc-warn .body strong { color: var(--ink); font-weight: 700; }

        /* Split 카드 */
        .mc-split { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

        /* 카드 */
        .mc-card {
          border: 1px solid var(--line);
          border-radius: 4px;
          padding: 12px 14px;
          background: #fff;
        }
        .mc-card .ck-lbl { font-size: 8pt; color: var(--mute); font-weight: 600; letter-spacing: 0.5px; margin-bottom: 6px; text-transform: uppercase; }

        /* 체크 chip */
        .mc-chk-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
        .mc-chk {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 5px 11px; border: 1px solid var(--line); border-radius: 99px;
          font-size: 8.5pt; color: var(--mute); background: #fff; font-weight: 500;
        }
        .mc-chk::before { content: '○'; font-size: 9pt; color: var(--line-strong); }
        .mc-chk.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); font-weight: 700; }
        .mc-chk.on::before { content: '●'; color: var(--accent); }

        /* ─── 보험 가입내용 — 4분할 ─── */
        .mc-ins-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          margin: 8px 0;
        }
        .mc-ins {
          padding: 8px 10px;
          border: 1px solid var(--line);
          background: #fff;
          border-radius: 3px;
        }
        .mc-ins .lbl { font-size: 7.5pt; color: var(--mute); font-weight: 600; letter-spacing: 0.3px; }
        .mc-ins .val { font-size: 11pt; font-weight: 800; color: var(--ink); letter-spacing: -0.3px; margin-top: 2px; font-variant-numeric: tabular-nums; }
        .mc-ins.danger .val { color: var(--danger); }

        /* 정비 항목 리스트 (좌측 라벨 + 우측 본문) */
        .mc-item-list { display: flex; flex-direction: column; gap: 6px; }
        .mc-item {
          display: grid;
          grid-template-columns: 130px 1fr;
          gap: 12px;
          padding: 8px 12px;
          border: 1px solid var(--line);
          border-radius: 3px;
          background: #fff;
        }
        .mc-item .lbl {
          font-size: 8.5pt; color: var(--accent);
          font-weight: 700; letter-spacing: -0.2px;
          padding-right: 10px;
          border-right: 1px solid var(--line);
          align-self: center;
        }
        .mc-item .body { font-size: 8.5pt; color: var(--ink-soft); line-height: 1.65; }
        .mc-item .body strong { color: var(--ink); font-weight: 700; }
        .mc-item .body .em { color: var(--danger); font-weight: 700; }

        /* 12대 중과실 그리드 */
        .mc-list-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 4px 14px;
          padding: 10px 12px;
          font-size: 8pt;
          color: var(--ink-soft);
          background: var(--bg-soft);
          border-radius: 3px;
          border: 1px solid var(--line);
        }
        .mc-list-grid div { padding: 2px 0; }
        .mc-list-grid span { color: var(--accent); font-weight: 700; margin-right: 4px; }

        /* "내용을 읽고 이해 및 숙지함 확인" 우측 세로 박스 */
        .mc-acknowledge {
          display: flex; align-items: center; gap: 10px;
          margin-top: 10px;
          padding: 8px 14px;
          border: 1.5px solid var(--ink);
          background: var(--warn-bg);
          border-radius: 3px;
          font-size: 9.5pt; font-weight: 700; color: var(--ink);
          letter-spacing: 1px;
          width: fit-content;
          margin-left: auto;
        }
        .mc-acknowledge::before {
          content: '☑';
          font-size: 13pt;
          color: var(--accent);
        }

        /* ─── 운전자격 검증 - 확인 박스 ─── */
        .mc-verify-box {
          margin: 16px auto;
          padding: 20px 24px;
          background: var(--bg-soft);
          border: 1.5px solid var(--ink);
          border-radius: 4px;
          max-width: 90%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .mc-verify-box .date {
          font-size: 10.5pt; color: var(--ink); font-weight: 700;
          letter-spacing: 1px; font-variant-numeric: tabular-nums;
        }
        .mc-verify-box .name {
          font-size: 14pt; font-weight: 800; color: var(--ink);
          letter-spacing: -0.3px; margin-top: 4px;
        }
        .mc-verify-box .name .sign { font-size: 9pt; font-weight: 600; color: var(--mute); margin-left: 8px; }

        /* 차량 외관 도면 placeholder */
        .mc-vehicle-diagram {
          width: 100%;
          height: 200px;
          border: 1px dashed var(--line-strong);
          background: var(--bg-soft);
          border-radius: 4px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          color: var(--muted2);
          font-size: 9pt;
        }
        .mc-vehicle-diagram .ico {
          font-size: 32pt;
          line-height: 1;
        }

        /* CMS 표 */
        .mc-cms-tbl {
          width: 100%;
          border-collapse: collapse;
          border: 1px solid var(--line);
          border-radius: 4px;
          overflow: hidden;
          background: #fff;
          font-size: 8.5pt;
          margin-bottom: 10px;
        }
        .mc-cms-tbl th, .mc-cms-tbl td {
          padding: 7px 10px;
          border-right: 1px solid var(--line);
          border-bottom: 1px solid var(--line);
          vertical-align: middle;
        }
        .mc-cms-tbl tr:last-child td { border-bottom: none; }
        .mc-cms-tbl th {
          background: var(--bg-soft);
          font-weight: 700;
          font-size: 8pt;
          color: var(--mute);
          letter-spacing: 0.3px;
          text-align: left;
          width: 18%;
        }
        .mc-cms-tbl td { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
        .mc-cms-tbl td.empty { color: var(--line-strong); font-weight: 400; }

        /* ─── 동의 카드 (개인정보) ─── */
        .mc-consent-card {
          border: 1px solid var(--line);
          border-radius: 4px;
          background: #fff;
          margin-bottom: 10px;
          overflow: hidden;
        }
        .mc-consent-card .head {
          padding: 8px 14px;
          background: var(--accent);
          color: #fff;
          font-size: 9.5pt; font-weight: 700;
          letter-spacing: -0.2px;
        }
        .mc-consent-card .body {
          padding: 10px 14px;
          font-size: 8.5pt; color: var(--ink-soft);
          line-height: 1.7;
        }
        .mc-consent-card .body p { margin: 2px 0; }
        .mc-consent-card .body p.sec { color: var(--ink); font-weight: 700; margin-top: 6px; padding-left: 0; }
        .mc-consent-card .body p.dot { padding-left: 12px; position: relative; }
        .mc-consent-card .body p.dot::before {
          content: ''; position: absolute; left: 2px; top: 8px;
          width: 4px; height: 4px; border-radius: 50%; background: var(--mute);
        }
        .mc-consent-card .body strong { color: var(--ink); font-weight: 700; }
        .mc-consent-card .body .em { color: var(--danger); font-weight: 600; }

        .mc-consent-ask {
          display: flex; justify-content: space-between; align-items: center; gap: 12px;
          padding: 10px 14px;
          background: var(--bg-soft);
          border-top: 1px solid var(--line);
        }
        .mc-consent-ask .q { font-size: 9pt; color: var(--ink); font-weight: 700; letter-spacing: -0.2px; }
        .mc-consent-ask .opts { display: flex; gap: 6px; flex-shrink: 0; }
        .mc-consent-ask .opt {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 5px 14px; border: 1px solid var(--line-strong); border-radius: 3px;
          font-size: 8.5pt; background: #fff; color: var(--mute); font-weight: 600;
          min-width: 88px; justify-content: center;
        }
        .mc-consent-ask .opt::before { content: '☐'; font-size: 10pt; color: var(--line-strong); }
        .mc-consent-ask .opt.yes { border-color: var(--accent); }
        .mc-consent-ask .opt.no { border-color: var(--line-strong); }

        /* ─── 사실확인서 차량 리스트 표 ─── */
        .mc-veh-tbl {
          width: 100%;
          border-collapse: collapse;
          background: #fff;
          border: 1px solid var(--line);
          border-radius: 4px;
          overflow: hidden;
          font-size: 8.5pt;
        }
        .mc-veh-tbl th, .mc-veh-tbl td {
          padding: 7px 10px;
          border-right: 1px solid var(--line);
          border-bottom: 1px solid var(--line);
          vertical-align: middle;
          text-align: center;
        }
        .mc-veh-tbl th {
          background: var(--bg-soft);
          font-weight: 700;
          font-size: 8pt;
          color: var(--mute);
          letter-spacing: 0.3px;
        }
        .mc-veh-tbl td:first-child, .mc-veh-tbl th:first-child { color: var(--mute); font-weight: 600; width: 38px; }
        .mc-veh-tbl tr:last-child td { border-bottom: none; }
        .mc-veh-tbl td:last-child, .mc-veh-tbl th:last-child { border-right: none; }
        .mc-veh-tbl td.empty { color: var(--line-strong); font-weight: 400; }
        .mc-veh-tbl tr.filled td { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
        .mc-veh-tbl tr.filled td:first-child { color: var(--accent); }

        /* 큰 단일 제목 (각 페이지 상단) */
        .mc-page-h1 {
          text-align: center;
          font-size: 22pt;
          font-weight: 800;
          color: var(--ink);
          letter-spacing: -0.5px;
          padding: 4px 0 12px;
          border-bottom: 1.5px solid var(--ink);
          margin-bottom: 14px;
        }
        .mc-page-h1 .eyebrow {
          display: block;
          font-size: 8.5pt;
          font-weight: 700;
          color: var(--mute);
          letter-spacing: 6px;
          text-transform: uppercase;
          margin-bottom: 6px;
        }

        /* ─── 약관 페이지 (모던) ─── */
        .ip-terms-head {
          display: flex; align-items: flex-end; justify-content: space-between;
          padding-bottom: 10px; border-bottom: 1.5px solid var(--ink);
          margin-bottom: 12px;
        }
        .ip-terms-head .left .eyebrow {
          font-size: 8pt; color: var(--mute); font-weight: 600;
          letter-spacing: 4px; text-transform: uppercase; margin-bottom: 2px;
        }
        .ip-terms-head .left h2 {
          font-size: 18pt; font-weight: 800; color: var(--ink);
          letter-spacing: -0.3px; margin: 0;
        }
        .ip-terms-head .right { text-align: right; font-size: 9pt; color: var(--mute); font-weight: 600; }
        .ip-terms-head .right strong { color: var(--ink); font-size: 10pt; font-weight: 800; letter-spacing: 1px; }

        .ip-terms-intro {
          font-size: 9pt; line-height: 1.6; color: var(--ink-soft);
          padding: 10px 14px; background: var(--accent-soft);
          border-left: 3px solid var(--accent);
          margin-bottom: 14px;
        }
        .ip-terms-intro strong { color: var(--ink); font-weight: 700; }

        .ip-terms-body { columns: 2; column-gap: 16px; column-rule: 1px solid var(--line); }
        .ip-terms-body .art {
          break-inside: avoid; page-break-inside: avoid;
          margin-bottom: 8px;
        }
        .ip-terms-body .art-h {
          display: flex; align-items: center; gap: 6px;
          font-size: 9pt; font-weight: 800; color: var(--ink);
          margin-bottom: 3px; padding-bottom: 2px;
          border-bottom: 1px solid var(--line);
        }
        .ip-terms-body .art-num {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 28px; padding: 1px 6px;
          background: var(--accent); color: #fff;
          font-size: 7.5pt; font-weight: 700;
          border-radius: 2px;
        }
        .ip-terms-body p { font-size: 7.5pt; line-height: 1.55; color: var(--ink-soft); margin: 1px 0; }
        .ip-terms-body p.indent { padding-left: 10px; color: var(--mute); }
        .ip-terms-body p.sub-h { font-weight: 700; color: var(--ink); margin-top: 3px; }
        .ip-terms-body strong { color: var(--ink); font-weight: 700; }

        @media print {
          html, body { background: #fff; margin: 0; }
          .ctr-shell { display: block; background: #fff; grid-template-columns: none; }
          .ctr-side { display: none; }
          .ctr-preview-wrap { padding: 0; background: #fff; height: auto; overflow: visible; display: block; }
          .ctr-pages { gap: 0; }
          .ctr-paper {
            width: 210mm;
            height: 297mm;
            padding: 12mm 14mm;
            box-shadow: none;
            margin: 0;
            page-break-after: always;
            break-after: page;
          }
          .ctr-paper:last-child { page-break-after: auto; break-after: auto; }
        }
      `}</style>

      {/* 좌측 입력 */}
      <aside className="ctr-side">
        <span className="preview-tag">미리보기 · {docVariant} 계약서</span>

        <h3>양식</h3>
        <div className="ctr-row"><label>계약서 종류</label>
          <select value={docVariant} onChange={(e) => setDocVariant(e.target.value as DocVariant)}>
            <option value="시설대여">시설대여 계약서 (구독)</option>
            <option value="자동차 렌탈(대여)">자동차 렌탈(대여) 계약서</option>
          </select>
        </div>

        <h3>표지 — 보증금 분납</h3>
        <div className="ctr-row"><label>분납 여부</label>
          <select value={depositMethod} onChange={(e) => setDepositMethod(e.target.value as '일시납' | '분납')}>
            <option value="일시납">일시납</option>
            <option value="분납">분납</option>
          </select>
        </div>
        <div className="ctr-row"><label>1회차</label><input type="text" inputMode="numeric" value={deposit1 ? deposit1.toLocaleString() : ''} onChange={(e) => setDeposit1(parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0)} /></div>
        <div className="ctr-row"><label>2회차</label><input type="text" inputMode="numeric" value={deposit2 ? deposit2.toLocaleString() : ''} onChange={(e) => setDeposit2(parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0)} /></div>
        <div className="ctr-row"><label>3회차</label><input type="text" inputMode="numeric" value={deposit3 ? deposit3.toLocaleString() : ''} onChange={(e) => setDeposit3(parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0)} /></div>

        <h3>임대인 (회사)</h3>
        <div className="ctr-row"><label>상호</label><input value={coName} onChange={(e) => setCoName(e.target.value)} /></div>
        <div className="ctr-row"><label>대표자</label><input value={coCeo} onChange={(e) => setCoCeo(e.target.value)} /></div>
        <div className="ctr-row"><label>사업자번호</label><input value={coBizNo} onChange={(e) => setCoBizNo(e.target.value)} /></div>
        <div className="ctr-row"><label>대표 연락처</label><input value={coPhone} onChange={(e) => setCoPhone(e.target.value)} /></div>
        <div className="ctr-row"><label>주소</label><textarea value={coAddr} onChange={(e) => setCoAddr(e.target.value)} /></div>
        <div className="ctr-row"><label>은행</label><input value={coBank} onChange={(e) => setCoBank(e.target.value)} /></div>
        <div className="ctr-row"><label>계좌번호</label><input value={coAcct} onChange={(e) => setCoAcct(e.target.value)} /></div>

        <h3>임차인 (계약자)</h3>
        <div className="ctr-row"><label>성명</label><input value={cName} onChange={(e) => setCName(e.target.value)} /></div>
        <div className="ctr-row"><label>주민번호</label><input value={cIdent} onChange={(e) => setCIdent(fmtIdent(e.target.value))} /></div>
        <div className="ctr-row"><label>면허번호</label><input value={cLicense} onChange={(e) => setCLicense(e.target.value)} /></div>
        <div className="ctr-row"><label>연락처</label><input value={cPhone} onChange={(e) => setCPhone(fmtPhone(e.target.value))} /></div>
        <div className="ctr-row"><label>주소</label><textarea value={cAddr} onChange={(e) => setCAddr(e.target.value)} /></div>
        <div className="ctr-row"><label>가족연락처</label><input value={cFamilyPhone} onChange={(e) => setCFamilyPhone(fmtPhone(e.target.value))} /></div>
        <div className="ctr-row"><label>관계</label><input value={cFamilyRel} onChange={(e) => setCFamilyRel(e.target.value)} placeholder="부/모/형/배우자" /></div>

        <h3>차량</h3>
        <div className="ctr-row"><label>차량번호</label><input value={plate} onChange={(e) => setPlate(e.target.value.replace(/\s+/g, ''))} /></div>
        <div className="ctr-row"><label>차종</label><input value={model} onChange={(e) => setModel(e.target.value)} /></div>
        <div className="ctr-row"><label>연료</label><input value={fuel} onChange={(e) => setFuel(e.target.value)} /></div>
        <div className="ctr-row"><label>색상</label><input value={color} onChange={(e) => setColor(e.target.value)} /></div>
        <div className="ctr-row"><label>옵션</label><textarea value={options} onChange={(e) => setOptions(e.target.value)} /></div>
        <div className="ctr-row"><label>현재 주행</label><input value={mileage} onChange={(e) => setMileage(e.target.value)} /></div>

        <h3>대여 조건</h3>
        <div className="ctr-row"><label>계약시작</label><input type="date" value={contractDate} onChange={(e) => handleStartChange(e.target.value)} /></div>
        <div className="ctr-row"><label>약정개월</label><input type="number" value={termMonths} onChange={(e) => handleTermChange(Number(e.target.value) || 0)} /></div>
        <div className="ctr-row"><label>계약종료</label><input type="date" value={endDate} onChange={(e) => handleEndChange(e.target.value)} /></div>
        <div className="ctr-row"><label>월 대여료</label><input type="text" inputMode="numeric" value={monthlyRent ? monthlyRent.toLocaleString() : ''} onChange={(e) => handleMonthlyChange(parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0)} /></div>
        <div className="ctr-row"><label>보증금</label><input type="text" inputMode="numeric" value={deposit ? deposit.toLocaleString() : ''} onChange={(e) => { setDeposit(parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0); setDepositTouched(true); }} placeholder="0 = 무보증" /></div>
        <div className="ctr-row"><label>인수가격</label><input value={acquirePrice} onChange={(e) => setAcquirePrice(e.target.value)} placeholder="만기협의 / 금액" /></div>
        <div className="ctr-row"><label>인수옵션</label><input value={acquireType} onChange={(e) => setAcquireType(e.target.value)} placeholder="만기협의 / 인수" /></div>
        <div className="ctr-row"><label>연간 약정</label><input value={annualMileage} onChange={(e) => setAnnualMileage(e.target.value)} placeholder="2.0만Km" /></div>
        <div className="ctr-row"><label>자동이체일</label><input type="number" min={1} max={31} value={paymentDay} onChange={(e) => setPaymentDay(Number(e.target.value) || 1)} /></div>
        <div className="ctr-row"><label>결제수단</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option>CMS</option><option>이체</option><option>카드</option><option>현금</option>
          </select>
        </div>

        <h3>발행</h3>
        <div className="ctr-row"><label>작성일</label><input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} /></div>

        <h3>특약</h3>
        <textarea value={specialNote} onChange={(e) => setSpecialNote(e.target.value)} placeholder="추가 특약 사항" style={{ minHeight: 60, width: '100%', padding: 8, fontSize: 12, fontFamily: 'inherit', border: '1px solid #e4e4e7', borderRadius: 4, resize: 'vertical' }} />

        <div className="ctr-actions">
          <button type="button" disabled><FloppyDisk size={13} /> 기록</button>
          <button type="button" onClick={() => window.print()}><Printer size={13} /> 인쇄</button>
          <button type="button" className="primary" onClick={handlePdfDownload} disabled={pdfBusy}>
            <FilePdf size={13} /> {pdfBusy ? 'PDF 생성중…' : 'PDF 저장'}
          </button>
        </div>
      </aside>

      {/* 우측 — 계약서 다중 페이지 */}
      <div className="ctr-preview-wrap">
        <div className="ctr-pages" ref={paperRef}>

        {/* ───── PAGE 0 · 표지 ───── */}
        <div className="ctr-paper">
          <div className="ip-doc">
            {/* 표지 메타 — 좌: 브랜드 / 우: 계약번호·일자 */}
            <div className="ip-cv-meta">
              <div className="brand">{stripCorpSuffix(coName)}</div>
              <div className="right">
                <div><span className="lbl">계약번호</span> &nbsp;_______________</div>
                <div><span className="lbl">작성일</span> &nbsp;{fmtKDate(issuedDate)}</div>
              </div>
            </div>

            {/* 큰 제목 */}
            <div className="ip-cv-title">{docVariant} 계약서</div>
            <div className="ip-cv-rule" />
            <div className="ip-cv-plate">{plate}</div>

            {/* 정보 카드 그리드 */}
            <div className="ip-cv-grid">
              {/* 차량 */}
              <div className="ip-cv-box">
                <div className="head">차량</div>
                <div className="body">
                  <div className="ip-cv-row"><span className="k">차종</span><span className="v">{model}</span></div>
                  <div className="ip-cv-row"><span className="k">차량번호</span><span className="v">{plate}</span></div>
                  <div className="ip-cv-row"><span className="k">연료 / 색상</span><span className="v">{fuel} · {color}</span></div>
                  <div className="ip-cv-row"><span className="k">옵션</span><span className="v">{options || '—'}</span></div>
                </div>
              </div>

              {/* 계약자 */}
              <div className="ip-cv-box">
                <div className="head">임차인</div>
                <div className="body">
                  <div className="ip-cv-row"><span className="k">고객명</span><span className="v">{cName}</span></div>
                  <div className="ip-cv-row"><span className="k">연락처</span><span className="v">{cPhone}</span></div>
                  <div className="ip-cv-row"><span className="k">주민번호</span><span className="v">{cIdent}</span></div>
                  <div className="ip-cv-row"><span className="k">주소</span><span className="v" style={{ fontSize: '8.5pt' }}>{cAddr}</span></div>
                </div>
              </div>

              {/* 계약 조건 (full width, 4분할) */}
              <div className="ip-cv-box" style={{ gridColumn: '1 / -1' }}>
                <div className="head">계약 조건</div>
                <div className="body" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, padding: 0 }}>
                  <div style={{ padding: '10px 14px', borderRight: '1px solid #eef0f4' }}>
                    <div className="ip-cv-row" style={{ borderBottom: 'none', padding: 0 }}>
                      <span className="k">대여 기간</span><span className="v">{termMonths}<span className="unit">개월</span></span>
                    </div>
                    <div className="ip-cv-row" style={{ borderBottom: 'none', padding: '6px 0 0' }}>
                      <span className="k">결제 주기</span><span className="v">매월 선불</span>
                    </div>
                  </div>
                  <div style={{ padding: '10px 14px', borderRight: '1px solid #eef0f4' }}>
                    <div className="ip-cv-row" style={{ borderBottom: 'none', padding: 0 }}>
                      <span className="k">시작일</span><span className="v" style={{ fontSize: '8.5pt' }}>{fmtKDate(contractDate)}</span>
                    </div>
                    <div className="ip-cv-row" style={{ borderBottom: 'none', padding: '6px 0 0' }}>
                      <span className="k">종료일</span><span className="v" style={{ fontSize: '8.5pt' }}>{fmtKDate(endDate)}</span>
                    </div>
                  </div>
                  <div style={{ padding: '10px 14px', borderRight: '1px solid #eef0f4' }}>
                    <div className="ip-cv-row" style={{ borderBottom: 'none', padding: 0 }}>
                      <span className="k">월 대여료</span><span className="v">{fmtCurrency(monthlyRent)}<span className="unit">원</span></span>
                    </div>
                    <div className="ip-cv-row" style={{ borderBottom: 'none', padding: '6px 0 0' }}>
                      <span className="k">보증금</span><span className="v">{deposit > 0 ? fmtCurrency(deposit) : '—'}{deposit > 0 && <span className="unit">원</span>}</span>
                    </div>
                  </div>
                  <div style={{ padding: '10px 14px' }}>
                    <div className="ip-cv-row" style={{ borderBottom: 'none', padding: 0 }}>
                      <span className="k">인수가격</span><span className="v">{acquirePrice}</span>
                    </div>
                    <div className="ip-cv-row" style={{ borderBottom: 'none', padding: '6px 0 0' }}>
                      <span className="k">분납 여부</span><span className="v">{depositMethod}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 보증금 분납 상세 (있을 때만 노출) */}
              {(deposit2 > 0 || deposit3 > 0) && (
                <div className="ip-cv-box" style={{ gridColumn: '1 / -1' }}>
                  <div className="head">보증금 분납</div>
                  <div className="body" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, padding: 0 }}>
                    {[
                      { lbl: '1회차', val: deposit1 },
                      { lbl: '2회차', val: deposit2 },
                      { lbl: '3회차', val: deposit3 },
                    ].map((d, i) => (
                      <div key={i} style={{ padding: '10px 14px', borderRight: i < 2 ? '1px solid #eef0f4' : 'none' }}>
                        <div style={{ fontSize: '8pt', color: 'var(--mute)', fontWeight: 600, letterSpacing: 0.3, marginBottom: 4 }}>{d.lbl} 보증금</div>
                        <div style={{ fontSize: '11pt', fontWeight: 800, color: d.val > 0 ? 'var(--ink)' : 'var(--muted2)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.3px' }}>
                          {d.val > 0 ? fmtCurrency(d.val) : '—'}{d.val > 0 && <span style={{ fontSize: '8.5pt', fontWeight: 500, color: 'var(--mute)', marginLeft: 2 }}>원</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 하단: 회사 정보 */}
            <div className="ip-cv-corp push-bottom">
              <div className="label">임 대 인</div>
              <div className="info">
                <div className="name">{coName}</div>
                <div className="meta">
                  <div><strong>대표자</strong>{coCeo} &nbsp;·&nbsp; <strong>사업자번호</strong>{coBizNo} &nbsp;·&nbsp; <strong>연락처</strong>{coPhone}</div>
                  <div>{coAddr}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ───── PAGE 1 · 계약 조건 및 결제 방법 ───── */}
        <div className="ctr-paper">
          <div className="ip-doc">
            <div className="doc-page-h">
              <div className="left">
                <div className="brand">{stripCorpSuffix(coName)}</div>
                <div className="kind">{docVariant} 계약서</div>
              </div>
              <div className="right">
                <div className="contractNo">계약번호 _____________</div>
                <div className="pageNo">{plate} · 1쪽</div>
              </div>
            </div>
            <div className="doc-page-title">계약 조건 및 결제 방법</div>

            {/* ─── 01. 고객 기본사항 (개인) ─── PDF page 2 그대로 6열 */}
            <div className="doc-sec">
              <span className="n">01.</span>고객 기본사항 (개인)
              <span className="meta">* 는 필수 입력</span>
            </div>
            <table className="doc-tbl">
              <colgroup>
                <col style={{ width: 92 }} /><col />
                <col style={{ width: 92 }} /><col />
                <col style={{ width: 92 }} /><col />
              </colgroup>
              <tbody>
                <tr>
                  <th>성명 *</th><td className="center">{cName}</td>
                  <th>주민번호 *</th><td className="center">{cIdent}</td>
                  <th>면허번호 *</th><td className="center">{cLicense}</td>
                </tr>
                <tr>
                  <th>주소 *</th><td colSpan={3}>{cAddr}</td>
                  <th>전화번호 *</th><td className="center">{cPhone}</td>
                </tr>
                <tr>
                  <th rowSpan={2}>개인사업자<br/><span className="sub">(해당 시)</span></th>
                  <th>상호</th><td colSpan={2} className="empty">—</td>
                  <th>가족 연락처 *</th><td className="center">{cFamilyPhone || '—'} {cFamilyRel && <span className="sub">({cFamilyRel})</span>}</td>
                </tr>
                <tr>
                  <th>사업장소재지</th><td colSpan={2} className="empty">—</td>
                  <th>사업자등록번호</th><td className="empty">—</td>
                </tr>
                <tr>
                  <th>실거주지</th><td colSpan={5}>{cAddr}</td>
                </tr>
              </tbody>
            </table>

            {/* ─── 02. 계약 조건 ─── PDF 그대로 7열 */}
            <div className="doc-sec">
              <span className="n">02.</span>계약 조건
              <span className="meta">단위: 원 · VAT 포함</span>
            </div>
            <table className="doc-tbl">
              <colgroup>
                <col style={{ width: 88 }} /><col />
                <col style={{ width: 56 }} />
                <col style={{ width: 84 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 94 }} />
                <col style={{ width: 94 }} />
              </colgroup>
              <thead>
                <tr>
                  <th colSpan={2}>대여차종 (모델 · 트림)</th>
                  <th>연료</th>
                  <th>색상</th>
                  <th>차량번호</th>
                  <th>보증금</th>
                  <th>인수가격</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={2} className="center">{model}</td>
                  <td className="center">{fuel}</td>
                  <td className="center">{color}</td>
                  <td className="center">{plate}</td>
                  <td className="amt">{deposit > 0 ? fmtCurrency(deposit) : '—'}</td>
                  <td className="center">{acquirePrice}</td>
                </tr>
                <tr>
                  <th>옵션</th>
                  <td colSpan={3}>{options}</td>
                  <th>월 대여료</th>
                  <td colSpan={2} className="amt lg">{fmtCurrency(monthlyRent)}</td>
                </tr>
                <tr>
                  <th>정비상품</th>
                  <td colSpan={3} className="center">정비제외</td>
                  <th>계약종료 시<br/>보증금 반환</th>
                  <td colSpan={2} className="note">차량 반납 시 과태료(하이패스) 미납 및 사고 여부 확인 후 <strong>1주일 이내</strong> 고객 지정 계좌로 반환 처리됩니다.</td>
                </tr>
                <tr>
                  <th rowSpan={3}>대여기간</th>
                  <td rowSpan={3} className="center" style={{ fontWeight: 700, fontSize: '10pt' }}>
                    차량 인도일로부터<br/>{termMonths} 개월
                  </td>
                  <th colSpan={2}>운전자 연령</th>
                  <td colSpan={3} className="center">만 30세 이상</td>
                </tr>
                <tr>
                  <th colSpan={2}>현재 주행거리</th>
                  <td colSpan={3}>{mileage}</td>
                </tr>
                <tr>
                  <th colSpan={2}>연간 약정 주행거리</th>
                  <td className="center">{annualMileage}</td>
                  <td colSpan={2} className="note">초과 시 1km당 국산 200원 · 수입 400원 부과</td>
                </tr>
                <tr>
                  <th>계약시작일</th>
                  <td colSpan={3} className="center">{fmtKDate(contractDate)}</td>
                  <th>인수 옵션</th>
                  <td colSpan={2} className="center">{acquireType}</td>
                </tr>
                <tr>
                  <th>계약종료일</th>
                  <td colSpan={3} className="center">{fmtKDate(endDate)}</td>
                  <th>대여료 결제주기</th>
                  <td colSpan={2} className="center">매월 선불 결제</td>
                </tr>
              </tbody>
            </table>

            {/* ─── 03. 결제 방법 ─── PDF 그대로 6열 */}
            <div className="doc-sec">
              <span className="n">03.</span>결제 방법
            </div>
            <table className="doc-tbl">
              <colgroup>
                <col style={{ width: 108 }} />
                <col style={{ width: 130 }} />
                <col />
                <col style={{ width: 108 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 60 }} />
              </colgroup>
              <tbody>
                <tr>
                  <th>대여료 입금계좌</th>
                  <td colSpan={3}>{coBank} &nbsp; {coAcct} &nbsp; <strong>{stripCorpSuffix(coName)}</strong></td>
                  <th>계산서 발행<br/><span className="sub">(사업자)</span></th>
                  <td className="center">익월 10일 이내</td>
                </tr>
                <tr>
                  <th>대여료 자동이체일</th>
                  <td className="note">출고일 기점 자동이체일 고정<br/>(변경 불가)</td>
                  <td colSpan={4}>
                    매월
                    <span className={`chk${paymentDay === 5 ? ' on' : ''}`}>5일</span>
                    <span className={`chk${paymentDay === 10 ? ' on' : ''}`}>10일</span>
                    <span className={`chk${paymentDay === 15 ? ' on' : ''}`}>15일</span>
                    <span className={`chk${paymentDay === 20 ? ' on' : ''}`}>20일</span>
                    <span className={`chk${paymentDay === 25 ? ' on' : ''}`}>25일</span>
                  </td>
                </tr>
                <tr>
                  <th>보증금 · 대여료<br/>연체 안내</th>
                  <td colSpan={5} className="note">
                    임차인은 대여 약관에 동의하며, 계약기간 중이라도 대여료 및 보험 면책금을 청구일로부터 <span className="em">3일 연체 시 오후 6시 시동제어, 10일 연체 시 계약 자동 해지</span> 되며, 임대인은 차량을 회수할 수 있고 임차인은 민·형사상 책임을 묻지 않는다.&nbsp; <strong>※ 보증금 2회차 미납 시 즉시 시동제어.</strong>
                  </td>
                </tr>
                <tr>
                  <th rowSpan={2}>중도해지수수료<br/>(위약금)</th>
                  <td colSpan={3} className="center">잔여기간 대여료 합 × 해지수수료율</td>
                  <th>지연 손해금</th>
                  <td className="note" style={{ textAlign: 'center', fontWeight: 700 }}>5% / 12%</td>
                </tr>
                <tr>
                  <td colSpan={3} className="note center">
                    ※ 해지수수료율 — 차량 인도일로부터 <strong>1년 미만 30%</strong> &nbsp;/&nbsp; <strong>1년 이상 20%</strong>
                  </td>
                  <td colSpan={2} className="note">
                    지급명령신청서 신청일부터 송달된 날까지 <strong>연 5%</strong>, 다음 날부터 다 갚는 날까지 <strong>연 12%</strong>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 특약 */}
            {specialNote && (
              <>
                <div className="doc-sec">
                  <span className="n">04.</span>특약 사항
                </div>
                <table className="doc-tbl">
                  <tbody>
                    <tr><td colSpan={6} style={{ whiteSpace: 'pre-line', padding: '10px 12px' }}>{specialNote}</td></tr>
                  </tbody>
                </table>
              </>
            )}

            {/* 임차인 동의문 */}
            <div className="ip-consent push-bottom">
              임차인(계약자)는 본 계약의 주요 내용인 계약조건 세부사항, 자동차보험 사항, 정비서비스, 특약사항 및 뒷면의 자동차 임대차 계약 약관에 대하여 충분한 설명을 듣고 잘 이해한 후 본인의 의사에 따라 본 계약을 체결하였으며, 본 계약 내용을 성실히 이행할 것을 확약합니다.
            </div>

            <div className="ip-consent-sub">※ 위 내용을 읽고 이해 하고 본 계약을 체결함을 동의 함.</div>

            {/* 서명란 — 표준 격식 */}
            <div className="ip-sign">
              <div className="col">
                <div className="role">임차인 (계약자)</div>
                <div className="box">
                  <span className="name">{cName}</span>
                  <span className="seal">(인)</span>
                </div>
              </div>
              <div className="col">
                <div className="role">임 대 인</div>
                <div className="box">
                  <div>
                    <div className="corp">{coName}</div>
                    <div className="ceo">대표자 &nbsp;{coCeo}</div>
                    <div className="tel">연락처 &nbsp;{coPhone}</div>
                  </div>
                  <span className="seal">(인)</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14, textAlign: 'center', fontSize: '11pt', fontWeight: 700, color: 'var(--ink-soft)', letterSpacing: 1 }}>
              {fmtKDate(issuedDate)}
            </div>
          </div>
        </div>

        {/* ───── PAGE 2 · 자동차보험 및 정비 서비스 ───── */}
        <div className="ctr-paper">
          <div className="ip-doc">
            <div className="doc-page-h">
              <div className="left">
                <div className="brand">{stripCorpSuffix(coName)}</div>
                <div className="kind">{docVariant} 계약서</div>
              </div>
              <div className="right">
                <div className="contractNo">계약번호 _____________</div>
                <div className="pageNo">{plate} · 2쪽</div>
              </div>
            </div>
            <div className="doc-page-title">자동차보험 및 정비 서비스</div>

            {/* 04. 자동차보험 사항 */}
            <div className="doc-sec">
              <span className="n">04.</span>자동차보험 사항 <span className="sub" style={{ fontSize: '8.5pt', fontWeight: 500, color: 'var(--mute)', marginLeft: 4 }}>(자차손해면책 제도)</span>
              <span className="meta">* 면허 취득 1년 이하 임차인의 경우 면책금 금액 추가</span>
            </div>

            <table className="doc-tbl">
              <colgroup>
                <col style={{ width: 108 }} />
                <col style={{ width: 90 }} />
                <col />
                <col style={{ width: 90 }} />
                <col />
                <col style={{ width: 90 }} />
                <col />
              </colgroup>
              <tbody>
                <tr>
                  <th colSpan={2}>운전자 연령</th>
                  <td colSpan={5}>만 26세 이상</td>
                </tr>
                <tr>
                  <th colSpan={2}>운전자 범위</th>
                  <td colSpan={5}>{docVariant === '자동차 렌탈(대여)' ? '[개인기본1] 계약자와 배우자 및 계약자와 배우자의 직계가족' : '—'}</td>
                </tr>
                <tr>
                  <th rowSpan={4}>추가운전자<br/>1인 지정<br/><span className="sub">(선택 시 기입)</span></th>
                  <th>성함 / 주민번호</th><td colSpan={5} className="empty">—</td>
                </tr>
                <tr>
                  <th>관계</th><td colSpan={5} className="empty">—</td>
                </tr>
                <tr>
                  <th>면허번호</th><td colSpan={5} className="empty">—</td>
                </tr>
                <tr>
                  <th>연락처</th><td colSpan={5} className="empty">—</td>
                </tr>
                <tr>
                  <th rowSpan={8}>가입내용<br/><span className="sub">(보상한도 등)</span></th>
                  <th>대인배상</th><td className="center">무한</td>
                  <th>대물배상</th><td className="center">1억원</td>
                  <th>자기신체사고</th><td className="center">자손 1억원</td>
                </tr>
                <tr>
                  <th>무보험차상해</th><td className="center">2억원</td>
                  <th>긴급출동</th><td colSpan={3} className="center">연 5회 <span className="sub">※ 사고 발생 시 즉시 접수</span></td>
                </tr>
                <tr>
                  <th>면책금<br/><span className="sub">(고객부담금)</span></th>
                  <td colSpan={5} className="note">사고접수 시 대인 <strong>30만원</strong> / 대물 <strong>30만원</strong> / 자차 사고처리 비용의 <strong>20%</strong> (최소 50만원 ~ 최대 100만원)</td>
                </tr>
                <tr>
                  <th>주의사항</th>
                  <td colSpan={5} className="note">교통 사고 접수 시 경찰 신고 또는 보험사 <span className="em">현장 출동이 없는 사고는 사고 처리 불가</span></td>
                </tr>
                <tr>
                  <th>사고다발<br/>계약해지</th>
                  <td colSpan={5} className="note">사고 발생 시점 1년 이내 임차인 과실비율 <strong>50% 이상의 사고 3회 누적 시 계약 해지</strong></td>
                </tr>
                <tr>
                  <th>사고차량<br/>입고 및 대차</th>
                  <td colSpan={5} className="note">사고 수리 시 임대인이 지정하는 협력 업체 정비공장 입고 및 당사 렌터카 또는 지정 렌터카 이용</td>
                </tr>
                <tr>
                  <th>중과실<br/>자차사고<br/><span className="sub">(20% 추가)</span></th>
                  <td colSpan={5} className="note">
                    1. 신호 위반 &nbsp; 2. 중앙선 침범 &nbsp; 3. 속도위반(20km↑) &nbsp; 4. 앞지르기 방법 위반 &nbsp; 5. 철길건널목 통과 위반 &nbsp; 6. 횡단보도 사고<br/>
                    7. 보도 침범 &nbsp; 8. 승객 추락방지 의무 위반 &nbsp; 9. 스쿨존 사고 &nbsp; 10. 화물 고정조치 위반 &nbsp; 11. 무면허운전 &nbsp; 12. 음주 운전
                  </td>
                </tr>
                <tr>
                  <th>자차 처리 규정</th>
                  <td colSpan={5} className="note">
                    · 보상한도: 렌터카 공제조합 또는 손해보험사 시세 (한도 초과 시 폐차)<br/>
                    · 중과실 사고 시 자차면책금은 수리비용의 <strong>20% 우선 적용</strong>, 임차인 과실 폐차 시 동급 차량으로 계약 유지하며 임대인 판단에 따라 본 계약 종료 가능
                  </td>
                </tr>
                <tr>
                  <th colSpan={2}>보험사</th>
                  <td colSpan={3}>{docVariant === '자동차 렌탈(대여)' ? '렌터카 공제조합 1661-7977' : 'DB손해보험 1588-0100'}</td>
                  <td colSpan={2} className="note">※ 보험사는 변경될 수 있습니다.</td>
                </tr>
              </tbody>
            </table>

            {/* 05. 정비서비스 및 기타내용 */}
            <div className="doc-sec">
              <span className="n">05.</span>정비서비스 및 기타내용
            </div>
            <table className="doc-tbl">
              <colgroup>
                <col style={{ width: 130 }} />
                <col />
                <col style={{ width: 90 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 80 }} />
              </colgroup>
              <tbody>
                <tr>
                  <th>정비 서비스</th>
                  <td colSpan={5} className="note">
                    ◆ 사전 합의된 <strong>지정 정비점에서 내방한 정비만 인정</strong> (예약 필수). 단, 사전 협의된 지정 정비점 제휴가 안 되어 있을 경우 제조사 공식공업사(블루핸즈·오토큐) 내방한 정비만 인정.<br/>
                    · 정비상품 미선택 시 정비·소모품 교체는 고객 부담. 단, 2천키로 또는 1개월 이내 기능 고장 시 수리비 지원 및 동종 차량 대차·교체 가능.
                  </td>
                </tr>
                <tr>
                  <th>엔진오일 서비스<br/><span className="sub">(연 1회)</span></th>
                  <td colSpan={5} className="note">차량점검 서비스 <strong>필수 가입</strong> [엔진오일 연 1회 비용 지원]. 최초 계약 후 12개월 뒤 첫 서비스, 이후 매년 진행.</td>
                </tr>
                <tr>
                  <th>대차서비스</th>
                  <td colSpan={5}>대차서비스 <span className="em">지원 불가</span></td>
                </tr>
                <tr>
                  <th>계약연장 및 해지</th>
                  <td colSpan={5} className="note">장기계약은 계약종료 한 달(30일) 전까지 당사 승인 필수. 계약 연장 희망 시 고객이 먼저 연락. 사전 연락 없이 이체일 경과 시 일할 계산되어 청구.</td>
                </tr>
                <tr>
                  <th>탁송료 (반납)</th>
                  <td colSpan={5}>계약 만기 외 반납 시 탁송료는 고객 부담</td>
                </tr>
                <tr>
                  <th>약정 운행거리</th>
                  <td colSpan={5} className="note">계약기간 내라도 연간 약정 주행거리를 일할 계산하여 초과 시 계약해지 또는 초과분 납부</td>
                </tr>
                <tr>
                  <th>연락처 · 주소 변경</th>
                  <td colSpan={5} className="note">정보 변경 시 렌트사에 먼저 연락. 연락 두절 시 시동제어 및 계약해지될 수 있습니다.</td>
                </tr>
                <tr>
                  <th>과태료 · 차량검사</th>
                  <td colSpan={5} className="note">과태료·통행료 발생 시 임차인 부과 또는 납부. 만기 반납 시 미납과태료·통행료는 보증금에서 차감. 미납·검사 불이행 시 시동제어 가능.</td>
                </tr>
                <tr>
                  <th>검사대행 서비스<br/><span className="sub">(대행업체 진행)</span></th>
                  <th>정기검사</th><td className="center">2년 1회</td>
                  <th>종합검사</th><td colSpan={2} className="center">1년 1회</td>
                </tr>
                <tr>
                  <th>서비스 품목<br/><span className="sub">(썬팅·블랙박스·내비)</span></th>
                  <th>자가수리 진행</th>
                  <th>특약사항</th>
                  <td colSpan={3} className="note">
                    자동차키는 1개만 지급 · GPS 장착 (도난 및 연체·연락 두절 시 시동 제어) · <span className="em">GPS 불법 탈거 시 민·형사 고발 조치</span>
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="ip-consent push-bottom">
              임차인(계약자)는 본 계약의 주요 내용인 계약조건 세부사항, 자동차보험 사항, 정비서비스, 특약사항 및 뒷면의 자동차 임대차 계약 약관에 대하여 충분한 설명을 듣고 잘 이해한 후 본인의 의사에 따라 본 계약을 체결하였으며, 본 계약 내용을 성실히 이행할 것을 확약합니다.
            </div>
            <div className="ip-consent-sub">※ 위 내용을 읽고 이해 하고 본 계약을 체결함을 동의 함.</div>

            <div className="ip-sign">
              <div className="col">
                <div className="role">임차인 (계약자)</div>
                <div className="box"><span className="name">{cName}</span><span className="seal">(인)</span></div>
              </div>
              <div className="col">
                <div className="role">임 대 인</div>
                <div className="box">
                  <div>
                    <div className="corp">{coName}</div>
                    <div className="ceo">대표자 &nbsp;{coCeo}</div>
                    <div className="tel">연락처 &nbsp;{coPhone}</div>
                  </div>
                  <span className="seal">(인)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ───── PAGE 3 · 사실 확인서 ───── */}
        <div className="ctr-paper">
          <div className="ip-doc">
            <div className="doc-page-h">
              <div className="left">
                <div className="brand">{stripCorpSuffix(coName)}</div>
                <div className="kind">{docVariant} 계약서</div>
              </div>
              <div className="right">
                <div className="contractNo">계약번호 _____________</div>
                <div className="pageNo">{plate} · 3쪽</div>
              </div>
            </div>
            <div className="doc-page-title center">자동차 임대차 계약 사실 확인서</div>

            {/* 01. 임차인 */}
            <div className="doc-sec">
              <span className="n">01.</span>임차인
              <span className="meta">* 는 필수 입력</span>
            </div>
            <table className="doc-tbl">
              <colgroup>
                <col style={{ width: 92 }} /><col />
                <col style={{ width: 92 }} /><col />
                <col style={{ width: 92 }} /><col />
              </colgroup>
              <tbody>
                <tr>
                  <th>성명 *</th><td className="center">{cName}</td>
                  <th>주민번호 *</th><td className="center">{cIdent}</td>
                  <th>면허번호 *</th><td className="center">{cLicense}</td>
                </tr>
                <tr>
                  <th>주소 *</th><td colSpan={3}>{cAddr}</td>
                  <th>전화번호 *</th><td className="center">{cPhone}</td>
                </tr>
                <tr>
                  <th rowSpan={2}>사업자<br/><span className="sub">(해당 시)</span></th>
                  <th>상호</th><td colSpan={2} className="empty">—</td>
                  <th>사업자등록번호</th><td className="empty">—</td>
                </tr>
                <tr>
                  <th>사업장소재지</th><td colSpan={2} className="empty">—</td>
                  <th>비상연락처 *</th><td className="center">{cFamilyPhone || '—'}</td>
                </tr>
                <tr>
                  <th>실거주지</th><td colSpan={5}>{cAddr}</td>
                </tr>
              </tbody>
            </table>

            {/* 02. 차량별 계약기간 */}
            <div className="doc-sec">
              <span className="n">02.</span>차량별 계약기간
              <span className="meta">최대 10건까지 등록</span>
            </div>
            <table className="doc-tbl">
              <colgroup>
                <col style={{ width: 42 }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '14%' }} />
                <col />
                <col style={{ width: '17%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '10%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>NO.</th>
                  <th>대여차종</th>
                  <th>차량번호</th>
                  <th>대여기간</th>
                  <th>대여시작일<br/><span className="sub">(차량인도일)</span></th>
                  <th>대여종료일<br/><span className="sub">(차량반납일)</span></th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="center">01</td>
                  <td className="center">{model}</td>
                  <td className="center">{plate}</td>
                  <td className="center">차량 인도일로부터 {termMonths}개월</td>
                  <td className="center">{fmtKDate(contractDate)}</td>
                  <td className="center">{fmtKDate(endDate)}</td>
                  <td className="empty">—</td>
                </tr>
                {Array.from({ length: 9 }).map((_, i) => (
                  <tr key={i + 2}>
                    <td className="center" style={{ color: 'var(--mute)' }}>{String(i + 2).padStart(2, '0')}</td>
                    <td className="empty">—</td>
                    <td className="empty">—</td>
                    <td className="empty">—</td>
                    <td className="empty">—</td>
                    <td className="empty">—</td>
                    <td className="empty">—</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ fontSize: '9pt', color: 'var(--ink-soft)', lineHeight: 1.7, marginTop: 14, fontWeight: 600 }}>
              <strong style={{ color: 'var(--ink)' }}>임차인(계약자)</strong>은 상기 차량에 대하여 임차한 사실이 틀림없음을 확인하며, 대여기간 중 발생하는 도로교통법 위반에 대한 과태료·범칙금·주차료·통행료 등을 부담할 것을 확약합니다.
            </div>

            <div className="ip-consent-sub push-bottom" style={{ marginTop: 10 }}>※ 위 내용을 읽고 이해 하고 본 계약을 체결함을 동의 함.</div>

            <div className="ip-sign">
              <div className="col">
                <div className="role">임차인 (계약자)</div>
                <div className="box">
                  <span className="name">{cName}</span>
                  <span className="seal">(인)</span>
                </div>
              </div>
              <div className="col">
                <div className="role">임 대 인</div>
                <div className="box">
                  <div>
                    <div className="corp">{coName}</div>
                    <div className="ceo">대표자 &nbsp;{coCeo}</div>
                    <div className="tel">연락처 &nbsp;{coPhone}</div>
                  </div>
                  <span className="seal">(인)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ───── PAGE 4 · 개인정보 동의서 ───── */}
        <div className="ctr-paper">
          <div className="ip-doc">
            <div className="doc-page-h">
              <div className="left">
                <div className="brand">{stripCorpSuffix(coName)}</div>
                <div className="kind">{docVariant} 계약서</div>
              </div>
              <div className="right">
                <div className="contractNo">계약번호 _____________</div>
                <div className="pageNo">{plate} · 4쪽</div>
              </div>
            </div>
            <div className="doc-page-title center">개인정보 수집·이용·제3자 제공 동의서</div>

            <div className="ip-terms-intro" style={{ marginBottom: 14, textAlign: 'center', borderLeft: 'none', borderTop: `2px solid var(--accent)`, borderBottom: `1px solid var(--line)`, padding: '14px 18px', background: 'var(--bg-soft)' }}>
              <strong>{coName}</strong>는 자동차 임대차계약 체결을 위하여 귀하의 개인정보를 수집·이용하고자 하며, 「개인정보 보호법」 등 관련 법규에 의거 귀하의 개인정보를 제공받고자 하오니, 아래의 내용을 자세히 읽어보신 후 동의여부를 결정하여 주시기 바랍니다.
            </div>

            {/* ① 수집·이용 */}
            <div className="doc-sec">
              <span className="n">①</span>개인정보 수집 · 이용에 관한 사항
            </div>
            <table className="doc-tbl">
              <colgroup><col style={{ width: 140 }} /><col /></colgroup>
              <tbody>
                <tr>
                  <th>수집 · 이용 목적</th>
                  <td>자동차 임대차계약 체결 및 유지·관리 (세금계산서 발행 등)</td>
                </tr>
                <tr>
                  <th>개인정보의 수집항목</th>
                  <td>성명, 주민등록번호, 주소, 전화번호, 운전면허정보, 계좌정보, 이메일<br/><span className="sub">* 주민등록번호 수집은 부가가치세법 제32조 제2항에 의거 세금계산서 발행을 위해 수집함</span></td>
                </tr>
                <tr>
                  <th>보유 및 이용 기간</th>
                  <td>자동차 임대차계약 체결일로부터 계약종료일까지</td>
                </tr>
                <tr>
                  <th>동의 거부 권리<br/>및 불이익</th>
                  <td className="note">개인정보의 수집·이용에 동의를 거부할 수 있으며, 이 경우 자동차 임대차계약이 불가합니다.</td>
                </tr>
                <tr>
                  <th>동의 여부</th>
                  <td>
                    항목에 대한 개인정보 수집·이용에 동의하십니까? &nbsp;
                    <span className="chk on">동의함</span>
                    <span className="chk">동의하지 않음</span>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ② 제3자 제공 */}
            <div className="doc-sec">
              <span className="n">②</span>개인정보의 제3자 제공에 관한 사항
            </div>
            <table className="doc-tbl">
              <colgroup><col style={{ width: 140 }} /><col /></colgroup>
              <tbody>
                <tr><th>제공받는 자</th><td>렌터카 임대인이 차량 및 계약 유지관리를 위해 지정한 위탁업체 (탁송·정비·영업 등)</td></tr>
                <tr><th>이용 목적</th><td>차량 탁송(차량 인도 및 회수), 영업상담 및 관리</td></tr>
                <tr><th>제공 항목</th><td>성명, 주소, 전화번호</td></tr>
                <tr><th>보유 및 이용 기간</th><td>자동차 임대차계약기간</td></tr>
                <tr>
                  <th>동의 거부 권리<br/>및 불이익</th>
                  <td className="note">개인정보의 제공에 동의를 거부할 수 있으며, 이 경우 자동차 임대차계약이 불가합니다.</td>
                </tr>
                <tr>
                  <th>동의 여부</th>
                  <td>
                    위와 같이 개인정보를 제공하는 것에 동의하십니까? &nbsp;
                    <span className="chk on">동의함</span>
                    <span className="chk">동의하지 않음</span>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ③ 차량 회수 동의서 */}
            <div className="doc-sec">
              <span className="n">③</span>렌터카 차량 회수 동의서
            </div>
            <table className="doc-tbl">
              <colgroup><col style={{ width: 140 }} /><col /></colgroup>
              <tbody>
                <tr><th>회수 사유</th><td>렌터카를 대여 사용 중 <strong>계약 내용 위반</strong>(약관 제10조 해지 참조)으로 인한 차량 회수 가능</td></tr>
                <tr><th>차량 내부 물품</th><td>차량 내부 개인 사물 및 모든 것에 대한 책임은 묻지 않고, 물품은 보관하지 않습니다.</td></tr>
                <tr><th>책임 소재</th><td>법적으로 발생하는 <span className="em">민·형사 책임 또한 계약자 본인</span>에게 있습니다.</td></tr>
                <tr>
                  <th>동의 여부</th>
                  <td>
                    위와 같이 차량 회수에 동의하십니까? &nbsp;
                    <span className="chk on">동의함</span>
                    <span className="chk">동의하지 않음</span>
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="ip-consent-sub push-bottom" style={{ marginTop: 14 }}>※ 위 내용을 읽고 이해 하고 본 계약을 체결함을 동의 함.</div>

            <div className="ip-sign">
              <div className="col">
                <div className="role">임차인 (계약자)</div>
                <div className="box">
                  <span className="name">{cName}</span>
                  <span className="seal">(인)</span>
                </div>
              </div>
              <div className="col">
                <div className="role">임 대 인</div>
                <div className="box">
                  <div>
                    <div className="corp">{coName}</div>
                    <div className="ceo">대표자 &nbsp;{coCeo}</div>
                    <div className="tel">연락처 &nbsp;{coPhone}</div>
                  </div>
                  <span className="seal">(인)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ───── PAGE 5 · 운전자격 검증 확인서 ───── */}
        <div className="ctr-paper">
          <div className="ip-doc">
            <div className="doc-page-h">
              <div className="left">
                <div className="brand">{stripCorpSuffix(coName)}</div>
                <div className="kind">{docVariant} 계약서</div>
              </div>
              <div className="right">
                <div className="contractNo">계약번호 _____________</div>
                <div className="pageNo">{plate} · 5쪽</div>
              </div>
            </div>
            <div className="doc-page-title center">운전자격 검증 확인서</div>

            <div className="ip-terms-intro" style={{ marginBottom: 16 }}>
              회사 <strong>{coName}</strong>는 차량 대여 서비스 제공을 위해 「여객자동차운수사업법 제34조의2 제2항」에 따라 임대차계약서상 운전자의 운전자격 (운전면허 효력유무 및 운전면허 범위) 을 확인하여야 할 의무가 있어 다음과 같이 귀하의 확인을 받고자 합니다.
            </div>

            <table className="doc-tbl">
              <colgroup><col style={{ width: 130 }} /><col /></colgroup>
              <tbody>
                <tr>
                  <th>① 면허증 사본 확인</th>
                  <td className="note">대여사업자가 대여계약서 상 운전자[제2운전자(공동임차인) 포함]의 운전면허증 원본을 제출받아 사본을 저장하고, <strong>운전면허증상의 사진과 본인의 얼굴을 면밀히 대조</strong>하였음을 확인합니다.</td>
                </tr>
                <tr>
                  <th>② 면허 효력 유지</th>
                  <td className="note">대여계약서 상 운전자[제2운전자(공동임차인) 포함] &quot;본인&quot;은 <strong>도로교통법 제93조에 따라 취소되거나 정지되지 아니하였고</strong>, 도로교통법 제95조 제1항의 운전면허증 반납의무를 위반하지 않았음을 확인합니다.</td>
                </tr>
                <tr>
                  <th>③ 위·변조 책임</th>
                  <td className="note">&quot;본인&quot;은 형법 제225조를 위반하여 운전면허증을 위·변조하였거나 도로교통법 제95조 제1항에 따른 운전면허증 반납의무를 위반하였을 경우 <span className="em">민·형사상의 일체의 불이익에 대하여 감수</span>할 것을 확인합니다.</td>
                </tr>
              </tbody>
            </table>

            <div style={{ textAlign: 'center', fontSize: '10pt', fontWeight: 700, color: 'var(--ink)', marginTop: 14 }}>
              상기 내용과 같이 대여사업자에게 안내받고 운전자격을 확인하였습니다.
            </div>

            <table className="doc-tbl" style={{ marginTop: 10 }}>
              <colgroup><col style={{ width: '50%' }} /><col /></colgroup>
              <tbody>
                <tr>
                  <th style={{ textAlign: 'center' }}>작성일</th>
                  <th style={{ textAlign: 'center' }}>성명</th>
                </tr>
                <tr>
                  <td className="center" style={{ fontSize: '10.5pt', fontWeight: 700, color: 'var(--ink)', height: 56 }}>{fmtKDate(issuedDate)}</td>
                  <td className="center" style={{ fontSize: '14pt', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.3px' }}>
                    {cName} <span className="sub" style={{ fontSize: '9pt', marginLeft: 8 }}>(서명)</span>
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="doc-sec" style={{ marginTop: 14 }}>
              <span className="n" style={{ color: 'var(--danger)' }}>※</span>민·형사상 받을 수 있는 불이익
            </div>
            <table className="doc-tbl">
              <colgroup><col style={{ width: 130 }} /><col /></colgroup>
              <tbody>
                <tr>
                  <th>공문서 위조 · 변조</th>
                  <td className="note">「형법 제225조」 행사할 목적으로 공무원 또는 공무소의 문서·도화를 <strong>위조 또는 변조한 자는 10년 이하의 징역</strong>에 처한다.</td>
                </tr>
                <tr>
                  <th>자동차대여 표준약관</th>
                  <td className="note">제4조 ② 신원확인 불가·자료요구 불응 시 대여계약 체결 거절. 제7조 ① 개인정보 허위 판명 또는 운전면허 취소·정지 시 회사는 계약을 해지할 수 있습니다.</td>
                </tr>
                <tr>
                  <th>면허증 반납 의무</th>
                  <td className="note">「도로교통법 제95조」 운전면허 취소·효력 정지처분을 받은 경우 <strong>그 사유 발생일부터 7일 이내</strong> 주소지 관할 지방경찰청장에게 운전면허증을 반납하여야 합니다.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ───── PAGE 6 · 차량 인수증 ───── */}
        <div className="ctr-paper">
          <div className="ip-doc">
            <div className="doc-page-h">
              <div className="left">
                <div className="brand">{stripCorpSuffix(coName)}</div>
                <div className="kind">{docVariant} 계약서</div>
              </div>
              <div className="right">
                <div className="contractNo">계약번호 _____________</div>
                <div className="pageNo">{plate} · 6쪽</div>
              </div>
            </div>
            <div className="doc-page-title center">차량 인수증</div>

            <table className="doc-tbl">
              <colgroup>
                <col style={{ width: 92 }} /><col />
                <col style={{ width: 92 }} /><col />
              </colgroup>
              <tbody>
                <tr>
                  <th>차종</th><td className="center">{model}</td>
                  <th>차량 번호</th><td className="center">{plate}</td>
                </tr>
                <tr>
                  <th>색상</th><td className="center">{color}</td>
                  <th>주행거리</th><td className="center">{mileage}</td>
                </tr>
                <tr>
                  <th>인수 일시</th><td colSpan={3} className="center">{fmtKDate(issuedDate)} &nbsp;&nbsp; <span className="sub">__시 __분</span></td>
                </tr>
              </tbody>
            </table>

            <div className="doc-sec">
              <span className="n">01.</span>차량 외부 상태 점검
              <span className="meta">√ 표시 후 적어주세요</span>
            </div>
            <table className="doc-tbl">
              <tbody>
                <tr>
                  <td style={{ height: 220, padding: 16, textAlign: 'center', verticalAlign: 'middle', color: 'var(--muted2)', fontSize: '9pt', background: '#fafbfc' }}>
                    <div style={{ fontSize: '28pt', lineHeight: 1, marginBottom: 8 }}>🚗</div>
                    <div>차량 외관 4면도</div>
                    <div className="sub" style={{ marginTop: 4 }}>현장 인수 시 외관 상태를 도면에 직접 표시</div>
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="doc-sec">
              <span className="n">02.</span>동봉 비품 체크리스트
            </div>
            <table className="doc-tbl">
              <tbody>
                <tr>
                  <td className="center">
                    <span className="chk">네비게이션</span>
                    <span className="chk">블랙박스</span>
                    <span className="chk">스노우체인</span>
                    <span className="chk">안전표시판</span>
                    <span className="chk">스페어타이어</span>
                    <span className="chk">기타</span>
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ fontSize: '9pt', color: 'var(--ink-soft)', lineHeight: 1.7, marginTop: 14, padding: '12px 16px', background: 'var(--bg-soft)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
              인수자는 <strong style={{ color: 'var(--ink)' }}>{fmtKDate(issuedDate)}</strong> &nbsp; <span style={{ color: 'var(--mute)' }}>__시 __분</span>에 상기 차량을 인수받았음을 증명합니다.
            </div>

            <div className="ip-consent-sub push-bottom" style={{ marginTop: 14 }}>※ 위 내용을 읽고 이해 하고 본 계약을 체결함을 동의 함.</div>

            <div className="ip-sign">
              <div className="col">
                <div className="role">임차인 (계약자)</div>
                <div className="box">
                  <span className="name">{cName}</span>
                  <span className="seal">(인)</span>
                </div>
              </div>
              <div className="col">
                <div className="role">임 대 인</div>
                <div className="box">
                  <div>
                    <div className="corp">{coName}</div>
                    <div className="ceo">대표자 &nbsp;{coCeo}</div>
                    <div className="tel">연락처 &nbsp;{coPhone}</div>
                  </div>
                  <span className="seal">(인)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ───── PAGE 7 · 효성 CMS 자동이체신청서 ───── */}
        <div className="ctr-paper">
          <div className="ip-doc">
            <div className="doc-page-h">
              <div className="left">
                <div className="brand">{stripCorpSuffix(coName)}</div>
                <div className="kind">{docVariant} 계약서</div>
              </div>
              <div className="right">
                <div className="contractNo">계약번호 _____________</div>
                <div className="pageNo">{plate} · 7쪽</div>
              </div>
            </div>
            <div className="doc-page-title center">
              효성 CMS 자동이체 신청서
              <div style={{ fontSize: '8pt', fontWeight: 500, color: 'var(--mute)', marginTop: 6, letterSpacing: 0 }}>금융기관 및 결제대행사(효성에프엠에스㈜) 제출용</div>
            </div>

            {/* 수납업체 및 목적 */}
            <div className="doc-sec">
              <span className="n">①</span>수납업체 및 목적
              <span className="meta">수납업체 기재란</span>
            </div>
            <table className="doc-tbl">
              <colgroup>
                <col style={{ width: 110 }} /><col />
                <col style={{ width: 130 }} /><col />
              </colgroup>
              <tbody>
                <tr>
                  <th>수납업체</th><td>{coName}</td>
                  <th>수납목적</th><td>대여료 결제</td>
                </tr>
                <tr>
                  <th>대표자</th><td>{coCeo}</td>
                  <th>사업자등록번호</th><td>{coBizNo}</td>
                </tr>
                <tr>
                  <th>주소</th><td colSpan={3}>{coAddr}</td>
                </tr>
              </tbody>
            </table>

            {/* 자동이체 신청내용 */}
            <div className="doc-sec">
              <span className="n">②</span>자동이체 신청내용
              <span className="meta">신청고객 기재란</span>
            </div>
            <table className="doc-tbl">
              <colgroup>
                <col style={{ width: 110 }} /><col />
                <col style={{ width: 130 }} /><col />
              </colgroup>
              <tbody>
                <tr>
                  <th>신청인</th><td>{cName}</td>
                  <th>예금주와 관계</th><td className="empty">(&nbsp;&nbsp;&nbsp;&nbsp;)</td>
                </tr>
                <tr>
                  <th>연락처</th><td>{cPhone}</td>
                  <th>납부일</th><td>매월 {paymentDay || '__'}일 &nbsp;<span className="sub">* 미납 시 ___일, ___일 재출금</span></td>
                </tr>
                <tr>
                  <th>납부금액</th>
                  <td colSpan={3}>
                    <span className="chk on">고정금액</span> {fmtCurrency(monthlyRent)} 원 &nbsp;&nbsp;
                    <span className="chk">변동 (추가 계약내용에 따름)</span>
                  </td>
                </tr>
                <tr><th>은행명</th><td className="empty">—</td><th>예금주</th><td className="empty">—</td></tr>
                <tr><th>계좌번호</th><td colSpan={3} className="empty">—</td></tr>
                <tr>
                  <th>예금주 생년월일<br/><span className="sub">(또는 사업자등록번호)</span></th>
                  <td className="empty">—</td>
                  <th>예금주 휴대전화</th>
                  <td className="empty">—</td>
                </tr>
              </tbody>
            </table>

            {/* 개인정보 동의 */}
            <div className="doc-sec">
              <span className="n">③</span>개인정보 수집 및 이용 동의
            </div>
            <table className="doc-tbl">
              <colgroup><col style={{ width: 140 }} /><col /></colgroup>
              <tbody>
                <tr><th>수집·이용 목적</th><td>효성 CMS 자동이체를 통한 요금 수납</td></tr>
                <tr><th>수집항목</th><td className="note">성명, 성별, 생년월일, 연락처, 결제사명, 결제자명, 계좌번호, 카드번호, 유효기간, 휴대/유선전화번호</td></tr>
                <tr><th>보유 및 이용기간</th><td>수집·이용 동의일부터 자동이체 종료일(해지일)까지</td></tr>
                <tr><th>동의 거부 시 불이익</th><td className="note"><span className="em">신청자는 거부할 수 있습니다.</span> 단, 거부 시 자동이체 신청이 처리되지 않습니다.</td></tr>
                <tr>
                  <th>동의 여부</th>
                  <td>
                    <span className="chk on">동의함</span>
                    <span className="chk">동의하지 않음</span>
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="doc-sec">
              <span className="n">④</span>개인정보 제3자 제공 동의
            </div>
            <table className="doc-tbl">
              <colgroup><col style={{ width: 140 }} /><col /></colgroup>
              <tbody>
                <tr><th>제공받는 자</th><td className="note">효성에프엠에스㈜, 금융기관, 통신사, 카드사, 결제대행사(KG이니시스 등), 효성ITX 등</td></tr>
                <tr><th>이용 목적</th><td>자동이체 서비스 제공 및 동의 사실 통지, 고객센터 운영</td></tr>
                <tr><th>보유·이용 기간</th><td className="note">동의일부터 자동이체 종료일(해지일)까지 (관계 법령에 의거 기간 보관)</td></tr>
                <tr>
                  <th>동의 여부</th>
                  <td>
                    <span className="chk on">동의함</span>
                    <span className="chk">동의하지 않음</span>
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ fontSize: '9pt', color: 'var(--ink-soft)', lineHeight: 1.7, marginTop: 10, padding: '12px 16px', background: 'var(--bg-soft)', border: '1px solid var(--line)', borderRadius: 4, textAlign: 'center' }}>
              <strong style={{ color: 'var(--ink)' }}>신청인(예금주)</strong>은 신청정보·금융거래정보 등 개인정보의 수집·이용, 제3자 제공 및 월자동납부에 동의하며, 상기와 같이 효성 CMS 자동이체를 신청합니다.
            </div>

            <div className="push-bottom" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 16, paddingTop: 14, borderTop: '1.5px solid var(--ink)' }}>
              <div style={{ fontSize: '10.5pt', fontWeight: 700, color: 'var(--ink-soft)', letterSpacing: 1 }}>{fmtKDate(issuedDate)}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <span style={{ fontSize: '9pt', color: 'var(--mute)', fontWeight: 600 }}>신청인</span>
                  <span style={{ fontSize: '16pt', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.3px' }}>{cName}</span>
                  <span style={{ fontSize: '8.5pt', color: 'var(--mute)' }}>(인) 또는 서명</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <span style={{ fontSize: '9pt', color: 'var(--mute)', fontWeight: 600 }}>예금주</span>
                  <span style={{ fontSize: '10pt', color: 'var(--muted2)', fontWeight: 500 }}>(신청인과 다를 경우 별도 서명)</span>
                  <span style={{ fontSize: '8.5pt', color: 'var(--mute)' }}>(인) 또는 서명</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ───── PAGE 8 · 약관 (1) ───── */}
        <div className="ctr-paper">
          <div className="ip-doc">
            <div className="doc-page-h">
              <div className="left">
                <div className="brand">{stripCorpSuffix(coName)}</div>
                <div className="kind">{docVariant} 계약서</div>
              </div>
              <div className="right">
                <div className="contractNo">계약번호 _____________</div>
                <div className="pageNo">{plate} · 약관 1/3</div>
              </div>
            </div>
            <div className="doc-page-title center">
              자동차 임대차 계약 약관 <span style={{ fontSize: '12pt', fontWeight: 500, color: 'var(--mute)' }}>제1조 ~ 제5조</span>
            </div>

            <div className="ip-terms-intro">
              임차인 <strong>{cName}</strong> (이하 &quot;고객&quot;)과 임대인 렌터카 소유사(이하 &quot;회사&quot;)는 차량의 임대차 계약(이하 &quot;본 계약&quot;)을 체결함에 있어 다음과 같이 합의하고 이를 성실히 준수, 이행하기로 합니다.
            </div>

            <div className="ip-terms-body">
              <div className="art">
                <div className="art-h"><span className="art-num">제1조</span> 차종 및 대여요금</div>
                <p>대여 차량의 차종 및 대여 요금은 고객과 회사가 합의한 본 계약서 [계약내용]의 [차종&옵션 및 월대여료총액]에 의하며, 월대여료에는 각종 세금 및 공과금, 자동차보험료 등이 포함되어 있습니다.</p>
              </div>

              <div className="art">
                <div className="art-h"><span className="art-num">제2조</span> 계약기간</div>
                <p>1. 본 계약의 계약기간은 계약체결일로부터 본 계약서 [대여 기간]의 만료일까지로 합니다.</p>
                <p>2. 대여 기간의 연장은 본 계약서 [임대차계약 담보]가 유효한 경우에 한하여 가능합니다.</p>
                <p>3. 위 제2항의 요건을 충족하는 경우로서 회사에 대하여 서면 통보 및 연장 의사를 표명하고, 회사가 이에 동의하는 경우 회사와 연장 사용에 관한 새로운 임대차계약(이하 &quot;연장 계약&quot;)을 체결하여야 합니다.</p>
                <p>4. 제3항에 따라 대여 기간을 연장하여 연장 계약서를 작성한 경우 대여 차량 인수가액은 연장 계약서상의 인수가액으로 합니다.</p>
              </div>

              <div className="art">
                <div className="art-h"><span className="art-num">제3조</span> 계약조건</div>
                <p className="sub-h">1. 보증 또는 담보</p>
                <p className="indent">1) 고객은 계약체결 시 회사가 필요하다고 판단할 경우 본 계약에 따라 부담하는 각종 의무 사항의 이행을 담보하기 위하여 회사에 담보를 제공하여야 합니다.</p>
                <p className="indent">2) 담보의 종류는 신용, 보증금, 선납금, 보증보험증권으로 하며, 고객과 회사가 합의하여 결정합니다.</p>
                <p className="indent">3) 고객은 회사에게 본 계약을 체결하고 5영업일 이내 담보를 제공하여야 합니다.</p>
                <p className="indent">4) 계약기간이 만료되어 정상 종료된 경우 회사는 보증금 또는 보증보험증권을 반환합니다(이자 미지급).</p>
                <p className="indent">5) 선납금은 월 대여료에서 분할 차감하며, 정상 만료 시 반환하지 않습니다. 다만, 중도 해지 시 정산 후 잔액을 반환합니다.</p>
                <p className="indent">6) 계약종료 시 미이행 채무, 위약금 등을 보증금·선납금에서 공제한 후 잔액을 반환합니다.</p>
                <p className="indent">7) 보증보험증권 행사에도 잔존 채무가 있으면 회사는 추가로 청구할 수 있습니다.</p>
                <p className="indent">8) 보증금·보증보험금 지급 후에도 책임이 면제되지 않으며, 잔존 채무는 변제하여야 합니다.</p>
                <p className="indent">9) 차량 인수 시 인수가액에서 반환 보증금을 상계한 잔액을 청구할 수 있습니다.</p>
                <p className="indent">10) 보증·담보 제공을 이유로 채무이행을 거절할 수 없습니다.</p>
                <p className="sub-h">2. 위약금</p>
                <p className="indent">1) 중도 해지 시 잔여 기간 대여료(VAT 제외) × 본 계약서 [위약금율]을 위약금으로 청구합니다.</p>
                <p className="indent">2) 신차 출고 후 해지 시 약정 [대여 기간] 전체를 잔여 대여 기간으로 봅니다.</p>
                <p className="indent">3) 동일 조건 신규 고객 확보·계약 승계 시 위약금을 면제할 수 있습니다. 승계 수수료 별도, 회사 사전 승인 필수.</p>
                <p className="sub-h">3. 통지 의무</p>
                <p className="indent">고객·연대보증인 정보 변경, 차량 분실·도난, 제3자 손해, 운전자 변경 등은 즉시 회사에 통지하여야 합니다.</p>
              </div>

              <div className="art">
                <div className="art-h"><span className="art-num">제4조</span> 대여료 정산 및 지급</div>
                <p>1. 대여료는 월간 단위로 정산하며, 본 계약서 [대여료 납부 방법]에 따릅니다.</p>
                <p>2. 결제일까지 납부 지연 시 <strong>법정 이자율</strong>에 의한 연체이자를 청구할 수 있습니다.</p>
                <p>3. 1개월 미만 기간은 월 대여료를 1일 단위로 환산(월 대여료 / 해당월 일수)하여 정산합니다.</p>
                <p>4. 대여료 변동이 불가피할 시 사전 서면 합의로 재조정할 수 있습니다.</p>
                <p>5. 계약기간 중 발생한 범칙금·과태료·주차료·통행료는 고객 부담입니다.</p>
                <p>6. 계약종료 후 차량 미반환 시 단기 대여 요금을 적용한 금액을 추가 지급합니다.</p>
              </div>

              <div className="art">
                <div className="art-h"><span className="art-num">제5조</span> 운전자 자격 요건</div>
                <p>1. 대여 차량의 운전자는 [운전자 연령] 이상으로 유효한 운전면허증을 소지하여야 하며, 자격 미달자의 운전 중 사고에 대한 민·형사상 책임은 고객이 부담합니다.</p>
                <p>2. 운전자는 고객에 한정하는 것을 원칙으로 하되, 다음 자격을 갖춘 자에 한하여 고객 이외의 자가 운전할 수 있습니다.</p>
                <p className="indent">1) 본 계약서 앞면 [자동차 보험 사항]의 [운전자 범위]에 해당하는 자</p>
                <p className="indent">2) 대리운전의 경우 자동차 종합보험(대인·대물·자손) 가입자</p>
                <p className="indent">3) 고객과 회사가 합의하여 지정한 본 조 제1항의 자격을 갖춘 자</p>
              </div>
            </div>
          </div>
        </div>

        {/* ───── PAGE 9 · 약관 (2) ───── */}
        <div className="ctr-paper">
          <div className="ip-doc">
            <div className="doc-page-h">
              <div className="left">
                <div className="brand">{stripCorpSuffix(coName)}</div>
                <div className="kind">{docVariant} 계약서</div>
              </div>
              <div className="right">
                <div className="contractNo">계약번호 _____________</div>
                <div className="pageNo">{plate} · 약관 2/3</div>
              </div>
            </div>
            <div className="doc-page-title center">
              자동차 임대차 계약 약관 <span style={{ fontSize: '12pt', fontWeight: 500, color: 'var(--mute)' }}>제6조 ~ 제10조</span>
            </div>

            <div className="ip-terms-body">
              <div className="art">
                <div className="art-h"><span className="art-num">제6조</span> 차량의 인도 및 반납</div>
                <p>1. 회사는 양호한 상태의 차량을 인도하며, 고객은 계약종료 시 정상적인 마모를 제외한 최초 인도 상태로 반환합니다.</p>
                <p>2. 고객은 인수 즉시 차량 상태를 확인한 후 인수증에 서명날인하여 교부합니다.</p>
                <p>3. 부적합한 점이나 하자 발견 시 즉시 인수증에 기재하여 교부합니다.</p>
                <p>4. 정상 운행 불가능한 차량 하자 사유 외 차량 교체를 요구할 수 없습니다.</p>
                <p>5. 반납 시 정상 마모 외 파손은 원상 수리. 자차 면책 가입 시 면책금으로 대체 가능.</p>
                <p>6. 사전 서면 승인 받은 구조 변경·개조도 종료 시 원상 회복 의무.</p>
                <p>7. 미승인 구조 변경 시 회사는 본 계약을 해지할 수 있으며 원상 회복 비용은 고객 부담.</p>
                <p>8. 대여 기간 만료 30일 전까지 연장·반납·인수를 선택하여야 하며, 미통보 시 반납 선택으로 봅니다.</p>
                <p>9. 만기·중도 해지 반납 시 차량 내 임차인 물품은 자동 폐기 (점유물이탈 성립 불가).</p>
              </div>

              <div className="art">
                <div className="art-h"><span className="art-num">제7조</span> 차량 보험 및 보상</div>
                <p>1. 회사는 영업용 자동차보험 대인배상 Ⅰ·Ⅱ, 대물배상, 자기신체사고 담보에 가입한 차량을 대여합니다.</p>
                <p className="sub-h">2. 보험 보상한도</p>
                <p className="indent">1) 영업용 자동차보험 약관에 명시된 해석·보장 범위 내에서 보상. 다음 사유로 발생한 손해 및 법규 위반 손해는 <strong>고객 부담</strong>: 운전자·탑승자 고의, 허위 계약 및 위반, 제8조 금지 행위, 운전자 조건·연령 이탈, 담보 범위 초과, 차량 도난·멸실, 종료 후 무단 운행 사고.</p>
                <p className="indent">2) 음주·무면허 운전 사고 시 영업용 자동차보험 약관 사고부담금을 부담합니다.</p>
                <p className="indent">3) 보험 가입 조건의 보상한도 초과 부분은 고객 책임.</p>
                <p className="indent">4) 대리운전자의 보험 보상한도 초과 부분 및 무보험 대리운전자 사고 손해는 고객 부담.</p>
                <p className="indent">5) 보험 조건 변경은 최소 7일 전 상호 협의, 추가 비용은 협의하여 월 대여료에 반영.</p>
                <p className="sub-h">3. 자차 손해 면책제도</p>
                <p className="indent">가. 자격 요건을 갖춘 운전자 과실에 의한 차량 손해는 회사 부담. 단, 수리비가 [자차 면책금] 미만이면 고객이 실 수리비 부담.</p>
                <p className="indent">나. 본 제도는 차량 인도 이후부터 적용.</p>
                <p className="indent">다. 다음은 가입 여부와 무관하게 <strong>고객 책임</strong>: 단서 손해, 탑승객 고의 손해, 명백한 관리 소홀로 인한 도난·분실·파손·충돌, 부분품·부속품 자연 마모 외 손해, 허위 계약·위반, 제8조 금지 행위 손해.</p>
                <p className="indent">라. <strong>12대 중과실</strong> 사고 시 [자차 면책금] 외 총수리비 20% 추가. 신호위반·중앙선 침범·20km 초과 과속·앞지르기 위반·철길건널목·횡단보도·무면허·음주·보도 침범·승객 추락 방지·어린이보호구역·화물 고정 미조치.</p>
                <p className="indent">마. [자차 면책금] 또는 실 수리비는 지체 없이 회사에 지급. 책임 있는 제3자로부터 회수는 고객 책임.</p>
                <p className="indent">바. 차량 인수 시 격락손해 보상금을 청구할 수 없으며 [대당 인수 가격] 불변.</p>
                <p className="indent">사. 미수선 수리비 명목 청구 불가, 권리 일체는 회사 귀속.</p>
                <p className="sub-h">4. 사고 대차 서비스 (가입자 한함)</p>
                <p className="indent">8시간 이상 수리 시 동급 차량 제공. 회사 사정상 불가 시 수리기간 대여료 차감. 본 계약 종료·해지 후 무단 운행 사고는 면책 적용 불가.</p>
              </div>

              <div className="art">
                <div className="art-h"><span className="art-num">제8조</span> 금지 행위</div>
                <p>1. 고객은 다음 행위를 하여서는 안 됩니다.</p>
                <p className="indent">1) 본 계약상 운전자 외의 자·자격 미달자에게 운전케 하는 행위</p>
                <p className="indent">2) 테스트·운전 연습·경기·견인 행위</p>
                <p className="indent">3) 유상 운송·재대여 용도 사용</p>
                <p className="indent">4) 사전 서면 승인 없는 구조 변경·개조·부착물 설치</p>
                <p className="indent">5) 주행거리 조작</p>
                <p className="indent">6) 비정상 도로 운행·주정차, 객관적 손상 우려 행위</p>
                <p className="indent">7) 법규 금지 행위</p>
                <p className="indent">8) 좌석 임의 구조변경</p>
                <p className="indent">9) 마약류·각성제·신나 등 음용 운전</p>
                <p className="indent">10) 자동차손해배상보장법 미보장 행위</p>
                <p className="indent">11) 영업용 자동차보험 미보상 금지 행위</p>
                <p className="indent">12) 부분품(내비게이션·블랙박스 등) 임의 훼손·멸실·처분</p>
                <p className="indent">13) 블랙박스 영상 사고처리 외 용도 저장·배포·편집·제공·판매</p>
                <p className="indent">14) 매각·임대·전대·담보 제공 등 소유권 침해 일체</p>
                <p className="indent">15) 기타 회사의 정당한 권리 침해 일체</p>
                <p>2. 금지 행위 위반 시 회사는 계약 해지·차량 회수 가능. 위약금·손해배상 별도.</p>
                <p>3. 형사 처벌 대상이며 회사 손해 전부 배상.</p>
              </div>

              <div className="art">
                <div className="art-h"><span className="art-num">제9조</span> 차량 관리</div>
                <p>1. 정비 서비스 미가입 시 법정 검사 외 모든 정비 비용은 고객 부담.</p>
                <p className="sub-h">2. 차량 점검 및 검사</p>
                <p className="indent">1) 회사는 가입 정비 서비스에 따라 정비를 제공합니다.</p>
                <p className="indent">2) 고객은 운행 전·후 일상점검(엔진오일·냉각수·타이어 공기압·워셔액 등) 책임. 미이행 비용은 고객 부담.</p>
                <p className="indent">3) 인도부터 반환까지 선량한 관리자의 주의의무.</p>
                <p className="indent">4) 법정 검사·정비·계속 검사 협조. 부적합 시 즉시 정비·재검사 협조.</p>
                <p className="indent">5) 차량 정비 시 지정 협력 정비업체 입고 및 규격 부품 사용 원칙.</p>
                <p className="indent">6) 이물질 등에 의한 차량고장 비용은 고객 부담.</p>
                <p className="sub-h">3. 응급처치 (가입자 한함)</p>
                <p className="indent">자체 수리 불가피한 사정 시 회사 사전동의를 얻은 후 처리. 동의 없는 임의 수리는 고객 부담.</p>
                <p className="sub-h">4. 사고처리</p>
                <p className="indent">사고 발생 시 회사 양식 사고경위서 제출, 보험사·경찰 서류 협조. 블랙박스 영상 지체 없이 제공. 사고 수리는 회사 지정 정비공장에서만 진행.</p>
              </div>

              <div className="art">
                <div className="art-h"><span className="art-num">제10조</span> 계약의 중도 해지 및 종료</div>
                <p>1. 다음에 해당하면 회사는 계약을 해지하고 차량을 회수할 수 있습니다.</p>
                <p className="indent">1) 대여료 1회 이상 연체 &nbsp; 2) [임차인계약 담보] 미이행 &nbsp; 3) 허위 정보 제공 &nbsp; 4) 어음·수표 부도, 거래정지, 조세 체납 &nbsp; 5) 휴·폐업·파산·회생·워크아웃 &nbsp; 6) 회사 사전 동의 없는 차량 처분 &nbsp; 7) 담보·재산에 강제집행 등 신용 상실 &nbsp; 8) 제8조 금지 행위 위반 &nbsp; 9) 본 계약 중요 사항 위반 &nbsp; 10) 사망·성년/한정후견 선고 &nbsp; 11) 관리종목 지정·감사의견 부적정 등 신용 상실.</p>
                <p>2. 귀책 해지 시 차량 지체 없이 반환·해지일까지 대여료 완납·위약금(제3조 제2항) 지급·일체 채무 이행. 미반환 시 일할 단기 요금 추가.</p>
                <p>3. 제8조 위반 등 귀책 사유로 예상 수리비가 장부가액 80% 초과 또는 수리 불가 시 손망실 사유 발생일로부터 <strong>자동 해지</strong> 되며 산식에 따라 손해액 배상.</p>
                <p>4. 고객 무과실 사고 시 예상 수리비가 장부가액 80% 초과·수리 불가 시 회사가 해지 가능.</p>
                <p>5. 중도해지 시 고객은 차량 반환·해지일까지 대여료 완납·위약금 지급·일체 채무 이행 후 해지 가능.</p>
              </div>
            </div>
          </div>
        </div>

        {/* ───── PAGE 10 · 약관 (3) + 최종 동의 서명 ───── */}
        <div className="ctr-paper">
          <div className="ip-doc">
            <div className="doc-page-h">
              <div className="left">
                <div className="brand">{stripCorpSuffix(coName)}</div>
                <div className="kind">{docVariant} 계약서</div>
              </div>
              <div className="right">
                <div className="contractNo">계약번호 _____________</div>
                <div className="pageNo">{plate} · 약관 3/3</div>
              </div>
            </div>
            <div className="doc-page-title center">
              자동차 임대차 계약 약관 <span style={{ fontSize: '12pt', fontWeight: 500, color: 'var(--mute)' }}>제11조 ~ 제16조</span>
            </div>

            <div className="ip-terms-body">
              <div className="art">
                <div className="art-h"><span className="art-num">제11조</span> 차량의 멸실 및 훼손에 따른 원상회복의무</div>
                <p>1. 인수 시부터 반환까지 차량 멸실·훼손으로 회사가 손해를 입은 경우 고객이 배상합니다.</p>
                <p className="sub-h">2. 차량 및 부분품 도난 시</p>
                <p className="indent">1) 즉시 관할 관서에 도난 신고. 신고일로부터 계약은 자동 해지.</p>
                <p className="indent">2) 도난 신고일 기준 1개월 이내 미회수 시 위약금 + 도난 당시 장부가액 배상. 자차 면책 가입·무과실 입증 시 [자차 면책금]만 납입 가능.</p>
                <p className="indent">3) 부분품(내비게이션·블랙박스 등) 도난 시 도난 당시 부분품 가액 배상.</p>
                <p className="indent">4) 일부 부품(메모리카드 등) 도난·분실·훼손 시 동일 제품 새 부품 장착 비용 배상.</p>
                <p className="indent">5) 차량 회수 시 원상복구 비용·장부가액 차액·위약금 상당액 공제 후 잔액 즉시 환급.</p>
                <p>3. 정상 마모 외 귀책으로 훼손 시 지체 없이 완전한 상태로 수리. 수리 불가 또는 수리비가 장부가액 80% 초과 시 손·망실 사유 발생일로부터 자동 해지.</p>
                <p>4. 제8조 금지 행위 등 귀책으로 멸실 시 계약 자동 해지, 회사 손해 전부 배상.</p>
              </div>

              <div className="art">
                <div className="art-h"><span className="art-num">제12조</span> 상품별 제공 서비스의 범위</div>
                <p>1. 계약체결 시 [계약내역]에 따라 대여료·부가서비스·각종 조건 등 상품별 서비스 범위가 정해집니다.</p>
                <p>2. 상품별 서비스 및 부가서비스는 회사와 고객의 개별 약정으로 변동될 수 있습니다.</p>
                <p>3. 차량 인수 가능 계약은 다음에 따라 인수 여부를 선택할 수 있습니다.</p>
                <p className="indent">1) 만료 시 [대당 인수 가격]으로 인수 가능 (법적 요건 충족 시).</p>
                <p className="indent">2) 인수 의사는 종료 30일 전까지 회사에 통지. 회사 고지에도 별도 통지가 없으면 인수하지 않는 것으로 봅니다.</p>
                <p className="indent">3) 인수 선택기간 외 통지는 무효. 미통지 시 인수 의사 철회로 봅니다.</p>
                <p className="indent">4) 인수는 고객 본인 또는 지정자에 한정.</p>
                <p className="indent">5) 제3자 명의이전은 원칙적 불가, 예외적으로 회사 승인 시 가능.</p>
                <p className="indent">6) 이전 비용 및 차량 운행 범칙금·과태료·통행료 등은 고객 부담.</p>
                <p>4. 내비게이션·블랙박스·하이패스 단말기는 계약 시점에 따라 공급 제품 변경 가능.</p>
                <p>5. 하이패스 전용 카드는 고객이 직접 구입·충전 사용.</p>
              </div>

              <div className="art">
                <div className="art-h"><span className="art-num">제13조</span> 초과 운행 부담금</div>
                <p>1. [약정 주행거리]가 있는 경우 계약종료 후 초과 시 초과 운행부담금 정산.</p>
                <p>2. 중도 해지 시 약정 주행거리를 일 단위로 환산하여 초과 운행 거리 산정.</p>
                <p>3. 차량 출고·반환 탁송·정비 목적 운행 등 포함되므로 산정 시 <strong>1,000km를 공제</strong> 후 산정.</p>
                <p>4. 산정한 초과 운행 거리에 계약서상 1km 초과 당 기준 금액을 곱하여 정산.</p>
              </div>

              <div className="art">
                <div className="art-h"><span className="art-num">제14조</span> 기타 약정</div>
                <p>1. 부속 약정(운전기사 알선 또는 특약 등)을 체결할 수 있으며 본 계약서의 일부로 간주합니다.</p>
                <p>2. 연대보증서·개인(신용) 정보 동의서·재산세 납부 증명서·주민등록등본·인감증명서 등도 본 계약서의 일부로 간주.</p>
                <p>3. 계약 체결 또는 연체 시 신용정보의 이용 및 보호에 관한 법률 제32조에 의거 고객 및 연대보증인 신용 정보 조회 가능.</p>
                <p>4. 본 계약서에 규정되지 않은 사항은 공정거래위원회 「자동차 대여 표준 약관」에 따릅니다.</p>
                <p>5. 상호 합의하여 계약갱신 및 추가 약정을 위한 변경계약서를 체결할 수 있습니다.</p>
                <p>6. 본 계약이 해지되지 않는 한, 귀책 사유 없는 사용·점유 중단도 회사에 대한 채무 이행에 영향을 미치지 않습니다.</p>
              </div>

              <div className="art">
                <div className="art-h"><span className="art-num">제15조</span> 분쟁의 해결</div>
                <p>1. 본 계약서에 규정되지 아니한 사항 또는 해석상 이견은 관계 법령·일반 상관례에 따라 상호 협의하여 조정합니다.</p>
                <p>2. 본 계약 관련 분쟁의 재판적 관할은 회사의 대여지점 또는 본점 소재지 관할 법원으로 합니다.</p>
              </div>

              <div className="art">
                <div className="art-h"><span className="art-num">제16조</span> 계약의 효력 및 보관</div>
                <p>1. 본 계약은 상호 간 서명 또는 기명날인한 날로부터 유효합니다.</p>
                <p>2. 본 계약의 유효함을 증빙하기 위하여 계약서 2부를 작성하여 고객과 회사가 각각 서명 또는 기명날인하고 각 1부씩 보관합니다.</p>
              </div>
            </div>

            {/* 약관 최종 동의 + 서명 — 표준 격식 */}
            <div className="push-bottom">
              <div className="ip-consent-sub" style={{ marginTop: 14, fontSize: '10pt' }}>
                계약자 및 보증인은 본 계약서상 기록된 사항과 이면의 약관 내용을 읽고 이해함을 증명하기 위하여 서명 합니다.
              </div>
              <div className="ip-sign">
                <div className="col">
                  <div className="role">임차인 (계약자)</div>
                  <div className="box">
                    <span className="name">{cName}</span>
                    <span className="seal">서명/(인)</span>
                  </div>
                </div>
                <div className="col">
                  <div className="role">임 대 인</div>
                  <div className="box">
                    <div>
                      <div className="corp">{coName}</div>
                      <div className="ceo">대표자 &nbsp;{coCeo}</div>
                      <div className="tel">연락처 &nbsp;{coPhone}</div>
                    </div>
                    <span className="seal">(인)</span>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 14, textAlign: 'center', fontSize: '11pt', fontWeight: 700, color: 'var(--ink-soft)', letterSpacing: 1 }}>
                {fmtKDate(issuedDate)}
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
