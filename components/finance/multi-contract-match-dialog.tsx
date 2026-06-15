'use client';

/**
 * 거래 1건 → 여러 계약 분할 매칭 다이얼로그.
 *
 * 사용 예: 회사 일괄결제로 5개 계약 합산 250만원 한 번에 입금.
 * 각 (계약, 금액) 입력 → applyMultiContractMatch 헬퍼 호출.
 *
 * UI 패턴:
 *  · 거래 정보 (금액·입금자·적요) 상단 고정
 *  · split 목록 — 계약 검색 input + 금액 input
 *  · 합계 / 남은 금액 표시
 *  · [+ 분할 추가] / [저장] / [취소]
 */

import { useMemo, useState } from 'react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { MagnifyingGlass, Plus, X } from '@phosphor-icons/react';
import { applyMultiContractMatch } from '@/lib/firebase/tx-contract-sync';
import { toast } from '@/lib/toast';
import { formatCurrency } from '@/lib/utils';
import type { BankTransaction, Contract } from '@/lib/types';

type Split = { contractId: string; amount: number; query: string };

export function MultiContractMatchDialog({
  tx, contracts, updateBank, updateContract, onClose,
}: {
  tx: BankTransaction;
  contracts: Contract[];
  updateBank: (id: string, patch: Partial<BankTransaction>) => Promise<void> | void;
  updateContract: (c: Contract) => Promise<void> | void;
  onClose: () => void;
}) {
  const [splits, setSplits] = useState<Split[]>(() => {
    // 기존 multi-match 있으면 복원, 단일이면 첫 행만
    if (tx.matches && tx.matches.length > 0) {
      return tx.matches.map((m) => ({ contractId: m.contractId, amount: m.amount, query: '' }));
    }
    if (tx.matchedContractId) {
      return [{ contractId: tx.matchedContractId, amount: tx.amount, query: '' }];
    }
    return [{ contractId: '', amount: 0, query: '' }];
  });
  const [saving, setSaving] = useState(false);

  const totalAssigned = splits.reduce((s, x) => s + (x.amount || 0), 0);
  const remaining = tx.amount - totalAssigned;

  function updateSplit(i: number, patch: Partial<Split>) {
    setSplits((prev) => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }

  function removeSplit(i: number) {
    setSplits((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addSplit() {
    setSplits((prev) => [...prev, { contractId: '', amount: Math.max(0, remaining), query: '' }]);
  }

  async function handleSave() {
    const valid = splits.filter((s) => s.contractId && s.amount > 0);
    if (valid.length === 0) { toast.warning('계약과 금액을 입력하세요'); return; }
    if (totalAssigned > tx.amount) { toast.warning('분할 합계가 거래액보다 큽니다'); return; }
    setSaving(true);
    try {
      await applyMultiContractMatch(
        tx,
        valid.map(({ contractId, amount }) => ({ contractId, amount })),
        contracts,
        updateBank,
        updateContract,
      );
      toast.success(`${valid.length}개 계약에 분할 매칭 완료`);
      onClose();
    } catch (e) {
      toast.error(`매칭 실패: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogRoot open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent title="거래 분할 매칭" mode="edit">
        <DialogBody style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section style={{
            padding: 12, background: 'var(--bg-sunken)', borderRadius: 'var(--radius)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 2 }}>{tx.txDate} · {tx.counterparty || '입금자 미상'}</div>
              {tx.memo && <div style={{ fontSize: 12, color: 'var(--text-main)' }}>{tx.memo}</div>}
            </div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--brand)' }}>
              ₩{formatCurrency(tx.amount)}
            </div>
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>분할 ({splits.length})</span>
              <button type="button" className="btn btn-sm" onClick={addSplit}>
                <Plus size={11} weight="bold" /> 행 추가
              </button>
            </div>
            {splits.map((s, i) => (
              <SplitRow
                key={i}
                split={s}
                contracts={contracts}
                onChange={(p) => updateSplit(i, p)}
                onRemove={splits.length > 1 ? () => removeSplit(i) : undefined}
              />
            ))}
          </section>

          <section style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '10px 12px',
            background: remaining < 0 ? 'var(--red-bg)' : remaining === 0 ? 'var(--green-bg)' : 'var(--bg-card)',
            border: `1px solid ${remaining < 0 ? 'var(--red-text)' : remaining === 0 ? 'var(--green-text)' : 'var(--border)'}`,
            borderRadius: 'var(--radius)',
          }}>
            <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>분할 합계 / 거래액</span>
            <span className="mono" style={{ fontWeight: 600 }}>
              ₩{formatCurrency(totalAssigned)} / ₩{formatCurrency(tx.amount)}
              {remaining !== 0 && (
                <span style={{
                  marginLeft: 8,
                  color: remaining < 0 ? 'var(--red-text)' : 'var(--orange-text)',
                }}>
                  ({remaining > 0 ? '잔여' : '초과'} ₩{formatCurrency(Math.abs(remaining))})
                </span>
              )}
            </span>
          </section>
        </DialogBody>

        <DialogFooter>
          <button type="button" className="btn" onClick={onClose}>취소</button>
          <button type="button" className="btn btn-primary" onClick={handleSave}
            disabled={saving || splits.every((s) => !s.contractId || s.amount <= 0)}>
            {saving ? '처리 중...' : '분할 매칭 저장'}
          </button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

function SplitRow({ split, contracts, onChange, onRemove }: {
  split: Split;
  contracts: Contract[];
  onChange: (patch: Partial<Split>) => void;
  onRemove?: () => void;
}) {
  const selected = split.contractId ? contracts.find((c) => c.id === split.contractId) : null;

  const matches = useMemo(() => {
    const q = split.query.trim().toLowerCase().replace(/[^\w가-힣]/g, '');
    if (!q) return [];
    return contracts
      .filter((c) => `${c.vehiclePlate ?? ''}${c.customerName ?? ''}`.toLowerCase().replace(/[^\w가-힣]/g, '').includes(q))
      .slice(0, 6);
  }, [contracts, split.query]);

  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start',
      padding: 10, background: 'var(--bg-card)',
      border: '1px solid var(--border-soft)', borderRadius: 'var(--radius)',
    }}>
      <div style={{ flex: 1, position: 'relative' }}>
        {selected ? (
          <div style={{
            padding: '6px 10px', background: 'var(--brand-bg)',
            border: '1px solid var(--brand)', borderRadius: 'var(--radius)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>
              <strong className="mono" style={{ marginRight: 6 }}>{selected.vehiclePlate}</strong>
              <span style={{ fontSize: 12 }}>{selected.customerName}</span>
            </span>
            <button type="button" onClick={() => onChange({ contractId: '', query: '' })}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-sub)', cursor: 'pointer', padding: 2 }}>
              <X size={11} />
            </button>
          </div>
        ) : (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', background: 'var(--bg-card)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            }}>
              <MagnifyingGlass size={12} weight="bold" />
              <input
                value={split.query}
                onChange={(e) => onChange({ query: e.target.value })}
                placeholder="차량번호 또는 고객명"
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontFamily: 'inherit' }}
              />
            </div>
            {matches.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                marginTop: 2, zIndex: 10,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                maxHeight: 200, overflow: 'auto',
              }}>
                {matches.map((c) => (
                  <button key={c.id} type="button"
                    onClick={() => onChange({ contractId: c.id, query: '' })}
                    style={{
                      display: 'block', width: '100%',
                      padding: '8px 12px', background: 'transparent', border: 'none',
                      borderBottom: '1px solid var(--border-soft)',
                      cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    }}>
                    <strong className="mono" style={{ marginRight: 6 }}>{c.vehiclePlate}</strong>
                    <span style={{ fontSize: 12 }}>{c.customerName}</span>
                    <span className="dim" style={{ marginLeft: 6, fontSize: 11 }}>
                      미수 ₩{formatCurrency(c.unpaidAmount ?? 0)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <input
        type="text" className="input mono" placeholder="금액"
        value={split.amount > 0 ? split.amount.toLocaleString() : ''}
        onChange={(e) => onChange({ amount: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })}
        onFocus={(e) => e.currentTarget.select()}
        style={{ width: 140, textAlign: 'right' }}
      />

      {onRemove && (
        <button type="button" className="btn btn-sm btn-ghost btn-icon" onClick={onRemove} title="이 분할 제거">
          <X size={11} />
        </button>
      )}
    </div>
  );
}
