'use client';

import { CircleNotch } from '@phosphor-icons/react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * 공용 로딩 프리미티브 — "빙빙 도는" 스피너 규격 SSOT.
 * 인라인 `style={{ animation:'spin …' }}` 손롤 금지 → 이 컴포넌트/`.spin` 클래스만 사용.
 */

export function SpinnerIcon({ size = 14, className = '' }: { size?: number; className?: string }) {
  return <CircleNotch size={size} weight="bold" className={`spin ${className}`.trim()} />;
}

type BusyButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** 처리 중 — 스피너 표시 + disable */
  busy?: boolean;
  /** 처리 중 라벨 (없으면 children 유지) */
  busyLabel?: ReactNode;
  /** 스피너 크기 */
  spinnerSize?: number;
};

/**
 * busy 시 자동으로 스피너를 도는 버튼 — 저장/커밋/업로드 진행표시 통일.
 *   <BusyButton busy={saving} busyLabel="저장 중…" className="btn btn-primary" onClick={...}>
 *     <Plus size={14}/> 등록
 *   </BusyButton>
 */
export function BusyButton({ busy = false, busyLabel, spinnerSize = 14, className = 'btn', disabled, type = 'button', children, ...rest }: BusyButtonProps) {
  return (
    <button type={type} className={className} disabled={busy || disabled} {...rest}>
      {busy ? (
        <>
          <SpinnerIcon size={spinnerSize} />
          {busyLabel ?? children}
        </>
      ) : children}
    </button>
  );
}
