'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Printer, FloppyDisk, Warning } from '@phosphor-icons/react';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { useAuth } from '@/lib/use-auth';
import { toast } from '@/lib/toast';
import { friendlyError } from '@/lib/friendly-error';
import { todayKr } from '@/lib/mock-data';
import type { Contract, Company } from '@/lib/types';
import { CertDocument, CERT_PRINT_CSS } from '@/components/notice/cert-document';

/* ─────────────── 위약금률 계산 ─────────────── */
function calcPenaltyRate(contractDate: string, terminationDate: string): number {
  if (!contractDate || !terminationDate) return 0.3;
  const start = new Date(contractDate).getTime();
  const end = new Date(terminationDate).getTime();
  const months = (end - start) / (1000 * 60 * 60 * 24 * 30);
  // 1년 이내 30% / 1년 초과 20%
  return months <= 12 ? 0.3 : 0.2;
}

function addDays(yyyymmdd: string, days: number): string {
  const d = new Date(yyyymmdd);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtCurrency(n: number): string {
  return n.toLocaleString('ko-KR');
}

function fmtKDate(s: string): string {
  if (!s) return '____년 __월 __일';
  const [y, m, d] = s.split('-');
  return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`;
}

/* ─────────────── 페이지 ─────────────── */
export default function NoticeCertPage() {
  const params = useParams<{ contractId: string }>();
  const contractId = params?.contractId;
  const { contracts, update: updateContract } = useContracts();
  const { companies } = useCompanies();
  const { add: addHistory } = useHistoryEntries();
  const { user } = useAuth();

  const contract = useMemo(() => contracts.find((c) => c.id === contractId), [contracts, contractId]);
  const senderCompany = useMemo<Company | undefined>(() => {
    if (!contract) return undefined;
    return companies.find((co) => co.name === contract.company || co.id === contract.company)
      ?? companies[0];
  }, [contract, companies]);

  // 편집 가능 필드
  const [terminationDate, setTerminationDate] = useState('');
  const [returnedDate, setReturnedDate] = useState('');
  const [repairCost, setRepairCost] = useState(0);
  const [overrunCost, setOverrunCost] = useState(0);
  const [towingCost, setTowingCost] = useState(0);
  const [paymentDueDate, setPaymentDueDate] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [issuedDate, setIssuedDate] = useState(todayKr());

  // 자동 채움
  useEffect(() => {
    if (!contract) return;
    setTerminationDate(contract.returnedDate || todayKr());
    setReturnedDate(contract.returnedDate || '');
    setPaymentDueDate(addDays(todayKr(), 14));
  }, [contract]);

  if (!contractId) {
    return <div style={{ padding: 40 }}>잘못된 경로</div>;
  }
  if (!contract) {
    return <div style={{ padding: 40 }}>계약 로딩 중...</div>;
  }

  const penaltyRate = calcPenaltyRate(contract.contractDate, terminationDate);
  const penaltyAmount = Math.round((contract.deposit ?? 0) * penaltyRate);
  const unpaid = contract.unpaidAmount ?? 0;
  const deposit = contract.deposit ?? 0;
  const totalA = unpaid + penaltyAmount + repairCost + overrunCost + towingCost;
  const totalNet = totalA - deposit;

  async function handleSave() {
    if (!contract) return;
    try {
      // 1) history_entries에 기록
      await addHistory({
        scope: 'contract',
        contractId: contract.id,
        vehiclePlate: contract.vehiclePlate,
        date: issuedDate,
        category: '법적조치',
        title: `내용증명 발송 (최고서) — 청구 ₩${fmtCurrency(totalNet)}`,
        description: [
          `수신: ${contract.customerName}`,
          `차량: ${contract.vehiclePlate}`,
          `해지일: ${terminationDate} / 반납일: ${returnedDate || '-'}`,
          `미납 ₩${fmtCurrency(unpaid)} + 위약금 ₩${fmtCurrency(penaltyAmount)} (${(penaltyRate * 100).toFixed(0)}%) + 수리 ₩${fmtCurrency(repairCost)} + 초과 ₩${fmtCurrency(overrunCost)} + 견인 ₩${fmtCurrency(towingCost)} - 보증금 ₩${fmtCurrency(deposit)}`,
          `납부기일: ${paymentDueDate}`,
          `담당: ${contactName}${contactPhone ? ` (${contactPhone})` : ''}`,
        ].join('\n'),
        status: '완료',
      });
      // 2) 채권화 자동 전이 (이미 채권이 아니라면)
      if (contract.status !== '채권') {
        await updateContract({ ...contract, status: '채권' });
      }
      toast.success('내용증명 발송 기록 저장 — 채권화 처리됨');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  const senderName = senderCompany?.name || contract.company;
  const senderRep = senderCompany?.ceo || '대표이사';
  const senderAddr = senderCompany?.address || '';
  const senderAccount = senderCompany?.accounts?.[0];

  return (
    <div className="cert-shell">
      <style>{`
        .cert-shell {
          font-family: 'Pretendard Variable', Pretendard, sans-serif;
          background: #f4f4f5;
          min-height: 100vh;
          padding: 24px 0;
        }
        .cert-toolbar {
          max-width: 794px;
          margin: 0 auto 16px;
          display: flex;
          gap: 8px;
          padding: 10px 16px;
          background: #fff;
          border: 1px solid #e4e4e7;
          border-radius: 6px;
          font-size: 12px;
        }
        .cert-toolbar input[type="date"],
        .cert-toolbar input[type="text"],
        .cert-toolbar input[type="number"] {
          height: 26px;
          padding: 0 6px;
          font: inherit;
          border: 1px solid #d4d4d8;
          border-radius: 4px;
        }
        .cert-toolbar { flex-wrap: wrap; }
        .cert-toolbar .group {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 0 6px;
          border-right: 1px solid #e4e4e7;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .cert-toolbar .group:last-of-type { border-right: none; }
        .cert-toolbar label { color: #71717a; font-size: 11px; white-space: nowrap; flex-shrink: 0; }
        .cert-toolbar input { flex-shrink: 0; }
        .cert-actions { margin-left: auto; display: flex; gap: 6px; }
        .cert-btn {
          height: 28px;
          padding: 0 12px;
          font: inherit;
          border: 1px solid #d4d4d8;
          background: #fff;
          border-radius: 4px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .cert-btn.primary {
          background: #1B2A4A;
          color: #fff;
          border-color: #1B2A4A;
        }

        .cert-stage { display: flex; justify-content: center; padding: 0 16px 40px; }

        @media print {
          .cert-toolbar { display: none; }
          .cert-shell { background: #fff; padding: 0; }
          .cert-stage { padding: 0; }
        }
      `}</style>
      {/* styled-jsx 가 ${...} 보간/@page 룰을 잘 못 다루므로 plain style 로 주입 */}
      <style dangerouslySetInnerHTML={{ __html: CERT_PRINT_CSS }} />

      {/* 툴바 */}
      <div className="cert-toolbar">
        <div className="group">
          <label>발송일</label>
          <input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
        </div>
        <div className="group">
          <label>해지일</label>
          <input type="date" value={terminationDate} onChange={(e) => setTerminationDate(e.target.value)} />
        </div>
        <div className="group">
          <label>반납일</label>
          <input type="date" value={returnedDate} onChange={(e) => setReturnedDate(e.target.value)} />
        </div>
        <div className="group">
          <label>납부기일</label>
          <input type="date" value={paymentDueDate} onChange={(e) => setPaymentDueDate(e.target.value)} />
        </div>
        <div className="group">
          <label>수리비</label>
          <input type="number" value={repairCost} onChange={(e) => setRepairCost(Number(e.target.value) || 0)} style={{ width: 100 }} />
          <label>초과</label>
          <input type="number" value={overrunCost} onChange={(e) => setOverrunCost(Number(e.target.value) || 0)} style={{ width: 100 }} />
          <label>견인</label>
          <input type="number" value={towingCost} onChange={(e) => setTowingCost(Number(e.target.value) || 0)} style={{ width: 100 }} />
        </div>
        <div className="group">
          <label>담당</label>
          <input type="text" placeholder="이름" value={contactName} onChange={(e) => setContactName(e.target.value)} style={{ width: 80 }} />
          <input type="text" placeholder="연락처" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} style={{ width: 130 }} />
        </div>
        <div className="cert-actions">
          <button className="cert-btn" type="button" onClick={handleSave}>
            <FloppyDisk size={14} /> 저장+채권화
          </button>
          <button className="cert-btn primary" type="button" onClick={() => window.print()}>
            <Printer size={14} /> 인쇄
          </button>
        </div>
      </div>

      {/* A4 종이 — bulk 와 100% 동일한 공용 컴포넌트 */}
      <div className="cert-stage">
        <CertDocument
          contract={contract}
          senderCompany={senderCompany}
          issuedDate={issuedDate}
          terminationDate={terminationDate}
          returnedDate={returnedDate}
          paymentDueDate={paymentDueDate}
          repairCost={repairCost}
          overrunCost={overrunCost}
          towingCost={towingCost}
          penaltyRate={penaltyRate}
          contactName={contactName}
          contactPhone={contactPhone}
        />
      </div>

      <div style={{ textAlign: 'center', marginTop: 16, color: '#71717a', fontSize: 11 }}>
        <Warning size={11} weight="duotone" style={{ verticalAlign: 'middle', marginRight: 4 }} />
        '인쇄' 누르면 브라우저 인쇄 다이얼로그 (Ctrl+P) — PDF로 저장 가능. '저장+채권화' 시 history_entries에 발송 이력 + contract.status='채권' 자동 전이.
      </div>
    </div>
  );
}
