'use client';

/**
 * 보험증권 일괄 OCR 등록 — v4 패턴 포팅.
 *
 *   1) 파일 N개 드롭/선택 (PDF·이미지 혼합 OK, PDF 다중 페이지는 페이지별 분리)
 *   2) 각 파일 placeholder 즉시 표시 + 병렬 OCR (concurrency 30)
 *   3) 결과 표:
 *        · 차량번호 / 보험사 / 만기일 / 1회차(자동산출) / 총보험료
 *        · 차량번호·회사 인라인 수정 (OCR 인식 실패 시)
 *        · 분납 6회차까지 자동 추출 → installments[]
 *   4) [모두 등록] — 등록 가능한 항목만 일괄 commit
 */

import { useEffect, useMemo, useState } from 'react';
import { Plus, X, CircleNotch, CheckCircle, Warning } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useInsurances } from '@/lib/firebase/insurance-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { upsertVehicleFromPolicy, findCompanyByRegNo } from '@/lib/entity-sync';
import { useCompanies } from '@/lib/firebase/companies-store';
import { buildInsurancePolicyFromOcr } from '@/lib/insurance-calc';
import { pdfFirstPageToJpegFile } from '@/lib/pdf-to-image';
import { fileToDataUrl } from '@/lib/image-compress';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';
import type { InsurancePolicy } from '@/lib/types';
// 공용 OCR 배치 훅 + 드롭존 (penalty / vehicle-reg 와 동일 패턴)
import { useOcrBatch, type OcrBatchItem } from '@/lib/use-ocr-batch';
import { OcrUploadStage } from '@/components/ui/ocr-upload-stage';

type WorkItem = Partial<InsurancePolicy> & OcrBatchItem & {
  _matchedVehicleId?: string;
  _fileDataUrl?: string;
  _fileName?: string;
};

const PLATE_RE = /^\d{2,3}[가-힣]\d{4}$/;
const fmt = (n: number | undefined): string => n == null ? '-' : `₩${n.toLocaleString('ko-KR')}`;

export function InsuranceRegisterDialog({
  open, onOpenChange, vehicleId, onSaved, prefillPolicy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vehicleId?: string;
  onSaved?: (policy: InsurancePolicy) => void;
  /** 수정 모드 — policy 객체로 표 prefill (insurance-detail dialog [수정] 호출) */
  prefillPolicy?: InsurancePolicy | null;
}) {
  const { policies, add: addPolicy, update: updatePolicy } = useInsurances();
  const { vehicles, add: addVehicle, update: updateVehicle } = useVehicles();
  const { companies } = useCompanies();
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ─── OCR 배치 (공용 훅) ───
  const ocr = useOcrBatch<WorkItem>({
    docType: 'insurance_policy',
    preconvertPdfToImage: pdfFirstPageToJpegFile,
    createPlaceholder: async (file, id) => {
      const dataUrl = await fileToDataUrl(file).catch(() => '');
      return {
        id,
        fileName: file.name,
        _status: 'pending',
        _fileName: file.name,
        _fileDataUrl: dataUrl,
      };
    },
    applyResult: (prev, raw) => {
      const carNumber = String(raw.car_number ?? '').replace(/\s/g, '');
      const matchedVehicle = carNumber
        ? vehicles.find((v) => (v.plate ?? '').replace(/\s/g, '') === carNumber)
        : undefined;
      let companyMatch = matchedVehicle?.company;
      if (!companyMatch) {
        const hit = findCompanyByRegNo(String(raw.biz_no ?? raw.bizNo ?? ''), companies);
        companyMatch = hit?.code || hit?.name;
      }
      const policy = buildInsurancePolicyFromOcr(raw, {
        id: prev.id,
        vehicleId: vehicleId ?? matchedVehicle?.id,
        companyCode: companyMatch,
      });
      return {
        ...policy,
        ...prev,                 // id/fileName/_fileName/_fileDataUrl 보존
        ...policy,               // policy 가 우선 (id 는 prev.id 와 동일)
        _matchedVehicleId: matchedVehicle?.id,
      };
    },
  });
  const items = ocr.items;
  const setItems = ocr.setItems;

  // 수정 모드 — open + prefillPolicy 변경 시 표에 1행 prefill (수정 후 저장 시 update)
  useEffect(() => {
    if (open && prefillPolicy) {
      const matchedVehicle = vehicles.find((v) => v.id === prefillPolicy.vehicleId);
      setItems([{
        ...prefillPolicy,
        fileName: prefillPolicy.fileName ?? prefillPolicy.id,
        _status: 'done',
        _matchedVehicleId: matchedVehicle?.id,
        _fileName: prefillPolicy.fileName,
        _fileDataUrl: prefillPolicy.fileUrl,
      }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillPolicy?.id]);

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // 기존 policyNo 중복 체크
  const existingPolicyNos = useMemo(() => new Set(policies.filter((p) => p.policyNo).map((p) => p.policyNo!)), [policies]);

  function reset() {
    ocr.reset();
    setBusy(false);
  }

  async function handleClose(o: boolean) {
    if (!o && items.length > 0) {
      if (!await showConfirm({ title: 'OCR 결과 또는 입력 중인 보험증권 정보가 있습니다. 저장하지 않고 닫을까요?' })) return;
    }
    onOpenChange(o);
    if (!o) reset();
  }

  function removeItem(id: string) {
    setItems((p) => p.filter((i) => i.id !== id));
  }

  function updateRow(id: string, patch: Partial<WorkItem>) {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, ...patch } : i));
  }

  const doneItems = items.filter((i) => i._status === 'done');
  const failedItems = items.filter((i) => i._status === 'failed');
  const registerableItems = doneItems.filter((i) =>
    i.carNumber && PLATE_RE.test(i.carNumber.replace(/\s/g, ''))
    && !(i.policyNo && existingPolicyNos.has(i.policyNo)),
  );
  const noPlateCount = doneItems.filter((i) => !i.carNumber || !PLATE_RE.test(i.carNumber.replace(/\s/g, ''))).length;
  const dupPolicyCount = doneItems.filter((i) => i.policyNo && existingPolicyNos.has(i.policyNo)).length;

  async function handleCommitAll(): Promise<void> {
    if (registerableItems.length === 0) {
      toast.info('등록 가능한 항목이 없습니다. 차량번호 누락 행은 직접 입력 후 시도하세요.');
      return;
    }
    setBusy(true);
    // Phase 2.3 — intake 평행 기록
    let intakeId: string | null = null;
    try {
      const { addIntakeItem } = await import('@/lib/firebase/intake-store');
      intakeId = await addIntakeItem({
        source: 'desktop-ocr-insurance',
        raw: { mode: 'manual', kind: 'insurance', payload: { itemCount: registerableItems.length } },
      });
    } catch (e) { console.warn('[intake] insurance addIntakeItem 실패', e); }
    let success = 0, fail = 0, vehicleCreated = 0;
    for (const item of registerableItems) {
      try {
        const { _status: _s, _error: _e, _matchedVehicleId: _m, _fileDataUrl: fileUrl, _fileName: fn, id: itemId, ...rest } = item;
        // 수정 모드 — prefillPolicy 와 같은 id면 update
        let savedPolicy: InsurancePolicy;
        if (prefillPolicy && itemId === prefillPolicy.id) {
          savedPolicy = { ...rest, id: itemId, fileName: fn, fileUrl };
          await updatePolicy(savedPolicy);
        } else {
          // OCR 원본 파일도 함께 저장 — 상세 다이얼로그에서 미리보기 + 다운로드 가능
          const newId = await addPolicy({ ...rest, fileName: fn, fileUrl, uploadedAt: new Date().toISOString() });
          savedPolicy = { ...rest, id: newId, fileName: fn, fileUrl };
        }
        success++;
        onSaved?.(savedPolicy);
        // SSoT: Vehicle 자동 upsert — 같은 plate 차량 없으면 자동 생성 + 보험 캐시 sync
        try {
          const sync = await upsertVehicleFromPolicy(savedPolicy, {
            vehicles, companies, addVehicle, updateVehicle,
          });
          if (sync?.created) vehicleCreated++;
        } catch (syncErr) {
          console.error('vehicle sync from policy failed', syncErr);
        }
      } catch (e) {
        console.error('insurance add failed', item.id, e);
        fail++;
      }
    }
    setBusy(false);
    if (success > 0) {
      const veh = vehicleCreated > 0 ? ` (차량 ${vehicleCreated}대 자동 등록)` : '';
      toast.success(`보험증권 ${success}건 등록${veh}${fail > 0 ? ` (실패 ${fail}건)` : ''}`);
    }
    if (fail > 0 && success === 0) toast.error(`등록 모두 실패 (${fail}건)`);
    // intake 결과 갱신
    if (intakeId) {
      try {
        const { markIntakeCommitted, setIntakeMatch } = await import('@/lib/firebase/intake-store');
        if (success > 0) {
          await markIntakeCommitted(intakeId, [{ node: 'insurance', id: '(batch)' }]);
        } else {
          await setIntakeMatch(intakeId, { confidence: 'none', reason: `등록 실패 ${fail}건` }, 'pending');
        }
      } catch (e) { console.warn('[intake] insurance batch end 실패', e); }
    }
    handleClose(false);
  }

  return (
    <DialogRoot open={open} onOpenChange={handleClose}>
      <DialogContent title={prefillPolicy ? `보험증권 수정` : `보험증권 일괄 OCR 등록`} mode={prefillPolicy ? 'edit' : 'new'}>
        <DialogBody>
          {/* 드롭존 — 공용 OcrUploadStage (penalty / vehicle-reg 와 동일) */}
          <div style={{ marginBottom: 12 }}>
            <OcrUploadStage
              progress={ocr.progress}
              busy={ocr.busy || busy}
              onFiles={ocr.handleFiles}
              idleTitle="보험증권 파일 여러 장 한 번에"
              idleSubtitle="PDF / JPG / PNG 다중 선택 — 1회차 보험료 = 총보험료 − 2~N회차 자동 산출"
              progressSubtitle="Gemini 가 보험증권을 읽고 있습니다"
            />
          </div>

          {items.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-sub)', marginBottom: 8 }}>
                <span>전체 <strong>{items.length}</strong></span>
                <span style={{ color: 'var(--green-text)' }}>완료 <strong>{doneItems.length}</strong></span>
                {failedItems.length > 0 && <span style={{ color: 'var(--red-text)' }}>실패 <strong>{failedItems.length}</strong></span>}
                <span style={{ marginLeft: 'auto' }}>등록 가능 <strong style={{ color: 'var(--brand)' }}>{registerableItems.length}</strong></span>
                {noPlateCount > 0 && <span style={{ color: 'var(--orange-text)' }}>차량번호 누락 <strong>{noPlateCount}</strong></span>}
                {dupPolicyCount > 0 && <span style={{ color: 'var(--orange-text)' }}>증권번호 중복 <strong>{dupPolicyCount}</strong></span>}
              </div>

              <div style={{ overflowX: 'auto', maxHeight: 420 }}>
              <table className="table" style={{ fontSize: 11, minWidth: 1800 }}>
                <thead>
                  <tr>
                    <th className="checkbox-col">
                      <input
                        type="checkbox"
                        checked={items.length > 0 && items.every((i) => selectedIds.has(i.id))}
                        ref={(el) => {
                          if (!el) return;
                          const some = items.some((i) => selectedIds.has(i.id));
                          const all = items.every((i) => selectedIds.has(i.id));
                          el.indeterminate = some && !all;
                        }}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(new Set(items.map((i) => i.id)));
                          else setSelectedIds(new Set());
                        }}
                        aria-label="전체 선택"
                      />
                    </th>
                    <th style={{ width: 24 }}></th>
                    <th style={{ width: 80 }}>회사</th>
                    <th style={{ width: 100 }}>차량번호</th>
                    <th style={{ minWidth: 130 }}>차명</th>
                    <th style={{ width: 110 }}>보험사</th>
                    <th style={{ width: 100 }}>피보험자</th>
                    <th className="mono" style={{ width: 90 }}>시작일</th>
                    <th className="mono" style={{ width: 90 }}>만기일</th>
                    <th style={{ width: 120 }}>운전가능연령</th>
                    <th className="num" style={{ width: 110, background: 'var(--brand-bg)' }}>1회차*</th>
                    <th className="num" style={{ width: 90 }}>2회차</th>
                    <th className="num" style={{ width: 90 }}>3회차</th>
                    <th className="num" style={{ width: 90 }}>4회차</th>
                    <th className="num" style={{ width: 90 }}>5회차</th>
                    <th className="num" style={{ width: 90 }}>6회차</th>
                    <th className="num" style={{ width: 110 }}>총보험료</th>
                    <th className="center" style={{ width: 80 }}>상태</th>
                    <th style={{ width: 30 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const plateOk = it.carNumber && PLATE_RE.test(it.carNumber.replace(/\s/g, ''));
                    const dup = it.policyNo && existingPolicyNos.has(it.policyNo);
                    const cycInst = (n: number) => it.installments?.find((x) => x.cycle === n);
                    const cyc = (n: number): number | undefined => cycInst(n)?.amount;
                    /** 일자만 짧게 MM-DD */
                    const shortDate = (ymd?: string) => (ymd && ymd.length >= 10 ? ymd.slice(5) : '');
                    const cycCell = (n: number) => {
                      const inst = cycInst(n);
                      if (!inst) return <span className="dim">-</span>;
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0, lineHeight: 1.1 }}>
                          <span style={{ fontSize: 9, color: 'var(--text-weak)' }}>{shortDate(inst.dueDate) || '-'}</span>
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(inst.amount)}</span>
                        </div>
                      );
                    };
                    return (
                      <tr key={it.id} className={selectedIds.has(it.id) ? 'selected-row' : undefined}>
                        <td className="checkbox-col" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedIds.has(it.id)} onChange={() => toggleRow(it.id)} aria-label="행 선택" />
                        </td>
                        <td className="center">
                          {it._status === 'pending' && <CircleNotch size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-weak)' }} />}
                          {it._status === 'done' && plateOk && !dup && <CheckCircle size={14} weight="duotone" style={{ color: 'var(--green-text)' }} />}
                          {it._status === 'done' && (!plateOk || dup) && <Warning size={14} weight="duotone" style={{ color: 'var(--orange-text)' }} />}
                          {it._status === 'failed' && <X size={14} weight="bold" style={{ color: 'var(--red-text)' }} />}
                        </td>
                        {/* 회사 매칭 */}
                        <td>
                          {it._status === 'done' ? (
                            it.companyCode
                              ? <span className="mono" style={{ background: 'var(--green-bg)', color: 'var(--green-text)', padding: '1px 6px', borderRadius: 'var(--radius-sm)', fontSize: 10 }}>{it.companyCode}</span>
                              : <span style={{ color: 'var(--orange-text)', fontSize: 10 }}>매칭 안됨</span>
                          ) : <span className="dim">-</span>}
                        </td>
                        <td>
                          {it._status === 'done' ? (
                            <input
                              type="text"
                              className={`input input-compact mono ${!plateOk ? 'input-error' : ''}`}
                              value={it.carNumber ?? ''}
                              onChange={(e) => updateRow(it.id, { carNumber: e.target.value })}
                              style={{ width: '100%', fontSize: 11 }}
                            />
                          ) : <span className="dim">{it._fileName}</span>}
                        </td>
                        <td className="dim">{it.carName || '-'}</td>
                        <td className="dim">{it.insurer || '-'}</td>
                        <td className="dim">{it.insured || '-'}</td>
                        <td className="mono dim">{it.startDate || '-'}</td>
                        <td className="mono dim">{it.endDate || '-'}</td>
                        <td className="dim">{it.driverAge || '-'}</td>
                        <td className="num mono" style={{ background: 'var(--brand-bg)', fontWeight: 600 }}>{cycCell(1)}</td>
                        <td className="num mono dim">{cycCell(2)}</td>
                        <td className="num mono dim">{cycCell(3)}</td>
                        <td className="num mono dim">{cycCell(4)}</td>
                        <td className="num mono dim">{cycCell(5)}</td>
                        <td className="num mono dim">{cycCell(6)}</td>
                        <td className="num mono">{fmt(it.totalPremium)}</td>
                        {/* 상태·삭제 */}
                        <td className="center" style={{ fontSize: 10 }}>
                          {it._status === 'pending' && <span className="dim">대기</span>}
                          {it._status === 'done' && dup && <span style={{ color: 'var(--orange-text)' }}>중복</span>}
                          {it._status === 'done' && !plateOk && <span style={{ color: 'var(--orange-text)' }}>번호누락</span>}
                          {it._status === 'done' && plateOk && !dup && <span style={{ color: 'var(--green-text)' }}>OK</span>}
                          {it._status === 'failed' && <span style={{ color: 'var(--red-text)' }} title={it._error}>실패</span>}
                        </td>
                        <td className="center">
                          <button
                            type="button"
                            onClick={() => removeItem(it.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-weak)' }}
                            title="제거"
                          >
                            <X size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <button className="btn" type="button">취소</button>
          </DialogClose>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy || registerableItems.length === 0}
            onClick={() => void handleCommitAll()}
          >
            <Plus size={14} weight="bold" /> 일괄 등록 ({registerableItems.length}건)
          </button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
