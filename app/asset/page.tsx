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
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Plus, Trash } from '@phosphor-icons/react';
import { AssetTopbar } from '@/components/asset/asset-topbar';
import * as Tabs from '@radix-ui/react-tabs';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import type { VehicleStatus } from '@/lib/types';

/**
 * 자산(차량) 관점 상태 — 휴차/임시배차/반납 등 계약 측면 상태는 제외.
 * v4 AssetStatus 와 동일한 컨셉.
 */
const ASSET_STATUS_VALUES: VehicleStatus[] = [
  '구매대기', '등록대기', '상품화대기', '상품화중', '상품대기',
  '운행', '정비', '사고',
  '매각검토', '매각대기', '매각',
];
const ASSET_STATUS_SET = new Set<string>(ASSET_STATUS_VALUES);
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { displayCompanyName } from '@/lib/company-display';
import { buildCompanyOptions, matchesCompanyFilter } from '@/lib/filter-helpers';
import type { Vehicle, Contract, HistoryEntry } from '@/lib/types';
import { DialogRoot, DialogContent, DialogBody, DialogClose } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { vehicleStatusTone } from '@/lib/status-tones';
import { useRole } from '@/lib/use-role';
import { toast } from '@/lib/toast';
import { usePersistentState } from '@/lib/use-persistent-state';
import { VehicleRegRegisterDialog } from '@/components/asset/vehicle-reg-register-dialog';
import { VehicleDetailDialog } from '@/components/asset/vehicle-detail-dialog';

export default function AssetPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialView = (searchParams.get('view') === 'registered') ? 'registered' : 'status';
  const { isMaster: master, loading: roleLoading } = useRole();
  useEffect(() => {
    if (!roleLoading && !master) router.replace('/');
  }, [master, roleLoading, router]);

  const { vehicles: rawVehicles, update: updateVehicle, remove: removeVehicle, add: addVehicle } = useVehicles();
  const { contracts } = useContracts();
  const { entries: history } = useHistoryEntries();
  const { companies: companyMaster } = useCompanies();

  /**
   * 자산관리 데이터 = vehicles(차량등록 마스터) + contracts에서 derived(등록증 미입력)
   * 운영현황과 양방향 연동: 운영현황에 있는 차량은 자산관리에도 보임.
   * 등록증/제조사 정보가 비어 있으면 "등록증 미입력" 상태로 별도 표시.
   */
  const vehicles = useMemo<Vehicle[]>(() => {
    const byPlate = new Map<string, Vehicle>();
    for (const v of rawVehicles) {
      const p = v.plate?.trim();
      if (p) byPlate.set(p, v);
    }
    for (const c of contracts) {
      const p = c.vehiclePlate?.trim();
      if (!p || byPlate.has(p)) continue;
      byPlate.set(p, {
        id: `contract-derived-${c.id}`,
        plate: p,
        model: c.vehicleModel ?? '',
        company: c.company,
        status: (c.vehicleStatus ?? '운행') as Vehicle['status'],
        createdAt: c.contractDate ?? '',
        notes: '계약에서 자동 인식 — 등록증 정보 미입력',
      } as Vehicle);
    }
    return Array.from(byPlate.values());
  }, [rawVehicles, contracts]);

  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = usePersistentState('filter:asset:company', 'all');
  const [statusFilter, setStatusFilter] = usePersistentState('filter:asset:status', 'all');
  const [openId, setOpenId] = useState<string | null>(null);
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

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
      if (v.status && !ASSET_STATUS_SET.has(v.status)) return false;
      if (!matchesCompanyFilter(v.company, companyFilter)) return false;
      if (statusFilter !== 'all' && !groupMatch(v.status)) return false;
      // 퀵필터 — 미입력 별
      if (assetQF === 'reg-missing' && !isMissing.reg(v)) return false;
      if (assetQF === 'ins-missing' && !isMissing.ins(v)) return false;
      if (assetQF === 'loan-missing' && !isMissing.loan(v)) return false;
      if (assetQF === 'gps-missing' && !isMissing.gps(v)) return false;
      if (q) {
        const hay = `${v.plate} ${v.model} ${v.vehicleMaker ?? ''} ${v.vehicleModelLine ?? ''} ${v.vehicleSubModel ?? ''} ${v.vehicleVariant ?? ''} ${v.vehicleTrim ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (a.plate ?? '').localeCompare(b.plate ?? ''));
  }, [vehicles, search, companyFilter, statusFilter, assetQF, isMissing]);

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <AssetTopbar
          currentPage={assetView}
          search={search}
          onSearchChange={setSearch}
          companyFilter={companyFilter}
          onCompanyFilterChange={setCompanyFilter}
          companyOptions={companyOptions}
          companyMaster={companyMaster}
          onViewChange={setAssetView}
          extraFilters={
            <>
              <button type="button" className={`chip ${assetQF === 'all' ? 'active' : ''}`} onClick={() => setAssetQF('all')}>
                전체<span className="chip-count">{assetCounts.all}</span>
              </button>
              <button type="button" className={`chip ${assetQF === 'reg-missing' ? 'active' : ''}`} onClick={() => setAssetQF('reg-missing')}>
                등록증 미입력{assetCounts.reg > 0 && <span className="chip-count">{assetCounts.reg}</span>}
              </button>
              <button type="button" className={`chip ${assetQF === 'ins-missing' ? 'active' : ''}`} onClick={() => setAssetQF('ins-missing')}>
                보험 미입력{assetCounts.ins > 0 && <span className="chip-count">{assetCounts.ins}</span>}
              </button>
              <button type="button" className={`chip ${assetQF === 'loan-missing' ? 'active' : ''}`} onClick={() => setAssetQF('loan-missing')}>
                구매방식 미입력{assetCounts.loan > 0 && <span className="chip-count">{assetCounts.loan}</span>}
              </button>
              <button type="button" className={`chip ${assetQF === 'gps-missing' ? 'active' : ''}`} onClick={() => setAssetQF('gps-missing')}>
                GPS 미설치{assetCounts.gps > 0 && <span className="chip-count">{assetCounts.gps}</span>}
              </button>
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
                    <th className="center" style={{ width: 64 }}>수선</th>
                    <th className="center" style={{ width: 80 }}>GPS</th>
                    <th style={{ minWidth: 220 }}>미입력 알람</th>
                    <th className="center" style={{ width: 76 }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="muted center" style={{ padding: 32 }}>등록된 차량 없음</td>
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
                    <tr key={v.id} onClick={() => setSelectedId(v.id)} onDoubleClick={() => setOpenId(v.id)} style={{ cursor: 'pointer', verticalAlign: 'middle' }} className={selectedId === v.id ? 'selected-row' : undefined}>
                      <td className="checkbox-col"><input type="checkbox" checked={selectedIds.has(v.id)} onChange={() => toggleRow(v.id)} onClick={(e) => e.stopPropagation()} aria-label="행 선택" /></td>
                      <td>{v.company ? displayCompanyName(v.company, companyMaster) : '-'}</td>
                      <td className="mono">{v.plate || '-'}</td>
                      <td>{v.vehicleModelLine || v.model || '-'}</td>
                      <td className="center">
                        {regMissing
                          ? <StatusBadge tone="red">미입력</StatusBadge>
                          : <StatusBadge tone="green">완료</StatusBadge>}
                      </td>
                      <td className="center">
                        {insMissing ? (
                          <StatusBadge tone="red">미입력</StatusBadge>
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
                          <StatusBadge tone="red">미입력</StatusBadge>
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
                      <td className="dim" style={{ fontSize: 11 }}>
                        {missing.length === 0
                          ? <span style={{ color: 'var(--green-text)' }}>✓ 모두 입력 완료</span>
                          : <span style={{ color: 'var(--red-text)' }}>● {missing.join(' · ')} 미입력</span>}
                      </td>
                      <td className="center"><StatusBadge tone={vehicleStatusTone(v.status)}>{v.status}</StatusBadge></td>
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
                    <th style={{ width: 88 }}>자산코드</th>
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
                      <td colSpan={15} className="muted center" style={{ padding: 32 }}>등록된 차량 없음</td>
                    </tr>
                  ) : filtered.map((v) => (
                    <tr key={v.id} onClick={() => setSelectedId(v.id)} onDoubleClick={() => setOpenId(v.id)} style={{ cursor: 'pointer', verticalAlign: 'middle' }} className={selectedId === v.id ? 'selected-row' : undefined}>
                      <td className="checkbox-col"><input type="checkbox" checked={selectedIds.has(v.id)} onChange={() => toggleRow(v.id)} onClick={(e) => e.stopPropagation()} aria-label="행 선택" /></td>
                      <td className="mono dim">{v.assetCode || '-'}</td>
                      <td>{v.company ? displayCompanyName(v.company, companyMaster) : '-'}</td>
                      <td className="mono">{v.plate || '-'}</td>
                      <td>{v.vehicleMaker || '-'}</td>
                      <td>{v.vehicleModelLine || v.model || '-'}</td>
                      <td className="dim">{v.vehicleSubModel || '-'}</td>
                      <td className="dim">{v.vehicleTrim || '-'}</td>
                      <td className="mono dim">{v.vin || <span className="muted">미입력</span>}</td>
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
              <button
                className="btn btn-primary"
                type="button"
                title={
                  assetView === 'registered'
                    ? '차량 등록 — 자동차등록증 OCR / 개별 입력 / 엑셀 일괄'
                    : '자산현황 등록 — 운영중인 자산의 현황 (보험·할부·GPS) 함께 등록'
                }
                onClick={() => setVehicleRegOpen(true)}
              >
                <Plus size={14} weight="bold" /> {assetView === 'registered' ? '차량 등록' : '자산현황 등록'}
              </button>
              <button
                className="btn"
                type="button"
                disabled={selectedIds.size === 0}
                title="체크박스로 선택한 자산 일괄 삭제"
                style={{ color: selectedIds.size > 0 ? 'var(--red-text)' : undefined }}
                onClick={async () => {
                  if (selectedIds.size === 0) return;
                  if (!confirm(`선택한 ${selectedIds.size}건의 자산을 삭제하시겠습니까? (감사로그 남음)`)) return;
                  for (const id of selectedIds) {
                    try { await removeVehicle(id); } catch (e) { console.error('vehicle delete failed', id, e); }
                  }
                  setSelectedIds(new Set());
                }}
              >
                <Trash size={14} weight="bold" /> 선택 {selectedIds.size}건 삭제
              </button>
            </>
          }
          right={null}
        />

        {openId && (
          <VehicleDetailDialog
            vehicle={vehicles.find((v) => v.id === openId)!}
            history={history.filter((h) => h.scope === 'vehicle' && h.vehiclePlate === vehicles.find((v) => v.id === openId)?.plate)}
            contracts={contracts.filter((c) => c.vehiclePlate === vehicles.find((v) => v.id === openId)?.plate)}
            view={assetView}
            onUpdate={(v) => { void updateVehicle(v); }}
            onClose={() => setOpenId(null)}
            onEdit={(v) => setEditVehicle(v)}
          />
        )}

        <VehicleRegRegisterDialog
          open={vehicleRegOpen || !!editVehicle}
          onOpenChange={(o) => { if (!o) { setVehicleRegOpen(false); setEditVehicle(null); } else setVehicleRegOpen(o); }}
          prefillVehicle={editVehicle}
        />
      </div>
    </div>
  );
}

