'use client';

/**
 * 거래상대 통합 검색 다이얼로그 — 자금일보 매칭 셀의 🔍 진입점.
 *
 *  자금일보 한 셀(매칭 계약)에서 거래의 상대방을 동시에 검색:
 *   · 계약(수금 측) — 거래처/차량번호/계약번호/입금자 별칭
 *   · 거래처(지출·지급 측) — vendor 명/종류
 *
 *  방향 hint(direction='deposit'/'withdraw')를 받아 같은 회사 우선 + 권장 분류 노출.
 *  선택 시:
 *   · 계약 → onPickContract(contractId)
 *   · 거래처 → onPickVendor(vendorName)
 *  미매칭 해제는 onClear (선택형).
 */

import { useEffect, useMemo, useState } from 'react';
import { MagnifyingGlass, X, FileText, Wrench } from '@phosphor-icons/react';
import type { Contract, Vendor } from '@/lib/types';

export type CounterpartySearchDialogProps = {
  open: boolean;
  onClose: () => void;
  contracts: Contract[];
  vendors: Vendor[];
  /** 회사 코드 필터 — 동일 회사 결과 우선 (없으면 전체) */
  companyCode?: string;
  /** 사전 입력 검색어 (linkedCustomerName 등) */
  initialQuery?: string;
  /** 거래 방향 — 'deposit'(수금=계약 추천), 'withdraw'(지출=거래처 추천), undefined(중립) */
  direction?: 'deposit' | 'withdraw';
  currentContractId?: string;
  currentVendorName?: string;
  onPickContract: (contractId: string) => void;
  onPickVendor: (vendorName: string) => void;
  onClear?: () => void;
  /** 새 거래처 빠른 등록 entry — 미리 채울 이름 받고 dialog 닫음 */
  onQuickAddVendor?: (suggestedName: string) => void;
};

export function CounterpartySearchDialog({
  open, onClose, contracts, vendors, companyCode, initialQuery,
  direction, currentContractId, currentVendorName, onPickContract, onPickVendor, onClear, onQuickAddVendor,
}: CounterpartySearchDialogProps) {
  const [query, setQuery] = useState(initialQuery ?? '');

  useEffect(() => {
    if (open) setQuery(initialQuery ?? '');
  }, [open, initialQuery]);

  const { contractResults, vendorResults } = useMemo(() => {
    if (!open) return { contractResults: [], vendorResults: [] };
    const q = query.trim().toLowerCase();

    const sameCompanyContracts = companyCode
      ? contracts.filter((c) => c.company === companyCode)
      : contracts;
    const contractPool = sameCompanyContracts.length > 0 ? sameCompanyContracts : contracts;

    const cRes = q
      ? contractPool.filter((c) => {
          const fields = [
            c.contractNo, c.customerName, c.vehiclePlate, c.vehicleModel,
            ...(c.payerAliases ?? []),
          ].filter(Boolean) as string[];
          return fields.some((f) => f.toLowerCase().includes(q));
        }).slice(0, 60)
      : contractPool.slice(0, 30);

    const sameCompanyVendors = companyCode
      ? vendors.filter((v) => !v.companyCode || v.companyCode === companyCode)
      : vendors;
    const vRes = q
      ? sameCompanyVendors.filter((v) => {
          const fields = [v.name, v.kind, v.bizNo].filter(Boolean) as string[];
          return fields.some((f) => f.toLowerCase().includes(q));
        }).slice(0, 60)
      : sameCompanyVendors.slice(0, 30);

    return { contractResults: cRes, vendorResults: vRes };
  }, [open, query, contracts, vendors, companyCode]);

  if (!open) return null;

  // 권장 순서 — direction 에 따라 위에 노출되는 그룹이 다름
  const contractFirst = direction !== 'withdraw';
  const totalCount = contractResults.length + vendorResults.length;

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
          width: 600, maxHeight: '82vh', display: 'flex', flexDirection: 'column',
          background: 'var(--bg-card, #fff)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 10px 40px rgba(0,0,0,.2)',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
        }}>
          <MagnifyingGlass size={14} weight="bold" />
          <strong style={{ fontSize: 13 }}>거래상대 검색</strong>
          <span className="dim" style={{ fontSize: 11 }}>
            · {direction === 'deposit' ? '수금 — 계약자 우선' : direction === 'withdraw' ? '지출 — 거래처 우선' : '계약자·거래처 통합'}
          </span>
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
            placeholder="거래처/차량번호/계약번호/별칭/공급사명 — 부분 일치"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: '100%', fontSize: 13 }}
          />
          <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>
            {query.trim()
              ? `결과 ${totalCount}건 · 계약 ${contractResults.length} + 거래처 ${vendorResults.length}`
              : `최근 ${totalCount}건 표시 — 검색어 입력 시 필터링`}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {totalCount === 0 ? (
            <div className="muted center" style={{ padding: 32, fontSize: 12 }}>
              일치하는 항목 없음 — 우측 하단 [+ 거래처 등록] 으로 신규 추가
            </div>
          ) : (
            <>
              {contractFirst && contractResults.length > 0 && (
                <ContractTable items={contractResults} currentId={currentContractId} onPick={(id) => { onPickContract(id); onClose(); }} />
              )}
              {vendorResults.length > 0 && (
                <VendorTable items={vendorResults} currentName={currentVendorName} onPick={(name) => { onPickVendor(name); onClose(); }} />
              )}
              {!contractFirst && contractResults.length > 0 && (
                <ContractTable items={contractResults} currentId={currentContractId} onPick={(id) => { onPickContract(id); onClose(); }} />
              )}
            </>
          )}
        </div>

        <footer style={{
          display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 14px', borderTop: '1px solid var(--border)',
        }}>
          <span className="dim" style={{ fontSize: 11 }}>행 클릭 → 매칭 적용 후 닫힘</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {onQuickAddVendor && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => { onQuickAddVendor(query.trim()); onClose(); }}
                title="새 거래처(공급사·정비공장) 등록"
              >
                + 거래처 등록
              </button>
            )}
            {(currentContractId || currentVendorName) && onClear && (
              <button type="button" className="btn btn-sm" onClick={() => { onClear(); onClose(); }}>
                매칭 해제
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

function ContractTable({
  items, currentId, onPick,
}: { items: Contract[]; currentId?: string; onPick: (id: string) => void }) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 14px', background: 'var(--bg-sunken)', fontSize: 11, color: 'var(--text-sub)',
      }}>
        <FileText size={11} weight="bold" />
        <span>계약 (수금) — {items.length}건</span>
      </div>
      <table className="table" style={{ fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ width: 90 }}>계약번호</th>
            <th style={{ width: 90 }}>차량번호</th>
            <th>계약자</th>
            <th style={{ width: 60 }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => {
            const isCurrent = c.id === currentId;
            return (
              <tr
                key={c.id}
                onClick={() => onPick(c.id)}
                style={{ cursor: 'pointer', background: isCurrent ? 'var(--brand-bg, #eef2ff)' : undefined }}
                title="클릭하여 계약 매칭"
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
    </div>
  );
}

function VendorTable({
  items, currentName, onPick,
}: { items: Vendor[]; currentName?: string; onPick: (name: string) => void }) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 14px', background: 'var(--bg-sunken)', fontSize: 11, color: 'var(--text-sub)',
      }}>
        <Wrench size={11} weight="bold" />
        <span>거래처 (지출·지급) — {items.length}건</span>
      </div>
      <table className="table" style={{ fontSize: 12 }}>
        <thead>
          <tr>
            <th>거래처명</th>
            <th style={{ width: 110 }}>분류</th>
            <th style={{ width: 130 }}>사업자번호</th>
          </tr>
        </thead>
        <tbody>
          {items.map((v) => {
            const isCurrent = v.name === currentName;
            return (
              <tr
                key={v.id}
                onClick={() => onPick(v.name)}
                style={{ cursor: 'pointer', background: isCurrent ? 'var(--brand-bg, #eef2ff)' : undefined }}
                title="클릭하여 거래처 연결"
              >
                <td>{v.name}</td>
                <td className="dim">{v.kind || '-'}</td>
                <td className="mono dim" style={{ fontSize: 11 }}>{v.bizNo || '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
