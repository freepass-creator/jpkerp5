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
import { Car, MagnifyingGlass, Plus, X, FileXls, Download, PencilSimple, Copy, Trash, ShoppingCart } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { SubNav, ASSET_SUB } from '@/components/layout/sub-nav';
import type { VehicleStatus } from '@/lib/types';

/**
 * 자산(차량) 관점 상태 — 휴차/임시배차/반납 등 계약 측면 상태는 제외.
 * v4 AssetStatus 와 동일한 컨셉.
 */
const ASSET_STATUS_VALUES: VehicleStatus[] = [
  '구매대기', '등록대기', '상품화대기', '상품화중', '상품대기',
  '운행', '매각대기', '매각', '정비', '사고',
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
import { useRole } from '@/lib/use-role';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AssetPage() {
  const router = useRouter();
  const { isMaster: master, loading: roleLoading } = useRole();
  useEffect(() => {
    if (!roleLoading && !master) router.replace('/');
  }, [master, roleLoading, router]);

  const { vehicles } = useVehicles();
  const { contracts } = useContracts();
  const { entries: history } = useHistoryEntries();
  const { companies: companyMaster } = useCompanies();

  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);
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

  /** v4 카운트 — 등록예정/대기/운행중/정비/매각 */
  const counts = useMemo(() => {
    const c = { 등록예정: 0, 대기: 0, 운행중: 0, 정비: 0, 매각: 0 };
    for (const v of vehicles) {
      if (!v.status || !ASSET_STATUS_SET.has(v.status)) continue;
      if (v.status === '구매대기' || v.status === '등록대기') c.등록예정++;
      else if (v.status === '상품화대기' || v.status === '상품화중' || v.status === '상품대기') c.대기++;
      else if (v.status === '운행') c.운행중++;
      else if (v.status === '정비' || v.status === '사고') c.정비++;
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
    return vehicles.filter((v) => {
      // 자산 관점에서는 휴차/임시배차/반납 등 계약 측면 status 제외 (/contract/idle 등 별도 메뉴에서)
      if (v.status && !ASSET_STATUS_SET.has(v.status)) return false;
      if (!matchesCompanyFilter(v.company, companyFilter)) return false;
      if (statusFilter !== 'all' && v.status !== statusFilter) return false;
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
            <select
              className="input-compact" data-w="md"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              title="차량 상태 필터"
            >
              <option value="all">상태: 전체</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </header>

        <SubNav items={ASSET_SUB} />

        <div className="dashboard" style={{ gridTemplateColumns: '1fr' }}>
          <div className="panel">
            <div className="panel-body">
              {/* v4 자산등록현황 컬럼 그대로 — 회사/자산코드/차량번호/차종/용도/차명/형식/제작연월/차대번호/원동기형식/사용본거지/성명(명칭)/생년월일·법인등록번호/제원관리번호/길이 */}
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}><input type="checkbox" /></th>
                    <th style={{ width: 56 }}>회사</th>
                    <th style={{ width: 110 }}>자산코드</th>
                    <th style={{ width: 96 }}>차량번호</th>
                    <th style={{ width: 96 }}>차종</th>
                    <th style={{ width: 70 }}>용도</th>
                    <th style={{ width: 100 }}>차명</th>
                    <th style={{ width: 130 }}>형식</th>
                    <th style={{ width: 84 }}>제작연월</th>
                    <th style={{ width: 160 }}>차대번호</th>
                    <th style={{ width: 90 }}>원동기형식</th>
                    <th style={{ width: 160 }}>사용본거지</th>
                    <th style={{ width: 130 }}>성명(명칭)</th>
                    <th style={{ width: 140 }}>생년월일/법인등록번호</th>
                    <th style={{ width: 130 }}>제원관리번호</th>
                    <th className="num" style={{ width: 70 }}>길이</th>
                    <th className="center" style={{ width: 76 }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={17} className="muted center" style={{ padding: 32 }}>
                        등록된 차량 없음
                      </td>
                    </tr>
                  ) : filtered.map((v) => (
                    <tr
                      key={v.id}
                      onClick={() => setSelectedId(v.id)}
                      onDoubleClick={() => setOpenId(v.id)}
                      style={{ cursor: 'pointer' }}
                      className={selectedId === v.id ? 'selected-row' : undefined}
                    >
                      <td className="center"><input type="checkbox" checked={selectedIds.has(v.id)} onChange={() => toggleRow(v.id)} onClick={(e) => e.stopPropagation()} /></td>
                      <td>{v.company || '-'}</td>
                      <td className="mono">{v.assetCode || '-'}</td>
                      <td className="mono">{v.plate || '-'}</td>
                      <td>{v.vehicleType || '-'}</td>
                      <td>{v.vehicleUsage || '-'}</td>
                      <td>{v.vehicleModelLine || v.model || '-'}</td>
                      <td className="mono dim">{v.vehicleFormat || '-'}</td>
                      <td className="mono">{v.manufacturedDate?.slice(0, 7) || '-'}</td>
                      <td className="mono dim">{v.vin || '-'}</td>
                      <td className="mono">{v.engineFormat || '-'}</td>
                      <td className="dim" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }} title={v.garage || ''}>{v.garage || '-'}</td>
                      <td>{v.ownerName || '-'}</td>
                      <td className="mono dim">{v.ownerRegNo || '-'}</td>
                      <td className="mono dim">{v.specMgmtNo || '-'}</td>
                      <td className="num mono">{v.vehicleLength ? v.vehicleLength.toLocaleString() : '-'}</td>
                      <td className="center"><span className={`status ${v.status}`}>{v.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <BottomBar
          left={
            <>
              <span>전체 <strong>{vehicles.length}</strong></span>
              <span>표시 <strong>{filtered.length}</strong></span>
              <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
              <span>등록예정 <strong>{counts.등록예정}</strong></span>
              <span>대기 <strong>{counts.대기}</strong></span>
              <span style={{ color: 'var(--brand)' }}>운행중 <strong>{counts.운행중}</strong></span>
              <span>정비 <strong>{counts.정비}</strong></span>
              <span>매각 <strong>{counts.매각}</strong></span>
              {selected && (
                <>
                  <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
                  <span>선택 <strong className="mono">{selected.plate || selected.assetCode || '-'}</strong></span>
                </>
              )}
            </>
          }
          right={
            <>
              <Link className="btn" href="/asset/purchase" title="신차 구매부터 인도까지 흐름 진행 — 차량구매 페이지로">
                <ShoppingCart size={14} weight="bold" /> 차량구매
              </Link>
              <button className="btn" type="button">
                <FileXls size={14} weight="bold" /> 엑셀
              </button>
              <button className="btn" type="button" disabled={!selected} title={!selected ? '행 클릭으로 선택' : '계약 템플릿 다운로드'}>
                <Download size={14} weight="bold" /> 계약 템플릿
              </button>
              <button className="btn" type="button" disabled={!selected} onClick={() => selected && setOpenId(selected.id)}>
                <PencilSimple size={14} weight="bold" /> 수정
              </button>
              <button className="btn" type="button" disabled={!selected}>
                <Copy size={14} weight="bold" /> 복사
              </button>
              <button className="btn" type="button" disabled={!selected}>
                <Trash size={14} weight="bold" /> 삭제
              </button>
              <button
                className="btn"
                type="button"
                disabled={selectedIds.size === 0}
                title="체크박스로 선택한 자산 일괄 삭제"
                style={{ color: selectedIds.size > 0 ? 'var(--red-text)' : undefined }}
              >
                <Trash size={14} weight="bold" /> 선택 {selectedIds.size}건 삭제
              </button>
            </>
          }
        />

        {openId && (
          <VehicleDetailDialog
            vehicle={vehicles.find((v) => v.id === openId)!}
            history={history.filter((h) => h.scope === 'vehicle' && h.vehiclePlate === vehicles.find((v) => v.id === openId)?.plate)}
            contracts={contracts.filter((c) => c.vehiclePlate === vehicles.find((v) => v.id === openId)?.plate)}
            onClose={() => setOpenId(null)}
          />
        )}
      </div>
    </div>
  );
}

/* ─────────────── 차량 상세 — 모든 이력 한 눈에 ─────────────── */
function VehicleDetailDialog({
  vehicle, history, contracts, onClose,
}: {
  vehicle: Vehicle;
  history: HistoryEntry[];
  contracts: Contract[];
  onClose: () => void;
}) {
  const sortedHistory = [...history].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const sortedContracts = [...contracts].sort((a, b) => (b.contractDate ?? '').localeCompare(a.contractDate ?? ''));

  return (
    <DialogRoot open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`자산 상세 — ${vehicle.plate || '미정'} ${vehicle.model || ''}`}>
        <DialogBody style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 기본 정보 */}
          <section className="detail-section">
            <div className="detail-section-header">기본 정보</div>
            <div className="detail-section-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px 12px', fontSize: 12 }}>
                <KV k="회사" v={vehicle.company} />
                <KV k="차량번호" v={vehicle.plate} mono />
                <KV k="차종" v={vehicle.model} />
                <KV k="상태" v={vehicle.status} />
                <KV k="VIN" v={vehicle.vin} mono />
                <KV k="제조사" v={vehicle.vehicleMaker} />
                <KV k="모델" v={vehicle.vehicleModelLine} />
                <KV k="세부" v={vehicle.vehicleSubModel} />
                <KV k="트림" v={vehicle.vehicleTrim} />
                <KV k="연료" v={vehicle.fuelType} />
                <KV k="배기량" v={vehicle.displacementCc ? `${vehicle.displacementCc}cc` : undefined} />
                <KV k="승차정원" v={vehicle.seatingCapacity ? `${vehicle.seatingCapacity}인` : undefined} />
                <KV k="외부 색상" v={vehicle.exteriorColor} />
                <KV k="내부 색상" v={vehicle.interiorColor} />
                <KV k="매입일" v={vehicle.purchasedDate} mono />
                <KV k="매입가" v={vehicle.purchasePrice ? `₩${vehicle.purchasePrice.toLocaleString()}` : undefined} mono />
                <KV k="등록일" v={vehicle.registeredDate} mono />
                <KV k="상품화일" v={vehicle.readiedDate} mono />
                <KV k="최초등록" v={vehicle.firstRegisteredDate} mono />
                <KV k="소유자" v={vehicle.ownerName} />
              </div>
            </div>
          </section>

          {/* 계약 이력 */}
          <section className="detail-section">
            <div className="detail-section-header">계약 이력 ({sortedContracts.length})</div>
            <div className="detail-section-body">
              {sortedContracts.length === 0 ? (
                <div className="empty-state">계약 이력 없음</div>
              ) : (
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
                    {sortedContracts.map((c) => (
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
              )}
            </div>
          </section>

          {/* 차량 이력 (정비/사고/검사/세차/위반/보험 등) */}
          <section className="detail-section">
            <div className="detail-section-header">차량 이력 ({sortedHistory.length})</div>
            <div className="detail-section-body">
              {sortedHistory.length === 0 ? (
                <div className="empty-state">차량 이력 없음. 운영 현황 → 계약 행 → 이력 추가로 등록</div>
              ) : (
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
                    {sortedHistory.map((h) => (
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
              )}
            </div>
          </section>
        </DialogBody>
        <div className="dialog-footer">
          <div style={{ flex: 1 }} />
          <DialogClose asChild><button className="btn">닫기</button></DialogClose>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

function KV({ k, v, mono = false }: { k: string; v?: string | number | null; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 6, fontSize: 11.5 }}>
      <span style={{ color: 'var(--text-weak)', minWidth: 60 }}>{k}</span>
      <span className={mono ? 'mono' : undefined} style={{ color: v ? 'var(--text-main)' : 'var(--text-weak)' }}>
        {v ?? '-'}
      </span>
    </div>
  );
}
