'use client';

/**
 * /contract/expire — 만기 임박 계약 추적.
 * Contract.returnScheduledDate 가 today 기준 D-90 이내인 계약.
 */

import { useMemo, useState } from 'react';
import { Calendar } from '@phosphor-icons/react';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { CONTRACT_SUB } from '@/components/layout/sub-nav';
import { BottomBar } from '@/components/layout/bottom-bar';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { displayCompanyName } from '@/lib/company-display';
import { todayKr } from '@/lib/mock-data';

export default function ExpirePage() {
  const { contracts } = useContracts();
  const { companies: companyMaster } = useCompanies();
  const today = todayKr();
  const [bucket, setBucket] = useState<'all' | 'expired' | 'd30' | 'd90'>('all');

  const all = useMemo(() => {
    return contracts
      .filter((c) => c.returnScheduledDate && c.status === '운행')
      .map((c) => {
        const daysLeft = Math.round((new Date(c.returnScheduledDate!).getTime() - new Date(today).getTime()) / 86400000);
        return { contract: c, daysLeft };
      })
      .filter(({ daysLeft }) => daysLeft <= 90)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [contracts, today]);

  const expired = all.filter((r) => r.daysLeft < 0);
  const within30 = all.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 30);
  const within90 = all.filter((r) => r.daysLeft > 30 && r.daysLeft <= 90);

  const rows = useMemo(() => {
    if (bucket === 'expired') return expired;
    if (bucket === 'd30') return within30;
    if (bucket === 'd90') return within90;
    return all;
  }, [bucket, all, expired, within30, within90]);

  return (
    <MasterPageShell
      title="만기 임박 계약"
      icon={<Calendar size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      subNav={CONTRACT_SUB}
      quickFilters={
        <>
          <button type="button" className={`chip ${bucket === 'all' ? 'active' : ''}`} onClick={() => setBucket('all')}>
            전체<span className="chip-count">{all.length}</span>
          </button>
          <button type="button" className={`chip chip-tone-red ${bucket === 'expired' ? 'active' : ''}`} onClick={() => setBucket('expired')}>
            만기 경과<span className="chip-count">{expired.length}</span>
          </button>
          <button type="button" className={`chip chip-tone-orange ${bucket === 'd30' ? 'active' : ''}`} onClick={() => setBucket('d30')}>
            D-30<span className="chip-count">{within30.length}</span>
          </button>
          <button type="button" className={`chip ${bucket === 'd90' ? 'active' : ''}`} onClick={() => setBucket('d90')}>
            D-31~90<span className="chip-count">{within90.length}</span>
          </button>
        </>
      }
      bottomBar={
        <BottomBar
          left={<button className="btn" type="button">엑셀</button>}
          right={null}
        />
      }
    >
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 56 }}>회사</th>
            <th style={{ width: 96 }}>차량번호</th>
            <th>계약자</th>
            <th style={{ width: 110 }}>연락처</th>
            <th style={{ width: 110 }}>만기예정일</th>
            <th className="center" style={{ width: 80 }}>D-N</th>
            <th className="num" style={{ width: 110 }}>월 대여료</th>
            <th className="num" style={{ width: 110 }}>보증금</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={8} className="muted center" style={{ padding: 32 }}>만기 임박 계약 없음 (D-90 내)</td></tr>
          ) : rows.map(({ contract: c, daysLeft }) => {
            const tone = daysLeft < 0 ? 'red' : daysLeft <= 30 ? 'orange' : '';
            const label = daysLeft < 0 ? `만기 ${-daysLeft}일 경과` : daysLeft === 0 ? '오늘 만기' : `D-${daysLeft}`;
            return (
              <tr key={c.id}>
                <td className="dim">{c.company ? displayCompanyName(c.company, companyMaster) : '-'}</td>
                <td className="mono">{c.vehiclePlate}</td>
                <td>{c.customerName}</td>
                <td className="mono dim">{c.customerPhone1 || '-'}</td>
                <td className="mono">{c.returnScheduledDate}</td>
                <td className="center mono" style={{ fontWeight: 700, color: tone === 'red' ? 'var(--red-text)' : tone === 'orange' ? 'var(--orange-text, #c2410c)' : undefined }}>
                  {label}
                </td>
                <td className="num mono">₩{(c.monthlyRent ?? 0).toLocaleString()}</td>
                <td className="num mono">₩{(c.deposit ?? 0).toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </MasterPageShell>
  );
}
