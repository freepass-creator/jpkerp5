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
import { DetailDialogShell } from '@/components/ui/detail-dialog-shell';
import { AttachedFilePreview } from '@/components/ui/attached-file-preview';
import { StatusBadge } from '@/components/ui/status-badge';
import { contractStatusTone, vehicleStatusTone } from '@/lib/status-tones';
import { Field } from '@/components/ui/editable-field';
import { EmptyRow } from '@/components/ui/empty-row';
import { useRole } from '@/lib/use-role';
import { toast } from '@/lib/toast';
import { VehicleRegRegisterDialog } from '@/components/asset/vehicle-reg-register-dialog';

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
  const [companyFilter, setCompanyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
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
  const [assetQF, setAssetQF] = useState<AssetQF>('all');

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

/* ─────────────── 차량 상세 — view 별 분기 (자산현황: 모든 탭 / 등록자산: 요약만) ─────────────── */
function VehicleDetailDialog({
  vehicle, history, contracts, view, onUpdate, onClose, onEdit,
}: {
  vehicle: Vehicle;
  history: HistoryEntry[];
  contracts: Contract[];
  view: 'status' | 'registered';
  onUpdate: (v: Vehicle) => void;
  onClose: () => void;
  onEdit?: (v: Vehicle) => void;
}) {
  const sortedHistory = useMemo(() => [...history].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')), [history]);
  const sortedContracts = useMemo(() => [...contracts].sort((a, b) => (b.contractDate ?? '').localeCompare(a.contractDate ?? '')), [contracts]);

  const repairHistory = useMemo(
    () => sortedHistory.filter((h) => ['정비', '수선', '사고', '검사', '세차'].includes(h.category as string)),
    [sortedHistory],
  );

  return (
    <DetailDialogShell
      open={true}
      onOpenChange={(v) => !v && onClose()}
      title={`자산 상세 — ${vehicle.plate || '미정'} ${vehicle.model || ''}`}
      heroName={vehicle.vehicleModelLine || vehicle.model || vehicle.plate || '미정'}
      heroMeta={
        <>
          <span className="plate">{vehicle.plate || '-'}</span>
          <span>·</span>
          <span>{vehicle.vehicleMaker || '제조사 미입력'}</span>
          <span>·</span>
          <span>{vehicle.company || '회사 미지정'}</span>
          {vehicle.vin && (<><span>·</span><span style={{ fontFamily: 'var(--font-mono)' }}>{vehicle.vin}</span></>)}
        </>
      }
      heroRight={
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="dim" style={{ fontSize: 10 }}>상태</span>
          <StatusBadge tone={vehicleStatusTone(vehicle.status)}>{vehicle.status}</StatusBadge>
        </div>
      }
      onEdit={onEdit ? () => { onClose(); onEdit(vehicle); } : undefined}
      tabs={view === 'registered'
        ? [
            // 등록차량 = 제조사 스펙 + 자등증 정보 + 자등증 첨부 (단일 탭) — showAttachment true
            { value: 'summary', label: '등록차량', content: <SummaryTab vehicle={vehicle} onUpdate={onUpdate} showAttachment={true} /> },
          ]
        : [
            // 자산현황 = 전체 정보 (모든 탭). 점검 페이지 성격이라 자등증 첨부 미리보기는 숨김
            { value: 'summary', label: '요약', content: <SummaryTab vehicle={vehicle} onUpdate={onUpdate} showAttachment={false} /> },
            { value: 'loan', label: '할부스케줄', content: <LoanScheduleTab vehicle={vehicle} /> },
            { value: 'compliance', label: '보험·검사', content: <ComplianceTab vehicle={vehicle} contracts={sortedContracts} /> },
            { value: 'contract', label: `계약이력 (${sortedContracts.length})`, content: <ContractListTab contracts={sortedContracts} /> },
            { value: 'payment', label: '수납이력', content: <PaymentHistoryTab contracts={sortedContracts} /> },
            { value: 'repair', label: `정비·수선 (${repairHistory.length})`, content: <RepairHistoryTab history={repairHistory} /> },
          ]}
    />
  );
}

/* ─── KPI 카드 ─── */
function Kpi({ label, value, hint, positive }: { label: string; value: string; hint?: string; positive?: boolean }) {
  return (
    <div style={{
      padding: '10px 12px',
      background: 'var(--bg-soft)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-weak)' }}>{label}</div>
      <div style={{
        fontSize: 16,
        fontWeight: 700,
        color: positive === undefined ? 'var(--text-main)' : positive ? 'var(--green-text)' : 'var(--red-text)',
      }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: 'var(--text-weak)' }}>{hint}</div>}
    </div>
  );
}

/* ─── 탭1: 요약 — 자산정보 + 등록증정보 ─── */
function SummaryTab({ vehicle, onUpdate, showAttachment = true }: { vehicle: Vehicle; onUpdate: (v: Vehicle) => void; showAttachment?: boolean }) {
  // 등록자산 상세 = 제조사 스펙 + 자동차등록증 정보 + 자동차등록증 첨부 (3섹션).
  // 보험·할부·GPS 같은 자산 운영 정보는 각자 탭(보험·검사 / 할부스케줄)에서 노출.
  void onUpdate;
  return (
    <div className="detail-stack">
      <section className="detail-section">
        <div className="detail-section-header">제조사 스펙</div>
        <div className="detail-section-body">
          <div className="detail-grid-2">
            <KV k="회사" v={vehicle.company} />
            <KV k="차량번호" v={vehicle.plate} mono />
            <KV k="상태" v={vehicle.status} />
            <KV k="제조사" v={vehicle.vehicleMaker} />
            <KV k="모델" v={vehicle.vehicleModelLine || vehicle.model} />
            <KV k="세부모델" v={vehicle.vehicleSubModel} />
            <KV k="트림" v={vehicle.vehicleTrim} />
            <KV k="차종" v={vehicle.vehicleType} />
            <KV k="연료" v={vehicle.fuelType} />
            <KV k="배기량" v={vehicle.displacementCc ? `${vehicle.displacementCc.toLocaleString()}cc` : undefined} mono />
            <KV k="승차정원" v={vehicle.seatingCapacity ? `${vehicle.seatingCapacity}인` : undefined} />
            <KV k="외부 색상" v={vehicle.exteriorColor} />
            <KV k="내부 색상" v={vehicle.interiorColor} />
            <KV k="길이" v={vehicle.vehicleLength ? `${vehicle.vehicleLength.toLocaleString()}mm` : undefined} mono />
            <KV k="너비" v={vehicle.vehicleWidth ? `${vehicle.vehicleWidth.toLocaleString()}mm` : undefined} mono />
            <KV k="높이" v={vehicle.vehicleHeight ? `${vehicle.vehicleHeight.toLocaleString()}mm` : undefined} mono />
            <KV k="총중량" v={vehicle.totalWeight ? `${vehicle.totalWeight.toLocaleString()}kg` : undefined} mono />
          </div>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-header">자동차등록증 정보</div>
        <div className="detail-section-body">
          <div className="detail-grid-2">
            <KV k="VIN" v={vehicle.vin} mono />
            <KV k="용도" v={vehicle.vehicleUsage} />
            <KV k="형식" v={vehicle.vehicleFormat} mono />
            <KV k="원동기형식" v={vehicle.engineFormat} mono />
            <KV k="제작연월" v={vehicle.manufacturedDate} mono />
            <KV k="최초등록" v={vehicle.firstRegisteredDate} mono />
            <KV k="소유자" v={vehicle.ownerName} />
            <KV k="법인등록번호" v={vehicle.ownerRegNo} mono />
            <KV k="제원관리번호" v={vehicle.specMgmtNo} mono />
            <KV k="사용본거지" v={vehicle.garage} />
            <KV k="매입일" v={vehicle.purchasedDate} mono />
            <KV k="매입가" v={vehicle.purchasePrice ? `₩${vehicle.purchasePrice.toLocaleString()}` : undefined} mono />
          </div>
        </div>
      </section>

      {/* 원본 자동차등록증 첨부 — 등록차량 view 일 때만 (자산현황은 점검 페이지라 첨부 미리보기 없음) */}
      {showAttachment && (
        <AttachedFilePreview
          title="원본 자동차등록증"
          url={vehicle.registrationCertUrl}
          fileName={vehicle.registrationCertFileName}
          uploadedAt={vehicle.registrationCertUploadedAt}
        />
      )}
    </div>
  );
}

/* ─── 탭2: 할부스케줄 — 회차별 ─── */
function LoanScheduleTab({ vehicle }: { vehicle: Vehicle }) {
  const months = vehicle.loanMonths ?? 0;
  const start = vehicle.loanStartDate;
  const remaining = vehicle.loanRemainingPrincipal ?? 0;
  const purchasePrice = vehicle.purchasePrice ?? 0;

  // 미입력일 때 안내
  if (!vehicle.loanCompany || !months || !start) {
    return (
      <div className="empty-state">
        할부 정보 미입력. 자산 등록 시 할부사 · 개월 · 개시일을 입력하면 회차별 스케줄이 자동 생성됩니다.
      </div>
    );
  }

  // 단순 균등분할 스케줄 mock (실 데이터는 카드내역/계좌 매칭으로 확정)
  const monthly = purchasePrice && months ? Math.round(purchasePrice / months) : 0;
  const startD = new Date(start);
  const today = new Date();
  const rows = Array.from({ length: months }, (_, i) => {
    const due = new Date(startD);
    due.setMonth(due.getMonth() + i);
    const dueIso = due.toISOString().slice(0, 10);
    const paid = due < today;
    return { seq: i + 1, dueDate: dueIso, amount: monthly, paid };
  });
  const paidCount = rows.filter((r) => r.paid).length;
  const paidSum = paidCount * monthly;

  return (
    <div className="detail-stack">
      <section className="detail-section">
        <div className="detail-section-header">할부 개요</div>
        <div className="detail-section-body">
          <div className="detail-grid-2">
            <KV k="할부사" v={vehicle.loanCompany} />
            <KV k="할부개월" v={`${months}개월`} />
            <KV k="개시일" v={start} mono />
            <KV k="잔여원금" v={`₩${remaining.toLocaleString()}`} mono />
            <KV k="납입회차" v={`${paidCount} / ${months}`} />
            <KV k="누적납입" v={`₩${paidSum.toLocaleString()}`} mono />
          </div>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-header">회차별 스케줄</div>
        <div className="detail-section-body">
          <table className="table">
            <thead>
              <tr>
                <th className="num" style={{ width: 60 }}>회차</th>
                <th style={{ width: 100 }}>예정일</th>
                <th className="num" style={{ width: 110 }}>금액</th>
                <th className="center" style={{ width: 76 }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.seq}>
                  <td className="num mono">{r.seq}</td>
                  <td className="mono">{r.dueDate}</td>
                  <td className="num mono">₩{r.amount.toLocaleString()}</td>
                  <td className="center">
                    {r.paid ? (
                      <StatusBadge tone="green">납입</StatusBadge>
                    ) : (
                      <StatusBadge tone="gray">예정</StatusBadge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-weak)' }}>
            ※ 실 납입 여부는 카드내역/계좌내역 매칭으로 자동 확정 — 위는 균등분할 추정치입니다.
          </div>
        </div>
      </section>
      <AttachedFilePreview
        title="원본 할부계약서"
        url={vehicle.loanContractUrl}
        fileName={vehicle.loanContractFileName}
        uploadedAt={vehicle.loanContractUploadedAt}
      />
    </div>
  );
}

/* ─── 탭3: 보험·검사 ─── */
function ComplianceTab({ vehicle, contracts }: { vehicle: Vehicle; contracts: Contract[] }) {
  // 활성 계약에서 compliance 일자 추출
  const active = contracts.find((c) => c.status === '운행') ?? contracts[0];
  const insExp = active?.insuranceExpiryDate;
  const inspDue = active?.inspectionDueDate;
  const taxDue = active?.vehicleTaxDueDate;
  const today = new Date();
  const d = (s?: string) => s ? Math.floor((new Date(s).getTime() - today.getTime()) / 86400000) : null;

  return (
    <div className="detail-stack">
      <section className="detail-section">
        <div className="detail-section-header">자동차보험</div>
        <div className="detail-section-body">
          <div className="detail-grid-2">
            <KV k="보험사" v={vehicle.insuranceCompany} />
            <KV k="증권번호" v={vehicle.insurancePolicyNo} mono />
            <KV k="만기일" v={insExp} mono />
            <KV k="만기까지" v={d(insExp) != null ? `${d(insExp)}일` : undefined} />
          </div>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-header">정기검사 · 자동차세</div>
        <div className="detail-section-body">
          <div className="detail-grid-2">
            <KV k="다음 검사" v={inspDue} mono />
            <KV k="검사까지" v={d(inspDue) != null ? `${d(inspDue)}일` : undefined} />
            <KV k="자동차세 납기" v={taxDue} mono />
            <KV k="납기까지" v={d(taxDue) != null ? `${d(taxDue)}일` : undefined} />
          </div>
        </div>
      </section>
      <AttachedFilePreview
        title="원본 보험가입증명서"
        url={vehicle.insuranceCertUrl}
        fileName={vehicle.insuranceCertFileName}
        uploadedAt={vehicle.insuranceCertUploadedAt}
      />
      <AttachedFilePreview
        title="원본 정기검사증"
        url={vehicle.inspectionCertUrl}
        fileName={vehicle.inspectionCertFileName}
        uploadedAt={vehicle.inspectionCertUploadedAt}
      />
    </div>
  );
}

/* ─── 탭4: 계약이력 — 빈 데이터에서도 섹션(헤더+표) 구성 유지 ─── */
function ContractListTab({ contracts }: { contracts: Contract[] }) {
  const totalUnpaid = contracts.reduce((s, c) => s + (c.unpaidAmount ?? 0), 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--text-weak)' }}>
        총 {contracts.length}건{totalUnpaid > 0 && <> · 현재 미수 <strong style={{ color: 'var(--red-text)' }}>₩{totalUnpaid.toLocaleString()}</strong></>}
      </div>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 90 }}>계약일</th>
            <th style={{ width: 110 }}>계약번호</th>
            <th style={{ minWidth: 180 }}>계약자</th>
            <th className="center" style={{ width: 70 }}>약정</th>
            <th className="num" style={{ width: 110 }}>월대여료</th>
            <th className="num" style={{ width: 110 }}>보증금</th>
            <th className="center" style={{ width: 76 }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {contracts.length === 0 ? (
            <EmptyRow colSpan={7}>계약 이력 없음</EmptyRow>
          ) : contracts.map((c) => (
            <tr key={c.id}>
              <td className="mono">{c.contractDate}</td>
              <td className="mono dim">{c.contractNo || <span className="muted">-</span>}</td>
              <td>{c.customerName || <span className="muted">-</span>}</td>
              <td className="center mono dim">{c.termMonths ? `${c.termMonths}개월` : <span className="muted">-</span>}</td>
              <td className="num mono">{c.monthlyRent ? `₩${c.monthlyRent.toLocaleString()}` : <span className="muted">-</span>}</td>
              <td className="num mono">{c.deposit ? `₩${c.deposit.toLocaleString()}` : <span className="muted">-</span>}</td>
              <td className="center"><StatusBadge tone={contractStatusTone(c.status)}>{c.status}</StatusBadge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── 탭5: 수납이력 — 계약별 schedules.payments 합치기 ─── */
function PaymentHistoryTab({ contracts }: { contracts: Contract[] }) {
  type Row = { date: string; contractNo?: string; customer?: string; amount: number; method?: string; memo?: string };
  const rows: Row[] = [];
  for (const c of contracts) {
    for (const s of c.schedules ?? []) {
      for (const p of s.payments ?? []) {
        rows.push({
          date: p.date,
          contractNo: c.contractNo,
          customer: c.customerName,
          amount: p.amount,
          method: p.source,
          memo: `${s.seq}회차`,
        });
      }
    }
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));
  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--text-weak)' }}>
        {rows.length === 0
          ? '총 0건 — 계좌·카드 매칭으로 자동 등록됩니다.'
          : <>총 {rows.length}건 · <strong style={{ color: 'var(--green-text)' }}>₩{total.toLocaleString()}</strong></>}
      </div>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 90 }}>일자</th>
            <th style={{ width: 110 }}>계약번호</th>
            <th style={{ minWidth: 180 }}>계약자</th>
            <th className="center" style={{ width: 70 }}>회차</th>
            <th className="center" style={{ width: 80 }}>경로</th>
            <th className="num" style={{ width: 110 }}>금액</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={6}>수납 이력 없음</EmptyRow>
          ) : rows.map((r, i) => (
            <tr key={i}>
              <td className="mono">{r.date}</td>
              <td className="mono dim">{r.contractNo || <span className="muted">-</span>}</td>
              <td>{r.customer || <span className="muted">-</span>}</td>
              <td className="center dim">{r.memo}</td>
              <td className="center dim">{r.method || <span className="muted">-</span>}</td>
              <td className="num mono">₩{r.amount.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── 탭6: 정비·수선 ─── */
function RepairHistoryTab({ history }: { history: HistoryEntry[] }) {
  const total = history.reduce((s, h) => s + (h.cost ?? 0), 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--text-weak)' }}>
        {history.length === 0
          ? '총 0건 — 운영현황 → 계약 행 → 이력 추가로 등록'
          : <>총 {history.length}건 · 누적 비용 <strong style={{ color: 'var(--red-text)' }}>₩{total.toLocaleString()}</strong></>}
      </div>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 90 }}>일자</th>
            <th className="center" style={{ width: 70 }}>분류</th>
            <th style={{ minWidth: 180 }}>제목</th>
            <th style={{ width: 120 }}>업체</th>
            <th className="num" style={{ width: 90 }}>주행</th>
            <th className="num" style={{ width: 110 }}>금액</th>
            <th className="center" style={{ width: 76 }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {history.length === 0 ? (
            <EmptyRow colSpan={7}>정비·수선 이력 없음</EmptyRow>
          ) : history.map((h) => (
            <tr key={h.id}>
              <td className="mono">{h.date}</td>
              <td className="center"><StatusBadge tone="neutral">{h.category}</StatusBadge></td>
              <td>{h.title}</td>
              <td className="dim">{h.vendor || <span className="muted">-</span>}</td>
              <td className="num mono dim">{h.mileage ? `${h.mileage.toLocaleString()}km` : <span className="muted">-</span>}</td>
              <td className="num mono">{h.cost ? `₩${h.cost.toLocaleString()}` : <span className="muted">-</span>}</td>
              <td className="center">{h.status ? <StatusBadge tone={h.status === '완료' ? 'green' : 'blue'}>{h.status}</StatusBadge> : <span className="muted">-</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// KV — 공용 Field wrap alias (시각 통일).
function KV({ k, v, mono = false }: { k: string; v?: React.ReactNode; mono?: boolean }) {
  return <Field label={k} value={v == null || v === '' ? '-' : v} mono={mono} muted={v == null || v === ''} />;
}
