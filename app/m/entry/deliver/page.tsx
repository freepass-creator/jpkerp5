'use client';

/**
 * 모바일 인도 처리 — 차량 선택 → 인도일 + 메모 → 저장.
 *
 * 흐름:
 *  1. 인도 대기 차량 리스트 또는 차량 검색
 *  2. 인도일 (오늘 기본) + 인도 메모
 *  3. 저장 — contract.deliveredDate = 날짜, status='운행', vehicleStatus='운행'
 *           + field_logs/{contractId} delivery type
 */

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MagnifyingGlass, Truck, ArrowsLeftRight } from '@phosphor-icons/react';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useAuth } from '@/lib/use-auth';
import { addFieldLog } from '@/lib/firebase/field-logs-store';
import { syncContractAndVehicleStatus } from '@/lib/firebase/contract-status-sync';
import { toast } from '@/lib/toast';
import { isContractEnded } from '@/lib/contract-lifecycle';
import { MobileSaveFooter } from '@/components/mobile/save-footer';
import { todayKr } from '@/lib/mock-data';
// Phase 2.4 — 모바일 입력 intake 평행 기록
import { addIntakeItem, markIntakeCommitted } from '@/lib/firebase/intake-store';
import { markDelivered } from '@/lib/contract-actions';
import { useClosedPeriods, isDateInClosedPeriod } from '@/lib/firebase/closed-periods-store';

export default function MobileDeliver() {
  const router = useRouter();
  const params = useSearchParams();
  const preContractId = params?.get('contractId') ?? '';
  const { contracts, update: updateContract } = useContracts();
  const { vehicles, update: updateVehicleMaster } = useVehicles();
  const { user } = useAuth();
  // 회계기간 마감 검사 (ERP #18)
  const { closedPeriods } = useClosedPeriods();
  const [step, setStep] = useState<'pick' | 'form'>(preContractId ? 'form' : 'pick');
  const [contractId, setContractId] = useState(preContractId);
  const [q, setQ] = useState('');
  const [deliveredDate, setDeliveredDate] = useState(todayKr());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const contract = contracts.find((c) => c.id === contractId);

  // 인도 대기 후보 — 차량 검색 안 했을 때 최우선 노출
  const waitingDelivery = useMemo(() => {
    return contracts.filter((c) => {
      if (c.deliveredDate) return false;
      const s = c.vehicleStatus;
      if (s === '휴차' || s === '휴차대기' || s === '매각' || s === '매각대기' || s === '매각검토') return false;
      if (isContractEnded(c)) return false;
      return true;
    }).slice(0, 30);
  }, [contracts]);

  const matches = useMemo(() => {
    const query = q.trim().toLowerCase().replace(/[^\w가-힣]/g, '');
    if (!query) return [];
    return contracts
      .filter((c) => !c.deliveredDate)
      .filter((c) => `${c.vehiclePlate ?? ''}${c.customerName ?? ''}`.toLowerCase().replace(/[^\w가-힣]/g, '').includes(query))
      .slice(0, 20);
  }, [contracts, q]);

  const vehicleId = useMemo(() => {
    if (!contract?.vehiclePlate) return undefined;
    return vehicles.find((v) =>
      (v.plate ?? '').trim() === (contract.vehiclePlate ?? '').trim()
      || (v.plateHistory ?? []).some((p) => (p ?? '').trim() === (contract.vehiclePlate ?? '').trim()),
    )?.id;
  }, [contract, vehicles]);
  const customerKey = useMemo(() => (contract?.customerIdentNo ?? '').replace(/\D/g, '') || undefined, [contract]);

  async function handleSave() {
    if (!contract || !deliveredDate) return;
    // 회계기간 마감 (ERP #18) — 인도일이 마감된 월에 속하면 차단
    if (isDateInClosedPeriod(closedPeriods, deliveredDate)) {
      toast.error(`회계기간 마감 — ${deliveredDate.slice(0, 7)}월 인도 등록 불가. 마감 해제 후 시도하세요.`);
      return;
    }
    setSaving(true);
    const by = user?.email ?? undefined;
    let intakeId: string | null = null;
    try {
      intakeId = await addIntakeItem({
        source: 'mobile-upload',
        raw: {
          mode: 'manual',
          kind: 'contract',
          payload: { scope: 'deliver', contractId: contract.id, deliveredDate, vehicleId, customerKey },
        },
        createdBy: by,
      });
    } catch (e) { console.warn('[intake] deliver addIntakeItem 실패', e); }
    try {
      // 1. 계약 인도완료 처리 (상태값 SSOT ERP #4) + Vehicle 마스터 status 자동 동기화
      await syncContractAndVehicleStatus(
        markDelivered(contract, deliveredDate),
        vehicles,
        updateContract,
        updateVehicleMaster,
      );
      // 2. field_logs delivery type (메모 있으면 본문에 포함, 메모 없어도 인도 기록 남김)
      const body = note.trim() || `인도 완료 (${deliveredDate})`;
      await addFieldLog(contract.id, {
        type: 'delivery',
        body,
        payload: { deliveredDate },
        vehicleId,
        customerKey,
        by,
      });
      if (intakeId) {
        try { await markIntakeCommitted(intakeId, [
          { node: `contracts/${contract.id}`, id: contract.id },
          { node: `field_logs/${contract.id}`, id: '(delivery)' },
        ], by); }
        catch (e) { console.warn('[intake] deliver markIntakeCommitted 실패', e); }
      }
      toast.success('인도 처리 완료');
      router.push(`/m/contract/${contract.id}`);
    } catch (e) {
      // LockConflict (#22) — 다른 사용자가 먼저 수정
      if ((e as Error)?.name === 'LockConflictError') {
        toast.error('다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요.');
      } else {
        toast.error(`처리 실패: ${(e as Error).message ?? String(e)}`);
      }
    } finally {
      setSaving(false);
    }
  }

  const showList = step === 'pick' && !q.trim();

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Truck size={22} weight="regular" />
          인도 처리
        </h1>
      </header>

      {step === 'pick' && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px', background: 'var(--bg-card)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
          }}>
            <MagnifyingGlass size={18} weight="bold" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="차량번호 또는 고객명" autoFocus
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 16, fontFamily: 'inherit' }}
            />
          </div>

          {showList && waitingDelivery.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>
              인도 대기 ({waitingDelivery.length})
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(q.trim() ? matches : waitingDelivery).map((c) => (
              <button key={c.id} type="button" onClick={() => { setContractId(c.id); setStep('form'); }}
                style={{
                  padding: '12px 14px', background: 'var(--bg-card)',
                  border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{c.vehiclePlate ?? '?'}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>{c.customerName ?? '?'}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-weak)' }}>{c.vehicleModel ?? ''}</div>
                </div>
                <ArrowsLeftRight size={16} weight="bold" style={{ color: 'var(--brand)' }} />
              </button>
            ))}
            {q.trim() && matches.length === 0 && (
              <div style={{
                padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-weak)',
                background: 'var(--bg-sunken)', borderRadius: 'var(--radius-lg)',
              }}>검색 결과 없음</div>
            )}
          </div>
        </>
      )}

      {step === 'form' && contract && (
        <>
          <div style={{
            padding: '12px 14px', background: 'var(--bg-card)',
            border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{contract.vehiclePlate ?? '?'}</span>
                <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>{contract.customerName ?? '?'}</span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-weak)' }}>{contract.vehicleModel ?? ''}</div>
            </div>
            {!preContractId && (
              <button type="button" onClick={() => { setStep('pick'); setContractId(''); }} style={{
                fontSize: 11, color: 'var(--text-sub)', background: 'transparent',
                border: '1px solid var(--border)', padding: '4px 8px',
                borderRadius: 'var(--radius)', cursor: 'pointer',
              }}>변경</button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-sub)' }}>인도일</label>
            <input type="date" value={deliveredDate} onChange={(e) => setDeliveredDate(e.target.value)}
              style={{
                padding: '12px 14px', fontSize: 16, fontFamily: 'inherit',
                background: 'var(--bg-card)', color: 'var(--text-main)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                outline: 'none',
              }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-sub)' }}>인도 메모 (선택)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="차량 상태·고객 요청·인계 사항 등"
              style={{
                minHeight: 120, padding: 14,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)', resize: 'vertical',
                fontSize: 14, fontFamily: 'inherit', lineHeight: 1.6,
                color: 'var(--text-main)', outline: 'none',
              }} />
          </div>

          <div style={{
            padding: 12, background: 'var(--green-bg)', color: 'var(--green-text)',
            borderRadius: 'var(--radius)', fontSize: 11.5, lineHeight: 1.5,
          }}>
            저장 시 자동:
            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
              <li>계약 인도일 = {deliveredDate}</li>
              <li>차량 상태 = 운행</li>
              <li>계약 상태 = 운행</li>
              <li>현장 입력 (delivery 종류) 자동 기록</li>
            </ul>
          </div>

          <MobileSaveFooter
            prevLabel="취소"
            onPrev={() => router.back()}
            primaryLabel="인도 완료"
            primaryBusyLabel="처리 중..."
            primaryBusy={saving}
            primaryDisabled={!deliveredDate}
            onPrimary={handleSave}
          />
        </>
      )}
    </div>
  );
}
