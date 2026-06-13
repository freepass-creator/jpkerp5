'use client';

/**
 * 모바일 입력 — 현장 직원의 즉시 폼 입력 액션.
 *
 * 액션 종류:
 *  · 인도 처리 / 반납 처리
 *  · 차량 위치·점검 메모
 *  · 통화·방문 기록
 *  · 비용 발생 (주유·세차·정비)
 *
 * Phase 1 (이번 라운드): 액션 그리드 placeholder
 * Phase 2: 각 액션별 폼 다이얼로그
 */

import Link from 'next/link';
import { NotePencil, Truck, ArrowUUpLeft, MapPin, Phone, Receipt, Wrench, IdentificationCard } from '@phosphor-icons/react';

type Action = {
  key: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  tone: 'brand' | 'green' | 'orange' | 'blue' | 'red';
  href?: string;        // 구현됐으면 라우트, 아니면 placeholder
};

const ACTIONS: Action[] = [
  { key: 'memo',     label: '메모',         desc: '차량/계약 메모',          icon: <NotePencil size={24} weight="duotone" />,         tone: 'brand', href: '/m/entry/memo' },
  { key: 'license',  label: '면허증 검증',  desc: 'OCR + 운전 가능 확인',     icon: <IdentificationCard size={24} weight="duotone" />, tone: 'blue',  href: '/m/entry/license' },
  { key: 'deliver',  label: '인도 처리',    desc: '고객에게 차량 인도',       icon: <Truck size={24} weight="duotone" />,              tone: 'green' },
  { key: 'return',   label: '반납 처리',    desc: '고객 반납 받음',           icon: <ArrowUUpLeft size={24} weight="duotone" />,       tone: 'orange' },
  { key: 'location', label: '위치 등록',    desc: '차량 현재 위치',           icon: <MapPin size={24} weight="duotone" />,             tone: 'blue' },
  { key: 'call',     label: '통화 기록',    desc: '방금 통화 메모',           icon: <Phone size={24} weight="duotone" />,              tone: 'blue' },
  { key: 'expense',  label: '비용 등록',    desc: '주유/세차/통행료',          icon: <Receipt size={24} weight="duotone" />,            tone: 'orange' },
  { key: 'inspect',  label: '점검 기록',    desc: '차량 점검 결과',           icon: <Wrench size={24} weight="duotone" />,             tone: 'brand' },
];

export default function MobileEntry() {
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <NotePencil size={22} weight="duotone" />
          입력
        </h1>
      </header>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10,
      }}>
        {ACTIONS.map((a) => (
          <ActionCard key={a.key} action={a} />
        ))}
      </div>

      <div style={{
        padding: 14, background: 'var(--bg-sunken)', borderRadius: 'var(--radius-lg)',
        fontSize: 11, color: 'var(--text-weak)', lineHeight: 1.6,
      }}>
        모든 입력은 차량 선택 → 폼 → 저장 흐름. 모바일 출처 (_meta.source=mobile) 자동 태깅.
        사무 직원이 활동 피드에서 신규 입력 즉시 확인 가능.
      </div>
    </div>
  );
}

function ActionCard({ action }: { action: Action }) {
  const tones = {
    brand:  { bg: 'var(--brand-bg)',  fg: 'var(--brand)' },
    green:  { bg: 'var(--green-bg)',  fg: 'var(--green-text)' },
    orange: { bg: 'var(--orange-bg)', fg: 'var(--orange-text)' },
    blue:   { bg: 'var(--blue-bg)',   fg: 'var(--blue-text)' },
    red:    { bg: 'var(--red-bg)',    fg: 'var(--red-text)' },
  } as const;
  const c = tones[action.tone];
  const implemented = !!action.href;
  const style: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start',
    padding: 14, background: implemented ? c.bg : 'var(--bg-sunken)',
    color: implemented ? c.fg : 'var(--text-weak)',
    border: `1px solid ${implemented ? c.fg + '33' : 'var(--border-soft)'}`,
    borderRadius: 'var(--radius-lg)',
    cursor: implemented ? 'pointer' : 'not-allowed',
    textAlign: 'left', textDecoration: 'none',
    minHeight: 96, touchAction: 'manipulation',
    fontFamily: 'inherit', position: 'relative',
  };
  const content = (
    <>
      {action.icon}
      <div style={{ fontSize: 14, fontWeight: 700 }}>{action.label}</div>
      <div style={{ fontSize: 10.5, opacity: 0.85 }}>{action.desc}</div>
      {!implemented && (
        <span style={{
          position: 'absolute', top: 8, right: 8, fontSize: 9,
          padding: '1px 5px', background: 'var(--bg-card)', color: 'var(--text-weak)',
          border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-sm)',
        }}>다음</span>
      )}
    </>
  );
  if (implemented) return <Link href={action.href!} style={style}>{content}</Link>;
  return <div style={style}>{content}</div>;
}
