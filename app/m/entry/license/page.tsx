'use client';

/**
 * 모바일 면허증 OCR + RIMS 검증.
 *
 * 흐름:
 *  1. 차량/고객 선택
 *  2. 면허증 카메라 촬영 (capture="environment")
 *  3. /api/ocr/extract (kind=license) — 면허번호·면허종류·소지자명·주민번호 추출
 *  4. /api/license/verify (RIMS 통신) — 면허 유효성 + 운전 가능 확인
 *  5. 결과 표시 + field_logs 저장
 */

import { useState, useMemo, useRef } from 'react';
import { fileToDataUrl } from '@/lib/image-compress';
import { useRouter } from 'next/navigation';
import {
  MagnifyingGlass, IdentificationCard, Camera,
  CheckCircle, XCircle, CircleNotch,
} from '@phosphor-icons/react';
import { MobileSaveFooter } from '@/components/mobile/save-footer';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useAuth } from '@/lib/use-auth';
import { addFieldLog } from '@/lib/firebase/field-logs-store';
import { toast } from '@/lib/toast';
// Phase 2.4 — 모바일 입력 4종 intake 평행 기록 (audit 일관성)
import { addIntakeItem, markIntakeCommitted } from '@/lib/firebase/intake-store';

type OcrResult = {
  license_no?: string;
  license_type?: string;
  holder_name?: string;
  resident_no?: string;
  birth_date?: string;
};

type VerifyResult = {
  ok?: boolean;
  status?: string;
  rtnCode?: string;
  rtnLabel?: string;
};

export default function MobileLicenseVerify() {
  const router = useRouter();
  const { contracts } = useContracts();
  const { user } = useAuth();
  const [step, setStep] = useState<'pick' | 'capture' | 'result'>('pick');
  const [contractId, setContractId] = useState('');
  const [q, setQ] = useState('');
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState<'idle' | 'ocr' | 'verify' | 'saving'>('idle');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const contract = contracts.find((x) => x.id === contractId);

  const matches = useMemo(() => {
    const query = q.trim().toLowerCase().replace(/[^\w가-힣]/g, '');
    if (!query) return [];
    return contracts
      .filter((c) => `${c.vehiclePlate ?? ''}${c.customerName ?? ''}`.toLowerCase().replace(/[^\w가-힣]/g, '').includes(query))
      .slice(0, 20);
  }, [contracts, q]);

  async function handleFile(file: File) {
    if (!file || !contract) return;
    setBusy('ocr');
    setOcr(null); setVerify(null);
    try {
      // FileReader 기반(스택오버플로 없음). 기존 btoa(String.fromCharCode(...spread))는
      // 수 MB 실기기 사진에서 바이트를 함수인자로 펼쳐 'Maximum call stack size exceeded'로 터졌음.
      const b64 = (await fileToDataUrl(file)).split(',')[1] ?? '';
      const res = await fetch('/api/ocr/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'license', imageBase64: b64, mimeType: file.type }),
      });
      if (!res.ok) throw new Error(`OCR ${res.status}`);
      const data = await res.json();
      const result: OcrResult = data?.fields ?? data ?? {};
      setOcr(result);

      if (result.license_no) {
        setBusy('verify');
        try {
          const vres = await fetch('/api/license/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              licenseNo: result.license_no,
              customerName: result.holder_name ?? contract.customerName ?? '',
              licenseType: result.license_type ?? '1종 보통',
              vehiclePlate: contract.vehiclePlate ?? '99임9999',
            }),
          });
          const vdata = await vres.json();
          setVerify(vdata as VerifyResult);
        } catch (e) {
          toast.warning(`RIMS 검증 건너뜀: ${(e as Error).message}`);
        }
      }
      setStep('result');
    } catch (e) {
      toast.error(`OCR 실패: ${(e as Error).message ?? String(e)}`);
    } finally {
      setBusy('idle');
    }
  }

  async function handleSave() {
    if (!contract || !ocr) return;
    setBusy('saving');
    const by = user?.email ?? undefined;
    // intake 평행 기록 (배치 1건)
    let intakeId: string | null = null;
    try {
      intakeId = await addIntakeItem({
        source: 'mobile-upload',
        raw: {
          mode: 'manual',
          kind: 'document-misc',
          payload: {
            scope: 'license-verify',
            contractId: contract.id,
            licenseNo: ocr.license_no,
            verifyStatus: verify?.status,
          },
        },
        createdBy: by,
      });
    } catch (e) { console.warn('[intake] license addIntakeItem 실패', e); }
    try {
      await addFieldLog(contract.id, {
        type: 'memo',
        body: `면허증 검증\n· 면허번호: ${ocr.license_no ?? '-'}\n· 종류: ${ocr.license_type ?? '-'}\n· 소지자: ${ocr.holder_name ?? '-'}\n· 결과: ${verify?.rtnLabel ?? verify?.status ?? '검증 미실행'}`,
        payload: {
          licenseNo: ocr.license_no,
          licenseType: ocr.license_type,
          verifyStatus: verify?.status,
          verifyRtnCode: verify?.rtnCode,
        },
        by,
      });
      if (intakeId) {
        try { await markIntakeCommitted(intakeId, [{ node: `field_logs/${contract.id}`, id: '(memo)' }], by); }
        catch (e) { console.warn('[intake] license markIntakeCommitted 실패', e); }
      }
      toast.success('면허 검증 결과 저장됨');
      router.push(`/m/contract/${contract.id}`);
    } catch (e) {
      toast.error(`저장 실패: ${(e as Error).message ?? String(e)}`);
    } finally {
      setBusy('idle');
    }
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <IdentificationCard size={22} weight="regular" />
          면허증 검증
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {matches.map((c) => (
              <button key={c.id} type="button" onClick={() => { setContractId(c.id); setStep('capture'); }} style={{
                padding: '14px 16px', background: 'var(--bg-card)',
                border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{c.vehiclePlate ?? '?'}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>{c.customerName ?? '?'}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'capture' && contract && (
        <>
          <ContractMini contract={contract} onChange={() => { setStep('pick'); setContractId(''); }} />
          <button
            type="button" onClick={() => fileRef.current?.click()} disabled={busy !== 'idle'}
            style={{
              padding: 24, background: 'var(--brand-bg)', color: 'var(--brand)',
              border: '2px dashed var(--brand)', borderRadius: 'var(--radius-lg)',
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            }}
          >
            {busy === 'ocr' ? <CircleNotch size={32} weight="duotone" className="spin" />
             : busy === 'verify' ? <CircleNotch size={32} weight="duotone" className="spin" />
             : <Camera size={32} weight="duotone" />}
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {busy === 'ocr' ? 'OCR 분석 중...'
               : busy === 'verify' ? 'RIMS 검증 중...'
               : '카메라 / 갤러리'}
            </div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>면허증 카드 정면이 잘 보이게</div>
            <input
              ref={fileRef} type="file" accept="image/*" capture="environment"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </button>
        </>
      )}

      {step === 'result' && contract && ocr && (
        <>
          <ContractMini contract={contract} onChange={() => { setStep('pick'); setContractId(''); setOcr(null); setVerify(null); }} />

          <section style={{
            padding: 14, background: 'var(--bg-card)',
            border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <IdentificationCard size={18} weight="duotone" />
              <strong style={{ fontSize: 13 }}>면허증 OCR</strong>
            </div>
            <Row label="면허번호" value={ocr.license_no} />
            <Row label="면허종류" value={ocr.license_type} />
            <Row label="소지자명" value={ocr.holder_name} />
            <Row label="주민번호" value={ocr.resident_no ? ocr.resident_no.slice(0, 6) + '-*******' : undefined} />
          </section>

          {verify && (
            <section style={{
              padding: 14,
              background: verify.ok ? 'var(--green-bg)' : 'var(--red-bg)',
              color: verify.ok ? 'var(--green-text)' : 'var(--red-text)',
              border: `1px solid ${verify.ok ? 'var(--green-border, rgba(22,101,52,0.25))' : 'var(--red-border)'}`,
              borderRadius: 'var(--radius-lg)',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {verify.ok ? <CheckCircle size={18} weight="duotone" /> : <XCircle size={18} weight="duotone" />}
                <strong style={{ fontSize: 13 }}>RIMS 검증 — {verify.ok ? '운전 가능' : '운전 불가'}</strong>
              </div>
              <div style={{ fontSize: 11, opacity: 0.9 }}>
                {verify.rtnLabel ?? verify.status ?? '-'}
              </div>
            </section>
          )}

        </>
      )}

      {/* 하단 [취소] [결과 저장] — 결과 확인 단계만 */}
      {step === 'result' && (
        <MobileSaveFooter
          prevLabel="취소"
          onPrev={() => router.back()}
          primaryLabel="결과 저장"
          primaryBusyLabel="저장 중..."
          primaryBusy={busy === 'saving'}
          onPrimary={handleSave}
        />
      )}
    </div>
  );
}

function ContractMini({ contract, onChange }: { contract: { vehiclePlate?: string; customerName?: string; vehicleModel?: string }; onChange: () => void }) {
  return (
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
      <button type="button" onClick={onChange} style={{
        fontSize: 11, color: 'var(--text-sub)', background: 'transparent',
        border: '1px solid var(--border)', padding: '4px 8px',
        borderRadius: 'var(--radius)', cursor: 'pointer',
      }}>변경</button>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12 }}>
      <span style={{ color: 'var(--text-sub)', fontSize: 11 }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
        {value || <span style={{ color: 'var(--text-weak)' }}>-</span>}
      </span>
    </div>
  );
}
