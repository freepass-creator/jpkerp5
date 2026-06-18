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
 * 미입력 — 텍스트 강조. 박스 X. 강도 단계:
 *
 *   <MissingText label="위치" />                → 회색 (default·informational)
 *   <MissingText label="자등증" tone="red" />   → 빨강 (강조·중간 긴급도, 운영 막진 않음)
 *   <MissingText label="비고" tone="muted" />   → 회색 (=default, 명시 가능)
 *
 * 3단계 구분 (전체 미입력 표시 통일):
 *   1. <MissingBadge>           — 빨강 박스 [필수, 즉시]
 *   2. <MissingText tone='red'> — 빨강 텍스트 [강조, 시간 두고 OK]
 *   3. <MissingText>            — 회색 텍스트 [정보 누락, 무방]
 */
export function MissingText({
  label, title, suffix, tone = 'muted', style,
}: {
  label: string;
  title?: string;
  suffix?: ReactNode;
  tone?: 'muted' | 'red';
  style?: CSSProperties;
}) {
  const colorStyle: CSSProperties = tone === 'red'
    ? { color: 'var(--red-text)', fontWeight: 600 }
    : {};
  return (
    <span
      className={tone === 'muted' ? 'muted' : undefined}
      style={{ fontSize: 11, ...colorStyle, ...style }}
      title={title ?? `${label} 미입력`}
    >
      {label} 미입력{suffix}
    </span>
  );
}
