'use client';

/**
 * 모바일 메모 입력 — 차량 선택 → 메모 작성 → 저장.
 *
 * 흐름:
 *  1. 차량 검색 + 선택 (검색바)
 *  2. 메모 작성 + 저장 (field_logs/{contractId} push)
 *  3. 토스트 + 입력 탭으로 복귀
 */

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CaretLeft, MagnifyingGlass, NotePencil, Check } from '@phosphor-icons/react';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useAuth } from '@/lib/use-auth';
import { addFieldLog } from '@/lib/firebase/field-logs-store';
import { toast } from '@/lib/toast';

export default function MobileMemoEntry() {
  const router = useRouter();
  const params = useSearchParams();
  const preContractId = params?.get('contractId') ?? '';
  const { contracts } = useContracts();
  const { user } = useAuth();
  const [step, setStep] = useState<'pick' | 'write'>(preContractId ? 'write' : 'pick');
  const [contractId, setContractId] = useState(preContractId);
  const [q, setQ] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  const contract = contracts.find((x) => x.id === contractId);

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
    try {
      await addFieldLog(contractId, {
        type: 'memo',
        body: memo.trim(),
        by: user?.email ?? undefined,
      });
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
      <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Link href="/m/entry" style={{ color: 'var(--text-sub)', textDecoration: 'none', fontSize: 12 }}>
          <CaretLeft size={14} weight="bold" /> 입력
        </Link>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, flex: 1 }}>메모</h1>
      </header>

      {step === 'pick' && (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>1/2 — 차량을 먼저 선택하세요</div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px', background: 'var(--bg-card)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
          }}>
            <MagnifyingGlass size={18} weight="duotone" />
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
          <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>2/2 — 메모 작성</div>
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

          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="메모 내용을 입력하세요 (차량 상태·고객 요청·특이사항 등)"
            autoFocus
            style={{
              minHeight: 200, padding: 14,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', resize: 'vertical',
              fontSize: 14, fontFamily: 'inherit', lineHeight: 1.6,
              color: 'var(--text-main)', outline: 'none',
            }}
          />

          <button
            type="button"
            onClick={handleSave}
            disabled={!memo.trim() || saving}
            style={{
              height: 52, fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
              background: 'var(--brand)', color: '#fff', border: 'none',
              borderRadius: 'var(--radius-lg)', cursor: saving ? 'wait' : 'pointer',
              opacity: !memo.trim() ? 0.5 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Check size={16} weight="bold" />
            {saving ? '저장 중...' : '메모 저장'}
          </button>
        </>
      )}
    </div>
  );
}
