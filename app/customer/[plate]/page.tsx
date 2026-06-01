'use client';

/**
 * 손님 자가조회 — 상세 페이지.
 * 진입 페이지에서 lookup 후 sessionStorage 통해 데이터 전달받음.
 * 새로고침하거나 직접 진입하면 다시 로그인 페이지로.
 */

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Car, CurrencyKrw, Calendar, Phone, MapPin, Receipt, Warning, CheckCircle, ShieldCheck, DownloadSimple, FileText, ChatCircleDots, Headset } from '@phosphor-icons/react';
import { maskAddress, maskPhone } from '@/lib/customer-match';

const SESSION_KEY = 'jpk-customer-lookup';

type SafeContract = {
  contractNo: string;
  company: string;
  customerName: string;
  customerPhone1: string;
  customerPhone2?: string;
  customerRegion?: string;
  customerDistrict?: string;
  customerIdentMasked: string;
  customerLicenseMasked: string;
  customerLicenseType?: string;
  customerLicenseStatus?: string;
  vehiclePlate: string;
  vehicleModel: string;
  vehicleStatus: string;
  contractDate: string;
  returnScheduledDate?: string;
  returnedDate?: string;
  termMonths: number;
  monthlyRent: number;
  deposit: number;
  paymentDay: number;
  paymentMethod: string;
  status: string;
  currentSeq: number;
  totalSeq: number;
  lastPaidDate?: string;
  lastPaidAmount?: number;
  unpaidAmount: number;
  unpaidSeqCount: number;
  schedules?: Array<{
    seq: number;
    dueDate: string;
    amount: number;
    status: string;
    paidAmount: number;
    paidAt?: string;
  }>;
  contractDocUrl?: string;
  contractDocFileName?: string;
  contractDocUploadedAt?: string;
};

type SafeVehicle = {
  plate: string;
  model: string;
  status: string;
  vehicleMaker?: string;
  vehicleModelLine?: string;
  vehicleSubModel?: string;
  vehicleVariant?: string;
  vehicleTrim?: string;
  exteriorColor?: string;
  interiorColor?: string;
  fuelType?: string;
  displacementCc?: number;
  seatingCapacity?: number;
  registrationCertUrl?: string;
  registrationCertFileName?: string;
  registrationCertUploadedAt?: string;
  insuranceCertUrl?: string;
  insuranceCertFileName?: string;
  insuranceCertUploadedAt?: string;
};

type SafeCompany = {
  id: string;
  name: string;
  ceo?: string;
  address?: string;
  mainPhone?: string;
  customerServicePhone?: string;
  accounts?: Array<{ bankName?: string; accountNo?: string; holderName?: string }>;
};

type LookupData = {
  contract: SafeContract;
  vehicle: SafeVehicle | null;
  company: SafeCompany | null;
};

function fmtMoney(n: number): string { return (n ?? 0).toLocaleString('ko-KR'); }
function fmtDate(ymd?: string): string {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-');
  return `${y}.${m}.${d}`;
}
function daysBetween(from?: string, to?: string): number {
  if (!from || !to) return 0;
  const f = new Date(from).getTime();
  const t = new Date(to).getTime();
  return Math.round((t - f) / (1000 * 60 * 60 * 24));
}

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams<{ plate: string }>();
  const [data, setData] = useState<LookupData | null>(null);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) setData(JSON.parse(raw) as LookupData);
      else router.replace('/customer');
    } catch {
      router.replace('/customer');
    }
  }, [router, params]);

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', background: '#f4f6f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Pretendard Variable, sans-serif' }}>
        조회 결과를 불러오는 중…
      </div>
    );
  }

  const c = data.contract;
  const v = data.vehicle;
  const co = data.company;

  const dDay = c.returnScheduledDate ? daysBetween(today, c.returnScheduledDate) : null;
  const isOverdue = (c.unpaidAmount ?? 0) > 0 || (c.unpaidSeqCount ?? 0) > 0;
  const next = c.schedules?.find((s) => s.status === '예정' || s.status === '연체');

  return (
    <div className="cust-shell">
      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css');
        body, html { margin: 0; padding: 0; background: #f4f6f9; font-family: 'Pretendard Variable', sans-serif; color: #0b1220; }

        .cust-shell { min-height: 100vh; }
        .cust-topbar {
          background: linear-gradient(135deg, #1B2A4A 0%, #0b1220 100%);
          color: #fff; padding: 24px 20px;
        }
        .cust-topbar .nav { display: flex; align-items: center; max-width: 720px; margin: 0 auto 16px; }
        .cust-topbar .nav button {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 12px; font-size: 12px; font-weight: 600;
          background: rgba(255,255,255,0.1); color: #fff;
          border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; cursor: pointer;
        }
        .cust-topbar .hero { max-width: 720px; margin: 0 auto; }
        .cust-topbar .hero .hero-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .cust-topbar .hero .greeting { font-size: 13px; opacity: 0.7; }
        .cust-topbar .hero .name { font-size: 24px; font-weight: 800; margin-top: 4px; letter-spacing: -0.5px; }
        .cust-topbar .hero .vehicle { font-size: 14px; opacity: 0.8; margin-top: 8px; display: flex; align-items: center; gap: 8px; }
        .cust-topbar .hero .vehicle .plate {
          padding: 3px 10px; background: rgba(255,255,255,0.2);
          border-radius: 4px; font-weight: 700; font-variant-numeric: tabular-nums;
        }
        .status-pill {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 8px; border-radius: 0;
          font-size: 11px; font-weight: 600; letter-spacing: 0.2px;
          white-space: nowrap;
        }
        .status-pill--ok {
          background: rgba(167, 243, 208, 0.18);
          color: #6ee7b7;
          border: 1px solid rgba(110, 231, 183, 0.35);
        }
        .status-pill--danger {
          background: rgba(254, 202, 202, 0.18);
          color: #fca5a5;
          border: 1px solid rgba(252, 165, 165, 0.4);
        }

        .cust-body { max-width: 720px; margin: 0 auto; padding: 20px 16px 60px; }

        .alert {
          background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
          padding: 14px 16px; border-radius: 8px; margin-bottom: 16px;
          display: flex; align-items: flex-start; gap: 10px;
        }
        .alert.info { background: #eff6ff; border-color: #bfdbfe; color: #1e40af; }
        .alert.ok { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; }
        .alert .ic { flex-shrink: 0; margin-top: 2px; }
        .alert .head { font-weight: 700; font-size: 13px; margin-bottom: 2px; }
        .alert .body { font-size: 12px; line-height: 1.6; }

        .card {
          background: #fff; border-radius: 10px;
          padding: 18px 18px; margin-bottom: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .card h2 {
          font-size: 13px; font-weight: 700; color: #475569;
          margin: 0 0 12px; display: flex; align-items: center; gap: 6px;
          letter-spacing: 0.3px;
          text-transform: uppercase;
        }
        .kv { display: grid; grid-template-columns: 110px 1fr; gap: 6px 12px; }
        .kv .k { font-size: 12px; color: #64748b; padding: 4px 0; }
        .kv .v { font-size: 13px; color: #0b1220; font-weight: 500; padding: 4px 0; font-variant-numeric: tabular-nums; }
        .kv .v strong { font-weight: 800; }

        /* 계약 요약 — 가로 6열(모바일 3열) 컴팩트 카드 */
        .summary-card { padding: 16px 18px; }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 14px 12px;
        }
        @media (max-width: 600px) {
          .summary-grid { grid-template-columns: repeat(3, 1fr); }
        }
        .summary-cell { min-width: 0; }
        .summary-cell--wide { grid-column: span 2; }
        @media (max-width: 600px) {
          .summary-cell--wide { grid-column: span 3; }
        }
        .summary-lbl { font-size: 10px; color: #64748b; font-weight: 600; letter-spacing: 0.2px; }
        .summary-val {
          font-size: 16px; font-weight: 800; color: #0b1220; margin-top: 4px;
          letter-spacing: -0.4px; font-variant-numeric: tabular-nums;
        }
        .summary-val--text {
          font-size: 13px; font-weight: 700; letter-spacing: -0.2px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .summary-val__sub { font-size: 11px; font-weight: 600; color: #94a3b8; margin-left: 1px; }
        .summary-footnote {
          margin-top: 12px; padding-top: 10px;
          border-top: 1px dashed #eef0f4;
          font-size: 11px; color: #94a3b8;
          font-variant-numeric: tabular-nums;
        }

        .sched { font-size: 12px; }
        .sched table { width: 100%; border-collapse: collapse; }
        .sched th, .sched td { padding: 8px 6px; text-align: left; }
        .sched th { font-size: 11px; color: #64748b; font-weight: 600; border-bottom: 1px solid #eef0f4; }
        .sched td { border-bottom: 1px solid #f4f6f9; font-variant-numeric: tabular-nums; }
        .sched td.amt { text-align: right; font-weight: 600; }
        .sched .badge { padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; }
        .sched .badge.완료 { background: #dcfce7; color: #166534; }
        .sched .badge.예정 { background: #f1f5f9; color: #475569; }
        .sched .badge.연체 { background: #fef2f2; color: #991b1b; }
        .sched .badge.부분납 { background: #fef3c7; color: #92400e; }

        .footnote {
          margin-top: 20px; padding: 14px;
          background: #fff; border-radius: 8px;
          font-size: 11px; color: #94a3b8; line-height: 1.7;
          display: flex; align-items: flex-start; gap: 8px;
        }

        .docs-list { display: flex; flex-direction: column; gap: 6px; }
        .doc-row {
          display: grid; grid-template-columns: 1fr auto; align-items: center;
          gap: 12px; padding: 12px;
          background: #f8fafc; border: 1px solid #e2e8f0;
          border-radius: 6px;
        }
        .doc-row__main { min-width: 0; display: flex; align-items: center; gap: 10px; }
        .doc-row__icon { width: 32px; height: 32px; border-radius: 6px; background: rgba(27,42,74,0.08); color: #1B2A4A; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .doc-row__text { min-width: 0; }
        .doc-row__label { font-size: 13px; font-weight: 700; color: #0b1220; }
        .doc-row__meta { font-size: 11px; color: #64748b; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .doc-row__btn {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 8px 12px; font-size: 12px; font-weight: 700;
          background: #1B2A4A; color: #fff; border: none; border-radius: 0;
          text-decoration: none; cursor: pointer; transition: background 0.15s;
          flex-shrink: 0;
        }
        .doc-row__btn:hover { background: #0b1220; }
        .doc-row--empty { background: #fff; border-style: dashed; }
        .doc-row--empty .doc-row__label { color: #94a3b8; font-weight: 600; }
        .doc-row--empty .doc-row__meta { font-style: italic; }

        .contact-list { display: flex; flex-direction: column; gap: 8px; }
        .contact-row {
          display: grid; grid-template-columns: 1fr auto; align-items: center;
          gap: 12px; padding: 12px 14px;
          background: #f8fafc; border: 1px solid #e2e8f0;
          border-radius: 6px;
        }
        .contact-row--primary { background: rgba(27,42,74,0.04); border-color: rgba(27,42,74,0.2); }
        .contact-row__main { min-width: 0; }
        .contact-row__label { font-size: 11px; font-weight: 600; color: #64748b; letter-spacing: 0.2px; }
        .contact-row__phone { font-size: 17px; font-weight: 800; color: #0b1220; margin-top: 2px; font-variant-numeric: tabular-nums; letter-spacing: -0.3px; }
        .contact-row__hint { font-size: 11px; color: #94a3b8; margin-top: 2px; }
        .contact-row__actions { display: flex; gap: 6px; flex-shrink: 0; }
        .contact-btn {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 9px 14px; font-size: 12px; font-weight: 700;
          border: 1px solid transparent; border-radius: 0;
          text-decoration: none; cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .contact-btn--call { background: #1B2A4A; color: #fff; }
        .contact-btn--call:hover { background: #0b1220; }
        .contact-btn--sms { background: #fff; color: #1B2A4A; border-color: rgba(27,42,74,0.25); }
        .contact-btn--sms:hover { background: rgba(27,42,74,0.05); }
      `}</style>

      <div className="cust-topbar">
        <div className="nav">
          <button type="button" onClick={() => { sessionStorage.removeItem(SESSION_KEY); router.replace('/customer'); }}>
            <ArrowLeft size={12} weight="bold" /> 다시 조회
          </button>
        </div>
        <div className="hero">
          <div className="hero-top">
            <div className="greeting">안녕하세요</div>
            {isOverdue ? (
              <span className="status-pill status-pill--danger">
                <Warning size={11} weight="fill" /> 미납 {c.unpaidSeqCount}회차
              </span>
            ) : (
              <span className="status-pill status-pill--ok">
                <CheckCircle size={11} weight="fill" /> 정상
              </span>
            )}
          </div>
          <div className="name">{c.customerName} 님</div>
          <div className="vehicle">
            <Car size={14} weight="fill" />
            <span className="plate">{c.vehiclePlate}</span>
            <span>{c.vehicleModel}</span>
          </div>
        </div>
      </div>

      <div className="cust-body">

        {/* 미납 알림 — 문제가 있을 때만 */}
        {isOverdue && (
          <div className="alert">
            <Warning className="ic" size={18} weight="fill" />
            <div>
              <div className="head">미납 {c.unpaidSeqCount}회차 / 합계 ₩ {fmtMoney(c.unpaidAmount)}</div>
              <div className="body">
                대여료가 미납 중입니다. 빠른 시일 내 납부 부탁드립니다.<br />
                3일 연체 시 시동제어 · 10일 연체 시 계약해지 통보가 진행됩니다.
              </div>
            </div>
          </div>
        )}

        {dDay !== null && dDay >= 0 && dDay <= 90 && (
          <div className="alert info">
            <Calendar className="ic" size={18} weight="fill" />
            <div>
              <div className="head">계약 만기 D-{dDay} ({fmtDate(c.returnScheduledDate)})</div>
              <div className="body">만기일 30일 전까지 연장 또는 반납 의사를 알려주세요.</div>
            </div>
          </div>
        )}

        {/* ① 계약 요약 — 돈 3 + 기간 3 */}
        <div className="card summary-card">
          <h2><Receipt size={12} weight="fill" /> 계약 요약</h2>
          <div className="summary-grid">
            {/* 돈 */}
            <div className="summary-cell">
              <div className="summary-lbl">월 대여료</div>
              <div className="summary-val">₩ {fmtMoney(c.monthlyRent)}</div>
            </div>
            <div className="summary-cell">
              <div className="summary-lbl">보증금</div>
              <div className="summary-val">₩ {fmtMoney(c.deposit)}</div>
            </div>
            <div className="summary-cell">
              <div className="summary-lbl">결제일</div>
              <div className="summary-val">매월 {c.paymentDay}<span className="summary-val__sub">일</span></div>
            </div>
            {/* 기간 */}
            <div className="summary-cell">
              <div className="summary-lbl">계약기간</div>
              <div className="summary-val">{c.termMonths}<span className="summary-val__sub">개월</span></div>
            </div>
            <div className="summary-cell">
              <div className="summary-lbl">진행</div>
              <div className="summary-val">{c.currentSeq}<span className="summary-val__sub">/{c.totalSeq}회차</span></div>
            </div>
            <div className="summary-cell">
              <div className="summary-lbl">만기까지</div>
              <div className="summary-val">
                {dDay === null
                  ? <span className="summary-val--text">—</span>
                  : dDay < 0
                    ? <span style={{ color: '#dc2626' }}>만기 경과</span>
                    : <>D-{dDay}<span className="summary-val__sub">일</span></>
                }
              </div>
            </div>
          </div>
          {c.returnScheduledDate && (
            <div className="summary-footnote">만기예정일 — {fmtDate(c.returnScheduledDate)}</div>
          )}
        </div>

        {/* ② 다음 결제 */}
        {next && (
          <div className="card">
            <h2><Calendar size={12} weight="fill" /> 다음 결제 예정</h2>
            <div className="kv">
              <div className="k">회차</div><div className="v"><strong>{next.seq}</strong> / {c.totalSeq}회차</div>
              <div className="k">결제예정일</div><div className="v">{fmtDate(next.dueDate)}</div>
              <div className="k">청구금액</div><div className="v"><strong>₩ {fmtMoney(next.amount)}</strong></div>
              <div className="k">상태</div><div className="v">{next.status}</div>
            </div>
          </div>
        )}

        {/* ③ 차량 상세 */}
        <div className="card">
          <h2><Car size={12} weight="fill" /> 차량 상세</h2>
          <div className="kv">
            <div className="k">차량번호</div><div className="v"><strong>{c.vehiclePlate}</strong></div>
            <div className="k">차종</div><div className="v">{c.vehicleModel}</div>
            {v?.exteriorColor && <><div className="k">색상</div><div className="v">외부 {v.exteriorColor}{v.interiorColor && ` · 내부 ${v.interiorColor}`}</div></>}
            {v?.fuelType && <><div className="k">연료</div><div className="v">{v.fuelType}{v.displacementCc ? ` · ${v.displacementCc}cc` : ''}</div></>}
            {v?.seatingCapacity && <><div className="k">승차정원</div><div className="v">{v.seatingCapacity}인</div></>}
          </div>
        </div>

        {/* ④ 계약 상세 */}
        <div className="card">
          <h2><FileText size={12} weight="fill" /> 계약 상세</h2>
          <div className="kv">
            <div className="k">계약번호</div><div className="v">{c.contractNo}</div>
            <div className="k">계약일</div><div className="v">{fmtDate(c.contractDate)}</div>
            <div className="k">계약기간</div><div className="v">{c.termMonths}개월</div>
            <div className="k">만기예정일</div><div className="v">{fmtDate(c.returnScheduledDate)}</div>
            <div className="k">결제방법</div><div className="v">{c.paymentMethod}</div>
          </div>
        </div>

        {/* 본인 정보 (마스킹) */}
        <div className="card">
          <h2><ShieldCheck size={12} weight="fill" /> 본인 정보 (개인정보 보호)</h2>
          <div className="kv">
            <div className="k">성명</div><div className="v">{c.customerName}</div>
            <div className="k">등록번호</div><div className="v">{c.customerIdentMasked}</div>
            {c.customerLicenseMasked && <><div className="k">면허번호</div><div className="v">{c.customerLicenseMasked}{c.customerLicenseType && ` (${c.customerLicenseType})`}</div></>}
            <div className="k">연락처</div><div className="v">{maskPhone(c.customerPhone1)}</div>
            {(c.customerRegion || c.customerDistrict) && (
              <>
                <div className="k">주소</div>
                <div className="v">{maskAddress(`${c.customerRegion ?? ''} ${c.customerDistrict ?? ''}`.trim())}</div>
              </>
            )}
          </div>
        </div>

        {/* 연락처 — 대표번호 / 고객센터 */}
        {co && (co.mainPhone || co.customerServicePhone) && (
          <div className="card">
            <h2><Headset size={12} weight="fill" /> 문의 · 연락</h2>
            <div className="contact-list">
              {co.customerServicePhone && (
                <ContactRow
                  label="고객센터"
                  phone={co.customerServicePhone}
                  hint="가입·해지·청구·문의"
                  primary
                />
              )}
              {co.mainPhone && (
                <ContactRow
                  label={co.customerServicePhone ? `${co.name} 대표번호` : '대표번호'}
                  phone={co.mainPhone}
                />
              )}
            </div>
          </div>
        )}

        {/* 입금 계좌 */}
        {co && (co.accounts ?? []).length > 0 && (
          <div className="card">
            <h2><CurrencyKrw size={12} weight="fill" /> 입금 계좌</h2>
            <div className="kv">
              <div className="k">회사</div><div className="v">{co.name}{co.ceo && ` · 대표 ${co.ceo}`}</div>
              {(co.accounts ?? [])[0] && (
                <>
                  <div className="k">계좌</div>
                  <div className="v">
                    <strong>{co.accounts![0].bankName} {co.accounts![0].accountNo}</strong>
                    {co.accounts![0].holderName && <><br/>예금주: {co.accounts![0].holderName}</>}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 서류 다운로드 */}
        {(v?.registrationCertUrl || v?.insuranceCertUrl || c.contractDocUrl) && (
          <div className="card">
            <h2><FileText size={12} weight="fill" /> 서류 다운로드</h2>
            <div className="docs-list">
              <DocRow
                label="자동차 등록증"
                url={v?.registrationCertUrl}
                fileName={v?.registrationCertFileName}
                uploadedAt={v?.registrationCertUploadedAt}
              />
              <DocRow
                label="보험가입증명서"
                url={v?.insuranceCertUrl}
                fileName={v?.insuranceCertFileName}
                uploadedAt={v?.insuranceCertUploadedAt}
              />
              <DocRow
                label="대여 계약서"
                url={c.contractDocUrl}
                fileName={c.contractDocFileName}
                uploadedAt={c.contractDocUploadedAt}
              />
            </div>
          </div>
        )}

        {/* 회차 스케줄 */}
        {(c.schedules ?? []).length > 0 && (
          <div className="card">
            <h2><Calendar size={12} weight="fill" /> 결제 스케줄</h2>
            <div className="sched">
              <table>
                <thead>
                  <tr>
                    <th>회차</th>
                    <th>예정일</th>
                    <th>상태</th>
                    <th style={{ textAlign: 'right' }}>청구</th>
                    <th style={{ textAlign: 'right' }}>입금</th>
                  </tr>
                </thead>
                <tbody>
                  {(c.schedules ?? []).map((s) => (
                    <tr key={s.seq}>
                      <td>{s.seq}</td>
                      <td>{fmtDate(s.dueDate)}</td>
                      <td><span className={`badge ${s.status}`}>{s.status}</span></td>
                      <td className="amt">{fmtMoney(s.amount)}</td>
                      <td className="amt" style={{ color: s.paidAmount === s.amount ? '#166534' : s.paidAmount > 0 ? '#92400e' : '#94a3b8' }}>
                        {fmtMoney(s.paidAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="footnote">
          <ShieldCheck size={11} weight="fill" />
          <div>
            본 페이지의 모든 개인정보(등록번호·면허번호·연락처·주소)는 마스킹되어 표시됩니다.<br />
            본인 확인 외 다른 용도로 사용되지 않으며, 페이지를 나가면 조회 정보가 자동으로 삭제됩니다.
          </div>
        </div>
      </div>
    </div>
  );
}

/** 전화번호 정규화 — tel:/sms: 링크용 ('-', ' ' 제거) */
function telHref(phone: string): string { return phone.replace(/[^0-9+]/g, ''); }

function ContactRow({
  label, phone, hint, primary,
}: { label: string; phone: string; hint?: string; primary?: boolean }) {
  const dial = telHref(phone);
  const isMobile = /^010/.test(dial);
  return (
    <div className={`contact-row${primary ? ' contact-row--primary' : ''}`}>
      <div className="contact-row__main">
        <div className="contact-row__label">{label}</div>
        <div className="contact-row__phone">{phone}</div>
        {hint && <div className="contact-row__hint">{hint}</div>}
      </div>
      <div className="contact-row__actions">
        <a className="contact-btn contact-btn--call" href={`tel:${dial}`}>
          <Phone size={13} weight="fill" />
          전화
        </a>
        {isMobile && (
          <a className="contact-btn contact-btn--sms" href={`sms:${dial}`}>
            <ChatCircleDots size={13} weight="fill" />
            문자
          </a>
        )}
      </div>
    </div>
  );
}

function DocRow({
  label, url, fileName, uploadedAt,
}: { label: string; url?: string; fileName?: string; uploadedAt?: string }) {
  if (!url) {
    return (
      <div className="doc-row doc-row--empty">
        <div className="doc-row__main">
          <div className="doc-row__icon" style={{ background: '#f1f5f9', color: '#94a3b8' }}>
            <FileText size={16} weight="duotone" />
          </div>
          <div className="doc-row__text">
            <div className="doc-row__label">{label}</div>
            <div className="doc-row__meta">미첨부</div>
          </div>
        </div>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>—</span>
      </div>
    );
  }
  return (
    <div className="doc-row">
      <div className="doc-row__main">
        <div className="doc-row__icon">
          <FileText size={16} weight="duotone" />
        </div>
        <div className="doc-row__text">
          <div className="doc-row__label">{label}</div>
          <div className="doc-row__meta">
            {fileName ?? '파일'}{uploadedAt && ` · ${fmtDate(uploadedAt.slice(0, 10))} 업로드`}
          </div>
        </div>
      </div>
      <a className="doc-row__btn" href={url} target="_blank" rel="noopener noreferrer" download={fileName}>
        <DownloadSimple size={14} weight="bold" />
        다운로드
      </a>
    </div>
  );
}
