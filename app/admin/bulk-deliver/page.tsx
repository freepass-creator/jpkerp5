'use client';

/**
 * /admin/bulk-deliver — 미인도 계약 일괄 인도완료.
 *
 * 사용자 정책: 계약자 있는데 인도일 비어있는 = 사실상 인도된 상태인데 데이터만 빠짐.
 *
 * 대상 검출:
 *  · customerName 있음
 *  · deliveredDate 없음
 *  · 반납/해지/매각/매각대기/매각검토 제외 (이미 종료)
 *
 * 처리:
 *  · deliveredDate = contractDate (없으면 오늘)
 *  · status = '운행', vehicleStatus = '운행'
 *  · syncContractAndVehicleStatus 헬퍼 거쳐 Vehicle 마스터 status 도 동기화
 *
 * UI: 미리보기 → 체크박스 선택 → 일괄 처리
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Truck, CheckCircle } from '@phosphor-icons/react';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { syncContractAndVehicleStatus } from '@/lib/firebase/contract-status-sync';
import { markDelivered } from '@/lib/contract-actions';
import { useAuth } from '@/lib/use-auth';
import { isSuperAdmin } from '@/lib/admin-emails';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';
import { isContractEnded } from '@/lib/contract-lifecycle';
import { todayKr } from '@/lib/mock-data';

export default function BulkDeliverPage() {
  const router = useRouter();
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user?.email);
  // 위험 작업 — superAdmin 아니면 즉시 redirect
  useEffect(() => {
    if (user && !superAdmin) router.replace('/');
  }, [user, superAdmin, router]);
  const { contracts, update: updateContract } = useContracts();
  const { vehicles, update: updateVehicleMaster } = useVehicles();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overrideDate, setOverrideDate] = useState('');  // 빈값=각자 계약시작일
  const [running, setRunning] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  const candidates = useMemo(() => {
    return contracts.filter((c) => {
      if (!c.customerName?.trim()) return false;
      if (c.deliveredDate) return false;
      if (isContractEnded(c)) return false;
      const s = c.vehicleStatus;
      if (s === '매각' || s === '매각대기' || s === '매각검토') return false;
      return true;
    });
  }, [contracts]);

  const toggleAll = () => {
    if (selected.size === candidates.length) setSelected(new Set());
    else setSelected(new Set(candidates.map((c) => c.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function handleProcess() {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    const targets = candidates.filter((c) => selected.has(c.id));
    if (targets.length === 0) { toast.warning('선택된 계약 없음'); return; }
    if (!await showConfirm({ title: `${targets.length}건 일괄 인도완료 처리합니다.\n  · deliveredDate = 계약시작일\n  · status, vehicleStatus = '운행'\n  · 차량 마스터(자산) status 동시 동기화\n\n진행할까요?` })) return;

    setRunning(true);
    setDoneCount(0);
    try {
      for (const c of targets) {
        const deliveredDate = overrideDate || c.contractDate || todayKr();
        // 상태값 SSOT (ERP #4)
        const updated = markDelivered(c, deliveredDate);
        await syncContractAndVehicleStatus(updated, vehicles, updateContract, updateVehicleMaster);
        setDoneCount((n) => n + 1);
      }
      toast.success(`${targets.length}건 인도완료 처리 + 차량 마스터 동기화`);
      setSelected(new Set());
    } catch (e) {
      toast.error(`실패: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <Truck size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>개발도구</span>
            <span style={{ color: 'var(--text-weak)', margin: '0 6px', fontSize: 11 }}>›</span>
            <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>미인도 일괄 인도완료</span>
          </div>
        </header>

        <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          <header className="page-header" style={{ flexShrink: 0 }}>
            <div className="page-header-title-group">
              <h1 className="page-header-title">
                <Truck size={18} weight="duotone" />
                미인도 일괄 인도완료
              </h1>
              <div className="page-header-title-sub">
                계약자 있는데 인도일 비어있는 계약 검출 → 선택 → 일괄 인도완료 + Vehicle 마스터 status 동기화.
              </div>
            </div>
          </header>

          <section className="detail-section" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="detail-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <span className="title">대상 ({candidates.length}건)</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ fontSize: 11, color: 'var(--text-sub)', display: 'flex', gap: 4, alignItems: 'center' }}>
                  인도일
                  <input
                    type="date"
                    value={overrideDate}
                    onChange={(e) => setOverrideDate(e.target.value)}
                    className="input-compact"
                    style={{ width: 130 }}
                    title="비워두면 각자 계약시작일이 인도일로 들어감"
                  />
                </label>
                <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>선택 {selected.size}건</span>
                <button className="btn btn-sm" onClick={toggleAll}>
                  {selected.size === candidates.length ? '전체 해제' : '전체 선택'}
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleProcess}
                  disabled={running || selected.size === 0 || !superAdmin}
                  title={!superAdmin ? '관리자 전용' : ''}
                >
                  <CheckCircle size={12} weight="bold" />
                  {running ? `처리 중 ${doneCount}/${selected.size}` : '선택 일괄 인도완료'}
                </button>
              </div>
            </div>

            <div className="detail-section-body" style={{ padding: 0, flex: 1, minHeight: 0, overflow: 'auto' }}>
              {candidates.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-weak)', fontSize: 12 }}>
                  미인도 계약 없음 (전부 처리됨)
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>
                        <input
                          type="checkbox"
                          checked={candidates.length > 0 && selected.size === candidates.length}
                          ref={(el) => { if (el) el.indeterminate = selected.size > 0 && selected.size < candidates.length; }}
                          onChange={toggleAll}
                        />
                      </th>
                      <th style={{ width: 110 }}>차량번호</th>
                      <th>계약자</th>
                      <th style={{ width: 120 }}>차종</th>
                      <th style={{ width: 120 }}>회사</th>
                      <th style={{ width: 110 }}>계약시작일</th>
                      <th style={{ width: 90 }}>차량상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c) => (
                      <tr key={c.id} onClick={() => toggleOne(c.id)} style={{ cursor: 'pointer' }}>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} />
                        </td>
                        <td className="plate">{c.vehiclePlate}</td>
                        <td>{c.customerName}</td>
                        <td className="dim">{c.vehicleModel}</td>
                        <td className="dim">{c.company}</td>
                        <td className="mono dim">{c.contractDate || todayKr()}</td>
                        <td className="dim" style={{ fontSize: 11 }}>{c.vehicleStatus || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
