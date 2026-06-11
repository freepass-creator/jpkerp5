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
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, MagnifyingGlass, ArrowLeft } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { ContractDetailDialog } from '@/components/contract-detail-dialog';
import { CreateDialog } from '@/components/create-dialog';
import { SmsDialog } from '@/components/sms-dialog';
import { PageShell } from '@/components/ui/page-shell';
import { CompanyFilter } from '@/components/ui/filter-bar';
import { useRole } from '@/lib/use-role';
import { buildCompanyOptions, matchesCompanyFilter } from '@/lib/filter-helpers';
import { displayCompanyName } from '@/lib/company-display';
import { todayKr } from '@/lib/mock-data';
import { downloadContractsExcel } from '@/lib/contract-export';
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

  const { contracts, update: updateContract } = useContracts();
  const { companies: companyMaster } = useCompanies();
  const [openId, setOpenId] = useState<string | null>(null);

  type QuickFilter = 'all' | 'active' | 'ended' | 'expire' | 'return' | 'overdue';
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = usePersistentState('filter:contract:company', 'all');
  const [quickFilter, setQuickFilter] = usePersistentState<QuickFilter>('filter:contract:quick', 'active');
  const [groupBy, setGroupBy] = usePersistentState<'list' | 'customer'>('filter:contract:groupBy', 'list');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);

  // 필터/뷰 변경 시 선택 해제
  useEffect(() => setSelectedIds(new Set()), [search, companyFilter, quickFilter, groupBy]);

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleExcelAll() {
    if (filtered.length === 0) { toast.info('내보낼 계약 없음'); return; }
    downloadContractsExcel(filtered, companyMaster, { title: '계약 리스트', filter: `검색결과 ${filtered.length}건` });
  }
  function handleExcelSelected() {
    const targets = filtered.filter((c) => selectedIds.has(c.id));
    if (targets.length === 0) { toast.info('선택된 계약 없음'); return; }
    downloadContractsExcel(targets, companyMaster, { title: '계약 리스트 (선택)', filter: `선택 ${targets.length}건` });
  }
  function handleExpireGuide() {
    const targets = filtered.filter((c) => selectedIds.has(c.id));
    if (targets.length === 0) { toast.info('선택된 계약 없음'); return; }
    const lines = targets.map((c) => `${c.contractNo} · ${c.customerName} · ${c.vehiclePlate} · 만기 ${c.returnScheduledDate ?? '미정'}`).join('\n');
    navigator.clipboard.writeText(lines).then(() => toast.success(`만기 안내 ${targets.length}건 클립보드 복사`)).catch(() => toast.error('복사 실패'));
  }

  const today = todayKr();

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
      if (quickFilter === 'active') {
        if (ENDED) return false;
      } else if (quickFilter === 'ended') {
        if (!ENDED) return false;
      } else if (quickFilter === 'expire') {
        // 만기임박: status='운행' && returnScheduledDate D-90 이내
        if (c.status !== '운행') return false;
        if (!c.returnScheduledDate) return false;
        const days = Math.round((new Date(c.returnScheduledDate).getTime() - new Date(today_).getTime()) / 86400000);
        if (days < 0 || days > 90) return false;
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
    });
  }, [contracts, search, quickFilter, companyFilter, today]);

  // 각 퀵필터 카운트 — chip 라벨에 표시
  const counts = useMemo(() => {
    let expire = 0, ret = 0, overdue = 0, ended = 0, active = 0, all = 0;
    for (const c of contracts) {
      if (!matchesCompanyFilter(c.company, companyFilter)) continue;
      all++;
      const isEnded = c.status === '해지' || c.status === '반납' || c.status === '채권';
      if (isEnded) ended++;
      else active++;
      if (c.status === '운행' && c.returnScheduledDate) {
        const days = Math.round((new Date(c.returnScheduledDate).getTime() - new Date(today).getTime()) / 86400000);
        if (days >= 0 && days <= 90) expire++;
      }
      if (c.status === '반납') ret++;
      if ((c.unpaidAmount ?? 0) > 0) overdue++;
    }
    return { all, active, expire, return: ret, overdue, ended };
  }, [contracts, companyFilter, today]);

  // 계약자별 묶음 (customerName 기준)
  const byCustomer = useMemo(() => {
    const m = new Map<string, typeof filtered>();
    for (const c of filtered) {
      const k = c.customerName || '미상';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(c);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  return (
    <PageShell
      title="계약 관리"
      icon={<FileText size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      topbarSearch={{ placeholder: '계약자 / 차량 / 계약번호 / 연락처', value: search, onChange: setSearch }}
      topbarFilter={
        <>
          <CompanyFilter value={companyFilter} onChange={setCompanyFilter} options={companyOptions} master={companyMaster} />
          <span className="filter-divider" />
          {/* 보조 퀵필터 — count > 0 일 때만 표시 (반응형) */}
          {counts.expire > 0 && (
            <button type="button" className={`chip ${quickFilter === 'expire' ? 'active' : ''}`} onClick={() => setQuickFilter('expire')}>
              만기임박<span className="chip-count">{counts.expire}</span>
            </button>
          )}
          {counts.return > 0 && (
            <button type="button" className={`chip ${quickFilter === 'return' ? 'active' : ''}`} onClick={() => setQuickFilter('return')}>
              반납<span className="chip-count">{counts.return}</span>
            </button>
          )}
          {counts.overdue > 0 && (
            <button type="button" className={`chip ${quickFilter === 'overdue' ? 'active' : ''}`} onClick={() => setQuickFilter('overdue')}>
              미수금<span className="chip-count">{counts.overdue}</span>
            </button>
          )}
          {/* 라이프사이클 — 우측 push (필터 아닌 view 분류, 항상 표시) */}
          <span style={{ marginLeft: 'auto' }} />
          <button type="button" className={`chip ${quickFilter === 'active' ? 'active' : ''}`} onClick={() => setQuickFilter('active')}>
            유지<span className="chip-count">{counts.active}</span>
          </button>
          <button type="button" className={`chip ${quickFilter === 'ended' ? 'active' : ''}`} onClick={() => setQuickFilter('ended')}>
            종료<span className="chip-count">{counts.ended}</span>
          </button>
          <button type="button" className={`chip ${quickFilter === 'all' ? 'active' : ''}`} onClick={() => setQuickFilter('all')}>
            전체<span className="chip-count">{counts.all}</span>
          </button>
          <span className="filter-divider" />
          <button type="button" className={`chip ${groupBy === 'list' ? 'active' : ''}`} onClick={() => setGroupBy('list')}>전체 리스트</button>
          <button type="button" className={`chip ${groupBy === 'customer' ? 'active' : ''}`} onClick={() => setGroupBy('customer')}>계약자별 묶음</button>
        </>
      }
      bottomBarLeft={
        <>
          <button className="btn btn-primary" type="button" onClick={() => setCreateOpen(true)}>+ 신규 계약</button>
          <span className="btn-sep" />
          <button className="btn" type="button" onClick={handleExcelAll} title="현재 필터된 계약 전체 엑셀">엑셀</button>
          <span className="btn-sep" />
          <span className="dim" style={{ fontSize: 11 }}>
            {selectedIds.size > 0 ? `선택 ${selectedIds.size}건` : '체크박스로 선택'}
          </span>
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
        </>
      }
    >
              {groupBy === 'list' ? (
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
                      <th className="center" style={{ width: 76 }}>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <EmptyRow colSpan={11}>계약 없음</EmptyRow>
                    ) : filtered.map((c) => (
                      <tr key={c.id} onDoubleClick={() => setOpenId(c.id)} style={{ cursor: 'pointer' }} className={selectedIds.has(c.id) ? 'selected-row' : undefined}>
                        <td className="checkbox-col" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleRow(c.id)} aria-label="행 선택" />
                        </td>
                        <td>{c.company ? displayCompanyName(c.company, companyMaster) : '-'}</td>
                        <td className="mono">{c.contractNo}</td>
                        <td className="mono">{c.vehiclePlate}</td>
                        <td>{c.customerName}</td>
                        <td className="mono dim">{c.customerPhone1 || '-'}</td>
                        <td className="mono">{c.contractDate}</td>
                        <td className="mono dim">{c.returnScheduledDate || '-'}</td>
                        <td className="num mono">₩{(c.monthlyRent ?? 0).toLocaleString()}</td>
                        <td className="num mono">₩{(c.deposit ?? 0).toLocaleString()}</td>
                        <td className="center"><StatusBadge tone={contractStatusTone(c.status)}>{c.status}</StatusBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>계약자</th>
                      <th className="center" style={{ width: 64 }}>계약수</th>
                      <th>차량들</th>
                      <th className="num" style={{ width: 130 }}>총 미수금</th>
                      <th className="num" style={{ width: 130 }}>월 대여료 합</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCustomer.length === 0 ? (
                      <EmptyRow colSpan={5}>고객별 미수금 집계 없음</EmptyRow>
                    ) : byCustomer.map(([name, list]) => {
                      const totalUnpaid = list.reduce((s, c) => s + (c.unpaidAmount ?? 0), 0);
                      const totalMonthly = list.reduce((s, c) => s + (c.monthlyRent ?? 0), 0);
                      return (
                        <tr key={name}>
                          <td><strong>{name}</strong></td>
                          <td className="center">{list.length}</td>
                          <td>
                            {list.map((c) => (
                              <span key={c.id} className="mono" style={{ marginRight: 8, fontSize: 11 }}>
                                {c.vehiclePlate} <span className="dim">{c.status}</span>
                              </span>
                            ))}
                          </td>
                          <td className="num mono" style={{ color: totalUnpaid > 0 ? 'var(--red-text)' : undefined }}>
                            ₩{totalUnpaid.toLocaleString()}
                          </td>
                          <td className="num mono">₩{totalMonthly.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

      <ContractDetailDialog
        contract={openId ? contracts.find((c) => c.id === openId) ?? null : null}
        open={openId != null}
        onOpenChange={(v) => !v && setOpenId(null)}
        onUpdate={(updated) => { void updateContract(updated); }}
      />
      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} visibleModes={['계약']} initialMode="계약" />
      <SmsDialog open={smsOpen} onOpenChange={setSmsOpen} contracts={filtered} selectedIds={selectedIds} />
    </PageShell>
  );
}
