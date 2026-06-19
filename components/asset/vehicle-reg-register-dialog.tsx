'use client';

/**
 * 자동차등록증 일괄 OCR 등록 — 보험증권 dialog 와 동일 multi-file 패턴.
 *
 *   1) 파일 N개 드롭/선택 (PDF·이미지 혼합 OK, PDF 는 첫 페이지만 OCR)
 *   2) 각 파일 placeholder 즉시 표시 + 병렬 OCR (concurrency 30)
 *   3) 결과 표:
 *        · 차량번호 / 차명 / VIN / 제작연월 / 등록 상태
 *        · 차량번호 인라인 수정 (OCR 인식 실패 시)
 *        · 같은 차량번호 기존 차량 있으면 update, 없으면 신규
 *   4) [모두 등록] — 일괄 commit
 */

import { useEffect, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Plus, X, CircleNotch, CheckCircle, Warning, Upload, Keyboard, FileXls } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { MoneyInput } from '@/components/ui/money-input';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { syncContractStatusFromVehicle } from '@/lib/entity-sync';
import { pdfFirstPageToJpegFile } from '@/lib/pdf-to-image';
import { runWithConcurrency } from '@/lib/parallel';
import { fileToDataUrl } from '@/lib/image-compress';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { toast } from '@/lib/toast';
import type { Vehicle, CompanyCode } from '@/lib/types';
import { normPlate, findCompanyByRegNo } from '@/lib/entity-sync';
import { deriveVehicleStatusFromContract } from '@/lib/plate-rules';
import { displayCompanyName } from '@/lib/company-display';

const OCR_CONCURRENCY = 30;
const PLATE_RE = /^\d{2,3}[가-힣]\d{4}$/;

type Status = 'pending' | 'done' | 'failed';
type WorkItem = Partial<Vehicle> & {
  id: string;
  _status: Status;
  _error?: string;
  _existingId?: string;        // 기존 차량 매칭 시 update 대상
  _fileName?: string;
  _fileDataUrl?: string;       // OCR 원본 파일 data URL — 등록증 첨부 보존
};

export function VehicleRegRegisterDialog({
  open, onOpenChange, onSaved, prefillVehicle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: (v: Vehicle) => void;
  /** 수정 모드 — vehicle 객체로 수기 탭 prefill (자산 detail 의 [수정] 버튼이 호출) */
  prefillVehicle?: Vehicle | null;
}) {
  const { vehicles, add: addVehicle, update: updateVehicle } = useVehicles();
  const { companies } = useCompanies();
  const { contracts, update: updateContract } = useContracts();

  /** 법인등록번호로 회사 매칭 → company 코드 (공용 entity-sync 헬퍼 사용) */
  function matchCompanyByRegNo(rawRegNo?: string): string | undefined {
    const hit = findCompanyByRegNo(rawRegNo, companies);
    return hit?.code || hit?.name;
  }
  const [items, setItems] = useState<WorkItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<'ocr' | 'manual' | 'excel'>('ocr');
  // 개별 입력 폼 state
  const [manualDraft, setManualDraft] = useState<Partial<Vehicle>>({});

  // prefillVehicle 변경 시 수기 탭으로 강제 + manualDraft 채움
  useEffect(() => {
    if (open && prefillVehicle) {
      setManualDraft({ ...prefillVehicle });
      setMode('manual');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillVehicle?.id]);

  function reset() {
    setItems([]);
    setBusy(false);
    setProgress(null);
  }

  function handleClose(o: boolean) {
    if (!o) {
      // 미저장 OCR 결과·수동 입력 보존 가드
      const dirty = items.length > 0 || !!manualDraft.plate?.trim() || !!manualDraft.model?.trim();
      if (dirty && !window.confirm('OCR 결과 또는 입력 중인 차량 정보가 있습니다. 저장하지 않고 닫을까요?')) return;
    }
    onOpenChange(o);
    if (!o) reset();
  }

  async function handleFiles(files: FileList | File[]): Promise<void> {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setBusy(true);

    // 등록증은 1 파일 = 1 등록증. PDF 첫 페이지만 OCR (다중페이지 분리 X)
    const expanded: File[] = arr;
    const dataUrls = await Promise.all(expanded.map(fileToDataUrl));
    const placeholders: WorkItem[] = expanded.map((f, i) => ({
      id: `vr-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      _status: 'pending' as Status,
      _fileName: f.name,
      _fileDataUrl: dataUrls[i],
    }));
    setItems((prev) => [...prev, ...placeholders]);
    setProgress({ done: 0, total: expanded.length });

    try {
      await runWithConcurrency(expanded, OCR_CONCURRENCY, async (f, i) => {
        const id = placeholders[i].id;
        try {
          let toSend = f;
          try { toSend = await pdfFirstPageToJpegFile(f); } catch { /* fallback */ }

          const fd = new FormData();
          fd.append('file', toSend);
          fd.append('type', 'vehicle_reg');
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

          const s = (k: string): string | undefined => (raw[k] != null ? String(raw[k]) : undefined);
          const n = (k: string): number | undefined => {
            const v = raw[k];
            if (v == null) return undefined;
            const num = typeof v === 'number' ? v : Number(String(v).replace(/[,\s]/g, ''));
            return Number.isFinite(num) ? num : undefined;
          };

          const plate = normPlate(s('car_number'));
          const existing = plate ? vehicles.find((v) => normPlate(v.plate) === plate) : undefined;
          // 법인등록번호 (자등증 소유자) → 회사 자동 매칭
          const ownerReg = s('owner_biz_no');
          const matchedCompany = matchCompanyByRegNo(ownerReg);

          setItems((prev) => prev.map((p) => p.id === id ? {
            ...(existing ?? {}),
            id,
            company: (matchedCompany ?? existing?.company) as Partial<Vehicle>['company'],
            plate: plate || existing?.plate || s('car_number') || '',
            model: s('car_name') ?? existing?.model ?? '',
            vehicleType: s('category_hint') ?? existing?.vehicleType,
            vehicleUsage: s('usage_type') ?? existing?.vehicleUsage,
            vehicleFormat: s('type_number') ?? existing?.vehicleFormat,
            manufacturedDate: s('car_year_month') ?? existing?.manufacturedDate,
            firstRegisteredDate: s('first_registration_date') ?? existing?.firstRegisteredDate,
            vin: s('vin') ?? existing?.vin,
            engineFormat: s('engine_type') ?? existing?.engineFormat,
            garage: s('address') ?? existing?.garage,
            ownerName: s('owner_name') ?? existing?.ownerName,
            ownerRegNo: s('owner_biz_no') ?? existing?.ownerRegNo,
            specMgmtNo: s('approval_number') ?? existing?.specMgmtNo,
            vehicleLength: n('length_mm') ?? existing?.vehicleLength,
            vehicleWidth: n('width_mm') ?? existing?.vehicleWidth,
            vehicleHeight: n('height_mm') ?? existing?.vehicleHeight,
            totalWeight: n('gross_weight_kg') ?? existing?.totalWeight,
            seatingCapacity: n('seats') ?? existing?.seatingCapacity,
            displacementCc: n('displacement') ?? existing?.displacementCc,
            fuelType: s('fuel_type') ?? existing?.fuelType,
            purchasePrice: n('acquisition_price') ?? existing?.purchasePrice,
            _status: 'done' as Status,
            _existingId: existing?.id,
            _fileName: placeholders[i]._fileName,
            _fileDataUrl: placeholders[i]._fileDataUrl,
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
    i.plate && PLATE_RE.test(normPlate(i.plate)),
  );
  const noPlateCount = doneItems.filter((i) => !i.plate || !PLATE_RE.test(normPlate(i.plate))).length;

  async function handleCommitAll(): Promise<void> {
    if (registerableItems.length === 0) {
      toast.info('등록 가능한 항목이 없습니다. 차량번호 누락 행은 직접 입력 후 시도하세요.');
      return;
    }
    setBusy(true);
    // Phase 2.3 — intake 평행 기록 (배치)
    let intakeId: string | null = null;
    try {
      const { addIntakeItem } = await import('@/lib/firebase/intake-store');
      const fbAuth = getFirebaseAuth();
      const by = fbAuth?.currentUser?.email ?? undefined;
      intakeId = await addIntakeItem({
        source: 'desktop-ocr-vehicle',
        raw: { mode: 'manual', kind: 'vehicle', payload: { itemCount: registerableItems.length } },
        createdBy: by,
      });
    } catch (e) { console.warn('[intake] vehicle-reg addIntakeItem 실패', e); }
    let updated = 0, added = 0, fail = 0;
    for (const item of registerableItems) {
      try {
        const { _status: _s, _error: _e, _existingId, _fileName: _fn, _fileDataUrl: _fileUrl, id: _id, ...rest } = item;
        // OCR 원본 base64 는 vehicle 레코드에 저장 X — vehicles 노드 가벼움 (옛 방식 회복)
        // 첨부 미리보기 필요 시 별도 vehicle_attachments 노드로 분리 작업 필요 (오픈 후)
        if (_existingId) {
          const existing = vehicles.find((v) => v.id === _existingId);
          if (existing) {
            const merged = { ...existing, ...rest, id: existing.id } as Vehicle;
            await updateVehicle(merged);
            if (merged.status !== existing.status) {
              await syncContractStatusFromVehicle(merged, contracts, updateContract);
            }
            updated++;
            onSaved?.(merged);
          }
        } else {
          const newVehicle: Omit<Vehicle, 'id'> = {
            plate: normPlate(rest.plate ?? ''),
            model: rest.model ?? '',
            company: (rest.company ?? '기타') as CompanyCode,
            // 정상 plate → 휴차 / 임판 → 등록대기 / 빈 → 구매대기 (사용자 명시 도메인 룰)
            status: rest.status ?? deriveVehicleStatusFromContract(rest.plate),
            createdAt: new Date().toISOString(),
            ...rest,
          } as Omit<Vehicle, 'id'>;
          const newId = await addVehicle(newVehicle);
          added++;
          onSaved?.({ ...(newVehicle as Vehicle), id: newId });
        }
      } catch (e) {
        console.error('vehicle add/update failed', item.id, e);
        fail++;
      }
    }
    setBusy(false);
    const msg = [
      added > 0 && `신규 ${added}건`,
      updated > 0 && `업데이트 ${updated}건`,
      fail > 0 && `실패 ${fail}건`,
    ].filter(Boolean).join(' · ');
    if (added + updated > 0) toast.success(`자산 ${msg}`);
    else if (fail > 0) toast.error(`등록 모두 실패 (${fail}건)`);
    // intake 결과 갱신
    if (intakeId) {
      try {
        const { markIntakeCommitted, setIntakeMatch } = await import('@/lib/firebase/intake-store');
        const fbAuth = getFirebaseAuth();
        const by = fbAuth?.currentUser?.email ?? undefined;
        if (added + updated > 0) {
          await markIntakeCommitted(intakeId, [{ node: 'vehicles', id: '(batch)' }], by);
        } else {
          await setIntakeMatch(intakeId, { confidence: 'none', reason: '등록 0건' }, 'pending', by);
        }
      } catch (e) { console.warn('[intake] vehicle-reg batch end 실패', e); }
    }
    handleClose(false);
  }

  async function handleManualSave(): Promise<void> {
    const plate = normPlate(manualDraft.plate);
    if (!plate || !PLATE_RE.test(plate)) { toast.error('차량번호 필수 (예: 01도9893)'); return; }
    setBusy(true);
    try {
      const existing = vehicles.find((v) => normPlate(v.plate) === plate);
      if (existing) {
        const merged: Vehicle = { ...existing, ...manualDraft, id: existing.id } as Vehicle;
        await updateVehicle(merged);
        if (merged.status !== existing.status) {
          await syncContractStatusFromVehicle(merged, contracts, updateContract);
        }
        toast.success(`자산 업데이트 — ${manualDraft.plate}`);
        onSaved?.(merged);
      } else {
        const newVehicle: Omit<Vehicle, 'id'> = {
          plate: manualDraft.plate ?? '',
          model: manualDraft.model ?? '',
          company: (manualDraft.company ?? '기타') as CompanyCode,
          status: manualDraft.status ?? '등록대기',
          createdAt: new Date().toISOString(),
          ...manualDraft,
        } as Omit<Vehicle, 'id'>;
        const newId = await addVehicle(newVehicle);
        toast.success(`신규 자산 등록 — ${manualDraft.plate}`);
        onSaved?.({ ...(newVehicle as Vehicle), id: newId });
      }
      setManualDraft({});
      handleClose(false);
    } catch (e) {
      toast.error(`등록 실패: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  const set = <K extends keyof Vehicle>(k: K, v: Vehicle[K] | undefined): void => {
    setManualDraft((prev) => ({ ...prev, [k]: v }));
  };

  return (
    <DialogRoot open={open} onOpenChange={handleClose}>
      <DialogContent title={prefillVehicle ? `자동차등록증 수정` : `자동차등록증 등록`} mode={prefillVehicle ? 'edit' : 'new'}>
        <DialogBody>
          <Tabs.Root value={mode} onValueChange={(v) => setMode(v as 'ocr' | 'manual' | 'excel')}>
            <Tabs.List className="tabs-list" style={{ marginBottom: 10 }}>
              <Tabs.Trigger value="ocr" className="tabs-trigger"><Upload size={12} /> OCR 일괄</Tabs.Trigger>
              <Tabs.Trigger value="manual" className="tabs-trigger"><Keyboard size={12} /> 개별 입력</Tabs.Trigger>
              <Tabs.Trigger value="excel" className="tabs-trigger"><FileXls size={12} /> 엑셀 일괄</Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="ocr">
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
              {progress && progress.done < progress.total ? (
                <>
                  <CircleNotch size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--brand)' }} />
                  <div style={{ fontSize: 13, marginTop: 8, fontWeight: 500, color: 'var(--brand)' }}>
                    OCR 진행 중… <strong>{progress.done}</strong> / {progress.total}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 4 }}>
                    Gemini 가 자동차등록증을 읽고 있습니다 (동시 {OCR_CONCURRENCY}건)
                  </div>
                </>
              ) : progress && progress.done >= progress.total && progress.total > 0 ? (
                <>
                  <CheckCircle size={24} weight="duotone" style={{ color: 'var(--green-text)' }} />
                  <div style={{ fontSize: 13, marginTop: 8, fontWeight: 500, color: 'var(--green-text)' }}>
                    OCR 완료 <strong>{progress.done}</strong> / {progress.total}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 4 }}>
                    아래 표에서 확인 후 [모두 등록] 클릭
                  </div>
                </>
              ) : (
                <>
                  <Upload size={24} weight="duotone" style={{ color: 'var(--text-weak)' }} />
                  <div style={{ fontSize: 13, marginTop: 8, fontWeight: 500 }}>자동차등록증 파일 여러 장 한 번에</div>
                  <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 4 }}>
                    PDF / JPG / PNG 다중 선택 · 드래그&드롭 OK — Gemini OCR 병렬 처리 (동시 {OCR_CONCURRENCY}건)
                    <br />같은 차량번호 기존 자산 있으면 <strong>업데이트</strong>, 없으면 <strong>신규 등록</strong>
                  </div>
                </>
              )}
            </div>
          </label>

          {items.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-sub)', marginBottom: 8 }}>
                <span>전체 <strong>{items.length}</strong></span>
                <span style={{ color: 'var(--green-text)' }}>완료 <strong>{doneItems.length}</strong></span>
                {failedItems.length > 0 && <span style={{ color: 'var(--red-text)' }}>실패 <strong>{failedItems.length}</strong></span>}
                <span style={{ marginLeft: 'auto' }}>등록 가능 <strong style={{ color: 'var(--brand)' }}>{registerableItems.length}</strong></span>
                {noPlateCount > 0 && <span style={{ color: 'var(--orange-text)' }}>번호누락 <strong>{noPlateCount}</strong></span>}
              </div>

              <div style={{ overflowX: 'auto', maxHeight: 420 }}>
              <table className="table" style={{ fontSize: 11, minWidth: 2800 }}>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}></th>
                    {/* 회사·기본 */}
                    <th style={{ width: 90 }}>회사</th>
                    <th style={{ width: 100 }}>차량번호</th>
                    <th style={{ minWidth: 120 }}>차명</th>
                    {/* 등록증 본문 */}
                    <th style={{ width: 100 }}>차종</th>
                    <th style={{ width: 80 }}>용도</th>
                    <th className="mono" style={{ width: 120 }}>형식</th>
                    <th className="mono" style={{ width: 90 }}>제작연월</th>
                    <th className="mono" style={{ width: 90 }}>최초등록</th>
                    <th className="mono" style={{ width: 170 }}>VIN(차대번호)</th>
                    <th className="mono" style={{ width: 110 }}>원동기형식</th>
                    <th style={{ minWidth: 130 }}>사용본거지</th>
                    <th style={{ width: 100 }}>소유자</th>
                    <th className="mono" style={{ width: 120 }}>법인등록번호</th>
                    {/* 제원 */}
                    <th className="mono" style={{ width: 110 }}>제원관리번호</th>
                    <th className="num" style={{ width: 80 }}>길이(mm)</th>
                    <th className="num" style={{ width: 80 }}>너비(mm)</th>
                    <th className="num" style={{ width: 80 }}>높이(mm)</th>
                    <th className="num" style={{ width: 90 }}>총중량(kg)</th>
                    <th className="num" style={{ width: 60 }}>승차</th>
                    <th className="num" style={{ width: 80 }}>배기량</th>
                    <th style={{ width: 70 }}>연료</th>
                    <th className="num" style={{ width: 100 }}>출고가</th>
                    <th className="center" style={{ width: 80 }}>상태</th>
                    <th style={{ width: 30 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const plateOk = it.plate && PLATE_RE.test(normPlate(it.plate));
                    return (
                      <tr key={it.id}>
                        <td className="center">
                          {it._status === 'pending' && <CircleNotch size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-weak)' }} />}
                          {it._status === 'done' && plateOk && <CheckCircle size={14} weight="duotone" style={{ color: 'var(--green-text)' }} />}
                          {it._status === 'done' && !plateOk && <Warning size={14} weight="duotone" style={{ color: 'var(--orange-text)' }} />}
                          {it._status === 'failed' && <X size={14} weight="bold" style={{ color: 'var(--red-text)' }} />}
                        </td>
                        {/* 회사 매칭 — 코드 아닌 표기명(displayName ?? 회사명) 표시 */}
                        <td>
                          {it._status === 'done' ? (
                            it.company
                              ? <span style={{ background: 'var(--green-bg)', color: 'var(--green-text)', padding: '1px 6px', borderRadius: 'var(--radius-sm)', fontSize: 10 }}>{displayCompanyName(it.company, companies)}</span>
                              : <span style={{ color: 'var(--orange-text)', fontSize: 10 }}>매칭 안됨</span>
                          ) : <span className="dim">-</span>}
                        </td>
                        <td>
                          {it._status === 'done' ? (
                            <input
                              type="text"
                              className={`input input-compact mono ${!plateOk ? 'input-error' : ''}`}
                              value={it.plate ?? ''}
                              onChange={(e) => updateRow(it.id, { plate: e.target.value })}
                              style={{ width: '100%', fontSize: 11 }}
                            />
                          ) : <span className="dim">{it._fileName}</span>}
                        </td>
                        <td className="dim">{it.model || '-'}</td>
                        <td className="dim">{it.vehicleType || '-'}</td>
                        <td className="dim">{it.vehicleUsage || '-'}</td>
                        <td className="mono dim">{it.vehicleFormat || '-'}</td>
                        <td className="mono dim">{it.manufacturedDate || '-'}</td>
                        <td className="mono dim">{it.firstRegisteredDate || '-'}</td>
                        <td className="mono dim">{it.vin || '-'}</td>
                        <td className="mono dim">{it.engineFormat || '-'}</td>
                        <td className="dim" style={{ fontSize: 10 }}>{it.garage || '-'}</td>
                        <td className="dim">{it.ownerName || '-'}</td>
                        <td className="mono dim">{it.ownerRegNo || '-'}</td>
                        <td className="mono dim">{it.specMgmtNo || '-'}</td>
                        <td className="num mono dim">{it.vehicleLength?.toLocaleString() ?? '-'}</td>
                        <td className="num mono dim">{it.vehicleWidth?.toLocaleString() ?? '-'}</td>
                        <td className="num mono dim">{it.vehicleHeight?.toLocaleString() ?? '-'}</td>
                        <td className="num mono dim">{it.totalWeight?.toLocaleString() ?? '-'}</td>
                        <td className="num mono dim">{it.seatingCapacity ?? '-'}</td>
                        <td className="num mono dim">{it.displacementCc ? `${it.displacementCc}cc` : '-'}</td>
                        <td className="dim">{it.fuelType || '-'}</td>
                        <td className="num mono dim">{it.purchasePrice ? `₩${it.purchasePrice.toLocaleString()}` : '-'}</td>
                        <td className="center" style={{ fontSize: 10 }}>
                          {it._status === 'pending' && <span className="dim">대기</span>}
                          {it._status === 'done' && !plateOk && <span style={{ color: 'var(--orange-text)' }}>번호누락</span>}
                          {it._status === 'done' && plateOk && it._existingId && <span style={{ color: 'var(--blue-text)' }}>업데이트</span>}
                          {it._status === 'done' && plateOk && !it._existingId && <span style={{ color: 'var(--green-text)' }}>신규</span>}
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
            </Tabs.Content>

            <Tabs.Content value="manual">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 4 }}>
                {/* 기본 정보 */}
                <section className="detail-section">
                  <div className="detail-section-header"><span className="title">기본 정보</span></div>
                  <div className="detail-section-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <ManualField label="차량번호" required value={manualDraft.plate} onChange={(v) => set('plate', v ?? '')} mono placeholder="01도9893" />
                    <ManualField label="회사" value={manualDraft.company} onChange={(v) => set('company', v as CompanyCode | undefined)} placeholder="CP01" />
                    <ManualField label="상태" value={manualDraft.status} onChange={(v) => set('status', v as Vehicle['status'] | undefined)} placeholder="등록대기/운행/매각" />
                    <ManualField label="소유자명" value={manualDraft.ownerName} onChange={(v) => set('ownerName', v)} />
                    <ManualField label="법인등록번호" value={manualDraft.ownerRegNo} onChange={(v) => set('ownerRegNo', v)} mono />
                    <ManualField label="사용본거지" value={manualDraft.garage} onChange={(v) => set('garage', v)} />
                  </div>
                </section>

                {/* 제조사 스펙 */}
                <section className="detail-section">
                  <div className="detail-section-header"><span className="title">제조사 스펙 (5단 분류)</span></div>
                  <div className="detail-section-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <ManualField label="제조사" value={manualDraft.vehicleMaker} onChange={(v) => set('vehicleMaker', v)} placeholder="현대·기아·BMW" />
                    <ManualField label="모델" value={manualDraft.vehicleModelLine} onChange={(v) => set('vehicleModelLine', v)} placeholder="그랜저·K5" />
                    <ManualField label="세부모델" value={manualDraft.vehicleSubModel} onChange={(v) => set('vehicleSubModel', v)} placeholder="더 뉴 그랜저 GN7" />
                    <ManualField label="모델구분" value={manualDraft.vehicleVariant} onChange={(v) => set('vehicleVariant', v)} placeholder="가솔린 3.5 AWD" />
                    <ManualField label="트림" value={manualDraft.vehicleTrim} onChange={(v) => set('vehicleTrim', v)} placeholder="캘리그래피" />
                    <ManualField label="옵션" value={manualDraft.vehicleOptions} onChange={(v) => set('vehicleOptions', v)} placeholder="자유 입력" />
                    <ManualField label="외부 색상" value={manualDraft.exteriorColor} onChange={(v) => set('exteriorColor', v)} />
                    <ManualField label="내부 색상" value={manualDraft.interiorColor} onChange={(v) => set('interiorColor', v)} />
                  </div>
                </section>

                {/* 등록증 본문 ① ~ ⑩ */}
                <section className="detail-section">
                  <div className="detail-section-header"><span className="title">등록증 본문 (① ~ ⑩)</span></div>
                  <div className="detail-section-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <ManualField label="① 차종 (vehicleType)" value={manualDraft.vehicleType} onChange={(v) => set('vehicleType', v)} placeholder="중형 승용 등" />
                    <ManualField label="③ 용도" value={manualDraft.vehicleUsage} onChange={(v) => set('vehicleUsage', v)} placeholder="자가용/영업용" />
                    <ManualField label="④ 차명" value={manualDraft.model} onChange={(v) => set('model', v ?? '')} placeholder="K5·EQ900" />
                    <ManualField label="⑤ 형식" value={manualDraft.vehicleFormat} onChange={(v) => set('vehicleFormat', v)} mono />
                    <ManualField label="⑤ 제작연월" value={manualDraft.manufacturedDate} onChange={(v) => set('manufacturedDate', v)} mono placeholder="YYYY-MM" />
                    <ManualField label="⑥ 차대번호 (VIN)" value={manualDraft.vin} onChange={(v) => set('vin', v)} mono />
                    <ManualField label="⑦ 원동기형식" value={manualDraft.engineFormat} onChange={(v) => set('engineFormat', v)} mono />
                    <ManualField label="최초등록일" value={manualDraft.firstRegisteredDate} onChange={(v) => set('firstRegisteredDate', v)} mono placeholder="YYYY-MM-DD" />
                  </div>
                </section>

                {/* 제원 ⑪ ~ ㉔ */}
                <section className="detail-section">
                  <div className="detail-section-header"><span className="title">제원 (⑪ ~ ㉔)</span></div>
                  <div className="detail-section-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <ManualField label="⑪ 제원관리번호" value={manualDraft.specMgmtNo} onChange={(v) => set('specMgmtNo', v)} mono />
                    <NumberField label="⑫ 길이(mm)" value={manualDraft.vehicleLength} onChange={(v) => set('vehicleLength', v)} />
                    <NumberField label="⑬ 너비(mm)" value={manualDraft.vehicleWidth} onChange={(v) => set('vehicleWidth', v)} />
                    <NumberField label="⑭ 높이(mm)" value={manualDraft.vehicleHeight} onChange={(v) => set('vehicleHeight', v)} />
                    <NumberField label="⑮ 총중량(kg)" value={manualDraft.totalWeight} onChange={(v) => set('totalWeight', v)} />
                    <NumberField label="⑯ 승차정원" value={manualDraft.seatingCapacity} onChange={(v) => set('seatingCapacity', v)} />
                    <NumberField label="⑱ 배기량(cc)" value={manualDraft.displacementCc} onChange={(v) => set('displacementCc', v)} />
                    <ManualField label="㉑ 연료" value={manualDraft.fuelType} onChange={(v) => set('fuelType', v)} />
                    <div className="detail-field">
                      <label className="detail-field-label">출고가격(원)</label>
                      <MoneyInput value={manualDraft.purchasePrice} onChange={(v) => set('purchasePrice', v)} />
                    </div>
                  </div>
                </section>
              </div>
            </Tabs.Content>

            <Tabs.Content value="excel">
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-sub)', fontSize: 12 }}>
                엑셀 일괄 등록은 <strong>운영현황 → [+ 신규 등록] → 차량</strong> 메뉴 사용 (스냅샷 템플릿 기준).
                <br />여기는 단일 차량 신규 등록·기존 차량 update 만.
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <button className="btn" type="button">취소</button>
          </DialogClose>
          {mode === 'ocr' && (
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy || registerableItems.length === 0}
              onClick={() => void handleCommitAll()}
            >
              <Plus size={14} weight="bold" /> 일괄 등록 ({registerableItems.length}건)
            </button>
          )}
          {mode === 'manual' && (
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy || !manualDraft.plate}
              onClick={() => void handleManualSave()}
            >
              <Plus size={14} weight="bold" /> 등록
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

function ManualField({ label, value, onChange, mono, placeholder, required }: {
  label: string; value: string | undefined; onChange: (v: string | undefined) => void; mono?: boolean; placeholder?: string; required?: boolean;
}) {
  return (
    <div className="detail-field">
      <label className="detail-field-label">
        {label}{required && <span style={{ color: 'var(--red-text)', marginLeft: 2 }}>*</span>}
      </label>
      <input
        type="text"
        className={`input input-compact ${mono ? 'mono' : ''}`}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </div>
  );
}

function NumberField({ label, value, onChange }: {
  label: string; value: number | undefined; onChange: (v: number | undefined) => void;
}) {
  return (
    <div className="detail-field">
      <label className="detail-field-label">{label}</label>
      <input
        type="text"
        className="input input-compact mono"
        value={value != null ? String(value) : ''}
        onChange={(e) => {
          const v = e.target.value.replace(/[,\s]/g, '');
          const n = v ? Number(v) : undefined;
          onChange(Number.isFinite(n ?? NaN) ? n : undefined);
        }}
      />
    </div>
  );
}
