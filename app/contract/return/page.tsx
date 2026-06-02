'use client';

/**
 * /contract/return — 반납 계약 (status='반납' 또는 returnedDate 있음).
 */

import { useMemo } from 'react';
import { ArrowUUpLeft } from '@phosphor-icons/react';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { CONTRACT_SUB } from '@/components/layout/sub-nav';
import { BottomBar } from '@/components/layout/bottom-bar';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { displayCompanyName } from '@/lib/company-display';

export default function ContractReturnPage() {
  const { contracts } = useContracts();
  const { companies: companyMaster } = useCompanies();
  const rows = useMemo(() => {
    return contracts
      .filter((c) => c.status === '반납' || !!c.returnedDate)
      .sort((a, b) => (b.returnedDate ?? '').localeCompare(a.returnedDate ?? ''));
  }, [contracts]);

  return (
    <MasterPageShell
      title="반납 계약"
      icon={<ArrowUUpLeft size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      subNav={CONTRACT_SUB}
      quickFilters={
        <button type="button" className="chip active">
          반납<span className="chip-count">{rows.length}</span>
        </button>
      }
      bottomBar={<BottomBar left={<button className="btn" type="button">엑셀</button>} right={null} />}
    >
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 60 }}>회사</th>
            <th style={{ width: 90 }}>차량번호</th>
            <th>계약자</th>
            <th style={{ width: 110 }}>계약일</th>
            <th style={{ width: 110 }}>약정 종료일</th>
            <th style={{ width: 110 }}>실제 반납일</th>
            <th className="num" style={{ width: 130 }}>최종 미수</th>
            <th style={{ width: 60 }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={8} className="muted center" style={{ padding: 32 }}>반납 계약 없음</td></tr>
          ) : rows.map((c) => (
            <tr key={c.id}>
              <td className="dim">{c.company ? displayCompanyName(c.company, companyMaster) : '-'}</td>
              <td className="mono">{c.vehiclePlate}</td>
              <td>{c.customerName}</td>
              <td className="mono">{c.contractDate}</td>
              <td className="mono dim">{c.returnScheduledDate || '-'}</td>
              <td className="mono">{c.returnedDate || '-'}</td>
              <td className="num mono" style={{ color: (c.unpaidAmount ?? 0) > 0 ? 'var(--red-text)' : undefined }}>
                ₩{(c.unpaidAmount ?? 0).toLocaleString()}
              </td>
              <td><span className={`status ${c.status}`}>{c.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </MasterPageShell>
  );
}
