'use client';

/**
 * 모바일 계약 상세 — 핵심 정보 + 액션.
 *
 * Phase 1 (이번 라운드): 기본 hero + 정보 카드 + 액션 4종 placeholder
 * Phase 2: 통화이력·사진 갤러리·메모 인라인 입력
 */

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useFieldLogs, FIELD_LOG_LABEL, FIELD_LOG_TONE } from '@/lib/firebase/field-logs-store';
import { CaretLeft, Phone, Camera, NotePencil, ChatCircle } from '@phosphor-icons/react';
import { formatCurrency } from '@/lib/utils';

export default function MobileContractDetail() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';
  const { contracts } = useContracts();
  const c = contracts.find((x) => x.id === id);
  const logs = useFieldLogs(c?.id);

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
            <Chip>{c.status}</Chip>
            {c.unpaidAmount > 0 && <Chip tone="red">미수 ₩{formatCurrency(c.unpaidAmount)}</Chip>}
          </div>
        </header>

        {/* 액션 4종 — Hero 와 함께 고정 */}
        <div style={{
          padding: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)',
        }}>
        <ActionBtn icon={<Camera size={22} weight="duotone" />} label="사진" href={`/m/upload?contractId=${c.id}`} />
        <ActionBtn icon={<NotePencil size={22} weight="duotone" />} label="메모" href={`/m/entry/memo?contractId=${c.id}`} />
        {c.customerPhone1 ? (
          <ActionBtn icon={<Phone size={22} weight="duotone" />} label="전화" href={`tel:${c.customerPhone1}`} />
        ) : (
          <ActionBtn icon={<Phone size={22} weight="duotone" />} label="전화" disabled />
        )}
        {c.customerPhone1 ? (
          <ActionBtn icon={<ChatCircle size={22} weight="duotone" />} label="문자" href={`sms:${c.customerPhone1}`} />
        ) : (
          <ActionBtn icon={<ChatCircle size={22} weight="duotone" />} label="문자" disabled />
        )}
        </div>
      </div>

      {/* 정보 카드들 */}
      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
          <Row label="미수금" value={c.unpaidAmount > 0 ? `₩${formatCurrency(c.unpaidAmount)}` : '없음'} mono danger={c.unpaidAmount > 0} />
        </InfoSection>

        {c.notes && (
          <InfoSection title="비고">
            <div style={{ fontSize: 13, color: 'var(--text-main)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {c.notes}
            </div>
          </InfoSection>
        )}

        {logs.length > 0 && (
          <InfoSection title={`현장 입력 (${logs.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {logs.map((l) => {
                const tone = FIELD_LOG_TONE[l.type];
                return (
                  <div key={l.id} style={{
                    padding: '8px 10px', background: 'var(--bg-sunken)',
                    borderRadius: 'var(--radius-md)',
                    borderLeft: `3px solid var(--${tone === 'brand' ? 'brand' : tone + '-text'})`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: `var(--${tone === 'brand' ? 'brand' : tone + '-text'})` }}>
                        {FIELD_LOG_LABEL[l.type]}
                      </span>
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
