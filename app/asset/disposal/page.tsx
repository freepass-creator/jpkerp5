'use client';

/**
 * /asset/disposal — 자산 처분 (매각·폐차).
 * Vehicle.status='매각' or '매각대기' 필터.
 */

import { useMemo } from 'react';
import { Trash } from '@phosphor-icons/react';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { ASSET_SUB } from '@/components/layout/sub-nav';
import { BottomBar } from '@/components/layout/bottom-bar';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { displayCompanyName } from '@/lib/company-display';

export default function AssetDisposalPage() {
  const { vehicles } = useVehicles();
  const { companies: companyMaster } = useCompanies();

  const disposed = useMemo(() => vehicles.filter((v) => v.status === '매각'), [vehicles]);
  const pending = useMemo(() => vehicles.filter((v) => v.status === '매각대기'), [vehicles]);

  return (
    <MasterPageShell
      title="자산처분"
      icon={<Trash size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      subNav={ASSET_SUB}
      bottomBar={
        <BottomBar
          left={<><span>전체 <strong>{disposed.length + pending.length}</strong></span><span style={{ color: 'var(--orange-text, #c2410c)' }}>대기 <strong>{pending.length}</strong></span><span>완료 <strong>{disposed.length}</strong></span></>}
          right={<><button className="btn" type="button">엑셀</button><button className="btn btn-primary" type="button">+ 처분 등록</button></>}
        />
      }
    >
      {/* 매각 대기 */}
      <section style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px', color: 'var(--orange-text, #c2410c)' }}>매각 대기 ({pending.length})</h3>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 56 }}>회사</th>
              <th style={{ width: 110 }}>자산코드</th>
              <th style={{ width: 96 }}>차량번호</th>
              <th>차명</th>
              <th style={{ width: 84 }}>제작연월</th>
              <th className="num" style={{ width: 110 }}>매입가</th>
            </tr>
          </thead>
          <tbody>
            {pending.length === 0 ? (
              <tr><td colSpan={6} className="muted center" style={{ padding: 24 }}>매각 대기 차량 없음</td></tr>
            ) : pending.map((v) => (
              <tr key={v.id}>
                <td className="dim">{v.company ? displayCompanyName(v.company, companyMaster) : '-'}</td>
                <td className="mono">{v.assetCode || '-'}</td>
                <td className="mono">{v.plate}</td>
                <td>{v.vehicleModelLine || v.model}</td>
                <td className="mono">{v.manufacturedDate?.slice(0, 7) || '-'}</td>
                <td className="num mono">{v.purchasePrice ? `₩${v.purchasePrice.toLocaleString()}` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 매각 완료 */}
      <section>
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>매각 완료 ({disposed.length})</h3>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 56 }}>회사</th>
              <th style={{ width: 110 }}>자산코드</th>
              <th style={{ width: 96 }}>차량번호</th>
              <th>차명</th>
              <th style={{ width: 84 }}>제작연월</th>
              <th className="num" style={{ width: 110 }}>매입가</th>
            </tr>
          </thead>
          <tbody>
            {disposed.length === 0 ? (
              <tr><td colSpan={6} className="muted center" style={{ padding: 24 }}>매각 완료 차량 없음</td></tr>
            ) : disposed.map((v) => (
              <tr key={v.id}>
                <td className="dim">{v.company ? displayCompanyName(v.company, companyMaster) : '-'}</td>
                <td className="mono">{v.assetCode || '-'}</td>
                <td className="mono">{v.plate}</td>
                <td>{v.vehicleModelLine || v.model}</td>
                <td className="mono">{v.manufacturedDate?.slice(0, 7) || '-'}</td>
                <td className="num mono">{v.purchasePrice ? `₩${v.purchasePrice.toLocaleString()}` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </MasterPageShell>
  );
}
