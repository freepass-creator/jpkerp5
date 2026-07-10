'use client';

/**
 * 페이지 하단 액션바 표준 프리미티브 (규격 통일 SSOT).
 *
 * 원칙: "같은 기능 = 같은 자리·아이콘·라벨·스타일". 페이지가 버튼 JSX를 손으로 그리지 말고
 * 여기 프리미티브를 canonical 순서로 조립한다.
 *
 * 하단바 좌측 순서(권장) — 모든 "버튼"은 좌측:
 *   [신규(primary)] · [업로드] │ [엑셀] · [문자] · (페이지별 보조) │ [선택 삭제(danger)] · [선택 해제]
 * 하단바 우측 — 읽기 전용 텍스트만, ⚠ 버튼 금지 (카톡·알림 popup 영역):
 *   <PageStats> — 표시/전체 N건 · 선택 N건 · 미수 ₩
 *
 * 사용:
 *   <BottomBar
 *     left={<><NewButton label="신규 계약" onClick={..}/><UploadButton onClick={..}/><ActionSep/>
 *              <ExcelButton count={n} onClick={..}/></>}
 *     right={<PageStats total={n} selectedCount={s} onClearSelection={..} unpaid={u}/>}
 *   />
 */

import type { ReactNode } from 'react';
import { Plus, Upload, FileXls, PaperPlaneTilt, Trash, X } from '@phosphor-icons/react';
import { formatCurrency } from '@/lib/utils';

/** 액션 사이 세로 구분선 — 인라인 style 난립 제거용 단일 소스. */
export function ActionSep() {
  return <span className="btn-sep" style={{ width: 1, height: 14, background: 'var(--border)', display: 'inline-block' }} />;
}

/**
 * 신규 등록 — 항상 primary·Plus·맨 왼쪽.
 * ⚠ label 은 페이지 맥락대로 `{페이지} 등록` 패턴 (Plus 아이콘이 '신규' 의미 내포 → '신규' 접두 불필요):
 *   운영현황="운영 현황 등록" · 계약="계약 등록" · 자산="차량 등록" · 회사="법인 등록" · 수납="수납 등록".
 *   모든 페이지가 똑같이 "신규 등록"이면 헷갈림 → generic "신규 등록" 지양, 무조건 맥락 라벨.
 *   (다이얼로그가 여러 종류를 만들어도 라벨은 그 페이지 맥락으로 — 예: 홈은 멀티모드라도 "운영 현황 등록".)
 */
export function NewButton({ label, onClick, title, disabled }: {
  label: string; onClick: () => void; title?: string; disabled?: boolean;
}) {
  return (
    <button className="btn btn-primary" type="button" onClick={onClick} title={title ?? label} disabled={disabled}>
      <Plus size={14} weight="bold" /> {label}
    </button>
  );
}

/**
 * 엑셀 일괄 업로드 — Upload 아이콘.
 * ⚠ 사용 기준: 대량 업로드는 대개 신규 다이얼로그의 "엑셀 업로드" 탭에 이미 있음 →
 *   그런 페이지엔 별도 업로드 버튼을 두지 말 것(중복·저빈도 버튼 낭비).
 *   업로드 전용 페이지(예: 이력 마이그레이션)처럼 신규 다이얼로그가 없을 때만 사용.
 */
export function UploadButton({ label = '업로드', onClick, title, disabled }: {
  label?: string; onClick: () => void; title?: string; disabled?: boolean;
}) {
  return (
    <button className="btn" type="button" onClick={onClick} title={title ?? '엑셀 일괄 업로드'} disabled={disabled}>
      <Upload size={14} weight="bold" /> {label}
    </button>
  );
}

/** 엑셀 다운로드 — FileXls + 대상 건수 chip. count=0 이면 disabled. */
export function ExcelButton({ count, onClick, label = '엑셀', title, disabled }: {
  count?: number; onClick: () => void; label?: string; title?: string; disabled?: boolean;
}) {
  const off = disabled ?? (typeof count === 'number' && count === 0);
  return (
    <button className="btn" type="button" onClick={onClick} disabled={off}
      title={title ?? (typeof count === 'number' ? `현재 목록 ${count}건 엑셀 다운로드` : '엑셀 다운로드')}>
      <FileXls size={14} weight="bold" /> {label}
      {typeof count === 'number' && <span className="chip-count" style={{ marginLeft: 4 }}>{count}</span>}
    </button>
  );
}

/** 문자 발송 — PaperPlaneTilt. 선택 건수 표기. 라벨은 항상 '문자 발송'. */
export function SmsButton({ count, onClick, disabled }: {
  count?: number; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button className="btn" type="button" onClick={onClick} title="문자 발송" disabled={disabled}>
      <PaperPlaneTilt size={14} /> 문자 발송{count && count > 0 ? ` (${count})` : ''}
    </button>
  );
}

/** 선택 삭제 — 항상 danger·Trash. 선택 건수 표기. */
export function DeleteButton({ count, onClick, label = '선택 삭제', title }: {
  count?: number; onClick: () => void; label?: string; title?: string;
}) {
  return (
    <button className="btn btn-danger" type="button" onClick={onClick}
      disabled={!count} title={title ?? (count ? `선택 ${count}건 삭제` : '삭제할 행을 선택하세요')}>
      <Trash size={14} /> {label}{count && count > 0 ? ` (${count})` : ''}
    </button>
  );
}

/** 선택 해제 — 좌측 클러스터 끝. 우측(카톡/알림 영역)에 버튼 두지 않기 위해 좌측에 배치. */
export function ClearButton({ count, onClick }: { count?: number; onClick: () => void }) {
  return (
    <button className="btn btn-sm btn-ghost" type="button" onClick={onClick} title="선택 해제">
      <X size={11} /> 선택 해제{count && count > 0 ? ` (${count})` : ''}
    </button>
  );
}

/** 페이지별 보조 액션 — 표준 btn 룩 유지(아이콘+라벨). */
export function ActionButton({ icon, label, onClick, disabled, danger, title }: {
  icon?: ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean; title?: string;
}) {
  return (
    <button className={`btn${danger ? ' btn-danger' : ''}`} type="button" onClick={onClick} disabled={disabled} title={title ?? label}>
      {icon} {label}
    </button>
  );
}

/**
 * 하단바 우측 통계 클러스터 — 표시/전체 · 선택 · 미수. ⚠ 읽기 전용 텍스트만(버튼 금지: 카톡/알림 영역).
 * totalLabel 기본 '전체'. 선택 해제 버튼은 좌측 <ClearButton> 사용.
 */
export function PageStats({ total, totalLabel = '전체', selectedCount = 0, unpaid, extra }: {
  total?: number; totalLabel?: string; selectedCount?: number; unpaid?: number; extra?: ReactNode;
}) {
  return (
    <>
      {extra}
      {typeof total === 'number' && <span>{totalLabel} <strong>{total}</strong>건</span>}
      {selectedCount > 0 && (
        <>
          <ActionSep />
          <span>선택 <strong>{selectedCount}</strong>건</span>
        </>
      )}
      {typeof unpaid === 'number' && unpaid > 0 && (
        <>
          <ActionSep />
          <span>미수 <strong className="mono" style={{ color: 'var(--red-text)' }}>₩{formatCurrency(unpaid)}</strong></span>
        </>
      )}
    </>
  );
}
