'use client';

/**
 * 계약 검색 다이얼로그 — 자금일보 매칭 셀의 돋보기 버튼에서 호출.
 *
 * 드롭다운은 계약 수가 많으면 사실상 못 찾으니 검색 패턴으로 통일:
 *   거래처/차량번호/계약번호/입금자별칭 어디서든 부분일치 검색
 *   → 회사필터 자동 적용 (Row 의 companyCode 와 일치)
 *   → 선택 시 onPick(contractId) 호출 후 닫힘.
 */

import { useEffect, useMemo, useState } from 'react';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import type { Contract } from '@/lib/types';

export type ContractSearchDialogProps = {
  open: boolean;
  onClose: () => void;
  contracts: Contract[];
  /** 회사 코드 필터 — 동일 회사 계약만 우선 노출 (해당 없으면 전체) */
  companyCode?: string;
  /** 사전 입력 검색어 (Row.linkedCustomerName 등) */
  initialQuery?: string;
  /** 현재 매칭된 계약 ID — 표시용 (편집 중인 행 컨텍스트) */
  currentContractId?: string;
  /** 선택 시 호출 — contractId 전달 */
  onPick: (contractId: string) => void;
  /** 미매칭 처리(선택 해제) — 표시할지 여부 */
  allowClear?: boolean;
  onClear?: () => void;
};

export function ContractSearchDialog({
  open, onClose, contracts, companyCode, initialQuery, currentContractId, onPick, allowClear, onClear,
}: ContractSearchDialogProps) {
  const [query, setQuery] = useState(initialQuery ?? '');

  useEffect(() => {
    if (open) setQuery(initialQuery ?? '');
  }, [open, initialQuery]);

  const results = useMemo(() => {
    if (!open) return [];
    const q = query.trim().toLowerCase();
    const sameCompany = companyCode
      ? contracts.filter((c) => c.company === companyCode)
      : contracts;
    const pool = sameCompany.length > 0 ? sameCompany : contracts;
    if (!q) return pool.slice(0, 50);
    return pool.filter((c) => {
      const fields: string[] = [
        c.contractNo, c.customerName, c.vehiclePlate, c.vehicleModel,
        ...(c.payerAliases ?? []),
      ].filter(Boolean) as string[];
      return fields.some((f) => f.toLowerCase().includes(q));
    }).slice(0, 100);
  }, [open, query, contracts, companyCode]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          background: 'var(--bg-card, #fff)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 10px 40px rgba(0,0,0,.2)',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
        }}>
          <MagnifyingGlass size={14} weight="bold" />
          <strong style={{ fontSize: 13 }}>계약 검색</strong>
          {companyCode && <span className="dim" style={{ fontSize: 11 }}>· 회사: {companyCode}</span>}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm" onClick={onClose} title="닫기">
            <X size={12} weight="bold" />
          </button>
        </header>

        <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
          <input
            type="search"
            autoFocus
            className="input"
            placeholder="거래처 / 차량번호 / 계약번호 / 입금자 별칭으로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: '100%', fontSize: 13 }}
          />
          <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>
            {query.trim() ? `검색 결과 ${results.length}건` : `최근 ${results.length}건 (검색어 입력 시 필터링)`}
            {companyCode && contracts.filter((c) => c.company === companyCode).length === 0 && (
              <span style={{ marginLeft: 8, color: 'var(--text-warn)' }}>· 동일 회사 계약 없음 → 전체 표시</span>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {results.length === 0 ? (
            <div className="muted center" style={{ padding: 32, fontSize: 12 }}>
              일치하는 계약이 없습니다.
            </div>
          ) : (
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: 90 }}>계약번호</th>
                  <th style={{ width: 90 }}>차량번호</th>
                  <th>거래처</th>
                  <th style={{ width: 60 }}>상태</th>
                </tr>
              </thead>
              <tbody>
                {results.map((c) => {
                  const isCurrent = c.id === currentContractId;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => { onPick(c.id); onClose(); }}
                      style={{
                        cursor: 'pointer',
                        background: isCurrent ? 'var(--brand-bg, #eef2ff)' : undefined,
                      }}
                      title="클릭하여 매칭"
                    >
                      <td className="mono dim">{c.contractNo || '-'}</td>
                      <td className="mono">{c.vehiclePlate || <span className="muted">-</span>}</td>
                      <td>
                        {c.customerName || <span className="muted">-</span>}
                        {c.vehicleModel && <span className="dim" style={{ marginLeft: 6 }}>· {c.vehicleModel}</span>}
                      </td>
                      <td className="dim">{c.status || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <footer style={{
          display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 14px', borderTop: '1px solid var(--border)',
        }}>
          <span className="dim" style={{ fontSize: 11 }}>행 클릭 → 매칭</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {allowClear && onClear && (
              <button type="button" className="btn btn-sm" onClick={() => { onClear(); onClose(); }}>
                미매칭으로 변경
              </button>
            )}
            <button type="button" className="btn btn-sm" onClick={onClose}>
              취소
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
