'use client';

/**
 * /admin/reconcile — 초기 세팅 일괄 대사 매칭.
 *
 * 3년치 은행입금을 활성 계약자의 계약 수납스케줄에 계약일순·오래된 미납부터 FIFO 로 채워
 * 미리보기 → 확인 후 일괄 적용. 어디에도 못 붙는 '붕 떠있는' 입금은 검토용으로 표시.
 * lib/bulk-reconcile 순수엔진 사용. 적용분은 txId 기준이라 자금일보에서 개별 해제 가능.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowsLeftRight, CheckCircle, Warning } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useBankTx } from '@/lib/firebase/transactions-store';
import { useClosedPeriods, isDateInClosedPeriod } from '@/lib/firebase/closed-periods-store';
import { useRole } from '@/lib/use-role';
import { useAuth } from '@/lib/use-auth';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatCurrency } from '@/lib/utils';
import { todayKr } from '@/lib/mock-data';
import { showConfirm } from '@/lib/confirm';
import { toast } from '@/lib/toast';
import { audit } from '@/lib/firebase/audit-store';
import { planBulkReconcile, buildReconcilePatches } from '@/lib/bulk-reconcile';

export default function ReconcilePage() {
  const router = useRouter();
  const { isMaster, loading: roleLoading } = useRole();
  const { user } = useAuth();
  const { contracts, updateMany: updateManyContracts } = useContracts();
  const { rows: bankTx, updateMany: updateManyBankTx } = useBankTx();
  const { closedPeriods } = useClosedPeriods();
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState(false);

  const plan = useMemo(
    () => planBulkReconcile(contracts, bankTx, {
      today: todayKr(),
      actorEmail: user?.email ?? user?.uid,
      isClosed: (d) => isDateInClosedPeriod(closedPeriods, d),
    }),
    [contracts, bankTx, closedPeriods, user],
  );

  const matchedContracts = useMemo(
    () => plan.perContract.filter((r) => r.matchedTxCount > 0).sort((a, b) => b.matchedAmount - a.matchedAmount),
    [plan],
  );
  const totalMatchedAmount = useMemo(() => plan.assignments.reduce((s, a) => s + a.amount, 0), [plan]);
  const floatingAmount = useMemo(() => plan.floating.reduce((s, t) => s + (t.amount ?? 0), 0), [plan]);

  if (!roleLoading && !isMaster) {
    router.replace('/');
    return null;
  }

  async function handleApply() {
    if (plan.matchedTxIds.length === 0) { toast.info('매칭할 입금이 없습니다'); return; }
    const ok = await showConfirm({
      title: `일괄 대사 적용`,
      description: `입금 ${plan.matchedTxIds.length}건을 ${matchedContracts.length}개 계약에 매칭합니다 (₩${formatCurrency(totalMatchedAmount)}). 각 매칭은 자금일보에서 개별 해제 가능합니다. 진행할까요?`,
    });
    if (!ok) return;
    setApplying(true);
    try {
      const { contractRows, txPatches } = buildReconcilePatches(plan);
      // 거래 먼저 마킹 → 계약 갱신. 중간 실패해도 tx.matchedContractId 가 남아
      // /admin/integrity 유령매칭 스캔이 검출 가능(계약 먼저면 실패가 조용히 묻힘). (#11 부분보호)
      await updateManyBankTx(txPatches);
      await updateManyContracts(contractRows);
      void audit.match('bank_tx', 'bulk-reconcile', `초기 대사 일괄매칭 ${plan.matchedTxIds.length}건 → ${contractRows.length}계약`, {
        txCount: plan.matchedTxIds.length, contractCount: contractRows.length, total: totalMatchedAmount,
      });
      toast.success(`대사 완료 — 입금 ${plan.matchedTxIds.length}건 매칭`);
      setDone(true);
    } catch (e) {
      toast.error(`적용 실패: ${(e as Error).message}`);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: 24, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <header className="page-header" style={{ marginBottom: 16 }}>
          <h1 className="page-header-title">
            <ArrowsLeftRight size={18} weight="duotone" /> 일괄 대사 매칭 (초기 세팅)
          </h1>
          <div className="page-header-title-sub">
            활성 계약자의 계약에 미매칭 은행입금을 계약일순·오래된 미납부터 FIFO 로 채워 미리보기.
            확인 후 일괄 적용하며, 각 매칭은 자금일보에서 개별 해제 가능합니다.
          </div>
        </header>

        <div className="panel" style={{ marginBottom: 16 }}>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Kpi label="매칭 대상 계약" value={`${matchedContracts.length}건`} />
            <Kpi label="매칭 입금" value={`${plan.matchedTxIds.length}건`} sub={`₩${formatCurrency(totalMatchedAmount)}`} tone="green" />
            <Kpi label="붕 떠있는 입금" value={`${plan.floating.length}건`} sub={`₩${formatCurrency(floatingAmount)}`} tone={plan.floating.length ? 'red' : undefined} />
            <Kpi label="초과분(선납)" value={`${plan.overflow.length}건`} />
          </div>
          <div style={{ padding: '0 16px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-primary" type="button" onClick={handleApply} disabled={applying || done || plan.matchedTxIds.length === 0}>
              {done ? '적용 완료' : applying ? '적용 중…' : `대사 일괄 적용 (${plan.matchedTxIds.length}건)`}
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>
              미리보기는 저장되지 않습니다. [적용]을 눌러야 반영됩니다.
              {plan.closedSkipped.length > 0 && ` · 회계마감월 입금 ${plan.closedSkipped.length}건은 제외됨(#18).`}
            </span>
          </div>
        </div>

        <section className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header" style={{ padding: '10px 16px', fontWeight: 700, fontSize: 13 }}>
            계약별 대사 — 매칭 전→후 미납
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>계약자</th>
                  <th>차량</th>
                  <th className="num">월대여료</th>
                  <th className="center">매칭입금</th>
                  <th className="num">매칭액</th>
                  <th className="num">미납(전)</th>
                  <th className="num">미납(후)</th>
                  <th className="center">대사</th>
                </tr>
              </thead>
              <tbody>
                {matchedContracts.length === 0 ? (
                  <tr><td colSpan={8} className="muted center" style={{ padding: 32 }}>매칭 가능한 입금 없음</td></tr>
                ) : matchedContracts.map((r) => {
                  return (
                    <tr key={r.contract.id}>
                      <td style={{ fontWeight: 600 }}>{r.contract.customerName || '-'}</td>
                      <td className="mono dim">{r.contract.vehiclePlate || '-'}</td>
                      <td className="num mono">{r.monthlyRent ? `₩${formatCurrency(r.monthlyRent)}` : '-'}</td>
                      <td className="center dim">{r.matchedTxCount}</td>
                      <td className="num mono">₩{formatCurrency(r.matchedAmount)}</td>
                      <td className="num mono dim">₩{formatCurrency(r.unpaidBefore)}</td>
                      <td className="num mono" style={{ fontWeight: 700, color: r.unpaidAfter > 0 ? 'var(--red-text)' : 'var(--green-text)' }}>
                        ₩{formatCurrency(r.unpaidAfter)}
                      </td>
                      <td className="center">
                        <StatusBadge tone={r.unpaidAfter === 0 ? 'green' : 'orange'}>
                          {r.unpaidAfter === 0 ? '완납' : '미납'}
                        </StatusBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header" style={{ padding: '10px 16px', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            {plan.floating.length > 0 ? <Warning size={14} weight="fill" style={{ color: 'var(--red-text)' }} /> : <CheckCircle size={14} weight="fill" style={{ color: 'var(--green-text)' }} />}
            붕 떠있는 입금 — 계약자 미귀속 ({plan.floating.length}건)
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>거래일</th>
                  <th className="num" style={{ width: 130 }}>금액</th>
                  <th style={{ width: 160 }}>입금자</th>
                  <th>적요</th>
                </tr>
              </thead>
              <tbody>
                {plan.floating.length === 0 ? (
                  <tr><td colSpan={4} className="muted center" style={{ padding: 24 }}>미귀속 입금 없음 — 모든 입금이 계약에 매칭됨</td></tr>
                ) : plan.floating.slice(0, 300).map((t) => (
                  <tr key={t.id}>
                    <td className="mono dim">{(t.txDate ?? '').slice(0, 10)}</td>
                    <td className="num mono">₩{formatCurrency(t.amount ?? 0)}</td>
                    <td>{t.counterparty || '-'}</td>
                    <td className="dim">{t.memo || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {plan.floating.length > 300 && (
              <div style={{ padding: 10, fontSize: 11, color: 'var(--text-sub)', textAlign: 'center' }}>… 외 {plan.floating.length - 300}건 (상위 300건만 표시)</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'green' | 'red' }) {
  const color = tone === 'green' ? 'var(--green-text)' : tone === 'red' ? 'var(--red-text)' : 'var(--text-main)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-weak)', fontFamily: 'var(--font-mono)' }}>{sub}</div>}
    </div>
  );
}
