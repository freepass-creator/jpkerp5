'use client';

/**
 * /asset/purchase — 매입 관리.
 * Vehicle.purchasedDate / purchasePrice 기반.
 * status='구매대기' (입고 예정) 와 매입 완료된 차량 분리 노출.
 */

import { useMemo } from 'react';
import { ShoppingCart } from '@phosphor-icons/react';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { displayCompanyName } from '@/lib/company-display';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { ASSET_SUB } from '@/components/layout/sub-nav';
import { BottomBar } from '@/components/layout/bottom-bar';

export default function PurchasePage() {
  const { vehicles } = useVehicles();
  const { companies: companyMaster } = useCompanies();

  const pending = useMemo(
    () => vehicles.filter((v) => v.status === '구매대기').sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')),
    [vehicles],
  );

  const purchased = useMemo(
    () => vehicles
      .filter((v) => !!v.purchasedDate && v.status !== '구매대기' && v.status !== '매각')
      .sort((a, b) => (b.purchasedDate ?? '').localeCompare(a.purchasedDate ?? ''))
      .slice(0, 200),
    [vehicles],
  );

  const totalPurchaseAmount = purchased.reduce((s, v) => s + (v.purchasePrice ?? 0), 0);

  return (
    <MasterPageShell
      title="매입 관리"
      icon={<ShoppingCart size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      subNav={ASSET_SUB}
      bottomBar={
        <BottomBar
          left={null}
          right={
            <>
              <span>구매대기 <strong>{pending.length}</strong>대</span>
              <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
              <span>매입완료 <strong>{purchased.length}</strong>대</span>
              <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
              <span>매입가 합계 <strong className="mono">₩{totalPurchaseAmount.toLocaleString()}</strong></span>
            </>
          }
        />
      }
    >
      {/* 구매대기 */}
      <section style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px', color: 'var(--orange-text, #c2410c)' }}>
          구매대기 — 입고 예정 차량 ({pending.length})
        </h3>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 56 }}>회사</th>
              <th style={{ width: 100 }}>차량번호</th>
              <th>차종</th>
              <th style={{ width: 100 }}>제조사</th>
              <th style={{ width: 100 }}>매입예정일</th>
              <th className="num" style={{ width: 110 }}>매입 예정가</th>
            </tr>
          </thead>
          <tbody>
            {pending.length === 0 ? (
              <tr><td colSpan={6} className="muted center" style={{ padding: 24 }}>구매대기 차량 없음</td></tr>
            ) : pending.map((v) => (
              <tr key={v.id}>
                <td className="dim">{v.company ? displayCompanyName(v.company, companyMaster) : '-'}</td>
                <td className="mono">{v.plate || '미정'}</td>
                <td>{v.model || '-'}</td>
                <td className="dim">{v.vehicleMaker ?? '-'}</td>
                <td className="mono dim">{v.purchasedDate || '-'}</td>
                <td className="num mono">{v.purchasePrice ? `₩${v.purchasePrice.toLocaleString()}` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 매입 완료 */}
      <section>
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-main)' }}>
          매입 완료 (최근 200대)
        </h3>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 56 }}>회사</th>
              <th style={{ width: 100 }}>차량번호</th>
              <th>차종</th>
              <th style={{ width: 90 }}>매입일</th>
              <th className="num" style={{ width: 110 }}>매입가</th>
              <th style={{ width: 80 }}>상태</th>
              <th style={{ width: 90 }}>등록일</th>
            </tr>
          </thead>
          <tbody>
            {purchased.length === 0 ? (
              <tr><td colSpan={7} className="muted center" style={{ padding: 24 }}>매입 완료 차량 없음</td></tr>
            ) : purchased.map((v) => (
              <tr key={v.id}>
                <td className="dim">{v.company ? displayCompanyName(v.company, companyMaster) : '-'}</td>
                <td className="mono">{v.plate}</td>
                <td>{v.model}</td>
                <td className="mono">{v.purchasedDate}</td>
                <td className="num mono">{v.purchasePrice ? `₩${v.purchasePrice.toLocaleString()}` : '-'}</td>
                <td><span className={`status ${v.status}`}>{v.status}</span></td>
                <td className="mono dim">{v.registeredDate || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </MasterPageShell>
  );
}
