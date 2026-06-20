'use client';

/**
 * 계약 detail dialog 의 수납 탭 — PaymentTab + DepositSection + PaymentHistoryTable + ScheduleTable.
 *
 * 원래 components/contract-detail-dialog.tsx 안에 인라인이었으나 4075줄 거대화 → 분리 (2026-06-19).
 * 동일 export PaymentTab 으로 외부 임포트 호환.
 */

import { useState, useMemo, Fragment } from 'react';
import { CaretRight, CheckCircle, CurrencyKrw, Plus, Printer, Trash, X } from '@phosphor-icons/react';
import { Section } from '@/components/ui/detail-primitives';
import { Field as SharedField } from '@/components/ui/editable-field';
import { ReceiptPrintDialog } from '@/components/receipt-print-dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { DateInput } from '@/components/ui/date-input';
import { scheduleStatusTone } from '@/lib/status-tones';
import { COL } from '@/lib/table-cols';
import { formatCurrency, formatDateFull } from '@/lib/utils';
import { useBusyAction } from '@/lib/use-busy-action';
import { useClosedPeriods, isDateInClosedPeriod } from '@/lib/firebase/closed-periods-store';
import { todayKr } from '@/lib/mock-data';
import { recalcSchedule } from '@/lib/payment-schedule';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';
import type {
  Contract, PaymentScheduleInline, PaymentEntry, ScheduleStatus, DepositDeduction,
} from '@/lib/types';

const Field = SharedField;

export function PaymentTab({ c, onUpdate }: { c: Contract; onUpdate: (u: Contract) => void }) {
  const totalDiscount = (c.schedules ?? []).reduce(
    (sum, s) => sum + ((s.discounts ?? []).reduce((d, x) => d + x.amount, 0)),
    0,
  );
  const totalPaid = (c.schedules ?? []).reduce(
    (sum, s) => sum + ((s.payments ?? []).reduce((p, x) => p + x.amount, 0)),
    0,
  );
  return (
    <div className="detail-stack">
      <Section
        icon={<CurrencyKrw size={12} weight="duotone" />}
        title={`수납 현황 — ${c.currentSeq}/${c.totalSeq}회 · 월 ₩${formatCurrency(c.monthlyRent)}`}
      >
        <div className="detail-grid-2" style={{ marginTop: 4 }}>
          <div>
            <Field label="현재 회차" value={`${c.currentSeq} / ${c.totalSeq}`} mono />
            <Field label="누적 청구할인" value={
              totalDiscount > 0
                ? <span style={{ color: 'var(--red-text)' }}>-₩{formatCurrency(totalDiscount)}</span>
                : <span className="muted">없음</span>
            } mono />
            <Field label="누적 납부액" value={totalPaid > 0 ? `₩${formatCurrency(totalPaid)}` : <span className="muted">-</span>} mono />
            <Field label="최근 결제일" value={formatDateFull(c.lastPaidDate) || <span className="muted">-</span>} mono />
          </div>
          <div>
            <Field
              label="미수금"
              value={
                c.unpaidAmount > 0
                  ? <span style={{ color: 'var(--red-text)', fontWeight: 600 }}>₩{formatCurrency(c.unpaidAmount)}</span>
                  : <span className="muted">없음</span>
              }
              mono
            />
            <Field label="미납 회차" value={c.unpaidSeqCount > 0 ? `${c.unpaidSeqCount}회` : <span className="muted">없음</span>} mono />
            <Field label="결제방법" value={c.paymentMethod} />
          </div>
        </div>
      </Section>

      <DepositSection c={c} onUpdate={onUpdate} />

      <Section icon={<CurrencyKrw size={12} weight="duotone" />} title="회차별 스케줄" bodyPadding={0}>
        <ScheduleTable c={c} onUpdate={onUpdate} />
      </Section>

      {(() => {
        const logs = generatePaymentHistory(c);
        const total = logs.reduce((s, l) => s + l.amount, 0);
        const realIncoming = logs.filter((l) => l.source !== '정산').reduce((s, l) => s + l.amount, 0);
        return (
          <Section
            icon={<CurrencyKrw size={12} weight="duotone" />}
            title={`입금 이력 — ${logs.length}건`}
            bodyPadding={0}
            action={logs.length > 0 ? (
              <span style={{ fontSize: 11, color: 'var(--text-sub)', display: 'flex', gap: 10, marginLeft: 'auto' }}>
                <span>누적 <span className="mono" style={{ color: 'var(--text-main)', fontWeight: 600 }}>₩{formatCurrency(total)}</span></span>
                <span>실 입금 <span className="mono" style={{ color: 'var(--green-text)', fontWeight: 600 }}>₩{formatCurrency(realIncoming)}</span></span>
              </span>
            ) : undefined}
          >
            <PaymentHistoryTable c={c} onUpdate={onUpdate} />
          </Section>
        );
      })()}
    </div>
  );
}

/* ─────────────── 보증금 관리 섹션 ─────────────── */
function DepositSection({ c, onUpdate }: { c: Contract; onUpdate: (u: Contract) => void }) {
  const due = c.deposit ?? 0;
  const received = c.depositReceived ?? 0;
  const refunded = c.depositRefunded ?? 0;
  const deductions = c.depositDeductions ?? [];
  const deductSum = deductions.reduce((s, d) => s + (d.amount ?? 0), 0);
  // 미수령 보증금 = 청구 - 받음
  const unreceived = Math.max(0, due - received);
  // 환불 예정액 = 받은 금액 - 차감 - 이미 환불
  const refundable = Math.max(0, received - deductSum - refunded);

  function patchNum(field: 'depositReceived' | 'depositRefunded', raw: string) {
    const n = Number(raw.replace(/[,\s]/g, '')) || 0;
    onUpdate({ ...c, [field]: n });
  }
  function patchDate(field: 'depositReceivedDate' | 'depositRefundedDate', d: string) {
    onUpdate({ ...c, [field]: d || undefined });
  }
  function addDeduction() {
    const reason = window.prompt('차감 사유 (예: 미납 회차, 차량 손상, 클리닝):');
    if (!reason) return;
    const amountStr = window.prompt('차감 금액 (원):');
    if (!amountStr) return;
    const amount = Number(amountStr.replace(/[,\s]/g, '')) || 0;
    if (amount <= 0) return;
    const next: DepositDeduction = {
      id: `dd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: new Date().toISOString().slice(0, 10),
      amount, reason,
    };
    onUpdate({ ...c, depositDeductions: [...deductions, next] });
  }
  async function removeDeduction(id: string) {
    if (!await showConfirm({ title: '차감 내역을 삭제하시겠습니까?', danger: true })) return;
    onUpdate({ ...c, depositDeductions: deductions.filter((d) => d.id !== id) });
  }

  return (
    <Section
      icon={<CurrencyKrw size={12} weight="duotone" />}
      title={`보증금 — 청구 ₩${formatCurrency(due)} · 받음 ₩${formatCurrency(received)} · 환불 ₩${formatCurrency(refunded)}`}
    >
      <div className="detail-grid-2" style={{ marginTop: 4 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '4px 0', fontSize: 12 }}>
            <span style={{ minWidth: 90, color: 'var(--text-sub)' }}>받은 금액</span>
            <input
              type="text"
              className="input-bare mono"
              defaultValue={received ? received.toLocaleString() : ''}
              placeholder="0"
              onBlur={(e) => patchNum('depositReceived', e.target.value)}
              style={{ flex: 1, textAlign: 'right' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '4px 0', fontSize: 12 }}>
            <span style={{ minWidth: 90, color: 'var(--text-sub)' }}>입금일</span>
            <input
              type="date"
              className="input-bare mono"
              defaultValue={c.depositReceivedDate ?? ''}
              onChange={(e) => patchDate('depositReceivedDate', e.target.value)}
              style={{ flex: 1 }}
            />
          </div>
          <Field label="미수령" value={
            unreceived > 0
              ? <span style={{ color: 'var(--red-text)' }}>₩{formatCurrency(unreceived)}</span>
              : received >= due && due > 0
                ? <StatusBadge tone="green">완납</StatusBadge>
                : <span className="muted">-</span>
          } mono />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '4px 0', fontSize: 12 }}>
            <span style={{ minWidth: 90, color: 'var(--text-sub)' }}>환불 금액</span>
            <input
              type="text"
              className="input-bare mono"
              defaultValue={refunded ? refunded.toLocaleString() : ''}
              placeholder="0"
              onBlur={(e) => patchNum('depositRefunded', e.target.value)}
              style={{ flex: 1, textAlign: 'right' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '4px 0', fontSize: 12 }}>
            <span style={{ minWidth: 90, color: 'var(--text-sub)' }}>환불일</span>
            <input
              type="date"
              className="input-bare mono"
              defaultValue={c.depositRefundedDate ?? ''}
              onChange={(e) => patchDate('depositRefundedDate', e.target.value)}
              style={{ flex: 1 }}
            />
          </div>
          <Field label="환불 예정" value={
            refundable > 0
              ? <span style={{ color: 'var(--brand)' }}>₩{formatCurrency(refundable)}</span>
              : refunded > 0
                ? <span className="muted">정산 완료</span>
                : <span className="muted">-</span>
          } mono />
        </div>
      </div>

      <div style={{
        marginTop: 8, padding: '8px 10px',
        background: 'var(--bg-soft)', borderRadius: 'var(--radius-md)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600 }}>
            차감 내역 {deductions.length > 0 && <span className="dim" style={{ marginLeft: 4 }}>합 ₩{formatCurrency(deductSum)}</span>}
          </span>
          <button type="button" className="btn btn-sm" onClick={addDeduction}>+ 차감 추가</button>
        </div>
        {deductions.length === 0 ? (
          <div className="dim" style={{ fontSize: 11 }}>없음</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {deductions.map((d) => (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'baseline', gap: 8,
                fontSize: 11, padding: '4px 6px',
                background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
              }}>
                <span className="mono dim" style={{ width: 90 }}>{d.date}</span>
                <span style={{ flex: 1 }}>{d.reason}</span>
                <span className="mono" style={{ color: 'var(--red-text)' }}>-₩{formatCurrency(d.amount)}</span>
                <button type="button" className="btn-icon" onClick={() => removeDeduction(d.id)} title="삭제">
                  <Trash size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}

/** 입금 이력 (회차별 payments 배열 flatten) — 시간순 정렬 */
type PaymentLog = {
  date: string;
  seq: number;
  amount: number;
  source: PaymentEntry['source'];
  memo?: string;
  by?: string;
  /** schedule.payments[] 안 인덱스 — 삭제 시 원본 entry 식별. legacy/정산 환원은 undefined. */
  entryIdx?: number;
};

function generatePaymentHistory(c: Contract): PaymentLog[] {
  const logs: PaymentLog[] = [];

  if (c.schedules && c.schedules.length > 0) {
    for (const s of c.schedules) {
      const pays = s.payments ?? [];
      // legacy: payments 없는 회차의 paidAmount → 정산 entry 1건으로 환원
      if (pays.length === 0 && s.paidAmount > 0) {
        logs.push({
          date: s.paidAt ?? s.dueDate, seq: s.seq, amount: s.paidAmount, source: '정산',
          memo: '스냅샷 자동 정리',
        });
        continue;
      }
      pays.forEach((p, idx) => {
        logs.push({ date: p.date, seq: s.seq, amount: p.amount, source: p.source, memo: p.memo, by: p.by, entryIdx: idx });
      });
    }
    return logs.sort((a, b) => b.date.localeCompare(a.date) || a.seq - b.seq);
  }

  // Legacy fallback — schedules 자체가 없을 때
  for (let seq = 1; seq < c.currentSeq; seq++) {
    logs.push({
      date: addMonths(c.contractDate, seq - 1, c.paymentDay),
      seq, amount: c.monthlyRent, source: '정산', memo: 'legacy',
    });
  }
  return logs.sort((a, b) => b.date.localeCompare(a.date));
}

function PaymentHistoryTable({ c, onUpdate }: { c: Contract; onUpdate: (u: Contract) => void }) {
  const logs = generatePaymentHistory(c);
  const today = todayKr();
  const [receiptFor, setReceiptFor] = useState<{ amount: number; date: string; period: string } | null>(null);

  async function handleRemove(seq: number, entryIdx: number) {
    if (!await showConfirm({ title: '이 입금 기록을 삭제하시겠습니까?', danger: true })) return;
    const nextSchedules = (c.schedules ?? []).map((s) => {
      if (s.seq !== seq) return s;
      const payments = [...(s.payments ?? [])];
      payments.splice(entryIdx, 1);
      return recalcSchedule({ ...s, payments }, today);
    });
    onUpdate({ ...c, schedules: nextSchedules });
  }
  if (logs.length === 0) {
    return (
      <div style={{ padding: 32, color: 'var(--text-weak)', textAlign: 'center', fontSize: 12 }}>
        아직 입금 이력이 없습니다.
      </div>
    );
  }
  return (
    <>
    <table className="table">
        <thead>
          <tr>
            <th style={{ width: COL.date }}>입금일</th>
            <th className="center" style={{ width: COL.cycle }}>회차</th>
            <th className="num" style={{ width: COL.money }}>금액</th>
            <th className="center" style={{ width: COL.paymentMethod }}>출처</th>
            <th>메모</th>
            <th className="dim" style={{ width: 140 }}>등록자</th>
            <th className="center" style={{ width: 70 }}>영수증</th>
            <th className="center" style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l, i) => {
            // 수기 entry(수동/현금) + entryIdx 있으면 직접 삭제 가능.
            // 자동 매칭(계좌/카드)·정산은 해당 거래·스냅샷 측에서만 제거.
            const canRemove = l.entryIdx != null && (l.source === '수동' || l.source === '현금');
            return (
              <tr key={i}>
                <td className="mono">{formatDateFull(l.date)}</td>
                <td className="center mono">{l.seq}</td>
                <td className="num mono">₩{formatCurrency(l.amount)}</td>
                <td className="center">
                  <span className="chip" style={{
                    height: 16, padding: '0 6px', fontSize: 10,
                    background: l.source === '정산' ? 'var(--bg-sunken)'
                      : l.source === '계좌' ? 'var(--blue-bg)'
                      : l.source === '카드' ? 'var(--purple-bg)'
                      : 'var(--green-bg)',
                    color: l.source === '정산' ? 'var(--text-weak)'
                      : l.source === '계좌' ? 'var(--blue-text)'
                      : l.source === '카드' ? 'var(--purple-text)'
                      : 'var(--green-text)',
                  }}>{l.source}</span>
                </td>
                <td className="dim">{l.memo || '-'}</td>
                <td className="mono dim">{l.by ?? (l.source === '정산' ? '(자동)' : '-')}</td>
                <td className="center">
                  <button
                    className="btn btn-sm btn-ghost btn-icon"
                    type="button"
                    title="영수증 발행"
                    onClick={() => setReceiptFor({
                      amount: l.amount,
                      date: l.date,
                      period: `${l.seq}회차`,
                    })}
                  >
                    <Printer size={11} />
                  </button>
                </td>
                <td className="center">
                  {canRemove && (
                    <button className="btn btn-sm btn-ghost btn-icon" type="button"
                      onClick={() => handleRemove(l.seq, l.entryIdx!)} title="삭제">
                      <X size={10} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ReceiptPrintDialog
        open={!!receiptFor}
        onOpenChange={(o) => { if (!o) setReceiptFor(null); }}
        contract={c}
        amount={receiptFor?.amount ?? 0}
        paymentDate={receiptFor?.date ?? today}
        purpose="대여료"
        period={receiptFor?.period}
      />
    </>
  );
}

type AddMode = 'payment' | 'discount';
type DiscountReason = '자가조치' | '보상' | '사은품' | '캠페인' | '반납 일할' | '기타';

function ScheduleTable({ c, onUpdate }: { c: Contract; onUpdate: (u: Contract) => void }) {
  // 멱등성 SSOT — 결제 처리 더블탭 차단 (ERP #16)
  const [busy, runMutation] = useBusyAction();
  // 회계기간 마감 (ERP #18) — 마감된 월 입금 등록 차단
  const { closedPeriods } = useClosedPeriods();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [addOpenSeq, setAddOpenSeq] = useState<number | null>(null);
  const [addMode, setAddMode] = useState<AddMode>('payment');
  const [addDate, setAddDate] = useState(todayKr());
  const [addAmount, setAddAmount] = useState('');
  const [addMemo, setAddMemo] = useState('');
  const [addSource, setAddSource] = useState<PaymentEntry['source']>('수동');
  const [addReason, setAddReason] = useState<DiscountReason>('자가조치');
  // 직전 "한 줄 더" 저장 직전 스냅샷 — 폼에서 즉시 되돌리기 가능
  const [lastSnapshot, setLastSnapshot] = useState<{ schedules: PaymentScheduleInline[]; amount: number } | null>(null);

  // legacy 회차 (payments 없음, paidAmount만 있음) → migrate-on-read
  const schedulesNorm: PaymentScheduleInline[] = (c.schedules && c.schedules.length > 0)
    ? c.schedules.map((s) => {
        if (s.payments && s.payments.length > 0) return s;
        if (s.paidAmount > 0) {
          return { ...s, payments: [{ date: s.paidAt ?? s.dueDate, amount: s.paidAmount, source: '정산', memo: '스냅샷 자동 정리' }] };
        }
        return { ...s, payments: [] };
      })
    : Array.from({ length: c.totalSeq }, (_, i) => {
        const seq = i + 1;
        const isPaid = seq < c.currentSeq;
        const dueDate = addMonths(c.contractDate, i, c.paymentDay);
        return {
          seq, dueDate, amount: c.monthlyRent,
          status: (isPaid ? '완료' : '예정') as ScheduleStatus,
          paidAmount: isPaid ? c.monthlyRent : 0,
          payments: isPaid ? [{ date: dueDate, amount: c.monthlyRent, source: '정산' as const, memo: 'legacy' }] : [],
        };
      });

  function persist(sched: PaymentScheduleInline[]) {
    // 미수 = 실청구(amount - discount) - 납부합
    const totalUnpaidNow = sched.reduce((sum, s) => {
      const disc = (s.discounts ?? []).reduce((d, x) => d + x.amount, 0);
      const effective = Math.max(0, s.amount - disc);
      if (s.status === '연체') return sum + effective;
      if (s.status === '부분납') return sum + Math.max(0, effective - s.paidAmount);
      return sum;
    }, 0);
    const unpaidSeqCount = sched.filter((s) => s.status === '연체' || s.status === '부분납').length;
    const overdue = sched.filter((s) => s.status === '연체' || s.status === '부분납').sort((a, b) => a.seq - b.seq);
    const currentSeq = overdue[0]?.seq
      ?? sched.find((s) => s.status === '예정')?.seq
      ?? sched.length;
    const last = sched.flatMap((s) => s.payments ?? []).sort((a, b) => b.date.localeCompare(a.date))[0];
    onUpdate({
      ...c,
      schedules: sched,
      unpaidAmount: totalUnpaidNow,
      unpaidSeqCount,
      currentSeq,
      lastPaidDate: last?.date,
      lastPaidAmount: last?.amount,
    });
  }

  function recalcRow(s: PaymentScheduleInline, today: string): PaymentScheduleInline {
    if (s.status === '면제') {
      const paid = (s.payments ?? []).reduce((sum, p) => sum + p.amount, 0);
      const disc = (s.discounts ?? []).reduce((sum, d) => sum + d.amount, 0);
      return { ...s, paidAmount: paid, discountAmount: disc };
    }
    const paid = (s.payments ?? []).reduce((sum, p) => sum + p.amount, 0);
    const disc = (s.discounts ?? []).reduce((sum, d) => sum + d.amount, 0);
    const effective = Math.max(0, s.amount - disc);
    const lastDate = (s.payments ?? []).reduce<string>((mx, p) => p.date > mx ? p.date : mx, '');
    let status: ScheduleStatus;
    if (effective === 0 && disc > 0) status = '완료';
    else if (paid >= effective) status = '완료';
    else if (paid > 0 || disc > 0) status = '부분납';
    else status = s.dueDate < today ? '연체' : '예정';
    return { ...s, paidAmount: paid, discountAmount: disc, paidAt: lastDate || undefined, status };
  }

  function toggleExpand(seq: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq); else next.add(seq);
      return next;
    });
  }

  function startAdd(seq: number, mode: AddMode) {
    const s = schedulesNorm.find((x) => x.seq === seq);
    if (!s) return;
    const existingDisc = (s.discounts ?? []).reduce((sum, d) => sum + d.amount, 0);
    const effective = Math.max(0, s.amount - existingDisc);
    const owed = Math.max(0, effective - s.paidAmount);
    setAddOpenSeq(seq);
    setAddMode(mode);
    setAddDate(todayKr());
    setAddAmount(String(mode === 'payment' ? owed : Math.max(0, effective)));
    setAddMemo('');
    setAddReason('자가조치');
    setExpanded((prev) => new Set([...prev, seq]));
  }

  function commitAdd(keepOpen = false) {
    if (addOpenSeq == null) return;
    if (busy) return; // 멱등성 — 진행 중 중복 호출 무시
    const amt = parseInt(addAmount.replace(/[^0-9]/g, ''), 10);
    if (!amt || amt <= 0) { toast.error('금액을 입력하세요'); return; }
    // 회계기간 마감 (ERP #18) — 입금일이 마감된 월에 속하면 차단
    const targetDate = addDate || todayKr();
    if (isDateInClosedPeriod(closedPeriods, targetDate)) {
      const yyyymm = targetDate.slice(0, 7);
      toast.error(`회계기간 마감 — ${yyyymm}월 거래 등록 불가. 정정은 신규 회차로 처리하세요.`);
      return;
    }
    void runMutation(async () => { commitAddInner(keepOpen, amt); });
  }

  function commitAddInner(keepOpen: boolean, amt: number) {
    const today = todayKr();
    const currentSeq = addOpenSeq;
    // 직전 스냅샷 저장 — keepOpen 시 "직전 저장 취소" 액션으로 복원 가능
    const snapshotBefore = schedulesNorm.map((s) => ({ ...s, payments: [...(s.payments ?? [])], discounts: [...(s.discounts ?? [])] }));

    if (addMode === 'discount') {
      // 할인 — 해당 회차에만 적용 (다음 회차로 흘리지 않음)
      const next = schedulesNorm.map((s) => {
        if (s.seq !== addOpenSeq) return { ...s };
        const existing = (s.discounts ?? []).reduce((sum, d) => sum + d.amount, 0);
        const cap = Math.max(0, s.amount - existing);
        const applied = Math.min(amt, cap);
        if (applied <= 0) return { ...s };
        const list = [...(s.discounts ?? []), {
          date: addDate || today,
          amount: applied,
          reason: addReason,
          memo: addMemo || undefined,
          at: new Date().toISOString(),
        }];
        return recalcRow({ ...s, discounts: list }, today);
      });
      persist(next);
    } else {
      // 입금 — 선납 자동 분배 (해당 회차부터 시작해서 초과분은 다음 회차로)
      let remaining = amt;
      const next = schedulesNorm.map((s) => ({ ...s, payments: [...(s.payments ?? [])] }));
      const startIdx = next.findIndex((s) => s.seq === addOpenSeq);
      for (let i = startIdx; i < next.length && remaining > 0; i++) {
        const s = next[i];
        if (s.status === '면제') continue;
        const discSum = (s.discounts ?? []).reduce((sum, d) => sum + d.amount, 0);
        const effective = Math.max(0, s.amount - discSum);
        const paidSum = s.payments.reduce((sum, p) => sum + p.amount, 0);
        const owed = Math.max(0, effective - paidSum);
        if (owed <= 0) continue;
        const apply = Math.min(owed, remaining);
        s.payments.push({
          date: addDate || today,
          amount: apply,
          source: addSource,
          memo: i > startIdx ? `${addMemo || '선납'} (선납 from ${addOpenSeq}회차)` : (addMemo || undefined),
          at: new Date().toISOString(),
        });
        const next2 = recalcRow(s, today);
        Object.assign(s, next2);
        remaining -= apply;
      }
      persist(next);
    }

    if (keepOpen) {
      // "저장하고 한 줄 더" — 같은 회차에 추가 입력 (분할 입금 수기 흐름)
      setAddOpenSeq(currentSeq);
      setAddAmount('');
      setAddMemo('');
      setLastSnapshot({ schedules: snapshotBefore, amount: amt });
      toast.success(`₩${amt.toLocaleString()} 저장됨 — 한 줄 더`);
    } else {
      setAddOpenSeq(null);
      setAddAmount('');
      setAddMemo('');
      setLastSnapshot(null);
    }
  }

  function undoLastSaved() {
    if (!lastSnapshot) return;
    persist(lastSnapshot.schedules);
    toast.info(`₩${lastSnapshot.amount.toLocaleString()} 저장 취소됨`);
    setLastSnapshot(null);
  }

  async function removePayment(seq: number, idx: number) {
    if (!await showConfirm({ title: `이 입금 기록을 삭제하시겠습니까?`, danger: true })) return;
    const today = todayKr();
    const next = schedulesNorm.map((s) => {
      if (s.seq !== seq) return { ...s };
      const payments = [...(s.payments ?? [])];
      payments.splice(idx, 1);
      return recalcRow({ ...s, payments }, today);
    });
    persist(next);
  }

  async function removeDiscount(seq: number, idx: number) {
    if (!await showConfirm({ title: `이 할인 기록을 삭제하시겠습니까?`, danger: true })) return;
    const today = todayKr();
    const next = schedulesNorm.map((s) => {
      if (s.seq !== seq) return { ...s };
      const discounts = [...(s.discounts ?? [])];
      discounts.splice(idx, 1);
      return recalcRow({ ...s, discounts }, today);
    });
    persist(next);
  }

  async function handleExempt(seq: number) {
    if (!await showConfirm({ title: `${seq}회차를 '면제'로 처리하시겠습니까?\n(미수에서 제외됨)`, danger: true })) return;
    const next = schedulesNorm.map((s) => s.seq === seq ? { ...s, status: '면제' as ScheduleStatus, paidAmount: s.amount } : { ...s });
    persist(next);
  }

  async function handleRevert(seq: number) {
    if (!await showConfirm({ title: `${seq}회차의 모든 입금·할인·면제 처리를 취소하시겠습니까?`, danger: true })) return;
    const today = todayKr();
    const next = schedulesNorm.map((s) => {
      if (s.seq !== seq) return { ...s };
      return { ...s, payments: [], discounts: [], paidAmount: 0, discountAmount: 0, paidAt: undefined, status: (s.dueDate < today ? '연체' : '예정') as ScheduleStatus };
    });
    persist(next);
  }

  // 미수 우선 — 없으면 다음 예정 회차에 자동 입금 폼 열기
  const nextOpenSeq = useMemo(() => {
    const overdue = schedulesNorm.find((s) => s.status === '연체' || s.status === '부분납');
    if (overdue) return overdue.seq;
    const pending = schedulesNorm.find((s) => s.status === '예정');
    return pending?.seq;
  }, [schedulesNorm]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 상단 [회차 추가 (수동)] [수납 추가] 버튼 폐기 — 각 행 [+입금][+할인][면제] 로 직접 처리.
          가변 회차 수동 추가는 거의 안 쓰는 흐름이라 함께 제거 (필요 시 추후 별도 메뉴로). */}
    <table className="table">
      <thead>
        <tr>
          <th className="center" style={{ width: 36 }}></th>
          <th className="center" style={{ width: COL.cycle }}>회차</th>
          <th style={{ width: COL.date }}>예정일</th>
          <th className="num" style={{ width: COL.money }}>청구금액</th>
          <th className="num" style={{ width: COL.money, color: 'var(--red-text)' }}>청구할인</th>
          <th className="num" style={{ width: COL.money }}>납부금액</th>
          <th className="num" style={{ width: COL.money }}>잔액</th>
          <th style={{ width: COL.date }}>최종입금일</th>
          <th className="center" style={{ width: COL.status }}>상태</th>
          <th className="center" style={{ width: 200 }}>액션</th>
        </tr>
      </thead>
      <tbody>
        {schedulesNorm.map((r) => {
          const isExpanded = expanded.has(r.seq);
          const pays = r.payments ?? [];
          const discs = r.discounts ?? [];
          const discSum = discs.reduce((sum, d) => sum + d.amount, 0);
          const effective = Math.max(0, r.amount - discSum);
          const bal = Math.max(0, effective - r.paidAmount);
          const hasEntries = pays.length > 0 || discs.length > 0;
          const owed = r.status === '면제' ? 0 : bal;
          return (
            <Fragment key={r.seq}>
              <tr style={{ cursor: hasEntries ? 'pointer' : undefined }} onClick={() => hasEntries && toggleExpand(r.seq)}>
                <td className="center">
                  {hasEntries ? (
                    <CaretRight size={10} weight="bold" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: 'var(--text-weak)' }} />
                  ) : null}
                </td>
                <td className="center mono">{r.seq}</td>
                <td className="mono">{formatDateFull(r.dueDate)}</td>
                {/* 청구금액 — 할인 적용 시 원본 취소선 + 차감액 강조 (수기 할인 흐름 가시화) */}
                <td className="num mono">
                  {discSum > 0 ? (
                    <span title={`원 ₩${formatCurrency(r.amount)} - 할인 ₩${formatCurrency(discSum)}`}
                      style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, justifyContent: 'flex-end' }}>
                      <span style={{ textDecoration: 'line-through', color: 'var(--text-weak)', fontSize: 10.5 }}>
                        {formatCurrency(r.amount)}
                      </span>
                      <strong style={{ color: 'var(--orange-text)' }}>{formatCurrency(effective)}</strong>
                    </span>
                  ) : (
                    formatCurrency(r.amount)
                  )}
                </td>
                <td className="num mono" style={{ color: discSum > 0 ? 'var(--red-text)' : 'var(--text-weak)' }}>
                  {discSum > 0 ? `-${formatCurrency(discSum)}` : '-'}
                </td>
                <td className="num mono">{formatCurrency(r.paidAmount)}</td>
                <td className={`num mono ${owed > 0 ? 'danger' : ''}`}>
                  {formatCurrency(bal)}
                </td>
                <td className="mono dim">{r.paidAt ? formatDateFull(r.paidAt) : '-'}</td>
                <td className="center"><StatusBadge tone={scheduleStatusTone(r.status)}>{r.status}</StatusBadge></td>
                <td className="center" onClick={(e) => e.stopPropagation()}>
                  {r.status !== '면제' && owed > 0 ? (
                    <span style={{ display: 'inline-flex', gap: 4 }}>
                      <button className="btn btn-sm btn-primary" type="button" onClick={() => startAdd(r.seq, 'payment')} title="분할/일부 입금 기록">
                        <Plus size={10} weight="bold" /> 입금
                      </button>
                      <button className="btn btn-sm" type="button" onClick={() => startAdd(r.seq, 'discount')} title="청구할인 (자가조치 등)" style={{ color: 'var(--red-text)' }}>
                        <Plus size={10} weight="bold" /> 할인
                      </button>
                      <button className="btn btn-sm" type="button" onClick={() => handleExempt(r.seq)} title="면제 (미수 제외)">면제</button>
                    </span>
                  ) : (r.status === '완료' || r.status === '면제') ? (
                    <span style={{ display: 'inline-flex', gap: 4 }}>
                      {/* 선납 — dueDate 미래 + 완료 + 잔액 0 일 때만. 지난 회차는 이미 결제 완료라 선납 의미 없음. */}
                      {r.status === '완료' && owed === 0 && r.dueDate > todayKr() && (
                        <button className="btn btn-sm" type="button" onClick={() => startAdd(r.seq, 'payment')} title="선납 추가">
                          <Plus size={10} weight="bold" /> 선납
                        </button>
                      )}
                      <button className="btn btn-sm btn-ghost" type="button" onClick={() => handleRevert(r.seq)} title="모든 입금·할인·면제 취소">되돌리기</button>
                    </span>
                  ) : null}
                </td>
              </tr>

              {/* 입금/할인 추가 입력 행 */}
              {addOpenSeq === r.seq && (
                <tr>
                  <td colSpan={10} style={{ background: addMode === 'discount' ? 'var(--red-bg)' : 'var(--bg-sunken)', padding: 10 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: addMode === 'discount' ? 'var(--red-text)' : 'var(--text-sub)' }}>
                        {addMode === 'discount' ? '청구할인 추가' : '입금 추가'}
                      </span>

                      {/* 회차 — 다른 회차로 변경 가능 */}
                      {addMode === 'payment' && (
                        <>
                          <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>회차</span>
                          <select
                            className="input"
                            value={addOpenSeq ?? r.seq}
                            onChange={(e) => setAddOpenSeq(Number(e.target.value))}
                            style={{ width: 100 }}
                          >
                            {schedulesNorm.filter((s) => s.status !== '면제').map((s) => (
                              <option key={s.seq} value={s.seq}>
                                {s.seq}회 ({s.status})
                              </option>
                            ))}
                          </select>
                        </>
                      )}

                      <span style={{ fontSize: 11, color: 'var(--text-sub)', marginLeft: 6 }}>{addMode === 'discount' ? '할인일' : '입금일'}</span>
                      <DateInput value={addDate} onChange={setAddDate} style={{ width: 150 }} />

                      <span style={{ fontSize: 11, color: 'var(--text-sub)', marginLeft: 6 }}>금액</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="input mono"
                        placeholder="원 단위"
                        value={addAmount}
                        onChange={(e) => setAddAmount(e.target.value.replace(/[^0-9]/g, ''))}
                        onFocus={(e) => e.currentTarget.select()}
                        style={{ width: 140, imeMode: 'disabled' } as React.CSSProperties}
                        autoFocus
                      />

                      {/* 출처 — 입금 모드에만 */}
                      {addMode === 'payment' && (
                        <>
                          <span style={{ fontSize: 11, color: 'var(--text-sub)', marginLeft: 6 }}>출처</span>
                          <select
                            className="input"
                            value={addSource}
                            onChange={(e) => setAddSource(e.target.value as PaymentEntry['source'])}
                            style={{ width: 90 }}
                            title="입금이 어디서 들어왔는지 — 카드·계좌 매칭 시 자동 출처 지정됨"
                          >
                            <option value="수동">수동</option>
                            <option value="계좌">계좌</option>
                            <option value="카드">카드</option>
                            <option value="현금">현금</option>
                          </select>
                        </>
                      )}

                      {addMode === 'discount' && (
                        <>
                          <span style={{ fontSize: 11, color: 'var(--text-sub)', marginLeft: 6 }}>사유</span>
                          <select className="input" value={addReason} onChange={(e) => setAddReason(e.target.value as DiscountReason)} style={{ width: 110 }}>
                            <option value="자가조치">자가조치</option>
                            <option value="보상">보상</option>
                            <option value="사은품">사은품</option>
                            <option value="캠페인">캠페인</option>
                            <option value="기타">기타</option>
                          </select>
                        </>
                      )}

                      <span style={{ fontSize: 11, color: 'var(--text-sub)', marginLeft: 6 }}>메모</span>
                      <input
                        type="text" className="input" placeholder={addMode === 'discount' ? '예: 타이어 자가교체 차감' : '입금자명 / 거래 메모'}
                        value={addMemo} onChange={(e) => setAddMemo(e.target.value)}
                        style={{ width: 180 }}
                      />
                      <button className="btn btn-sm btn-primary" type="button" disabled={busy} onClick={() => commitAdd(false)}>
                        <CheckCircle size={11} /> {busy ? '저장 중…' : '저장'}
                      </button>
                      <button className="btn btn-sm" type="button" disabled={busy} onClick={() => commitAdd(true)}
                        title={addMode === 'payment' ? '저장하고 같은 회차에 한 줄 더 추가' : '저장하고 할인 사유 한 줄 더 추가'}>
                        <Plus size={11} weight="bold" /> 저장하고 한 줄 더
                      </button>
                      {lastSnapshot && (
                        <button className="btn btn-sm" type="button" onClick={undoLastSaved}
                          title="방금 '한 줄 더' 로 저장한 entry 되돌리기"
                          style={{ color: 'var(--red-text)', borderColor: 'var(--red-text)' }}>
                          <X size={11} weight="bold" /> 직전 ₩{lastSnapshot.amount.toLocaleString()} 취소
                        </button>
                      )}
                      <button className="btn btn-sm" type="button" onClick={() => { setAddOpenSeq(null); setLastSnapshot(null); }}>취소</button>
                      <span style={{ fontSize: 10, color: 'var(--text-weak)' }}>
                        {addMode === 'discount'
                          ? '※ 청구할인 — 청구금액에서 차감 (미수 X). 이번 회차에만 적용'
                          : '※ 회차 금액 초과분은 다음 회차로 자동 선납 처리'}
                      </span>
                    </div>
                  </td>
                </tr>
              )}

              {/* 펼침 — 분납 + 할인 내역 통합 (날짜순) */}
              {isExpanded && hasEntries && (
                <tr>
                  <td colSpan={10} style={{ background: 'var(--bg-sunken)', padding: 8 }}>
                    <table className="table" style={{ fontSize: 11, margin: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 100 }}>일자</th>
                          <th className="center" style={{ width: 60 }}>구분</th>
                          <th className="num" style={{ width: 110 }}>금액</th>
                          <th className="center" style={{ width: 70 }}>출처/사유</th>
                          <th>메모</th>
                          <th className="mono dim" style={{ width: 140 }}>등록자</th>
                          <th className="center" style={{ width: 50 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ...pays.map((p, idx) => ({ kind: 'payment' as const, idx, date: p.date, amount: p.amount, label: p.source, memo: p.memo, by: p.by, source: p.source })),
                          ...discs.map((d, idx) => ({ kind: 'discount' as const, idx, date: d.date, amount: d.amount, label: d.reason ?? '할인', memo: d.memo, by: d.by, source: '할인' as const })),
                        ]
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .map((e, i) => (
                            <tr key={`${e.kind}-${e.idx}-${i}`}>
                              <td className="mono">{formatDateFull(e.date)}</td>
                              <td className="center">
                                {e.kind === 'discount'
                                  ? <span className="chip" style={{ height: 16, padding: '0 6px', fontSize: 10, background: 'var(--red-bg)', color: 'var(--red-text)' }}>할인</span>
                                  : <span className="chip" style={{ height: 16, padding: '0 6px', fontSize: 10, background: 'var(--green-bg)', color: 'var(--green-text)' }}>입금</span>}
                              </td>
                              <td className="num mono" style={{ color: e.kind === 'discount' ? 'var(--red-text)' : undefined }}>
                                {e.kind === 'discount' ? '-' : ''}₩{formatCurrency(e.amount)}
                              </td>
                              <td className="center">
                                <span className="chip" style={{
                                  height: 16, padding: '0 6px', fontSize: 10,
                                  background: e.kind === 'discount' ? 'var(--bg-sunken)'
                                    : e.source === '정산' ? 'var(--bg-sunken)'
                                    : e.source === '계좌' ? 'var(--blue-bg)'
                                    : e.source === '카드' ? 'var(--purple-bg)'
                                    : 'var(--green-bg)',
                                  color: e.kind === 'discount' ? 'var(--text-weak)'
                                    : e.source === '정산' ? 'var(--text-weak)'
                                    : e.source === '계좌' ? 'var(--blue-text)'
                                    : e.source === '카드' ? 'var(--purple-text)'
                                    : 'var(--green-text)',
                                }}>{e.label}</span>
                              </td>
                              <td className="dim">{e.memo || '-'}</td>
                              <td className="mono dim">{e.by ?? (e.kind === 'payment' && e.source === '정산' ? '(자동)' : '-')}</td>
                              <td className="center">
                                {e.kind === 'discount' ? (
                                  <button className="btn btn-sm btn-ghost btn-icon" type="button" onClick={() => removeDiscount(r.seq, e.idx)} title="삭제">
                                    <X size={10} />
                                  </button>
                                ) : (e.source !== '계좌' && e.source !== '카드') ? (
                                  <button className="btn btn-sm btn-ghost btn-icon" type="button" onClick={() => removePayment(r.seq, e.idx)} title="삭제">
                                    <X size={10} />
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}

function addMonths(yyyymmdd: string, months: number, day: number): string {
  const d = new Date(yyyymmdd);
  d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, 28));
  return d.toISOString().slice(0, 10);
}
