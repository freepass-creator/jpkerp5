'use client';

/**
 * 모바일 반납 처리 — 차량 선택 → 반납일 + 메모 → 저장.
 *
 * 흐름:
 *  1. 반납 대기 차량 (운행 + 반납 임박/지연) 리스트 또는 검색
 *  2. 반납일 (오늘 기본) + 반납 메모
 *  3. 저장 — contract.returnedDate = 날짜, status='반납', vehicleStatus='반납'
 *           + field_logs/{contractId} return type
 */

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MagnifyingGlass, ArrowUUpLeft, ArrowsLeftRight } from '@phosphor-icons/react';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useAuth } from '@/lib/use-auth';
import { addFieldLog } from '@/lib/firebase/field-logs-store';
import { toast } from '@/lib/toast';
import { MobileSaveFooter } from '@/components/mobile/save-footer';
import { todayKr } from '@/lib/mock-data';

export default function MobileReturn() {
  const router = useRouter();
  const params = useSearchParams();
  const preContractId = params?.get('contractId') ?? '';
  const { contracts, update: updateContract } = useContracts();
  const { vehicles } = useVehicles();
  const { user } = useAuth();
  const [step, setStep] = useState<'pick' | 'form'>(preContractId ? 'form' : 'pick');
  const [contractId, setContractId] = useState(preContractId);
  const [q, setQ] = useState('');
  const [returnedDate, setReturnedDate] = useState(todayKr());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const contract = contracts.find((c) => c.id === contractId);

  // 반납 대기 후보 — 운행 중 + 반납 안 됨. 만기 임박/지연 우선.
  const waitingReturn = useMemo(() => {
    const todayDate = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    return contracts
      .filter((c) => !c.returnedDate)
      .filter((c) => c.vehicleStatus === '운행' || c.vehicleStatus === '연장대기' || c.vehicleStatus === '종료대기')
      .map((c) => {
        const ret = c.returnScheduledDate ? new Date(c.returnScheduledDate) : null;
        const diff = ret ? Math.floor((ret.getTime() - todayDate.getTime()) / dayMs) : 9999;
        return { c, diff };
      })
      .sort((a, b) => a.diff - b.diff)
      .map((x) => x.c)
      .slice(0, 30);
  }, [contracts]);

  const matches = useMemo(() => {
    const query = q.trim().toLowerCase().replace(/[^\w가-힣]/g, '');
    if (!query) return [];
    return contracts
      .filter((c) => !c.returnedDate)
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
    if (!contract || !returnedDate) return;
    setSaving(true);
    try {
      // 1. 계약 반납 처리
      await updateContract({
        ...contract,
        returnedDate,
        status: '반납',
        vehicleStatus: '반납',
      });
      // 2. field_logs return type
      const body = note.trim() || `반납 완료 (${returnedDate})`;
      await addFieldLog(contract.id, {
        type: 'return',
        body,
        payload: { returnedDate },
        vehicleId,
        customerKey,
        by: user?.email ?? undefined,
      });
      toast.success('반납 처리 완료');
      router.push(`/m/contract/${contract.id}`);
    } catch (e) {
      toast.error(`처리 실패: ${(e as Error).message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ArrowUUpLeft size={22} weight="regular" />
          반납 처리
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

          {!q.trim() && waitingReturn.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>
              반납 대기 ({waitingReturn.length}) — 만기 가까운 순
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(q.trim() ? matches : waitingReturn).map((c) => {
              const todayDate = new Date();
              const ret = c.returnScheduledDate ? new Date(c.returnScheduledDate) : null;
              const diff = ret ? Math.floor((ret.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)) : null;
              const overdueColor = diff != null && diff < 0 ? 'var(--red-text)'
                : diff != null && diff <= 3 ? 'var(--orange-text)'
                : 'var(--text-weak)';
              return (
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
                    <div style={{ fontSize: 10.5, color: overdueColor }}>
                      {c.returnScheduledDate ? (
                        <>예정 {c.returnScheduledDate}{diff != null && (diff < 0 ? ` · ${-diff}일 지연` : diff <= 7 ? ` · D-${diff}` : '')}</>
                      ) : (c.vehicleModel ?? '')}
                    </div>
                  </div>
                  <ArrowsLeftRight size={16} weight="bold" style={{ color: 'var(--brand)' }} />
                </button>
              );
            })}
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
              <div style={{ fontSize: 10.5, color: 'var(--text-weak)' }}>
                {contract.returnScheduledDate ? `예정 ${contract.returnScheduledDate}` : (contract.vehicleModel ?? '')}
              </div>
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
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-sub)' }}>반납일</label>
            <input type="date" value={returnedDate} onChange={(e) => setReturnedDate(e.target.value)}
              style={{
                padding: '12px 14px', fontSize: 16, fontFamily: 'inherit',
                background: 'var(--bg-card)', color: 'var(--text-main)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                outline: 'none',
              }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-sub)' }}>반납 메모 (선택)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="차량 상태·주행거리·미수·연체 사유 등"
              style={{
                minHeight: 120, padding: 14,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)', resize: 'vertical',
                fontSize: 14, fontFamily: 'inherit', lineHeight: 1.6,
                color: 'var(--text-main)', outline: 'none',
              }} />
          </div>

          <div style={{
            padding: 12, background: 'var(--orange-bg)', color: 'var(--orange-text)',
            borderRadius: 'var(--radius)', fontSize: 11.5, lineHeight: 1.5,
          }}>
            저장 시 자동:
            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
              <li>계약 반납일 = {returnedDate}</li>
              <li>차량 상태 = 반납</li>
              <li>계약 상태 = 반납</li>
              <li>현장 입력 (return 종류) 자동 기록</li>
            </ul>
          </div>

          <MobileSaveFooter
            prevLabel="취소"
            onPrev={() => router.back()}
            primaryLabel="반납 완료"
            primaryBusyLabel="처리 중..."
            primaryBusy={saving}
            primaryDisabled={!returnedDate}
            onPrimary={handleSave}
          />
        </>
      )}
    </div>
  );
}
