'use client';

/**
 * 전역 확인 다이얼로그 호스트 — app/layout.tsx 에 mount.
 *
 * 외부에서는 lib/confirm 의 showConfirm() 만 사용.
 */

import { useEffect, useState } from 'react';
import { Warning, CheckCircle, X } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { _setConfirmListener, _setPromptListener, type ConfirmOptions, type PromptOptions } from '@/lib/confirm';

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

/* ──────────────── 입력 다이얼로그 호스트 (window.prompt 대체) ──────────────── */

type PromptState = {
  options: PromptOptions;
  resolve: (value: string | null) => void;
} | null;

export function PromptDialogHost() {
  const [state, setState] = useState<PromptState>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    _setPromptListener((p) => { setValue(p.options.initial ?? ''); setState(p); });
    return () => _setPromptListener(null);
  }, []);

  function close(submit: boolean) {
    if (!state) return;
    state.resolve(submit ? value : null);
    setState(null);
  }

  if (!state) return null;
  const { options } = state;

  return (
    <DialogRoot open onOpenChange={(o) => { if (!o) close(false); }}>
      <DialogContent size="sm" title={options.title} mode="new">
        <div style={{ padding: '14px 16px 4px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {options.description && (
            <div style={{ fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-sub)' }}>
              {options.description}
            </div>
          )}
          {options.multiline ? (
            <textarea
              className="input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={options.placeholder}
              autoFocus
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
            />
          ) : (
            <input
              className="input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={options.placeholder}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); close(true); } }}
              style={{ width: '100%' }}
            />
          )}
        </div>
        <DialogFooter>
          <button type="button" className="btn" onClick={() => close(false)}>
            <X size={12} weight="bold" /> 취소
          </button>
          <button type="button" className="btn btn-primary" onClick={() => close(true)}>
            <CheckCircle size={12} weight="bold" /> {options.confirmLabel ?? '확인'}
          </button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
