'use client';

/**
 * 모바일 홈 — 오늘 핵심 + 알림 inbox.
 *
 * 표시:
 *  · 인도 예정 (오늘·내일)
 *  · 반납 임박 (D-3 이내)
 *  · 미수 (전체 합계 + 미납 N건)
 *  · 새 지시 (사무→현장) — TODO Phase 2 (dispatch_orders 노드)
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useAuth } from '@/lib/use-auth';
import { useTodayOnLeaveCount } from '@/lib/firebase/attendance-store';
import { useWeather } from '@/lib/weather';
import { Truck, ArrowUUpLeft, CurrencyKrw, Bell, CaretRight, MagnifyingGlass } from '@phosphor-icons/react';
import { formatCurrency } from '@/lib/utils';
import { todayKr } from '@/lib/mock-data';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export default function MobileHome() {
  const { contracts } = useContracts();
  const { user } = useAuth();
  const today = todayKr();
  const onLeave = useTodayOnLeaveCount();
  const weather = useWeather();
  const todayDate = new Date(today);
  const dateLabel = `${todayDate.getMonth() + 1}월 ${todayDate.getDate()}일 (${DOW[todayDate.getDay()]})`;

  const buckets = useMemo(() => {
    // 오늘·내일 D 자체 계산
    const todayDate = new Date(today);
    const dayMs = 24 * 60 * 60 * 1000;
    const toDate = (s?: string) => s ? new Date(s) : null;

    const deliveryToday: typeof contracts = [];
    const deliveryTomorrow: typeof contracts = [];
    const returnSoon: typeof contracts = [];
    let totalUnpaid = 0;
    let unpaidCount = 0;

    for (const c of contracts) {
      // 인도 예정 — deliveredDate 없고 deliveryScheduledDate 또는 contractDate 가 오늘/내일
      if (!c.deliveredDate) {
        const sched = toDate(c.deliveryScheduledDate ?? c.contractDate);
        if (sched) {
          const diff = Math.floor((sched.getTime() - todayDate.getTime()) / dayMs);
          if (diff === 0) deliveryToday.push(c);
          else if (diff === 1) deliveryTomorrow.push(c);
        }
      }
      // 반납 임박 — returnScheduledDate D-3 이내, 아직 안 반납
      if (!c.returnedDate && c.returnScheduledDate) {
        const ret = toDate(c.returnScheduledDate);
        if (ret) {
          const diff = Math.floor((ret.getTime() - todayDate.getTime()) / dayMs);
          if (diff >= 0 && diff <= 3) returnSoon.push(c);
        }
      }
      // 미수
      if (c.unpaidAmount > 0) {
        totalUnpaid += c.unpaidAmount;
        unpaidCount += 1;
      }
    }
    return { deliveryToday, deliveryTomorrow, returnSoon, totalUnpaid, unpaidCount };
  }, [contracts, today]);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 빠른 조회 — 페이지 진입 즉시 보이는 최상단. 운영현황 검색으로 점프 */}
      <Link href="/m/ops" style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '14px 16px', background: 'var(--bg-card)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        textDecoration: 'none', color: 'var(--text-sub)',
        touchAction: 'manipulation',
      }}>
        <MagnifyingGlass size={18} weight="duotone" />
        <span style={{ fontSize: 14 }}>차량번호 · 고객명 조회</span>
      </Link>

      {/* '오늘 + 날짜 + 요일 + 날씨 + 휴무' 한눈에 — 인사 한 줄 */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>{user?.email?.split('@')[0] ?? '직원'}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-main)' }}>오늘</span>
          <span style={{ fontSize: 14, color: 'var(--text-sub)', fontFamily: 'var(--font-mono)' }}>{dateLabel}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
          {weather.loading ? (
            <span style={{ color: 'var(--text-weak)' }}>날씨 ...</span>
          ) : weather.am && weather.pm ? (
            <>
              <span title={weather.am.label}>
                <span style={{ fontSize: 16, marginRight: 3 }}>{weather.am.icon}</span>
                오전 <strong>{weather.am.temp}°</strong>
              </span>
              <span title={weather.pm.label}>
                <span style={{ fontSize: 16, marginRight: 3 }}>{weather.pm.icon}</span>
                오후 <strong>{weather.pm.temp}°</strong>
              </span>
            </>
          ) : null}
          <span style={{
            padding: '2px 8px', background: onLeave.count > 0 ? 'var(--amber-bg)' : 'var(--bg-sunken)',
            color: onLeave.count > 0 ? 'var(--amber-text)' : 'var(--text-sub)',
            borderRadius: 'var(--radius)', fontWeight: 600,
          }}>
            휴무 {onLeave.count}명
          </span>
        </div>
      </header>

      {/* KPI 카드 4종 */}
      <KpiRow>
        <KpiCard
          tone="brand" icon={<Truck size={18} weight="duotone" />}
          label="오늘 인도" value={buckets.deliveryToday.length}
          href="/m/ops?filter=delivery-today"
        />
        <KpiCard
          tone="blue" icon={<Truck size={18} weight="duotone" />}
          label="내일 인도" value={buckets.deliveryTomorrow.length}
          href="/m/ops?filter=delivery-tomorrow"
        />
        <KpiCard
          tone="orange" icon={<ArrowUUpLeft size={18} weight="duotone" />}
          label="반납 임박" value={buckets.returnSoon.length}
          subtext="D-3 이내"
          href="/m/ops?filter=return-soon"
        />
        <KpiCard
          tone="red" icon={<CurrencyKrw size={18} weight="duotone" />}
          label="미수"
          value={buckets.unpaidCount}
          subtext={`₩${formatCurrency(buckets.totalUnpaid)}`}
          href="/m/risk?filter=unpaid"
        />
      </KpiRow>

      {/* 알림 inbox — Phase 2 dispatch_orders 노드 도입 후 채움 */}
      <section>
        <SectionHeader title="알림" icon={<Bell size={14} weight="duotone" />} />
        <div style={{
          padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--text-weak)',
          background: 'var(--bg-sunken)', borderRadius: 'var(--radius-lg)',
        }}>
          (Phase 2) 사무에서 등록한 새 지시·계약·인도건이 여기로 푸시됩니다
        </div>
      </section>

      {/* 오늘 인도 목록 */}
      {buckets.deliveryToday.length > 0 && (
        <section>
          <SectionHeader title={`오늘 인도 (${buckets.deliveryToday.length})`} icon={<Truck size={14} weight="duotone" />} />
          <ContractList items={buckets.deliveryToday} />
        </section>
      )}
      {/* 반납 임박 목록 */}
      {buckets.returnSoon.length > 0 && (
        <section>
          <SectionHeader title={`반납 임박 (${buckets.returnSoon.length})`} icon={<ArrowUUpLeft size={14} weight="duotone" />} />
          <ContractList items={buckets.returnSoon} />
        </section>
      )}
    </div>
  );
}

function KpiRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10,
    }}>{children}</div>
  );
}

function KpiCard({
  tone, icon, label, value, subtext, href,
}: {
  tone: 'brand' | 'blue' | 'orange' | 'red';
  icon: React.ReactNode;
  label: string;
  value: number;
  subtext?: string;
  href: string;
}) {
  const colorMap = {
    brand:  { bg: 'var(--brand-bg)',  fg: 'var(--brand)'      },
    blue:   { bg: 'var(--blue-bg)',   fg: 'var(--blue-text)'  },
    orange: { bg: 'var(--orange-bg)', fg: 'var(--orange-text)' },
    red:    { bg: 'var(--red-bg)',    fg: 'var(--red-text)'   },
  } as const;
  const c = colorMap[tone];
  return (
    <Link href={href} style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: 14, background: c.bg, borderRadius: 'var(--radius-lg)',
      textDecoration: 'none', color: c.fg, border: `1px solid ${c.fg}22`,
      touchAction: 'manipulation',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {icon}
        <CaretRight size={12} weight="bold" style={{ opacity: 0.5 }} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      {subtext && <div style={{ fontSize: 10, opacity: 0.85 }}>{subtext}</div>}
    </Link>
  );
}

function SectionHeader({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      {icon}
      <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>{title}</h2>
    </div>
  );
}

function ContractList({ items }: { items: { id: string; vehiclePlate?: string; customerName?: string; company?: string; vehicleModel?: string }[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.slice(0, 10).map((c) => (
        <Link key={c.id} href={`/m/contract/${c.id}`} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px', background: 'var(--bg-card)',
          border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)',
          textDecoration: 'none', color: 'inherit', touchAction: 'manipulation',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{c.vehiclePlate ?? '?'}</span>
              <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>{c.customerName ?? '?'}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-weak)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.vehicleModel ?? ''} · {c.company ?? ''}
            </div>
          </div>
          <CaretRight size={14} weight="bold" style={{ color: 'var(--text-weak)', flexShrink: 0 }} />
        </Link>
      ))}
    </div>
  );
}
