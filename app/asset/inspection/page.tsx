'use client';

/**
 * /asset/inspection — 검사 내역 + 검사 만기 추적.
 * Contract.inspectionDueDate 기반 만기 임박/경과 자산 노출 + 검사 이력 (HistoryEntry category='검사').
 */

import { useMemo, useState } from 'react';
import { ClipboardText, FileXls, MagnifyingGlass, Copy } from '@phosphor-icons/react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { useTableSelection } from '@/lib/use-table-selection';
import { useRowSelection, useCtrlASelectAll } from '@/lib/use-row-selection';
import { TableHeaderCheckbox, TableRowCheckbox } from '@/components/ui/table-checkbox';
import { exportToExcel } from '@/lib/excel-export';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { ASSET_SUB } from '@/components/layout/sub-nav';
import { BottomBar } from '@/components/layout/bottom-bar';
import { EmptyRow } from '@/components/ui/empty-row';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { displayCompanyName } from '@/lib/company-display';
import { useLiveTodayKr } from '@/lib/use-live-today';
import { useVehicleDialog } from '@/lib/global-dialogs';

export default function AssetInspectionPage() {
  const { contracts, loading: contractsLoading } = useContracts();
  const { entries: history } = useHistoryEntries();
  const { vehicles } = useVehicles();
  const { companies: companyMaster } = useCompanies();
  const today = useLiveTodayKr();
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; plate?: string; phone?: string; due?: string; customerName?: string } | null>(null);
  const sel = useTableSelection();
  const { openVehicle } = useVehicleDialog();

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

  const rowSel = useRowSelection({ ids: upcoming.map((u) => u.c.id), selection: sel });
  useCtrlASelectAll(rowSel, sel);

  return (
    <MasterPageShell
      title="검사내역"
      icon={<ClipboardText size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      subNav={ASSET_SUB}
      stats={
        <>
          <span>만기 추적<strong>{upcoming.length}</strong></span>
          <span style={{ color: 'var(--red-text)' }}>경과<strong>{overdue.length}</strong></span>
          <span style={{ color: 'var(--orange-text, #c2410c)' }}>D-30<strong>{within30.length}</strong></span>
          <span className="sep" />
          <span>검사 이력<strong>{inspectionEvents.length}</strong></span>
        </>
      }
      bottomBar={
        <BottomBar
          left={<button className="btn btn-primary" type="button">+ 검사 등록</button>}
          right={
            <button
              className="btn"
              type="button"
              disabled={upcoming.length === 0 && inspectionEvents.length === 0}
              title={sel.size > 0
                ? `선택한 ${sel.size}건 (만기 추적만) 엑셀 다운로드 — 선택 해제 시 전체`
                : `현재 페이지 목록 (${upcoming.length + inspectionEvents.length}건) 엑셀 다운로드`}
              onClick={() => {
                const upcomingFiltered = sel.size > 0
                  ? upcoming.filter(({ c }) => sel.selectedIds.has(c.id))
                  : upcoming;
                const eventsFiltered = sel.size > 0 ? [] : inspectionEvents;   // 선택 모드면 이력은 제외
                const scope = sel.size > 0 ? `선택 ${sel.size}건` : `${upcoming.length + inspectionEvents.length}건`;
                const rows = [
                  ...upcomingFiltered.map(({ c, daysLeft }) => ({
                    구분: '만기 추적',
                    회사: c.company ? displayCompanyName(c.company, companyMaster) : '',
                    차량번호: c.vehiclePlate ?? '',
                    차종: c.vehicleModel ?? '',
                    예정일: c.inspectionDueDate ?? '',
                    DN: daysLeft,
                    이력일: '',
                    항목: '',
                    업체: '',
                    비용: '',
                  })),
                  ...eventsFiltered.map((h) => ({
                    구분: '검사 이력',
                    회사: '',
                    차량번호: h.vehiclePlate ?? '',
                    차종: '',
                    예정일: '',
                    DN: '',
                    이력일: h.date ?? '',
                    항목: h.title ?? '',
                    업체: h.vendor ?? '',
                    비용: h.cost ?? '',
                  })),
                ];
                exportToExcel({
                  title: `검사 내역 — ${scope}`,
                  fileName: `검사내역${sel.size > 0 ? '-선택' : ''}`,
                  sheetName: '검사',
                  rows,
                  columns: [
                    { key: '구분', header: '구분', width: 12, type: 'center' },
                    { key: '회사', header: '회사', width: 14 },
                    { key: '차량번호', header: '차량번호', width: 14, type: 'mono' },
                    { key: '차종', header: '차종', width: 18 },
                    { key: '예정일', header: '예정일', width: 14, type: 'date' },
                    { key: 'DN', header: 'D-N', width: 8, type: 'number' },
                    { key: '이력일', header: '이력일', width: 14, type: 'date' },
                    { key: '항목', header: '항목', width: 18 },
                    { key: '업체', header: '업체', width: 16 },
                    { key: '비용', header: '비용', width: 14, type: 'number' },
                  ],
                });
              }}
            >
              <FileXls size={14} weight="bold" /> 엑셀 <span className="chip-count">{sel.size > 0 ? sel.size : upcoming.length + inspectionEvents.length}</span>
            </button>
          }
        />
      }
    >
      <section style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>정기검사 만기 추적</h3>
        <table className="table">
          <thead>
            <tr>
              <TableHeaderCheckbox selection={sel} ids={upcoming.map((u) => u.c.id)} />
              <th style={{ width: 60 }}>회사</th>
              <th style={{ width: 96 }}>차량번호</th>
              <th>차종</th>
              <th>계약자</th>
              <th className="mono" style={{ width: 110 }}>검사 만기</th>
              <th className="center" style={{ width: 90 }}>D-N</th>
            </tr>
          </thead>
          <tbody>
            {upcoming.length === 0 ? (
              <EmptyRow colSpan={7}>{contractsLoading ? '데이터 불러오는 중…' : '등록된 검사 만기 없음'}</EmptyRow>
            ) : upcoming.map(({ c, daysLeft }) => {
              const tone = daysLeft < 0 ? 'red' : daysLeft <= 30 ? 'orange' : '';
              const label = daysLeft < 0 ? `만기 ${-daysLeft}일 경과` : daysLeft === 0 ? '오늘 만기' : `D-${daysLeft}`;
              return (
                <tr key={c.id} onClick={(e) => rowSel.onRowClick(e, c.id, upcoming.findIndex((u) => u.c.id === c.id))} onDoubleClick={() => c.vehiclePlate && openVehicle(c.vehiclePlate, 'asset')} onContextMenu={(e) => rowSel.onRowContextMenu(e, c.id, upcoming.findIndex((u) => u.c.id === c.id), () => setCtxMenu({ x: e.clientX, y: e.clientY, plate: c.vehiclePlate, phone: c.customerPhone1, due: c.inspectionDueDate, customerName: c.customerName }))} style={{ cursor: 'pointer' }} className={sel.selectedIds.has(c.id) ? 'selected-row' : undefined}>
                  <TableRowCheckbox id={c.id} selection={sel} />
                  <td className="dim">{c.company ? displayCompanyName(c.company, companyMaster) : '-'}</td>
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
              <th style={{ width: 96 }}>차량번호</th>
              <th>제목</th>
              <th style={{ width: 140 }}>업체</th>
              <th className="num" style={{ width: 100 }}>금액</th>
              <th style={{ width: 64 }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {inspectionEvents.length === 0 ? (
              <EmptyRow colSpan={6}>검사 이력 없음</EmptyRow>
            ) : inspectionEvents.map((h) => (
              <tr key={h.id} onDoubleClick={() => h.vehiclePlate && openVehicle(h.vehiclePlate, 'asset')} onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, plate: h.vehiclePlate }); }} style={{ cursor: 'pointer' }}>
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

      <ContextMenu
        open={!!ctxMenu}
        x={ctxMenu?.x ?? 0}
        y={ctxMenu?.y ?? 0}
        onClose={() => setCtxMenu(null)}
        items={ctxMenu ? (() => {
          const it: ContextMenuItem[] = [
            { label: '차량 상세', icon: <MagnifyingGlass size={12} weight="bold" />, onClick: () => { if (ctxMenu.plate) openVehicle(ctxMenu.plate, 'asset'); }, disabled: !ctxMenu.plate },
            { type: 'separator' },
          ];
          if (ctxMenu.plate) it.push({ label: '차량번호 복사', icon: <Copy size={12} weight="bold" />, onClick: () => navigator.clipboard.writeText(ctxMenu.plate!) });
          if (ctxMenu.phone) it.push({ label: '계약자 연락처 복사', icon: <Copy size={12} weight="bold" />, onClick: () => navigator.clipboard.writeText(ctxMenu.phone!) });
          if (ctxMenu.due) it.push({ label: '검사 안내 복사', icon: <Copy size={12} weight="bold" />, onClick: () => navigator.clipboard.writeText(`${ctxMenu.customerName ?? '계약자'} 님, ${ctxMenu.plate ?? ''} 차량 정기검사 만기 ${ctxMenu.due} 입니다. 검사 협의 부탁드립니다.`) });
          return it;
        })() : []}
      />
    </MasterPageShell>
  );
}
