'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Printer, FloppyDisk } from '@phosphor-icons/react';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { toast } from '@/lib/toast';
import { friendlyError } from '@/lib/friendly-error';
import { todayKr } from '@/lib/mock-data';
import { stripCorpSuffix } from '@/lib/company-display';
import type { Company } from '@/lib/types';

/* ─────────────── 표준 약관 (베타 — PDF 3개 검토 후 다듬을 placeholder) ─────────────── */
const STANDARD_TERMS = [
  {
    title: '제1조 (목적)',
    body: '본 계약은 임대인이 임차인에게 별지 기재 자동차(이하 "본 차량")를 임대하고, 임차인이 이에 따른 대여료를 지급하는 데 필요한 사항을 정함을 목적으로 한다.',
  },
  {
    title: '제2조 (계약기간 및 대여료)',
    body: '계약기간은 별지에 명시한 기간으로 하며, 대여료 및 보증금은 별지의 금액으로 한다. 대여료는 매월 지정 결제일에 임대인이 지정한 계좌로 납부한다.',
  },
  {
    title: '제3조 (차량의 인도 및 반환)',
    body: '① 임대인은 본 차량을 약정한 일시에 임차인에게 인도한다.\n② 임차인은 계약기간 만료 시 본 차량을 인도 당시 상태로 임대인에게 반환한다.',
  },
  {
    title: '제4조 (임차인의 의무)',
    body: '① 임차인은 도로교통법 등 관계 법령을 준수하여 본 차량을 운행한다.\n② 본 차량의 무단 양도·전대·담보 제공·개조를 할 수 없다.\n③ 정기검사·소모품 교체 등 일상 관리 의무를 진다.\n④ 대여료 연체 시 시동제어·계약해지·차량 회수 등의 조치가 있을 수 있음을 인지한다.',
  },
  {
    title: '제5조 (사고 및 손해)',
    body: '① 임차인의 과실로 발생한 사고·도난·파손에 대한 책임은 임차인이 진다.\n② 자기차량손해 자기부담금, 면책금 등은 임차인이 부담한다.\n③ 사고 발생 시 임차인은 즉시 임대인에게 통지하여야 한다.',
  },
  {
    title: '제6조 (보험)',
    body: '본 차량의 자동차보험은 임대인이 가입한다. 임차인은 보험약관에서 정한 운전자 연령·범위 등을 준수한다.',
  },
  {
    title: '제7조 (위약금 및 중도해지)',
    body: '① 임차인이 계약 기간 중 임의로 해지하는 경우 중도해지 위약금을 부과한다.\n   - 계약일로부터 1년 이내: 보증금의 30%\n   - 계약일로부터 1년 초과: 보증금의 20%\n② 임차인의 귀책사유로 임대인이 해지하는 경우에도 위 위약금이 적용된다.',
  },
  {
    title: '제8조 (시동제어 및 회수)',
    body: '① 임차인이 정당한 사유 없이 대여료를 연체하거나 본 계약상 의무를 위반한 경우, 임대인은 사전 통지 후 본 차량의 시동을 원격으로 제어할 수 있다.\n② 위 조치에도 시정되지 않을 경우 임대인은 본 차량을 회수할 수 있으며, 회수 비용은 임차인이 부담한다.',
  },
  {
    title: '제9조 (정기검사·과태료)',
    body: '① 운행 중 발생한 교통법규 위반·과태료·범칙금 등은 모두 임차인이 부담한다.\n② 자동차 정기검사는 임차인이 책임지고 받으며, 미이행 시 발생하는 일체의 불이익은 임차인이 부담한다.',
  },
  {
    title: '제10조 (개인정보 처리)',
    body: '임대인은 「개인정보 보호법」에 따라 본 계약의 이행을 위해 임차인의 개인정보를 수집·이용하며, 보유 및 이용기간은 계약 종료 후 5년으로 한다.',
  },
  {
    title: '제11조 (기타)',
    body: '본 계약에 정하지 아니한 사항은 관계 법령 및 일반 상관례에 따른다. 본 계약과 관련하여 분쟁이 발생할 경우 임대인의 본점 소재지 관할 법원을 합의 관할 법원으로 한다.',
  },
];

/* ─────────────── 헬퍼 ─────────────── */
function fmtCurrency(n: number): string {
  return n.toLocaleString('ko-KR');
}
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

/* ─────────────── 페이지 ─────────────── */
type FormType = 'full' | 'simple';

export default function ContractDocPage() {
  const params = useParams<{ contractId: string }>();
  const contractId = params?.contractId;
  const { contracts } = useContracts();
  const { companies } = useCompanies();
  const { add: addHistory } = useHistoryEntries();

  const contract = useMemo(() => contracts.find((c) => c.id === contractId), [contracts, contractId]);
  const senderCompany = useMemo<Company | undefined>(() => {
    if (!contract) return undefined;
    return companies.find((co) => co.name === contract.company) ?? companies[0];
  }, [contract, companies]);

  const [formType, setFormType] = useState<FormType>('full');
  const [issuedDate, setIssuedDate] = useState(todayKr());
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [specialNote, setSpecialNote] = useState('');

  useEffect(() => { setIssuedDate(todayKr()); }, []);

  if (!contract) {
    return <div style={{ padding: 40 }}>계약 로딩 중...</div>;
  }

  const senderName = senderCompany?.name || contract.company;
  const senderRep = senderCompany?.ceo || '대표이사';
  const senderAddr = senderCompany?.address || '';
  const senderAccount = senderCompany?.accounts?.[0];
  const senderBizNo = senderCompany?.bizRegNo || '';

  async function handleSave() {
    if (!contract) return;
    try {
      await addHistory({
        scope: 'contract',
        contractId: contract.id,
        vehiclePlate: contract.vehiclePlate,
        date: issuedDate,
        category: '메모',
        title: `${formType === 'full' ? '정식 계약서' : '전용 계약서'} 발행`,
        description: [
          `${formType === 'full' ? '표준약관 포함 정식 계약서' : '간략 전용 계약서'} 출력`,
          `차량: ${contract.vehiclePlate} ${contract.vehicleModel}`,
          `임차인: ${contract.customerName}`,
          `대여료: ₩${fmtCurrency(contract.monthlyRent ?? 0)} / 보증금: ₩${fmtCurrency(contract.deposit ?? 0)}`,
          `기간: ${contract.contractDate} ~ ${contract.returnScheduledDate ?? '-'}`,
        ].join('\n'),
        status: '완료',
      });
      toast.success('계약서 발행 이력 저장');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  return (
    <div className="doc-shell">
      <style>{`
        .doc-shell {
          font-family: 'Pretendard Variable', Pretendard, sans-serif;
          background: #f4f4f5;
          min-height: 100vh;
          padding: 24px 0;
        }
        .doc-toolbar {
          max-width: 794px;
          margin: 0 auto 16px;
          display: flex;
          gap: 8px;
          padding: 10px 16px;
          background: #fff;
          border: 1px solid #e4e4e7;
          border-radius: 6px;
          font-size: 12px;
          align-items: center;
        }
        .doc-toolbar input[type="date"],
        .doc-toolbar input[type="text"] {
          height: 26px;
          padding: 0 6px;
          font: inherit;
          border: 1px solid #d4d4d8;
          border-radius: 4px;
        }
        .doc-toolbar .group { display: flex; align-items: center; gap: 4px; padding: 0 6px; border-right: 1px solid #e4e4e7; }
        .doc-toolbar .group:last-of-type { border-right: none; }
        .doc-toolbar label { color: #71717a; font-size: 11px; }
        .doc-actions { margin-left: auto; display: flex; gap: 6px; }
        .doc-btn {
          height: 28px; padding: 0 12px; font: inherit;
          border: 1px solid #d4d4d8; background: #fff;
          border-radius: 4px; cursor: pointer;
          display: inline-flex; align-items: center; gap: 4px;
        }
        .doc-btn.primary { background: #1B2A4A; color: #fff; border-color: #1B2A4A; }
        .doc-btn.active { background: #eef2f7; border-color: #1B2A4A; color: #1B2A4A; font-weight: 600; }

        .doc-paper {
          width: 794px; min-height: 1123px;
          margin: 0 auto;
          background: #fff;
          padding: 60px 60px;
          border: 1px solid #e4e4e7;
          color: #18181b;
          font-size: 12.5px;
          line-height: 1.75;
          box-sizing: border-box;
        }
        .doc-title {
          text-align: center;
          margin: 0 auto 30px;
          padding: 14px 28px;
          border: 2px solid #18181b;
          width: fit-content;
          font-weight: 700;
        }
        .doc-title h1 { margin: 0; font-size: 22px; letter-spacing: 8px; }
        .doc-title .sub { margin-top: 4px; font-size: 11px; letter-spacing: 1px; font-weight: 500; }

        .doc-table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 12px; }
        .doc-table th, .doc-table td {
          border: 1px solid #71717a; padding: 7px 10px;
        }
        .doc-table th { background: #f4f4f5; font-weight: 600; width: 110px; text-align: center; }
        .doc-table td { text-align: left; }
        .doc-table td.num { text-align: right; font-variant-numeric: tabular-nums; }

        .doc-section-title {
          font-weight: 700;
          font-size: 14px;
          margin: 24px 0 6px;
          padding-bottom: 4px;
          border-bottom: 1px solid #18181b;
        }

        .doc-terms {
          margin-top: 24px;
          font-size: 11.5px;
          line-height: 1.7;
        }
        .doc-terms .term-title { font-weight: 600; margin-top: 10px; }
        .doc-terms .term-body { color: #27272a; white-space: pre-line; margin-left: 8px; }

        .doc-signature {
          margin-top: 50px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          font-size: 12px;
        }
        .doc-signature .box {
          border-top: 1px solid #18181b;
          padding-top: 10px;
        }
        .doc-signature .box .label { font-weight: 600; margin-bottom: 6px; }
        .doc-signature .box .row { display: flex; gap: 6px; align-items: baseline; }
        .doc-signature .box .row .key { width: 60px; color: #52525b; font-size: 11px; }
        .doc-signature .seal {
          display: inline-flex; align-items: center; justify-content: center;
          width: 36px; height: 36px;
          border: 1px solid #71717a; border-radius: 50%;
          color: #71717a; font-size: 9px; margin-left: 6px;
        }

        @media print {
          .doc-toolbar { display: none; }
          .doc-shell { background: #fff; padding: 0; }
          .doc-paper { border: none; padding: 40px 30px; width: auto; min-height: auto; }
          .doc-terms { page-break-before: auto; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>

      {/* 툴바 */}
      <div className="doc-toolbar">
        <div className="group">
          <button
            type="button"
            className={`doc-btn ${formType === 'full' ? 'active' : ''}`}
            onClick={() => setFormType('full')}
          >
            정식 계약서
          </button>
          <button
            type="button"
            className={`doc-btn ${formType === 'simple' ? 'active' : ''}`}
            onClick={() => setFormType('simple')}
          >
            전용 계약서
          </button>
        </div>
        <div className="group">
          <label>작성일</label>
          <input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
        </div>
        <div className="group">
          <label>인도지</label>
          <input type="text" placeholder="차량 인도 장소" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} style={{ width: 200 }} />
        </div>
        <div className="group">
          <label>특약</label>
          <input type="text" placeholder="추가 특약 사항" value={specialNote} onChange={(e) => setSpecialNote(e.target.value)} style={{ width: 200 }} />
        </div>
        <div className="doc-actions">
          <button className="doc-btn" type="button" onClick={handleSave}>
            <FloppyDisk size={14} /> 발행 기록
          </button>
          <button className="doc-btn primary" type="button" onClick={() => window.print()}>
            <Printer size={14} /> 인쇄
          </button>
        </div>
      </div>

      {/* 종이 */}
      <div className="doc-paper">
        <div className="doc-title">
          <h1>자동차 대여 계약서</h1>
          <div className="sub">{formType === 'full' ? '【정식 — 표준약관 포함】' : '【전용 — 약정 별지】'}</div>
        </div>

        {/* 당사자 */}
        <div className="doc-section-title">1. 계약 당사자</div>
        <table className="doc-table">
          <tbody>
            <tr>
              <th>임대인</th>
              <td>
                <strong>{stripCorpSuffix(senderName || '')}</strong>
                {senderBizNo && <> &nbsp;(사업자등록번호 {senderBizNo})</>}
                <br />
                {senderAddr}
                <br />
                대표 <strong>{senderRep}</strong>
              </td>
            </tr>
            <tr>
              <th>임차인</th>
              <td>
                <strong>{contract.customerName}</strong> &nbsp;
                ({maskIdent(contract.customerIdentNo)})
                <br />
                연락처: {contract.customerPhone1 || '-'}
                {contract.customerRegion && <><br />주소: {contract.customerRegion}{contract.customerDistrict ? ` ${contract.customerDistrict}` : ''}</>}
                {contract.customerLicenseNo && <><br />면허번호: {contract.customerLicenseNo}{contract.customerLicenseType ? ` (${contract.customerLicenseType})` : ''}</>}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 차량 */}
        <div className="doc-section-title">2. 임대 차량</div>
        <table className="doc-table">
          <tbody>
            <tr>
              <th>차량번호</th>
              <td className="mono">{contract.vehiclePlate}</td>
              <th>차종</th>
              <td>{contract.vehicleModel || '-'}</td>
            </tr>
            <tr>
              <th>인도일자</th>
              <td>{contract.deliveredDate || contract.contractDate}</td>
              <th>인도 장소</th>
              <td>{deliveryAddress || '_______________'}</td>
            </tr>
          </tbody>
        </table>

        {/* 조건 */}
        <div className="doc-section-title">3. 대여 조건</div>
        <table className="doc-table">
          <tbody>
            <tr>
              <th>계약기간</th>
              <td>
                {fmtKDate(contract.contractDate)} ~ {fmtKDate(contract.returnScheduledDate ?? '')}
                {contract.termMonths > 0 && ` (총 ${contract.termMonths}개월)`}
              </td>
            </tr>
            <tr>
              <th>월 대여료</th>
              <td className="num">₩ {fmtCurrency(contract.monthlyRent ?? 0)}</td>
            </tr>
            <tr>
              <th>보증금</th>
              <td className="num">₩ {fmtCurrency(contract.deposit ?? 0)}</td>
            </tr>
            <tr>
              <th>결제일</th>
              <td>매월 {contract.paymentDay ?? 1}일 ({contract.paymentMethod || '이체'})</td>
            </tr>
            {senderAccount && (
              <tr>
                <th>납부 계좌</th>
                <td>{senderAccount.bankName} {senderAccount.accountNo} (예금주: {senderAccount.accountHolder})</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 특약 */}
        {specialNote && (
          <>
            <div className="doc-section-title">4. 특약 사항</div>
            <div style={{ padding: '8px 12px', border: '1px solid #71717a', borderRadius: 2, fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
              {specialNote}
            </div>
          </>
        )}

        {/* 약관 — 정식만 */}
        {formType === 'full' && (
          <>
            <div className="doc-section-title">5. 표준 약관</div>
            <div className="doc-terms">
              {STANDARD_TERMS.map((t) => (
                <div key={t.title} style={{ marginBottom: 8 }}>
                  <div className="term-title">{t.title}</div>
                  <div className="term-body">{t.body}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 전용 — 간소 안내문 */}
        {formType === 'simple' && (
          <div style={{ marginTop: 24, fontSize: 11.5, lineHeight: 1.7, color: '#52525b' }}>
            <div className="doc-section-title" style={{ fontSize: 13 }}>안내</div>
            본 계약은 임대인·임차인 간 신뢰관계를 바탕으로 한 약식 계약서로,
            자동차 대여 표준약관(별도 약정)에 준하여 운영됩니다.
            연체·사고·과태료·정기검사 등에 관한 책임은 표준약관에 따릅니다.
            중도해지 시 잔여 대여료의 일정 비율을 위약금으로 부과할 수 있습니다.
          </div>
        )}

        {/* 서명란 */}
        <div className="doc-signature">
          <div className="box">
            <div className="label">임대인</div>
            <div className="row"><span className="key">상호</span><span>{stripCorpSuffix(senderName || '')}</span></div>
            <div className="row"><span className="key">대표</span><span>{senderRep}</span><span className="seal">(인)</span></div>
            {senderBizNo && <div className="row"><span className="key">사업자</span><span className="mono">{senderBizNo}</span></div>}
          </div>
          <div className="box">
            <div className="label">임차인</div>
            <div className="row"><span className="key">성명</span><span>{contract.customerName}</span><span className="seal">(인)</span></div>
            <div className="row"><span className="key">연락처</span><span className="mono">{contract.customerPhone1 || '-'}</span></div>
            {contract.customerIdentNo && <div className="row"><span className="key">등록번호</span><span className="mono">{maskIdent(contract.customerIdentNo)}</span></div>}
          </div>
        </div>

        <div style={{ marginTop: 50, textAlign: 'center', fontSize: 13 }}>
          {fmtKDate(issuedDate)}
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 16, color: '#71717a', fontSize: 11 }}>
        '인쇄' → 브라우저 인쇄 다이얼로그 (Ctrl+P, PDF 저장 가능). '발행 기록' → 계약 이력에 발행 일자 자동 저장.
      </div>
    </div>
  );
}
