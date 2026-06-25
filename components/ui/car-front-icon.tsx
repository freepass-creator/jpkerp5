/**
 * 정면 차 아이콘 — favicon (app/icon.tsx) + apple-icon 과 동일 디자인.
 * 플랫폼 통일 아이콘. 14-22px 작은 사이즈에서도 차로 인식되도록 단순화.
 *
 *   <CarFrontIcon size={14} />              // 사이드바
 *   <CarFrontIcon size={22} fill="..." />    // 헤더
 */

export function CarFrontIcon({
  size = 16, fill = 'currentColor', style,
}: {
  size?: number;
  fill?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={style}
      aria-hidden="true"
      fill={fill}
    >
      {/* 차체 — 사다리꼴 (위 좁고 아래 넓음 = 정면 원근) */}
      <path d="M4 11 L7.5 5 H16.5 L20 11 V19 H4 Z" />
      {/* 안쪽 디테일 (배경색으로 뚫어서 차 모양 분리) */}
      {/* 윈드쉴드 */}
      <path d="M8.5 6.5 H15.5 L17.5 11 H6.5 Z" fill="var(--bg-card, #fff)" />
      {/* 헤드라이트 양옆 */}
      <rect x="5" y="14" width="3" height="2" rx="0.5" fill="var(--bg-card, #fff)" />
      <rect x="16" y="14" width="3" height="2" rx="0.5" fill="var(--bg-card, #fff)" />
      {/* 그릴 가운데 */}
      <rect x="9" y="14.5" width="6" height="1" fill="var(--bg-card, #fff)" />
    </svg>
  );
}
