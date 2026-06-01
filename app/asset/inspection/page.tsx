'use client';

/**
 * /asset/inspection — 검사 내역 + 검사 만기 추적.
 * Contract.inspectionDueDate 기반 만기 임박/경과 자산 노출 + 검사 이력 (HistoryEntry category='검사').
 */

import { useMemo } from 'react';
import { ClipboardText } from '@phosphor-icons/react';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { ASSET_SUB } from '@/components/layout/sub-nav';
import { BottomBar } from '@/components/layout/bottom-bar';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { todayKr } from '@/lib/mock-data';

export default function AssetInspectionPage() {
  const { contracts } = useContracts();
  const { entries: history } = useHistoryEntries();
  const { vehicles } = useVehicles();
  const today = todayKr();

  const upcoming = useMemo(() => {
    return contracts
      .filter((c) => c.inspectionDueDate)
      .map((c) => {
        const daysLeft = Math.round((new Date(c.inspectionDueDate!).getTime() - new Date(today).getTime()) / 86400000);
        return { c, daysLeft };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [contracts, today]);

  const inspectionEvents = useMemo(() => {
    return history.filter((h) => h.scope === 'vehicle' && h.category === '검사').sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }, [history]);

  const overdue = upcoming.filter((u) => u.daysLeft < 0);
  const within30 = upcoming.filter((u) => u.daysLeft >= 0 && u.daysLeft <= 30);

  return (
    <MasterPageShell
      title="검사내역"
      icon={<ClipboardText size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      subNav={ASSET_SUB}
      bottomBar={
        <BottomBar
          left={
            <>
              <span>만기 추적 <strong>{upcoming.length}</strong></span>
              <span style={{ color: 'var(--red-text)' }}>경과 <strong>{overdue.length}</strong></span>
              <span style={{ color: 'var(--orange-text, #c2410c)' }}>D-30 <strong>{within30.length}</strong></span>
              <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
              <span>검사 이력 <strong>{inspectionEvents.length}</strong></span>
            </>
          }
          right={<button className="btn btn-primary" type="button">+ 검사 등록</button>}
        />
      }
    >
      <section style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>정기검사 만기 추적</h3>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 60 }}>회사</th>
              <th style={{ width: 90 }}>차량번호</th>
              <th>차종</th>
              <th>계약자</th>
              <th className="mono" style={{ width: 110 }}>검사 만기</th>
              <th className="center" style={{ width: 90 }}>D-N</th>
            </tr>
          </thead>
          <tbody>
            {upcoming.length === 0 ? (
              <tr><td colSpan={6} className="muted center" style={{ padding: 24 }}>등록된 검사 만기 없음</td></tr>
            ) : upcoming.map(({ c, daysLeft }) => {
              const tone = daysLeft < 0 ? 'red' : daysLeft <= 30 ? 'orange' : '';
              const label = daysLeft < 0 ? `만기 ${-daysLeft}일 경과` : daysLeft === 0 ? '오늘 만기' : `D-${daysLeft}`;
              return (
                <tr key={c.id}>
                  <td className="dim">{c.company || '-'}</td>
                  <td className="mono">{c.vehiclePlate}</td>
                  <td className="dim">{c.vehicleModel || vehicles.find((v) => v.plate === c.vehiclePlate)?.model || '-'}</td>
                  <td>{c.customerName}</td>
                  <td className="mono">{c.inspectionDueDate}</td>
                  <td className="center mono" style={{ fontWeight: 700, color: tone === 'red' ? 'var(--red-text)' : tone === 'orange' ? 'var(--orange-text, #c2410c)' : undefined }}>{label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>검사 이력</h3>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 90 }}>일자</th>
              <th style={{ width: 90 }}>차량번호</th>
              <th>제목</th>
              <th style={{ width: 140 }}>업체</th>
              <th className="num" style={{ width: 100 }}>금액</th>
              <th style={{ width: 64 }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {inspectionEvents.length === 0 ? (
              <tr><td colSpan={6} className="muted center" style={{ padding: 24 }}>검사 이력 없음</td></tr>
            ) : inspectionEvents.map((h) => (
              <tr key={h.id}>
                <td className="mono">{h.date}</td>
                <td className="mono">{h.vehiclePlate || '-'}</td>
                <td>{h.title}</td>
                <td className="dim">{h.vendor || '-'}</td>
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
