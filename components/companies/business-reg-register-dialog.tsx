'use client';

/**
 * 사업자등록증 일괄 OCR/수기 법인 등록 — 자동차등록증 dialog 패턴.
 *
 *   1) OCR 탭: 파일 N개 드롭/선택 → 병렬 OCR (concurrency 10)
 *   2) 수기 탭: 단일 폼 직접 입력
 *   3) 결과 표: 회사명 / 사업자번호 / 법인번호 / 대표자 / 매칭 / 상태
 *      · 같은 사업자번호·법인번호 기존 회사 있으면 update, 없으면 신규
 *   4) [모두 등록] — 일괄 commit
 */

import { useEffect, useMemo, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Plus, X, CircleNotch, CheckCircle, Warning, Upload, Keyboard } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { reassignVehiclesToCompany } from '@/lib/entity-sync';
import { fileToDataUrl } from '@/lib/image-compress';
import { pdfFirstPageToJpegFile } from '@/lib/pdf-to-image';
import { audit } from '@/lib/firebase/audit-store';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';
import type { Company, CompanyDocument } from '@/lib/types';
// 공용 OCR 배치 훅 + 드롭존 (penalty/vehicle-reg/insurance 와 동일 패턴)
import { useOcrBatch, type OcrBatchItem } from '@/lib/use-ocr-batch';
import { OcrUploadStage } from '@/components/ui/ocr-upload-stage';

type WorkItem = Partial<Company> & OcrBatchItem & {
  _existingId?: string;
  _fileName?: string;
  _fileDataUrl?: string;
};

const normReg = (s?: string) => (s ?? '').replace(/[-\s]/g, '');

export function BusinessRegRegisterDialog({
  open, onOpenChange, onSaved, editId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: (c: Company) => void;
  /** 수정 모드 — 회사 id. 있으면 수기 탭으로 강제 진입하고 기존 값으로 prefill */
  editId?: string | null;
}) {
  const { companies, add: addCompany, update: updateCompany } = useCompanies();
  const { vehicles, update: updateVehicle } = useVehicles();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'ocr' | 'manual'>('ocr');
  const [manualDraft, setManualDraft] = useState<Partial<Company>>({});

  // ─── OCR 배치 (공용 훅) ───
  const ocr = useOcrBatch<WorkItem>({
    docType: 'business_reg',
    concurrency: 10,
    preconvertPdfToImage: pdfFirstPageToJpegFile,
    createPlaceholder: async (file, id) => {
      const dataUrl = await fileToDataUrl(file).catch(() => '');
      return {
        id,
        fileName: file.name,
        _status: 'pending',
        _fileName: file.name,
        _fileDataUrl: dataUrl || undefined,
      };
    },
    applyResult: (prev, raw) => {
      const name = (String(raw.partner_name ?? '')).trim();
      const bizRegNo = (String(raw.biz_no ?? '')).replace(/[^\d-]/g, '');
      const corpRegNo = (String(raw.corp_no ?? '')).replace(/[^\d-]/g, '');
      const existing = companies.find((c) => {
        if (bizRegNo && normReg(c.bizRegNo) === normReg(bizRegNo)) return true;
        if (corpRegNo && normReg(c.corpRegNo) === normReg(corpRegNo)) return true;
        return false;
      });
      return {
        ...prev,
        name: name || existing?.name || '',
        bizRegNo: bizRegNo || existing?.bizRegNo,
        corpRegNo: corpRegNo || existing?.corpRegNo,
        ceo: (raw.ceo as string | null) ?? existing?.ceo,
        address: (raw.address as string | null) ?? existing?.address,
        bizType: (raw.industry as string | null) ?? existing?.bizType,
        bizItem: (raw.category as string | null) ?? existing?.bizItem,
        partnerKind: existing?.partnerKind ?? '기타',
        _existingId: existing?.id,
      };
    },
  });
  const items = ocr.items;
  const setItems = ocr.setItems;

  // 수정 모드 — open + editId 변경 시 prefill + 수기 탭 강제
  const editTarget = editId ? companies.find((c) => c.id === editId) ?? null : null;
  useEffect(() => {
    if (open && editTarget) {
      // prefill 시 등록번호 정규화 — 옛 데이터에 invisible 공백 있어도 깔끔하게
      setManualDraft({
        ...editTarget,
        bizRegNo: editTarget.bizRegNo?.replace(/[^\d-]/g, ''),
        corpRegNo: editTarget.corpRegNo?.replace(/[^\d-]/g, ''),
        contactPhone: editTarget.contactPhone?.replace(/[^\d-]/g, ''),
      });
      setMode('manual');
    }
  // editTarget?.id 만 watch (재렌더링 방지)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editTarget?.id]);

  function reset() {
    ocr.reset();
    setBusy(false);
    setManualDraft({});
    setMode('ocr');
  }
  async function handleClose(o: boolean) {
    if (!o && items.length > 0) {
      if (!await showConfirm({ title: 'OCR 결과 또는 입력 중인 법인 정보가 있습니다. 저장하지 않고 닫을까요?' })) return;
    }
    if (!o) reset();
    onOpenChange(o);
  }

  // 기존 사업자/법인번호 set — 중복 검사
  const existingRegNos = useMemo(() => {
    const s = new Set<string>();
    for (const c of companies) {
      if (c.bizRegNo) s.add(normReg(c.bizRegNo));
      if (c.corpRegNo) s.add(normReg(c.corpRegNo));
    }
    return s;
  }, [companies]);

  function updateRow(id: string, patch: Partial<WorkItem>) {
    setItems((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p));
  }
  function removeItem(id: string) {
    setItems((prev) => prev.filter((p) => p.id !== id));
  }

  const doneItems = items.filter((i) => i._status === 'done');
  const registerable = doneItems.filter((i) => (i.name ?? '').trim().length > 0);

  async function handleCommitAll(): Promise<void> {
    if (registerable.length === 0) {
      toast.info('등록 가능한 항목이 없습니다. 회사명 누락 행은 직접 입력 후 시도하세요.');
      return;
    }
    setBusy(true);
    // Phase 2.3 — intake 평행 기록
    let intakeId: string | null = null;
    try {
      const { addIntakeItem } = await import('@/lib/firebase/intake-store');
      intakeId = await addIntakeItem({
        source: 'desktop-ocr-business',
        raw: { mode: 'manual', kind: 'company', payload: { itemCount: registerable.length } },
      });
    } catch (e) { console.warn('[intake] business-reg addIntakeItem 실패', e); }
    let updated = 0, added = 0, fail = 0;
    for (const item of registerable) {
      try {
        const { _status: _s, _error: _e, _existingId, _fileName: fn, _fileDataUrl: fileUrl, id: _id, ...rest } = item;
        const now = new Date().toISOString();
        // OCR 원본 파일 첨부 — documents 에 사업자등록증 한 줄 추가 (보험증권 패턴)
        const newDoc: CompanyDocument | null = fileUrl
          ? {
              id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              title: '사업자등록증',
              fileUrl,
              fileName: fn,
              uploadedAt: now,
            }
          : null;
        if (_existingId) {
          const existing = companies.find((c) => c.id === _existingId);
          if (existing) {
            const merged: Company = {
              ...existing,
              ...rest,
              id: existing.id,
              documents: newDoc ? [...(existing.documents ?? []), newDoc] : (existing.documents ?? []),
            } as Company;
            await updateCompany(merged);
            void audit.update('company', merged.id, `법인 OCR 수정 — ${merged.name}`);
            updated++;
            onSaved?.(merged);
          }
        } else {
          const payload: Omit<Company, 'id'> = {
            code: '',
            name: rest.name ?? '',
            bizRegNo: rest.bizRegNo,
            corpRegNo: rest.corpRegNo,
            ceo: rest.ceo,
            address: rest.address,
            bizType: rest.bizType,
            bizItem: rest.bizItem,
            accounts: [],
            cards: [],
            locations: [],
            documents: newDoc ? [newDoc] : [],
            notes: '',
            createdAt: now,
          };
          const newId = await addCompany(payload);
          void audit.create('company', newId, `법인 OCR 등록 — ${payload.name}`);
          added++;
          onSaved?.({ ...(payload as Company), id: newId });
        }
      } catch (e) {
        console.error('company add/update failed', item.id, e);
        fail++;
      }
    }
    setBusy(false);
    const msg = [added > 0 && `신규 ${added}건`, updated > 0 && `업데이트 ${updated}건`, fail > 0 && `실패 ${fail}건`]
      .filter(Boolean).join(' · ');
    if (added + updated > 0) toast.success(`법인 ${msg}`);
    else if (fail > 0) toast.error(`등록 모두 실패 (${fail}건)`);
    // intake 결과 갱신
    if (intakeId) {
      try {
        const { markIntakeCommitted, setIntakeMatch } = await import('@/lib/firebase/intake-store');
        if (added + updated > 0) {
          await markIntakeCommitted(intakeId, [{ node: 'companies', id: '(batch)' }]);
        } else {
          await setIntakeMatch(intakeId, { confidence: 'none', reason: `등록 실패 ${fail}건` }, 'pending');
        }
      } catch (e) { console.warn('[intake] business-reg batch end 실패', e); }
    }
    handleClose(false);
  }

  async function handleManualSave(): Promise<void> {
    const name = (manualDraft.name ?? '').trim();
    if (!name) { toast.error('회사명 필수'); return; }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      // editId 우선 (수정 모드), 없으면 사업자/법인번호로 매칭
      const existing = editTarget ?? companies.find((c) => {
        const b = normReg(manualDraft.bizRegNo), p = normReg(manualDraft.corpRegNo);
        if (b && normReg(c.bizRegNo) === b) return true;
        if (p && normReg(c.corpRegNo) === p) return true;
        return false;
      });
      if (existing) {
        const merged: Company = { ...existing, ...manualDraft, id: existing.id } as Company;
        await updateCompany(merged);
        void audit.update('company', merged.id, `법인 수기 수정 — ${merged.name}`);
        const reassigned = await reassignVehiclesToCompany(vehicles, merged, updateVehicle);
        toast.success(reassigned > 0 ? `법인 업데이트 — ${name} (차량 ${reassigned}대 매칭)` : `법인 업데이트 — ${name}`);
        onSaved?.(merged);
      } else {
        const payload: Omit<Company, 'id'> = {
          code: '',
          name,
          bizRegNo: manualDraft.bizRegNo,
          corpRegNo: manualDraft.corpRegNo,
          ceo: manualDraft.ceo,
          address: manualDraft.address,
          bizType: manualDraft.bizType,
          bizItem: manualDraft.bizItem,
          partnerKind: manualDraft.partnerKind ?? '기타',
          displayName: manualDraft.displayName,
          homepage: manualDraft.homepage,
          mainPhone: manualDraft.mainPhone,
          contactName: manualDraft.contactName,
          contactRole: manualDraft.contactRole,
          contactPhone: manualDraft.contactPhone,
          contactEmail: manualDraft.contactEmail,
          accounts: [],
          cards: [],
          locations: [],
          documents: [],
          notes: '',
          createdAt: now,
        };
        const newId = await addCompany(payload);
        void audit.create('company', newId, `법인 수기 등록 — ${name}`);
        const saved = { ...(payload as Company), id: newId };
        const reassigned = await reassignVehiclesToCompany(vehicles, saved, updateVehicle);
        toast.success(reassigned > 0 ? `신규 법인 등록 — ${name} (차량 ${reassigned}대 매칭)` : `신규 법인 등록 — ${name}`);
        onSaved?.(saved);
      }
      handleClose(false);
    } catch (e) {
      toast.error(`등록 실패: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={handleClose}>
      <DialogContent title={editTarget ? `법인 수정 — ${editTarget.name}` : '사업자등록증 법인 등록'} mode={editTarget ? 'edit' : 'new'}>
        <DialogBody>
          <Tabs.Root value={mode} onValueChange={(v) => setMode(v as 'ocr' | 'manual')}>
            <Tabs.List className="tabs-list" style={{ marginBottom: 12 }}>
              <Tabs.Trigger value="ocr" className="tabs-trigger">
                <Upload size={12} weight="bold" style={{ marginRight: 4 }} /> 일괄 OCR 등록
              </Tabs.Trigger>
              <Tabs.Trigger value="manual" className="tabs-trigger">
                <Keyboard size={12} weight="bold" style={{ marginRight: 4 }} /> 수기 입력
              </Tabs.Trigger>
            </Tabs.List>

            {/* OCR 탭 */}
            <Tabs.Content value="ocr">
              <OcrUploadStage
                progress={ocr.progress}
                busy={ocr.busy || busy}
                onFiles={ocr.handleFiles}
                idleTitle="사업자등록증 파일 드래그 / 클릭 선택"
                idleSubtitle="이미지·PDF · 여러 장 한번에 — 사업자번호/법인번호 기준 기존 회사 자동 매칭"
                progressSubtitle="Gemini 가 사업자등록증을 읽고 있습니다"
              />


              {items.length > 0 && (
                <div style={{ marginTop: 14, maxHeight: 360, overflow: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: 28 }}></th>
                        <th>회사명*</th>
                        <th className="mono" style={{ width: 130 }}>사업자번호</th>
                        <th className="mono" style={{ width: 150 }}>법인등록번호</th>
                        <th style={{ width: 88 }}>대표자</th>
                        <th className="center" style={{ width: 60 }}>매칭</th>
                        <th className="center" style={{ width: 70 }}>상태</th>
                        <th style={{ width: 30 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => {
                        const nameOk = !!(it.name && it.name.trim());
                        const dup = !it._existingId && (
                          (it.bizRegNo && existingRegNos.has(normReg(it.bizRegNo)))
                          || (it.corpRegNo && existingRegNos.has(normReg(it.corpRegNo)))
                        );
                        return (
                          <tr key={it.id}>
                            <td className="center">
                              {it._status === 'pending' && <CircleNotch size={13} className="spin" style={{ color: 'var(--text-weak)' }} />}
                              {it._status === 'done' && nameOk && <CheckCircle size={13} weight="duotone" style={{ color: 'var(--green-text)' }} />}
                              {it._status === 'done' && !nameOk && <Warning size={13} weight="duotone" style={{ color: 'var(--orange-text)' }} />}
                              {it._status === 'failed' && <X size={13} weight="bold" style={{ color: 'var(--red-text)' }} />}
                            </td>
                            <td>
                              {it._status === 'done' ? (
                                <input
                                  type="text"
                                  className={`input input-compact ${!nameOk ? 'input-error' : ''}`}
                                  value={it.name ?? ''}
                                  onChange={(e) => updateRow(it.id, { name: e.target.value })}
                                  style={{ width: '100%', fontSize: 11 }}
                                />
                              ) : <span className="dim">{it._fileName}</span>}
                            </td>
                            <td className="mono dim">{it.bizRegNo || '-'}</td>
                            <td className="mono dim">{it.corpRegNo || '-'}</td>
                            <td className="dim">{it.ceo || '-'}</td>
                            <td className="center" style={{ fontSize: 10 }}>
                              {it._existingId ? (
                                <span style={{ color: 'var(--brand)' }}>업데이트</span>
                              ) : dup ? (
                                <span style={{ color: 'var(--orange-text)' }}>중복</span>
                              ) : it._status === 'done' && nameOk ? (
                                <span style={{ color: 'var(--green-text)' }}>신규</span>
                              ) : (
                                <span className="dim">-</span>
                              )}
                            </td>
                            <td className="center" style={{ fontSize: 10 }}>
                              {it._status === 'pending' && <span className="dim">대기</span>}
                              {it._status === 'done' && !nameOk && <span style={{ color: 'var(--orange-text)' }}>이름누락</span>}
                              {it._status === 'done' && nameOk && <span style={{ color: 'var(--green-text)' }}>OK</span>}
                              {it._status === 'failed' && <span style={{ color: 'var(--red-text)' }} title={it._error}>실패</span>}
                            </td>
                            <td className="center">
                              <button type="button" onClick={() => removeItem(it.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-weak)' }} title="제거">
                                <X size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Tabs.Content>

            {/* 수기 탭 — 서류 기반(사업자등록 정보) / 그 외(회사 정보) 두 그룹 분리 */}
            <Tabs.Content value="manual">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 560 }}>
                {/* 사업자등록 정보 — 서류 기반 */}
                <GroupLabel>사업자등록 정보</GroupLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                  <Field label="회사명 *">
                    <input
                      type="text"
                      className="input input-compact"
                      value={manualDraft.name ?? ''}
                      onChange={(e) => setManualDraft({ ...manualDraft, name: e.target.value })}
                    />
                  </Field>
                  <Field label="구분">
                    <select
                      className="input input-compact"
                      value={manualDraft.partnerKind ?? '기타'}
                      onChange={(e) => setManualDraft({ ...manualDraft, partnerKind: e.target.value as '위탁' | '직영' | '기타' })}
                    >
                      <option value="위탁">위탁</option>
                      <option value="직영">직영</option>
                      <option value="기타">기타</option>
                    </select>
                  </Field>
                </div>
                <Field label="표기명 (선택 — 비우면 정식 회사명 그대로 표시)">
                  <input
                    type="text"
                    className="input input-compact"
                    placeholder="예: 스위치플랜"
                    value={manualDraft.displayName ?? ''}
                    onChange={(e) => setManualDraft({ ...manualDraft, displayName: e.target.value })}
                  />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Field label="대표자">
                    <input
                      type="text"
                      className="input input-compact"
                      value={manualDraft.ceo ?? ''}
                      onChange={(e) => setManualDraft({ ...manualDraft, ceo: e.target.value })}
                    />
                  </Field>
                  <Field label="법인등록번호">
                    <input
                      type="text"
                      className="input input-compact mono"
                      placeholder="000000-0000000"
                      value={manualDraft.corpRegNo ?? ''}
                      onChange={(e) => setManualDraft({ ...manualDraft, corpRegNo: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="사업자등록번호">
                  <input
                    type="text"
                    className="input input-compact mono"
                    placeholder="000-00-00000"
                    value={manualDraft.bizRegNo ?? ''}
                    onChange={(e) => setManualDraft({ ...manualDraft, bizRegNo: e.target.value })}
                  />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Field label="업종">
                    <input
                      type="text"
                      className="input input-compact"
                      value={manualDraft.bizType ?? ''}
                      onChange={(e) => setManualDraft({ ...manualDraft, bizType: e.target.value })}
                    />
                  </Field>
                  <Field label="종목">
                    <input
                      type="text"
                      className="input input-compact"
                      value={manualDraft.bizItem ?? ''}
                      onChange={(e) => setManualDraft({ ...manualDraft, bizItem: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="주소">
                  <input
                    type="text"
                    className="input input-compact"
                    value={manualDraft.address ?? ''}
                    onChange={(e) => setManualDraft({ ...manualDraft, address: e.target.value })}
                  />
                </Field>

                {/* 회사 정보 — 홈페이지·실무 담당자 (서류 외 운영 정보) */}
                <GroupLabel>회사 정보 (운영용)</GroupLabel>
                <Field label="홈페이지">
                  <input
                    type="url"
                    className="input input-compact"
                    placeholder="https://www.company.com"
                    value={manualDraft.homepage ?? ''}
                    onChange={(e) => setManualDraft({ ...manualDraft, homepage: e.target.value })}
                  />
                </Field>
                <Field label="대표 전화">
                  <input
                    type="tel"
                    className="input input-compact mono"
                    placeholder="02-0000-0000"
                    value={manualDraft.mainPhone ?? ''}
                    onChange={(e) => setManualDraft({ ...manualDraft, mainPhone: e.target.value })}
                  />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Field label="실무자">
                    <input
                      type="text"
                      className="input input-compact"
                      value={manualDraft.contactName ?? ''}
                      onChange={(e) => setManualDraft({ ...manualDraft, contactName: e.target.value })}
                    />
                  </Field>
                  <Field label="실무자 직책">
                    <input
                      type="text"
                      className="input input-compact"
                      placeholder="예: 매니저"
                      value={manualDraft.contactRole ?? ''}
                      onChange={(e) => setManualDraft({ ...manualDraft, contactRole: e.target.value })}
                    />
                  </Field>
                  <Field label="실무자 연락처">
                    <input
                      type="tel"
                      className="input input-compact mono"
                      placeholder="010-0000-0000"
                      value={manualDraft.contactPhone ?? ''}
                      onChange={(e) => setManualDraft({ ...manualDraft, contactPhone: e.target.value })}
                    />
                  </Field>
                  <Field label="실무자 이메일">
                    <input
                      type="email"
                      className="input input-compact"
                      placeholder="name@company.com"
                      value={manualDraft.contactEmail ?? ''}
                      onChange={(e) => setManualDraft({ ...manualDraft, contactEmail: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <button className="btn" type="button">취소</button>
          </DialogClose>
          {mode === 'ocr' ? (
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy || registerable.length === 0}
              onClick={() => void handleCommitAll()}
            >
              <Plus size={14} weight="bold" /> 일괄 등록 ({registerable.length}건)
            </button>
          ) : (
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy || !(manualDraft.name ?? '').trim()}
              onClick={() => void handleManualSave()}
            >
              <Plus size={14} weight="bold" /> 법인 등록
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, color: 'var(--text-sub)', fontWeight: 600 }}>{label}</span>
      {children}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: 8, paddingTop: 10,
      borderTop: '1px solid var(--border-soft)',
      fontSize: 12, fontWeight: 700, color: 'var(--text-main)',
    }}>
      {children}
    </div>
  );
}
