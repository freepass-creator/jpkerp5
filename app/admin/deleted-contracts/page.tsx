'use client';

/**
 * /admin/deleted-contracts — soft-deleted 계약 조회·복원 (#6 완결).
 *
 * 계약 삭제는 물리삭제가 아니라 deletedAt 스탬프(원본 RTDB 보존)라, 여기서 되살릴 수 있음.
 * data-context 구독은 삭제분을 걸러내므로 fetchDeletedContracts 로 raw 조회.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowCounterClockwise, Trash } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { fetchDeletedContracts, restoreContract } from '@/lib/firebase/contracts-store';
import { useRole } from '@/lib/use-role';
import { formatCurrency } from '@/lib/utils';
import { showConfirm } from '@/lib/confirm';
import { safeUpdate } from '@/lib/safe-update';
import { toast } from '@/lib/toast';
import type { Contract } from '@/lib/types';

export default function DeletedContractsPage() {
  const router = useRouter();
  const { isMaster, loading: roleLoading } = useRole();
  const [rows, setRows] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await fetchDeletedContracts()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!roleLoading && !isMaster) {
    router.replace('/');
    return null;
  }

  async function handleRestore(c: Contract) {
    if (!await showConfirm({ title: `${c.contractNo ?? c.id} 계약을 복원하시겠습니까?` })) return;
    const ok = await safeUpdate(() => restoreContract(c.id, c.updatedAt), { errorPrefix: '복원 실패' });
    if (ok !== null) { toast.success(`${c.contractNo ?? c.id} 복원됨`); void load(); }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: 24, maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <header className="page-header" style={{ marginBottom: 16 }}>
          <h1 className="page-header-title">
            <Trash size={18} weight="duotone" /> 삭제된 계약 (복원)
          </h1>
          <div className="page-header-title-sub">
            계약 삭제는 물리삭제가 아니라 soft delete(deletedAt) — 원본이 보존되어 여기서 되살릴 수 있습니다. (#6)
          </div>
        </header>

        <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 13 }}>삭제됨 <strong>{rows.length}</strong>건</span>
          <button className="btn" type="button" onClick={() => void load()} disabled={loading}>
            {loading ? '불러오는 중…' : '새로고침'}
          </button>
        </div>

        <section className="panel">
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>계약번호</th>
                  <th>차량</th>
                  <th>계약자</th>
                  <th className="num">월대여료</th>
                  <th>삭제일시</th>
                  <th>삭제자</th>
                  <th className="center" style={{ width: 90 }}>복원</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="muted center" style={{ padding: 32 }}>불러오는 중…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={7} className="muted center" style={{ padding: 32 }}>삭제된 계약 없음</td></tr>
                ) : rows.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{c.contractNo || c.id}</td>
                    <td className="mono dim">{c.vehiclePlate || '-'}</td>
                    <td style={{ fontWeight: 600 }}>{c.customerName || '-'}</td>
                    <td className="num mono">{c.monthlyRent ? `₩${formatCurrency(c.monthlyRent)}` : '-'}</td>
                    <td className="mono dim">{(c.deletedAt ?? '').slice(0, 19).replace('T', ' ')}</td>
                    <td className="dim">{c.deletedBy || '-'}</td>
                    <td className="center">
                      <button className="btn btn-sm" type="button" onClick={() => void handleRestore(c)} title="이 계약을 복원">
                        <ArrowCounterClockwise size={13} /> 복원
                      </button>
                    </td>
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
