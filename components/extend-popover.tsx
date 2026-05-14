'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, X } from '@phosphor-icons/react';

type Props = {
  currentReturnDate?: string;
  customerName: string;
  vehiclePlate: string;
  onExtend: (months: number) => void;
};

const PRESETS = [1, 3, 6, 12];

/**
 * 연장 버튼 + 팝오버.
 * 클릭 시 인라인 패널이 펼쳐져서 1/3/6/12개월 or 직접입력으로 연장.
 */
export function ExtendPopover({ currentReturnDate, customerName, vehiclePlate, onExtend }: Props) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function preview(months: number): string {
    if (!currentReturnDate) return '';
    const d = new Date(currentReturnDate);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  function handleConfirm(months: number) {
    if (months <= 0 || !Number.isFinite(months)) return;
    onExtend(months);
    setOpen(false);
    setCustom('');
  }

  return (
    <div className="relative" ref={ref}>
      <button
        className="btn btn-sm"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Plus size={10} weight="bold" /> 연장
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1 bg-card border rounded shadow-lg p-3"
          style={{
            width: 240,
            zIndex: 50,
            borderColor: 'var(--border)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium">계약 연장</div>
            <button className="dialog-close" onClick={() => setOpen(false)}>
              <X size={12} />
            </button>
          </div>
          <div className="text-xs text-sub mb-2">
            <span className="plate">{vehiclePlate}</span> {customerName}
            <div className="text-weak">현재 만기 {currentReturnDate || '-'}</div>
          </div>

          <div className="flex flex-wrap gap-1 mb-2">
            {PRESETS.map((m) => (
              <button
                key={m}
                className="chip"
                onClick={() => handleConfirm(m)}
                title={`→ ${preview(m)}`}
              >
                +{m}개월
              </button>
            ))}
          </div>

          <div className="flex gap-1">
            <input
              className="input flex-1"
              type="number"
              min={1}
              max={60}
              placeholder="개월수"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm(Number(custom));
              }}
            />
            <button
              className="btn btn-sm btn-primary"
              disabled={!custom || Number(custom) <= 0}
              onClick={() => handleConfirm(Number(custom))}
            >
              적용
            </button>
          </div>
          {custom && Number(custom) > 0 && (
            <div className="text-xs text-weak mt-1">→ {preview(Number(custom))}</div>
          )}
        </div>
      )}
    </div>
  );
}
