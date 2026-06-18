'use client';

/**
 * 내용증명 일괄 출력 — 미납 계약 N건을 한 PDF로.
 *
 * URL: /notice/cert/bulk?ids=contractId1,contractId2,...
 * 단건 페이지와 동일한 CertDocument 컴포넌트 사용 → 양식 100% 일치.
 * 각 contract = 1페이지 (page-break-after: always).
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Printer, ArrowLeft } from '@phosphor-icons/react';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useAuth } from '@/lib/use-auth';
import { todayKr } from '@/lib/mock-data';
import { monthsBetween } from '@/lib/utils';
import { CertDocument, CERT_PRINT_CSS } from '@/components/notice/cert-document';
import type { Contract } from '@/lib/types';

function addDays(ymd: string, days: number): string {
  const d = new Date(ymd);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function calcPenaltyRate(contractDate: string, terminationDate: string): number {
  if (!contractDate || !terminationDate) return 0.3;
  const months = monthsBetween(contractDate, terminationDate);
  return months < 12 ? 0.3 : 0.2;
}

export default function BulkNoticeCertPage() {
  const sp = useSearchParams();
  const idsParam = sp?.get('ids') ?? '';
  const ids = useMemo(() => idsParam.split(',').filter(Boolean), [idsParam]);
  const { contracts } = useContracts();
  const { companies } = useCompanies();
  useAuth();
  const [issuedDate] = useState(todayKr());
  const paymentDueDate = addDays(issuedDate, 14);

  const selected = useMemo(
    () => ids.map((id) => contracts.find((c) => c.id === id)).filter((c): c is Contract => !!c),
    [ids, contracts],
  );

  const [autoPrint, setAutoPrint] = useState(false);
  useEffect(() => {
    if (autoPrint && selected.length > 0) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [autoPrint, selected]);

  if (ids.length === 0) {
    return (
      <div style={{ padding: 40, fontFamily: 'Pretendard Variable, sans-serif' }}>
        <h2>내용증명 일괄 출력</h2>
        <p>URL 파라미터 <code>?ids=A,B,C</code> 형식으로 계약 ID들을 전달해주세요.</p>
      </div>
    );
  }

  return (
    <div className="bulk-shell">
      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css');

        .bulk-shell { font-family: 'Pretendard Variable', sans-serif; background: #e5e7eb; min-height: 100vh; }
        .bulk-toolbar {
          position: sticky; top: 0; z-index: 10;
          background: #1B2A4A; color: #fff;
          padding: 14px 20px; display: flex; align-items: center; gap: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .bulk-toolbar h1 { font-size: 16px; font-weight: 800; margin: 0; }
        .bulk-toolbar .meta { font-size: 12px; opacity: 0.8; margin-left: 12px; }
        .bulk-toolbar .spacer { flex: 1; }
        .bulk-toolbar button {
          padding: 8px 16px; font-size: 13px; font-weight: 600;
          border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.1);
          color: #fff; border-radius: 4px; cursor: pointer;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .bulk-toolbar button:hover { background: rgba(255,255,255,0.2); }
        .bulk-toolbar button.primary { background: #fff; color: #1B2A4A; font-weight: 700; }

        .cert-pages { padding: 24px; display: flex; flex-direction: column; gap: 16px; align-items: center; }

        @media print {
          .bulk-toolbar { display: none; }
          .bulk-shell { background: #fff; }
          .cert-pages { padding: 0; gap: 0; }
        }
      `}</style>
      {/* styled-jsx 가 ${...} 보간/@page 룰을 잘 못 다루므로 plain style 로 주입 */}
      <style dangerouslySetInnerHTML={{ __html: CERT_PRINT_CSS }} />

      <div className="bulk-toolbar">
        <button type="button" onClick={() => window.close()} title="창 닫기">
          <ArrowLeft size={13} weight="bold" /> 닫기
        </button>
        <h1>내용증명 일괄 출력 (최고서)</h1>
        <span className="meta">{selected.length}건 / 작성일 {issuedDate}</span>
        <div className="spacer" />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} />
          자동 인쇄 다이얼로그
        </label>
        <button className="primary" type="button" onClick={() => window.print()}>
          <Printer size={13} weight="bold" /> PDF 일괄 출력
        </button>
      </div>

      <div className="cert-pages">
        {selected.length === 0 ? (
          <div style={{ padding: 80, color: '#71717a' }}>해당 계약을 찾을 수 없습니다. (RTDB 로딩 중일 수 있어요)</div>
        ) : selected.map((contract, idx) => {
          const senderCompany = companies.find((co) => co.name === contract.company || co.id === contract.company) ?? companies[0];
          const terminationDate = contract.returnedDate || issuedDate;
          return (
            <CertDocument
              key={contract.id}
              contract={contract}
              senderCompany={senderCompany}
              issuedDate={issuedDate}
              terminationDate={terminationDate}
              returnedDate={contract.returnedDate}
              paymentDueDate={paymentDueDate}
              penaltyRate={calcPenaltyRate(contract.contractDate, terminationDate)}
              pageIndex={idx + 1}
              pageTotal={selected.length}
            />
          );
        })}
      </div>
    </div>
  );
}
