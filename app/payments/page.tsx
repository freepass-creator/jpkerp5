'use client';

import { useMemo, useState } from 'react';
import {
  CurrencyKrw, Bank, CreditCard, CheckCircle, Warning, LinkSimple, MagnifyingGlass, Plus,
} from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { CreateDialog } from '@/components/create-dialog';
import { useBankTx, useCardTx } from '@/lib/firebase/transactions-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { formatCurrency, formatDate } from '@/lib/utils';

type Tab = 'bank' | 'card';

export default function PaymentsPage() {
  const [tab, setTab] = useState<Tab>('bank');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [uploadOpen, setUploadOpen] = useState(false);

  const { rows: bankTx } = useBankTx();
  const { rows: cardTx } = useCardTx();
  const { contracts } = useContracts();

  const matched = useMemo(() => {
    const byId = new Map(contracts.map((c) => [c.id, c]));
    return {
      bank: bankTx.map((t) => ({ ...t, contract: t.matchedContractId ? byId.get(t.matchedContractId) : undefined })),
      card: cardTx.map((t) => ({ ...t, contract: t.matchedContractId ? byId.get(t.matchedContractId) : undefined })),
    };
  }, [bankTx, cardTx, contracts]);

  const list = tab === 'bank' ? matched.bank : matched.card;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list
      .filter((r) => {
        if (filter === 'matched' && !r.matchedContractId) return false;
        if (filter === 'unmatched' && r.matchedContractId) return false;
        if (q) {
          const hay = tab === 'bank'
            ? `${(r as typeof matched.bank[number]).counterparty ?? ''} ${(r as typeof matched.bank[number]).memo ?? ''} ${r.contract?.vehiclePlate ?? ''} ${r.contract?.customerName ?? ''}`
            : `${(r as typeof matched.card[number]).customerName ?? ''} ${(r as typeof matched.card[number]).approvalNo ?? ''} ${r.contract?.vehiclePlate ?? ''} ${r.contract?.customerName ?? ''}`;
          if (!hay.toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.txDate.localeCompare(a.txDate));
  }, [list, search, filter, tab, matched]);

  const stats = useMemo(() => {
    const total = list.reduce((s, r) => s + (r.amount ?? 0), 0);
    const matchedCount = list.filter((r) => r.matchedContractId).length;
    const unmatchedAmount = list.filter((r) => !r.matchedContractId).reduce((s, r) => s + (r.amount ?? 0), 0);
    return { total, matchedCount, unmatchedAmount, unmatchedCount: list.length - matchedCount };
  }, [list]);

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 14, color: 'var(--text-main)' }}>
            <CurrencyKrw size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            계좌 관리
          </div>

          <div className="topbar-search">
            <MagnifyingGlass size={14} className="icon" />
            <input
              className="input"
              placeholder="입금자 / 차량 / 고객명 / 적요"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="filter-bar">
            <button type="button" className={`chip ${tab === 'bank' ? 'active' : ''}`} onClick={() => setTab('bank')}>
              <Bank /> 계좌 입금
              {bankTx.length > 0 && <span className="chip-count">{bankTx.length}</span>}
            </button>
            <button type="button" className={`chip ${tab === 'card' ? 'active' : ''}`} onClick={() => setTab('card')}>
              <CreditCard /> 카드 매출
              {cardTx.length > 0 && <span className="chip-count">{cardTx.length}</span>}
            </button>
            <span className="filter-divider" />
            <button type="button" className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>전체</button>
            <button type="button" className={`chip ${filter === 'matched' ? 'active' : ''}`} onClick={() => setFilter('matched')}>매칭됨</button>
            <button type="button" className={`chip ${filter === 'unmatched' ? 'active' : ''}`} onClick={() => setFilter('unmatched')}>미매칭</button>
          </div>
        </header>

        <div className="dashboard" style={{ gridTemplateColumns: '1fr' }}>
          <div className="panel">
            <div className="panel-body">
              <table className="table">
                <thead>
                  <tr>
                    <th className="center" style={{ width: 36 }}>매칭</th>
                    <th style={{ width: 110 }}>일자</th>
                    {tab === 'bank' ? (
                      <>
                        <th>입금자</th>
                        <th>적요</th>
                        <th style={{ width: 80 }}>은행</th>
                      </>
                    ) : (
                      <>
                        <th>고객명</th>
                        <th className="mono">승인번호</th>
                        <th className="mono" style={{ width: 80 }}>카드4자리</th>
                      </>
                    )}
                    <th className="num" style={{ width: 130 }}>금액</th>
                    <th>매칭 계약</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="muted center" style={{ padding: 32 }}>
                        표시할 트랜잭션이 없습니다. 사이드바 → 신규 등록 → 수납 으로 엑셀 업로드.
                      </td>
                    </tr>
                  ) : filtered.map((r) => (
                    <tr key={r.id}>
                      <td className="center">
                        {r.matchedContractId ? (
                          <CheckCircle size={14} weight="fill" style={{ color: 'var(--green-text)' }} />
                        ) : (
                          <Warning size={14} weight="fill" style={{ color: 'var(--orange-text)' }} />
                        )}
                      </td>
                      <td className="mono">{formatDate(r.txDate)}</td>
                      {tab === 'bank' ? (
                        <>
                          <td>{(r as typeof matched.bank[number]).counterparty || '-'}</td>
                          <td className="dim" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{(r as typeof matched.bank[number]).memo || '-'}</td>
                          <td className="dim">{(r as typeof matched.bank[number]).source || '-'}</td>
                        </>
                      ) : (
                        <>
                          <td>{(r as typeof matched.card[number]).customerName || '-'}</td>
                          <td className="mono dim">{(r as typeof matched.card[number]).approvalNo || '-'}</td>
                          <td className="mono dim">{(r as typeof matched.card[number]).cardLast4 || '-'}</td>
                        </>
                      )}
                      <td className="num mono">₩{formatCurrency(r.amount)}</td>
                      <td>
                        {r.contract ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                            <span className="plate">{r.contract.vehiclePlate}</span>
                            <span>{r.contract.customerName}</span>
                          </span>
                        ) : (
                          <button className="btn btn-sm" type="button" disabled title="수동 매칭 — Phase 2">
                            <LinkSimple /> 매칭
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <BottomBar
          left={
            <button className="btn btn-primary" type="button" onClick={() => setUploadOpen(true)}>
              <Plus weight="bold" /> 계좌내역 올리기
            </button>
          }
          right={
            <>
              <span>총 <strong>{list.length}</strong>건</span>
              <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
              <span>합계 <strong className="mono">₩{formatCurrency(stats.total)}</strong></span>
              <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
              <span>매칭됨 <strong style={{ color: 'var(--green-text)' }}>{stats.matchedCount}</strong></span>
              {stats.unmatchedCount > 0 && (
                <>
                  <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
                  <span>미매칭 <strong style={{ color: 'var(--orange-text)' }}>{stats.unmatchedCount}</strong> · ₩<strong className="mono">{formatCurrency(stats.unmatchedAmount)}</strong></span>
                </>
              )}
            </>
          }
        />

        <CreateDialog open={uploadOpen} onOpenChange={setUploadOpen} initialMode="수납" />
      </div>
    </div>
  );
}

