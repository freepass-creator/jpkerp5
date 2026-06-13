'use client';

/**
 * 모바일 홈 — 직원이 들어왔을 때 회사 현황 + 본인 할 일 한눈에.
 *
 * 카드:
 *  · 검색 (빠른 진입)
 *  · 오늘 헤더 (날짜 + 시간 + 날씨 + 휴무)
 *  · 오늘 할 일 (인도+반납+검사 통합)
 *  · 내일 할 일
 *  · 요청받은 업무 (사무→나 지시)
 *  · 미결 업무 (데이터 결손, 인도 지연)
 *  · 리스크 요약 (/m/risk 점프)
 *  · 휴차 현황
 *
 * 데이터: 기존 Contract 필드 + 신규 dispatch_orders 만.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useAuth } from '@/lib/use-auth';
import { useTodayOnLeaveCount } from '@/lib/firebase/attendance-store';
import { useMyPendingDispatchCount, useSentDispatchOrders } from '@/lib/firebase/dispatch-store';
import { useWeather } from '@/lib/weather';
import {
  CaretRight, MagnifyingGlass,
  Calendar, CalendarBlank, ListChecks, Clock, ShieldWarning,
  Megaphone, PaperPlaneTilt, CarProfile,
  Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog,
} from '@phosphor-icons/react';
import type { WeatherIconKey } from '@/lib/weather';
import { formatCurrency } from '@/lib/utils';
import { todayKr } from '@/lib/mock-data';
import { ageFromIdent } from '@/lib/ident';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export default function MobileHome() {
  const { contracts } = useContracts();
  const { user } = useAuth();
  const today = todayKr();
  const onLeave = useTodayOnLeaveCount();
  const weather = useWeather();
  const pendingOrders = useMyPendingDispatchCount(user?.uid ?? null);
  const sentOrders = useSentDispatchOrders(user?.email ?? null);
  const sentOpenCount = sentOrders.filter((o) => o.status !== 'done' && o.status !== 'cancelled').length;
  const todayDate = new Date(today);
  const dateLabel = `${todayDate.getMonth() + 1}월 ${todayDate.getDate()}일 (${DOW[todayDate.getDay()]})`;

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  const hh = now.getHours();
  const mm = now.getMinutes();
  const ampm = hh < 12 ? '오전' : '오후';
  const h12 = ((hh + 11) % 12) + 1;
  const timeLabel = `${ampm} ${h12}:${mm.toString().padStart(2, '0')}`;

  const data = useMemo(() => {
    const dayMs = 24 * 60 * 60 * 1000;
    const toDate = (s?: string) => s ? new Date(s) : null;

    const today: { delivery: typeof contracts; return: typeof contracts } = { delivery: [], return: [] };
    const tomorrow: { delivery: typeof contracts; return: typeof contracts } = { delivery: [], return: [] };
    const upcoming: { delivery: typeof contracts; return: typeof contracts } = { delivery: [], return: [] };
    const overdueDelivery: typeof contracts = [];
    const missingIdent: typeof contracts = [];
    const missingInsurance: typeof contracts = [];
    const insuranceGap: typeof contracts = [];
    const unpaidList: typeof contracts = [];
    const overdueReturn: typeof contracts = [];
    const idleList: typeof contracts = [];
    const runningList: typeof contracts = [];      // 계약중
    const returningList: typeof contracts = [];    // 만기임박 (D-7 이내)
    const deliveringList: typeof contracts = [];   // 인도 예정
    const opsActiveIds = new Set<string>();
    let totalUnpaid = 0;

    for (const c of contracts) {
      const s = c.vehicleStatus;
      const inactive = s === '휴차' || s === '휴차대기' || s === '매각검토'
        || s === '매각' || s === '매각대기'
        || s === '상품화대기' || s === '상품화중' || s === '상품대기'
        || s === '구매대기' || s === '등록대기'
        || c.status === '반납' || c.status === '해지';

      if (!c.deliveredDate) {
        const sched = toDate(c.deliveryScheduledDate ?? c.contractDate);
        if (sched) {
          const diff = Math.floor((sched.getTime() - todayDate.getTime()) / dayMs);
          if (diff === 0) today.delivery.push(c);
          else if (diff === 1) { tomorrow.delivery.push(c); upcoming.delivery.push(c); }
          else if (diff > 1) upcoming.delivery.push(c);
          else if (diff < 0 && !inactive) overdueDelivery.push(c);
        }
      }

      if (!c.returnedDate && c.returnScheduledDate) {
        const ret = toDate(c.returnScheduledDate);
        if (ret) {
          const diff = Math.floor((ret.getTime() - todayDate.getTime()) / dayMs);
          if (diff === 0) today.return.push(c);
          else if (diff === 1) { tomorrow.return.push(c); upcoming.return.push(c); }
          else if (diff > 1) upcoming.return.push(c);
          else if (diff < 0) overdueReturn.push(c);
        }
      }

      if (c.unpaidAmount > 0) { unpaidList.push(c); totalUnpaid += c.unpaidAmount; }
      if (s === '휴차' || s === '휴차대기') { idleList.push(c); opsActiveIds.add(c.id); }
      if (s === '운행') { runningList.push(c); opsActiveIds.add(c.id); }
      // 만기임박 — !returnedDate + 예정일 D-7 이내
      if (!c.returnedDate && c.returnScheduledDate) {
        const ret = toDate(c.returnScheduledDate);
        if (ret) {
          const diff = Math.floor((ret.getTime() - todayDate.getTime()) / dayMs);
          if (diff >= 0 && diff <= 7) { returningList.push(c); opsActiveIds.add(c.id); }
        }
      }
      // 인도 예정 — !deliveredDate + active
      if (!c.deliveredDate && !inactive) { deliveringList.push(c); opsActiveIds.add(c.id); }

      if (!inactive) {
        const d = (c.customerIdentNo ?? '').replace(/\D/g, '');
        if (c.customerKind !== '법인' && d.length !== 13) missingIdent.push(c);
        if (!c.insuranceAge) missingInsurance.push(c);

        const ia = c.insuranceAge ?? 0;
        const driverIdent = c.customerKind === '법인' ? c.driverIdentNo : (c.customerIdentNo ?? c.driverIdentNo);
        const age = ageFromIdent(driverIdent, '개인');
        const blocked = (ia > 0 && age != null && age < ia);
        const missingDriver = ia > 0 && age == null;
        if (blocked || missingDriver) insuranceGap.push(c);
      }
    }

    return {
      today, tomorrow, upcoming,
      overdueDelivery, missingIdent, missingInsurance,
      insuranceGap, unpaidList, overdueReturn, idleList,
      runningList, returningList, deliveringList,
      opsActiveCount: opsActiveIds.size,
      totalUnpaid,
    };
  }, [contracts, todayDate]);

  const todayCount = data.today.delivery.length + data.today.return.length;
  const missedCount = data.overdueDelivery.length + data.overdueReturn.length;
  const upcomingCount = data.upcoming.delivery.length + data.upcoming.return.length;
  const pendingCount = data.overdueDelivery.length + data.missingIdent.length + data.missingInsurance.length;
  const riskCount = data.unpaidList.length + data.overdueReturn.length + data.insuranceGap.length + data.missingIdent.length;

  return (
    <div>
      {/* 인라인 검색 (C 안) — 상단 고정. 타이핑 시 드롭다운 즉시 표시 */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--bg-card)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '12px 16px 10px',
        borderTop: '3px solid var(--green-text)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <InlineSearch contracts={contracts} />
      </div>

      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 오늘 헤더 */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-main)' }}>오늘</span>
          <span style={{ fontSize: 14, color: 'var(--text-sub)', fontFamily: 'var(--font-mono)' }}>{dateLabel}</span>
          <span style={{ fontSize: 14, color: 'var(--text-main)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{timeLabel}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
          {weather.loading ? (
            <span style={{ color: 'var(--text-weak)' }}>날씨 ...</span>
          ) : weather.am && weather.pm ? (
            <>
              <span title={weather.am.label} style={{ color: 'var(--text-sub)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <WeatherIcon icon={weather.am.iconKey} />
                오전 <strong>{weather.am.temp}°</strong>
              </span>
              <span title={weather.pm.label} style={{ color: 'var(--text-sub)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <WeatherIcon icon={weather.pm.iconKey} />
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

      {/* 일정 — 내가 처리해야 할 것 (시간축 + 받은 지시) */}
      <SectionGroup label="일정">
        <SummaryCard
          href="/m/missed"
          icon={<Clock size={16} weight="bold" />}
          title="밀린 업무"
          tone="red"
          count={missedCount}
          countLabel="건"
          subtitle={missedCount > 0
            ? `인도지연 ${data.overdueDelivery.length} · 반납지연 ${data.overdueReturn.length}`
            : '밀린 업무 없음'}
        />
        <SummaryCard
          href="/m/today"
          icon={<Calendar size={16} weight="bold" />}
          title="오늘 업무"
          tone="brand"
          count={todayCount}
          countLabel="건"
          subtitle={todayCount > 0
            ? `인도 ${data.today.delivery.length} · 반납 ${data.today.return.length}`
            : '오늘 일정 없음'}
        />
        <SummaryCard
          href="/m/upcoming"
          icon={<CalendarBlank size={16} weight="bold" />}
          title="예정 업무"
          tone="blue"
          count={upcomingCount}
          countLabel="건"
          subtitle={upcomingCount > 0
            ? `인도 ${data.upcoming.delivery.length} · 반납 ${data.upcoming.return.length}`
            : '예정 일정 없음'}
        />
        <SummaryCard
          href="/m/orders"
          icon={<Megaphone size={16} weight="bold" />}
          title="받은 업무"
          tone="amber"
          count={pendingOrders}
          countLabel="건"
          subtitle={pendingOrders > 0 ? '미확인 지시 대기' : '받은 업무 없음'}
        />
      </SectionGroup>

      {/* 요청 — 새 요청 보내기 + 내가 보낸 거 추적 */}
      <SectionGroup label="요청">
        <SummaryCard
          href="/m/orders?view=sent"
          icon={<PaperPlaneTilt size={16} weight="bold" />}
          title="보낸 업무"
          tone="indigo"
          count={sentOpenCount}
          countLabel="건"
          subtitle={sentOpenCount > 0 ? '진행 중인 내가 보낸 지시' : '보낸 업무 없음'}
        />
      </SectionGroup>

      {/* 현황 — 회사 전체 모니터링 */}
      <SectionGroup label="현황">
        <SummaryCard
          href="/m/ops"
          icon={<CarProfile size={16} weight="bold" />}
          title="운영 요약"
          tone="brand"
          count={data.opsActiveCount}
          countLabel="대"
          subtitle={data.opsActiveCount > 0
            ? `계약중 ${data.runningList.length} · 휴차 ${data.idleList.length} · 만기임박 ${data.returningList.length} · 인도예정 ${data.deliveringList.length}`
            : '운영 차량 없음'}
        />
        <SummaryCard
          href="/m/risk"
          icon={<ShieldWarning size={16} weight="bold" />}
          title="리스크 요약"
          tone="red"
          count={riskCount}
          countLabel="건"
          subtitle={riskCount > 0
            ? `미수 ${data.unpaidList.length} (₩${formatCurrency(data.totalUnpaid)}) · 반납지연 ${data.overdueReturn.length} · 보험 ${data.insuranceGap.length}`
            : '리스크 없음'}
        />
        <SummaryCard
          href="/m/ops?filter=pending"
          icon={<ListChecks size={16} weight="bold" />}
          title="보완 필요"
          tone="orange"
          count={pendingCount}
          countLabel="건"
          subtitle={pendingCount > 0
            ? `인도지연 ${data.overdueDelivery.length} · 등록번호 ${data.missingIdent.length} · 보험 ${data.missingInsurance.length}`
            : '없음'}
        />
      </SectionGroup>
      </div>
    </div>
  );
}

/* ─────────── 섹션 그룹 ─────────── */

function SectionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h3 style={{
        margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
        color: 'var(--text-weak)', textTransform: 'uppercase',
        paddingLeft: 2,
      }}>{label}</h3>
      {children}
    </section>
  );
}

/* ─────────── 인라인 검색 (드롭다운) ─────────── */

function WeatherIcon({ icon }: { icon: WeatherIconKey }) {
  const Icon =
    icon === 'sun'       ? Sun
    : icon === 'cloud_sun' ? CloudSun
    : icon === 'cloud'   ? Cloud
    : icon === 'rain'    ? CloudRain
    : icon === 'snow'    ? CloudSnow
    : icon === 'storm'   ? CloudLightning
    : icon === 'fog'     ? CloudFog
    : Cloud;
  return <Icon size={14} weight="bold" />;
}

function InlineSearch({ contracts }: { contracts: ReturnType<typeof useContracts>['contracts'] }) {
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);

  const matches = useMemo(() => {
    const query = q.trim().toLowerCase().replace(/[^\w가-힣]/g, '');
    if (!query) return [];
    return contracts
      .filter((c) => `${c.vehiclePlate ?? ''}${c.customerName ?? ''}${c.customerPhone1 ?? ''}`
        .toLowerCase().replace(/[^\w가-힣]/g, '').includes(query))
      .slice(0, 7);
  }, [contracts, q]);

  const showDropdown = focused && q.trim().length > 0;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 14px', background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: showDropdown ? 'var(--radius-lg) var(--radius-lg) 0 0' : 'var(--radius-lg)',
      }}>
        <MagnifyingGlass size={18} weight="bold" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="차량번호 · 고객명 조회"
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 14, fontFamily: 'inherit', color: 'var(--text-main)',
          }}
        />
        {q && (
          <button type="button" onClick={() => setQ('')} style={{
            padding: 4, background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-sub)',
          }} aria-label="지우기">✕</button>
        )}
      </div>

      {showDropdown && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)', borderTop: 'none',
          borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
          boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
          zIndex: 60, overflow: 'hidden',
        }}>
          {matches.length === 0 ? (
            <div style={{ padding: 14, textAlign: 'center', fontSize: 12, color: 'var(--text-weak)' }}>
              결과 없음
            </div>
          ) : (
            <>
              {matches.map((c) => (
                <Link key={c.id} href={`/m/contract/${c.id}`} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--border-soft)',
                  textDecoration: 'none', color: 'inherit',
                  touchAction: 'manipulation',
                }}>
                  <div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 13 }}>{c.vehiclePlate ?? '?'}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>{c.customerName ?? '?'}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-weak)' }}>
                      {c.vehicleModel ?? ''} · {c.company ?? ''}
                    </div>
                  </div>
                  <CaretRight size={12} weight="bold" style={{ color: 'var(--text-weak)' }} />
                </Link>
              ))}
              <Link href={`/m/ops?q=${encodeURIComponent(q)}`} style={{
                display: 'block', textAlign: 'center', padding: '10px 14px',
                fontSize: 12, fontWeight: 600, color: 'var(--brand)',
                textDecoration: 'none', background: 'var(--bg-sunken)',
              }}>
                전체 결과 보기 →
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────── 요약 카드 (홈 단일 규격) ─────────── */

function SummaryCard({ href, icon, title, tone, count, countLabel, subtitle }: {
  href: string;
  icon: React.ReactNode;
  title: string;
  tone: 'brand' | 'blue' | 'indigo' | 'amber' | 'orange' | 'red' | 'gray';
  count: number;
  countLabel: string;
  subtitle: string;
}) {
  const tones = {
    brand:  { bg: 'var(--brand-bg)',  fg: 'var(--brand)' },
    blue:   { bg: 'var(--blue-bg)',   fg: 'var(--blue-text)' },
    indigo: { bg: 'var(--indigo-bg)', fg: 'var(--indigo-text)' },
    amber:  { bg: 'var(--amber-bg)',  fg: 'var(--amber-text)' },
    orange: { bg: 'var(--orange-bg)', fg: 'var(--orange-text)' },
    red:    { bg: 'var(--red-bg)',    fg: 'var(--red-text)' },
    gray:   { bg: 'var(--bg-sunken)', fg: 'var(--text-sub)' },
  } as const;
  const t = tones[tone];
  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <section style={{
        padding: 14, background: 'var(--bg-card)',
        border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 'var(--radius)',
          background: t.bg, color: t.fg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{title}</span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '1px 7px',
              background: count > 0 ? t.bg : 'var(--bg-sunken)',
              color: count > 0 ? t.fg : 'var(--text-sub)',
              borderRadius: 'var(--radius-sm)',
            }}>{count}{countLabel}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-weak)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitle}
          </div>
        </div>
        <CaretRight size={14} weight="bold" style={{ color: 'var(--text-weak)' }} />
      </section>
    </Link>
  );
}
