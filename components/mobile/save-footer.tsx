'use client';

/**
 * 모바일 저장 액션 하단 바 — 페이지 안에서 저장이 필요할 때.
 *
 *  · 좌측: 이전 (작게, secondary)
 *  · 우측: 저장/등록/다음 등 (크게, primary)
 *
 * z-index 101 — layout 의 기본 BackBar (z=100) 위로 덮음 (시각적 교체).
 * 같은 높이(58px) + 같은 safe-area 처리로 본문 padding-bottom 그대로.
 */

import { useRouter } from 'next/navigation';

type Props = {
  /** 우측 큰 버튼 라벨 (예: '메모 저장', '등록', '결과 저장') */
  primaryLabel: string;
  onPrimary: () => void;
  /** 우측 버튼 비활성 (예: 입력 비어있을 때) */
  primaryDisabled?: boolean;
  /** 우측 버튼 로딩 중 라벨 (예: '저장 중...') */
  primaryBusyLabel?: string;
  /** 우측 버튼 로딩 상태 */
  primaryBusy?: boolean;
  /** 좌측 '이전' 클릭 동작 — 기본 router.back() */
  onPrev?: () => void;
  /** 좌측 라벨 — 기본 '이전' */
  prevLabel?: string;
};

export function MobileSaveFooter({
  primaryLabel, onPrimary, primaryDisabled, primaryBusyLabel, primaryBusy,
  onPrev, prevLabel = '이전',
}: Props) {
  const router = useRouter();
  const prev = onPrev ?? (() => router.back());

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)',
      paddingLeft: 16, paddingRight: 16, paddingTop: 10,
      background: 'var(--bg-card)', borderTop: '1px solid var(--border)',
      zIndex: 101, boxShadow: '0 -2px 8px rgba(0,0,0,0.04)',
      display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8,
    }}>
      <button
        type="button"
        onClick={prev}
        style={{
          height: 48,
          background: 'var(--bg-card)', color: 'var(--text-sub)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
          cursor: 'pointer', touchAction: 'manipulation',
        }}
      >
        {prevLabel}
      </button>
      <button
        type="button"
        onClick={onPrimary}
        disabled={primaryDisabled || primaryBusy}
        style={{
          height: 48,
          background: 'var(--brand)', color: '#fff',
          border: '1px solid var(--brand)', borderRadius: 'var(--radius)',
          fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
          cursor: primaryBusy ? 'wait' : 'pointer',
          opacity: primaryDisabled ? 0.5 : 1,
          touchAction: 'manipulation',
        }}
      >
        {primaryBusy && primaryBusyLabel ? primaryBusyLabel : primaryLabel}
      </button>
    </nav>
  );
}
