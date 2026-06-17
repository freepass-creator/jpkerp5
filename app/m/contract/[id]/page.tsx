'use client';

/**
 * 모바일 계약 상세 — 핵심 정보 + 액션.
 *
 * Phase 1 (이번 라운드): 기본 hero + 정보 카드 + 액션 4종 placeholder
 * Phase 2: 통화이력·사진 갤러리·메모 인라인 입력
 */

import { useParams, useSearchParams } from 'next/navigation';
import { useContracts } from '@/lib/firebase/contracts-store';
import {
  useFieldLogs, useVehicleFieldLogs, useCustomerFieldLogs,
  FIELD_LOG_LABEL, FIELD_LOG_TONE, SCOPE_LABEL, SCOPE_TONE,
  type FieldLog,
} from '@/lib/firebase/field-logs-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useMemo, useRef } from 'react';
import {
  Phone, ChatCircle, Paperclip, NotePencil,
  ArrowUUpLeft, ShieldWarning, IdentificationCard, CurrencyKrw,
  CheckCircle, Circle,
} from '@phosphor-icons/react';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/lib/toast';

export default function MobileContractDetail() {
  const params = useParams();
  const searchParams = useSearchParams();
  const riskKind = searchParams?.get('risk') ?? null;
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';
  const { contracts } = useContracts();
  const { vehicles } = useVehicles();
  const c = contracts.find((x) => x.id === id);

  // 3 scope 로그 라이브 — 계약 / 차량 / 손님
  const contractLogs = useFieldLogs(c?.id);
  const vehicleId = c?.vehiclePlate
    ? vehicles.find((v) =>
        (v.plate ?? '').trim() === (c.vehiclePlate ?? '').trim()
        || (v.plateHistory ?? []).some((p) => (p ?? '').trim() === (c.vehiclePlate ?? '').trim())
      )?.id ?? null
    : null;
  const customerKey = (c?.customerIdentNo ?? '').replace(/\D/g, '') || null;
  const vehicleLogs = useVehicleFieldLogs(vehicleId);
  const customerLogs = useCustomerFieldLogs(customerKey);

  // 첨부 공유 — 파일 input + Web Share API
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  function triggerFileShare() {
    if (!c) return;
    fileInputRef.current?.click();
  }
  async function handleFileShare(files: FileList | null) {
    if (!files || files.length === 0 || !c) return;
    const fileArr = Array.from(files);
    const text = `[${c.vehiclePlate ?? ''}] ${c.customerName ?? ''}`;
    if (navigator.canShare && navigator.canShare({ files: fileArr })) {
      try {
        await navigator.share({ files: fileArr, title: c.customerName ?? '', text });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') toast.error('공유 실패');
      }
    } else {
      toast.warning('이 브라우저는 파일 공유 미지원');
    }
  }

  // 통합 — 중복 id 제거 (계약 메모는 자동 전파되므로 동일 id가 3노드에 나옴)
  const mergedLogs = useMemo(() => {
    const map = new Map<string, FieldLog>();
    for (const l of [...contractLogs, ...vehicleLogs, ...customerLogs]) {
      if (!map.has(l.id)) map.set(l.id, l);
    }
    const list = Array.from(map.values());
    list.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
    return list;
  }, [contractLogs, vehicleLogs, customerLogs]);

  if (!c) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{
          padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-weak)',
          background: 'var(--bg-sunken)', borderRadius: 'var(--radius-lg)', marginTop: 16,
        }}>
          계약을 찾을 수 없습니다
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* 상단 고정 — Hero (차량번호 + 상태) + 액션 4종. 정보 카드 스크롤해도 액션 노출 */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--bg-card)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <header style={{
          background: 'linear-gradient(135deg, var(--brand-bg), var(--bg-card))',
          padding: '14px 16px 18px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{c.vehiclePlate ?? '?'}</div>
            <div style={{ fontSize: 13, color: 'var(--text-sub)', marginTop: 2 }}>
              {c.vehicleModel ?? '-'} · {c.company ?? '-'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <Chip>{c.vehicleStatus}</Chip>
            {c.status && c.status !== c.vehicleStatus && <Chip>{c.status}</Chip>}
            {c.unpaidAmount > 0 && <Chip tone="red">미수 ₩{formatCurrency(c.unpaidAmount)}</Chip>}
          </div>
        </header>

        {/* 액션 4종 — Hero 와 함께 고정. 손님 소통 + 첨부 */}
        <div style={{
          padding: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)',
        }}>
        <ActionBtn
          icon={<Phone size={22} weight="duotone" />}
          label="전화"
          href={c.customerPhone1 ? `tel:${c.customerPhone1}` : undefined}
          disabled={!c.customerPhone1}
        />
        <ActionBtn
          icon={<ChatCircle size={22} weight="duotone" />}
          label="메시지"
          href={c.customerPhone1 ? `sms:${c.customerPhone1}` : undefined}
          disabled={!c.customerPhone1}
        />
        <ActionBtn
          icon={<Paperclip size={22} weight="duotone" />}
          label="첨부"
          onClick={() => triggerFileShare()}
        />
        <ActionBtn
          icon={<NotePencil size={22} weight="duotone" />}
          label="메모"
          href={`/m/entry/memo?contractId=${c.id}`}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => void handleFileShare(e.target.files)}
        />
        </div>
      </div>

      {/* 정보 카드들 */}
      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 리스크 컨텍스트 — ?risk=X 진입 시 상단 강조 카드 */}
        {riskKind && <RiskContextCard kind={riskKind} contract={c} />}

        {/* 계약 흐름 timeline — 어떻게 계약되서 어떤 상태인지 */}
        <LifecycleTimeline contract={c} />

        {/* 리스크=unpaid 진입 시 결제 이력 (회차별 schedules) 노출 */}
        {riskKind === 'unpaid' && c.schedules && c.schedules.length > 0 && (
          <PaymentScheduleHistory schedules={c.schedules} />
        )}

        <InfoSection title="고객">
          <Row label="이름" value={c.customerName ?? '-'} />
          <Row label="연락처" value={c.customerPhone1 ?? '-'} mono />
          {c.customerPhone2 && <Row label="연락처2" value={c.customerPhone2} mono />}
          <Row label="구분" value={c.customerKind ?? '-'} />
        </InfoSection>

        <InfoSection title="계약">
          <Row label="계약번호" value={c.contractNo ?? '-'} mono />
          <Row label="계약일" value={c.contractDate ?? '-'} mono />
          <Row label="인도일" value={c.deliveredDate ?? '-'} mono />
          <Row label="반납예정" value={c.returnScheduledDate ?? '-'} mono />
          <Row label="기간" value={c.termMonths ? `${c.termMonths}개월` : '-'} />
        </InfoSection>

        <InfoSection title="결제">
          <Row label="월 대여료" value={`₩${formatCurrency(c.monthlyRent ?? 0)}`} mono />
          <Row label="보증금" value={`₩${formatCurrency(c.deposit ?? 0)}`} mono />
          <Row label="결제일" value={c.paymentDay ? `${c.paymentDay}일` : '-'} />
          <Row label="결제시기" value={c.paymentTiming ?? '-'} />
          <Row label="회차" value={`${c.currentSeq ?? 0} / ${c.totalSeq ?? 0}`} mono />
          <Row label="최근 결제일" value={c.lastPaidDate ?? '-'} mono />
          {c.lastPaidAmount ? <Row label="최근 결제금액" value={`₩${formatCurrency(c.lastPaidAmount)}`} mono /> : null}
          <Row label="미수금" value={c.unpaidAmount > 0 ? `₩${formatCurrency(c.unpaidAmount)}` : '없음'} mono danger={c.unpaidAmount > 0} />
          {c.unpaidAmount > 0 && c.unpaidSeqCount > 0 && (
            <Row label="미납 회차" value={`${c.unpaidSeqCount}회차`} danger />
          )}
          {c.unpaidAmount > 0 && (() => {
            const days = calcOverdueDays(c);
            return days != null ? <Row label="미수 기간" value={`${days}일`} mono danger /> : null;
          })()}
        </InfoSection>

        {/* 차량 정보 — 색상/차대번호/보험 */}
        <InfoSection title="차량">
          <Row label="차종" value={c.vehicleModel ?? '-'} />
          {(c.vehicleExteriorColor || c.vehicleInteriorColor) && (
            <Row label="색상" value={[c.vehicleExteriorColor, c.vehicleInteriorColor].filter(Boolean).join(' · ')} />
          )}
          <Row label="차량 상태" value={c.vehicleStatus} />
          <Row label="보험연령" value={c.insuranceAge ? `${c.insuranceAge}세` : '-'} />
        </InfoSection>

        {c.notes && (
          <InfoSection title="비고">
            <div style={{ fontSize: 13, color: 'var(--text-main)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {c.notes}
            </div>
          </InfoSection>
        )}

        {mergedLogs.length > 0 && (
          <InfoSection title={`현장 입력 (${mergedLogs.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mergedLogs.map((l) => {
                const tone = FIELD_LOG_TONE[l.type];
                const scope = l.scope ?? 'contract';
                const scopeTone = SCOPE_TONE[scope];
                return (
                  <div key={l.id} style={{
                    padding: '8px 10px', background: 'var(--bg-sunken)',
                    borderRadius: 'var(--radius-md)',
                    borderLeft: `3px solid var(--${tone === 'brand' ? 'brand' : tone + '-text'})`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: `var(--${tone === 'brand' ? 'brand' : tone + '-text'})` }}>
                          {FIELD_LOG_LABEL[l.type]}
                        </span>
                        <span className={`badge-base badge-${scopeTone}`} style={{ fontSize: 9, padding: '0 5px' }}>
                          {SCOPE_LABEL[scope]}
                        </span>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-weak)' }}>
                        {l.at.slice(5, 16).replace('T', ' ')}
                        {l._meta?.source === 'mobile' && ' · 모바일'}
                      </span>
                    </div>
                    {l.body && (
                      <div style={{ fontSize: 12, color: 'var(--text-main)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {l.body}
                      </div>
                    )}
                    {l._meta?.by && (
                      <div style={{ fontSize: 9.5, color: 'var(--text-weak)', marginTop: 4 }}>
                        {l._meta.by}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </InfoSection>
        )}
      </div>
    </div>
  );
}

/** 미수 기간 계산 — 가장 오래된 미납 회차 dueDate 또는 lastPaidDate 기준 */
function calcOverdueDays(c: { unpaidAmount?: number; schedules?: { status: string; dueDate: string }[]; lastPaidDate?: string; contractDate?: string }): number | null {
  if (!c.unpaidAmount || c.unpaidAmount <= 0) return null;
  // 1순위 — 가장 오래된 미납/연체/부분납 회차 dueDate
  const oldestUnpaid = (c.schedules ?? [])
    .filter((s) => s.status === '연체' || s.status === '부분납' || s.status === '예정')
    .map((s) => s.dueDate)
    .filter(Boolean)
    .sort()[0];
  const baseDate = oldestUnpaid ?? c.lastPaidDate ?? c.contractDate;
  if (!baseDate) return null;
  const diff = Math.floor((Date.now() - new Date(baseDate).getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : null;
}

/* ─────────────── 결제 이력 (리스크 unpaid 컨텍스트) ─────────────── */

function PaymentScheduleHistory({ schedules }: { schedules: NonNullable<ReturnType<typeof useContracts>['contracts'][number]['schedules']> }) {
  const sorted = [...schedules].sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  return (
    <section style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-soft)',
      borderRadius: 'var(--radius-lg)', overflow: 'hidden',
    }}>
      <header style={{
        padding: '10px 14px', background: 'var(--bg-sunken)',
        borderBottom: '1px solid var(--border-soft)',
        fontSize: 11, fontWeight: 700, color: 'var(--text-sub)',
      }}>결제 이력 ({sorted.length}회차)</header>
      <div>
        {sorted.map((s) => {
          const tone =
            s.status === '완료' ? 'green'
            : s.status === '부분납' ? 'orange'
            : s.status === '연체' ? 'red'
            : s.status === '면제' ? 'gray'
            : 'gray';
          return (
            <div key={s.seq} style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr auto auto',
              gap: 8, alignItems: 'center',
              padding: '8px 14px', borderTop: '1px solid var(--border-soft)',
              fontSize: 12,
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-weak)', minWidth: 24 }}>{s.seq}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{s.dueDate}</span>
              <span className="mono" style={{
                color: s.status === '연체' ? 'var(--red-text)'
                  : s.status === '완료' ? 'var(--text-main)'
                  : 'var(--text-sub)',
                fontWeight: 600,
              }}>
                {s.paidAmount > 0 ? `${(s.paidAmount / 10000).toFixed(0)}만` : '-'}
                <span style={{ color: 'var(--text-weak)' }}> / {(s.amount / 10000).toFixed(0)}만</span>
              </span>
              <span className={`badge-base badge-${tone}`} style={{ fontSize: 9 }}>{s.status}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─────────────── 리스크 컨텍스트 카드 ─────────────── */

function RiskContextCard({ kind, contract: c }: { kind: string; contract: ReturnType<typeof useContracts>['contracts'][number] }) {
  const map: Record<string, {
    label: string; tone: 'red' | 'orange' | 'amber'; icon: React.ReactNode; render: () => React.ReactNode;
  }> = {
    'unpaid': {
      label: '미수금', tone: 'red', icon: <CurrencyKrw size={20} weight="duotone" />,
      render: () => {
        const overdueDays = calcOverdueDays(c);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            <div>
              <strong style={{ fontSize: 20 }}>₩{formatCurrency(c.unpaidAmount ?? 0)}</strong>
              {c.unpaidSeqCount ? <span style={{ marginLeft: 8, fontSize: 12 }}>· 미납 {c.unpaidSeqCount}회차</span> : null}
            </div>
            {overdueDays != null && (
              <div>미수 기간 <strong>{overdueDays}일</strong></div>
            )}
            {c.lastPaidDate && (
              <div>최근 결제 <span className="mono">{c.lastPaidDate}</span>
                {c.lastPaidAmount ? <span> · ₩{formatCurrency(c.lastPaidAmount)}</span> : null}
              </div>
            )}
          </div>
        );
      },
    },
    'overdue-return': {
      label: '반납 지연', tone: 'orange', icon: <ArrowUUpLeft size={20} weight="duotone" />,
      render: () => {
        const overdueDays = c.returnScheduledDate
          ? Math.floor((Date.now() - new Date(c.returnScheduledDate).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        return (
          <div style={{ fontSize: 12 }}>
            반납 예정 <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{c.returnScheduledDate ?? '-'}</strong>
            {overdueDays != null && overdueDays > 0 && (
              <span style={{ marginLeft: 8 }}>· <strong>{overdueDays}일 경과</strong></span>
            )}
          </div>
        );
      },
    },
    'insurance-gap': {
      label: '보험 미커버', tone: 'red', icon: <ShieldWarning size={20} weight="duotone" />,
      render: () => (
        <div style={{ fontSize: 12 }}>
          보험연령 <strong>{c.insuranceAge ?? '-'}세</strong>
          {' / '}계약자 또는 주운전자가 보험연령에 못 미침
        </div>
      ),
    },
    'missing-ident': {
      label: '등록번호 결손', tone: 'amber', icon: <IdentificationCard size={20} weight="duotone" />,
      render: () => (
        <div style={{ fontSize: 12 }}>
          계약자 등록번호 미입력 — 신원/연령 검증 불가
        </div>
      ),
    },
  };
  const info = map[kind];
  if (!info) return null;
  const t = info.tone;
  return (
    <div style={{
      padding: 14, background: `var(--${t}-bg)`, color: `var(--${t}-text)`,
      border: `1px solid var(--${t}-border, ${t === 'red' ? 'rgba(220,38,38,0.3)' : t === 'orange' ? 'rgba(194,65,12,0.3)' : 'rgba(161,98,7,0.3)'})`,
      borderRadius: 'var(--radius-lg)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ flexShrink: 0 }}>{info.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>리스크 · {info.label}</div>
        {info.render()}
      </div>
    </div>
  );
}

/* ─────────────── 계약 흐름 timeline ─────────────── */

function LifecycleTimeline({ contract: c }: { contract: ReturnType<typeof useContracts>['contracts'][number] }) {
  const steps: { label: string; date?: string; done: boolean; current: boolean }[] = [
    { label: '계약',     date: c.contractDate,           done: !!c.contractDate,                                    current: !c.deliveredDate && !!c.contractDate },
    { label: '인도',     date: c.deliveredDate ?? c.deliveryScheduledDate, done: !!c.deliveredDate,                  current: !!c.deliveredDate && !c.returnedDate },
    { label: '반납 예정', date: c.returnScheduledDate,    done: !!c.returnedDate || (!!c.returnScheduledDate && new Date(c.returnScheduledDate) < new Date()), current: false },
    { label: '반납',     date: c.returnedDate,           done: !!c.returnedDate,                                    current: !!c.returnedDate && c.status !== '해지' },
  ];

  return (
    <div style={{
      padding: 14, background: 'var(--bg-card)',
      border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-sub)', marginBottom: 12 }}>
        계약 흐름 · 현재 <span style={{ color: 'var(--brand)' }}>{c.vehicleStatus}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: s.done ? 'var(--green-text)' : s.current ? 'var(--brand)' : 'var(--bg-sunken)',
              color: s.done || s.current ? '#fff' : 'var(--text-weak)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: s.current ? '2px solid var(--brand)' : '1px solid var(--border)',
              boxShadow: s.current ? '0 0 0 3px var(--focus-ring)' : 'none',
            }}>
              {s.done ? <CheckCircle size={16} weight="fill" /> : <Circle size={10} weight="fill" />}
            </div>
            <div style={{ fontSize: 10.5, fontWeight: s.current ? 700 : 600, color: s.done || s.current ? 'var(--text-main)' : 'var(--text-sub)' }}>{s.label}</div>
            <div style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'var(--text-weak)', textAlign: 'center' }}>
              {s.date ? s.date.slice(5) : '-'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'red' }) {
  const tones = {
    neutral: { bg: 'var(--bg-card)',     fg: 'var(--text-sub)', bd: 'var(--border)' },
    red:     { bg: 'var(--red-bg)',      fg: 'var(--red-text)', bd: 'var(--red-border)' },
  } as const;
  const c = tones[tone];
  return (
    <span style={{
      fontSize: 11, padding: '3px 8px',
      background: c.bg, color: c.fg, border: `1px solid ${c.bd}`,
      borderRadius: 'var(--radius)', fontWeight: 600,
    }}>{children}</span>
  );
}

function ActionBtn({ icon, label, onClick, href, disabled }: { icon: React.ReactNode; label: string; onClick?: () => void; href?: string; disabled?: boolean }) {
  const baseStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
    padding: '12px 6px', minHeight: 64,
    background: disabled ? 'var(--bg-sunken)' : 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    color: disabled ? 'var(--text-weak)' : 'var(--brand)',
    fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    touchAction: 'manipulation', textDecoration: 'none',
  };
  if (href && !disabled) return <a href={href} style={baseStyle}>{icon}<span>{label}</span></a>;
  return (
    <button type="button" disabled={disabled} onClick={onClick} style={baseStyle}>
      {icon}<span>{label}</span>
    </button>
  );
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-soft)',
      borderRadius: 'var(--radius-lg)', overflow: 'hidden',
    }}>
      <header style={{
        padding: '8px 14px', background: 'var(--bg-sunken)',
        borderBottom: '1px solid var(--border-soft)',
        fontSize: 11, fontWeight: 700, color: 'var(--text-sub)',
      }}>{title}</header>
      <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
    </section>
  );
}

function Row({ label, value, mono, danger }: { label: string; value: string; mono?: boolean; danger?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, fontSize: 13 }}>
      <span style={{ color: 'var(--text-sub)', fontSize: 11 }}>{label}</span>
      <span style={{
        textAlign: 'right',
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        color: danger ? 'var(--red-text)' : 'var(--text-main)',
        fontWeight: danger ? 700 : 500,
      }}>{value}</span>
    </div>
  );
}
