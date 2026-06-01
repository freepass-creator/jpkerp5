'use client';

import { useState } from 'react';
import { MapPin, FloppyDisk, CircleNotch } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { DateInput } from '@/components/ui/date-input';
import type { Contract } from '@/lib/types';

/**
 * 휴차 차량 위치/사유/기간 편집 다이얼로그.
 */
export function IdleLocationDialog({
  contract, onClose, onSave,
}: {
  contract: Contract;
  onClose: () => void;
  onSave: (patch: Partial<Contract>) => Promise<void>;
}) {
  const [idleSince, setIdleSince] = useState(contract.idleSince ?? '');
  const [idleUntil, setIdleUntil] = useState(contract.idleUntil ?? '');
  const [idleLocation, setIdleLocation] = useState(contract.idleLocation ?? '');
  const [idleContact, setIdleContact] = useState(contract.idleContact ?? '');
  const [idleReason, setIdleReason] = useState(contract.idleReason ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      await onSave({
        idleSince: idleSince || undefined,
        idleUntil: idleUntil || undefined,
        idleLocation: idleLocation.trim() || undefined,
        idleContact: idleContact.trim() || undefined,
        idleReason: idleReason.trim() || undefined,
      });
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
          <div className="form-grid-2">
            <label className="form-label">현재 위치 *</label>
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
              placeholder="예: 정비 입고 / 매각 검토 / 임대 대기"
              value={idleReason}
              onChange={(e) => setIdleReason(e.target.value)}
              style={{ gridColumn: 'span 3' }}
            />

            <label className="form-label">휴차 시작</label>
            <DateInput value={idleSince} onChange={setIdleSince} style={{ width: 200 }} />

            <label className="form-label">종료 예정</label>
            <DateInput value={idleUntil} onChange={setIdleUntil} style={{ width: 200 }} />
          </div>
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
