'use client';

/**
 * /contract/return — 반납 계약 (status='반납' 또는 returnedDate 있음).
 */

import { useMemo } from 'react';
import { useState } from 'react';
import { ArrowUUpLeft, FileXls, MagnifyingGlass, Copy } from '@phosphor-icons/react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { CONTRACT_SUB } from '@/components/layout/sub-nav';
import { BottomBar } from '@/components/layout/bottom-bar';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { CompanyCell } from '@/components/ui/company-cell';
import { StatusBadge } from '@/components/ui/status-badge';
import { contractStatusTone } from '@/lib/status-tones';
import { downloadContractsExcel } from '@/lib/contract-export';
import { useVehicleDialog } from '@/lib/global-dialogs';

export default function ContractReturnPage() {
  const { contracts, loading: contractsLoading } = useContracts();
  const { companies: companyMaster } = useCompanies();
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number; row: typeof contracts[number] | null }>({ open: false, x: 0, y: 0, row: null });
  const { openVehicle } = useVehicleDialog();
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
      bottomBar={<BottomBar left={
        <button
          className="btn"
          type="button"
          disabled={rows.length === 0}
          title={`현재 페이지 목록 (${rows.length}건) 엑셀 다운로드`}
          onClick={() => downloadContractsExcel(rows, companyMaster, { title: '반납 계약', fileName: '반납계약', sheetName: '반납', filter: `${rows.length}건` })}
        >
          <FileXls size={14} weight="bold" /> 엑셀 <span className="chip-count">{rows.length}</span>
        </button>
      } right={null} />}
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
            <tr><td colSpan={8} className="muted center" style={{ padding: 32 }}>{contractsLoading ? '데이터 불러오는 중…' : '반납 계약 없음'}</td></tr>
          ) : rows.map((c) => (
            <tr key={c.id} onDoubleClick={() => c.vehiclePlate && openVehicle(c.vehiclePlate, 'contract')} onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ open: true, x: e.clientX, y: e.clientY, row: c }); }} style={{ cursor: 'pointer' }}>
              <td className="dim"><CompanyCell raw={c.company} master={companyMaster} /></td>
              <td className="mono">{c.vehiclePlate}</td>
              <td>{c.customerName}</td>
              <td className="mono">{c.contractDate}</td>
              <td className="mono dim">{c.returnScheduledDate || '-'}</td>
              <td className="mono">{c.returnedDate || '-'}</td>
              <td className="num mono" style={{ color: (c.unpaidAmount ?? 0) > 0 ? 'var(--red-text)' : undefined }}>
                ₩{(c.unpaidAmount ?? 0).toLocaleString()}
              </td>
              <td><StatusBadge tone={contractStatusTone(c.status)}>{c.status}</StatusBadge></td>
            </tr>
          ))}
        </tbody>
      </table>
      <ContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        onClose={() => setCtxMenu({ open: false, x: 0, y: 0, row: null })}
        items={ctxMenu.row ? ([
          { label: '운영현황에서 보기', icon: <MagnifyingGlass size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.vehiclePlate) window.location.href = `/?q=${encodeURIComponent(ctxMenu.row.vehiclePlate)}`; } },
          { type: 'separator' },
          { label: '차량번호 복사', icon: <Copy size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.vehiclePlate) navigator.clipboard.writeText(ctxMenu.row.vehiclePlate); } },
          { label: '계약 정보 복사', icon: <Copy size={12} weight="bold" />, onClick: () => {
            const r = ctxMenu.row;
            if (!r) return;
            navigator.clipboard.writeText(`${r.contractNo} · ${r.customerName} · ${r.vehiclePlate} · 반납 ${r.returnedDate ?? '미정'}`);
          } },
        ] satisfies ContextMenuItem[]) : []}
      />
    </MasterPageShell>
  );
}
