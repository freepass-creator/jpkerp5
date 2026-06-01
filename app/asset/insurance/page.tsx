'use client';

/**
 * /asset/insurance — 보험 이력 + 보험 만기 추적.
 * HistoryEntry(category='보험') + Contract.insuranceExpiryDate 통합.
 */

import { useMemo } from 'react';
import { ShieldCheck } from '@phosphor-icons/react';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { ASSET_SUB } from '@/components/layout/sub-nav';
import { BottomBar } from '@/components/layout/bottom-bar';
import { todayKr } from '@/lib/mock-data';

export default function AssetInsurancePage() {
  const { entries: history } = useHistoryEntries();
  const { contracts } = useContracts();
  const today = todayKr();

  const insuranceEvents = useMemo(() => {
    return history
      .filter((h) => h.scope === 'vehicle' && h.category === '보험')
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }, [history]);

  /** 만기 추적: 계약별 insuranceExpiryDate 가 있는 것들 */
  const expiringContracts = useMemo(() => {
    return contracts
      .filter((c) => c.insuranceExpiryDate)
      .map((c) => ({
        contract: c,
        daysLeft: Math.round((new Date(c.insuranceExpiryDate!).getTime() - new Date(today).getTime()) / 86400000),
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [contracts, today]);

  return (
    <MasterPageShell
      title="보험 이력"
      icon={<ShieldCheck size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      subNav={ASSET_SUB}
      bottomBar={
        <BottomBar
          left={null}
          right={
            <>
              <span>보험 이력 <strong>{insuranceEvents.length}</strong>건</span>
              <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
              <span>만기 추적 <strong>{expiringContracts.length}</strong>대</span>
            </>
          }
        />
      }
    >
      {/* 보험 만기 임박 */}
      <section style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-main)' }}>보험 만기 추적</h3>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 90 }}>차량번호</th>
              <th style={{ width: 140 }}>차종</th>
              <th>계약자</th>
              <th className="mono" style={{ width: 110 }}>보험 만기일</th>
              <th className="center" style={{ width: 80 }}>D-N</th>
              <th className="center" style={{ width: 100 }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {expiringContracts.length === 0 ? (
              <tr><td colSpan={6} className="muted center" style={{ padding: 24 }}>보험 만기일 등록된 계약 없음</td></tr>
            ) : expiringContracts.map(({ contract, daysLeft }) => {
              const tone = daysLeft < 0 ? 'red' : daysLeft <= 30 ? 'orange' : daysLeft <= 90 ? 'amber' : '';
              const label = daysLeft < 0 ? `만기 ${-daysLeft}일 경과` : daysLeft === 0 ? '오늘 만기' : `D-${daysLeft}`;
              return (
                <tr key={contract.id}>
                  <td className="mono">{contract.vehiclePlate}</td>
                  <td className="dim">{contract.vehicleModel}</td>
                  <td>{contract.customerName}</td>
                  <td className="mono">{contract.insuranceExpiryDate}</td>
                  <td className="center mono" style={{ color: tone === 'red' ? 'var(--red-text)' : tone === 'orange' ? 'var(--orange-text, #c2410c)' : undefined, fontWeight: 700 }}>
                    {label}
                  </td>
                  <td className="center dim">{daysLeft < 0 ? '만료' : daysLeft <= 30 ? '갱신 필요' : '정상'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* 보험 이력 */}
      <section>
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-main)' }}>보험 이력 (배서·갱신·청구)</h3>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 90 }}>일자</th>
              <th style={{ width: 90 }}>차량번호</th>
              <th style={{ width: 100 }}>구분</th>
              <th>제목</th>
              <th style={{ width: 140 }}>보험사</th>
              <th className="num" style={{ width: 100 }}>금액</th>
              <th style={{ width: 64 }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {insuranceEvents.length === 0 ? (
              <tr><td colSpan={7} className="muted center" style={{ padding: 24 }}>보험 이력 없음</td></tr>
            ) : insuranceEvents.map((h) => (
              <tr key={h.id}>
                <td className="mono">{h.date}</td>
                <td className="mono">{h.vehiclePlate || '-'}</td>
                <td>{(h.meta?.insKind as string) ?? h.category}</td>
                <td>{h.title}</td>
                <td className="dim">{(h.meta?.insuranceCompany as string) ?? h.vendor ?? '-'}</td>
                <td className="num mono">{h.cost ? `₩${h.cost.toLocaleString()}` : '-'}</td>
                <td className="dim">{h.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </MasterPageShell>
  );
}
