'use client';

/**
 * EntityFormDialog — 도메인 무관 schema-driven 등록·조회·수정·복사 다이얼로그.
 *
 * 4-mode (자산 다이얼로그 패턴):
 *  - view      : readonly + 회색 dot. [닫기] [수정→edit]
 *  - edit      : editable + 황색 dot.  [취소→view] [저장]
 *  - create    : editable + 기본 색.   [취소] [등록]
 *  - duplicate : editable + 녹색 dot.  [취소] [등록]
 *
 * 사용:
 *   <EntityFormDialog
 *     open={open} onOpenChange={setOpen}
 *     title="계약" mode="view" sections={...} initial={...}
 *     onSubmit={(data) => { onUpdate(data); setOpen(false); }}
 *   />
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import type { Icon } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogClose, DialogFooter } from './dialog';
import { cn } from '@/lib/cn';
import { useDialogShortcuts, countChanges } from '@/lib/use-dialog-shortcuts';
import { showConfirm } from '@/lib/confirm';

export type FieldDef = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea';
  options?: readonly string[] | string[];
  placeholder?: string;
  colSpan?: 1 | 2 | 3 | 4;
  required?: boolean;
  /** 변경 불가 — 등록 후 식별자(코드 등) 잠금용 */
  readOnly?: boolean;
};

export type FieldSection = {
  title: string;
  /** 섹션 제목 좌측 아이콘 (Phosphor Icon component) — 시각적 그룹 구분 */
  icon?: Icon;
  fields: FieldDef[];
};

export type EntityDialogMode = 'view' | 'edit' | 'create' | 'duplicate';

const MODE_DOT: Record<EntityDialogMode, string> = {
  view: '#9ca3af',       // 회색
  edit: '#f59e0b',       // 황색
  create: '#3b82f6',     // 파랑 (기본)
  duplicate: '#22c55e',  // 녹색
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** 모드 — 미지정 시 'create' (구버전 호환) */
  mode?: EntityDialogMode;
  /** 단순 평면 필드 목록 또는 섹션 단위 */
  fields?: FieldDef[];
  sections?: FieldSection[];
  initial?: Record<string, string>;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  submitLabel?: string;
  onSubmit: (data: Record<string, string>) => void;
  /** 섹션 외 추가 콘텐츠 (첨부 문서 미리보기/업로드 등) — 섹션 뒤·footer 앞에 렌더 */
  extraContent?: React.ReactNode;
};

export function EntityFormDialog({
  open,
  onOpenChange,
  title,
  mode = 'create',
  fields,
  sections,
  initial = {},
  size = 'lg',
  submitLabel,
  onSubmit,
  extraContent,
}: Props) {
  const [data, setData] = useState<Record<string, string>>(initial);
  const [currentMode, setCurrentMode] = useState<EntityDialogMode>(mode);

  useEffect(() => {
    if (open) {
      setData(initial);
      setCurrentMode(mode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  function setField(key: string, value: string) {
    setData((d) => ({ ...d, [key]: value }));
  }

  const allSections: FieldSection[] = sections ?? (fields ? [{ title: '', fields }] : []);
  const isReadonly = currentMode === 'view';

  // 변경 감지 — initial vs current data
  const dirtyCount = useMemo(() => countChanges(initial, data), [initial, data]);

  async function handleClose() {
    if (currentMode === 'edit' && dirtyCount > 0) {
      if (!await showConfirm({ title: '미저장 변경이 있습니다. 닫을까요?' })) return;
    }
    onOpenChange(false);
  }

  // 이중 제출 방지 (ERP #16 멱등성) — 제출 중 버튼 비활성 + ref 가드로 rapid 더블클릭 차단.
  // 등록/복제 버튼이 disabled 없어 더블클릭 시 마스터가 2건 생성되던 것 방지.
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  async function doSubmit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await Promise.resolve(onSubmit(data));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  // 키보드 단축키 — Esc 닫기 / Ctrl+S 저장
  const canSave =
    (currentMode === 'edit' && dirtyCount > 0) ||
    currentMode === 'create' ||
    currentMode === 'duplicate';
  useDialogShortcuts({
    open,
    onClose: handleClose,
    onSave: canSave ? () => void doSubmit() : undefined,
  });

  // 모드별 색깔 dot 헤더
  const titleNode = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span aria-hidden style={{
        display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
        background: MODE_DOT[currentMode], flexShrink: 0,
      }} />
      <span>{title}</span>
    </span>
  );

  const defaultSubmitLabel =
    currentMode === 'edit' ? '저장' :
    currentMode === 'duplicate' ? '등록' :
    submitLabel ?? '등록';

  // DialogContent.mode 매핑 — view/edit/new(create+duplicate). DialogContent 가 hero/footer 시각 자동.
  const dcMode: 'view' | 'edit' | 'new' =
    currentMode === 'view' ? 'view' :
    currentMode === 'edit' ? 'edit' : 'new';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={titleNode} size={size} mode={dcMode}>
        <fieldset
          disabled={isReadonly}
          className={cn('form-stack', `form-mode-${currentMode}`)}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          {allSections.map((section, i) => (
            <div key={i} className="form-section">
              {section.title && (
                <div className="form-section-title">
                  {section.icon && <section.icon size={13} weight="bold" />}
                  <span>{section.title}</span>
                </div>
              )}
              <div className="form-grid">
                {section.fields.map((f) => (
                  <Field key={f.key} f={f} value={data[f.key] ?? ''} onChange={(v) => setField(f.key, v)} />
                ))}
              </div>
            </div>
          ))}
          {extraContent}
        </fieldset>

        <DialogFooter>
          {currentMode === 'view' ? (
            <>
              <DialogClose asChild><button className="btn">닫기</button></DialogClose>
              <button className="btn btn-primary" onClick={() => setCurrentMode('edit')}>수정</button>
            </>
          ) : currentMode === 'edit' ? (
            <>
              <button
                className="btn"
                style={{ marginRight: 'auto' }}
                onClick={() => { setData(initial); setCurrentMode('view'); }}
              >
                취소 (조회로 복귀)
              </button>
              <DialogClose asChild><button className="btn">닫기</button></DialogClose>
              {dirtyCount > 0 && (
                <span className="text-weak" style={{ fontSize: 12, marginRight: 4 }}>
                  변경 {dirtyCount}건 미저장
                </span>
              )}
              <button
                className="btn btn-primary"
                disabled={dirtyCount === 0 || submitting}
                onClick={() => void doSubmit()}
              >
                {submitting ? '저장 중…' : '저장'}
              </button>
            </>
          ) : (
            // create / duplicate
            <>
              <DialogClose asChild><button className="btn">취소</button></DialogClose>
              <button className="btn btn-primary" disabled={submitting} onClick={() => void doSubmit()}>
                {submitting ? '처리 중…' : defaultSubmitLabel}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "850000" → "850,000" / "" → "" / "-" → "-" / 비숫자 그대로 보존 */
function formatNumberDisplay(s: string): string {
  if (!s) return '';
  if (s === '-') return s;
  const cleaned = s.replace(/,/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString('ko-KR');
}

/** 사용자 입력에서 숫자(+선두 마이너스)만 남김 */
function stripNonDigit(s: string): string {
  const sign = s.startsWith('-') ? '-' : '';
  return sign + s.replace(/[^\d]/g, '');
}

function Field({ f, value, onChange }: { f: FieldDef; value: string; onChange: (v: string) => void }) {
  const span = f.colSpan === 4 ? 'col-span-4' : f.colSpan === 3 ? 'col-span-3' : f.colSpan === 2 ? 'col-span-2' : '';
  const lockedStyle = f.readOnly
    ? { background: 'var(--bg-disabled)', color: 'var(--text-main)', cursor: 'default' as const }
    : undefined;
  const lockedTitle = f.readOnly ? '등록 후 변경 불가' : undefined;
  return (
    <label className={`block ${span}`}>
      <span className={`label${f.required ? ' label-required' : ''}`}>
        {f.label}{f.readOnly && <span className="text-weak"> (변경 불가)</span>}
      </span>
      {f.type === 'select' ? (
        <select
          className="input w-full"
          value={value}
          onChange={(e) => !f.readOnly && onChange(e.target.value)}
          disabled={f.readOnly}
          title={lockedTitle}
          style={lockedStyle}
        >
          <option value="">- {f.placeholder ?? '선택'}</option>
          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : f.type === 'textarea' ? (
        <textarea
          className="input w-full"
          rows={3}
          value={value}
          onChange={(e) => !f.readOnly && onChange(e.target.value)}
          placeholder={f.placeholder}
          readOnly={f.readOnly}
          title={lockedTitle}
          style={lockedStyle}
        />
      ) : f.type === 'number' ? (
        // 천단위 콤마 표시 — 입력은 숫자/콤마 자유, 저장은 콤마 제거된 raw 숫자(string)
        <input
          type="text"
          inputMode="numeric"
          className="input w-full"
          value={formatNumberDisplay(value)}
          onChange={(e) => !f.readOnly && onChange(stripNonDigit(e.target.value))}
          placeholder={f.placeholder}
          readOnly={f.readOnly}
          title={lockedTitle}
          style={lockedStyle}
        />
      ) : (
        <input
          type={f.type === 'date' ? 'date' : 'text'}
          className="input w-full"
          value={value}
          onChange={(e) => !f.readOnly && onChange(e.target.value)}
          placeholder={f.placeholder}
          readOnly={f.readOnly}
          title={lockedTitle}
          style={lockedStyle}
        />
      )}
    </label>
  );
}
