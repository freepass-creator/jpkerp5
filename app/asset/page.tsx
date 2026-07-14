'use client';

/**
 * 자산 관리 — 차량 마스터 리스트.
 *
 * v4 의 /asset 자리. 차량 단위로 모든 이력(정비/사고/검사/세차/위반/보험/계약)을 모아 볼 수 있게.
 * 추후 sub-pages 로 정비·보험·할부·검사·GPS·매각·매입 디테일 분기.
 *
 * 현재 (Phase 1): 차량 리스트 + 차량별 디테일 다이얼로그.
 */

import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Plus, Trash, FileXls, MagnifyingGlass, Copy, X } from '@phosphor-icons/react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { exportToExcel } from '@/lib/excel-export';
import { todayKr } from '@/lib/mock-data';
import { AssetTopbar } from '@/components/asset/asset-topbar';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { NewButton, ExcelButton, DeleteButton, ActionButton, ActionSep, ClearButton, PageStats } from '@/components/ui/page-actions';
import type { VehicleStatus } from '@/lib/types';

/**
 * 자산(차량) 관점 상태 — 휴차/임시배차/반납 등 계약 측면 상태는 제외.
 * v4 AssetStatus 와 동일한 컨셉.
 */
const ASSET_STATUS_VALUES: VehicleStatus[] = [
  '구매대기', '등록대기', '상품화대기', '상품화중', '상품대기',
  '휴차대기', '휴차', '운행', '정비', '사고',
  '매각검토', '매각대기', '매각',
];
/** 매각(처분·비보유) 상태 — 판 차량. 현보유 = 이것만 제외한 나머지. */
const SALE_STATUS = new Set<string>(['매각', '매각대기', '매각검토']);
const ASSET_STATUS_SET = new Set<string>(ASSET_STATUS_VALUES);
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { displayCompanyName } from '@/lib/company-display';
import { CompanyCell } from '@/components/ui/company-cell';
import { MissingBadge, MissingText } from '@/components/ui/missing-badge';
import { useRowSelection, useCtrlASelectAll } from '@/lib/use-row-selection';
import { useTableSelection } from '@/lib/use-table-selection';
import { buildCompanyOptions, matchesCompanyFilter } from '@/lib/filter-helpers';
import type { Vehicle, Contract } from '@/lib/types';
import { StatusBadge } from '@/components/ui/status-badge';
import { VehicleStateBadge } from '@/components/asset/vehicle-state-badge';
import { buildVehicleContractIndex } from '@/lib/vehicle-state';
import { vehicleStatusTone } from '@/lib/status-tones';
import { useRole } from '@/lib/use-role';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';
import { usePersistentState } from '@/lib/use-persistent-state';
import { deriveVehicleStatusFromContract } from '@/lib/plate-rules';
import { syncContractStatusFromVehicle, vehicleMatchesPlate } from '@/lib/entity-sync';
import { syncContractAndVehicleStatus } from '@/lib/firebase/contract-status-sync';
import { buildMergedVehicles } from '@/lib/use-merged-vehicles';
import { safeUpdate } from '@/lib/safe-update';
import { setVehicleAttachments } from '@/lib/firebase/vehicle-attachments-store';
import { VehicleRegRegisterDialog } from '@/components/asset/vehicle-reg-register-dialog';
import { VehicleDetailDialog } from '@/components/asset/vehicle-detail-dialog';

const ATTACHMENT_FIELDS = [
  'registrationCertUrl', 'registrationCertFileName', 'registrationCertUploadedAt',
  'insuranceCertUrl', 'insuranceCertFileName', 'insuranceCertUploadedAt',
  'loanContractUrl', 'loanContractFileName', 'loanContractUploadedAt',
] as const;

/** plate 기반 자동 결정 대상 status — 사용자 명시 상태(운행/정비/사고/매각 등)는 보존 */
const AUTO_CALCULABLE_STATUS = new Set<string>(['구매대기', '등록대기', '휴차']);

export default function AssetPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialView = (searchParams.get('view') === 'registered') ? 'registered' : 'status';
  const { isMaster: master, loading: roleLoading } = useRole();
  useEffect(() => {
    if (!roleLoading && !master) router.replace('/');
  }, [master, roleLoading, router]);

  const { vehicles: rawVehicles, loading: vehiclesLoading, update: updateVehicle, remove: removeVehicle, add: addVehicle } = useVehicles();
  const { contracts, update: updateContract } = useContracts();
  const { entries: history } = useHistoryEntries();
  const { companies: companyMaster } = useCompanies();

  /**
   * 자산관리 데이터 = vehicles(차량등록 마스터) + contracts에서 derived(등록증 미입력)
   * 운영현황과 양방향 연동: 운영현황에 있는 차량은 자산관리에도 보임.
   * 등록증/제조사 정보가 비어 있으면 "등록증 미입력" 상태로 별도 표시.
   */
  // 병합 로직 SSOT (use-merged-vehicles) — 인라인 복제 제거.
  // normPlate 키 + plateHistory 인식으로 표기차이·번호변경 유령 중복행 방지.
  const vehicles = useMemo<Vehicle[]>(() => buildMergedVehicles(rawVehicles, contracts), [rawVehicles, contracts]);
  // plate→대표계약 인덱스 1회 — 행마다 계약 전체 스캔(O(차량×계약)) 방지
  const vehContractByPlate = useMemo(() => buildVehicleContractIndex(contracts), [contracts]);

  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = usePersistentState('filter:asset:company', 'all');
  const [statusFilter, setStatusFilter] = usePersistentState('filter:asset:status', 'all');
  // URL ?company=CODE 진입 시 회사 필터 prefill (대시보드 drill-down)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get('company');
    if (c) setCompanyFilter(c);
  }, [setCompanyFilter]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openTab, setOpenTab] = useState<'operation' | 'risk' | 'asset' | 'contract' | 'payment' | 'photos'>('asset');
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number; row: Vehicle | null }>({ open: false, x: 0, y: 0, row: null });
  const [vehicleRegOpen, setVehicleRegOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const [assetView, setAssetView] = useState<'status' | 'registered'>(initialView);

  // URL ?view= 이 바뀌면 state 동기화 (sub-page 에서 [등록자산] 클릭으로 진입한 경우)
  useEffect(() => {
    const v = searchParams.get('view');
    if (v === 'registered' || v === 'status') setAssetView(v);
  }, [searchParams]);

  // URL ?plate= 또는 ?id= 로 진입 시 해당 차량 상세 dialog 자동 open (sub-page 더블클릭 진입).
  // 한 번만 처리 후 URL 에서 제거 — 새로고침/닫기 후 재오픈 방지.
  const dialogOpenedRef = React.useRef(false);
  useEffect(() => {
    if (dialogOpenedRef.current) return;
    const plate = searchParams.get('plate');
    const id = searchParams.get('id');
    if (!plate && !id) return;
    if (rawVehicles.length === 0) return; // 데이터 로드 대기

    let targetId: string | null = null;
    if (plate) {
      const target = rawVehicles.find((v) => (v.plate ?? '').replace(/\s/g, '') === plate.replace(/\s/g, ''));
      if (target) targetId = target.id;
    } else if (id) {
      targetId = id;
    }

    dialogOpenedRef.current = true;
    if (targetId) setOpenId(targetId);
    // URL 정리 — plate/id 제거하고 view 만 유지
    const v = searchParams.get('view');
    router.replace(v ? `/asset?view=${v}` : '/asset');
  }, [searchParams, rawVehicles, router]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 행 선택 — lib/use-table-selection SSOT
  const sel = useTableSelection();
  const { selectedIds, setSelectedIds, toggleRow } = sel;

  const selected = useMemo(() => vehicles.find((v) => v.id === selectedId) ?? null, [vehicles, selectedId]);

  const companyOptions = useMemo(
    () => buildCompanyOptions(vehicles, (v) => v.company),
    [vehicles],
  );

  /** 자산 관점 status 만 dropdown 노출 — 휴차/임시배차/반납 등 계약 측면 제외 */
  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const v of vehicles) {
      if (v.status && ASSET_STATUS_SET.has(v.status)) set.add(v.status);
    }
    // ASSET_STATUS_VALUES 순서 보존
    return ASSET_STATUS_VALUES.filter((s) => set.has(s));
  }, [vehicles]);

  /** v4 카운트 — 등록예정/대기/운행중/정비/매각검토/매각 */
  const counts = useMemo(() => {
    const c = { 등록예정: 0, 대기: 0, 운행중: 0, 정비: 0, 매각검토: 0, 매각: 0 };
    for (const v of vehicles) {
      if (v.id.startsWith('contract-derived-')) continue;   // 계약파생(가짜차)는 자산 아님 — 제외
      if (v.status && SALE_STATUS.has(v.status)) continue;   // 매각(처분)은 자산처분 탭 — 자산현황 카운트 제외
      if (!v.status || !ASSET_STATUS_SET.has(v.status)) continue;
      if (v.status === '구매대기' || v.status === '등록대기') c.등록예정++;
      else if (v.status === '상품화대기' || v.status === '상품화중' || v.status === '상품대기') c.대기++;
      else if (v.status === '운행') c.운행중++;
      else if (v.status === '정비' || v.status === '사고') c.정비++;
      else if (v.status === '매각검토') c.매각검토++;
      else if (v.status === '매각' || v.status === '매각대기') c.매각++;
    }
    return c;
  }, [vehicles]);


  // 차량별 수선·정비 카운트 + 최근일자 (정비/수선/사고/검사/세차 모두 집계)
  // history 는 vehiclePlate 기준 → vehicle.id 매핑은 plate lookup
  const repairByPlate = useMemo(() => {
    const m = new Map<string, { count: number; latestDate?: string; latestLabel?: string }>();
    const cats = new Set<string>(['정비', '수선', '사고', '검사', '세차']);
    for (const h of history) {
      if (!cats.has(h.category as string)) continue;
      const plate = (h.vehiclePlate ?? '').replace(/\s/g, '');
      if (!plate) continue;
      const cur = m.get(plate) ?? { count: 0 };
      cur.count += 1;
      if (!cur.latestDate || (h.date ?? '') > cur.latestDate) {
        cur.latestDate = h.date;
        cur.latestLabel = h.category as string;
      }
      m.set(plate, cur);
    }
    return m;
  }, [history]);

  // 차량별 active contract + last history
  const contractByPlate = useMemo(() => {
    const m = new Map<string, Contract>();
    for (const c of contracts) {
      const plate = (c.vehiclePlate ?? '').trim();
      if (!plate) continue;
      const cur = m.get(plate);
      if (!cur || (c.contractDate ?? '') > (cur.contractDate ?? '')) m.set(plate, c);
    }
    return m;
  }, [contracts]);

  type AssetQF = 'all' | 'reg-missing' | 'ins-missing' | 'loan-missing' | 'gps-missing';
  const [assetQF, setAssetQF] = usePersistentState<AssetQF>('filter:asset:quick', 'all');

  const isMissing = useMemo(() => ({
    reg: (v: Vehicle) => v.id.startsWith('contract-derived-') || !v.vin,
    ins: (v: Vehicle) => !v.insuranceCompany,
    loan: (v: Vehicle) => !v.loanCompany && !v.loanCashOnly,
    gps: (v: Vehicle) => !v.gpsProvider,
  }), []);

  /** 회사 필터 + 자산 status 필터 통과한 차량들에서 미입력 카운트 */
  const assetCounts = useMemo(() => {
    const base = vehicles.filter((v) => {
      if (v.id.startsWith('contract-derived-')) return false;   // 계약파생(가짜차) 제외
      if (v.status && SALE_STATUS.has(v.status)) return false;   // 매각(처분)은 자산처분 탭 — 자산관리=보유 118
      if (v.status && !ASSET_STATUS_SET.has(v.status)) return false;
      if (!matchesCompanyFilter(v.company, companyFilter)) return false;
      return true;
    });
    let reg = 0, ins = 0, loan = 0, gps = 0;
    for (const v of base) {
      if (isMissing.reg(v)) reg++;
      if (isMissing.ins(v)) ins++;
      if (isMissing.loan(v)) loan++;
      if (isMissing.gps(v)) gps++;
    }
    return { all: base.length, reg, ins, loan, gps };
  }, [vehicles, companyFilter, isMissing]);

  // 현재 선택 중인 chip 의 카운트가 0 되면 '전체' 로 자동 전환 (반응형)
  useEffect(() => {
    if (assetQF === 'reg-missing' && assetCounts.reg === 0) setAssetQF('all');
    else if (assetQF === 'ins-missing' && assetCounts.ins === 0) setAssetQF('all');
    else if (assetQF === 'loan-missing' && assetCounts.loan === 0) setAssetQF('all');
    else if (assetQF === 'gps-missing' && assetCounts.gps === 0) setAssetQF('all');
  }, [assetQF, assetCounts, setAssetQF]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const groupMatch = (status?: VehicleStatus) => {
      if (!status) return false;
      if (statusFilter === '__group_등록예정') return status === '구매대기' || status === '등록대기';
      if (statusFilter === '__group_대기') return status === '상품화대기' || status === '상품화중' || status === '상품대기';
      if (statusFilter === '__group_정비') return status === '정비' || status === '사고';
      if (statusFilter === '__group_매각') return status === '매각' || status === '매각대기';
      return status === statusFilter;
    };
    return vehicles.filter((v) => {
      if (v.id.startsWith('contract-derived-')) return false;   // 계약파생(가짜차)는 자산현황에서 제외 — 등록 차량만
      if (v.status && SALE_STATUS.has(v.status)) return false;   // 매각(처분)은 자산처분 탭에서 — 자산관리 = 현보유 118
      if (v.status && !ASSET_STATUS_SET.has(v.status)) return false;
      if (!matchesCompanyFilter(v.company, companyFilter)) return false;
      if (statusFilter !== 'all' && !groupMatch(v.status)) return false;
      // 퀵필터 — 미입력 별
      if (assetQF === 'reg-missing' && !isMissing.reg(v)) return false;
      if (assetQF === 'ins-missing' && !isMissing.ins(v)) return false;
      if (assetQF === 'loan-missing' && !isMissing.loan(v)) return false;
      if (assetQF === 'gps-missing' && !isMissing.gps(v)) return false;
      if (q) {
        const hay = `${v.plate} ${v.model} ${v.vehicleMaker ?? ''} ${v.vehicleModelLine ?? ''} ${v.vehicleSubModel ?? ''} ${v.vehicleVariant ?? ''} ${v.vehicleTrim ?? ''} ${v.vin ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (a.plate ?? '').localeCompare(b.plate ?? ''));
  }, [vehicles, search, companyFilter, statusFilter, assetQF, isMissing]);

  // Ctrl/Shift+click 행선택 + Ctrl+A 전체선택
  const rowSel = useRowSelection({ ids: filtered.map((v) => v.id), selection: sel });
  useCtrlASelectAll(rowSel, sel);

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <AssetTopbar
          currentPage={assetView}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="차량번호 / 차종 / 제조사 / VIN"
          companyFilter={companyFilter}
          onCompanyFilterChange={setCompanyFilter}
          companyOptions={companyOptions}
          companyMaster={companyMaster}
          onViewChange={setAssetView}
          extraFilters={
            <>
              {/* 전체 — 항상 표시. 나머지 chip 은 카운트 > 0 일 때만 (해당 없는/유지중이어도 숨김). */}
              <button type="button" className={`chip ${assetQF === 'all' ? 'active' : ''}`} onClick={() => setAssetQF('all')}>
                전체<span className="chip-count">{assetCounts.all}</span>
              </button>
              {assetCounts.reg > 0 && (
                <button type="button" className={`chip ${assetQF === 'reg-missing' ? 'active' : ''}`} onClick={() => setAssetQF('reg-missing')}>
                  등록증 미입력<span className="chip-count">{assetCounts.reg}</span>
                </button>
              )}
              {assetCounts.ins > 0 && (
                <button type="button" className={`chip ${assetQF === 'ins-missing' ? 'active' : ''}`} onClick={() => setAssetQF('ins-missing')}>
                  보험 미입력<span className="chip-count">{assetCounts.ins}</span>
                </button>
              )}
              {assetCounts.loan > 0 && (
                <button type="button" className={`chip ${assetQF === 'loan-missing' ? 'active' : ''}`} onClick={() => setAssetQF('loan-missing')}>
                  구매방식 미입력<span className="chip-count">{assetCounts.loan}</span>
                </button>
              )}
              {assetCounts.gps > 0 && (
                <button type="button" className={`chip ${assetQF === 'gps-missing' ? 'active' : ''}`} onClick={() => setAssetQF('gps-missing')}>
                  GPS 미설치<span className="chip-count">{assetCounts.gps}</span>
                </button>
              )}
            </>
          }
        />


        <div className="dashboard" style={{ gridTemplateColumns: '1fr' }}>
          <div className="panel">
            <div className="panel-body">
              {/* 자산관리 표 — 자산현황(운영 포괄) vs 등록자산(등록증+제조사 스펙) view 분기 */}
              {assetView === 'status' ? (
              <table className="table">
                <thead>
                  <tr>
                    <th className="checkbox-col">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && filtered.every((v) => selectedIds.has(v.id))}
                        ref={(el) => {
                          if (!el) return;
                          const some = filtered.some((v) => selectedIds.has(v.id));
                          const all = filtered.every((v) => selectedIds.has(v.id));
                          el.indeterminate = some && !all;
                        }}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(new Set(filtered.map((v) => v.id)));
                          else setSelectedIds(new Set());
                        }}
                        aria-label="전체 선택"
                      />
                    </th>
                    <th style={{ width: 56 }}>회사</th>
                    <th style={{ width: 96 }}>차량번호</th>
                    <th style={{ width: 130 }}>차종</th>
                    <th className="center" style={{ width: 90 }}>등록증</th>
                    <th className="center" style={{ width: 96 }}>보험증권</th>
                    <th className="center" style={{ width: 90 }}>구매방식</th>
                    <th className="center" style={{ width: 60 }}>수선</th>
                    <th className="center" style={{ width: 72 }}>GPS</th>
                    <th style={{ width: 230, whiteSpace: 'normal' }}>미입력 알람</th>
                    <th className="center" style={{ width: 118 }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="muted center" style={{ padding: 32 }}>
                        {vehiclesLoading ? '데이터 불러오는 중…' : '등록된 차량 없음 — 좌측 하단 [+ 차량 등록] 으로 시작하세요'}
                      </td>
                    </tr>
                  ) : filtered.map((v) => {
                    const regMissing = v.id.startsWith('contract-derived-') || !v.vin;
                    const insMissing = !v.insuranceCompany;
                    const loanMissing = !v.loanCompany && !v.loanCashOnly;
                    const gpsMissing = !v.gpsProvider;
                    const missing: string[] = [];
                    if (regMissing) missing.push('자동차등록증');
                    if (insMissing) missing.push('보험가입증명서');
                    if (loanMissing) missing.push('구매방식');
                    if (gpsMissing) missing.push('GPS');
                    return (
                    <tr key={v.id} onMouseDown={rowSel.onRowMouseDown} onClick={(e) => { setSelectedId(v.id); const idx = filtered.findIndex((x) => x.id === v.id); rowSel.onRowClick(e, v.id, idx); }} onDoubleClick={() => { setOpenTab('asset'); setOpenId(v.id); }} onContextMenu={(e) => { const idx = filtered.findIndex((x) => x.id === v.id); rowSel.onRowContextMenu(e, v.id, idx, () => setCtxMenu({ open: true, x: e.clientX, y: e.clientY, row: v })); }} style={{ cursor: 'pointer', verticalAlign: 'middle' }} className={selectedIds.has(v.id) || selectedId === v.id ? 'selected-row' : undefined}>
                      <td className="checkbox-col"><input type="checkbox" checked={selectedIds.has(v.id)} onChange={() => toggleRow(v.id)} onClick={(e) => e.stopPropagation()} aria-label="행 선택" /></td>
                      <td><CompanyCell raw={v.company} master={companyMaster} fallbackCorpRegNo={v.ownerRegNo} /></td>
                      <td className="mono">{v.plate || '-'}</td>
                      <td>{v.vehicleModelLine || v.model || '-'}</td>
                      <td className="center">
                        {regMissing
                          ? <MissingBadge />
                          : <StatusBadge tone="green">완료</StatusBadge>}
                      </td>
                      <td className="center">
                        {insMissing ? (
                          <MissingBadge />
                        ) : (() => {
                          // 만기 D-N 계산 — 30일 이내 임박은 주황, 만료는 빨강
                          const exp = v.insuranceExpiryDate;
                          let dDay: number | null = null;
                          if (exp && exp.length >= 10) {
                            const today = new Date(); today.setHours(0, 0, 0, 0);
                            const e = new Date(exp);
                            dDay = Math.round((e.getTime() - today.getTime()) / (24 * 3600 * 1000));
                          }
                          const tone: 'red' | 'orange' | 'green' = dDay == null ? 'green' : dDay < 0 ? 'red' : dDay <= 30 ? 'orange' : 'green';
                          return (
                            <StatusBadge
                              tone={tone}
                              title={[v.insuranceCompany, v.insurancePolicyNo, exp && `만기 ${exp}`].filter(Boolean).join(' · ')}
                            >
                              {dDay == null ? '완료' : dDay < 0 ? `만료 ${-dDay}일` : `D-${dDay}`}
                            </StatusBadge>
                          );
                        })()}
                      </td>
                      <td className="center">
                        {v.loanCashOnly ? (
                          <StatusBadge tone="gray" title="현금 매입">현금</StatusBadge>
                        ) : v.loanCompany ? (
                          <StatusBadge
                            tone="green"
                            title={[v.loanCompany, v.loanMonths && `${v.loanMonths}개월`, v.loanStartDate].filter(Boolean).join(' · ')}
                          >
                            {v.loanCompany}
                          </StatusBadge>
                        ) : (
                          <MissingBadge />
                        )}
                      </td>
                      <td className="center">
                        {(() => {
                          const key = (v.plate ?? '').replace(/\s/g, '');
                          const r = repairByPlate.get(key);
                          if (!r || r.count === 0) return <span className="muted">-</span>;
                          return (
                            <span
                              className="mono"
                              style={{ fontWeight: 600, color: 'var(--text-main)' }}
                              title={[r.latestLabel && `최근 ${r.latestLabel}`, r.latestDate].filter(Boolean).join(' · ')}
                            >
                              {r.count}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="center">
                        {gpsMissing ? (
                          <StatusBadge tone="red">미설치</StatusBadge>
                        ) : (
                          <StatusBadge
                            tone="green"
                            title={[v.gpsProvider, v.gpsDeviceId].filter(Boolean).join(' · ')}
                          >
                            설치
                          </StatusBadge>
                        )}
                      </td>
                      <td className="dim" style={{ fontSize: 11, whiteSpace: 'normal', lineHeight: 1.35 }}>
                        {missing.length === 0
                          ? <span style={{ color: 'var(--green-text)' }}>✓ 모두 입력 완료</span>
                          : <MissingText label={missing.join(' · ')} tone="red" />}
                      </td>
                      <td className="center"><VehicleStateBadge vehicle={v} contract={vehContractByPlate.get(v.plate ?? '') ?? null} /></td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
              ) : (
              /* 등록자산 view — 자동차등록증 + 제조사 5단 스펙 (정적 차량 정보) */
              <table className="table">
                <thead>
                  <tr>
                    <th className="checkbox-col">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && filtered.every((v) => selectedIds.has(v.id))}
                        ref={(el) => {
                          if (!el) return;
                          const some = filtered.some((v) => selectedIds.has(v.id));
                          const all = filtered.every((v) => selectedIds.has(v.id));
                          el.indeterminate = some && !all;
                        }}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(new Set(filtered.map((v) => v.id)));
                          else setSelectedIds(new Set());
                        }}
                        aria-label="전체 선택"
                      />
                    </th>
                    <th style={{ width: 56 }}>회사</th>
                    <th style={{ width: 96 }}>차량번호</th>
                    <th style={{ width: 80 }}>제조사</th>
                    <th style={{ width: 110 }}>모델</th>
                    <th style={{ width: 130 }}>세부모델</th>
                    <th style={{ width: 80 }}>트림</th>
                    <th className="mono" style={{ width: 140 }}>VIN</th>
                    <th className="mono" style={{ width: 100 }}>제작연월일</th>
                    <th className="num" style={{ width: 70 }}>배기량</th>
                    <th className="num" style={{ width: 60 }}>승차</th>
                    <th style={{ width: 80 }}>연료</th>
                    <th style={{ width: 90 }}>형식</th>
                    <th style={{ width: 90 }}>원동기형식</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="muted center" style={{ padding: 32 }}>
                        {vehiclesLoading ? '데이터 불러오는 중…' : '등록된 차량 없음 — 좌측 하단 [+ 차량 등록] 으로 시작하세요'}
                      </td>
                    </tr>
                  ) : filtered.map((v) => (
                    <tr key={v.id} onMouseDown={rowSel.onRowMouseDown} onClick={(e) => { setSelectedId(v.id); const idx = filtered.findIndex((x) => x.id === v.id); rowSel.onRowClick(e, v.id, idx); }} onDoubleClick={() => { setOpenTab('asset'); setOpenId(v.id); }} onContextMenu={(e) => { const idx = filtered.findIndex((x) => x.id === v.id); rowSel.onRowContextMenu(e, v.id, idx, () => setCtxMenu({ open: true, x: e.clientX, y: e.clientY, row: v })); }} style={{ cursor: 'pointer', verticalAlign: 'middle' }} className={selectedIds.has(v.id) || selectedId === v.id ? 'selected-row' : undefined}>
                      <td className="checkbox-col"><input type="checkbox" checked={selectedIds.has(v.id)} onChange={() => toggleRow(v.id)} onClick={(e) => e.stopPropagation()} aria-label="행 선택" /></td>
                      <td><CompanyCell raw={v.company} master={companyMaster} fallbackCorpRegNo={v.ownerRegNo} /></td>
                      <td className="mono">{v.plate || '-'}</td>
                      <td>{v.vehicleMaker || '-'}</td>
                      <td>{v.vehicleModelLine || v.model || '-'}</td>
                      <td className="dim">{v.vehicleSubModel || '-'}</td>
                      <td className="dim">{v.vehicleTrim || '-'}</td>
                      <td className="mono dim">{v.vin || <MissingText label="VIN" />}</td>
                      <td className="mono dim">{v.manufacturedDate || '-'}</td>
                      <td className="num mono">{v.displacementCc ? `${v.displacementCc.toLocaleString()}cc` : '-'}</td>
                      <td className="num mono dim">{v.seatingCapacity ? `${v.seatingCapacity}인` : '-'}</td>
                      <td className="dim">{v.fuelType || '-'}</td>
                      <td className="mono dim">{v.vehicleFormat || '-'}</td>
                      <td className="mono dim">{v.engineFormat || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
          </div>
        </div>

        {/* 하단바 — 단순화: [+ 등록] + [선택 N건 삭제] 만. 수정은 더블클릭 → 상세 dialog */}
        <BottomBar
          left={
            <>
              <NewButton
                label={assetView === 'registered' ? '차량 등록' : '자산현황 등록'}
                onClick={() => setVehicleRegOpen(true)}
                title={assetView === 'registered'
                  ? '차량 등록 — 자동차등록증 OCR / 개별 입력 / 엑셀 일괄'
                  : '자산현황 등록 — 운영중인 자산의 현황 (보험·할부·GPS) 함께 등록'}
              />
              <ActionSep />
              {/* 일괄 상태 변경 — 선택된 자산의 status 를 한 번에 변경 + 같은 plate 계약 sync */}
              <select
                className="input input-compact"
                disabled={selectedIds.size === 0}
                value=""
                title={selectedIds.size === 0 ? '체크박스로 자산 선택 후 일괄 상태 변경' : `선택 ${selectedIds.size}건 → 상태 일괄 변경`}
                style={{ fontSize: 12, minWidth: 130 }}
                onChange={async (e) => {
                  const next = e.target.value as Vehicle['status'];
                  e.currentTarget.value = '';   // reset (select-once UX)
                  if (!next || selectedIds.size === 0) return;
                  // 합성 contract-derived 자산 제외 — 실 vehicles 노드에 있는 것만 업데이트 가능
                  const targets = vehicles.filter((v) => selectedIds.has(v.id) && !v.id.startsWith('contract-derived-'));
                  const synthetic = selectedIds.size - targets.length;
                  if (targets.length === 0) {
                    toast.info(`선택 ${selectedIds.size}건이 모두 자동 인식 자산 — 상태 변경 대상 아님, 해당 계약에서 처리`);
                    return;
                  }
                  const note = synthetic > 0 ? `\n(자동 인식 ${synthetic}건은 제외됨)` : '';
                  if (!await showConfirm({ title: `선택한 ${targets.length}건의 자산 상태를 '${next}' 로 변경합니다.\n같은 plate 의 활성 계약 vehicleStatus 도 함께 sync 됩니다.${note}\n계속?` })) return;
                  let changed = 0, syncedContracts = 0;
                  for (const v of targets) {
                    if (v.status === next) continue;
                    // 매각 전환 시 saleDate stamp — 없으면 자산대장 감가가 오늘까지 계속 진행돼 장부가·처분손익 왜곡
                    const saleDate = next === '매각' && !v.saleDate ? todayKr() : v.saleDate;
                    const merged = { ...v, status: next, saleDate };
                    try {
                      await updateVehicle(merged);
                      changed++;
                      const r = await syncContractStatusFromVehicle(merged, contracts, updateContract);
                      syncedContracts += r.updatedCount;
                    } catch (err) { console.error('bulk status failed', v.id, err); }
                  }
                  toast.success(`${changed}대 → ${next}${syncedContracts > 0 ? ` · 계약 ${syncedContracts}건 sync` : ''}`);
                  setSelectedIds(new Set());
                }}
              >
                <option value="">선택 상태 변경…</option>
                <option value="구매대기">구매대기</option>
                <option value="등록대기">등록대기</option>
                <option value="상품대기">상품대기</option>
                <option value="운행">운행</option>
                <option value="휴차대기">휴차대기</option>
                <option value="휴차">휴차</option>
                <option value="정비">정비</option>
                <option value="사고">사고</option>
                <option value="매각검토">매각검토</option>
                <option value="매각대기">매각대기</option>
                <option value="매각">매각</option>
              </select>
              <ExcelButton
                count={selectedIds.size > 0 ? selectedIds.size : filtered.length}
                disabled={filtered.length === 0}
                title={selectedIds.size > 0
                  ? `선택한 ${selectedIds.size}건만 엑셀 다운로드 (체크 해제 시 전체 ${filtered.length}건)`
                  : `현재 페이지 목록 (${filtered.length}건) 엑셀 다운로드`}
                onClick={() => {
                  const targetRows = selectedIds.size > 0
                    ? filtered.filter((v) => selectedIds.has(v.id))
                    : filtered;
                  const scope = selectedIds.size > 0 ? `선택 ${selectedIds.size}건` : `${filtered.length}건`;
                  exportToExcel({
                    title: `자산 ${assetView === 'registered' ? '등록차량' : '자산현황'}${companyFilter !== 'all' ? ` (${companyFilter})` : ''} — ${scope}`,
                    fileName: `자산-${assetView === 'registered' ? '등록차량' : '자산현황'}${selectedIds.size > 0 ? '-선택' : ''}`,
                    sheetName: '자산',
                    rows: targetRows.map((v) => ({
                      회사: v.company ? displayCompanyName(v.company, companyMaster) : '',
                      차량번호: v.plate ?? '',
                      차종: v.model ?? '',
                      VIN: v.vin ?? '',
                      제작연월: v.manufacturedDate ?? '',
                      상태: v.status ?? '',
                      매입가: v.purchasePrice ?? '',
                    })),
                    columns: [
                      { key: '회사', header: '회사', width: 14 },
                      { key: '차량번호', header: '차량번호', width: 14, type: 'mono' },
                      { key: '차종', header: '차종', width: 20 },
                      { key: 'VIN', header: 'VIN', width: 18, type: 'mono' },
                      { key: '제작연월', header: '제작연월', width: 12, type: 'mono' },
                      { key: '상태', header: '상태', width: 12, type: 'center' },
                      { key: '매입가', header: '매입가', width: 14, type: 'number' },
                    ],
                  });
                }}
              />
              <ActionButton
                label="상태 자동 결정"
                title="차량번호 기반 자동 결정 — 정상 plate → 휴차 / 임판 → 등록대기 / 빈값 → 구매대기 (사용자가 명시 설정한 운행·정비·사고·매각 등은 보존)"
                onClick={async () => {
                  const targets = rawVehicles.filter((v) => AUTO_CALCULABLE_STATUS.has(v.status));
                  if (targets.length === 0) {
                    toast.info('자동 결정 대상 없음 — 모든 차량이 사용자 명시 상태');
                    return;
                  }
                  if (!await showConfirm({ title: `자동 결정 대상 ${targets.length}대 — 차량번호로 휴차/등록대기/구매대기 재계산.\n사용자 명시 상태(운행/정비/사고/매각 등)는 보존.\n계속?` })) return;
                  let changed = 0;
                  let syncedContracts = 0;
                  for (const v of targets) {
                    const next = deriveVehicleStatusFromContract(v.plate);
                    if (next !== v.status) {
                      const merged = { ...v, status: next };
                      try {
                        await updateVehicle(merged);
                        changed++;
                        const r = await syncContractStatusFromVehicle(merged, contracts, updateContract);
                        syncedContracts += r.updatedCount;
                      } catch (e) { console.error('status auto failed', v.id, e); }
                    }
                  }
                  toast.success(`${changed}대 상태 자동 결정 완료 (대상 ${targets.length}대 중)${syncedContracts > 0 ? ` · 계약 ${syncedContracts}건 sync` : ''}`);
                }}
              />
              <ActionSep />
              <DeleteButton
                count={selectedIds.size}
                title="체크박스로 선택한 자산 일괄 삭제"
                onClick={async () => {
                  if (selectedIds.size === 0) return;
                  // 합성 contract-derived 자산 제외 — 실 vehicles 노드에 있는 것만 삭제 가능
                  const realIds = Array.from(selectedIds).filter((id) => !id.startsWith('contract-derived-'));
                  const synthetic = selectedIds.size - realIds.length;
                  if (realIds.length === 0) {
                    toast.info(`선택 ${selectedIds.size}건이 모두 자동 인식 자산 — 해당 계약에서 처리하세요`);
                    return;
                  }
                  const note = synthetic > 0 ? `\n(자동 인식 ${synthetic}건은 제외됨)` : '';
                  if (!await showConfirm({ title: `선택한 ${realIds.length}건의 자산을 삭제하시겠습니까? (감사로그 남음)${note}`, danger: true })) return;
                  let ok = 0, fail = 0;
                  for (const id of realIds) {
                    try { await removeVehicle(id); ok++; } catch (e) { console.error('vehicle delete failed', id, e); fail++; }
                  }
                  setSelectedIds(new Set());
                  if (fail > 0) toast.error(`${ok}건 삭제, ${fail}건 실패`);
                  else toast.success(`${ok}건 삭제`);
                }}
              />
              {selectedIds.size > 0 && <ClearButton count={selectedIds.size} onClick={() => setSelectedIds(new Set())} />}
            </>
          }
          right={
            <PageStats total={filtered.length} totalLabel="표시" selectedCount={selectedIds.size} />
          }
        />

        {openId && (() => {
          const openVehicle = vehicles.find((v) => v.id === openId);
          // 열려있는 동안 차량 소실(타 세션 삭제·합성id→실id 전환) 시 크래시(undefined.plate) 대신 미표시
          if (!openVehicle) return null;
          return (
          <VehicleDetailDialog
            vehicle={openVehicle}
            history={history.filter((h) => h.scope === 'vehicle' && vehicleMatchesPlate(openVehicle, h.vehiclePlate))}
            contracts={contracts.filter((c) => vehicleMatchesPlate(openVehicle, c.vehiclePlate))}
            view={assetView}
            initialTab={openTab}
            onUpdate={(v) => {
              void safeUpdate(async () => {
                await updateVehicle(v);
                await syncContractStatusFromVehicle(v, contracts, updateContract);
              }, { onConflict: () => setOpenId(null) });
            }}
            onUpdateContract={(c) => {
              // 정본 동기 헬퍼로 — 계약 저장 + 차량마스터 status 동기 + (정상반납 시)일할정산 + 감사.
              // rawVehicles/updateVehicle = 실 Vehicle 노드(병합 synthetic 아님). onConflict 로 락충돌 표면화.
              void safeUpdate(() => syncContractAndVehicleStatus(c, rawVehicles, updateContract, updateVehicle), { onConflict: () => setOpenId(null) });
            }}
            onClose={() => setOpenId(null)}
            onEdit={(v) => setEditVehicle(v)}
          />
          );
        })()}

        <VehicleRegRegisterDialog
          open={vehicleRegOpen || !!editVehicle}
          onOpenChange={(o) => { if (!o) { setVehicleRegOpen(false); setEditVehicle(null); } else setVehicleRegOpen(o); }}
          prefillVehicle={editVehicle}
        />
        <ContextMenu
          open={ctxMenu.open}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu({ open: false, x: 0, y: 0, row: null })}
          items={ctxMenu.row ? ([
            { label: '차량 상세', icon: <MagnifyingGlass size={12} weight="bold" />, onClick: () => { if (ctxMenu.row) { setOpenTab('asset'); setOpenId(ctxMenu.row.id); } } },
            { label: '운영 현황', icon: <MagnifyingGlass size={12} weight="bold" />, onClick: () => { if (ctxMenu.row) { setOpenTab('operation'); setOpenId(ctxMenu.row.id); } } },
            { label: '리스크 현황', icon: <MagnifyingGlass size={12} weight="bold" />, onClick: () => { if (ctxMenu.row) { setOpenTab('risk'); setOpenId(ctxMenu.row.id); } } },
            { label: '계약 이력', icon: <MagnifyingGlass size={12} weight="bold" />, onClick: () => { if (ctxMenu.row) { setOpenTab('contract'); setOpenId(ctxMenu.row.id); } } },
            { label: '수납 관리', icon: <MagnifyingGlass size={12} weight="bold" />, onClick: () => { if (ctxMenu.row) { setOpenTab('payment'); setOpenId(ctxMenu.row.id); } } },
            { type: 'separator' },
            { label: '차량번호 복사', icon: <Copy size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.plate) navigator.clipboard.writeText(ctxMenu.row.plate); } },
            { label: 'VIN 복사', icon: <Copy size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.vin) navigator.clipboard.writeText(ctxMenu.row.vin); }, disabled: !ctxMenu.row.vin },
            { type: 'separator' },
            {
              label: '차량 삭제',
              icon: <X size={12} weight="bold" />,
              onClick: async () => {
                const r = ctxMenu.row;
                if (!r) return;
                // 합성 contract-derived 행은 vehicles 노드에 없어 삭제해도 무동작 + 허위 감사로그만 남음
                if (r.id.startsWith('contract-derived-')) {
                  toast.info('자동 인식 자산 — 해당 계약에서 처리하세요');
                  return;
                }
                if (!await showConfirm({ title: `${r.plate ?? r.id} 차량을 삭제하시겠습니까? (감사로그 남음)`, danger: true })) return;
                try { await removeVehicle(r.id); toast.success('차량 삭제됨'); }
                catch (e) { toast.error(`삭제 실패: ${(e as Error).message ?? String(e)}`); }
              },
              danger: true,
            },
          ] satisfies ContextMenuItem[]) : []}
        />
      </div>
    </div>
  );
}

