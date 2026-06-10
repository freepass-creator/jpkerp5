'use client';

import { useState, useMemo, useEffect } from 'react';
import JSZip from 'jszip';
import { X, CircleNotch, CheckCircle, Warning, Plus, ArrowCounterClockwise, Printer, DownloadSimple, PaperPlaneTilt, Trash } from '@phosphor-icons/react';
import { Dialog, DialogTrigger, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { OcrUploadStage } from '@/components/ui/ocr-upload-stage';
import { StatusBadge } from '@/components/ui/status-badge';
import { findContractByPlate } from '@/lib/use-contract-store';
import { useCompanyStore } from '@/lib/use-company-store';
import { useContractStore, useContractStoreStatus } from '@/lib/use-contract-store';
import type { PenaltyWorkItem } from '@/lib/penalty-pdf';
import { splitPdfPages } from '@/lib/pdf-split';
import { fileToImageDataUrl } from '@/lib/pdf-to-image';
import { useOcrBatch, type OcrBatchItem } from '@/lib/use-ocr-batch';
import { normalizeKoreanDate } from '@/lib/parsers/date';
import type { Company } from '@/lib/sample-companies';
import { getFirebaseAuth } from '@/lib/firebase/client';

type WorkItem = PenaltyWorkItem & OcrBatchItem;

type Props = {
  onCreate: (items: PenaltyWorkItem[]) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
};

/** PDF/이미지 placeholder — fileDataUrl 은 PDF→이미지 변환해서 채움. */
async function createPenaltyPlaceholder(file: File, id: string): Promise<WorkItem> {
  const fileDataUrl = await fileToImageDataUrl(file).catch(() => '');
  return {
    id,
    fileName: file.name,
    fileDataUrl,
    fileSize: file.size,
    doc_type: '', notice_no: '', issuer: '', issue_date: '',
    payer_name: '', car_number: '', date: '', location: '',
    description: '', law_article: '',
    penalty_amount: 0, fine_amount: 0, demerit_points: 0,
    toll_amount: 0, surcharge_amount: 0, amount: 0,
    due_date: '', opinion_period: '', pay_account: '',
    _asset: null, _contract: null, _company: null,
    _status: 'pending',
  };
}

export function PenaltyRegisterDialog({ onCreate, open: openProp, onOpenChange, showTrigger = true }: Props) {
  const [contracts] = useContractStore();
  const contractStatus = useContractStoreStatus();
  const [companies] = useCompanyStore();
  const findCompanyByCode = (code?: string) => code ? companies.find((c) => c.code === code) ?? null : null;

  const [openInner, setOpenInner] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openInner;
  const setOpen = (v: boolean) => {
    if (!isControlled) setOpenInner(v);
    onOpenChange?.(v);
  };

  const ocr = useOcrBatch<WorkItem>({
    docType: 'penalty',
    expandFile: splitPdfPages,
    createPlaceholder: createPenaltyPlaceholder,
    applyResult: (prev, raw) => {
      const carNumber = (raw.car_number as string) ?? '';
      const violationDate = normalizeKoreanDate(raw.date as string | null | undefined);
      const matched = findContractByPlate(contracts, carNumber, violationDate);
      if (!matched) {
        const normQ = carNumber.replace(/[^0-9가-힣]/g, '');
        console.warn('[penalty:match-fail]', {
          carNumber, normalized: normQ, violationDate,
          contractsCount: contracts.length,
          samplePlates: contracts.slice(0, 5).map((c) => c.plate),
          allPlatesNormalized: contracts.map((c) => (c.plate ?? '').replace(/[^0-9가-힣]/g, '')),
        });
      }
      return {
        ...prev,
        doc_type: (raw.doc_type as string) ?? '',
        notice_no: (raw.notice_no as string) ?? '',
        issuer: (raw.issuer as string) ?? '',
        issue_date: normalizeKoreanDate(raw.issue_date as string | null | undefined),
        car_number: carNumber,
        date: normalizeKoreanDate(raw.date as string | null | undefined),
        location: (raw.location as string) ?? '',
        description: (raw.description as string) ?? '',
        law_article: (raw.law_article as string) ?? '',
        amount: typeof raw.amount === 'number' ? raw.amount : 0,
        due_date: normalizeKoreanDate(raw.due_date as string | null | undefined),
        pay_account: (raw.pay_account as string) ?? '',
        _contract: matched ? {
          contractor_name: matched.customerName,
          contractor_phone: matched.customerPhone,
          contractor_kind: matched.customerKind,
          start_date: matched.startDate,
          end_date: matched.endDate,
          product_type: '장기렌트',
          partner_code: matched.companyCode,
        } : null,
        _company: matched ? findCompanyByCode(matched.companyCode) : null,
      };
    },
  });

  // 선택 상태 (다중 선택 — 팩스/다운로드 일괄 액션용)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAll(allIds: string[]) {
    setSelected((prev) => {
      if (allIds.every((id) => prev.has(id))) return new Set();
      return new Set(allIds);
    });
  }

  // 팩스 보내기 모달
  const [faxOpen, setFaxOpen] = useState(false);

  function commitAll() {
    const ok = ocr.items.filter((i) => i._status === 'done');
    if (ok.length === 0) return;
    onCreate(ok.map(({ _status: _s, _error: _e, ...rest }) => rest as PenaltyWorkItem));
    setOpen(false);
    setTimeout(() => { ocr.reset(); setSelected(new Set()); }, 100);
  }

  function handleClose(o: boolean) {
    setOpen(o);
    if (!o) { ocr.reset(); setSelected(new Set()); }
  }

  const okCount = ocr.items.filter((i) => i._status === 'done').length;
  const matchedCount = ocr.items.filter((i) => i._contract).length;
  const allDoneIds = ocr.items.filter((i) => i._status === 'done').map((i) => i.id);
  const selectedItems = ocr.items.filter((i) => selected.has(i.id) && i._status === 'done' && i.fileDataUrl);
  const selectedCount = selectedItems.length;
  const allSelected = selectedCount > 0 && allDoneIds.length > 0 && allDoneIds.every((id) => selected.has(id));

  async function downloadSelected() {
    if (selectedCount === 0) return;
    if (selectedCount === 1) {
      // 단건은 zip 없이 바로 다운로드
      const it = selectedItems[0];
      const blob = dataUrlToBlob(it.fileDataUrl);
      triggerDownload(blob, it.fileName || 'penalty.png');
      return;
    }
    const zip = new JSZip();
    const seen = new Map<string, number>();
    for (const it of selectedItems) {
      let name = it.fileName || `penalty-${it.id}.png`;
      const dupIdx = seen.get(name) ?? 0;
      if (dupIdx > 0) {
        const dot = name.lastIndexOf('.');
        name = dot > 0 ? `${name.slice(0, dot)}-${dupIdx}${name.slice(dot)}` : `${name}-${dupIdx}`;
      }
      seen.set(it.fileName || name, dupIdx + 1);
      const blob = dataUrlToBlob(it.fileDataUrl);
      zip.file(name, await blob.arrayBuffer());
    }
    const out = await zip.generateAsync({ type: 'blob' });
    triggerDownload(out, `penalty-${new Date().toISOString().slice(0, 10)}.zip`);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {showTrigger && (
        <DialogTrigger asChild>
          <button className="btn btn-primary">
            <Plus size={14} weight="bold" /> 고지서 등록
          </button>
        </DialogTrigger>
      )}
      <DialogContent title="고지서 등록 (자동 OCR)" size="xl" mode="new">
        <div className="space-y-3" style={{ padding: '16px 20px' }}>
          {/* 계약 마스터 로딩 안내 — OCR 매칭 정확도 위해 contracts 동기화 대기 */}
          {contractStatus.loading && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, background: 'var(--orange-bg)',
              color: 'var(--orange-text)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <CircleNotch size={12} weight="bold" style={{ animation: 'spin 1s linear infinite' }} />
              계약 데이터 로딩 중 — 매칭 정확도 위해 잠시만 기다린 후 업로드해 주세요.
            </div>
          )}
          {!contractStatus.loading && contractStatus.count === 0 && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, background: 'var(--orange-bg)',
              color: 'var(--orange-text)', fontSize: 11,
            }}>
              ⚠ 등록된 계약이 없습니다 — OCR 결과가 매칭되지 않을 수 있어요. 운영현황에서 먼저 계약 등록.
            </div>
          )}

          <OcrUploadStage
            progress={ocr.progress}
            busy={ocr.busy}
            onFiles={ocr.handleFiles}
            idleTitle="고지서 업로드 — 클릭 또는 드래그&드롭"
            idleSubtitle="JPG / PNG / PDF — PDF는 페이지별 분할. 차량번호로 계약 자동 매칭."
            progressSubtitle="Gemini가 고지서를 읽고 있습니다"
          />

          {ocr.items.length > 0 && (
            <>
              <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                <button
                  className="btn btn-sm"
                  disabled={selectedCount === 0}
                  onClick={() => setFaxOpen(true)}
                  title={selectedCount === 0 ? '팩스 보낼 항목을 체크박스로 선택' : `선택 ${selectedCount}건 팩스 발송`}
                >
                  <Printer size={13} weight="bold" /> 팩스 보내기
                  {selectedCount > 0 && <strong style={{ marginLeft: 4 }}>({selectedCount})</strong>}
                </button>
                <button
                  className="btn btn-sm"
                  disabled={selectedCount === 0}
                  onClick={downloadSelected}
                  title={selectedCount === 0 ? '다운로드할 항목을 체크박스로 선택' : `선택 ${selectedCount}건 다운로드`}
                >
                  <DownloadSimple size={13} weight="bold" /> 다운로드
                  {selectedCount > 0 && <strong style={{ marginLeft: 4 }}>({selectedCount})</strong>}
                </button>
                <button
                  className="btn btn-sm"
                  disabled={selectedCount === 0}
                  onClick={() => {
                    if (selectedCount === 0) return;
                    if (!window.confirm(`선택한 ${selectedCount}건을 삭제하시겠습니까?`)) return;
                    selected.forEach((id) => ocr.removeItem(id));
                    setSelected(new Set());
                  }}
                  title={selectedCount === 0 ? '삭제할 항목을 체크박스로 선택' : `선택 ${selectedCount}건 삭제`}
                  style={{ color: selectedCount > 0 ? 'var(--red-text)' : undefined }}
                >
                  <Trash size={13} weight="bold" /> 선택 삭제
                  {selectedCount > 0 && <strong style={{ marginLeft: 4 }}>({selectedCount})</strong>}
                </button>
                <span className="text-weak text-xs" style={{ marginLeft: 'auto' }}>
                  체크박스로 항목 선택 → 팩스 / 다운로드 / 삭제
                </span>
              </div>

              <div className="border" style={{ borderColor: 'var(--border)', overflowX: 'auto', maxHeight: 360 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th className="center" style={{ width: 30 }}>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => toggleSelectAll(allDoneIds)}
                          disabled={allDoneIds.length === 0}
                          title="분석완료 항목 전체 선택"
                        />
                      </th>
                      <th className="center" style={{ width: 70 }}>상태</th>
                      <th>회사</th>
                      <th>차량번호</th>
                      <th>구분</th>
                      <th style={{ width: 100 }}>위반일자</th>
                      <th>위반장소</th>
                      <th className="num">금액</th>
                      <th>임차인</th>
                      <th className="center" style={{ width: 50 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ocr.items.map((p) => {
                      const canSelect = p._status === 'done' && !!p.fileDataUrl;
                      return (
                        <tr key={p.id} style={selected.has(p.id) ? { background: 'var(--bg-stripe)' } : undefined}>
                          <td className="center">
                            <input
                              type="checkbox"
                              checked={selected.has(p.id)}
                              onChange={() => toggleSelect(p.id)}
                              disabled={!canSelect}
                              title={!canSelect ? '분석완료 후 선택 가능' : ''}
                            />
                          </td>
                          <td className="center"><PenaltyItemStatus item={p} /></td>
                          <td className="plate">{p._company?.code || <span className="text-muted">-</span>}</td>
                          <td className="plate">{p.car_number || <span className="text-muted">-</span>}</td>
                          <td className="dim">{p.doc_type || '-'}</td>
                          <td className="mono">{p.date || <span className="text-muted">-</span>}</td>
                          <td className="dim truncate" style={{ maxWidth: 200 }}>{p.location || '-'}</td>
                          <td className="num">{p.amount ? p.amount.toLocaleString('ko-KR') : '-'}</td>
                          <td className="dim">{p._contract?.contractor_name || <span className="text-muted">미매칭</span>}</td>
                          <td className="center">
                            <button
                              className="btn-ghost btn btn-sm"
                              onClick={() => {
                                if (!window.confirm('이 항목을 삭제하시겠습니까?')) return;
                                ocr.removeItem(p.id);
                                setSelected((prev) => { const n = new Set(prev); n.delete(p.id); return n; });
                              }}
                              title="이 행 삭제"
                              style={{ color: 'var(--red-text)' }}
                            >
                              <X size={12} weight="bold" />
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

          {ocr.items.length > 0 && (
            <div className="text-weak text-xs">
              총 {ocr.items.length}건 · 분석완료 <strong>{okCount}</strong> · 계약 매칭 <strong>{matchedCount}</strong>
              {selectedCount > 0 && <> · 선택 <strong>{selectedCount}</strong></>}
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            className="btn"
            style={{ marginRight: 'auto' }}
            disabled={ocr.items.length === 0 || ocr.busy}
            onClick={ocr.reset}
          >
            <ArrowCounterClockwise size={14} weight="bold" /> 초기화
          </button>
          <DialogClose asChild>
            <button className="btn">취소</button>
          </DialogClose>
          <button className="btn btn-primary" disabled={okCount === 0 || ocr.busy} onClick={commitAll}>
            {okCount > 0 ? `${okCount}건 등록` : '등록'}
          </button>
        </DialogFooter>
      </DialogContent>

      <FaxSendDialog
        open={faxOpen}
        onOpenChange={setFaxOpen}
        items={selectedItems}
        companies={companies}
      />
    </Dialog>
  );
}

/** dataURL("data:image/png;base64,...") → Blob */
function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, data] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/** 과태료 OCR 행 상태 — 분석중 / 오류 / 매칭완료 / 미매칭. */
function PenaltyItemStatus({ item }: { item: WorkItem }) {
  if (item._status === 'pending') {
    return <StatusBadge tone="neutral" icon={<CircleNotch size={11} className="spin" />}>분석중</StatusBadge>;
  }
  if (item._status === 'failed') {
    return <StatusBadge tone="red" icon={<Warning size={11} weight="fill" />} title={item._error}>오류</StatusBadge>;
  }
  if (item._contract) {
    return <StatusBadge tone="green" icon={<CheckCircle size={11} weight="fill" />}>매칭</StatusBadge>;
  }
  return <StatusBadge tone="orange" icon={<Warning size={11} weight="fill" />} title="차량번호로 매칭되는 계약 없음">미매칭</StatusBadge>;
}

/* ───── 팩스 발송 다이얼로그 — 선택된 과태료를 일괄 팩스 ───── */
function FaxSendDialog({
  open, onOpenChange, items, companies,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: WorkItem[];
  companies: readonly Company[];
}) {
  // 선택 항목들의 매칭회사가 동일하면 그 회사의 팩스를 발신 기본값으로
  const defaultSender = useMemo(() => {
    if (items.length === 0) return '';
    const codes = new Set(items.map((i) => i._company?.code).filter(Boolean) as string[]);
    if (codes.size !== 1) return '';
    const code = [...codes][0];
    const c = companies.find((x) => x.code === code);
    return c?.fax ?? '';
  }, [items, companies]);

  const [sender, setSender] = useState('');
  const [receiver, setReceiver] = useState('');
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);

  // 다이얼로그 열릴 때 매칭회사 팩스 채움
  useEffect(() => {
    if (open) {
      setSender(defaultSender);
      setReceiver('');
      setTitle('');
      setMemo('');
      setResult(null);
    }
  }, [open, defaultSender]);

  async function send() {
    if (!receiver.trim()) { alert('받는 팩스번호 입력'); return; }
    if (!sender.trim()) { alert('발신 팩스번호 입력 (회사정보의 팩스를 등록하면 자동 채움)'); return; }
    if (items.length === 0) return;
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('sender', sender.trim());
      fd.append('receiver', receiver.trim());
      if (title.trim()) fd.append('title', title.trim());
      if (memo.trim()) fd.append('memo', memo.trim());
      items.forEach((it, i) => {
        const blob = dataUrlToBlob(it.fileDataUrl);
        const fname = it.fileName || `penalty-${i + 1}.png`;
        fd.append(`file_${i + 1}`, blob, fname);
      });
      const auth = getFirebaseAuth();
      const user = auth?.currentUser;
      const idToken = user ? await user.getIdToken() : '';
      const res = await fetch('/api/fax/send', {
        method: 'POST',
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
        body: fd,
      });
      const json = await res.json() as { ok: boolean; faxId?: string; message?: string; error?: string };
      setResult({ ok: !!json.ok, message: json.message ?? json.error ?? (json.ok ? `발송 접수 (faxId=${json.faxId ?? '-'})` : '발송 실패') });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`팩스 발송 — ${items.length}건`} size="md">
        <div className="space-y-3">
          <div className="text-weak text-xs">
            선택한 과태료 스캔 파일 {items.length}건을 한 통의 팩스로 묶어 발송합니다.
            발신은 매칭된 회사의 팩스(자동 채움), 또는 직접 입력 가능.
          </div>

          <div className="form-grid">
            <label className="block col-span-1">
              <span className="label label-required">발신 팩스</span>
              <input
                className="input w-full"
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                placeholder="02-0000-0000"
              />
              {!defaultSender && (
                <span className="text-weak text-xs">
                  매칭 회사의 팩스 미등록 — 회사정보 → 팩스 입력 후 자동 채움
                </span>
              )}
            </label>
            <label className="block col-span-1">
              <span className="label label-required">받는 팩스</span>
              <input
                className="input w-full"
                value={receiver}
                onChange={(e) => setReceiver(e.target.value)}
                placeholder="02-0000-0000"
              />
            </label>
            <label className="block col-span-2">
              <span className="label">표지 제목 (선택)</span>
              <input
                className="input w-full"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="과태료/통행료 고지서 송부의 건"
              />
            </label>
            <label className="block col-span-2">
              <span className="label">표지 본문 (선택)</span>
              <textarea
                className="input w-full"
                rows={2}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="해당 차량 임차인께 송부드립니다."
              />
            </label>
          </div>

          <div className="border" style={{ borderColor: 'var(--border)', maxHeight: 160, overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>차량번호</th>
                  <th>구분</th>
                  <th className="num">금액</th>
                  <th className="dim truncate">파일</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="plate">{it.car_number || '-'}</td>
                    <td className="dim">{it.doc_type || '-'}</td>
                    <td className="num">{it.amount ? it.amount.toLocaleString('ko-KR') : '-'}</td>
                    <td className="dim truncate" style={{ maxWidth: 200 }}>{it.fileName || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result && (
            <div className={result.ok ? 'text-green text-xs' : 'text-red text-xs'}>
              {result.ok ? '✓ ' : '✗ '}{result.message ?? (result.ok ? '발송 접수' : '발송 실패')}
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <button className="btn" disabled={busy}>닫기</button>
          </DialogClose>
          <button className="btn btn-primary" disabled={busy || items.length === 0} onClick={send}>
            <PaperPlaneTilt size={13} weight="bold" /> {busy ? '발송 중…' : '발송'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
