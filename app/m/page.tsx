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
import { useMyPendingDispatchCount } from '@/lib/firebase/dispatch-store';
import { useWeather } from '@/lib/weather';
import {
  Truck, ArrowUUpLeft, CurrencyKrw, CaretRight, MagnifyingGlass,
  Calendar, ListChecks, Warning, PauseCircle, ShieldWarning, IdentificationCard,
  Megaphone,
} from '@phosphor-icons/react';
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
    const overdueDelivery: typeof contracts = [];
    const missingIdent: typeof contracts = [];
    const missingInsurance: typeof contracts = [];
    const insuranceGap: typeof contracts = [];
    const unpaidList: typeof contracts = [];
    const overdueReturn: typeof contracts = [];
    const idleList: typeof contracts = [];
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
          else if (diff === 1) tomorrow.delivery.push(c);
          else if (diff < 0 && !inactive) overdueDelivery.push(c);
        }
      }

      if (!c.returnedDate && c.returnScheduledDate) {
        const ret = toDate(c.returnScheduledDate);
        if (ret) {
          const diff = Math.floor((ret.getTime() - todayDate.getTime()) / dayMs);
          if (diff === 0) today.return.push(c);
          else if (diff === 1) tomorrow.return.push(c);
          else if (diff < 0) overdueReturn.push(c);
        }
      }

      if (c.unpaidAmount > 0) { unpaidList.push(c); totalUnpaid += c.unpaidAmount; }
      if (s === '휴차' || s === '휴차대기') idleList.push(c);

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
      today, tomorrow,
      overdueDelivery, missingIdent, missingInsurance,
      insuranceGap, unpaidList, overdueReturn, idleList,
      totalUnpaid,
    };
  }, [contracts, todayDate]);

  const todayCount = data.today.delivery.length + data.today.return.length;
  const tomorrowCount = data.tomorrow.delivery.length + data.tomorrow.return.length;
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
              <span title={weather.am.label} style={{ color: 'var(--blue-text)' }}>
                <span style={{ fontSize: 16, marginRight: 3 }}>{weather.am.icon}</span>
                오전 <strong>{weather.am.temp}°</strong>
              </span>
              <span title={weather.pm.label} style={{ color: 'var(--orange-text)' }}>
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

      {/* 오늘 할 일 — 인도 + 반납 통합. 클릭 시 운영 페이지 today 필터 진입 */}
      <DayCard
        href="/m/ops?filter=today"
        icon={<Calendar size={16} weight="duotone" />}
        title="오늘 할 일"
        tone="brand"
        total={todayCount}
        breakdown={[
          { label: '인도', count: data.today.delivery.length, items: data.today.delivery },
          { label: '반납', count: data.today.return.length, items: data.today.return },
        ]}
      />

      {/* 내일 할 일 */}
      <DayCard
        href="/m/ops?filter=tomorrow"
        icon={<Calendar size={16} weight="duotone" />}
        title="내일 할 일"
        tone="blue"
        total={tomorrowCount}
        breakdown={[
          { label: '인도', count: data.tomorrow.delivery.length, items: data.tomorrow.delivery },
          { label: '반납', count: data.tomorrow.return.length, items: data.tomorrow.return },
        ]}
      />

      {/* 요청받은 업무 */}
      <SummaryCard
        href="/m/orders"
        icon={<Megaphone size={16} weight="duotone" />}
        title="요청받은 업무"
        tone="amber"
        count={pendingOrders}
        countLabel="건"
        subtitle={pendingOrders > 0 ? '사무에서 받은 미확인 지시' : '받은 업무 없음'}
      />

      {/* 미결 업무 */}
      <SummaryCard
        href="/m/ops?filter=pending"
        icon={<ListChecks size={16} weight="duotone" />}
        title="미결 업무"
        tone="orange"
        count={pendingCount}
        countLabel="건"
        subtitle={pendingCount > 0
          ? `인도 지연 ${data.overdueDelivery.length} · 등록번호 결손 ${data.missingIdent.length} · 보험 결손 ${data.missingInsurance.length}`
          : '없음'}
      />

      {/* 리스크 요약 */}
      <SummaryCard
        href="/m/risk"
        icon={<Warning size={16} weight="duotone" />}
        title="리스크 요약"
        tone="red"
        count={riskCount}
        countLabel="건"
        subtitle={riskCount > 0
          ? `미수 ${data.unpaidList.length} (₩${formatCurrency(data.totalUnpaid)}) · 반납지연 ${data.overdueReturn.length} · 보험 ${data.insuranceGap.length}`
          : '리스크 없음'}
      />

      {/* 휴차 현황 */}
      <SummaryCard
        href="/m/ops?filter=idle"
        icon={<PauseCircle size={16} weight="duotone" />}
        title="휴차 현황"
        tone="gray"
        count={data.idleList.length}
        countLabel="대"
        subtitle={data.idleList.length > 0
          ? data.idleList.slice(0, 3).map((c) => c.vehiclePlate).filter(Boolean).join(' · ')
          : '휴차 차량 없음'}
      />
      </div>
    </div>
  );
}

/* ─────────── 인라인 검색 (드롭다운) ─────────── */

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
        <MagnifyingGlass size={18} weight="duotone" />
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

/* ─────────── 오늘/내일 카드 (인도+반납 통합) ─────────── */

function DayCard({ href, icon, title, tone, total, breakdown }: {
  href: string;
  icon: React.ReactNode;
  title: string;
  tone: 'brand' | 'blue';
  total: number;
  breakdown: { label: string; count: number; items: ReturnType<typeof useContracts>['contracts'] }[];
}) {
  const tones = {
    brand: { bg: 'var(--brand-bg)', fg: 'var(--brand)' },
    blue:  { bg: 'var(--blue-bg)',  fg: 'var(--blue-text)' },
  } as const;
  const t = tones[tone];
  const active = breakdown.filter((b) => b.count > 0);

  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <section style={{
        padding: 14, background: 'var(--bg-card)',
        border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: t.fg }}>{icon}</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px',
              background: total > 0 ? t.bg : 'var(--bg-sunken)',
              color: total > 0 ? t.fg : 'var(--text-sub)',
              borderRadius: 'var(--radius-sm)',
            }}>{total}건</span>
          </div>
          <CaretRight size={14} weight="bold" style={{ color: 'var(--text-weak)' }} />
        </div>
        {active.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-weak)' }}>없음</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {active.map((b) => (
              <div key={b.label}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-sub)', marginBottom: 4 }}>
                  {b.label} ({b.count})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {b.items.slice(0, 3).map((c) => (
                    <div key={c.id} style={{
                      padding: '6px 10px', background: 'var(--bg-sunken)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.vehiclePlate}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>{c.customerName}</span>
                      </div>
                    </div>
                  ))}
                  {b.items.length > 3 && (
                    <span style={{ fontSize: 10, color: 'var(--text-weak)' }}>... 외 {b.items.length - 3}건</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </Link>
  );
}

/* ─────────── 요약 카드 (요청업무/미결/리스크/휴차) ─────────── */

function SummaryCard({ href, icon, title, tone, count, countLabel, subtitle }: {
  href: string;
  icon: React.ReactNode;
  title: string;
  tone: 'brand' | 'amber' | 'orange' | 'red' | 'gray';
  count: number;
  countLabel: string;
  subtitle: string;
}) {
  const tones = {
    brand:  { bg: 'var(--brand-bg)',  fg: 'var(--brand)' },
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
