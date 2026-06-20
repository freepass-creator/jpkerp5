'use client';

/**
 * 계약 관리 — 마스터 전용 디테일 관리.
 *
 * 운영현황(/) 은 직원용 일상 슬라이스, /contract 는 마스터용 계약 마스터.
 * v4 sub-pages: /contract/customer · /contract/expire · /contract/return · /contract/overdue · /contract/schedule
 *
 * Phase 1: 계약 리스트 + 계약자별 묶음 보기.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, MagnifyingGlass, FileXls, Trash, PaperPlaneTilt, Copy, ArrowUDownLeft, X } from '@phosphor-icons/react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { ContractDetailDialog } from '@/components/contract-detail-dialog';
import { CreateDialog } from '@/components/create-dialog';
import { SmsDialog } from '@/components/sms-dialog';
import { PageShell } from '@/components/ui/page-shell';
import { useVehicleDialog } from '@/lib/global-dialogs';
import { CompanyFilter } from '@/components/ui/filter-bar';
import { useRole } from '@/lib/use-role';
import { buildCompanyOptions, matchesCompanyFilter } from '@/lib/filter-helpers';
import { CompanyCell } from '@/components/ui/company-cell';
import { useLiveTodayKr } from '@/lib/use-live-today';
import { downloadContractsExcel } from '@/lib/contract-export';
import { syncContractAndVehicleStatus } from '@/lib/firebase/contract-status-sync';
import { useRowSelection, useCtrlASelectAll } from '@/lib/use-row-selection';
import { useTableSelection } from '@/lib/use-table-selection';
import { toast } from '@/lib/toast';
import { EmptyRow } from '@/components/ui/empty-row';
import { StatusBadge } from '@/components/ui/status-badge';
import { usePersistentState } from '@/lib/use-persistent-state';
import { contractStatusTone } from '@/lib/status-tones';

export default function ContractPage() {
  const router = useRouter();
  const { isMaster: master, loading: roleLoading } = useRole();
  useEffect(() => {
    if (!roleLoading && !master) router.replace('/');
  }, [master, roleLoading, router]);

  const { contracts, loading: contractsLoading, update: updateContract, remove: removeContract } = useContracts();
  const { openVehicle } = useVehicleDialog();
  const { vehicles, update: updateVehicleMaster } = useVehicles();
  const { companies: companyMaster } = useCompanies();
  const [openId, setOpenId] = useState<string | null>(null);
  // URL ?id=CONTRACT_ID 진입 시 해당 계약 상세 자동 펼침 (감사로그 등 drill-down)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get('id');
    if (id && contracts.some((c) => c.id === id)) setOpenId(id);
  }, [contracts]);
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number; row: typeof contracts[number] | null }>({
    open: false, x: 0, y: 0, row: null,
  });

  type QuickFilter = 'all' | 'active' | 'ended' | 'normalEnded' | 'abnormalEnded' | 'expire' | 'expired' | 'return' | 'overdue';
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = usePersistentState('filter:contract:company', 'all');
  const [quickFilter, setQuickFilter] = usePersistentState<QuickFilter>('filter:contract:quick', 'active');
  // 행 선택 — lib/use-table-selection SSOT
  const sel = useTableSelection();
  const { selectedIds, setSelectedIds, toggleRow } = sel;
  const selAdapter = sel;
  const [createOpen, setCreateOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);

  // 필터/뷰 변경 시 선택 해제
  useEffect(() => sel.clear(), [search, companyFilter, quickFilter]);

  function handleExcelAll() {
    if (filtered.length === 0) { toast.info('내보낼 계약 없음'); return; }
    downloadContractsExcel(filtered, companyMaster, {
      title: '계약 리스트', fileName: '계약리스트', sheetName: '계약',
      filter: `검색결과 ${filtered.length}건`,
    });
  }
  function handleExcelSelected() {
    const targets = filtered.filter((c) => selectedIds.has(c.id));
    if (targets.length === 0) { toast.info('선택된 계약 없음'); return; }
    downloadContractsExcel(targets, companyMaster, {
      title: '계약 리스트 (선택)', fileName: '계약리스트-선택', sheetName: '계약',
      filter: `선택 ${targets.length}건`,
    });
  }
  function handleExpireGuide() {
    const targets = filtered.filter((c) => selectedIds.has(c.id));
    if (targets.length === 0) { toast.info('선택된 계약 없음'); return; }
    const lines = targets.map((c) => `${c.contractNo} · ${c.customerName} · ${c.vehiclePlate} · 만기 ${c.returnScheduledDate ?? '미정'}`).join('\n');
    navigator.clipboard.writeText(lines).then(() => toast.success(`만기 안내 ${targets.length}건 클립보드 복사`)).catch(() => toast.error('복사 실패'));
  }

  const today = useLiveTodayKr();

  const companyOptions = useMemo(
    () => buildCompanyOptions(contracts, (c) => c.company),
    [contracts],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today_ = today;
    return contracts.filter((c) => {
      if (!matchesCompanyFilter(c.company, companyFilter)) return false;
      // 퀵필터 분기
      // 라이프사이클: 유지 = 운행 / 종료 = 해지·반납·채권
      const ENDED = c.status === '해지' || c.status === '반납' || c.status === '채권';
      // 정상종료 = 종결 상태이면서 미수 없음·채권 아님 (반납·해지·매각 정상 완료)
      // 비정상종료 = 채권 OR 종결되었지만 미수 잔존
      const isAbnormalEnded = ENDED && (c.status === '채권' || (c.unpaidAmount ?? 0) > 0);
      const isNormalEnded = ENDED && !isAbnormalEnded;
      if (quickFilter === 'active') {
        if (ENDED) return false;
      } else if (quickFilter === 'ended') {
        if (!ENDED) return false;
      } else if (quickFilter === 'normalEnded') {
        if (!isNormalEnded) return false;
      } else if (quickFilter === 'abnormalEnded') {
        if (!isAbnormalEnded) return false;
      } else if (quickFilter === 'expire') {
        // 만기도래: status='운행' && returnScheduledDate D-90 이내 (아직 안 지남)
        if (c.status !== '운행') return false;
        if (!c.returnScheduledDate) return false;
        const days = Math.round((new Date(c.returnScheduledDate).getTime() - new Date(today_).getTime()) / 86400000);
        if (days < 0 || days > 90) return false;
      } else if (quickFilter === 'expired') {
        // 만기경과: status='운행' && returnScheduledDate < today (지났는데 미반납)
        if (c.status !== '운행') return false;
        if (!c.returnScheduledDate) return false;
        if (c.returnScheduledDate >= today_) return false;
      } else if (quickFilter === 'return') {
        if (c.status !== '반납') return false;
      } else if (quickFilter === 'overdue') {
        if ((c.unpaidAmount ?? 0) <= 0) return false;
      }
      if (q) {
        const hay = `${c.customerName} ${c.vehiclePlate} ${c.vehicleModel} ${c.contractNo} ${c.customerPhone1 ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    // 기본 정렬: 계약일 최신 우선 (직원이 가장 자주 보고 싶은 순)
    .sort((a, b) => (b.contractDate ?? '').localeCompare(a.contractDate ?? ''));
  }, [contracts, search, quickFilter, companyFilter, today]);

  // Ctrl/Shift+click 행선택 + Ctrl+A
  const rowSel = useRowSelection({ ids: filtered.map((c) => c.id), selection: selAdapter });
  useCtrlASelectAll(rowSel, selAdapter);

  // 각 퀵필터 카운트 — chip 라벨에 표시
  const counts = useMemo(() => {
    let expire = 0, expired = 0, ret = 0, overdue = 0, ended = 0, active = 0, all = 0;
    let normalEnded = 0, abnormalEnded = 0;
    for (const c of contracts) {
      if (!matchesCompanyFilter(c.company, companyFilter)) continue;
      all++;
      const isEnded = c.status === '해지' || c.status === '반납' || c.status === '채권';
      if (isEnded) {
        ended++;
        const isAbn = c.status === '채권' || (c.unpaidAmount ?? 0) > 0;
        if (isAbn) abnormalEnded++; else normalEnded++;
      } else active++;
      if (c.status === '운행' && c.returnScheduledDate) {
        const days = Math.round((new Date(c.returnScheduledDate).getTime() - new Date(today).getTime()) / 86400000);
        if (days >= 0 && days <= 90) expire++;
        else if (days < 0) expired++;
      }
      if (c.status === '반납') ret++;
      if ((c.unpaidAmount ?? 0) > 0) overdue++;
    }
    return { all, active, expire, expired, return: ret, overdue, ended, normalEnded, abnormalEnded };
  }, [contracts, companyFilter, today]);

  return (
    <PageShell
      menuKey="contract"
      icon={<FileText size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      topbarSearch={{ placeholder: '계약자 / 차량 / 계약번호 / 연락처', value: search, onChange: setSearch }}
      topbarFilter={
        <>
          <CompanyFilter value={companyFilter} onChange={setCompanyFilter} options={companyOptions} master={companyMaster} />
          <span className="filter-divider" />
          {/* 그룹 1: 유지(전체) + 만기도래/만기경과 */}
          <button type="button" className={`chip ${quickFilter === 'active' ? 'active' : ''}`} onClick={() => setQuickFilter('active')}>
            유지전체<span className="chip-count">{counts.active}</span>
          </button>
          {counts.expire > 0 && (
            <button type="button" className={`chip ${quickFilter === 'expire' ? 'active' : ''}`} onClick={() => setQuickFilter('expire')}>
              만기도래<span className="chip-count">{counts.expire}</span>
            </button>
          )}
          {counts.expired > 0 && (
            <button type="button" className={`chip chip-tone-orange ${quickFilter === 'expired' ? 'active' : ''}`} onClick={() => setQuickFilter('expired')}>
              만기경과<span className="chip-count">{counts.expired}</span>
            </button>
          )}
          <span style={{ width: 8 }} />
          {/* 그룹 2: 종료(전체) + 정상종료/비정상종료 */}
          <button type="button" className={`chip ${quickFilter === 'ended' ? 'active' : ''}`} onClick={() => setQuickFilter('ended')}>
            종료전체<span className="chip-count">{counts.ended}</span>
          </button>
          {counts.normalEnded > 0 && (
            <button type="button" className={`chip chip-tone-green ${quickFilter === 'normalEnded' ? 'active' : ''}`} onClick={() => setQuickFilter('normalEnded')}>
              정상종료<span className="chip-count">{counts.normalEnded}</span>
            </button>
          )}
          {counts.abnormalEnded > 0 && (
            <button type="button" className={`chip chip-tone-red ${quickFilter === 'abnormalEnded' ? 'active' : ''}`} onClick={() => setQuickFilter('abnormalEnded')}>
              비정상종료<span className="chip-count">{counts.abnormalEnded}</span>
            </button>
          )}
          <span style={{ width: 8 }} />
          <button type="button" className={`chip ${quickFilter === 'all' ? 'active' : ''}`} onClick={() => setQuickFilter('all')}>
            전체<span className="chip-count">{counts.all}</span>
          </button>
          <span className="filter-divider" />
        </>
      }
      bottomBarLeft={
        <>
          <button className="btn btn-primary" type="button" onClick={() => setCreateOpen(true)}>+ 신규 계약</button>
          <span className="btn-sep" />
          <button
            className="btn"
            type="button"
            onClick={handleExcelAll}
            disabled={filtered.length === 0}
            title={`현재 페이지 목록 (${filtered.length}건) 엑셀 다운로드`}
          >
            <FileXls size={14} weight="bold" /> 엑셀 <span className="chip-count">{filtered.length}</span>
          </button>
          <span className="btn-sep" />
          <span className="dim" style={{ fontSize: 11 }}>
            {selectedIds.size > 0 ? `선택 ${selectedIds.size}건` : '체크박스로 선택'}
          </span>
          {selectedIds.size > 0 && (
            <button
              className="btn btn-sm btn-ghost"
              type="button"
              onClick={() => setSelectedIds(new Set())}
              title="선택 모두 해제"
            >
              <X size={11} /> 해제
            </button>
          )}
          <button
            className="btn"
            type="button"
            disabled={selectedIds.size === 0}
            title="선택한 계약자에게 일괄 SMS 발송"
            onClick={() => setSmsOpen(true)}
          >
            문자 발송 {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </button>
          <button
            className="btn"
            type="button"
            disabled={selectedIds.size === 0}
            title="선택한 계약 만기 안내 (클립보드 복사)"
            onClick={handleExpireGuide}
          >
            만기 안내 {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </button>
          <button
            className="btn"
            type="button"
            disabled={selectedIds.size === 0}
            title="선택한 계약만 엑셀 다운로드"
            onClick={handleExcelSelected}
          >
            선택 엑셀 {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </button>
          <button
            className="btn"
            type="button"
            disabled={selectedIds.size === 0}
            title="체크박스로 선택한 계약 일괄 삭제 (감사로그 남음)"
            style={{ color: selectedIds.size > 0 ? 'var(--red-text)' : undefined }}
            onClick={async () => {
              if (selectedIds.size === 0) return;
              if (!confirm(`선택한 ${selectedIds.size}건의 계약을 삭제하시겠습니까? (감사로그 남음)`)) return;
              for (const id of selectedIds) {
                try { await removeContract(id); } catch (e) { console.error('contract delete failed', id, e); }
              }
              setSelectedIds(new Set());
            }}
          >
            <Trash size={14} weight="bold" /> 선택 {selectedIds.size}건 삭제
          </button>
        </>
      }
    >
              {(
                <table className="table">
                  <thead>
                    <tr>
                      <th className="checkbox-col">
                        <input
                          type="checkbox"
                          checked={filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id))}
                          ref={(el) => {
                            if (!el) return;
                            const some = filtered.some((c) => selectedIds.has(c.id));
                            const all = filtered.every((c) => selectedIds.has(c.id));
                            el.indeterminate = some && !all;
                          }}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedIds(new Set(filtered.map((c) => c.id)));
                            else setSelectedIds(new Set());
                          }}
                          aria-label="전체 선택"
                        />
                      </th>
                      <th style={{ width: 56 }}>회사</th>
                      <th style={{ width: 110 }}>계약번호</th>
                      <th style={{ width: 96 }}>차량번호</th>
                      <th style={{ minWidth: 180 }}>계약자</th>
                      <th style={{ width: 110 }}>연락처</th>
                      <th style={{ width: 90 }}>계약일</th>
                      <th style={{ width: 90 }}>만기일</th>
                      <th className="num" style={{ width: 100 }}>월대여료</th>
                      <th className="num" style={{ width: 100 }}>보증금</th>
                      <th className="center" style={{ width: 90 }} title="계약서 · 면허증 · 면허상태">서류</th>
                      <th className="center" style={{ width: 76 }}>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <EmptyRow colSpan={12}>
                        {contractsLoading ? '데이터 불러오는 중…' : '계약 없음 — 좌측 하단 [+ 신규 계약] 으로 시작하세요'}
                      </EmptyRow>
                    ) : filtered.map((c, idx) => (
                      <tr
                        key={c.id}
                        onMouseDown={rowSel.onRowMouseDown} onClick={(e) => rowSel.onRowClick(e, c.id, idx)}
                        onDoubleClick={() => openVehicle(c.vehiclePlate ?? '', 'contract')}
                        onContextMenu={(e) => rowSel.onRowContextMenu(e, c.id, idx, () => setCtxMenu({ open: true, x: e.clientX, y: e.clientY, row: c }))}
                        style={{ cursor: 'pointer' }}
                        className={selectedIds.has(c.id) ? 'selected-row' : undefined}
                      >
                        <td className="checkbox-col" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleRow(c.id)} aria-label="행 선택" />
                        </td>
                        <td><CompanyCell raw={c.company} master={companyMaster} /></td>
                        <td className="mono">{c.contractNo}</td>
                        <td className="mono">{c.vehiclePlate}</td>
                        <td>{c.customerName}</td>
                        <td className="mono dim">{c.customerPhone1 || '-'}</td>
                        <td className="mono">{c.contractDate}</td>
                        <td className="mono dim">{c.returnScheduledDate || '-'}</td>
                        <td className="num mono">₩{(c.monthlyRent ?? 0).toLocaleString()}</td>
                        <td className="num mono">₩{(c.deposit ?? 0).toLocaleString()}</td>
                        <td className="center" title={[
                          c.contractDocUrl ? '계약서 ✓' : '계약서 ✗',
                          c.customerLicenseCertUrl ? '면허증 ✓' : '면허증 ✗',
                          `면허상태: ${c.customerLicenseStatus ?? '미조회'}`,
                        ].join(' / ')}>
                          <div style={{ display: 'inline-flex', gap: 4, fontSize: 11 }}>
                            <span style={{ color: c.contractDocUrl ? 'var(--green-text)' : 'var(--text-weak)' }} title="계약서">계</span>
                            <span style={{ color: c.customerLicenseCertUrl ? 'var(--green-text)' : 'var(--text-weak)' }} title="면허증">면</span>
                            <span style={{
                              color: c.customerLicenseStatus === '정상' ? 'var(--green-text)'
                                : c.customerLicenseStatus === '미조회' || !c.customerLicenseStatus ? 'var(--text-weak)'
                                : 'var(--red-text)',
                            }} title={`면허상태: ${c.customerLicenseStatus ?? '미조회'}`}>●</span>
                          </div>
                        </td>
                        <td className="center"><StatusBadge tone={contractStatusTone(c.status)}>{c.status}</StatusBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

      <ContractDetailDialog
        contract={openId ? contracts.find((c) => c.id === openId) ?? null : null}
        open={openId != null}
        onOpenChange={(v) => !v && setOpenId(null)}
        onUpdate={(updated) => {
          // Vehicle.status 동기 + 반납 일할 자동 적용 (반납 시 마지막 회차 prorate).
          void syncContractAndVehicleStatus(updated, vehicles, updateContract, updateVehicleMaster);
        }}
      />
      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} visibleModes={['계약']} initialMode="계약" />
      <SmsDialog open={smsOpen} onOpenChange={setSmsOpen} contracts={filtered} selectedIds={selectedIds} />
      <ContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        onClose={() => setCtxMenu({ open: false, x: 0, y: 0, row: null })}
        items={ctxMenu.row ? ([
          {
            label: '상세 보기',
            icon: <MagnifyingGlass size={12} weight="bold" />,
            onClick: () => { if (ctxMenu.row) setOpenId(ctxMenu.row.id); },
          },
          { type: 'separator' },
          {
            label: 'SMS 발송',
            icon: <PaperPlaneTilt size={12} weight="bold" />,
            onClick: () => {
              if (!ctxMenu.row) return;
              setSelectedIds(new Set([ctxMenu.row.id]));
              setSmsOpen(true);
            },
          },
          {
            label: '계약 정보 복사',
            icon: <Copy size={12} weight="bold" />,
            onClick: () => {
              const r = ctxMenu.row;
              if (!r) return;
              const text = `${r.contractNo} · ${r.customerName} · ${r.vehiclePlate} · 만기 ${r.returnScheduledDate ?? '미정'}`;
              navigator.clipboard.writeText(text);
            },
          },
          { type: 'separator' },
          {
            label: '반납 처리 (오늘)',
            icon: <ArrowUDownLeft size={12} weight="bold" />,
            onClick: () => {
              const r = ctxMenu.row;
              if (!r) return;
              if (!confirm(`${r.contractNo} 반납 처리하시겠습니까? (반납일=오늘)`)) return;
              const updated = { ...r, returnedDate: new Date().toISOString().slice(0, 10), status: '반납' as const, vehicleStatus: '반납' as const };
              void syncContractAndVehicleStatus(updated, vehicles, updateContract, updateVehicleMaster);
            },
            disabled: !!ctxMenu.row.returnedDate,
          },
          { type: 'separator' },
          {
            label: '계약 삭제',
            icon: <X size={12} weight="bold" />,
            onClick: () => {
              const r = ctxMenu.row;
              if (!r) return;
              if (!confirm(`${r.contractNo} 계약을 삭제하시겠습니까? (감사로그 남음)`)) return;
              void removeContract(r.id);
            },
            danger: true,
          },
        ] satisfies ContextMenuItem[]) : []}
      />
    </PageShell>
  );
}
