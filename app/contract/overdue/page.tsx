'use client';

/**
 * /contract/overdue — 미수금 (계약 마스터 시각).
 * 기존 /receivables 페이지와 같은 데이터(Contract.unpaidAmount > 0) 를 본다.
 * /receivables 는 리스크 액션 중심, 여기는 계약 마스터 관점에서 미수액 정렬.
 */

import { useMemo, useState } from 'react';
import { Warning, FileXls, MagnifyingGlass, Copy, PaperPlaneTilt } from '@phosphor-icons/react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import Link from 'next/link';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { CONTRACT_SUB } from '@/components/layout/sub-nav';
import { BottomBar } from '@/components/layout/bottom-bar';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { displayCompanyName } from '@/lib/company-display';
import { StatusBadge } from '@/components/ui/status-badge';
import { contractStatusTone } from '@/lib/status-tones';
import { downloadContractsExcel } from '@/lib/contract-export';

export default function ContractOverduePage() {
  const { contracts } = useContracts();
  const { companies: companyMaster } = useCompanies();
  const [bucket, setBucket] = useState<'all' | 'high' | 'mid' | 'low'>('all');
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number; row: typeof contracts[number] | null }>({ open: false, x: 0, y: 0, row: null });

  const allOverdue = useMemo(() => {
    return contracts
      .filter((c) => (c.unpaidAmount ?? 0) > 0 || (c.unpaidSeqCount ?? 0) > 0)
      .sort((a, b) => (b.unpaidAmount ?? 0) - (a.unpaidAmount ?? 0));
  }, [contracts]);

  const high = allOverdue.filter((c) => (c.unpaidSeqCount ?? 0) >= 3);
  const mid = allOverdue.filter((c) => (c.unpaidSeqCount ?? 0) === 2);
  const low = allOverdue.filter((c) => (c.unpaidSeqCount ?? 0) <= 1);

  const overdue = bucket === 'high' ? high : bucket === 'mid' ? mid : bucket === 'low' ? low : allOverdue;
  const total = overdue.reduce((s, c) => s + (c.unpaidAmount ?? 0), 0);

  return (
    <MasterPageShell
      title="미수금 (계약 마스터)"
      icon={<Warning size={16} weight="fill" style={{ color: 'var(--red-text)' }} />}
      subNav={CONTRACT_SUB}
      quickFilters={
        <>
          <button type="button" className={`chip ${bucket === 'all' ? 'active' : ''}`} onClick={() => setBucket('all')}>
            전체<span className="chip-count">{allOverdue.length}</span>
          </button>
          <button type="button" className={`chip chip-tone-red ${bucket === 'high' ? 'active' : ''}`} onClick={() => setBucket('high')}>
            3회+<span className="chip-count">{high.length}</span>
          </button>
          <button type="button" className={`chip chip-tone-orange ${bucket === 'mid' ? 'active' : ''}`} onClick={() => setBucket('mid')}>
            2회<span className="chip-count">{mid.length}</span>
          </button>
          <button type="button" className={`chip chip-tone-amber ${bucket === 'low' ? 'active' : ''}`} onClick={() => setBucket('low')}>
            1회<span className="chip-count">{low.length}</span>
          </button>
        </>
      }
      stats={
        <>
          <span>총 미수<strong className="mono" style={{ color: 'var(--red-text)' }}>₩{total.toLocaleString()}</strong></span>
        </>
      }
      bottomBar={
        <BottomBar
          left={
            <>
              <button
                className="btn"
                type="button"
                disabled={overdue.length === 0}
                title={`현재 페이지 목록 (${overdue.length}건) 엑셀 다운로드`}
                onClick={() => downloadContractsExcel(overdue, companyMaster, {
                  title: `미수금 — ${bucket === 'all' ? '전체' : bucket === 'high' ? '심각(3회+)' : bucket === 'mid' ? '주의(2회)' : '경증(1회)'}`,
                  fileName: `미수금-${bucket === 'all' ? '전체' : bucket === 'high' ? '심각' : bucket === 'mid' ? '주의' : '경증'}`,
                  sheetName: '미수금',
                  filter: bucket === 'all' ? undefined : `${overdue.length}건`,
                })}
              >
                <FileXls size={14} weight="bold" /> 엑셀 <span className="chip-count">{overdue.length}</span>
              </button>
              <span className="btn-sep" />
              <Link href="/receivables" className="btn">→ 리스크 관리로 (액션 중심)</Link>
            </>
          }
          right={null}
        />
      }
    >
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 56 }}>회사</th>
            <th style={{ width: 96 }}>차량번호</th>
            <th>계약자</th>
            <th style={{ width: 110 }}>연락처</th>
            <th className="num" style={{ width: 110 }}>월 대여료</th>
            <th className="num" style={{ width: 64 }}>미납회차</th>
            <th className="num" style={{ width: 130 }}>미수금</th>
            <th style={{ width: 110 }}>최근 결제일</th>
            <th style={{ width: 60 }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {overdue.length === 0 ? (
            <tr><td colSpan={9} className="muted center" style={{ padding: 32 }}>미수금 계약 없음</td></tr>
          ) : overdue.map((c) => (
            <tr key={c.id} onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ open: true, x: e.clientX, y: e.clientY, row: c }); }} style={{ cursor: 'context-menu' }}>
              <td className="dim">{c.company ? displayCompanyName(c.company, companyMaster) : '-'}</td>
              <td className="mono">{c.vehiclePlate}</td>
              <td>{c.customerName}</td>
              <td className="mono dim">{c.customerPhone1 || '-'}</td>
              <td className="num mono">₩{(c.monthlyRent ?? 0).toLocaleString()}</td>
              <td className="num">{c.unpaidSeqCount ?? 0}</td>
              <td className="num mono" style={{ color: 'var(--red-text)', fontWeight: 700 }}>
                ₩{(c.unpaidAmount ?? 0).toLocaleString()}
              </td>
              <td className="mono dim">{c.lastPaidDate || '-'}</td>
              <td><StatusBadge tone={contractStatusTone(c.status)}>{c.status}</StatusBadge></td>
            </tr>
          ))}
        </tbody>
      </table>
      <ContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        onClose={() => setCtxMenu({ open: false, x: 0, y: 0, row: null })}
        items={ctxMenu.row ? ([
          { label: '운영현황에서 보기', icon: <MagnifyingGlass size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.vehiclePlate) window.location.href = `/?q=${encodeURIComponent(ctxMenu.row.vehiclePlate)}`; } },
          { type: 'separator' },
          { label: '연락처 복사', icon: <Copy size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.customerPhone1) navigator.clipboard.writeText(ctxMenu.row.customerPhone1); }, disabled: !ctxMenu.row.customerPhone1 },
          { label: '미수 정보 복사', icon: <Copy size={12} weight="bold" />, onClick: () => {
            const r = ctxMenu.row;
            if (!r) return;
            navigator.clipboard.writeText(`${r.vehiclePlate} · ${r.customerName} · 미수 ₩${(r.unpaidAmount ?? 0).toLocaleString()} (${r.unpaidSeqCount ?? 0}회차)`);
          } },
          { type: 'separator' },
          { label: '미수 관리 (액션 중심)', icon: <PaperPlaneTilt size={12} weight="bold" />, onClick: () => { if (ctxMenu.row?.vehiclePlate) window.location.href = `/receivables?q=${encodeURIComponent(ctxMenu.row.vehiclePlate)}`; } },
        ] satisfies ContextMenuItem[]) : []}
      />
    </MasterPageShell>
  );
}
