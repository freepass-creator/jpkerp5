'use client';

/**
 * 거래 상세 모달 — BankTransaction 1건이 "어떤 내역으로 이렇게 됐는지" 추적.
 *  · 원본/유래: 은행·계좌·채널·적요·잔액·인식일·업로드
 *  · 회계상태: 계정과목 + 분개상태(미분개/분개/마감)
 *  · 매칭 유래: 계약 schedule.payments[].txId 역스캔 → 실제 낸 회차·금액 (matches[] 분할 포함)
 *  · 집금 정산: settlementRole=deposit → 구성 item·수수료 / item → 집금 parent 링크
 *
 * 페이지 이동 없이 오버레이. payments·finance/daily 표 더블클릭에서 재사용.
 */

import { useMemo } from 'react';
import { LinkSimple, ArrowSquareOut, Receipt, Info } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatCurrency, formatDateFull } from '@/lib/utils';
import { displayCompanyName } from '@/lib/company-display';
import type { BankTransaction, Contract } from '@/lib/types';

/** 분개 상태 — payments/page.tsx ledgerStatus 와 동일 규칙 */
function ledgerStatus(tx: BankTransaction): 'unposted' | 'posted' | 'closed' {
  if (!tx.subject) return 'unposted';
  if (tx.subject && !tx.matchedContractId) return 'posted';
  return 'closed';
}
const STATUS_LABEL = { unposted: '미분개', posted: '분개', closed: '마감' } as const;
const STATUS_TONE = { unposted: 'neutral', posted: 'blue', closed: 'green' } as const;

/** 계좌번호 별명 매칭 (회사 마스터 BankAccount) */
function accountLabel(tx: BankTransaction, companyMaster: Parameters<typeof displayCompanyName>[1]): string {
  const accountNo = (tx.account ?? '').trim();
  const companyKey = tx.companyCode;
  if (companyKey && companyMaster) {
    const co = companyMaster.find((c) => c.code === companyKey || c.name === companyKey);
    const norm = (s: string) => s.replace(/[^0-9]/g, '');
    const matched = co?.accounts?.find((a) => norm(a.accountNo) === norm(accountNo) && norm(accountNo).length > 0);
    if (matched) return `${matched.nickname?.trim() || matched.accountNo}${accountNo ? ` (${accountNo})` : ''}`;
  }
  return accountNo || '-';
}

/** 이 거래(txId)로 실제 채워진 계약 회차 역스캔 — matches[] 분할까지 전부 */
function findScheduleHits(tx: BankTransaction, contracts: Contract[]) {
  const hits: Array<{ contract: Contract; seq: number; amount: number; date: string; synthetic?: boolean }> = [];
  for (const c of contracts) {
    for (const s of c.schedules ?? []) {
      for (const p of s.payments ?? []) {
        if (p.txId === tx.id) hits.push({ contract: c, seq: s.seq, amount: p.amount, date: p.date, synthetic: p.synthetic });
      }
    }
  }
  return hits.sort((a, b) => a.seq - b.seq);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 12, alignItems: 'baseline' }}>
      <span style={{ minWidth: 84, color: 'var(--text-sub)', flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </div>
  );
}

function SubHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-weak)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '12px 0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
      {children}
    </div>
  );
}

export function TransactionDetailDialog({
  tx, open, onOpenChange, contracts, bankTx, companyMaster, onOpenContract,
}: {
  tx: BankTransaction | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contracts: Contract[];
  bankTx: BankTransaction[];
  companyMaster: Parameters<typeof displayCompanyName>[1];
  onOpenContract?: (contractId: string) => void;
}) {
  const hits = useMemo(() => (tx ? findScheduleHits(tx, contracts) : []), [tx, contracts]);
  const settlementItems = useMemo(
    () => (tx?.settlementRole === 'deposit' && tx.settlementId ? bankTx.filter((t) => t.settlementId === tx.settlementId && t.settlementRole === 'item') : []),
    [tx, bankTx],
  );
  const settlementParent = useMemo(
    () => (tx?.settlementRole === 'item' && tx.settlementId ? bankTx.find((t) => t.settlementId === tx.settlementId && t.settlementRole === 'deposit') : undefined),
    [tx, bankTx],
  );

  if (!tx) return null;
  const isDeposit = (tx.amount ?? 0) > 0;
  const isWithdraw = (tx.withdraw ?? 0) > 0;
  const status = ledgerStatus(tx);
  const matched = tx.matchedContractId ? contracts.find((c) => c.id === tx.matchedContractId) : undefined;

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent title="거래 상세 — 유래 추적" mode="view" size="lg">
        <DialogBody>
          {/* 헤더 요약 */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            <span className="mono" style={{ fontSize: 13 }}>{formatDateFull(tx.txDate)}</span>
            {isDeposit && <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--green-text)' }}>입금 ₩{formatCurrency(tx.amount)}</span>}
            {isWithdraw && <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--red-text)' }}>출금 ₩{formatCurrency(tx.withdraw!)}</span>}
            <span style={{ fontSize: 13 }}>{tx.counterparty || '(상대 미상)'}</span>
            <StatusBadge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusBadge>
          </div>

          {/* 원본/유래 */}
          <SubHead><Info size={12} weight="duotone" /> 원본 · 유래</SubHead>
          <Row label="계좌">{accountLabel(tx, companyMaster)}</Row>
          <Row label="채널/은행">{tx.source || '-'}{tx.method ? ` · ${tx.method}` : ''}</Row>
          <Row label="회사">{tx.companyCode ? displayCompanyName(tx.companyCode, companyMaster) : <span className="muted">(미지정)</span>}</Row>
          <Row label="적요">{tx.memo || <span className="muted">-</span>}</Row>
          {tx.note && <Row label="메모">{tx.note}</Row>}
          <Row label="거래후 잔액">{tx.balance ? <span className="mono">₩{formatCurrency(tx.balance)}</span> : <span className="muted">-</span>}</Row>
          {tx.accountedDate && tx.accountedDate !== tx.txDate && <Row label="회계인식일"><span className="mono">{tx.accountedDate}</span></Row>}
          {(tx.linkedVehiclePlate || tx.linkedCustomerName) && (
            <Row label="수기 연결">{[tx.linkedVehiclePlate, tx.linkedCustomerName].filter(Boolean).join(' · ')}</Row>
          )}
          {tx.importedAt && <Row label="업로드"><span className="mono dim" style={{ fontSize: 11 }}>{tx.importedAt.slice(0, 19).replace('T', ' ')}{tx.importedBy ? ` · ${tx.importedBy}` : ''}</span></Row>}

          {/* 회계 상태 */}
          <SubHead><Receipt size={12} weight="duotone" /> 회계</SubHead>
          <Row label="계정과목">{tx.subject ? <b>{tx.subject}</b> : <span className="muted">미분개 (계정과목 없음)</span>}</Row>
          <Row label="분개 상태"><StatusBadge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusBadge></Row>

          {/* 매칭 유래 */}
          <SubHead><LinkSimple size={12} weight="duotone" /> 수납 매칭 — 이 입금이 낸 회차</SubHead>
          {hits.length === 0 && !matched ? (
            <div className="muted" style={{ fontSize: 12, padding: '2px 0' }}>
              {isWithdraw ? '출금 거래 — 수납 매칭 대상 아님.' : '아직 계약에 매칭 안 됨. 재무관리에서 계약·회차 매칭 가능.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {hits.map((h, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '5px 8px', background: 'var(--bg-sunken)', borderRadius: 'var(--radius-sm)' }}>
                  <span className="plate">{h.contract.vehiclePlate}</span>
                  <span>{h.contract.customerName}</span>
                  <span className="mono dim">{h.contract.contractNo}</span>
                  <span className="dim">· {h.seq}회차</span>
                  <span className="mono" style={{ marginLeft: 'auto', color: 'var(--green-text)' }}>₩{formatCurrency(h.amount)}</span>
                  {h.synthetic && <span className="chip" style={{ height: 15, fontSize: 9, padding: '0 5px', background: 'var(--bg-sunken)', color: 'var(--text-weak)' }}>이월</span>}
                  {onOpenContract && (
                    <button type="button" className="btn btn-sm btn-ghost btn-icon" title="계약 열기" onClick={() => onOpenContract(h.contract.id)}>
                      <ArrowSquareOut size={12} />
                    </button>
                  )}
                </div>
              ))}
              {matched && hits.length === 0 && (
                <div className="muted" style={{ fontSize: 11 }}>
                  ⚠ 계약({matched.vehiclePlate} {matched.customerName})에 연결됐다고 표시되나, 그 계약 회차에 이 입금 기록이 없음 — 유령매칭 의심.
                </div>
              )}
              {tx.matchedAt && (
                <div className="dim" style={{ fontSize: 11 }}>매칭: {tx.matchedAt.slice(0, 19).replace('T', ' ')}{tx.matchedBy ? ` · ${tx.matchedBy}` : ''}</div>
              )}
            </div>
          )}

          {/* 집금 정산 유래 */}
          {(settlementItems.length > 0 || settlementParent) && (
            <>
              <SubHead>CMS/카드 집금 정산</SubHead>
              {settlementItems.length > 0 && (
                <div style={{ fontSize: 12 }}>
                  <div style={{ marginBottom: 4 }}>
                    이 입금은 <b>집금 {settlementItems.length}건</b> 묶음 —
                    총액 <span className="mono">₩{formatCurrency(tx.settlementGrossAmount ?? 0)}</span>
                    {' '}− 수수료 <span className="mono" style={{ color: 'var(--red-text)' }}>₩{formatCurrency(tx.settlementFeeAmount ?? 0)}</span>
                    {' '}= 실입금 <span className="mono" style={{ color: 'var(--green-text)' }}>₩{formatCurrency(tx.amount)}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 180, overflowY: 'auto' }}>
                    {settlementItems.map((it) => (
                      <div key={it.id} style={{ display: 'flex', gap: 8, fontSize: 11, padding: '3px 6px', background: 'var(--bg-sunken)', borderRadius: 3 }}>
                        <span className="mono dim">{(it.txDate ?? '').slice(0, 10)}</span>
                        <span style={{ flex: 1 }}>{it.counterparty || '-'}</span>
                        <span className="mono">₩{formatCurrency(it.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {settlementParent && (
                <div style={{ fontSize: 12 }}>
                  이 건은 <b>집금 묶음의 구성 건</b> — 자금일보 일자별 집계에는 <b>집금 입금 1건</b>에 합산돼 있어 중복 계상되지 않습니다.
                  <div style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, padding: '4px 8px', background: 'var(--bg-sunken)', borderRadius: 'var(--radius-sm)' }}>
                    <span className="mono dim">{(settlementParent.txDate ?? '').slice(0, 10)}</span>
                    <span style={{ flex: 1 }}>{settlementParent.counterparty || '집금 입금'}</span>
                    <span className="mono" style={{ color: 'var(--green-text)' }}>₩{formatCurrency(settlementParent.amount)}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  );
}
