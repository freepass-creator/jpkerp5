'use client';

/**
 * 미입력 표시 — 공용 규격. 두 단계 구분.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ 1) <MissingBadge> — 빨강 박스 뱃지 [필수 즉시 입력]                       ║
 * ║   ✓ 안 입력하면 운영/회계/법적 문제 발생하는 케이스                       ║
 * ║   ✓ 회사 (매출·세금 분류), 운전자 (보험 미커버), 보험증권 미가입,         ║
 * ║     자등증 (행정), 운행 계약의 차량번호 등                                ║
 * ║                                                                          ║
 * ║ 2) <MissingText> — 흐릿한 회색 텍스트 [정보 누락, 추후 입력 가능]         ║
 * ║   ✓ 휴차 위치, 메모, 매입가, 비고 등 운영에 영향 없는 누락                ║
 * ║   ✓ <span className="muted">{label} 미입력</span> 패턴과 동일             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * 판단 기준 — 의심되면 텍스트 (보수적). 운영 막히면 뱃지로 격상.
 */

import type { CSSProperties, ReactNode } from 'react';

export function MissingBadge({
  label, title, compact = false, suffix, style,
}: {
  /** 짧은 라벨 — 예: '회사', '운전자', '보험연령' */
  label: string;
  /** 마우스 hover 시 상세 안내 */
  title?: string;
  /** true 면 더 작게 (셀 내 좁은 공간) */
  compact?: boolean;
  /** 라벨 뒤 추가 아이콘 또는 텍스트 (예: ⚠) */
  suffix?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontSize: compact ? 10 : 11, fontWeight: 600,
        padding: compact ? '1px 5px' : '2px 6px',
        borderRadius: 4,
        background: 'var(--red-bg)',
        color: 'var(--red-text)',
        border: '1px solid var(--red-text)',
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        ...style,
      }}
      title={title ?? `${label} 미입력 — 즉시 입력 필요`}
    >
      {label} 미입력{suffix}
    </span>
  );
}

/** 경고 약식 — 동일 규격이지만 'X' 같은 짧은 표기 (셀이 너무 좁을 때).
 *  hover 시 title 로 사유 전체 노출. */
export function MissingBadgeMini({ title, style }: { title: string; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 14, height: 14, fontSize: 9, fontWeight: 700,
        borderRadius: 3,
        background: 'var(--red-bg)',
        color: 'var(--red-text)',
        border: '1px solid var(--red-text)',
        lineHeight: 1,
        ...style,
      }}
      title={title}
    >
      !
    </span>
  );
}

/**
 * 미입력 — 텍스트 강조 (회색·dim). 운영 막히지 않는 정보 누락용.
 *
 *   <MissingText label="위치" />          → "위치 미입력" (dim)
 *   <MissingText label="매입가" suffix="?" /> → "매입가 미입력?"
 *
 * 정책: muted (var(--text-weak)) — 시각 부담 X. 운영자가 시간 두고 보완 가능.
 */
export function MissingText({
  label, title, suffix, style,
}: {
  label: string;
  title?: string;
  suffix?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span
      className="muted"
      style={{ fontSize: 11, ...style }}
      title={title ?? `${label} 미입력`}
    >
      {label} 미입력{suffix}
    </span>
  );
}
