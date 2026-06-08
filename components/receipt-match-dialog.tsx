'use client';

import { useMemo, useState } from 'react';
import { LinkSimple, X as XIcon, CheckCircle, MagnifyingGlass } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import type { BankTransaction, Contract } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { displayCompanyName } from '@/lib/company-display';
import { findCandidates, applyMatch, reverseMatch, applyFifoPayment } from '@/lib/receipt-match';
import { todayKr } from '@/lib/mock-data';
import { matchesSearch } from '@/lib/filter-helpers';

/**
 * 자금일보 수동 매칭 다이얼로그.
 *
 *  - 입금 거래에 대해 직접 계약·회차 매칭
 *  - 자동 추천 후보 (이름+금액 일치) 상단 노출 → 클릭 한 번으로 매칭
 *  - 검색창으로 임의 계약·회차 찾아 매칭
 *  - 이미 매칭된 거래는 해제 모드
 *
 * onApply 콜백 — 부모(payments page)가 BankTransaction + Contract 모두 patch 처리.
 */
export function ReceiptMatchDialog({
  open,
  onOpenChange,
  tx,
  contracts,
  companyMaster,
  onApply,
  onReverse,
  onFifo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tx: BankTransaction | null;
  contracts: Contract[];
  companyMaster: Parameters<typeof displayCompanyName>[1];
  onApply: (tx: BankTransaction, contract: Contract, scheduleSeq: number) => Promise<void> | void;
  onReverse: (tx: BankTransaction) => Promise<void> | void;
  onFifo: (tx: BankTransaction, contract: Contract) => Promise<void> | void;
}) {
  const [search, setSearch] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);

  const candidates = useMemo(() => (tx ? findCandidates(tx, contracts) : []), [tx, contracts]);

  const filteredContracts = useMemo(() => {
    if (!search.trim()) return contracts.slice(0, 50);
    return contracts
      .filter((c) => matchesSearch(search, [c.vehiclePlate, c.customerName, c.contractNo, c.driverName]))
      .slice(0, 50);
  }, [contracts, search]);

  const picked = pickedId ? contracts.find((c) => c.id === pickedId) : null;

  if (!tx) return null;
  const isWithdraw = (tx.withdraw ?? 0) > 0;
  const alreadyMatched = !!tx.matchedContractId;

  async function handleApplyCandidate(contractId: string, scheduleSeq: number) {
    const c = contracts.find((x) => x.id === contractId);
    if (!c || !tx) return;
    await onApply(tx, c, scheduleSeq);
    onOpenChange(false);
  }

  async function handleReverse() {
    if (!tx) return;
    await onReverse(tx);
    onOpenChange(false);
  }

  async function handleFifo() {
    if (!picked || !tx) return;
    await onFifo(tx, picked);
    onOpenChange(false);
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent title={alreadyMatched ? '매칭 해제' : isWithdraw ? '출금 — 계약 매칭 불필요' : '입금 매칭'}>
        <DialogBody className="p-0" style={{ display: 'flex', flexDirection: 'column' }}>
          {/* 거래 정보 */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span className="mono">{formatDate(tx.txDate)}</span>
              {tx.amount > 0 && (
                <span className="mono" style={{ fontWeight: 600, color: 'var(--green-text)' }}>
                  입금 ₩{formatCurrency(tx.amount)}
                </span>
              )}
              {(tx.withdraw ?? 0) > 0 && (
                <span className="mono" style={{ fontWeight: 600, color: 'var(--red-text)' }}>
                  출금 ₩{formatCurrency(tx.withdraw!)}
                </span>
              )}
              <span style={{ color: 'var(--text-sub)' }}>· 거래상대 {tx.counterparty || '-'}</span>
              {tx.memo && <span style={{ color: 'var(--text-weak)', fontSize: 11 }}>· {tx.memo}</span>}
            </div>
          </div>

          {/* 이미 매칭된 거래 — 해제 모드 */}
          {alreadyMatched ? (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <MatchedInfo tx={tx} contracts={contracts} companyMaster={companyMaster} />
              <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>
                매칭을 해제하면 해당 회차는 다시 연체 상태로 돌아갑니다.
              </div>
            </div>
          ) : isWithdraw ? (
            <div style={{ padding: 16, fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.6 }}>
              출금 거래는 계약 매칭 대상이 아닙니다. 계정과목(차량매입 / 정비비 / 보험료 등) 만 분개에서 지정하세요.
            </div>
          ) : (
            <div style={{ flex: 1, overflow: 'auto' }}>
              {/* 자동 추천 후보 */}
              {candidates.length > 0 && (
                <div className="detail-section" style={{ margin: '12px 16px' }}>
                  <div className="detail-section-header">
                    <CheckCircle size={12} weight="duotone" />
                    <span className="title">추천 매칭 후보 ({candidates.length})</span>
                  </div>
                  <div className="detail-section-body">
                    <table className="table" style={{ fontSize: 11 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 70 }}>신뢰도</th>
                          <th style={{ width: 110 }}>차량번호</th>
                          <th>계약자</th>
                          <th className="center" style={{ width: 60 }}>회차</th>
                          <th style={{ width: 110 }}>예정일</th>
                          <th className="num" style={{ width: 120 }}>금액</th>
                          <th style={{ width: 80 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidates.slice(0, 8).map((cand) => (
                          <tr key={`${cand.contract.id}-${cand.scheduleSeq}`}>
                            <td>
                              <span className={`status ${cand.confidence === 'high' ? '완료' : cand.confidence === 'medium' ? '예정' : ''}`}>
                                {cand.confidence === 'high' ? '높음' : cand.confidence === 'medium' ? '중간' : '낮음'}
                              </span>
                            </td>
                            <td className="mono">{cand.contract.vehiclePlate}</td>
                            <td>{cand.contract.customerName}</td>
                            <td className="center mono">{cand.scheduleSeq}회</td>
                            <td className="mono">{formatDate(cand.scheduleDueDate)}</td>
                            <td className="num mono">₩{formatCurrency(cand.scheduleAmount)}</td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => handleApplyCandidate(cand.contract.id, cand.scheduleSeq)}
                              >
                                <LinkSimple size={11} /> 매칭
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 수동 검색 */}
              <div className="detail-section" style={{ margin: '12px 16px' }}>
                <div className="detail-section-header">
                  <MagnifyingGlass size={12} weight="duotone" />
                  <span className="title">수동 — 계약 검색</span>
                </div>
                <div className="detail-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    className="input"
                    placeholder="차량번호 / 계약자명 / 계약번호 / 주운전자 검색"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoFocus
                  />
                  <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid var(--border-soft)' }}>
                    {filteredContracts.length === 0 ? (
                      <div style={{ padding: 16, fontSize: 11, color: 'var(--text-weak)', textAlign: 'center' }}>
                        검색 결과 없음
                      </div>
                    ) : (
                      <table className="table" style={{ fontSize: 11 }}>
                        <tbody>
                          {filteredContracts.map((c) => (
                            <tr
                              key={c.id}
                              className={pickedId === c.id ? 'selected-row' : undefined}
                              style={{ cursor: 'pointer' }}
                              onClick={() => setPickedId(c.id === pickedId ? null : c.id)}
                            >
                              <td className="mono" style={{ width: 110 }}>{c.vehiclePlate}</td>
                              <td>{c.customerName}</td>
                              <td className="dim">{displayCompanyName(c.company, companyMaster)}</td>
                              <td className="num mono dim">미수 ₩{formatCurrency(c.unpaidAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>

              {/* 선택된 계약의 회차 목록 */}
              {picked && (
                <div className="detail-section" style={{ margin: '12px 16px' }}>
                  <div className="detail-section-header">
                    <span className="title">
                      {picked.vehiclePlate} {picked.customerName} — 회차 선택
                    </span>
                    <button type="button" className="btn btn-sm" onClick={handleFifo} title="선입선출 — 가장 오래된 미납부터 자동 차감">
                      선입선출 적용
                    </button>
                  </div>
                  <div className="detail-section-body">
                    {(picked.schedules ?? []).filter((s) => s.status !== '완료').length === 0 ? (
                      <div style={{ padding: 12, fontSize: 11, color: 'var(--text-weak)', textAlign: 'center' }}>
                        미납·예정 회차가 없습니다.
                      </div>
                    ) : (
                      <table className="table" style={{ fontSize: 11 }}>
                        <thead>
                          <tr>
                            <th className="center" style={{ width: 50 }}>회차</th>
                            <th style={{ width: 110 }}>예정일</th>
                            <th className="num" style={{ width: 120 }}>예정금액</th>
                            <th className="num" style={{ width: 120 }}>입금액</th>
                            <th className="center" style={{ width: 80 }}>상태</th>
                            <th style={{ width: 80 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(picked.schedules ?? []).filter((s) => s.status !== '완료').map((s) => (
                            <tr key={s.seq}>
                              <td className="center mono">{s.seq}</td>
                              <td className="mono">{formatDate(s.dueDate)}</td>
                              <td className="num mono">₩{formatCurrency(s.amount)}</td>
                              <td className="num mono">₩{formatCurrency(s.paidAmount)}</td>
                              <td className="center"><span className={`status ${s.status}`}>{s.status}</span></td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary"
                                  onClick={() => handleApplyCandidate(picked.id, s.seq)}
                                >
                                  매칭
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {alreadyMatched && (
            <button className="btn btn-danger" type="button" onClick={handleReverse}>
              <XIcon size={12} /> 매칭 해제
            </button>
          )}
          <div style={{ flex: 1 }} />
          <DialogClose asChild>
            <button className="btn">닫기</button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

function MatchedInfo({
  tx, contracts, companyMaster,
}: {
  tx: BankTransaction;
  contracts: Contract[];
  companyMaster: Parameters<typeof displayCompanyName>[1];
}) {
  const c = contracts.find((x) => x.id === tx.matchedContractId);
  if (!c) return <div style={{ fontSize: 12, color: 'var(--text-weak)' }}>매칭된 계약을 찾을 수 없습니다 (삭제됨)</div>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
      <span className="plate">{c.vehiclePlate}</span>
      <span>{c.customerName}</span>
      <span className="dim">·</span>
      <span className="dim">{displayCompanyName(c.company, companyMaster)}</span>
      {tx.matchedScheduleSeq && (
        <>
          <span className="dim">·</span>
          <span className="mono">{tx.matchedScheduleSeq}회차</span>
        </>
      )}
      {tx.subject && (
        <>
          <span className="dim">·</span>
          <span className="dim">계정: {tx.subject}</span>
        </>
      )}
    </div>
  );
}
