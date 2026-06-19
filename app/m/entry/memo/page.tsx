'use client';

/**
 * 모바일 메모 입력 — 차량 선택 → 메모 작성 → 저장.
 *
 * 흐름:
 *  1. 차량 검색 + 선택 (검색바)
 *  2. 메모 작성 + 저장 (field_logs/{contractId} push)
 *  3. 토스트 + 입력 탭으로 복귀
 */

import { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MagnifyingGlass, NotePencil } from '@phosphor-icons/react';
import { MobileSaveFooter } from '@/components/mobile/save-footer';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useAuth } from '@/lib/use-auth';
import {
  addFieldLog, addVehicleFieldLog, addCustomerFieldLog,
  type FieldLogScope,
} from '@/lib/firebase/field-logs-store';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptic';
import { addIntakeItem, markIntakeCommitted } from '@/lib/firebase/intake-store';

export default function MobileMemoEntry() {
  const router = useRouter();
  const params = useSearchParams();
  const preContractId = params?.get('contractId') ?? '';
  const { contracts } = useContracts();
  const { vehicles } = useVehicles();
  const { user } = useAuth();
  const [step, setStep] = useState<'pick' | 'write'>(preContractId ? 'write' : 'pick');
  const [contractId, setContractId] = useState(preContractId);
  const [q, setQ] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<FieldLogScope>('contract');

  const contract = contracts.find((x) => x.id === contractId);
  // 차량 ID 매칭 (vehiclePlate 기반)
  const vehicleId = useMemo(() => {
    if (!contract?.vehiclePlate) return null;
    return vehicles.find((v) =>
      (v.plate ?? '').trim() === (contract.vehiclePlate ?? '').trim()
      || (v.plateHistory ?? []).some((p) => (p ?? '').trim() === (contract.vehiclePlate ?? '').trim())
    )?.id ?? null;
  }, [contract, vehicles]);
  // 손님 키 (등록번호 디지트만)
  const customerKey = useMemo(() => {
    const d = (contract?.customerIdentNo ?? '').replace(/\D/g, '');
    return d || null;
  }, [contract]);

  // 차량/손님 저장 키 — 자산 미등록/등록번호 결손 시 plate·phone 으로 폴백
  // 추후 plate-key → 자체코드 이관(migrate-sheet)으로 통합 가능
  const vehicleStorageKey = useMemo(() => {
    if (vehicleId) return vehicleId;
    const plate = (contract?.vehiclePlate ?? '').trim();
    return plate || null;
  }, [vehicleId, contract]);
  const customerStorageKey = useMemo(() => {
    if (customerKey) return customerKey;
    const phone = (contract?.customerPhone1 ?? '').replace(/\D/g, '');
    return phone || null;
  }, [customerKey, contract]);

  // 기본 scope 선택 로직: 계약 활성이면 contract, 활성 아닌데 차량 매칭되면 vehicle, 둘 다 아니면 contract
  const defaultScope: FieldLogScope = useMemo(() => {
    if (!contract) return 'contract';
    const cs = contract.status;
    if (cs === '운행' || cs === '대기') return 'contract';
    if (vehicleId) return 'vehicle';
    return 'contract';
  }, [contract, vehicleId]);

  // contract 변경 시 default scope 자동 적용 (사용자 선택은 동일 deps 동안 유지)
  useEffect(() => { setScope(defaultScope); }, [defaultScope]);

  const matches = useMemo(() => {
    const query = q.trim().toLowerCase().replace(/[^\w가-힣]/g, '');
    if (!query) return [];
    return contracts
      .filter((c) => `${c.vehiclePlate ?? ''}${c.customerName ?? ''}`.toLowerCase().replace(/[^\w가-힣]/g, '').includes(query))
      .slice(0, 20);
  }, [contracts, q]);

  async function handleSave() {
    if (!contractId || !memo.trim()) return;
    setSaving(true);
    const body = memo.trim();
    const by = user?.email ?? undefined;
    let intakeId: string | null = null;
    try {
      intakeId = await addIntakeItem({
        source: 'mobile-upload',
        raw: {
          mode: 'manual',
          kind: 'document-misc',
          payload: { scope: `memo-${scope}`, contractId, vehicleStorageKey, customerStorageKey, length: body.length },
        },
        createdBy: by,
      });
    } catch (e) { console.warn('[intake] memo addIntakeItem 실패', e); }
    try {
      let committedNode = '';
      if (scope === 'contract') {
        // 계약 메모 — 차량/손님 노드에도 자동 전파 (addFieldLog 가 처리)
        await addFieldLog(contractId, {
          type: 'memo', body, by,
          vehicleId: vehicleStorageKey ?? undefined,
          customerKey: customerStorageKey ?? undefined,
        });
        committedNode = `field_logs/${contractId}`;
      } else if (scope === 'vehicle' && vehicleStorageKey) {
        await addVehicleFieldLog(vehicleStorageKey, { type: 'memo', body, by });
        committedNode = `vehicle_field_logs/${vehicleStorageKey}`;
      } else if (scope === 'customer' && customerStorageKey) {
        await addCustomerFieldLog(customerStorageKey, { type: 'memo', body, by });
        committedNode = `customer_field_logs/${customerStorageKey}`;
      } else {
        toast.warning('대상 식별자가 없어 저장 불가 (차량번호·휴대폰·등록번호 전부 결손)');
        setSaving(false);
        return;
      }
      if (intakeId) {
        try { await markIntakeCommitted(intakeId, [{ node: committedNode, id: '(memo)' }], by); }
        catch (e) { console.warn('[intake] memo markIntakeCommitted 실패', e); }
      }
      toast.success('메모 저장됨');
      router.push(`/m/contract/${contractId}`);
    } catch (e) {
      toast.error(`저장 실패: ${(e as Error).message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <NotePencil size={22} weight="regular" />
          메모
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
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="차량번호 또는 고객명"
              autoFocus
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 16, fontFamily: 'inherit' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {matches.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { setContractId(c.id); setStep('write'); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', background: 'var(--bg-card)',
                  border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                }}
              >
                <div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{c.vehiclePlate ?? '?'}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>{c.customerName ?? '?'}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-weak)' }}>{c.vehicleModel ?? ''}</div>
                </div>
                <NotePencil size={18} weight="duotone" style={{ color: 'var(--brand)' }} />
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'write' && contract && (
        <>
          <div style={{
            padding: '10px 14px', background: 'var(--bg-card)',
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

          {/* 메모 대상 (scope) — 계약 / 차량 / 손님 (빈도순) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-sub)' }}>대상</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <ScopeChip
                active={scope === 'contract'}
                onClick={() => { haptic.light(); setScope('contract'); }}
                label="이 계약"
                disabled={false}
              />
              <ScopeChip
                active={scope === 'vehicle'}
                onClick={() => { haptic.light(); setScope('vehicle'); }}
                label="이 차량"
                disabled={!vehicleStorageKey}
                hint={!vehicleId && vehicleStorageKey ? '자산 미등록 — 차량번호 키로 저장' : undefined}
              />
              <ScopeChip
                active={scope === 'customer'}
                onClick={() => { haptic.light(); setScope('customer'); }}
                label="이 손님"
                disabled={!customerStorageKey}
                hint={!customerKey && customerStorageKey ? '등록번호 없음 — 휴대폰 키로 저장' : undefined}
              />
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-weak)' }}>
              {scope === 'contract' && '계약에 남기고 차량·손님 이력에도 자동 표시됩니다.'}
              {scope === 'vehicle' && '차량에만 남깁니다 (이 차의 미래 계약에도 노출).'}
              {scope === 'customer' && '손님에만 남깁니다 (이 손님의 다른 계약에도 노출).'}
            </div>
          </div>

          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="메모 내용을 입력하세요 (차량 상태·고객 요청·특이사항 등)"
            style={{
              minHeight: 200, padding: 14,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', resize: 'vertical',
              fontSize: 14, fontFamily: 'inherit', lineHeight: 1.6,
              color: 'var(--text-main)', outline: 'none',
            }}
          />

        </>
      )}

      {/* 하단 [취소] [메모 저장] — 하단 BackBar 영역 활용 */}
      {step === 'write' && (
        <MobileSaveFooter
          prevLabel="취소"
          onPrev={() => router.back()}
          primaryLabel="메모 저장"
          primaryBusyLabel="저장 중..."
          primaryBusy={saving}
          primaryDisabled={!memo.trim()}
          onPrimary={handleSave}
        />
      )}
    </div>
  );
}

function ScopeChip({ active, onClick, label, disabled, hint }: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={hint}
      style={{
        flex: 1, padding: '10px 12px',
        fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
        background: disabled ? 'var(--bg-sunken)' : active ? 'var(--brand)' : 'var(--bg-card)',
        color: disabled ? 'var(--text-weak)' : active ? '#fff' : 'var(--text-main)',
        border: `1px solid ${disabled ? 'var(--border-soft)' : active ? 'var(--brand)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        touchAction: 'manipulation',
      }}
    >
      {label}
    </button>
  );
}

