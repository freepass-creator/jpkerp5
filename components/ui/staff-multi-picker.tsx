'use client';

/**
 * 가입회원 중에서 복수 선택하는 picker — 클릭 시 popover, 검색·전체선택·체크박스 지원.
 *
 * 사용:
 *   <StaffMultiPicker selected={names} onChange={setNames} />
 *
 * 다른 페이지에서도 담당자 지정 시 동일 규격으로 사용.
 */

import { useEffect, useRef, useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { useStaffList, type StaffMember } from '@/lib/use-staff-list';

export type StaffMultiPickerProps = {
  /** 선택된 담당자명 (displayName, 없으면 email) */
  selected: string[];
  onChange: (names: string[]) => void;
  /** trigger 라벨 (선택 0명일 때 표시). 기본 '담당자 선택' */
  placeholder?: string;
  /** 최소 폭 — trigger button width */
  minWidth?: number;
};

export function StaffMultiPicker({
  selected, onChange, placeholder = '담당자 선택', minWidth = 150,
}: StaffMultiPickerProps) {
  const { staff, loading } = useStaffList();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const labelOf = (s: StaffMember) => s.displayName || s.email;
  const filtered = q.trim()
    ? staff.filter((s) => labelOf(s).toLowerCase().includes(q.toLowerCase()) || s.email.toLowerCase().includes(q.toLowerCase()))
    : staff;
  const allSelected = filtered.length > 0 && filtered.every((s) => selected.includes(labelOf(s)));

  function toggle(name: string) {
    onChange(selected.includes(name) ? selected.filter((x) => x !== name) : [...selected, name]);
  }
  function toggleAll() {
    if (allSelected) {
      onChange(selected.filter((x) => !filtered.some((s) => labelOf(s) === x)));
    } else {
      const add = filtered.map(labelOf).filter((n) => !selected.includes(n));
      onChange([...selected, ...add]);
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="input input-compact"
        onClick={() => setOpen((o) => !o)}
        style={{
          fontSize: 12, cursor: 'pointer', textAlign: 'left',
          padding: '4px 8px', minWidth,
          color: selected.length === 0 ? 'var(--text-weak)' : 'var(--text-main)',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
        title="가입회원 중 선택"
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected.length === 0 ? placeholder : `${placeholder} ${selected.length}명`}
        </span>
        <CaretDown size={10} weight="bold" style={{ color: 'var(--text-weak)', flexShrink: 0 }} />
      </button>
      {open && (
        <div className="popover-shell" style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50,
          width: 240, maxHeight: 320,
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--border-soft)' }}>
            <input
              type="text"
              className="input input-compact"
              placeholder="이름·이메일 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
              style={{ width: '100%', fontSize: 12 }}
            />
          </div>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', borderBottom: '1px solid var(--border-soft)',
            cursor: 'pointer', fontSize: 12, fontWeight: 600,
            background: 'var(--bg-sunken)',
          }}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            전체 선택 {q ? '(검색결과)' : ''}
          </label>
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            {loading && <div className="dim" style={{ padding: 12, fontSize: 12, textAlign: 'center' }}>가입회원 불러오는 중…</div>}
            {!loading && filtered.length === 0 && (
              <div className="dim" style={{ padding: 12, fontSize: 12, textAlign: 'center' }}>
                {q ? '검색 결과 없음' : '가입회원이 없습니다.'}
              </div>
            )}
            {filtered.map((s) => {
              const name = labelOf(s);
              const checked = selected.includes(name);
              return (
                <label key={s.uid} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', cursor: 'pointer', fontSize: 12,
                  background: checked ? 'var(--brand-bg)' : undefined,
                }}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(name)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{s.displayName || <span className="dim">이름 없음</span>}</div>
                    <div className="dim" style={{ fontSize: 10 }}>{s.email}</div>
                  </div>
                </label>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: 6, borderTop: '1px solid var(--border-soft)' }}>
            <button type="button" className="btn btn-sm" onClick={() => onChange([])}>초기화</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpen(false)}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}
