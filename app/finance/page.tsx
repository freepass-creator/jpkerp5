'use client';

/**
 * /finance — 재무 관리 메인 (거래내역 ledger).
 * v4 finance/page.tsx 의 컬럼 구조 그대로 + jpkerp5 BankTx 데이터.
 * 표 기반 (대시보드 카드 X) — 자산/계약과 동일한 list-first 패턴.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bank, MagnifyingGlass, ArrowLeft, Plus, Trash } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { useBankTx, useCardTx } from '@/lib/firebase/transactions-store';
import { RECEIPT_SUBJECTS, EXPENSE_SUBJECTS, INTERNAL_SUBJECTS } from '@/lib/ledger-subjects';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useRole } from '@/lib/use-role';
import { buildCompanyOptions, matchesCompanyFilter, resolveCompanyKey } from '@/lib/filter-helpers';
import { displayCompanyName } from '@/lib/company-display';
import { CreateDialog } from '@/components/create-dialog';
import { DailyLedgerView } from '@/components/finance/daily-ledger-view';
import { toast } from '@/lib/toast';
import { downloadTaxInvoiceExcel } from '@/lib/tax-invoice-export';
import { findCmsMatchCandidates, buildSettlementPatches } from '@/lib/cms-matching';
import { PageShell } from '@/components/ui/page-shell';
import { CompanyFilter } from '@/components/ui/filter-bar';

const fmtNum = (v: number) => v ? v.toLocaleString('ko-KR') : '';

export default function FinancePage() {
  const router = useRouter();
  const { isMaster: master, loading: roleLoading } = useRole();
  useEffect(() => {
    if (!roleLoading && !master) router.replace('/');
  }, [master, roleLoading, router]);

  const { rows: bankTx, removeMany: removeManyBank, update: updateBank } = useBankTx();
  const { rows: cardTx, removeMany: removeManyCard, update: updateCard } = useCardTx();

  function handleTaxInvoiceExport() {
    const r = downloadTaxInvoiceExcel(contracts);
    if (r.ok) {
      toast.success(`세금계산서 ${r.count}건 발행 엑셀 다운로드 — 전자세금계산서 시스템에 일괄 업로드`);
    } else {
      toast.info('B2B 활성 계약 없음 — 사업자/법인 계약 없거나 모두 반납/해지 상태');
    }
  }

  async function handleCmsAutoMatch() {
    const candidates = findCmsMatchCandidates(bankTx);
    if (candidates.length === 0) { toast.info('CMS 매칭 후보 없음'); return; }
    const high = candidates.filter((c) => c.confidence === 'high');
    const others = candidates.length - high.length;
    if (!window.confirm(`CMS 자동 매칭 — high confidence ${high.length}건 자동 적용${others > 0 ? ` (${others}건은 수동 검토)` : ''}\n\n계속하시겠습니까?`)) return;
    for (const cand of high) {
      for (const { id, patch } of buildSettlementPatches(cand)) {
        try { await updateBank(id, patch); } catch (e) { console.error('[cms]', e); }
      }
    }
    toast.success(`CMS 매칭 ${high.length}건 적용`);
  }
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`선택한 ${selectedIds.size}건의 거래내역을 삭제하시겠습니까?`)) return;
    try {
      await removeManyBank(Array.from(selectedIds));
      setSelectedIds(new Set());
    } catch (e) {
      alert(`삭제 실패: ${(e as Error).message ?? String(e)}`);
    }
  }
  const { contracts } = useContracts();
  const { companies: companyMaster } = useCompanies();

  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'deposit' | 'withdraw'>('all');
  const [viewMode, setViewMode] = useState<'account' | 'autopay' | 'card' | 'corpcard' | 'daily'>('account');
  const [createOpen, setCreateOpen] = useState(false);
  const [periodMode, setPeriodMode] = useState<'month' | 'quarter' | 'year'>('month');
  const [periodAnchor, setPeriodAnchor] = useState<{ y: number; m: number }>(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  });

  function shiftPeriod(delta: number) {
    setPeriodAnchor((p) => {
      const step = periodMode === 'month' ? 1 : periodMode === 'quarter' ? 3 : 12;
      const d = new Date(p.y, p.m - 1 + step * delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    });
  }
  function gotoCurrent() {
    const d = new Date();
    setPeriodAnchor({ y: d.getFullYear(), m: d.getMonth() + 1 });
  }
  const periodLabel = (() => {
    if (periodMode === 'year') return `${periodAnchor.y}`;
    if (periodMode === 'quarter') {
      const q = Math.floor((periodAnchor.m - 1) / 3) + 1;
      return `${periodAnchor.y} Q${q}`;
    }
    return `${periodAnchor.y}-${String(periodAnchor.m).padStart(2, '0')}`;
  })();
  function inPeriod(yyyymmdd: string): boolean {
    if (!yyyymmdd) return false;
    const [yStr, mStr] = yyyymmdd.split('-');
    const y = Number(yStr), m = Number(mStr);
    if (Number.isNaN(y) || Number.isNaN(m)) return false;
    if (periodMode === 'year') return y === periodAnchor.y;
    if (periodMode === 'quarter') {
      const qa = Math.floor((periodAnchor.m - 1) / 3);
      const qy = Math.floor((m - 1) / 3);
      return y === periodAnchor.y && qy === qa;
    }
    return y === periodAnchor.y && m === periodAnchor.m;
  }

  const contractById = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts]);

  const companyOptions = useMemo(
    () => buildCompanyOptions(bankTx, (t) => resolveCompanyKey(t, contractById)),
    [bankTx, contractById],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bankTx
      .filter((t) => {
        if (directionFilter === 'deposit' && !((t.amount ?? 0) > 0)) return false;
        if (directionFilter === 'withdraw' && !((t.withdraw ?? 0) > 0)) return false;
        if (!matchesCompanyFilter(resolveCompanyKey(t, contractById), companyFilter)) return false;
        // 기간 필터 (월/분기/연)
        if (!inPeriod((t.txDate ?? '').slice(0, 10))) return false;
        if (q) {
          const c = t.matchedContractId ? contractById.get(t.matchedContractId) : undefined;
          const hay = `${t.counterparty ?? ''} ${t.memo ?? ''} ${t.account ?? ''} ${t.subject ?? ''} ${c?.contractNo ?? ''} ${c?.customerName ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.txDate ?? '').localeCompare(a.txDate ?? ''));
  }, [bankTx, search, directionFilter, companyFilter, contractById, periodMode, periodAnchor]);


  return (
    <PageShell
      title="입출금 관리"
      icon={<Bank size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      topbarSearch={{ placeholder: '거래상대 / 적요 / 계좌 / 계정과목 / 계약자', value: search, onChange: setSearch }}
      topbarFilter={
        <>
          <CompanyFilter value={companyFilter} onChange={setCompanyFilter} options={companyOptions} master={companyMaster} />
          <select
            className="input-compact" data-w="sm"
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value as 'all' | 'deposit' | 'withdraw')}
            title="입출금 방향"
          >
            <option value="all">입출금</option>
            <option value="deposit">입금만</option>
            <option value="withdraw">출금만</option>
          </select>
        </>
      }
      topbarChips={
        <>
          <button type="button" className={`chip ${viewMode === 'account' ? 'active' : ''}`} onClick={() => setViewMode('account')}>계좌</button>
          <button type="button" className={`chip ${viewMode === 'autopay' ? 'active' : ''}`} onClick={() => setViewMode('autopay')}>자동이체</button>
          <button type="button" className={`chip ${viewMode === 'card' ? 'active' : ''}`} onClick={() => setViewMode('card')}>카드매출</button>
          <button type="button" className={`chip ${viewMode === 'corpcard' ? 'active' : ''}`} onClick={() => setViewMode('corpcard')}>법인카드</button>
          <button
            type="button"
            className={`chip ${viewMode === 'daily' ? 'active' : ''}`}
            onClick={() => setViewMode('daily')}
            style={
              viewMode === 'daily'
                ? { background: '#f3e8ff', color: '#6b21a8', borderColor: '#a855f7' }
                : { borderColor: '#c4b5fd', color: '#6b21a8' }
            }
            title="자금일보 — 4 종류 통합 + 계정과목·매칭 편집"
          >
            자금일보
          </button>
          <span className="filter-divider" />
          <button type="button" className={`chip ${periodMode === 'month' ? 'active' : ''}`} onClick={() => setPeriodMode('month')}>월</button>
          <button type="button" className={`chip ${periodMode === 'quarter' ? 'active' : ''}`} onClick={() => setPeriodMode('quarter')}>분기</button>
          <button type="button" className={`chip ${periodMode === 'year' ? 'active' : ''}`} onClick={() => setPeriodMode('year')}>연</button>
          <span className="filter-divider" />
          <button type="button" className="chip" onClick={() => shiftPeriod(-1)} title="이전 기간">◀</button>
          <strong className="mono" style={{ minWidth: 80, textAlign: 'center', fontSize: 12 }}>{periodLabel}</strong>
          <button type="button" className="chip" onClick={() => shiftPeriod(1)} title="다음 기간">▶</button>
          <button type="button" className="chip" onClick={gotoCurrent} title="현재 기간으로">당월</button>
        </>
      }
      bare
      noBottomBar
    >
        <div className="dashboard" style={{ gridTemplateColumns: '1fr' }}>
          <div className="panel">
            <div className="panel-body">
              {viewMode !== 'account' && (
                <DailyLedgerView
                  bankTx={bankTx}
                  cardTx={cardTx}
                  contractById={contractById}
                  contracts={contracts}
                  companyMaster={companyMaster}
                  inPeriod={inPeriod}
                  search={search}
                  companyFilter={companyFilter}
                  kindFilter={
                    viewMode === 'autopay' ? '자동이체'
                    : viewMode === 'card' ? '카드매출'
                    : viewMode === 'corpcard' ? '법인카드'
                    : undefined  /* daily = 전체 */
                  }
                  onUpdateBank={(id, patch) => void updateBank(id, patch)}
                  onUpdateCard={(id, patch) => void updateCard(id, patch)}
                />
              )}
              {viewMode === 'account' && (
              <table className="table">
                <thead>
                  <tr>
                    <th className="center" style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && filtered.every((t) => selectedIds.has(t.id))}
                        ref={(el) => {
                          if (!el) return;
                          const some = filtered.some((t) => selectedIds.has(t.id));
                          const all = filtered.every((t) => selectedIds.has(t.id));
                          el.indeterminate = some && !all;
                        }}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(new Set(filtered.map((t) => t.id)));
                          else setSelectedIds(new Set());
                        }}
                        aria-label="전체 선택"
                      />
                    </th>
                    <th style={{ width: 60 }}>회사</th>
                    <th style={{ width: 130 }}>계좌</th>
                    <th style={{ width: 110 }}>거래일시</th>
                    <th className="num" style={{ width: 110 }}>입금</th>
                    <th className="num" style={{ width: 110 }}>출금</th>
                    <th className="num" style={{ width: 120 }}>잔액</th>
                    <th>적요</th>
                    <th style={{ width: 140 }}>상대</th>
                    <th style={{ width: 90 }}>거래방법</th>
                    <th style={{ width: 100 }}>계정과목</th>
                    <th style={{ width: 110 }}>매칭 계약</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="muted center" style={{ padding: 32 }}>
                        거래 내역 없음 — 입출금 관리에서 등록
                      </td>
                    </tr>
                  ) : filtered.map((t) => {
                    const c = t.matchedContractId ? contractById.get(t.matchedContractId) : undefined;
                    const co = resolveCompanyKey(t, contractById);
                    return (
                      <tr
                        key={t.id}
                        onDoubleClick={() => {
                          setViewMode('daily');
                          toast.info(`자금일보 view 에서 계정과목·매칭 편집 (${t.counterparty || (t.txDate ?? '').slice(0, 10)})`);
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(t.id)}
                            onChange={() => toggleSelect(t.id)}
                            aria-label="행 선택"
                          />
                        </td>
                        <td className="dim">{co ? displayCompanyName(co, companyMaster) : '-'}</td>
                        <td className="mono dim" style={{ fontSize: 11 }}>{t.account ?? '-'}</td>
                        <td className="mono">{(t.txDate ?? '').slice(0, 10)}</td>
                        <td className="num mono" style={{ color: (t.amount ?? 0) > 0 ? 'var(--green-text)' : 'var(--text-weak)' }}>
                          {fmtNum(t.amount ?? 0) || '-'}
                        </td>
                        <td className="num mono" style={{ color: (t.withdraw ?? 0) > 0 ? 'var(--red-text)' : 'var(--text-weak)' }}>
                          {fmtNum(t.withdraw ?? 0) || '-'}
                        </td>
                        <td className="num mono dim">{fmtNum(t.balance ?? 0) || '-'}</td>
                        <td>{t.memo || t.counterparty || '-'}</td>
                        <td className="dim">{t.counterparty || '-'}</td>
                        <td className="dim">{t.method || '-'}</td>
                        <td>{t.subject || <span className="muted">미지정</span>}</td>
                        <td className="mono dim" style={{ fontSize: 11 }}>
                          {c ? `${c.contractNo}` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              )}
            </div>
          </div>
        </div>

        <BottomBar
          left={
            <>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setCreateOpen(true)}
                title="계좌/자동이체/카드매출/법인카드 1건 등록 (다이얼로그에서 종류 선택)"
              >
                <Plus size={14} weight="bold" /> 신규 등록
              </button>
              <span className="btn-sep" />
              <button className="btn" type="button" title="현재 표시중 거래내역 엑셀 다운로드">엑셀</button>
              {viewMode === 'daily' && (
                <>
                  <span className="btn-sep" />
                  <button
                    className="btn"
                    type="button"
                    onClick={handleTaxInvoiceExport}
                    title="세금계산서 발행 엑셀 — 전자세금계산서 시스템 일괄 업로드용"
                  >
                    세금계산서 엑셀
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => void handleCmsAutoMatch()}
                    title="미매칭 CMS 집금건 ↔ 자동이체 자동 묶음 매칭 (일자 ±3일 + 수수료 0.05~0.3%)"
                  >
                    CMS 자동 매칭
                  </button>
                </>
              )}
              <span className="btn-sep" />
              <button
                className="btn"
                type="button"
                disabled={selectedIds.size === 0}
                onClick={() => void handleBulkDelete()}
                style={{ color: selectedIds.size > 0 ? 'var(--red-text)' : undefined }}
                title={selectedIds.size === 0 ? '체크박스로 거래내역 선택' : `선택 ${selectedIds.size}건 삭제`}
              >
                <Trash size={14} weight="bold" /> 선택 삭제{selectedIds.size > 0 && ` (${selectedIds.size})`}
              </button>
            </>
          }
          right={null}
        />

        <CreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          visibleModes={['입출금', '자동이체', '카드매출', '법인카드']}
          /* 현재 view에 맞는 mode로 시작 — 직원이 view 헷갈림 방지 (이슈 4) */
          initialMode={
            viewMode === 'autopay' ? '자동이체'
            : viewMode === 'card' ? '카드매출'
            : viewMode === 'corpcard' ? '법인카드'
            : '입출금'
          }
        />
    </PageShell>
  );
}
