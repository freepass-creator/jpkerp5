'use client';

/**
 * /admin/derive-customers — 고객 마스터 파생·연결 (R5).
 *
 * 계약에 임베드된 고객정보를 등록번호 기준 dedup 해 customers 마스터로 통합 + Contract.customerId 스탬프.
 * 원천(계약 고객필드)은 그대로 유지. 재실행 멱등(결정적 id). v6 customer 이관 정합.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UsersThree } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { useContracts } from '@/lib/firebase/contracts-store';
import { deriveCustomers } from '@/lib/customer-derive';
import { upsertCustomers } from '@/lib/firebase/customers-store';
import { useRole } from '@/lib/use-role';
import { showConfirm } from '@/lib/confirm';
import { toast } from '@/lib/toast';
import { EmptyRow } from '@/components/ui/empty-row';
import { StatusBadge } from '@/components/ui/status-badge';

export default function DeriveCustomersPage() {
  const router = useRouter();
  const { isMaster, loading: roleLoading } = useRole();
  const { contracts, updateMany } = useContracts();
  const [busy, setBusy] = useState(false);

  const { customers, contractToCustomer } = useMemo(() => deriveCustomers(contracts), [contracts]);

  const stats = useMemo(() => {
    const multi = customers.filter((c) => (c.contractIds?.length ?? 0) > 1);
    const linked = contracts.filter((c) => c.customerId && c.customerId === contractToCustomer[c.id]).length;
    const toLink = contracts.filter((c) => contractToCustomer[c.id] && c.customerId !== contractToCustomer[c.id]).length;
    return { customers: customers.length, multi: multi.length, linked, toLink, multiList: multi };
  }, [customers, contracts, contractToCustomer]);

  async function applyDerive() {
    if (customers.length === 0) { toast.info('파생할 고객 없음'); return; }
    if (!await showConfirm({
      title: `고객 마스터 ${customers.length}명 생성/갱신 + 계약 ${stats.toLink}건 연결할까요?`,
      description: '계약의 고객정보(원천)는 그대로 유지, customers 마스터 upsert + Contract.customerId 스탬프. 재실행 가능.',
      confirmLabel: '파생·연결',
    })) return;
    setBusy(true);
    try {
      await upsertCustomers(customers);
      const patches = contracts
        .filter((c) => contractToCustomer[c.id] && c.customerId !== contractToCustomer[c.id])
        .map((c) => ({ ...c, customerId: contractToCustomer[c.id] }));
      if (patches.length > 0) await updateMany(patches);
      toast.success(`고객 ${customers.length}명 · 계약 ${patches.length}건 연결`);
    } catch (e) {
      toast.error(`실패: ${(e as Error).message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  if (!roleLoading && !isMaster) { router.replace('/'); return null; }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: 24, maxWidth: 980, margin: '0 auto', width: '100%' }}>
        <header className="page-header" style={{ marginBottom: 16 }}>
          <h1 className="page-header-title"><UsersThree size={18} weight="duotone" /> 고객 마스터 파생·연결 (customers)</h1>
          <div className="page-header-title-sub">
            계약마다 복제된 고객정보를 등록번호 기준 dedup → 동일인 여러 계약 연결. 원천은 계약에 유지. 재실행 멱등. v6 customer 이관 정합.
          </div>
        </header>

        <div className="panel" style={{ marginBottom: 16 }}>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Kpi label="고유 고객" value={stats.customers} tone="var(--brand)" />
            <Kpi label="다계약 고객" value={stats.multi} tone="var(--green-text)" />
            <Kpi label="이미 연결됨" value={stats.linked} />
            <Kpi label="연결 대상" value={stats.toLink} tone={stats.toLink > 0 ? 'var(--orange-text)' : undefined} />
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            <button className="btn btn-primary" type="button" disabled={busy || stats.customers === 0} onClick={applyDerive}>
              {busy ? '처리 중…' : `고객 ${stats.customers}명 파생 + 계약 ${stats.toLink}건 연결`}
            </button>
          </div>
        </div>

        <section className="panel">
          <div className="panel-body" style={{ padding: 0 }}>
            <div className="dim" style={{ fontSize: 11, padding: '10px 12px 4px' }}>다계약 고객 (동일인이 여러 계약 — 연결의 핵심 가치)</div>
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>고객</th>
                  <th>등록번호</th>
                  <th className="center">계약 수</th>
                  <th>입금자 별칭</th>
                </tr>
              </thead>
              <tbody>
                {stats.multiList.length === 0 ? (
                  <EmptyRow colSpan={4}>다계약 고객 없음 (모두 단일 계약)</EmptyRow>
                ) : stats.multiList.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name || '-'} {c.kind && <StatusBadge tone="neutral">{c.kind}</StatusBadge>}</td>
                    <td className="mono dim">{c.identNo ? c.identNo.slice(0, 6) + '••' : '-'}</td>
                    <td className="center mono" style={{ fontWeight: 700 }}>{c.contractIds?.length ?? 0}</td>
                    <td className="dim">{(c.payerAliases ?? []).join(', ') || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div style={{ padding: '4px 8px' }}>
      <div className="dim" style={{ fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: tone }}>{value}</div>
    </div>
  );
}
