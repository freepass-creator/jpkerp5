'use client';

import { useMemo, useState } from 'react';
import { MapPin, FloppyDisk, CircleNotch, ArrowRight } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { DateInput } from '@/components/ui/date-input';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { todayKr } from '@/lib/mock-data';
import type { Contract } from '@/lib/types';

/**
 * 휴차 차량 위치/사유/기간 편집 다이얼로그.
 * v4 의 IOC(입출고) 컨셉 차용 — 위치 변경 시 차량 이력에 자동 기록 (from → to).
 */
export function IdleLocationDialog({
  contract, onClose, onSave,
}: {
  contract: Contract;
  onClose: () => void;
  onSave: (patch: Partial<Contract>) => Promise<void>;
}) {
  const { entries, add: addHistory } = useHistoryEntries();
  const [idleSince, setIdleSince] = useState(contract.idleSince ?? '');
  const [idleUntil, setIdleUntil] = useState(contract.idleUntil ?? '');
  const [idleLocation, setIdleLocation] = useState(contract.idleLocation ?? '');
  const [idleContact, setIdleContact] = useState(contract.idleContact ?? '');
  const [idleReason, setIdleReason] = useState(contract.idleReason ?? '');
  const [saving, setSaving] = useState(false);

  /** 이 차량의 위치 이동 이력 (최근순) */
  const moveHistory = useMemo(() => {
    return entries
      .filter((h) => h.scope === 'vehicle' && h.vehiclePlate === contract.vehiclePlate && h.meta?.kind === 'move')
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .slice(0, 5);
  }, [entries, contract.vehiclePlate]);

  const oldLocation = (contract.idleLocation ?? '').trim();
  const newLocation = idleLocation.trim();
  const locationChanged = oldLocation !== newLocation && newLocation.length > 0;

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      await onSave({
        idleSince: idleSince || undefined,
        idleUntil: idleUntil || undefined,
        idleLocation: newLocation || undefined,
        idleContact: idleContact.trim() || undefined,
        idleReason: idleReason.trim() || undefined,
      });
      // 위치가 바뀌었으면 차량 이력에 이동 기록 (v4 IOC 패턴)
      if (locationChanged && contract.vehiclePlate) {
        const from = oldLocation || '(미입력)';
        const to = newLocation;
        await addHistory({
          scope: 'vehicle',
          vehiclePlate: contract.vehiclePlate,
          contractId: contract.id,
          date: todayKr(),
          category: '기타',
          title: `위치 이동: ${from} → ${to}`,
          description: idleReason ? `사유: ${idleReason}` : undefined,
          status: '완료',
          meta: { kind: 'move', from, to },
        });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogRoot open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        size="sm"
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <MapPin size={14} weight="fill" style={{ color: 'var(--brand)' }} />
            휴차 정보 — <span className="mono">{contract.vehiclePlate}</span>
            <span className="dim" style={{ fontSize: 11, fontWeight: 400 }}>{contract.vehicleModel}</span>
          </span>
        }
      >
        <DialogBody style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {oldLocation && (
            <div style={{
              padding: '8px 12px',
              background: 'var(--bg-sunken)',
              border: '1px solid var(--border-soft)',
              fontSize: 12,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <MapPin size={13} weight="duotone" style={{ color: 'var(--text-sub)' }} />
              <span style={{ color: 'var(--text-weak)' }}>현재 위치</span>
              <strong>{oldLocation}</strong>
              {locationChanged && (
                <>
                  <ArrowRight size={12} weight="bold" style={{ color: 'var(--brand)' }} />
                  <strong style={{ color: 'var(--brand)' }}>{newLocation}</strong>
                  <span style={{ fontSize: 10, color: 'var(--orange-text, #c2410c)', marginLeft: 4 }}>
                    ⤷ 이동 이력에 자동 기록
                  </span>
                </>
              )}
            </div>
          )}

          <div className="form-grid-2">
            <label className="form-label">{oldLocation ? '이동 위치 *' : '현재 위치 *'}</label>
            <input
              className="input"
              autoFocus
              placeholder="예: 본사 차고지 B-12 / 분당 주차장 / 정비소 입고"
              value={idleLocation}
              onChange={(e) => setIdleLocation(e.target.value)}
              style={{ gridColumn: 'span 3' }}
            />

            <label className="form-label">위치 담당</label>
            <input
              className="input mono"
              placeholder="010-0000-0000 (보관소 관리자 등)"
              value={idleContact}
              onChange={(e) => setIdleContact(e.target.value)}
            />

            <label className="form-label">사유</label>
            <input
              className="input"
              placeholder="예: 정비 입고 / 매각 검토 / 임대 대기 / 차주 요청 이동"
              value={idleReason}
              onChange={(e) => setIdleReason(e.target.value)}
              style={{ gridColumn: 'span 3' }}
            />

            <label className="form-label">휴차 시작</label>
            <DateInput value={idleSince} onChange={setIdleSince} style={{ width: 200 }} />

            <label className="form-label">종료 예정</label>
            <DateInput value={idleUntil} onChange={setIdleUntil} style={{ width: 200 }} />
          </div>

          {moveHistory.length > 0 && (
            <section style={{ marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-sub)', marginBottom: 4 }}>
                이동 이력 (최근 {moveHistory.length}건)
              </div>
              <div style={{ border: '1px solid var(--border-soft)', maxHeight: 140, overflow: 'auto' }}>
                <table className="table" style={{ fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>일자</th>
                      <th>이동</th>
                      <th>사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moveHistory.map((h) => (
                      <tr key={h.id}>
                        <td className="mono">{h.date}</td>
                        <td>
                          <span className="dim">{String((h.meta as Record<string, unknown>)?.from ?? '')}</span>
                          <ArrowRight size={10} weight="bold" style={{ verticalAlign: 'middle', margin: '0 4px', color: 'var(--brand)' }} />
                          <strong>{String((h.meta as Record<string, unknown>)?.to ?? '')}</strong>
                        </td>
                        <td className="dim">{h.description?.replace('사유: ', '') ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </DialogBody>
        <DialogFooter>
          <div style={{ flex: 1 }} />
          <DialogClose asChild><button className="btn">취소</button></DialogClose>
          <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving || !idleLocation.trim()}>
            {saving ? <CircleNotch size={12} weight="bold" style={{ animation: 'spin 1s linear infinite' }} /> : <FloppyDisk size={12} weight="bold" />}
            저장
          </button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
