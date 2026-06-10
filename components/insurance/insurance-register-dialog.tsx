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
import { Plus, X, CircleNotch, CheckCircle, Warning, Upload } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useInsurances } from '@/lib/firebase/insurance-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { upsertVehicleFromPolicy } from '@/lib/entity-sync';
import { useCompanies } from '@/lib/firebase/companies-store';
import { buildInsurancePolicyFromOcr } from '@/lib/insurance-calc';
import { pdfFirstPageToJpegFile } from '@/lib/pdf-to-image';
import { runWithConcurrency } from '@/lib/parallel';
import { fileToDataUrl } from '@/lib/image-compress';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { toast } from '@/lib/toast';
import type { InsurancePolicy } from '@/lib/types';

const OCR_CONCURRENCY = 30;

type Status = 'pending' | 'done' | 'failed';
type WorkItem = InsurancePolicy & {
  _status: Status;
  _error?: string;
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
  const [items, setItems] = useState<WorkItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 수정 모드 — open + prefillPolicy 변경 시 표에 1행 prefill (수정 후 저장 시 update)
  useEffect(() => {
    if (open && prefillPolicy) {
      const matchedVehicle = vehicles.find((v) => v.id === prefillPolicy.vehicleId);
      setItems([{
        ...prefillPolicy,
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
    setItems([]);
    setBusy(false);
    setProgress(null);
  }

  function handleClose(o: boolean) {
    onOpenChange(o);
    if (!o) reset();
  }

  async function handleFiles(files: FileList | File[]): Promise<void> {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setBusy(true);

    // 보험증권은 1 파일 = 1 증권 — PDF 다중페이지 분리 안 함 (첫 페이지만 OCR)
    const expanded: File[] = arr;

    // 1) placeholder 한 번에 추가
    const dataUrls = await Promise.all(expanded.map(fileToDataUrl));
    const placeholders: WorkItem[] = expanded.map((f, i) => ({
      id: `ip-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      _status: 'pending' as Status,
      _fileDataUrl: dataUrls[i],
      _fileName: f.name,
    }));
    setItems((prev) => [...prev, ...placeholders]);
    setProgress({ done: 0, total: expanded.length });

    try {
      // 2) 동시성 제한 병렬 OCR
      await runWithConcurrency(expanded, OCR_CONCURRENCY, async (f, i) => {
        const id = placeholders[i].id;
        try {
          // PDF → JPEG 첫 페이지 (Gemini 안정성)
          let toSend = f;
          try { toSend = await pdfFirstPageToJpegFile(f); } catch { /* fallback */ }

          const fd = new FormData();
          fd.append('file', toSend);
          fd.append('type', 'insurance_policy');
          const user = getFirebaseAuth()?.currentUser;
          const idToken = user ? await user.getIdToken() : '';
          const res = await fetch('/api/ocr/extract', {
            method: 'POST',
            headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
            body: fd,
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'OCR 실패');
          const raw = json.extracted as Record<string, unknown>;

          // 차량 매칭 (carNumber → Vehicle.plate)
          const carNumber = String(raw.car_number ?? '').replace(/\s/g, '');
          const matchedVehicle = carNumber
            ? vehicles.find((v) => (v.plate ?? '').replace(/\s/g, '') === carNumber)
            : undefined;
          // 회사 매칭: 1) 매칭 차량의 company 우선 / 2) 차량 미매칭 시 보험증권 bizNo 로 직접 매칭
          let companyMatch = matchedVehicle?.company;
          if (!companyMatch) {
            const bizNoRaw = String(raw.biz_no ?? raw.bizNo ?? '').replace(/[^\d]/g, '');
            if (bizNoRaw) {
              const hit = companies.find((c) => {
                const corp = (c.corpRegNo ?? '').replace(/[^\d]/g, '');
                const biz = (c.bizRegNo ?? '').replace(/[^\d]/g, '');
                return (corp && corp === bizNoRaw) || (biz && biz === bizNoRaw);
              });
              companyMatch = hit?.code || hit?.name;
            }
          }

          const policy = buildInsurancePolicyFromOcr(raw, {
            id,
            vehicleId: vehicleId ?? matchedVehicle?.id,
            companyCode: companyMatch,
          });

          setItems((prev) => prev.map((p) => p.id === id ? {
            ...policy,
            _status: 'done' as Status,
            _matchedVehicleId: matchedVehicle?.id,
            _fileDataUrl: placeholders[i]._fileDataUrl,
            _fileName: placeholders[i]._fileName,
          } : p));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setItems((prev) => prev.map((p) => p.id === id ? { ...p, _status: 'failed' as Status, _error: msg } : p));
        } finally {
          setProgress((p) => p ? { done: p.done + 1, total: p.total } : null);
        }
      });
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(null), 1500);
    }
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
    handleClose(false);
  }

  return (
    <DialogRoot open={open} onOpenChange={handleClose}>
      <DialogContent title={prefillPolicy ? `보험증권 수정` : `보험증권 일괄 OCR 등록`} mode={prefillPolicy ? 'edit' : 'new'}>
        <DialogBody>
          {/* 드롭존 */}
          <label
            className={`dropzone ${dragging ? 'dragging' : ''} ${busy ? 'busy' : ''}`}
            style={{ display: 'block', cursor: busy ? 'wait' : 'pointer', padding: 20, marginBottom: 12 }}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); if (!busy) setDragging(true); }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!busy) setDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragging(false);
              if (!busy && e.dataTransfer.files.length > 0) void handleFiles(e.dataTransfer.files);
            }}
          >
            <input
              type="file"
              accept="image/*,.pdf"
              multiple
              style={{ display: 'none' }}
              disabled={busy}
              onChange={(e) => { if (e.target.files && e.target.files.length > 0) void handleFiles(e.target.files); }}
            />
            <div style={{ textAlign: 'center' }}>
              <Upload size={24} weight="duotone" style={{ color: 'var(--text-weak)' }} />
              <div style={{ fontSize: 13, marginTop: 8, fontWeight: 500 }}>보험증권 파일 여러 장 한 번에</div>
              <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 4 }}>
                PDF / JPG / PNG 다중 선택 · 드래그&드롭 OK — PDF 다중페이지는 자동 분리
                <br />Gemini OCR 병렬 처리 (동시 {OCR_CONCURRENCY}건). <strong>1회차 보험료 = 총보험료 − 2~N회차 합</strong> 자동 산출
              </div>
            </div>
          </label>

          {progress && (
            <div style={{ padding: '8px 12px', background: 'var(--brand-bg)', color: 'var(--brand)', fontSize: 12, borderRadius: 'var(--radius)', marginBottom: 8 }}>
              OCR 진행: {progress.done} / {progress.total}
            </div>
          )}

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
