'use client';

import { useMemo, useState } from 'react';
import { CheckCircle, MagnifyingGlass, X } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import type { Contract } from '@/lib/types';
import type { Penalty, PenaltyStatus } from '@/lib/types-penalty';
import { formatDateFull } from '@/lib/utils';

const NEXT_STATUSES: PenaltyStatus[] = ['계약매칭', '임차인통보', '납부완료', '회사납부', '이의신청'];

export function PenaltyMatchDialog({
  penalty, contracts, onClose, onAssign,
}: {
  penalty: Penalty | null;
  contracts: Contract[];
  onClose: () => void;
  onAssign: (contractId: string, newStatus: PenaltyStatus) => Promise<void>;
}) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Contract | null>(null);
  const [newStatus, setNewStatus] = useState<PenaltyStatus>('계약매칭');

  // penalty 변경 시 검색어 자동 = 차량번호
  const searchQ = q || (penalty?.carNumber ?? '');

  const candidates = useMemo(() => {
    if (!penalty) return [];
    const query = searchQ.trim().toLowerCase();
    // 차량번호 기본 매칭 + 위반일 당시 운행 중이었는지 시기 가중
    return contracts.filter((c) => {
      const hay = `${c.vehiclePlate} ${c.customerName} ${c.contractNo} ${c.customerPhone1}`.toLowerCase();
      if (query && !hay.includes(query)) return false;
      return true;
    }).map((c) => {
      // 위반일 당시 운행 중이었는지 점수
      const v = penalty.violationDate;
      const from = c.deliveredDate ?? c.contractDate;
      const to = c.returnedDate ?? c.returnScheduledDate ?? '9999-12-31';
      const inPeriod = v >= from && v <= to;
      const plateMatch = c.vehiclePlate === penalty.carNumber;
      const score = (plateMatch ? 100 : 0) + (inPeriod ? 50 : 0);
      return { contract: c, score, inPeriod, plateMatch };
    }).sort((a, b) => b.score - a.score).slice(0, 30);
  }, [contracts, searchQ, penalty]);

  if (!penalty) return null;

  return (
    <DialogRoot open={!!penalty} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent title="과태료 매칭 — 임차인 식별">
        <DialogBody className="p-0" style={{ display: 'flex', flexDirection: 'column' }}>
          {/* 과태료 정보 헤더 */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 4 }}>
              {picked ? '2단계 — 처리 상태 확정' : '1단계 — 위반일 당시 운행 차량 매칭'}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
              <span className="plate" style={{ fontWeight: 600 }}>{penalty.carNumber}</span>
              <span className="text-weak">·</span>
              <span>{penalty.docType}</span>
              <span className="text-weak">·</span>
              <span className="mono">위반 {formatDateFull(penalty.violationDate)}</span>
              <span className="text-weak">·</span>
              <span className="mono" style={{ fontWeight: 600 }}>₩{penalty.amount.toLocaleString()}</span>
              {penalty.description && (
                <>
                  <span className="text-weak">·</span>
                  <span className="text-sub" style={{ fontSize: 11 }}>{penalty.description}</span>
                </>
              )}
            </div>
          </div>

          {picked ? (
            <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="detail-hero">
                <div className="detail-hero-main">
                  <div className="detail-hero-name">{picked.customerName}</div>
                  <div className="detail-hero-meta">
                    <span className="plate">{picked.vehiclePlate}</span>
                    <span>·</span>
                    <span>{picked.vehicleModel}</span>
                    <span>·</span>
                    <span>{picked.company}</span>
                    <span>·</span>
                    <span className="mono">{picked.customerPhone1}</span>
                  </div>
                </div>
                <button className="btn btn-sm" onClick={() => setPicked(null)}>
                  <X size={11} /> 다시 선택
                </button>
              </div>

              <div className="detail-section">
                <div className="detail-section-header">처리 상태</div>
                <div className="detail-section-body">
                  <div className="filter-bar">
                    {NEXT_STATUSES.map((s) => (
                      <button key={s} className={`chip ${newStatus === s ? 'active' : ''}`} onClick={() => setNewStatus(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-weak)' }}>
                    {statusHint(newStatus)}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 'auto', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => setPicked(null)}>뒤로</button>
                <button className="btn btn-primary" onClick={() => onAssign(picked.id, newStatus)}>
                  <CheckCircle size={14} /> {newStatus}으로 확정
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                <div className="topbar-search" style={{ width: '100%', maxWidth: 'none' }}>
                  <MagnifyingGlass size={14} className="icon" />
                  <input className="input" placeholder="차량번호 / 계약자명 / 계약번호" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {candidates.length === 0 ? (
                  <div className="empty-state">매칭 후보 없음</div>
                ) : candidates.map(({ contract: c, score, inPeriod, plateMatch }) => (
                  <button
                    key={c.id}
                    onClick={() => setPicked(c)}
                    className="search-result-row"
                    type="button"
                    style={{ width: '100%' }}
                  >
                    <span className="plate" style={{ minWidth: 92 }}>{c.vehiclePlate}</span>
                    <span style={{ flex: 1, fontWeight: 500 }}>{c.customerName}</span>
                    <span className="text-sub" style={{ fontSize: 11 }}>{c.vehicleModel}</span>
                    <span className="text-weak mono" style={{ fontSize: 11 }}>{c.customerPhone1}</span>
                    {plateMatch && <span className="chip" style={{ height: 18, padding: '0 6px', fontSize: 10, background: 'var(--green-bg)', color: 'var(--green-text)' }}>차량일치</span>}
                    {inPeriod && <span className="chip" style={{ height: 18, padding: '0 6px', fontSize: 10, background: 'var(--blue-bg)', color: 'var(--blue-text)' }}>운행시기</span>}
                    {score > 0 && <span className="mono dim" style={{ fontSize: 10 }}>{score}</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <div className="flex-1" />
          <DialogClose asChild>
            <button className="btn">닫기</button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

function statusHint(s: PenaltyStatus): string {
  switch (s) {
    case '계약매칭': return '계약자 식별 완료 — 임차인 통보 전 상태';
    case '임차인통보': return '임차인에게 변경부과 확인서 발송 완료';
    case '납부완료': return '임차인이 자체 납부 완료';
    case '회사납부': return '회사가 대신 납부 (임차인에게 청구 별도)';
    case '이의신청': return '발급기관에 이의 진행 중';
    default: return '';
  }
}
