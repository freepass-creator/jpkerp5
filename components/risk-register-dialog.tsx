'use client';

/**
 * 리스크 수기 등록 다이얼로그.
 *
 * 리스크는 미수·연체로 **자동 생성**(lib/risk-issues 동적 계산)되지만, 자동에 안 잡히는 건
 * (분쟁·회수불가·연락두절 등)은 계약을 골라 '채권(리스크)'으로 직접 등록한다.
 * 상태값 SSOT — 부모가 markAsDebt 경로로 처리(onRegister).
 */

import { useMemo, useState } from 'react';
import { Warning, MagnifyingGlass } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyRow } from '@/components/ui/empty-row';
import { formatCurrency } from '@/lib/utils';
import type { Contract } from '@/lib/types';

export function RiskRegisterDialog({
  open, onOpenChange, contracts, onRegister,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contracts: Contract[];
  onRegister: (c: Contract) => void;
}) {
  const [q, setQ] = useState('');
  const candidates = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return contracts
      .filter((c) => c.status !== '채권') // 이미 리스크(채권)인 건 제외
      .filter((c) => {
        if (!kw) return true;
        return `${c.vehiclePlate ?? ''} ${c.customerName ?? ''} ${c.customerIdentNo ?? ''}`.toLowerCase().includes(kw);
      })
      .slice(0, 60);
  }, [contracts, q]);

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mode="new"
        title={<><Warning size={16} weight="fill" style={{ color: 'var(--red-text)', verticalAlign: 'middle', marginRight: 6 }} />리스크 수기 등록</>}
      >
        <DialogBody>
          <div className="dim" style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
            리스크는 미수·연체로 <strong>자동 생성</strong>됩니다. 자동에 안 잡히는 건(분쟁·회수불가·연락두절 등)만
            계약을 골라 <strong style={{ color: 'var(--red-text)' }}>채권(리스크)</strong>으로 직접 등록하세요.
          </div>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <MagnifyingGlass size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-weak)' }} />
            <input
              className="input"
              placeholder="차량번호 · 계약자 · 등록번호 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: '100%', paddingLeft: 28 }}
              autoFocus
            />
          </div>
          <div style={{ maxHeight: 340, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>차량번호</th>
                  <th>계약자</th>
                  <th style={{ textAlign: 'center' }}>상태</th>
                  <th style={{ textAlign: 'right' }}>미수</th>
                  <th style={{ width: 92 }} />
                </tr>
              </thead>
              <tbody>
                {candidates.length === 0 ? (
                  <EmptyRow colSpan={5}>{q ? '검색 결과 없음' : '등록 가능한 계약 없음'}</EmptyRow>
                ) : candidates.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{c.vehiclePlate}</td>
                    <td>{c.customerName}</td>
                    <td style={{ textAlign: 'center' }}><StatusBadge tone="neutral">{c.status}</StatusBadge></td>
                    <td style={{ textAlign: 'right' }} className="mono">{(c.unpaidAmount ?? 0) > 0 ? `₩${formatCurrency(c.unpaidAmount ?? 0)}` : '-'}</td>
                    <td>
                      <button className="btn btn-sm btn-danger" type="button" onClick={() => onRegister(c)}>리스크 등록</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild><button className="btn" type="button">닫기</button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
