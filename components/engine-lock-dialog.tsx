'use client';

import { useState } from 'react';
import { Power, CircleNotch } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import type { Contract } from '@/lib/types';
import { friendlyError } from '@/lib/friendly-error';
import { toast } from '@/lib/toast';

/**
 * 시동제어 ON/OFF 전용 모달 — 단일 클릭 흐름.
 *
 * - ON: 사유 chip 클릭 즉시 활성화. ("기타"만 입력 후 적용 버튼)
 * - OFF: 해제 버튼 클릭 즉시 해제.
 */

const PRESET_REASONS = ['미납', '검사지연', '보험만료', '면허정지', '내용증명 후 미회수'] as const;

export function EngineLockDialog({
  contract, open, onOpenChange, onConfirm,
}: {
  contract: Contract | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** confirm 시 호출 — 다음 engineDisabled 값 + 사유 */
  onConfirm: (next: boolean, reason: string) => Promise<void>;
}) {
  const c = contract;
  const isOn = !!c?.engineDisabled;
  const [custom, setCustom] = useState<string>('');
  const [showCustom, setShowCustom] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!c) return null;
  const willEnable = !isOn;

  async function applyEnable(reason: string) {
    if (!c || busy) return;
    setBusy(true);
    try {
      await onConfirm(true, reason);
      onOpenChange(false);
      setCustom('');
      setShowCustom(false);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function applyDisable() {
    if (!c || busy) return;
    setBusy(true);
    try {
      await onConfirm(false, '');
      onOpenChange(false);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        mode="edit"
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Power size={14} weight="fill" style={{ color: willEnable ? 'var(--red-text)' : 'var(--text-sub)' }} />
            {willEnable ? `시동제어 ON — ${c.vehiclePlate}` : `시동제어 해제 — ${c.vehiclePlate}`}
          </span>
        }
      >
        <DialogBody style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {willEnable ? (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-weak)' }}>
                사유를 클릭하면 즉시 시동제어가 활성화됩니다.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {PRESET_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className="chip"
                    onClick={() => void applyEnable(r)}
                    disabled={busy}
                  >{r}</button>
                ))}
                <button
                  type="button"
                  className={`chip ${showCustom ? 'active' : ''}`}
                  onClick={() => setShowCustom(true)}
                  disabled={busy}
                >기타…</button>
              </div>
              {showCustom && (
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="사유 입력"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && custom.trim()) void applyEnable(custom.trim()); }}
                    style={{ flex: 1 }}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy || !custom.trim()}
                    onClick={() => void applyEnable(custom.trim())}
                  >
                    {busy
                      ? <CircleNotch size={12} weight="bold" style={{ animation: 'spin 1s linear infinite' }} />
                      : '적용'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.6 }}>
              {c.engineDisabledAt && (
                <>제어 시작: <span className="mono">{c.engineDisabledAt.slice(0, 10)}</span> · 사유: {c.engineDisabledReason || '-'}<br/></>
              )}
              해제하시겠습니까?
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <button type="button" className="btn">닫기</button>
          </DialogClose>
          {!willEnable && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void applyDisable()}
            >
              {busy
                ? <><CircleNotch size={12} weight="bold" style={{ animation: 'spin 1s linear infinite' }} /> 처리 중...</>
                : '해제'}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
