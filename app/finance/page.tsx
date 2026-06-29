'use client';

/**
 * /finance — 재무 관리 메인 (거래내역 ledger).
 * v4 finance/page.tsx 의 컬럼 구조 그대로 + jpkerp5 BankTx 데이터.
 * 표 기반 (대시보드 카드 X) — 자산/계약과 동일한 list-first 패턴.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bank, Plus, Trash, FileXls, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { BottomBar } from '@/components/layout/bottom-bar';
import { EmptyRow } from '@/components/ui/empty-row';
import { useBankTx, useCardTx } from '@/lib/firebase/transactions-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { updateBankTxWithMatchSync, updateCardTxWithMatchSync } from '@/lib/firebase/tx-contract-sync';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useVendors } from '@/lib/firebase/vendors-store';
import { EntityFormDialog, type FieldDef } from '@/components/ui/entity-form-dialog';
import type { BankTransaction, CardTransaction, Contract, Vendor, Company } from '@/lib/types';
import { buildAllJournals, summarizeByAccount, ACCOUNTS, CLASS_LABEL, type LedgerSummary, type AccountClass } from '@/lib/gl-entries';
import { useRole } from '@/lib/use-role';
import { buildCompanyOptions, matchesCompanyFilter, resolveCompanyKey } from '@/lib/filter-helpers';
import { displayCompanyName } from '@/lib/company-display';
import { CompanyCell } from '@/components/ui/company-cell';
import { CreateDialog } from '@/components/create-dialog';
import { DailyLedgerView } from '@/components/finance/daily-ledger-view';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';
import { downloadTaxInvoiceExcel } from '@/lib/tax-invoice-export';
import { recordIssuedInvoices, snapshotFromContract } from '@/lib/firebase/issued-invoices-store';
import { useAuth } from '@/lib/use-auth';
import { findCmsMatchCandidates, buildSettlementPatches } from '@/lib/cms-matching';
import { PageShell } from '@/components/ui/page-shell';
import { CompanyFilter } from '@/components/ui/filter-bar';
import { FilterSelect } from '@/components/ui/filter-select';
import { usePersistentState } from '@/lib/use-persistent-state';
import { useClaimSheet, type ClaimSheet, type Cell as ClaimCell } from '@/lib/firebase/claim-sheet-store';
import * as XLSX from 'xlsx';

const fmtNum = (v: number) => v ? v.toLocaleString('ko-KR') : '';

/** 채권 시트 — 원본 엑셀 그대로 렌더 (계산 없음). 좌측 N개 컬럼만 freeze(L열=12번째까지). */
const CLAIM_FREEZE_COUNT = 12;
const CLAIM_NO_COL_WIDTH = 40;
const CLAIM_OTHER_COL_WIDTH = 86;
function claimColWidth(i: number): number {
  return i === 0 ? CLAIM_NO_COL_WIDTH : CLAIM_OTHER_COL_WIDTH;
}
function claimFrozenLefts(n: number): number[] {
  let acc = 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) { out.push(acc); acc += claimColWidth(i); }
  return out;
}
function claimCellText(v: string | number | null | undefined): string {
  if (v == null || v === '') return '';
  return typeof v === 'number' ? v.toLocaleString('ko-KR') : String(v);
}

/** 채권 탭 — 업로드된 엑셀 그대로 표시. 좌측 CLAIM_FREEZE_COUNT개 컬럼 freeze. */
function ClaimSheetView({
  sheet, uploading, onUpload,
}: {
  sheet: ClaimSheet | null;
  uploading: boolean;
  onUpload: (file: File) => void;
}) {
  const inputId = 'jpk-claim-upload';
  const headers = sheet?.headers ?? [];
  const topRow = sheet?.topRow ?? [];
  const rows = sheet?.rows ?? [];
  const freezeN = Math.min(CLAIM_FREEZE_COUNT, headers.length);
  const lefts = claimFrozenLefts(freezeN);
  const hasTopRow = topRow.some((v) => v != null && v !== '');
  const headerTop = hasTopRow ? 25 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        <FileXls size={14} weight="duotone" style={{ color: 'var(--text-sub)' }} />
        <span style={{ fontSize: 12 }}>
          {sheet ? `${sheet.fileName} · ${rows.length}행 · 업로드 ${sheet.uploadedAt.slice(0, 16).replace('T', ' ')}` : '업로드된 채권 시트 없음'}
        </span>
        <div style={{ flex: 1 }} />
        <input
          id={inputId} type="file" accept=".xlsx,.xls,.csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }}
        />
        <button className="btn btn-sm btn-primary" type="button" disabled={uploading} onClick={() => document.getElementById(inputId)?.click()}>
          <Plus size={12} weight="bold" /> {uploading ? '업로드 중...' : '엑셀 업로드'}
        </button>
      </div>

      {!sheet ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-weak)' }}>
          엑셀 업로드해서 채권 현황을 등록하세요.
        </div>
      ) : (
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 280px)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 11, tableLayout: 'fixed' }}>
            <colgroup>
              {headers.map((_, i) => <col key={i} style={{ width: claimColWidth(i) }} />)}
            </colgroup>
            <thead>
              {hasTopRow && (
                <tr>
                  {topRow.map((v, i) => (
                    <th
                      key={i}
                      style={{
                        position: 'sticky', left: i < freezeN ? lefts[i] : undefined, top: 0, zIndex: i < freezeN ? 4 : 2,
                        background: 'var(--bg-card)', borderBottom: '1px solid var(--border)',
                        borderRight: i === freezeN - 1 ? '2px solid var(--border-strong, var(--text-weak))' : '1px solid var(--border)',
                        padding: '4px 6px', textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 400, color: 'var(--text-sub)',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                      }}
                    >
                      {claimCellText(v)}
                    </th>
                  ))}
                </tr>
              )}
              <tr>
                {headers.map((h, i) => (
                  <th
                    key={i}
                    style={{
                      position: 'sticky', left: i < freezeN ? lefts[i] : undefined, top: headerTop, zIndex: i < freezeN ? 4 : 2,
                      background: 'var(--bg-card)', borderBottom: '1px solid var(--border)',
                      borderRight: i === freezeN - 1 ? '2px solid var(--border-strong, var(--text-weak))' : '1px solid var(--border)',
                      padding: '5px 6px', textAlign: 'center', whiteSpace: 'nowrap',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {claimCellText(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {headers.map((_, i) => {
                    const v = row[i];
                    const isNum = typeof v === 'number';
                    return (
                      <td
                        key={i}
                        className={isNum ? 'mono' : undefined}
                        style={{
                          position: i < freezeN ? 'sticky' : undefined, left: i < freezeN ? lefts[i] : undefined, zIndex: i < freezeN ? 1 : undefined,
                          background: i < freezeN ? 'var(--bg-main)' : undefined,
                          borderBottom: '1px solid var(--border)',
                          borderRight: i === freezeN - 1 ? '2px solid var(--border-strong, var(--text-weak))' : '1px solid var(--border)',
                          padding: '4px 6px', textAlign: isNum ? 'right' : 'center',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {claimCellText(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function FinancePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { isMaster: master, loading: roleLoading } = useRole();
  useEffect(() => {
    if (!roleLoading && !master) router.replace('/');
  }, [master, roleLoading, router]);

  const { rows: bankTx, loading: bankTxLoading, removeMany: removeManyBank, update: updateBank } = useBankTx();
  const { rows: cardTx, loading: cardTxLoading, removeMany: removeManyCard, update: updateCard } = useCardTx();

  async function handleTaxInvoiceExport() {
    const r = downloadTaxInvoiceExcel(contracts);
    if (!r.ok) {
      toast.info('B2B 활성 계약 없음 — 사업자/법인 계약 없거나 모두 반납/해지 상태');
      return;
    }
    // ERP #29 Frozen Artifact
    try {
      const billingMonth = new Date().toISOString().slice(0, 7);
      await recordIssuedInvoices({
        billingMonth,
        items: r.snapshots.map(snapshotFromContract),
        issuedBy: user?.email ?? user?.uid ?? 'unknown',
      });
      toast.success(`세금계산서 ${r.count}건 발행 + frozen ledger 기록`);
    } catch (e) {
      console.error('[tax-invoice ledger]', e);
      toast.error(`엑셀 OK — ledger 기록 실패: ${(e as Error).message}`);
    }
  }

  async function handleCmsAutoMatch() {
    const candidates = findCmsMatchCandidates(bankTx);
    if (candidates.length === 0) { toast.info('CMS 매칭 후보 없음'); return; }
    const high = candidates.filter((c) => c.confidence === 'high');
    const others = candidates.length - high.length;
    if (!await showConfirm({
      title: `CMS 자동 매칭 ${high.length}건 적용`,
      description: others > 0 ? `나머지 ${others}건은 수동 검토 필요` : undefined,
    })) return;
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
    if (!await showConfirm({ title: `선택한 ${selectedIds.size}건의 거래내역을 삭제하시겠습니까?`, danger: true })) return;
    try {
      await removeManyBank(Array.from(selectedIds));
      setSelectedIds(new Set());
    } catch (e) {
      toast.error(`삭제 실패: ${(e as Error).message ?? String(e)}`);
    }
  }
  const { contracts, update: updateContract } = useContracts();
  const { companies: companyMaster } = useCompanies();
  const { vendors } = useVendors();

  // 채권 — 엑셀(채권불러오기.xlsx) 업로드 그대로 표시. 계산/매칭 없음 — 다시 업로드하면 통째로 교체.
  const { sheet: claimSheet, save: saveClaimSheet } = useClaimSheet();
  const [claimUploading, setClaimUploading] = useState(false);

  async function handleClaimUpload(file: File) {
    setClaimUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const sheetName = wb.SheetNames.includes('채권') ? '채권' : wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][];
      const toCell = (v: unknown): ClaimCell => {
        if (v == null) return null;
        if (v instanceof Date) {
          const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
        if (typeof v === 'number' || typeof v === 'string') return v;
        return String(v);
      };
      const topRow = (aoa[0] ?? []).map(toCell);
      const headers = (aoa[1] ?? []).map(toCell);
      const rows = aoa.slice(2).filter((r) => r.some((v) => v != null && String(v).trim() !== '')).map((r) => r.map(toCell));
      await saveClaimSheet({
        topRow, headers, rows,
        fileName: file.name, sheetName,
        uploadedAt: new Date().toISOString(),
      });
      toast.success(`채권 시트 업로드 완료 — ${rows.length}행`);
    } catch (e) {
      toast.error(`업로드 실패: ${(e as Error).message ?? String(e)}`);
    } finally {
      setClaimUploading(false);
    }
  }

  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = usePersistentState('filter:finance:company', 'all');
  const [directionFilter, setDirectionFilter] = usePersistentState<'all' | 'deposit' | 'withdraw'>('filter:finance:direction', 'all');
  const [viewMode, setViewMode] = usePersistentState<'claim' | 'account' | 'autopay' | 'card' | 'corpcard' | 'daily' | 'vendors' | 'customers' | 'gl'>('filter:finance:view', 'account');
  const [createOpen, setCreateOpen] = useState(false);
  const [periodMode, setPeriodMode] = usePersistentState<'month' | 'quarter' | 'year'>('filter:finance:period', 'month');
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

  // 총계정원장 — BottomBar 검증·엑셀용 (GL view 일 때만 활용)
  const glStats = useMemo(() => {
    if (viewMode !== 'gl') return { entries: 0, debit: 0, accounts: 0 };
    const all = buildAllJournals(bankTx, cardTx);
    const filtered = all.filter((j) => {
      if (!inPeriod((j.date ?? '').slice(0, 10))) return false;
      if (companyFilter !== 'all') {
        const c = j.matchedContractId ? contractById.get(j.matchedContractId) : undefined;
        const co = j.companyCode ?? c?.company;
        if (co !== companyFilter) return false;
      }
      return true;
    });
    const debit = filtered.reduce((s, j) => s + j.amount, 0);
    const accounts = new Set<string>();
    for (const j of filtered) { accounts.add(j.debitAccount); accounts.add(j.creditAccount); }
    return { entries: filtered.length, debit, accounts: accounts.size, journals: filtered };
  }, [viewMode, bankTx, cardTx, companyFilter, contractById, periodMode, periodAnchor]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleGlExcelExport() {
    const j = (glStats as { journals?: import('@/lib/gl-entries').JournalEntry[] }).journals ?? [];
    if (j.length === 0) { toast.info('내보낼 분개 없음'); return; }
    const rows = j.map((x) => ({
      거래일: (x.date ?? '').slice(0, 10),
      구분: x.source === 'bank' ? '계좌' : '카드',
      차변계정: `${ACCOUNTS[x.debitAccount]?.code} ${ACCOUNTS[x.debitAccount]?.name}`,
      대변계정: `${ACCOUNTS[x.creditAccount]?.code} ${ACCOUNTS[x.creditAccount]?.name}`,
      금액: x.amount,
      거래상대: x.counterparty ?? '',
      적요: x.memo ?? '',
      회사코드: x.companyCode ?? '',
      매칭계약: x.matchedContractId ?? '',
    }));
    void import('@/lib/excel-export').then(({ exportToExcel }) => {
      const r = exportToExcel({
        title: `총계정원장 ${periodLabel}`,
        fileName: `총계정원장_${periodLabel}.xlsx`,
        sheetName: '총계정원장',
        columns: [
          { key: '거래일', header: '거래일', type: 'date' },
          { key: '구분', header: '구분', type: 'center' },
          { key: '차변계정', header: '차변계정' },
          { key: '대변계정', header: '대변계정' },
          { key: '금액', header: '금액', type: 'number' },
          { key: '거래상대', header: '거래상대' },
          { key: '적요', header: '적요' },
          { key: '회사코드', header: '회사코드', type: 'mono' },
          { key: '매칭계약', header: '매칭계약', type: 'mono' },
        ],
        rows,
      });
      if (r.ok) toast.success(`총계정원장 ${rows.length}건 엑셀 저장`);
    });
  }

  const companyOptions = useMemo(
    () => buildCompanyOptions(bankTx, (t) => resolveCompanyKey(t, contractById)),
    [bankTx, contractById],
  );

  // 자동이체 채널 = 자동이체 다이얼로그/엑셀 업로드로 들어온 것만 (source 가 엄밀히 'CMS'/'자동이체').
  // memo·counterparty 에 '자동이체' 적혀 있다고 자동이체로 분류 X (계좌 입출금에 단순 적요).
  const isAutopay = (t: typeof bankTx[number]) =>
    t.source === 'CMS' || t.source === '자동이체' || t.method === 'CMS';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bankTx
      .filter((t) => {
        // 계좌 view = 계좌 채널(수동 입력/계좌 엑셀 업로드) 만. 자동이체는 자기 자리에서.
        if (viewMode === 'account' && isAutopay(t)) return false;
        if (viewMode === 'autopay' && !isAutopay(t)) return false;
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
  }, [bankTx, search, directionFilter, companyFilter, contractById, periodMode, periodAnchor, viewMode]);

  const filteredCard = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cardTx
      .filter((t) => {
        if (viewMode === 'card' && t.kind !== '매출') return false;
        if (viewMode === 'corpcard' && t.kind !== '법인카드') return false;
        const coKey = t.companyCode || resolveCompanyKey({ matchedContractId: t.matchedContractId } as never, contractById);
        if (!matchesCompanyFilter(coKey, companyFilter)) return false;
        if (!inPeriod((t.txDate ?? '').slice(0, 10))) return false;
        if (q) {
          const c = t.matchedContractId ? contractById.get(t.matchedContractId) : undefined;
          const hay = `${t.customerName ?? ''} ${t.merchant ?? ''} ${t.approvalNo ?? ''} ${t.cardLast4 ?? ''} ${t.source ?? ''} ${t.category ?? ''} ${t.usedBy ?? ''} ${c?.contractNo ?? ''} ${c?.customerName ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.txDate ?? '').localeCompare(a.txDate ?? ''));
  }, [cardTx, search, companyFilter, contractById, periodMode, periodAnchor, viewMode]);


  return (
    <PageShell
      menuKey="finance"
      icon={<Bank size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      topbarSearch={{ placeholder: '거래상대 / 적요 / 계좌 / 계정과목 / 계약자', value: search, onChange: setSearch }}
      topbarFilter={
        <CompanyFilter value={companyFilter} onChange={setCompanyFilter} options={companyOptions} master={companyMaster} />
      }
      topbarChips={
        <>
          {/* 기간 chip 그룹 */}
          <button type="button" className={`chip ${periodMode === 'month' ? 'active' : ''}`} onClick={() => setPeriodMode('month')}>월</button>
          <button type="button" className={`chip ${periodMode === 'quarter' ? 'active' : ''}`} onClick={() => setPeriodMode('quarter')}>분기</button>
          <button type="button" className={`chip ${periodMode === 'year' ? 'active' : ''}`} onClick={() => setPeriodMode('year')}>연</button>
          <span className="filter-divider" />
          <button type="button" className="chip" onClick={() => shiftPeriod(-1)} title="이전 기간"><CaretLeft size={11} weight="bold" /></button>
          <strong className="mono" style={{ minWidth: 80, textAlign: 'center', fontSize: 12 }}>{periodLabel}</strong>
          <button type="button" className="chip" onClick={() => shiftPeriod(1)} title="다음 기간"><CaretRight size={11} weight="bold" /></button>
          <button type="button" className="chip" onClick={gotoCurrent} title="현재 기간으로">당월</button>
          {/* 보조 dropdown — 맨 뒤 */}
          <span className="filter-divider" />
          <FilterSelect
            value={directionFilter}
            onChange={(v) => setDirectionFilter(v as 'all' | 'deposit' | 'withdraw')}
            dataW="md"
            title="입출금 방향"
            options={[
              { value: 'all', label: '입출금' },
              { value: 'deposit', label: '입금만' },
              { value: 'withdraw', label: '출금만' },
            ]}
          />
        </>
      }
      topbarRight={
        <>
          {/* view 토글 버튼 — 우측 끝 (.chip-nav) */}
          <button type="button" className={`chip chip-nav ${viewMode === 'claim' ? 'active' : ''}`} onClick={() => setViewMode('claim')} title="계약별 월별 수납 현황 — 가로확장 (채권불러오기 양식)">채권</button>
          <button type="button" className={`chip chip-nav ${viewMode === 'account' ? 'active' : ''}`} onClick={() => setViewMode('account')}>계좌</button>
          <button type="button" className={`chip chip-nav ${viewMode === 'autopay' ? 'active' : ''}`} onClick={() => setViewMode('autopay')}>자동이체</button>
          <button type="button" className={`chip chip-nav ${viewMode === 'card' ? 'active' : ''}`} onClick={() => setViewMode('card')}>카드매출</button>
          <button type="button" className={`chip chip-nav ${viewMode === 'corpcard' ? 'active' : ''}`} onClick={() => setViewMode('corpcard')}>법인카드</button>
          {/* 입력 vs 자동집계 구분선 — "원장 하나, 투영 여럿" */}
          <span aria-hidden="true" style={{
            display: 'inline-flex',
            alignItems: 'center',
            margin: '0 6px 0 10px',
            padding: '2px 8px',
            borderLeft: '2px solid var(--border-strong, var(--text-weak))',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--text-sub)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}>자동 집계</span>
          <button type="button" className={`chip chip-nav ${viewMode === 'daily' ? 'active' : ''}`} onClick={() => setViewMode('daily')} title="자금일보 — 4 종류 통합 + 계정과목·매칭 편집">자금일보</button>
          <button type="button" className={`chip chip-nav ${viewMode === 'vendors' ? 'active' : ''}`} onClick={() => setViewMode('vendors')} title="거래처 보조원장 — 거래처별 지출 타임라인·누적">거래처</button>
          <button type="button" className={`chip chip-nav ${viewMode === 'customers' ? 'active' : ''}`} onClick={() => setViewMode('customers')} title="임차인 보조원장 — 계약자별 결제·미수 타임라인 + 유지/정상종료/비정상종료 구분">임차인</button>
          <button type="button" className={`chip chip-nav ${viewMode === 'gl' ? 'active' : ''}`} onClick={() => setViewMode('gl')} title="총계정원장 — 계정과목별 차변·대변·잔액">총계정원장</button>
        </>
      }
      bare
      noBottomBar
    >
        <div className="dashboard" style={{
          gridTemplateColumns: '1fr',
          ...(viewMode === 'vendors' || viewMode === 'customers' || viewMode === 'gl' || viewMode === 'claim' ? { padding: 0 } : {}),
        }}>
          <div className="panel" style={(viewMode === 'vendors' || viewMode === 'customers' || viewMode === 'gl' || viewMode === 'claim') ? { background: 'transparent', border: 'none', padding: 0 } : undefined}>
            <div className="panel-body" style={(viewMode === 'vendors' || viewMode === 'customers' || viewMode === 'gl' || viewMode === 'claim') ? { padding: 14 } : undefined}>
              {viewMode === 'claim' && (
                <ClaimSheetView sheet={claimSheet} uploading={claimUploading} onUpload={handleClaimUpload} />
              )}
              {viewMode === 'daily' && (
                <DailyLedgerView
                  bankTx={bankTx}
                  cardTx={cardTx}
                  contractById={contractById}
                  contracts={contracts}
                  companyMaster={companyMaster}
                  inPeriod={inPeriod}
                  search={search}
                  companyFilter={companyFilter}
                  onUpdateBank={(id, patch) => {
                    const old = bankTx.find((t) => t.id === id);
                    if (!old) return;
                    void updateBankTxWithMatchSync(old, patch, contracts, updateBank, updateContract);
                  }}
                  onUpdateCard={(id, patch) => {
                    const old = cardTx.find((t) => t.id === id);
                    if (!old) return;
                    void updateCardTxWithMatchSync(old, patch, contracts, updateCard, updateContract);
                  }}
                />
              )}
              {(viewMode === 'account' || viewMode === 'autopay') && (
              <table className="table">
                <thead>
                  <tr>
                    <th className="checkbox-col">
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
                        {bankTxLoading ? '데이터 불러오는 중…' : '거래 내역 없음 — 입출금 관리에서 등록'}
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
                        <td className="checkbox-col" onClick={(e) => e.stopPropagation()}>
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
              {viewMode === 'card' && (
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>회사</th>
                      <th style={{ width: 110 }}>거래일시</th>
                      <th style={{ width: 70 }}>카드사</th>
                      <th className="num" style={{ width: 110 }}>금액</th>
                      <th style={{ width: 100 }}>끝4자리</th>
                      <th>고객명</th>
                      <th style={{ width: 140 }}>승인번호</th>
                      <th style={{ width: 130 }}>단말기/가맹점</th>
                      <th style={{ width: 110 }}>매칭 계약</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cardTxLoading ? (
                      <EmptyRow colSpan={9}>카드매출 불러오는 중…</EmptyRow>
                    ) : filteredCard.length === 0 ? (
                      <EmptyRow colSpan={9}>카드매출 내역 없음 — 우측 하단 [+ 신규 등록] 으로 추가</EmptyRow>
                    ) : filteredCard.map((t) => {
                      const c = t.matchedContractId ? contractById.get(t.matchedContractId) : undefined;
                      const co = t.companyCode || (c?.company);
                      return (
                        <tr key={t.id} onDoubleClick={() => { setViewMode('daily'); toast.info('자금일보 view 에서 매칭 편집'); }} style={{ cursor: 'pointer' }}>
                          <td className="dim">{co ? displayCompanyName(co, companyMaster) : '-'}</td>
                          <td className="mono">{(t.txDate ?? '').slice(0, 10)}</td>
                          <td className="dim">{t.source || '-'}</td>
                          <td className="num mono" style={{ color: 'var(--green-text)' }}>{fmtNum(t.amount ?? 0) || '-'}</td>
                          <td className="mono dim">{t.cardLast4 || '-'}</td>
                          <td>{t.customerName || '-'}</td>
                          <td className="mono dim" style={{ fontSize: 11 }}>{t.approvalNo || '-'}</td>
                          <td className="mono dim" style={{ fontSize: 11 }}>{t.terminalId || t.merchantNo || '-'}</td>
                          <td className="mono dim" style={{ fontSize: 11 }}>{c ? c.contractNo : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {viewMode === 'corpcard' && (
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>회사</th>
                      <th style={{ width: 110 }}>거래일시</th>
                      <th style={{ width: 110 }}>카드사·끝4자리</th>
                      <th className="num" style={{ width: 110 }}>금액</th>
                      <th>가맹점</th>
                      <th style={{ width: 100 }}>카테고리</th>
                      <th style={{ width: 120 }}>사용자</th>
                      <th style={{ width: 70 }}>승인</th>
                      <th style={{ width: 140 }}>승인번호</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cardTxLoading ? (
                      <EmptyRow colSpan={9}>법인카드 지출 불러오는 중…</EmptyRow>
                    ) : filteredCard.length === 0 ? (
                      <EmptyRow colSpan={9}>법인카드 지출 내역 없음 — 우측 하단 [+ 신규 등록] 으로 추가</EmptyRow>
                    ) : filteredCard.map((t) => {
                      const co = t.companyCode;
                      return (
                        <tr key={t.id} onDoubleClick={() => { setViewMode('daily'); toast.info('자금일보 view 에서 매칭 편집'); }} style={{ cursor: 'pointer' }}>
                          <td className="dim">{co ? displayCompanyName(co, companyMaster) : '-'}</td>
                          <td className="mono">{(t.txDate ?? '').slice(0, 10)}</td>
                          <td className="mono dim">{t.source || '-'}{t.cardLast4 ? ` ${t.cardLast4}` : ''}</td>
                          <td className="num mono" style={{ color: 'var(--red-text)' }}>{fmtNum(t.amount ?? 0) || '-'}</td>
                          <td>{t.merchant || t.customerName || '-'}</td>
                          <td className="dim">{t.category || <span className="muted">미지정</span>}</td>
                          <td className="dim">{t.usedBy || '-'}</td>
                          <td className="dim">{t.approved ? '완료' : '대기'}</td>
                          <td className="mono dim" style={{ fontSize: 11 }}>{t.approvalNo || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {viewMode === 'vendors' && (
                <VendorSubLedgerView
                  bankTx={bankTx}
                  vendors={vendors}
                  contracts={contracts}
                  contractById={contractById}
                  companyFilter={companyFilter}
                  companyMaster={companyMaster}
                  inPeriod={inPeriod}
                  search={search}
                />
              )}
              {viewMode === 'customers' && (
                <CustomerSubLedgerView
                  bankTx={bankTx}
                  cardTx={cardTx}
                  contracts={contracts}
                  contractById={contractById}
                  companyFilter={companyFilter}
                  companyMaster={companyMaster}
                  inPeriod={inPeriod}
                  search={search}
                />
              )}
              {viewMode === 'gl' && (
                <GLView
                  bankTx={bankTx}
                  cardTx={cardTx}
                  contractById={contractById}
                  companyFilter={companyFilter}
                  inPeriod={inPeriod}
                />
              )}
            </div>
          </div>
        </div>

        <BottomBar
          left={
            viewMode === 'gl' ? (
              <>
                <button
                  className="btn"
                  type="button"
                  onClick={handleGlExcelExport}
                  title="총계정원장 전체 분개 엑셀 다운로드 (회사·기간 필터 반영)"
                >
                  <FileXls size={14} weight="bold" /> 엑셀
                </button>
                <span className="btn-sep" />
                <span className="dim" style={{ fontSize: 11 }}>
                  총계정원장은 자동 분개 (계좌·자동이체·카드매출·법인카드에서 생성) — 수기 등록 불가
                </span>
              </>
            ) : (
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
                <button className="btn" type="button" disabled title="자금일보 view 에서 엑셀 다운로드 가능 — 우측 [자금일보] 탭 클릭">
                  <FileXls size={14} weight="bold" /> 엑셀
                </button>
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
            )
          }
          right={viewMode === 'gl' ? (
            <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
              차변 합 ₩{fmtNum(glStats.debit)} = 대변 합 ₩{fmtNum(glStats.debit)}
              <span className="dim" style={{ marginLeft: 8, fontWeight: 400 }}>
                (복식부기 검증 · {glStats.entries}분개)
              </span>
            </span>
          ) : null}
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

/* ─────────────────── 거래처 보조원장 (vendor sub-ledger) ─────────────────── */

const VENDOR_KINDS_SUB = ['공급사', '협력사', '외주', '고객', '기타'] as const;

function VendorSubLedgerView({
  bankTx, vendors, contracts, contractById, companyFilter, companyMaster, inPeriod, search,
}: {
  bankTx: BankTransaction[];
  vendors: Vendor[];
  contracts: Contract[];
  contractById: Map<string, Contract>;
  companyFilter: string;
  companyMaster: Company[];
  inPeriod: (date: string) => boolean;
  search: string;
}) {
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const { add: addVendor, update: updateVendor } = useVendors();
  const [vDialogOpen, setVDialogOpen] = useState(false);
  const [vEditing, setVEditing] = useState<Vendor | null>(null);
  const [vInitial, setVInitial] = useState<Record<string, string>>({});
  const [vMode, setVMode] = useState<'view' | 'edit' | 'create'>('create');
  const companyOptions = useMemo(() => companyMaster.map((c) => c.code), [companyMaster]);

  function openVendorCreate(prefillName?: string) {
    setVEditing(null);
    setVMode('create');
    setVInitial(prefillName ? { name: prefillName } : {});
    setVDialogOpen(true);
  }
  function openVendorEdit(v: Vendor) {
    setVEditing(v);
    setVMode('view');
    setVInitial({
      name: v.name ?? '',
      kind: v.kind ?? '',
      bizNo: v.bizNo ?? '',
      ceo: v.ceo ?? '',
      bizType: v.bizType ?? '',
      bizCategory: v.bizCategory ?? '',
      address: v.address ?? '',
      phone: v.phone ?? '',
      email: v.email ?? '',
      companyCode: v.companyCode ?? '',
      notes: v.notes ?? '',
    });
    setVDialogOpen(true);
  }
  async function handleVendorSubmit(data: Record<string, string>) {
    const cleanName = (data.name ?? '').trim();
    if (!cleanName) { toast.error('거래처 이름은 필수입니다'); return; }
    const dup = vendors.find((v) => v.name === cleanName && v.id !== vEditing?.id);
    if (dup) { toast.error(`같은 이름의 거래처가 이미 있습니다: ${cleanName}`); return; }
    const payload: Omit<Vendor, 'id'> = {
      name: cleanName,
      kind: (data.kind || undefined) as Vendor['kind'],
      bizNo: data.bizNo || undefined,
      ceo: data.ceo || undefined,
      bizType: data.bizType || undefined,
      bizCategory: data.bizCategory || undefined,
      address: data.address || undefined,
      phone: data.phone || undefined,
      email: data.email || undefined,
      companyCode: (data.companyCode || undefined) as Vendor['companyCode'],
      notes: data.notes || undefined,
      createdAt: vEditing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      if (vEditing) { await updateVendor({ ...payload, id: vEditing.id }); toast.success(`거래처 수정: ${cleanName}`); }
      else { await addVendor(payload); toast.success(`거래처 등록: ${cleanName}`); }
      setVDialogOpen(false);
    } catch (e) { toast.error(`저장 실패: ${(e as Error).message ?? String(e)}`); }
  }
  const vendorFields: FieldDef[] = [
    { key: 'name', label: '거래처명', required: true, colSpan: 2 },
    { key: 'kind', label: '종류', type: 'select', options: VENDOR_KINDS_SUB as unknown as string[], colSpan: 1 },
    { key: 'companyCode', label: '소속 회사', type: 'select', options: companyOptions, colSpan: 1, placeholder: '전체 공유' },
    { key: 'bizNo', label: '사업자번호', colSpan: 2 },
    { key: 'ceo', label: '대표', colSpan: 1 },
    { key: 'phone', label: '전화', colSpan: 1 },
    { key: 'bizType', label: '업태', colSpan: 1 },
    { key: 'bizCategory', label: '종목', colSpan: 1 },
    { key: 'email', label: '이메일', colSpan: 2 },
    { key: 'address', label: '주소', colSpan: 4 },
    { key: 'notes', label: '메모', type: 'textarea', colSpan: 4 },
  ];

  const stats = useMemo(() => {
    const byVendor = new Map<string, {
      totalSpent: number;
      totalReceived: number;
      txCount: number;
      lastTxDate: string;
      transactions: BankTransaction[];
    }>();
    for (const t of bankTx) {
      const linked = (t.linkedCustomerName ?? '').trim();
      if (!linked) continue;
      if (companyFilter !== 'all') {
        const c = t.matchedContractId ? contractById.get(t.matchedContractId) : undefined;
        const co = t.companyCode ?? c?.company;
        if (co !== companyFilter) continue;
      }
      if (!inPeriod((t.txDate ?? '').slice(0, 10))) continue;
      const entry = byVendor.get(linked) ?? {
        totalSpent: 0, totalReceived: 0, txCount: 0, lastTxDate: '', transactions: [],
      };
      entry.totalSpent += t.withdraw ?? 0;
      entry.totalReceived += t.amount ?? 0;
      entry.txCount += 1;
      if ((t.txDate ?? '') > entry.lastTxDate) entry.lastTxDate = t.txDate ?? '';
      entry.transactions.push(t);
      byVendor.set(linked, entry);
    }
    return byVendor;
  }, [bankTx, companyFilter, contractById, inPeriod]);

  const vendorListRaw = useMemo(() => {
    const known = new Set(vendors.map((v) => v.name.trim()));
    const all = new Set<string>([...known, ...Array.from(stats.keys())]);
    return Array.from(all)
      .filter((name) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return name.toLowerCase().includes(q);
      })
      .map((name) => {
        const v = vendors.find((x) => x.name.trim() === name);
        const s = stats.get(name);
        return {
          name,
          kind: v?.kind,
          companyCode: v?.companyCode,
          bizNo: v?.bizNo,
          totalSpent: s?.totalSpent ?? 0,
          totalReceived: s?.totalReceived ?? 0,
          txCount: s?.txCount ?? 0,
          lastTxDate: s?.lastTxDate ?? '',
          isUnregistered: !v,
        };
      })
      .sort((a, b) => {
        if ((b.txCount > 0 ? 1 : 0) !== (a.txCount > 0 ? 1 : 0)) {
          return (b.txCount > 0 ? 1 : 0) - (a.txCount > 0 ? 1 : 0);
        }
        return b.totalSpent - a.totalSpent;
      });
  }, [vendors, stats, search]);

  // 첫 거래처 자동 선택 (현재 선택이 list 에 없으면)
  useEffect(() => {
    if (selectedVendor && vendorListRaw.some((v) => v.name === selectedVendor)) return;
    setSelectedVendor(vendorListRaw[0]?.name ?? null);
  }, [vendorListRaw, selectedVendor]);

  const selectedTx = selectedVendor ? (stats.get(selectedVendor)?.transactions ?? []) : [];
  const sortedTx = [...selectedTx].sort((a, b) => (b.txDate ?? '').localeCompare(a.txDate ?? ''));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 12, height: 'calc(100vh - 220px)', minHeight: 460 }}>
      {/* 좌 — 거래처 목록 */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '6px 8px 6px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-sunken)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1 }}>거래처 ({vendorListRaw.length})</span>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => openVendorCreate()}
            title="거래처 등록"
            style={{ padding: '2px 8px', fontSize: 11 }}
          >
            + 등록
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {vendorListRaw.length === 0 ? (
            <div className="muted center" style={{ padding: 24, fontSize: 12 }}>
              등록된 거래처가 없습니다 — 위 [+ 등록] 으로 시작하세요.
            </div>
          ) : vendorListRaw.map((v) => {
            const isActive = selectedVendor === v.name;
            const existing = vendors.find((x) => x.name === v.name);
            return (
              <button
                key={v.name}
                type="button"
                onClick={() => setSelectedVendor(v.name)}
                onDoubleClick={() => existing ? openVendorEdit(existing) : openVendorCreate(v.name)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 12px',
                  background: isActive ? 'var(--brand-bg)' : 'var(--bg-card)',
                  color: isActive ? 'var(--brand)' : 'inherit',
                  border: 'none', borderBottom: '1px solid var(--border-soft)',
                  cursor: 'pointer', fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.name}
                  </span>
                  {v.kind && <span className="dim" style={{ fontSize: 10 }}>{v.kind}</span>}
                  {v.isUnregistered && <span style={{ fontSize: 10, color: 'var(--orange-text)' }}>미등록</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 2, fontSize: 11, color: isActive ? 'inherit' : 'var(--text-sub)' }}>
                  <span>지출 <strong className="mono">{fmtNum(v.totalSpent)}</strong></span>
                  {v.totalReceived > 0 && <span>· 수입 <strong className="mono">{fmtNum(v.totalReceived)}</strong></span>}
                  <span style={{ marginLeft: 'auto' }}>{v.txCount}건</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 우 — 선택된 거래처 타임라인 */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {!selectedVendor ? (
          <div className="muted center" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
            좌측에서 거래처 선택
          </div>
        ) : (
          <>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-sunken)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <strong style={{ fontSize: 14 }}>{selectedVendor}</strong>
                {(() => {
                  const v = vendors.find((x) => x.name.trim() === selectedVendor);
                  return v ? (
                    <>
                      {v.kind && <span className="dim" style={{ fontSize: 11 }}>{v.kind}</span>}
                      {v.bizNo && <span className="mono dim" style={{ fontSize: 11 }}>{v.bizNo}</span>}
                    </>
                  ) : <span style={{ fontSize: 11, color: 'var(--orange-text)' }}>마스터 미등록 — 자금일보 거래상대 검색에서 [+ 거래처 등록]</span>;
                })()}
                <span style={{ flex: 1 }} />
                <span className="dim" style={{ fontSize: 11 }}>
                  누적 지출 <strong className="mono">₩{fmtNum(stats.get(selectedVendor)?.totalSpent ?? 0)}</strong>
                  {(stats.get(selectedVendor)?.totalReceived ?? 0) > 0 && (
                    <> · 수입 <strong className="mono">₩{fmtNum(stats.get(selectedVendor)?.totalReceived ?? 0)}</strong></>
                  )}
                  {' · '}{sortedTx.length}건
                </span>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table className="table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>거래일</th>
                    <th style={{ width: 60 }}>회사</th>
                    <th className="num" style={{ width: 110 }}>출금</th>
                    <th className="num" style={{ width: 110 }}>입금</th>
                    <th style={{ width: 100 }}>계정과목</th>
                    <th>적요</th>
                    <th style={{ width: 110 }}>매칭 계약</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTx.length === 0 ? (
                    <tr><td colSpan={7} className="muted center" style={{ padding: 24 }}>이 거래처와의 거래 내역 없음</td></tr>
                  ) : sortedTx.map((t) => {
                    const c = t.matchedContractId ? contractById.get(t.matchedContractId) : undefined;
                    const co = t.companyCode || c?.company;
                    return (
                      <tr key={t.id}>
                        <td className="mono">{(t.txDate ?? '').slice(0, 10)}</td>
                        <td className="dim">{co ? displayCompanyName(co, companyMaster) : '-'}</td>
                        <td className="num mono" style={{ color: (t.withdraw ?? 0) > 0 ? 'var(--red-text)' : 'var(--text-weak)' }}>
                          {fmtNum(t.withdraw ?? 0) || '-'}
                        </td>
                        <td className="num mono" style={{ color: (t.amount ?? 0) > 0 ? 'var(--green-text)' : 'var(--text-weak)' }}>
                          {fmtNum(t.amount ?? 0) || '-'}
                        </td>
                        <td className="dim">{t.subject || '-'}</td>
                        <td className="dim">{t.memo || t.counterparty || '-'}</td>
                        <td className="mono dim" style={{ fontSize: 11 }}>{c ? c.contractNo : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <EntityFormDialog
        open={vDialogOpen}
        onOpenChange={setVDialogOpen}
        title={vEditing ? `거래처 — ${vEditing.name}` : '거래처 등록'}
        mode={vMode}
        fields={vendorFields}
        initial={vInitial}
        size="lg"
        onSubmit={handleVendorSubmit}
      />
    </div>
  );
}

/* ─────────────────── GL — 총계정원장 (자동분개) ─────────────────── */

function GLView({
  bankTx, cardTx, contractById, companyFilter, inPeriod,
}: {
  bankTx: BankTransaction[];
  cardTx: CardTransaction[];
  contractById: Map<string, Contract>;
  companyFilter: string;
  inPeriod: (date: string) => boolean;
}) {
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  const journals = useMemo(() => {
    const all = buildAllJournals(bankTx, cardTx);
    return all.filter((j) => {
      if (!inPeriod((j.date ?? '').slice(0, 10))) return false;
      if (companyFilter !== 'all') {
        const c = j.matchedContractId ? contractById.get(j.matchedContractId) : undefined;
        const co = j.companyCode ?? c?.company;
        if (co !== companyFilter) return false;
      }
      return true;
    });
  }, [bankTx, cardTx, contractById, companyFilter, inPeriod]);

  const summary = useMemo(() => summarizeByAccount(journals), [journals]);

  // 첫 계정 자동 선택 — 우측 빈 화면 방지
  useEffect(() => {
    if (selectedAccount) {
      const exists = summary.some((s) => s.accountKey === selectedAccount);
      if (exists) return;
    }
    if (summary.length > 0) {
      setSelectedAccount(summary[0].accountKey);
    } else {
      setSelectedAccount(null);
    }
  }, [summary, selectedAccount]);

  const groupedSummary = useMemo(() => {
    const groups = new Map<AccountClass, LedgerSummary[]>();
    for (const s of summary) {
      const arr = groups.get(s.account.class) ?? [];
      arr.push(s);
      groups.set(s.account.class, arr);
    }
    return groups;
  }, [summary]);

  const classTotals = useMemo(() => {
    const totals = new Map<AccountClass, { debit: number; credit: number; balance: number }>();
    for (const s of summary) {
      const t = totals.get(s.account.class) ?? { debit: 0, credit: 0, balance: 0 };
      t.debit += s.debit;
      t.credit += s.credit;
      t.balance += s.balance;
      totals.set(s.account.class, t);
    }
    return totals;
  }, [summary]);

  const selectedJournals = useMemo(() => {
    if (!selectedAccount) return [];
    return journals
      .filter((j) => j.debitAccount === selectedAccount || j.creditAccount === selectedAccount)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }, [journals, selectedAccount]);

  const totalDebit = journals.reduce((s, j) => s + j.amount, 0);
  const totalCredit = totalDebit;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 12, height: 'calc(100vh - 220px)', minHeight: 460 }}>
      <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-sunken)', fontSize: 12, fontWeight: 700 }}>
          총계정원장 ({summary.length}계정 · {journals.length}분개)
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {(['asset', 'liability', 'revenue', 'expense', 'equity'] as AccountClass[]).map((cls) => {
            const accounts = groupedSummary.get(cls) ?? [];
            if (accounts.length === 0) return null;
            const total = classTotals.get(cls) ?? { debit: 0, credit: 0, balance: 0 };
            return (
              <div key={cls}>
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 8,
                  padding: '6px 12px', background: 'var(--bg-page)',
                  borderTop: '1px solid var(--border-soft)',
                  borderBottom: '1px solid var(--border-soft)',
                  fontSize: 11, fontWeight: 700, color: 'var(--text-sub)',
                }}>
                  <span>{CLASS_LABEL[cls]}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>
                    잔액 ₩{fmtNum(Math.abs(total.balance))}
                  </span>
                </div>
                {accounts.map((s) => {
                  const isActive = selectedAccount === s.accountKey;
                  return (
                    <button
                      key={s.accountKey}
                      type="button"
                      onClick={() => setSelectedAccount(isActive ? null : s.accountKey)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '6px 12px',
                        background: isActive ? 'var(--brand-bg)' : 'var(--bg-card)',
                        color: isActive ? 'var(--brand)' : 'inherit',
                        border: 'none', borderBottom: '1px solid var(--border-soft)',
                        cursor: 'pointer', fontSize: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="mono dim" style={{ fontSize: 11 }}>{s.account.code}</span>
                        <span style={{ fontWeight: 600, flex: 1 }}>{s.account.name}</span>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                          color: s.balance === 0 ? 'var(--text-weak)'
                            : (s.normalSide === 'debit' ? (s.balance > 0 ? 'var(--text-main)' : 'var(--red-text)')
                              : (s.balance < 0 ? 'var(--text-main)' : 'var(--red-text)')),
                        }}>
                          {fmtNum(Math.abs(s.balance))}
                        </span>
                      </div>
                      <div className="dim" style={{ fontSize: 10, display: 'flex', gap: 8, marginTop: 2 }}>
                        <span>차변 {fmtNum(s.debit)}</span>
                        <span>대변 {fmtNum(s.credit)}</span>
                        <span style={{ marginLeft: 'auto' }}>{s.entryCount}건</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
          {summary.length === 0 && (
            <div className="muted center" style={{ padding: 24, fontSize: 12 }}>
              해당 기간 분개 없음
            </div>
          )}
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {!selectedAccount ? (
          <div className="muted center" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
            좌측에서 계정 선택 → 분개 타임라인
          </div>
        ) : (
          <>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-sunken)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span className="mono dim">{ACCOUNTS[selectedAccount]?.code}</span>
                <strong style={{ fontSize: 14 }}>{ACCOUNTS[selectedAccount]?.name}</strong>
                <span className="dim" style={{ fontSize: 11 }}>{CLASS_LABEL[ACCOUNTS[selectedAccount]?.class]}</span>
                <span style={{ flex: 1 }} />
                <span className="dim" style={{ fontSize: 11 }}>{selectedJournals.length}분개</span>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table className="table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>거래일</th>
                    <th style={{ width: 60 }}>구분</th>
                    <th>적요/거래상대</th>
                    <th className="num" style={{ width: 110 }}>차변</th>
                    <th className="num" style={{ width: 110 }}>대변</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedJournals.length === 0 ? (
                    <tr><td colSpan={5} className="muted center" style={{ padding: 24 }}>해당 계정 분개 없음</td></tr>
                  ) : selectedJournals.map((j) => {
                    const isDebit = j.debitAccount === selectedAccount;
                    return (
                      <tr key={j.txId}>
                        <td className="mono">{(j.date ?? '').slice(0, 10)}</td>
                        <td className="dim">{j.source === 'bank' ? '계좌' : '카드'}</td>
                        <td>
                          {j.memo || j.counterparty || '-'}
                          {j.counterparty && j.memo && (
                            <span className="dim" style={{ marginLeft: 6 }}>· {j.counterparty}</span>
                          )}
                        </td>
                        <td className="num mono" style={{ color: isDebit ? 'var(--text-main)' : 'var(--text-weak)' }}>
                          {isDebit ? fmtNum(j.amount) : '-'}
                        </td>
                        <td className="num mono" style={{ color: !isDebit ? 'var(--text-main)' : 'var(--text-weak)' }}>
                          {!isDebit ? fmtNum(j.amount) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────── 임차인 보조원장 (customer sub-ledger) ─────────────────── */

type CustomerStatus = '계약유지' | '정상종료' | '비정상종료';

function customerStatusOf(c: Contract): CustomerStatus {
  // 계약유지중 = 운행 OR 대기
  if (c.status === '운행' || c.status === '대기') return '계약유지';
  // 채권 또는 미수금 > 0 인 채로 종결 = 비정상종료
  if (c.status === '채권') return '비정상종료';
  if ((c.unpaidAmount ?? 0) > 0) return '비정상종료';
  // 그 외 종료 (반납·해지·매각 등) + 미수 없음 = 정상종료
  return '정상종료';
}

const STATUS_TONE: Record<CustomerStatus, { bg: string; text: string }> = {
  '계약유지': { bg: 'var(--brand-bg)', text: 'var(--brand)' },
  '정상종료': { bg: 'var(--green-bg)', text: 'var(--green-text)' },
  '비정상종료': { bg: 'var(--red-bg)', text: 'var(--red-text)' },
};

function CustomerSubLedgerView({
  bankTx, cardTx, contracts, contractById, companyFilter, companyMaster, inPeriod, search,
}: {
  bankTx: BankTransaction[];
  cardTx: CardTransaction[];
  contracts: Contract[];
  contractById: Map<string, Contract>;
  companyFilter: string;
  companyMaster: Company[];
  inPeriod: (date: string) => boolean;
  search: string;
}) {
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | 'all'>('all');

  // 임차인(계약자) 단위 집계 — customerName 으로 그룹핑
  const customers = useMemo(() => {
    type Agg = {
      name: string;
      contractList: Contract[];
      totalPaid: number;
      totalUnpaid: number;
      lastTxDate: string;
      // 가장 진행 단계 우선 status
      worstStatus: CustomerStatus;
    };
    const byName = new Map<string, Agg>();

    for (const c of contracts) {
      const name = (c.customerName ?? '').trim();
      if (!name) continue;
      if (companyFilter !== 'all' && c.company !== companyFilter) continue;
      const agg = byName.get(name) ?? {
        name,
        contractList: [],
        totalPaid: 0,
        totalUnpaid: 0,
        lastTxDate: '',
        worstStatus: '정상종료' as CustomerStatus,
      };
      agg.contractList.push(c);
      agg.totalUnpaid += c.unpaidAmount ?? 0;
      const st = customerStatusOf(c);
      // 비정상종료 > 계약유지 > 정상종료 우선
      const priority = { '비정상종료': 0, '계약유지': 1, '정상종료': 2 };
      if (priority[st] < priority[agg.worstStatus]) agg.worstStatus = st;
      byName.set(name, agg);
    }

    // 결제 합계 — bankTx / cardTx 매칭된 거래만
    const nameByContractId = new Map<string, string>();
    for (const c of contracts) nameByContractId.set(c.id, (c.customerName ?? '').trim());
    for (const t of bankTx) {
      if (!t.matchedContractId) continue;
      if (!inPeriod((t.txDate ?? '').slice(0, 10))) continue;
      const name = nameByContractId.get(t.matchedContractId);
      if (!name) continue;
      const agg = byName.get(name);
      if (!agg) continue;
      agg.totalPaid += t.amount ?? 0;
      if ((t.txDate ?? '') > agg.lastTxDate) agg.lastTxDate = t.txDate ?? '';
    }
    for (const t of cardTx) {
      if (!t.matchedContractId) continue;
      if (!inPeriod((t.txDate ?? '').slice(0, 10))) continue;
      const name = nameByContractId.get(t.matchedContractId);
      if (!name) continue;
      const agg = byName.get(name);
      if (!agg) continue;
      agg.totalPaid += t.amount ?? 0;
      if ((t.txDate ?? '') > agg.lastTxDate) agg.lastTxDate = t.txDate ?? '';
    }

    const arr = Array.from(byName.values());
    // 검색 필터
    const q = search.trim().toLowerCase();
    const searched = q ? arr.filter((a) =>
      a.name.toLowerCase().includes(q) ||
      a.contractList.some((c) => (c.vehiclePlate ?? '').toLowerCase().includes(q))
    ) : arr;
    // 상태 필터
    const filtered = statusFilter === 'all' ? searched : searched.filter((a) => a.worstStatus === statusFilter);

    // 정렬: 비정상 위로, 미수 큰 순
    const priority = { '비정상종료': 0, '계약유지': 1, '정상종료': 2 };
    return filtered.sort((a, b) => {
      const p = priority[a.worstStatus] - priority[b.worstStatus];
      if (p !== 0) return p;
      return b.totalUnpaid - a.totalUnpaid;
    });
  }, [contracts, bankTx, cardTx, companyFilter, inPeriod, search, statusFilter]);

  useEffect(() => {
    if (selectedCustomer && customers.some((c) => c.name === selectedCustomer)) return;
    setSelectedCustomer(customers[0]?.name ?? null);
  }, [customers, selectedCustomer]);

  const counts = useMemo(() => {
    const c = { all: 0, 계약유지: 0, 정상종료: 0, 비정상종료: 0 } as Record<string, number>;
    for (const a of customers) {
      c.all += 1;
      c[a.worstStatus] += 1;
    }
    return c;
  }, [customers]);

  const selectedAgg = selectedCustomer ? customers.find((c) => c.name === selectedCustomer) : null;
  // 선택 임차인의 모든 결제 거래 (bankTx + cardTx)
  const selectedTx = useMemo(() => {
    if (!selectedAgg) return [];
    const contractIds = new Set(selectedAgg.contractList.map((c) => c.id));
    type Row = { id: string; source: 'bank' | 'card'; txDate: string; amount: number; contractId: string; memo?: string };
    const out: Row[] = [];
    for (const t of bankTx) {
      if (!t.matchedContractId || !contractIds.has(t.matchedContractId)) continue;
      if (!inPeriod((t.txDate ?? '').slice(0, 10))) continue;
      out.push({ id: t.id, source: 'bank', txDate: t.txDate, amount: t.amount ?? 0, contractId: t.matchedContractId, memo: t.memo || t.counterparty });
    }
    for (const t of cardTx) {
      if (!t.matchedContractId || !contractIds.has(t.matchedContractId)) continue;
      if (!inPeriod((t.txDate ?? '').slice(0, 10))) continue;
      out.push({ id: t.id, source: 'card', txDate: t.txDate, amount: t.amount ?? 0, contractId: t.matchedContractId, memo: t.customerName ?? t.approvalNo });
    }
    return out.sort((a, b) => (b.txDate ?? '').localeCompare(a.txDate ?? ''));
  }, [selectedAgg, bankTx, cardTx, inPeriod]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 12, height: 'calc(100vh - 220px)', minHeight: 460 }}>
      {/* 좌 — 임차인 목록 + 상태 필터 */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-sunken)' }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>임차인 ({customers.length})</div>
          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
            {(['all', '계약유지', '비정상종료', '정상종료'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setStatusFilter(k as CustomerStatus | 'all')}
                style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                  background: statusFilter === k ? 'var(--brand)' : 'var(--bg-card)',
                  color: statusFilter === k ? 'white' : 'var(--text-sub)',
                  border: `1px solid ${statusFilter === k ? 'var(--brand)' : 'var(--border)'}`,
                  cursor: 'pointer',
                }}
              >
                {k === 'all' ? `전체 ${counts.all}` : `${k} ${counts[k] ?? 0}`}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {customers.length === 0 ? (
            <div className="muted center" style={{ padding: 24, fontSize: 12 }}>해당 조건의 임차인 없음</div>
          ) : customers.map((c) => {
            const isActive = selectedCustomer === c.name;
            const tone = STATUS_TONE[c.worstStatus];
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => setSelectedCustomer(c.name)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 12px',
                  background: isActive ? 'var(--brand-bg)' : 'var(--bg-card)',
                  color: isActive ? 'var(--brand)' : 'inherit',
                  border: 'none', borderBottom: '1px solid var(--border-soft)',
                  cursor: 'pointer', fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    padding: '1px 6px', borderRadius: 'var(--radius-sm)',
                    background: tone.bg, color: tone.text,
                  }}>{c.worstStatus}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 2, fontSize: 11, color: isActive ? 'inherit' : 'var(--text-sub)' }}>
                  <span>계약 {c.contractList.length}건</span>
                  {c.totalUnpaid > 0 && <span style={{ color: 'var(--red-text)' }}>미수 {fmtNum(c.totalUnpaid)}</span>}
                  <span style={{ marginLeft: 'auto' }}>입금 {fmtNum(c.totalPaid)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 우 — 선택 임차인의 계약 + 결제 타임라인 */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {!selectedAgg ? (
          <div className="muted center" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
            좌측에서 임차인 선택
          </div>
        ) : (
          <>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-sunken)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <strong style={{ fontSize: 14 }}>{selectedAgg.name}</strong>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                  background: STATUS_TONE[selectedAgg.worstStatus].bg,
                  color: STATUS_TONE[selectedAgg.worstStatus].text,
                }}>{selectedAgg.worstStatus}</span>
                <span style={{ flex: 1 }} />
                <span className="dim" style={{ fontSize: 11 }}>
                  계약 <strong>{selectedAgg.contractList.length}</strong>건 · 누적 입금 <strong className="mono">₩{fmtNum(selectedAgg.totalPaid)}</strong>
                  {selectedAgg.totalUnpaid > 0 && (
                    <> · 미수 <strong className="mono" style={{ color: 'var(--red-text)' }}>₩{fmtNum(selectedAgg.totalUnpaid)}</strong></>
                  )}
                </span>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {/* 임차인의 계약 목록 */}
              <div style={{ padding: '8px 14px 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-sub)' }}>
                계약 ({selectedAgg.contractList.length})
              </div>
              <table className="table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>계약번호</th>
                    <th style={{ width: 100 }}>차량번호</th>
                    <th style={{ width: 60 }}>회사</th>
                    <th style={{ width: 80 }}>계약상태</th>
                    <th style={{ width: 100 }}>계약일</th>
                    <th style={{ width: 100 }}>반납일</th>
                    <th className="num" style={{ width: 110 }}>월 대여료</th>
                    <th className="num" style={{ width: 110 }}>미수금</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedAgg.contractList.map((c) => (
                    <tr key={c.id}>
                      <td className="mono dim">{c.contractNo || '-'}</td>
                      <td className="mono">{c.vehiclePlate || '-'}</td>
                      <td className="dim"><CompanyCell raw={c.company} master={companyMaster} /></td>
                      <td className="dim">{c.status || '-'}</td>
                      <td className="mono dim">{c.contractDate || '-'}</td>
                      <td className="mono dim">{c.returnedDate || (c.returnScheduledDate ? `(예정 ${c.returnScheduledDate})` : '-')}</td>
                      <td className="num mono">{c.monthlyRent ? fmtNum(c.monthlyRent) : '-'}</td>
                      <td className="num mono" style={{ color: (c.unpaidAmount ?? 0) > 0 ? 'var(--red-text)' : 'var(--text-weak)' }}>
                        {(c.unpaidAmount ?? 0) > 0 ? fmtNum(c.unpaidAmount ?? 0) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* 결제 타임라인 */}
              <div style={{ padding: '12px 14px 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-sub)' }}>
                결제 이력 ({selectedTx.length})
              </div>
              <table className="table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>거래일</th>
                    <th style={{ width: 60 }}>구분</th>
                    <th style={{ width: 100 }}>계약번호</th>
                    <th className="num" style={{ width: 110 }}>입금액</th>
                    <th>적요</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTx.length === 0 ? (
                    <tr><td colSpan={5} className="muted center" style={{ padding: 24 }}>이 임차인의 결제 거래 없음</td></tr>
                  ) : selectedTx.map((t) => {
                    const c = contractById.get(t.contractId);
                    return (
                      <tr key={t.id}>
                        <td className="mono">{(t.txDate ?? '').slice(0, 10)}</td>
                        <td className="dim">{t.source === 'bank' ? '계좌' : '카드'}</td>
                        <td className="mono dim">{c?.contractNo || '-'}</td>
                        <td className="num mono" style={{ color: 'var(--green-text)' }}>{fmtNum(t.amount)}</td>
                        <td className="dim">{t.memo || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
