'use client';

/**
 * 자산 관리 — 차량 마스터 리스트.
 *
 * v4 의 /asset 자리. 차량 단위로 모든 이력(정비/사고/검사/세차/위반/보험/계약)을 모아 볼 수 있게.
 * 추후 sub-pages 로 정비·보험·할부·검사·GPS·매각·매입 디테일 분기.
 *
 * 현재 (Phase 1): 차량 리스트 + 차량별 디테일 다이얼로그.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Car, MagnifyingGlass, FileXls, Download, PencilSimple, Copy, Trash, ShoppingCart } from '@phosphor-icons/react';
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
import { ContractDocSection } from '@/components/asset/contract-doc-section';
import { useRole } from '@/lib/use-role';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from '@/lib/toast';
import { InsuranceRegisterDialog } from '@/components/insurance/insurance-register-dialog';

export default function AssetPage() {
  const router = useRouter();
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
  const [insuranceOpen, setInsuranceOpen] = useState(false);
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
      // 자산 관점에서는 휴차/임시배차/반납 등 계약 측면 status 제외 (/contract/idle 등 별도 메뉴에서)
      if (v.status && !ASSET_STATUS_SET.has(v.status)) return false;
      if (!matchesCompanyFilter(v.company, companyFilter)) return false;
      if (statusFilter !== 'all' && !groupMatch(v.status)) return false;
      if (q) {
        const hay = `${v.plate} ${v.model} ${v.vehicleMaker ?? ''} ${v.vehicleModelLine ?? ''} ${v.vehicleSubModel ?? ''} ${v.vehicleVariant ?? ''} ${v.vehicleTrim ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (a.plate ?? '').localeCompare(b.plate ?? ''));
  }, [vehicles, search, companyFilter, statusFilter]);

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <Car size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>자산 관리</span>
          </div>
          <div className="topbar-search">
            <MagnifyingGlass size={14} className="icon" />
            <input
              className="input"
              placeholder="차량번호 / 차종 / 제조사"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* 퀵필터 — 검색창 우측. 같은 페이지의 행 필터 (회사 등) */}
          <div className="filter-bar">
            <select
              className="input-compact" data-w="md"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              title="회사별 필터"
            >
              <option value="all">회사: 전체</option>
              {companyOptions.map((co) => (
                <option key={co} value={co}>{displayCompanyName(co, companyMaster)}</option>
              ))}
            </select>
          </div>

          {/* 우측 끝 — sub-page 이동 버튼 (.chip-nav) */}
          <div className="topbar-right">
            <Link href="/asset/insurance" className="chip chip-nav" title="보험증권 관리 — 회사·차량별 보험 현황, 만기 임박 알림">보험</Link>
            <Link href="/asset/loan" className="chip chip-nav" title="할부 스케줄 — 할부사·잔여원금·월납입 회차">할부</Link>
            <Link href="/asset/repair" className="chip chip-nav" title="차량 수선 — 정비공장·이력·비용">수선</Link>
            <Link href="/asset/gps" className="chip chip-nav" title="GPS 단말 — 공급사·단말번호·상태">GPS</Link>
          </div>
        </header>

        <div className="dashboard" style={{ gridTemplateColumns: '1fr' }}>
          <div className="panel">
            <div className="panel-body">
              {/* 자산관리 표 — 자산 관점 핵심 9컬럼 (등록증 디테일은 더블클릭 → 다이얼로그) */}
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
                    <th className="center" style={{ width: 84 }}>등록증</th>
                    <th style={{ width: 110 }}>보험사</th>
                    <th style={{ width: 110 }}>할부사</th>
                    <th className="num" style={{ width: 70 }}>할부개월</th>
                    <th className="num" style={{ width: 110 }}>잔여원금</th>
                    <th style={{ width: 90 }}>GPS</th>
                    <th className="center" style={{ width: 76 }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="muted center" style={{ padding: 32 }}>
                        등록된 차량 없음
                      </td>
                    </tr>
                  ) : filtered.map((v) => {
                    const regMissing = v.id.startsWith('contract-derived-') || !v.vin;
                    return (
                    <tr
                      key={v.id}
                      onClick={() => setSelectedId(v.id)}
                      onDoubleClick={() => setOpenId(v.id)}
                      style={{ cursor: 'pointer', verticalAlign: 'middle' }}
                      className={selectedId === v.id ? 'selected-row' : undefined}
                    >
                      <td className="checkbox-col"><input type="checkbox" checked={selectedIds.has(v.id)} onChange={() => toggleRow(v.id)} onClick={(e) => e.stopPropagation()} aria-label="행 선택" /></td>
                      <td>{v.company ? displayCompanyName(v.company, companyMaster) : '-'}</td>
                      <td className="mono">{v.plate || '-'}</td>
                      <td>{v.vehicleModelLine || v.model || '-'}</td>
                      <td className="center">
                        {regMissing ? (
                          <span className="status" style={{ background: 'var(--red-bg)', color: 'var(--red-text)', border: '1px solid var(--red-border)' }}>미입력</span>
                        ) : (
                          <span className="status" style={{ background: 'var(--green-bg)', color: 'var(--green-text)', border: '1px solid var(--green-border)' }}>입력완료</span>
                        )}
                      </td>
                      <td>{v.insuranceCompany || <span className="muted">-</span>}</td>
                      <td>{v.loanCompany || <span className="muted">-</span>}</td>
                      <td className="num mono">{v.loanMonths ? `${v.loanMonths}개월` : '-'}</td>
                      <td className="num mono">{v.loanRemainingPrincipal ? `₩${v.loanRemainingPrincipal.toLocaleString()}` : '-'}</td>
                      <td>{v.gpsProvider || <span className="muted">-</span>}</td>
                      <td className="center"><span className={`status ${v.status}`}>{v.status}</span></td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 하단바 — 모든 버튼은 좌측. 우측은 카톡·알림 popup 영역 (빈공간 유지) */}
        <BottomBar
          left={
            <>
              <Link className="btn btn-primary" href="/asset/purchase" title="신차 구매부터 인도까지 흐름 — 차량구매 페이지로">
                <ShoppingCart size={14} weight="bold" /> 차량구매
              </Link>
              <button className="btn" type="button" disabled={!selected} onClick={() => selected && setOpenId(selected.id)}>
                <PencilSimple size={14} weight="bold" /> 수정
              </button>
              <button
                className="btn"
                type="button"
                title="보험증권 OCR 등록 — 1회차 보험료 자동 산출"
                onClick={() => setInsuranceOpen(true)}
              >
                <FileXls size={14} weight="bold" /> 보험증권 OCR
              </button>
              <button
                className="btn"
                type="button"
                disabled={!selected}
                title="선택 행을 복제 — 새 차량 생성 (번호판 + 차종 등 그대로, ID는 신규)"
                onClick={async () => {
                  if (!selected) return;
                  if (!confirm(`'${selected.plate}' 자산을 복제하시겠습니까?`)) return;
                  try {
                    const { id: _drop, ...rest } = selected;
                    await addVehicle({ ...rest, plate: `${selected.plate}_복사` });
                    toast.success('복제 완료 — 차량번호 수정 필요');
                  } catch (e) { toast.error(`복제 실패: ${(e as Error).message}`); }
                }}
              >
                <Copy size={14} weight="bold" /> 복사
              </button>
              <button
                className="btn"
                type="button"
                disabled={!selected}
                title="선택 행 단일 삭제"
                style={{ color: selected ? 'var(--red-text)' : undefined }}
                onClick={async () => {
                  if (!selected) return;
                  if (!confirm(`'${selected.plate}' 자산을 삭제하시겠습니까? (감사로그 남음)`)) return;
                  try { await removeVehicle(selected.id); setSelectedId(null); toast.success('삭제 완료'); }
                  catch (e) { toast.error(`삭제 실패: ${(e as Error).message}`); }
                }}
              >
                <Trash size={14} weight="bold" /> 삭제
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
              <span className="btn-sep" />
              <button
                className="btn"
                type="button"
                title="현재 필터된 자산 전체 엑셀"
                onClick={async () => {
                  if (filtered.length === 0) { toast.info('내보낼 자산 없음'); return; }
                  const XLSX = await import('xlsx');
                  const rows = filtered.map((v) => ({
                    회사: v.company ?? '',
                    차량번호: v.plate ?? '',
                    차종: v.model ?? '',
                    제조사: v.vehicleMaker ?? '',
                    제작연월일: v.manufacturedDate ?? '',
                    VIN: v.vin ?? '',
                    상태: v.status ?? '',
                    매입일: v.purchasedDate ?? '',
                  }));
                  const ws = XLSX.utils.json_to_sheet(rows);
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, '자산');
                  XLSX.writeFile(wb, `자산_${filtered.length}건_${new Date().toISOString().slice(0, 10)}.xlsx`);
                }}
              >
                <FileXls size={14} weight="bold" /> 엑셀
              </button>
              <button
                className="btn"
                type="button"
                disabled={!selected}
                title={!selected ? '행 클릭으로 선택' : '선택 자산 기반 계약서 양식 다운로드'}
                onClick={async () => {
                  if (!selected) return;
                  const { downloadTemplate } = await import('@/lib/excel-template');
                  const { CONTRACT_COLUMNS } = await import('@/lib/import-schema');
                  downloadTemplate(`계약_${selected.plate}.xlsx`, CONTRACT_COLUMNS, {
                    title: `계약 등록 양식 (${selected.plate} ${selected.model ?? ''})`,
                    notes: [`· 차량번호 ${selected.plate}, 차종 ${selected.model ?? ''} 기준 양식 — 회사·계약자만 채우면 됨`],
                  });
                }}
              >
                <Download size={14} weight="bold" /> 계약 템플릿
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
            onUpdate={(v) => { void updateVehicle(v); }}
            onClose={() => setOpenId(null)}
          />
        )}

        <InsuranceRegisterDialog
          open={insuranceOpen}
          onOpenChange={setInsuranceOpen}
          vehicleId={selected?.id}
          onSaved={(p) => {
            if (selected) {
              void updateVehicle({
                ...selected,
                insuranceCompany: p.insurer ?? selected.insuranceCompany,
                insurancePolicyNo: p.policyNo ?? selected.insurancePolicyNo,
                insuranceExpiryDate: p.endDate ?? selected.insuranceExpiryDate,
              });
            }
          }}
        />
      </div>
    </div>
  );
}

/* ─────────────── 차량 상세 — 운영현황 패턴 탭 다이얼로그 ─────────────── */
function VehicleDetailDialog({
  vehicle, history, contracts, onUpdate, onClose,
}: {
  vehicle: Vehicle;
  history: HistoryEntry[];
  contracts: Contract[];
  onUpdate: (v: Vehicle) => void;
  onClose: () => void;
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
          <span className={`status ${vehicle.status}`}>{vehicle.status}</span>
        </div>
      }
      tabs={[
        { value: 'summary', label: '요약', content: <SummaryTab vehicle={vehicle} onUpdate={onUpdate} /> },
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
function SummaryTab({ vehicle, onUpdate }: { vehicle: Vehicle; onUpdate: (v: Vehicle) => void }) {
  return (
    <div className="detail-stack">
      <ContractDocSection vehicle={vehicle} onUpdate={onUpdate} />
      <section className="detail-section">
        <div className="detail-section-header">기본 정보</div>
        <div className="detail-section-body">
          <div className="detail-grid-2">
            <KV k="회사" v={vehicle.company} />
            <KV k="차량번호" v={vehicle.plate} mono />
            <KV k="차종" v={vehicle.vehicleModelLine || vehicle.model} />
            <KV k="상태" v={vehicle.status} />
            <KV k="VIN" v={vehicle.vin} mono />
            <KV k="제조사" v={vehicle.vehicleMaker} />
            <KV k="세부" v={vehicle.vehicleSubModel} />
            <KV k="트림" v={vehicle.vehicleTrim} />
            <KV k="연료" v={vehicle.fuelType} />
            <KV k="배기량" v={vehicle.displacementCc ? `${vehicle.displacementCc}cc` : undefined} />
            <KV k="승차정원" v={vehicle.seatingCapacity ? `${vehicle.seatingCapacity}인` : undefined} />
            <KV k="외부 색상" v={vehicle.exteriorColor} />
          </div>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-header">자산 정보 (보험 · 할부 · GPS)</div>
        <div className="detail-section-body">
          <div className="detail-grid-2">
            <KV k="보험사" v={vehicle.insuranceCompany} />
            <KV k="증권번호" v={vehicle.insurancePolicyNo} mono />
            <KV k="할부사" v={vehicle.loanCompany} />
            <KV k="할부개월" v={vehicle.loanMonths ? `${vehicle.loanMonths}개월` : undefined} />
            <KV k="잔여원금" v={vehicle.loanRemainingPrincipal ? `₩${vehicle.loanRemainingPrincipal.toLocaleString()}` : undefined} mono />
            <KV k="할부 개시일" v={vehicle.loanStartDate} mono />
            <KV k="GPS 공급사" v={vehicle.gpsProvider} />
            <KV k="GPS 단말번호" v={vehicle.gpsDeviceId} mono />
          </div>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-header">등록증 정보</div>
        <div className="detail-section-body">
          <div className="detail-grid-2">
            <KV k="용도" v={vehicle.vehicleUsage} />
            <KV k="형식" v={vehicle.vehicleFormat} mono />
            <KV k="원동기형식" v={vehicle.engineFormat} mono />
            <KV k="제작연월" v={vehicle.manufacturedDate} mono />
            <KV k="최초등록" v={vehicle.firstRegisteredDate} mono />
            <KV k="소유자" v={vehicle.ownerName} />
            <KV k="법인등록번호" v={vehicle.ownerRegNo} mono />
            <KV k="제원관리번호" v={vehicle.specMgmtNo} mono />
            <KV k="사용본거지" v={vehicle.garage} />
            <KV k="길이" v={vehicle.vehicleLength ? `${vehicle.vehicleLength.toLocaleString()}mm` : undefined} mono />
            <KV k="매입일" v={vehicle.purchasedDate} mono />
            <KV k="매입가" v={vehicle.purchasePrice ? `₩${vehicle.purchasePrice.toLocaleString()}` : undefined} mono />
          </div>
        </div>
      </section>
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
          <table className="table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th className="num" style={{ width: 60 }}>회차</th>
                <th>예정일</th>
                <th className="num">금액</th>
                <th className="center">상태</th>
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
                      <span className="status" style={{ background: 'var(--green-bg)', color: 'var(--green-text)', border: '1px solid var(--green-border)' }}>납입</span>
                    ) : (
                      <span className="status" style={{ background: 'var(--bg-soft)', color: 'var(--text-weak)', border: '1px solid var(--border)' }}>예정</span>
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
    </div>
  );
}

/* ─── 탭4: 계약이력 ─── */
function ContractListTab({ contracts }: { contracts: Contract[] }) {
  if (contracts.length === 0) return <div className="empty-state">계약 이력 없음</div>;
  return (
    <table className="table" style={{ fontSize: 12 }}>
      <thead>
        <tr>
          <th>계약일</th>
          <th>계약번호</th>
          <th>계약자</th>
          <th>약정</th>
          <th className="num">월대여료</th>
          <th className="num">보증금</th>
          <th>상태</th>
        </tr>
      </thead>
      <tbody>
        {contracts.map((c) => (
          <tr key={c.id}>
            <td className="mono">{c.contractDate}</td>
            <td className="mono dim">{c.contractNo}</td>
            <td>{c.customerName}</td>
            <td>{c.termMonths}개월</td>
            <td className="num mono">₩{(c.monthlyRent ?? 0).toLocaleString()}</td>
            <td className="num mono">₩{(c.deposit ?? 0).toLocaleString()}</td>
            <td><span className={`status ${c.status}`}>{c.status}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
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

  if (rows.length === 0) {
    return <div className="empty-state">수납 이력 없음. 계좌·카드 매칭으로 자동 등록됩니다.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--text-weak)' }}>
        총 {rows.length}건 · <strong style={{ color: 'var(--green-text)' }}>₩{total.toLocaleString()}</strong>
      </div>
      <table className="table" style={{ fontSize: 12 }}>
        <thead>
          <tr>
            <th>일자</th>
            <th>계약번호</th>
            <th>계약자</th>
            <th>회차</th>
            <th>경로</th>
            <th className="num">금액</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="mono">{r.date}</td>
              <td className="mono dim">{r.contractNo}</td>
              <td>{r.customer}</td>
              <td className="dim">{r.memo}</td>
              <td className="dim">{r.method}</td>
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
  if (history.length === 0) {
    return <div className="empty-state">정비·수선 이력 없음. 운영 현황 → 계약 행 → 이력 추가로 등록</div>;
  }
  const total = history.reduce((s, h) => s + (h.cost ?? 0), 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--text-weak)' }}>
        총 {history.length}건 · 누적 비용 <strong style={{ color: 'var(--red-text)' }}>₩{total.toLocaleString()}</strong>
      </div>
      <table className="table" style={{ fontSize: 12 }}>
        <thead>
          <tr>
            <th>일자</th>
            <th>분류</th>
            <th>제목</th>
            <th>업체</th>
            <th className="num">주행</th>
            <th className="num">금액</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.id}>
              <td className="mono">{h.date}</td>
              <td>{h.category}</td>
              <td>{h.title}</td>
              <td className="dim">{h.vendor ?? '-'}</td>
              <td className="num mono dim">{h.mileage ? `${h.mileage.toLocaleString()}km` : '-'}</td>
              <td className="num mono">{h.cost ? `₩${h.cost.toLocaleString()}` : '-'}</td>
              <td className="dim">{h.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KV({ k, v, mono = false }: { k: string; v?: string | number | null; mono?: boolean }) {
  return (
    <div className="detail-field">
      <div className="label">{k}</div>
      <div className={`value ${mono ? 'mono' : ''} ${v ? '' : 'muted'}`}>{v ?? '-'}</div>
    </div>
  );
}
