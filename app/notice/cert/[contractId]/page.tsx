'use client';

/**
 * 단건 내용증명 — 입력 폼 없이 contract+company 사전 입력 정보로 자동 출력.
 * 우측 상단 floating 인쇄 버튼 (인쇄 시 자동 숨김).
 */

import { useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Printer } from '@phosphor-icons/react';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { todayKr } from '@/lib/mock-data';
import { addDays } from '@/lib/utils';
import type { Company } from '@/lib/types';
import { CertDocument, CERT_PRINT_CSS } from '@/components/notice/cert-document';

export default function NoticeCertPage() {
  const params = useParams<{ contractId: string }>();
  const contractId = params?.contractId;
  const { contracts } = useContracts();
  const { companies } = useCompanies();
  const { add: addHistory } = useHistoryEntries();
  const loggedRef = useRef(false);

  const contract = useMemo(() => contracts.find((c) => c.id === contractId), [contracts, contractId]);
  const senderCompany = useMemo<Company | undefined>(() => {
    if (!contract) return undefined;
    return companies.find((co) => co.name === contract.company || co.id === contract.company)
      ?? companies[0];
  }, [contract, companies]);

  if (!contractId) return <div style={{ padding: 40 }}>잘못된 경로</div>;
  if (!contract) return <div style={{ padding: 40 }}>계약 로딩 중...</div>;

  // 자동 derive — 사람이 손대지 않음
  const today = todayKr();
  const issuedDate = today;
  const terminationDate = contract.returnedDate || today;
  const returnedDate = contract.returnedDate || '';
  const paymentDueDate = addDays(today, 14);

  // 인쇄(발송) 시 법적조치 이력 1회 기록 — needsNoticeAction 배지 해소. 이력 실패가 인쇄를 막지 않음.
  async function handlePrint() {
    if (!loggedRef.current && contract) {
      loggedRef.current = true;
      try {
        await addHistory({
          scope: 'contract', contractId: contract.id, date: today,
          category: '법적조치', title: '내용증명 발송(출력)', status: '완료',
        });
      } catch { /* ignore */ }
    }
    window.print();
  }

  return (
    <div className="cert-shell">
      <style>{`
        .cert-shell {
          font-family: 'Pretendard Variable', Pretendard, sans-serif;
          background: #f4f4f5;
          min-height: 100vh;
          padding: 24px 0;
        }
        .cert-stage { display: flex; justify-content: center; padding: 0 16px 40px; }
        .cert-print-fab {
          position: fixed; top: 16px; right: 16px; z-index: 50;
          height: 36px; padding: 0 14px;
          background: #1B2A4A; color: #fff;
          border: 1px solid #1B2A4A; border-radius: 6px;
          font: inherit; font-size: 12px;
          display: inline-flex; align-items: center; gap: 6px;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        @media print {
          .cert-print-fab { display: none; }
          .cert-shell { background: #fff; padding: 0; }
          .cert-stage { padding: 0; }
        }
      `}</style>
      <style dangerouslySetInnerHTML={{ __html: CERT_PRINT_CSS }} />

      <button className="cert-print-fab" type="button" onClick={handlePrint}>
        <Printer size={14} weight="bold" /> 인쇄
      </button>

      <div className="cert-stage">
        <CertDocument
          contract={contract}
          senderCompany={senderCompany}
          issuedDate={issuedDate}
          terminationDate={terminationDate}
          returnedDate={returnedDate}
          paymentDueDate={paymentDueDate}
        />
      </div>
    </div>
  );
}
