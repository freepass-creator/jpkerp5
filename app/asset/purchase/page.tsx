'use client';

/**
 * /asset/purchase — 매입 관리.
 * Vehicle.purchasedDate / purchasePrice 기반.
 * status='구매대기' (입고 예정) 와 매입 완료된 차량 분리 노출.
 */

import { useMemo, useState } from 'react';
import { ShoppingCart, FileXls, MagnifyingGlass, Copy, ArrowRight } from '@phosphor-icons/react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { exportToExcel } from '@/lib/excel-export';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { syncContractStatusFromVehicle } from '@/lib/entity-sync';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';
import { displayCompanyName } from '@/lib/company-display';
import { CompanyCell } from '@/components/ui/company-cell';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { ASSET_SUB } from '@/components/layout/sub-nav';
import { EmptyRow } from '@/components/ui/empty-row';
import { StatusBadge } from '@/components/ui/status-badge';
import { vehicleStatusTone } from '@/lib/status-tones';
import { BottomBar } from '@/components/layout/bottom-bar';
import { NewButton, ExcelButton, ActionSep } from '@/components/ui/page-actions';
import { useVehicleDialog } from '@/lib/global-dialogs';
import { VehicleRegRegisterDialog } from '@/components/asset/vehicle-reg-register-dialog';

export default function PurchasePage() {
  const { vehicles, loading: vehiclesLoading, update: updateVehicle } = useVehicles();
  const { contracts, update: updateContract } = useContracts();
  const { companies: companyMaster } = useCompanies();
  const [busy, setBusy] = useState(false);
  const [regOpen, setRegOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number; row: { id: string; plate?: string; vin?: string } | null }>({ open: false, x: 0, y: 0, row: null });
  const { openVehicle } = useVehicleDialog();

  /** 구매대기 → 상품대기 일괄 전환 (plate 가 있고 정상 형식인 것만) */
  async function bulkPromotePending() {
    if (busy) return;
    const promotable = pending.filter((v) => v.plate && v.plate !== '미정');
    if (promotable.length === 0) {
      toast.info('차량번호가 등록된 구매대기 자산 없음 (먼저 차량번호 입력 필요)');
      return;
    }
    if (!await showConfirm({ title: `구매대기 ${promotable.length}건을 상품대기로 일괄 전환합니다.\n같은 plate 활성 계약 vehicleStatus 도 sync 됩니다.\n계속?` })) return;
    setBusy(true);
    let changed = 0, synced = 0;
    try {
      for (const v of promotable) {
        const merged = { ...v, status: '상품대기' as const };
        try {
          await updateVehicle(merged);
          changed++;
          const r = await syncContractStatusFromVehicle(merged, contracts, updateContract);
          synced += r.updatedCount;
        } catch (err) { console.error('promote failed', v.id, err); }
      }
      toast.success(`${changed}대 → 상품대기${synced > 0 ? ` · 계약 ${synced}건 sync` : ''}`);
    } finally {
      setBusy(false);
    }
  }

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
      stats={
        <>
          <span>구매대기<strong>{pending.length}</strong></span>
          <span>매입완료<strong>{purchased.length}</strong></span>
          <span className="sep" />
          <span>매입가 합계<strong className="mono">₩{totalPurchaseAmount.toLocaleString()}</strong></span>
        </>
      }
      bottomBar={
        <BottomBar
          left={
            <>
              <NewButton label="차량 매입 등록" onClick={() => setRegOpen(true)} />
              <ActionSep />
              <ExcelButton
                count={pending.length + purchased.length}
                title={`현재 페이지 목록 (${pending.length + purchased.length}건) 엑셀 다운로드`}
                onClick={() => {
                  const rows = [...pending, ...purchased].map((v) => ({
                    회사: v.company ? displayCompanyName(v.company, companyMaster) : '',
                    차량번호: v.plate ?? '',
                    차종: v.model ?? '',
                    VIN: v.vin ?? '',
                    제작연월: v.manufacturedDate ?? '',
                    매입일: v.purchasedDate ?? '',
                    매입가: v.purchasePrice ?? '',
                    상태: v.status ?? '',
                  }));
                  exportToExcel({
                    title: '매입 관리',
                    fileName: '매입관리',
                    sheetName: '매입',
                    rows,
                    columns: [
                      { key: '회사', header: '회사', width: 14 },
                      { key: '차량번호', header: '차량번호', width: 14, type: 'mono' },
                      { key: '차종', header: '차종', width: 20 },
                      { key: 'VIN', header: 'VIN', width: 18, type: 'mono' },
                      { key: '제작연월', header: '제작연월', width: 12, type: 'mono' },
                      { key: '매입일', header: '매입일', width: 14, type: 'date' },
                      { key: '매입가', header: '매입가', width: 14, type: 'number' },
                      { key: '상태', header: '상태', width: 12, type: 'center' },
                    ],
                  });
                }}
              />
            </>
          }
          right={null}
        />
      }
    >
      {/* 구매대기 */}
      <section style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 8, gap: 8 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: 'var(--orange-text, #c2410c)' }}>
            구매대기 — 입고 예정 차량 ({pending.length})
          </h3>
          {pending.length > 0 && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void bulkPromotePending()}
              disabled={busy}
              style={{ marginLeft: 'auto', fontSize: 11 }}
              title="차량번호가 등록된 구매대기 자산을 상품대기로 일괄 전환 (입고 완료 처리). 동일 plate 계약 vehicleStatus 도 sync."
            >
              <ArrowRight size={11} weight="bold" /> 일괄 상품대기 전환
            </button>
          )}
        </div>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 56 }}>회사</th>
              <th style={{ width: 96 }}>차량번호</th>
              <th>차종</th>
              <th style={{ width: 100 }}>제조사</th>
              <th style={{ width: 100 }}>매입예정일</th>
              <th className="num" style={{ width: 110 }}>매입 예정가</th>
            </tr>
          </thead>
          <tbody>
            {pending.length === 0 ? (
              <EmptyRow colSpan={6}>{vehiclesLoading ? '데이터 불러오는 중…' : '구매대기 차량 없음'}</EmptyRow>
            ) : pending.map((v) => (
              <tr key={v.id} onDoubleClick={() => v.plate && v.plate !== '미정' && openVehicle(v.plate, 'asset')} onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ open: true, x: e.clientX, y: e.clientY, row: v }); }} style={{ cursor: 'pointer' }}>
                <td className="dim"><CompanyCell raw={v.company} master={companyMaster} /></td>
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
              <th style={{ width: 96 }}>차량번호</th>
              <th>차종</th>
              <th style={{ width: 90 }}>매입일</th>
              <th className="num" style={{ width: 110 }}>매입가</th>
              <th style={{ width: 80 }}>상태</th>
              <th style={{ width: 90 }}>등록일</th>
            </tr>
          </thead>
          <tbody>
            {purchased.length === 0 ? (
              <EmptyRow colSpan={7}>{vehiclesLoading ? '데이터 불러오는 중…' : '매입 완료 차량 없음'}</EmptyRow>
            ) : purchased.map((v) => (
              <tr key={v.id} onDoubleClick={() => v.plate && v.plate !== '미정' && openVehicle(v.plate, 'asset')} onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ open: true, x: e.clientX, y: e.clientY, row: v }); }} style={{ cursor: 'pointer' }}>
                <td className="dim"><CompanyCell raw={v.company} master={companyMaster} /></td>
                <td className="mono">{v.plate}</td>
                <td>{v.model}</td>
                <td className="mono">{v.purchasedDate}</td>
                <td className="num mono">{v.purchasePrice ? `₩${v.purchasePrice.toLocaleString()}` : '-'}</td>
                <td><StatusBadge tone={vehicleStatusTone(v.status)}>{v.status}</StatusBadge></td>
                <td className="mono dim">{v.registeredDate || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <ContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        onClose={() => setCtxMenu({ open: false, x: 0, y: 0, row: null })}
        items={ctxMenu.row ? ([
          { label: '차량 상세', icon: <MagnifyingGlass size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.plate) openVehicle(ctxMenu.row.plate, 'asset'); }, disabled: !ctxMenu.row?.plate || ctxMenu.row?.plate === '미정' },
          { type: 'separator' },
          { label: '차량번호 복사', icon: <Copy size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.plate) navigator.clipboard.writeText(ctxMenu.row.plate); }, disabled: !ctxMenu.row.plate },
          { label: 'VIN 복사', icon: <Copy size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.vin) navigator.clipboard.writeText(ctxMenu.row.vin); }, disabled: !ctxMenu.row.vin },
        ] satisfies ContextMenuItem[]) : []}
      />
      <VehicleRegRegisterDialog open={regOpen} onOpenChange={setRegOpen} />
    </MasterPageShell>
  );
}
