'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CaretLeft, Warning, Plus, MagnifyingGlass, ArrowsClockwise, Link as LinkIcon } from '@phosphor-icons/react';
import { usePenalties } from '@/lib/firebase/penalty-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { formatCurrency, formatDateFull, dateWithDow } from '@/lib/utils';
import { TODAY } from '@/lib/mock-data';
import { PenaltyRegisterDialog } from '@/components/penalty-register-dialog';
import { PenaltyMatchDialog } from '@/components/penalty-match-dialog';
import type { Penalty, PenaltyStatus } from '@/lib/types-penalty';

const STATUS_FILTERS: (PenaltyStatus | '전체')[] = ['전체', '접수', '계약매칭', '임차인통보', '납부완료', '회사납부', '이의신청'];

export default function PenaltyPage() {
  const { penalties, add, update } = usePenalties();
  const { contracts } = useContracts();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [matching, setMatching] = useState<Penalty | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PenaltyStatus | '전체'>('전체');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return penalties.filter((p) => {
      if (statusFilter !== '전체' && p.status !== statusFilter) return false;
      if (q) {
        const hay = `${p.carNumber} ${p.noticeNo} ${p.issuer} ${p.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [penalties, search, statusFilter]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { 전체: penalties.length };
    for (const s of STATUS_FILTERS) {
      if (s !== '전체') m[s] = penalties.filter((p) => p.status === s).length;
    }
    return m;
  }, [penalties]);

  const totals = useMemo(() => {
    return {
      totalAmount: penalties.reduce((s, p) => s + p.amount, 0),
      pendingAmount: penalties.filter((p) => p.status !== '납부완료').reduce((s, p) => s + p.amount, 0),
    };
  }, [penalties]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="topbar-brand-logo" title="CI 자리">CI</div>
          <div className="topbar-brand-text">
            <div className="name">icar ERP</div>
          </div>
        </div>

        <Link href="/" className="btn btn-sm" style={{ textDecoration: 'none' }}>
          <CaretLeft size={12} /> 메인
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13, color: 'var(--text-main)' }}>
          <Warning size={16} weight="fill" style={{ color: 'var(--orange-text)' }} />
          과태료 업무
        </div>

        <div className="topbar-search" style={{ width: 280 }}>
          <MagnifyingGlass size={14} className="icon" />
          <input
            className="input"
            placeholder="차량번호 / 통지번호 / 발급기관"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-bar">
          {STATUS_FILTERS.map((s) => (
            <button key={s} className={`chip ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>
              {s}
              {(counts[s] ?? 0) > 0 && <span className="chip-count">{counts[s]}</span>}
            </button>
          ))}
        </div>

        <div className="topbar-right">
          <span className="topbar-date">{dateWithDow(TODAY)}</span>
        </div>

        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setRegisterOpen(true)}>
            <Plus size={14} weight="bold" /> 과태료 등록
          </button>
        </div>
      </header>

      <div className="dashboard" style={{ gridTemplateColumns: '1fr' }}>
        <div className="panel">
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 18 }}>
            <Metric label="총 부과액" value={`₩${formatCurrency(totals.totalAmount)}`} />
            <Metric label="미처리 잔액" value={`₩${formatCurrency(totals.pendingAmount)}`} danger />
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-weak)' }}>
              {filtered.length} / {penalties.length}건
            </span>
          </div>
          <div className="panel-body">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 100 }}>발급일</th>
                  <th style={{ width: 110 }}>종류</th>
                  <th>통지번호</th>
                  <th style={{ width: 100 }}>차량번호</th>
                  <th style={{ width: 110 }}>위반일</th>
                  <th>위반 내용</th>
                  <th className="num" style={{ width: 110 }}>금액</th>
                  <th className="center" style={{ width: 90 }}>상태</th>
                  <th style={{ width: 180 }}>매칭 / 임차인</th>
                  <th style={{ width: 100 }} className="center">액션</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="muted center" style={{ padding: 32 }}>
                      과태료 항목이 없습니다. <button className="btn btn-sm btn-primary" onClick={() => setRegisterOpen(true)} style={{ marginLeft: 6 }}>등록</button>
                    </td>
                  </tr>
                ) : filtered.map((p) => {
                  const matched = p.matchedContractId ? contracts.find((c) => c.id === p.matchedContractId) : null;
                  return (
                    <tr key={p.id}>
                      <td className="mono">{formatDateFull(p.issueDate) || '-'}</td>
                      <td>
                        <span className="chip" style={{ height: 18, padding: '0 8px', fontSize: 10 }}>{p.docType}</span>
                      </td>
                      <td className="mono dim" style={{ fontSize: 11 }}>{p.noticeNo}</td>
                      <td className="plate">{p.carNumber}</td>
                      <td className="mono">{formatDateFull(p.violationDate) || '-'}</td>
                      <td className="dim" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.description}>
                        {p.description || '-'}
                      </td>
                      <td className="num mono">₩{formatCurrency(p.amount)}</td>
                      <td className="center">
                        <span className={`status ${statusClass(p.status)}`}>{p.status}</span>
                      </td>
                      <td>
                        {matched ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                            <span className="plate">{matched.vehiclePlate}</span>
                            <span className="text-sub">{matched.customerName}</span>
                          </span>
                        ) : (
                          <span className="muted" style={{ fontSize: 11 }}>미매칭</span>
                        )}
                      </td>
                      <td className="center">
                        <button className="btn btn-sm" onClick={() => setMatching(p)}>
                          <LinkIcon size={11} /> 매칭
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <PenaltyRegisterDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onSubmit={async (p) => {
          await add(p);
          setRegisterOpen(false);
        }}
      />
      <PenaltyMatchDialog
        penalty={matching}
        contracts={contracts}
        onClose={() => setMatching(null)}
        onAssign={async (contractId, status) => {
          if (!matching) return;
          await update({ ...matching, matchedContractId: contractId, status });
          setMatching(null);
        }}
      />
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="metric">
      <span className="label">{label}</span>
      <span className="value" style={{ color: danger ? 'var(--red-text)' : 'var(--text-main)' }}>{value}</span>
    </div>
  );
}

function statusClass(s: PenaltyStatus): string {
  switch (s) {
    case '접수': return '대기';
    case '계약매칭': return '인도대기';
    case '임차인통보': return '미수검';
    case '납부완료': return '정상';
    case '회사납부': return '반납';
    case '이의신청': return '위반';
  }
}
