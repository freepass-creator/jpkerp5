'use client';

/**
 * 전역 확인 다이얼로그 호스트 — app/layout.tsx 에 mount.
 *
 * 외부에서는 lib/confirm 의 showConfirm() 만 사용.
 */

import { useEffect, useState } from 'react';
import { Warning, CheckCircle, X } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { _setConfirmListener, type ConfirmOptions } from '@/lib/confirm';

type State = {
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
} | null;

export function ConfirmDialogHost() {
  const [state, setState] = useState<State>(null);

  useEffect(() => {
    _setConfirmListener((p) => setState(p));
    return () => _setConfirmListener(null);
  }, []);

  function close(ok: boolean) {
    if (!state) return;
    state.resolve(ok);
    setState(null);
  }

  if (!state) return null;
  const { options } = state;
  const danger = !!options.danger;

  return (
    <DialogRoot open onOpenChange={(o) => { if (!o) close(false); }}>
      <DialogContent size="sm" title={options.title} mode={danger ? 'edit' : 'new'}>
        {options.description && (
          <div style={{
            padding: '14px 16px 4px', fontSize: 13, lineHeight: 1.6,
            whiteSpace: 'pre-wrap', color: 'var(--text-main)',
          }}>
            {options.description}
          </div>
        )}
        <DialogFooter>
          <button type="button" className="btn" onClick={() => close(false)}>
            <X size={12} weight="bold" /> {options.cancelLabel ?? '취소'}
          </button>
          <button
            type="button"
            className={`btn ${danger ? '' : 'btn-primary'}`}
            style={danger ? { background: 'var(--red-text)', color: '#fff', borderColor: 'var(--red-text)' } : undefined}
            onClick={() => close(true)}
            autoFocus
          >
            {danger ? <Warning size={12} weight="bold" /> : <CheckCircle size={12} weight="bold" />}
            {' '}{options.confirmLabel ?? '확인'}
          </button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
