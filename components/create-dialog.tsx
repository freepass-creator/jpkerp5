'use client';

import { useCallback, useMemo, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import * as XLSX from 'xlsx';
import {
  FileArrowUp, FileXls, CheckCircle, Warning, X, Plus,
  MagnifyingGlass, CaretLeft, Car, ClipboardText, Wrench, DownloadSimple,
  Camera, Keyboard, CircleNotch,
} from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { parseExcelFile, type ParsedSheet, type UploadKind } from '@/lib/excel-detect';
import { formatCurrency, cn } from '@/lib/utils';
import { MOCK_CONTRACTS } from '@/lib/mock-data';
import type { Contract, HistoryCategory, HistoryScope } from '@/lib/types';
import {
  VEHICLE_COLUMNS, CONTRACT_COLUMNS, BANK_TX_COLUMNS, CARD_TX_COLUMNS,
  type ColumnSpec,
} from '@/lib/import-schema';

type Mode = '차량' | '계약' | '수납' | '이력';

export function CreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [mode, setMode] = useState<Mode>('차량');
  const [parsed, setParsed] = useState<ParsedSheet[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const reset = useCallback(() => {
    setParsed([]);
    setBusy(false);
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      setBusy(true);
      const results: ParsedSheet[] = [];
      for (const f of files) {
        try {
          const sheets = await parseExcelFile(f);
          results.push(...sheets);
        } catch (e) {
          console.error('parse fail', f.name, e);
        }
      }
      const fallback: UploadKind = mode === '이력' || mode === '차량' ? '미분류' : (mode as UploadKind);
      setParsed((prev) => [
        ...prev,
        ...results.map((r) => ({ ...r, kind: r.kind === '미분류' ? fallback : r.kind })),
      ]);
      setBusy(false);
    },
    [mode]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const files = Array.from(e.dataTransfer.files).filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
      if (files.length > 0) void handleFiles(files);
    },
    [handleFiles]
  );

  const onPick = useCallback(() => document.getElementById('icar-bulk-file-input')?.click(), []);

  const vehicleFiles = parsed.filter((p) => p.kind === '미분류'); // TODO: 차량 분류 추가
  const contractFiles = parsed.filter((p) => p.kind === '계약');
  const paymentFiles = parsed.filter((p) => p.kind === '계좌' || p.kind === '카드');

  const contractsCount = contractFiles.reduce((s, p) => s + p.rows.length, 0);
  const paymentsCount = paymentFiles.reduce((s, p) => s + p.rows.length, 0);

  function updateKind(filteredIdx: number, kind: UploadKind, group: 'contract' | 'payment') {
    const target = (group === 'contract' ? contractFiles : paymentFiles)[filteredIdx];
    setParsed((all) => all.map((p) => (p === target ? { ...p, kind } : p)));
  }

  return (
    <DialogRoot
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent title="신규 등록">
        <input
          id="icar-bulk-file-input"
          type="file"
          multiple
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              void handleFiles(Array.from(e.target.files));
              e.target.value = '';
            }
          }}
        />

        <DialogBody className="p-0" style={{ display: 'flex', flexDirection: 'column' }}>
          <Tabs.Root value={mode} onValueChange={(v) => setMode(v as Mode)} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <Tabs.List className="tabs-list">
              <Tabs.Trigger value="차량" className="tabs-trigger">차량 등록</Tabs.Trigger>
              <Tabs.Trigger value="계약" className="tabs-trigger">
                계약 생성
                {contractsCount > 0 && <span className="count">{contractsCount}</span>}
              </Tabs.Trigger>
              <Tabs.Trigger value="수납" className="tabs-trigger">
                수납 등록
                {paymentsCount > 0 && <span className="count">{paymentsCount}</span>}
              </Tabs.Trigger>
              <Tabs.Trigger value="이력" className="tabs-trigger">이력 등록</Tabs.Trigger>
            </Tabs.List>

            <div
              style={{ flex: 1, overflow: 'auto', padding: 16 }}
              onDragOver={(e) => { e.preventDefault(); if (mode !== '이력') setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { if (mode !== '이력') onDrop(e); }}
            >
              <Tabs.Content value="차량">
                <VehicleRegisterPane onClose={() => onOpenChange(false)} />
              </Tabs.Content>
              <Tabs.Content value="계약">
                <ContractRegisterPane
                  files={contractFiles}
                  drag={drag}
                  onPick={onPick}
                  onChangeKind={(idx, k) => updateKind(idx, k, 'contract')}
                  onClose={() => onOpenChange(false)}
                />
              </Tabs.Content>
              <Tabs.Content value="수납">
                <PaymentRegisterPane
                  files={paymentFiles}
                  drag={drag}
                  onPick={onPick}
                  onChangeKind={(idx, k) => updateKind(idx, k, 'payment')}
                  onClose={() => onOpenChange(false)}
                />
              </Tabs.Content>
              <Tabs.Content value="이력">
                <HistoryAddPane onClose={() => onOpenChange(false)} />
              </Tabs.Content>
            </div>
          </Tabs.Root>
        </DialogBody>

        <DialogFooter>
          <div className="flex-1" />
          <DialogClose asChild>
            <button className="btn" type="button">닫기</button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

/* ─────────────── 업로드 Pane (단일 스키마) ─────────────── */

function UploadPane({
  files, drag, onPick, onChangeKind,
  emptyTitle, emptyDesc, columns, templateName,
}: {
  files: ParsedSheet[];
  drag: boolean;
  onPick: () => void;
  onChangeKind: (idx: number, k: UploadKind) => void;
  emptyTitle: string;
  emptyDesc: string;
  columns: ColumnSpec[];
  templateName: string;
}) {
  if (files.length === 0) {
    return (
      <div className={cn('dropzone', drag && 'drag')} onClick={onPick} style={{ minHeight: 'auto', paddingTop: 32, paddingBottom: 32 }}>
        <div className="dropzone-icon">
          <FileArrowUp size={28} weight="duotone" />
        </div>
        <div className="dropzone-title">{emptyTitle}</div>
        <div className="dropzone-desc">{emptyDesc}</div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" type="button" onClick={(e) => { e.stopPropagation(); onPick(); }}>
            <Plus size={14} weight="bold" /> 엑셀 파일 선택
          </button>
          <button
            className="btn"
            type="button"
            onClick={(e) => { e.stopPropagation(); downloadTemplate(templateName, columns); }}
          >
            <DownloadSimple size={14} /> 템플릿
          </button>
        </div>
        <div className="dropzone-hint">또는 여기에 끌어다 놓기 · .xlsx / .xls / .csv</div>

        <SchemaList columns={columns} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className={cn('dropzone compact', drag && 'drag')} onClick={onPick}>
        <div className="dropzone-icon">
          <FileArrowUp size={16} weight="duotone" />
        </div>
        <div className="dropzone-title">파일 추가</div>
        <span className="text-weak text-xs ml-auto">또는 끌어다 놓기</span>
      </div>
      {files.map((p, i) => (
        <SheetPreview key={`${p.fileName}-${p.sheetName}-${i}`} sheet={p} onChangeKind={(k) => onChangeKind(i, k)} />
      ))}
    </div>
  );
}

/* ─────────────── 업로드 Pane (수납: 계좌 + 카드 둘 다) ─────────────── */

function UploadPaneMulti({
  files, drag, onPick, onChangeKind, groups,
}: {
  files: ParsedSheet[];
  drag: boolean;
  onPick: () => void;
  onChangeKind: (idx: number, k: UploadKind) => void;
  groups: { title: string; desc: string; columns: ColumnSpec[]; templateName: string }[];
}) {
  if (files.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className={cn('dropzone', drag && 'drag')} onClick={onPick} style={{ minHeight: 200, paddingTop: 32, paddingBottom: 32 }}>
          <div className="dropzone-icon">
            <FileArrowUp size={28} weight="duotone" />
          </div>
          <div className="dropzone-title">수납 엑셀 업로드</div>
          <div className="dropzone-desc">계좌 입금 / 카드 결제 — 헤더로 자동 분류, 계약자명·금액 기준 매칭</div>
          <button className="btn btn-primary" type="button" onClick={(e) => { e.stopPropagation(); onPick(); }}>
            <Plus size={14} weight="bold" /> 엑셀 파일 선택
          </button>
        </div>

        {groups.map((g) => (
          <div key={g.title} className="detail-section">
            <div className="detail-section-header">
              <span style={{ flex: 1 }}>{g.title}</span>
              <button
                className="btn btn-sm"
                type="button"
                onClick={() => downloadTemplate(g.templateName, g.columns)}
              >
                <DownloadSimple size={12} /> 템플릿
              </button>
            </div>
            <div className="detail-section-body">
              <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 8 }}>{g.desc}</div>
              <SchemaList columns={g.columns} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className={cn('dropzone compact', drag && 'drag')} onClick={onPick}>
        <div className="dropzone-icon">
          <FileArrowUp size={16} weight="duotone" />
        </div>
        <div className="dropzone-title">파일 추가</div>
        <span className="text-weak text-xs ml-auto">또는 끌어다 놓기</span>
      </div>
      {files.map((p, i) => (
        <SheetPreview key={`${p.fileName}-${p.sheetName}-${i}`} sheet={p} onChangeKind={(k) => onChangeKind(i, k)} />
      ))}
    </div>
  );
}

/* ─────────────── 스키마 표시 ─────────────── */

function SchemaList({ columns }: { columns: ColumnSpec[] }) {
  const req = columns.filter((c) => c.required);
  const opt = columns.filter((c) => !c.required);
  return (
    <div style={{ marginTop: 14, width: '100%' }}>
      <div className="schema-legend">
        <span><span className="schema-legend-dot" style={{ background: 'var(--red-text)' }} />필수</span>
        <span><span className="schema-legend-dot" style={{ background: 'var(--border-strong)' }} />선택</span>
      </div>
      <div style={{ marginTop: 8, marginBottom: 6, fontSize: 10, color: 'var(--text-weak)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        필수 {req.length}개
      </div>
      <div className="schema-grid">
        {req.map((c) => (
          <div key={c.field} className="schema-col required" title={c.hint}>
            <span className="schema-col-dot" />
            <span className="schema-col-name">{c.label}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, marginBottom: 6, fontSize: 10, color: 'var(--text-weak)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        선택 {opt.length}개
      </div>
      <div className="schema-grid">
        {opt.map((c) => (
          <div key={c.field} className="schema-col" title={c.hint}>
            <span className="schema-col-dot" />
            <span className="schema-col-name">{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── 템플릿 다운로드 ─────────────── */

function downloadTemplate(filename: string, columns: ColumnSpec[]) {
  const headers = columns.map((c) => c.label);
  const sample1 = columns.map((c) => c.example);
  const sample2 = columns.map(() => '');
  const aoa = [headers, sample1, sample2];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // 너비
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(c.label.length, c.example.length, 8) + 2 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '템플릿');
  XLSX.writeFile(wb, filename);
}

/* ─────────────── 파일 미리보기 ─────────────── */

function SheetPreview({ sheet, onChangeKind }: { sheet: ParsedSheet; onChangeKind: (k: UploadKind) => void }) {
  const preview = sheet.rows.slice(0, 5);
  const isLowConfidence = sheet.detectedConfidence < 0.5;
  return (
    <div className="border rounded">
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-header)] border-b">
        <FileXls size={14} className="text-sub" />
        <div className="font-medium">{sheet.fileName}</div>
        <span className="text-weak">·</span>
        <div className="text-sub">{sheet.sheetName}</div>
        <span className="text-weak">·</span>
        <div className="text-sub mono">{sheet.rows.length}행</div>
        {isLowConfidence && (
          <span className="flex items-center gap-1 text-[var(--alert-orange-text)] text-xs">
            <Warning size={12} /> 분류 신뢰도 낮음
          </span>
        )}
        <div className="flex-1" />
        <span className="text-weak text-xs">분류:</span>
        <select
          className="select"
          value={sheet.kind}
          onChange={(e) => onChangeKind(e.target.value as UploadKind)}
          style={{ width: 90, height: 26 }}
        >
          <option value="계약">계약</option>
          <option value="계좌">계좌</option>
          <option value="카드">카드</option>
          <option value="미분류">미분류</option>
        </select>
      </div>
      <div className="overflow-auto" style={{ maxHeight: 200 }}>
        <table className="table">
          <thead>
            <tr>
              {sheet.headers.map((h, i) => (
                <th key={`${h}-${i}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, ri) => (
              <tr key={ri}>
                {sheet.headers.map((h, i) => (
                  <td key={i}>{formatCell(row[h])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sheet.rows.length > 5 && (
        <div className="text-weak text-xs px-3 py-1 border-t bg-[var(--bg-stripe)]">
          ... 외 {sheet.rows.length - 5}행
        </div>
      )}
    </div>
  );
}

/* ─────────────── 차량 등록 Pane (개별 / OCR / 엑셀) ─────────────── */

type VehicleMode = 'manual' | 'ocr' | 'excel';

function VehicleRegisterPane({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<VehicleMode>('manual');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <div className="filter-bar">
        <button type="button" className={`chip ${mode === 'manual' ? 'active' : ''}`} onClick={() => setMode('manual')}>
          <Keyboard size={11} /> 개별 입력
        </button>
        <button type="button" className={`chip ${mode === 'ocr' ? 'active' : ''}`} onClick={() => setMode('ocr')}>
          <Camera size={11} /> OCR (자동차등록증)
        </button>
        <button type="button" className={`chip ${mode === 'excel' ? 'active' : ''}`} onClick={() => setMode('excel')}>
          <FileXls size={11} /> 엑셀 일괄
        </button>
      </div>

      {mode === 'manual' && <VehicleManualForm onSubmit={() => { alert('mock: 차량 등록 완료'); onClose(); }} />}
      {mode === 'ocr' && <VehicleOcrPane onSubmit={() => { alert('mock: OCR 차량 등록 완료'); onClose(); }} />}
      {mode === 'excel' && <VehicleExcelPane />}
    </div>
  );
}

const COMPANIES = ['아이카', '달카', '렌트로', '직카'];
const VEHICLE_STATUSES = ['구매대기', '등록대기', '상품화중', '인도대기', '재고'] as const;

function VehicleManualForm({ onSubmit }: { onSubmit: () => void }) {
  const [company, setCompany] = useState(COMPANIES[0]);
  const [model, setModel] = useState('');
  const [plate, setPlate] = useState('');
  const [vehicleStatus, setVehicleStatus] = useState<string>('구매대기');
  const [vin, setVin] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [fuel, setFuel] = useState('');
  const [purchasedDate, setPurchasedDate] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [insuranceAge, setInsuranceAge] = useState('26');
  const [notes, setNotes] = useState('');

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflow: 'auto' }}
    >
      {/* 필수 정보 */}
      <div className="detail-section">
        <div className="detail-section-header">필수 정보</div>
        <div className="detail-section-body">
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px 14px', alignItems: 'center' }}>
            <label className="form-label">회사 *</label>
            <div className="filter-bar">
              {COMPANIES.map((co) => (
                <button type="button" key={co} className={`chip ${company === co ? 'active' : ''}`} onClick={() => setCompany(co)}>
                  {co}
                </button>
              ))}
            </div>

            <label className="form-label">차량상태 *</label>
            <div className="filter-bar">
              {VEHICLE_STATUSES.map((s) => (
                <button type="button" key={s} className={`chip ${vehicleStatus === s ? 'active' : ''}`} onClick={() => setVehicleStatus(s)}>
                  {s}
                </button>
              ))}
            </div>

            <label className="form-label">차종 *</label>
            <input className="input" required placeholder="예: 카니발하이리무진" value={model} onChange={(e) => setModel(e.target.value)} />

            <label className="form-label">차량번호</label>
            <input
              className="input"
              placeholder={vehicleStatus === '구매대기' ? '미정 (구매 후 입력)' : '예: 109호1234'}
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              style={{ width: 240 }}
            />
          </div>
        </div>
      </div>

      {/* 차량 기본정보 */}
      <div className="detail-section">
        <div className="detail-section-header">차량 기본 정보</div>
        <div className="detail-section-body">
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px 1fr', gap: '10px 14px', alignItems: 'center' }}>
            <label className="form-label">차대번호</label>
            <input className="input" placeholder="예: KMHJ381ABLU123456" value={vin} onChange={(e) => setVin(e.target.value)} />

            <label className="form-label">연식</label>
            <input className="input" placeholder="예: 2024" value={year} onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 120 }} />

            <label className="form-label">색상</label>
            <input className="input" placeholder="예: 화이트" value={color} onChange={(e) => setColor(e.target.value)} />

            <label className="form-label">연료</label>
            <input className="input" placeholder="예: 가솔린 / 디젤 / 하이브리드" value={fuel} onChange={(e) => setFuel(e.target.value)} />

            <label className="form-label">매입일</label>
            <input type="date" className="input" value={purchasedDate} onChange={(e) => setPurchasedDate(e.target.value)} style={{ width: 200 }} />

            <label className="form-label">매입가</label>
            <input className="input" placeholder="원 단위" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 200 }} />

            <label className="form-label">보험연령</label>
            <input className="input" value={insuranceAge} onChange={(e) => setInsuranceAge(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 120 }} />
            <div style={{ gridColumn: 'span 2' }} />

            <label className="form-label" style={{ alignSelf: 'start', paddingTop: 6 }}>비고</label>
            <textarea
              className="input"
              rows={2}
              placeholder="발주처 · 옵션 · 특이사항 등"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ height: 'auto', padding: '8px 12px', resize: 'vertical', gridColumn: 'span 3' }}
            />
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-weak)' }}>
            ↑ 필수 4개만 작성해도 등록 가능. 나머지는 상세 페이지에서 추가/수정.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: 8, position: 'sticky', bottom: 0, background: 'var(--bg-card)', paddingTop: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={!model}>
          <CheckCircle size={14} /> 차량 등록
        </button>
      </div>
    </form>
  );
}

function VehicleOcrPane({ onSubmit }: { onSubmit: () => void }) {
  const [busy, setBusy] = useState(false);
  const [extracted, setExtracted] = useState<{ plate: string; model: string; company: string } | null>(null);

  function handleImage(file: File) {
    setBusy(true);
    // mock OCR — 실제로는 Vision API 등 호출
    setTimeout(() => {
      setExtracted({
        plate: '109호' + Math.floor(1000 + Math.random() * 9000),
        model: '신형G90',
        company: '아이카',
      });
      setBusy(false);
    }, 1400);
  }

  if (busy) {
    return (
      <div className="dropzone" style={{ minHeight: 320, cursor: 'default', flex: 1 }}>
        <div className="dropzone-icon">
          <CircleNotch size={28} weight="bold" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
        <div className="dropzone-title">OCR 처리 중...</div>
        <div className="dropzone-desc">자동차등록증을 분석하고 있습니다 (약 1~2초)</div>
      </div>
    );
  }

  if (extracted) {
    return (
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
        style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}
      >
        <div className="detail-section">
          <div className="detail-section-header" style={{ color: 'var(--green-text)' }}>
            <CheckCircle size={12} weight="duotone" />
            <span style={{ flex: 1 }}>OCR 추출 완료 — 확인 후 저장</span>
            <button type="button" className="btn btn-sm" onClick={() => setExtracted(null)}>다시 스캔</button>
          </div>
          <div className="detail-section-body">
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px 14px', alignItems: 'center' }}>
              <label className="form-label">회사</label>
              <input className="input" value={extracted.company} onChange={(e) => setExtracted({ ...extracted, company: e.target.value })} style={{ width: 200 }} />
              <label className="form-label">차종</label>
              <input className="input" value={extracted.model} onChange={(e) => setExtracted({ ...extracted, model: e.target.value })} />
              <label className="form-label">차량번호</label>
              <input className="input" value={extracted.plate} onChange={(e) => setExtracted({ ...extracted, plate: e.target.value })} style={{ width: 240 }} />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={() => setExtracted(null)}>취소</button>
          <button type="submit" className="btn btn-primary">
            <CheckCircle size={14} /> 등록
          </button>
        </div>
      </form>
    );
  }

  return (
    <div
      className="dropzone"
      style={{ minHeight: 320, flex: 1 }}
      onClick={() => document.getElementById('icar-ocr-file')?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) handleImage(f);
      }}
    >
      <input
        id="icar-ocr-file"
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) handleImage(e.target.files[0]); }}
      />
      <div className="dropzone-icon">
        <Camera size={28} weight="duotone" />
      </div>
      <div className="dropzone-title">자동차등록증 스캔</div>
      <div className="dropzone-desc">
        등록증 사진(.jpg/.png) 또는 스캔본(.pdf) 업로드 시<br />
        차량번호 · 차종 · 회사를 자동 추출합니다
      </div>
      <button className="btn btn-primary" type="button" onClick={(e) => { e.stopPropagation(); document.getElementById('icar-ocr-file')?.click(); }}>
        <Camera size={14} /> 이미지 선택
      </button>
      <div className="dropzone-hint">또는 여기에 끌어다 놓기</div>
    </div>
  );
}

function VehicleExcelPane() {
  return (
    <div className="dropzone" style={{ minHeight: 200, flex: 1, cursor: 'default' }}>
      <div className="dropzone-icon">
        <FileXls size={28} weight="duotone" />
      </div>
      <div className="dropzone-title">엑셀 일괄 등록</div>
      <div className="dropzone-desc">기존 차량 리스트를 엑셀로 일괄 등록 (다음 라운드)</div>
      <button
        className="btn"
        type="button"
        onClick={() => downloadTemplate('차량등록_템플릿.xlsx', VEHICLE_COLUMNS)}
      >
        <DownloadSimple size={14} /> 템플릿 다운로드
      </button>
      <SchemaList columns={VEHICLE_COLUMNS} />
    </div>
  );
}

/* ─────────────── 계약 등록 Pane (개별 / OCR / 엑셀) ─────────────── */

function ContractRegisterPane({
  files, drag, onPick, onChangeKind, onClose,
}: {
  files: ParsedSheet[];
  drag: boolean;
  onPick: () => void;
  onChangeKind: (idx: number, k: UploadKind) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<VehicleMode>('manual');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <div className="filter-bar">
        <button type="button" className={`chip ${mode === 'manual' ? 'active' : ''}`} onClick={() => setMode('manual')}>
          <Keyboard size={11} /> 개별 입력
        </button>
        <button type="button" className={`chip ${mode === 'ocr' ? 'active' : ''}`} onClick={() => setMode('ocr')}>
          <Camera size={11} /> OCR (계약서)
        </button>
        <button type="button" className={`chip ${mode === 'excel' ? 'active' : ''}`} onClick={() => setMode('excel')}>
          <FileXls size={11} /> 엑셀 일괄
        </button>
      </div>

      {mode === 'manual' && <ContractManualForm onSubmit={() => { alert('mock: 계약 등록 완료'); onClose(); }} />}
      {mode === 'ocr' && <ContractOcrPane onSubmit={() => { alert('mock: OCR 계약 등록 완료'); onClose(); }} />}
      {mode === 'excel' && (
        <UploadPane
          files={files} drag={drag} onPick={onPick} onChangeKind={onChangeKind}
          emptyTitle="계약 엑셀 일괄"
          emptyDesc="여러 신규 계약을 한번에 등록"
          columns={CONTRACT_COLUMNS}
          templateName="계약생성_템플릿.xlsx"
        />
      )}
    </div>
  );
}

function ContractManualForm({ onSubmit }: { onSubmit: () => void }) {
  const [company, setCompany] = useState(COMPANIES[0]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone1, setCustomerPhone1] = useState('');
  const [regNo, setRegNo] = useState('');
  const [plate, setPlate] = useState('');
  const [model, setModel] = useState('');
  const [contractDate, setContractDate] = useState(new Date().toISOString().slice(0, 10));
  const [returnDate, setReturnDate] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [paymentDay, setPaymentDay] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState('이체');
  const [deposit, setDeposit] = useState('');
  const [manager, setManager] = useState('');
  const [notes, setNotes] = useState('');

  const valid = customerName && customerPhone1 && contractDate && monthlyRent;

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflow: 'auto' }}
    >
      <div className="detail-section">
        <div className="detail-section-header">필수 정보</div>
        <div className="detail-section-body">
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px 1fr', gap: '10px 14px', alignItems: 'center' }}>
            <label className="form-label">회사 *</label>
            <div className="filter-bar" style={{ gridColumn: 'span 3' }}>
              {COMPANIES.map((co) => (
                <button type="button" key={co} className={`chip ${company === co ? 'active' : ''}`} onClick={() => setCompany(co)}>
                  {co}
                </button>
              ))}
            </div>

            <label className="form-label">계약자명 *</label>
            <input className="input" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} />

            <label className="form-label">연락처 *</label>
            <input className="input" required placeholder="010-1234-5678" value={customerPhone1} onChange={(e) => setCustomerPhone1(e.target.value)} />

            <label className="form-label">계약일 *</label>
            <input type="date" className="input" required value={contractDate} onChange={(e) => setContractDate(e.target.value)} style={{ width: 200 }} />

            <label className="form-label">월 대여료 *</label>
            <input className="input" required placeholder="원 단위" value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 200 }} />
          </div>
        </div>
      </div>

      <div className="detail-section">
        <div className="detail-section-header">차량</div>
        <div className="detail-section-body">
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px 1fr', gap: '10px 14px', alignItems: 'center' }}>
            <label className="form-label">차량번호</label>
            <input className="input" placeholder="미정도 가능" value={plate} onChange={(e) => setPlate(e.target.value)} />

            <label className="form-label">차종</label>
            <input className="input" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="detail-section">
        <div className="detail-section-header">계약 조건 (선택)</div>
        <div className="detail-section-body">
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px 1fr', gap: '10px 14px', alignItems: 'center' }}>
            <label className="form-label">등록번호</label>
            <input className="input" placeholder="저장 시 마스킹" value={regNo} onChange={(e) => setRegNo(e.target.value)} />

            <label className="form-label">반납예정</label>
            <input type="date" className="input" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} style={{ width: 200 }} />

            <label className="form-label">결제일</label>
            <input className="input" placeholder="1~31" value={paymentDay} onChange={(e) => setPaymentDay(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 100 }} />

            <label className="form-label">결제방법</label>
            <input className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} />

            <label className="form-label">보증금</label>
            <input className="input" placeholder="원 단위" value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 200 }} />

            <label className="form-label">담당자</label>
            <input className="input" value={manager} onChange={(e) => setManager(e.target.value)} />

            <label className="form-label" style={{ alignSelf: 'start', paddingTop: 6 }}>비고</label>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              style={{ height: 'auto', padding: '8px 12px', resize: 'vertical', gridColumn: 'span 3' }} />
          </div>
        </div>
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: 8, position: 'sticky', bottom: 0, background: 'var(--bg-card)', paddingTop: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={!valid}>
          <CheckCircle size={14} /> 계약 등록
        </button>
      </div>
    </form>
  );
}

function ContractOcrPane({ onSubmit }: { onSubmit: () => void }) {
  const [busy, setBusy] = useState(false);
  const [extracted, setExtracted] = useState<{ customerName: string; customerPhone1: string; plate: string; monthlyRent: string } | null>(null);

  function handleImage(_file: File) {
    setBusy(true);
    setTimeout(() => {
      setExtracted({
        customerName: '이서윤',
        customerPhone1: '010-3344-5566',
        plate: '109호' + Math.floor(1000 + Math.random() * 9000),
        monthlyRent: '1500000',
      });
      setBusy(false);
    }, 1400);
  }

  if (busy) {
    return (
      <div className="dropzone" style={{ minHeight: 320, cursor: 'default', flex: 1 }}>
        <div className="dropzone-icon">
          <CircleNotch size={28} weight="bold" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
        <div className="dropzone-title">OCR 처리 중...</div>
        <div className="dropzone-desc">계약서를 분석하고 있습니다</div>
      </div>
    );
  }

  if (extracted) {
    return (
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
        style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}
      >
        <div className="detail-section">
          <div className="detail-section-header" style={{ color: 'var(--green-text)' }}>
            <CheckCircle size={12} weight="duotone" />
            <span style={{ flex: 1 }}>OCR 추출 완료 — 확인 후 저장</span>
            <button type="button" className="btn btn-sm" onClick={() => setExtracted(null)}>다시 스캔</button>
          </div>
          <div className="detail-section-body">
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px 14px', alignItems: 'center' }}>
              <label className="form-label">계약자명</label>
              <input className="input" value={extracted.customerName} onChange={(e) => setExtracted({ ...extracted, customerName: e.target.value })} />
              <label className="form-label">연락처</label>
              <input className="input" value={extracted.customerPhone1} onChange={(e) => setExtracted({ ...extracted, customerPhone1: e.target.value })} />
              <label className="form-label">차량번호</label>
              <input className="input" value={extracted.plate} onChange={(e) => setExtracted({ ...extracted, plate: e.target.value })} />
              <label className="form-label">월 대여료</label>
              <input className="input" value={extracted.monthlyRent} onChange={(e) => setExtracted({ ...extracted, monthlyRent: e.target.value.replace(/[^0-9]/g, '') })} />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={() => setExtracted(null)}>취소</button>
          <button type="submit" className="btn btn-primary"><CheckCircle size={14} /> 계약 등록</button>
        </div>
      </form>
    );
  }

  return (
    <div
      className="dropzone"
      style={{ minHeight: 320, flex: 1 }}
      onClick={() => document.getElementById('icar-ocr-contract')?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImage(f); }}
    >
      <input id="icar-ocr-contract" type="file" accept="image/*,.pdf" className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) handleImage(e.target.files[0]); }} />
      <div className="dropzone-icon"><Camera size={28} weight="duotone" /></div>
      <div className="dropzone-title">계약서 스캔</div>
      <div className="dropzone-desc">계약서 사진(.jpg/.png) 또는 스캔본(.pdf) — 계약자명·연락처·차량·금액 자동 추출</div>
      <button className="btn btn-primary" type="button" onClick={(e) => { e.stopPropagation(); document.getElementById('icar-ocr-contract')?.click(); }}>
        <Camera size={14} /> 이미지 선택
      </button>
      <div className="dropzone-hint">또는 여기에 끌어다 놓기</div>
    </div>
  );
}

/* ─────────────── 수납 등록 Pane (개별 / OCR / 엑셀) ─────────────── */

function PaymentRegisterPane({
  files, drag, onPick, onChangeKind, onClose,
}: {
  files: ParsedSheet[];
  drag: boolean;
  onPick: () => void;
  onChangeKind: (idx: number, k: UploadKind) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<VehicleMode>('manual');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <div className="filter-bar">
        <button type="button" className={`chip ${mode === 'manual' ? 'active' : ''}`} onClick={() => setMode('manual')}>
          <Keyboard size={11} /> 개별 입력
        </button>
        <button type="button" className={`chip ${mode === 'ocr' ? 'active' : ''}`} onClick={() => setMode('ocr')}>
          <Camera size={11} /> OCR (영수증)
        </button>
        <button type="button" className={`chip ${mode === 'excel' ? 'active' : ''}`} onClick={() => setMode('excel')}>
          <FileXls size={11} /> 엑셀 일괄
        </button>
      </div>

      {mode === 'manual' && <PaymentManualForm onSubmit={() => { alert('mock: 수납 등록 완료'); onClose(); }} />}
      {mode === 'ocr' && <PaymentOcrPane onSubmit={() => { alert('mock: OCR 수납 등록 완료'); onClose(); }} />}
      {mode === 'excel' && (
        <UploadPaneMulti
          files={files} drag={drag} onPick={onPick} onChangeKind={onChangeKind}
          groups={[
            { title: '계좌 입금', desc: '은행 거래내역 — 입금자 + 금액 자동 매칭', columns: BANK_TX_COLUMNS, templateName: '계좌입금_템플릿.xlsx' },
            { title: '카드 결제', desc: '카드사 매출 — 승인번호 + 금액 자동 매칭', columns: CARD_TX_COLUMNS, templateName: '카드결제_템플릿.xlsx' },
          ]}
        />
      )}
    </div>
  );
}

function PaymentManualForm({ onSubmit }: { onSubmit: () => void }) {
  const [kind, setKind] = useState<'계좌' | '카드'>('계좌');
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [counterparty, setCounterparty] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [approvalNo, setApprovalNo] = useState('');
  const [cardLast4, setCardLast4] = useState('');

  const valid = txDate && counterparty && amount;

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflow: 'auto' }}
    >
      <div className="detail-section">
        <div className="detail-section-header">필수 정보</div>
        <div className="detail-section-body">
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px 14px', alignItems: 'center' }}>
            <label className="form-label">종류 *</label>
            <div className="filter-bar">
              <button type="button" className={`chip ${kind === '계좌' ? 'active' : ''}`} onClick={() => setKind('계좌')}>계좌 입금</button>
              <button type="button" className={`chip ${kind === '카드' ? 'active' : ''}`} onClick={() => setKind('카드')}>카드 결제</button>
            </div>

            <label className="form-label">{kind === '계좌' ? '거래일자' : '승인일'} *</label>
            <input type="date" className="input" required value={txDate} onChange={(e) => setTxDate(e.target.value)} style={{ width: 200 }} />

            <label className="form-label">{kind === '계좌' ? '입금자' : '고객명'} *</label>
            <input className="input" required placeholder="계약자명과 자동 매칭" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />

            <label className="form-label">금액 *</label>
            <input className="input" required placeholder="원 단위" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 240 }} />

            {kind === '계좌' && (
              <>
                <label className="form-label">적요</label>
                <input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="5월 대여료 등" />
              </>
            )}

            {kind === '카드' && (
              <>
                <label className="form-label">승인번호</label>
                <input className="input" value={approvalNo} onChange={(e) => setApprovalNo(e.target.value)} placeholder="예: 20260514001" />

                <label className="form-label">카드 4자리</label>
                <input className="input" value={cardLast4} onChange={(e) => setCardLast4(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} style={{ width: 120 }} />
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: 8, position: 'sticky', bottom: 0, background: 'var(--bg-card)', paddingTop: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={!valid}>
          <CheckCircle size={14} /> 수납 등록
        </button>
      </div>
    </form>
  );
}

function PaymentOcrPane({ onSubmit }: { onSubmit: () => void }) {
  const [busy, setBusy] = useState(false);
  const [extracted, setExtracted] = useState<{ txDate: string; counterparty: string; amount: string } | null>(null);

  function handleImage(_file: File) {
    setBusy(true);
    setTimeout(() => {
      setExtracted({
        txDate: new Date().toISOString().slice(0, 10),
        counterparty: '김지영',
        amount: '850000',
      });
      setBusy(false);
    }, 1300);
  }

  if (busy) {
    return (
      <div className="dropzone" style={{ minHeight: 320, cursor: 'default', flex: 1 }}>
        <div className="dropzone-icon">
          <CircleNotch size={28} weight="bold" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
        <div className="dropzone-title">OCR 처리 중...</div>
        <div className="dropzone-desc">영수증/거래내역을 분석하고 있습니다</div>
      </div>
    );
  }

  if (extracted) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <div className="detail-section">
          <div className="detail-section-header" style={{ color: 'var(--green-text)' }}>
            <CheckCircle size={12} weight="duotone" />
            <span style={{ flex: 1 }}>OCR 추출 완료</span>
            <button type="button" className="btn btn-sm" onClick={() => setExtracted(null)}>다시 스캔</button>
          </div>
          <div className="detail-section-body">
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px 14px', alignItems: 'center' }}>
              <label className="form-label">일자</label>
              <input type="date" className="input" value={extracted.txDate} onChange={(e) => setExtracted({ ...extracted, txDate: e.target.value })} style={{ width: 200 }} />
              <label className="form-label">입금자</label>
              <input className="input" value={extracted.counterparty} onChange={(e) => setExtracted({ ...extracted, counterparty: e.target.value })} />
              <label className="form-label">금액</label>
              <input className="input" value={extracted.amount} onChange={(e) => setExtracted({ ...extracted, amount: e.target.value.replace(/[^0-9]/g, '') })} style={{ width: 240 }} />
            </div>
          </div>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={() => setExtracted(null)}>취소</button>
          <button type="submit" className="btn btn-primary"><CheckCircle size={14} /> 수납 등록</button>
        </div>
      </form>
    );
  }

  return (
    <div
      className="dropzone"
      style={{ minHeight: 320, flex: 1 }}
      onClick={() => document.getElementById('icar-ocr-pay')?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImage(f); }}
    >
      <input id="icar-ocr-pay" type="file" accept="image/*,.pdf" className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) handleImage(e.target.files[0]); }} />
      <div className="dropzone-icon"><Camera size={28} weight="duotone" /></div>
      <div className="dropzone-title">영수증 / 입금 확인 스캔</div>
      <div className="dropzone-desc">영수증·이체확인증 사진 — 일자·입금자·금액 자동 추출</div>
      <button className="btn btn-primary" type="button" onClick={(e) => { e.stopPropagation(); document.getElementById('icar-ocr-pay')?.click(); }}>
        <Camera size={14} /> 이미지 선택
      </button>
      <div className="dropzone-hint">또는 여기에 끌어다 놓기</div>
    </div>
  );
}

/* ─────────────── 이력 등록 Pane ─────────────── */

const VEHICLE_CATEGORIES: HistoryCategory[] = ['정비', '사고', '검사', '세차', '위반', '보험', '부품교체', '기타'];
const CONTRACT_CATEGORIES: HistoryCategory[] = ['연락기록', '분쟁', '클레임', '수납이슈', '메모', '기타'];

function HistoryAddPane({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Contract | null>(null);

  if (selected) {
    return <HistoryForm contract={selected} onBack={() => setSelected(null)} onSubmit={(scope) => {
      alert(`mock: ${selected.vehiclePlate} ${selected.customerName} ${scope === 'vehicle' ? '차량' : '계약'} 이력 등록 완료`);
      onClose();
    }} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div className="topbar-search" style={{ width: '100%', maxWidth: 'none' }}>
        <MagnifyingGlass size={14} className="icon" />
        <input
          className="input"
          autoFocus
          placeholder="차량번호 / 고객명 / 계약번호로 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <HistorySearchResults q={search} onPick={setSelected} />
    </div>
  );
}

function HistorySearchResults({ q, onPick }: { q: string; onPick: (c: Contract) => void }) {
  const matches = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return MOCK_CONTRACTS.filter((c) => {
      const hay = `${c.vehiclePlate} ${c.customerName} ${c.contractNo} ${c.vehicleModel} ${c.customerPhone1}`.toLowerCase();
      return hay.includes(query);
    }).slice(0, 20);
  }, [q]);

  if (!q.trim()) {
    return (
      <div className="dropzone" style={{ minHeight: 320, cursor: 'default' }}>
        <div className="dropzone-icon">
          <Car size={28} weight="duotone" />
        </div>
        <div className="dropzone-title">차량 검색</div>
        <div className="dropzone-desc">
          차량번호, 고객명, 계약번호 중 하나로 검색하면<br />
          매칭되는 계약 목록이 표시됩니다.
        </div>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="empty-state" style={{ minHeight: 280 }}>
        검색 결과 없음 — 다른 키워드로 시도해보세요
      </div>
    );
  }

  return (
    <div className="border rounded" style={{ overflow: 'auto' }}>
      {matches.map((c) => (
        <button key={c.id} onClick={() => onPick(c)} className="search-result-row" type="button">
          <span className="plate" style={{ minWidth: 92 }}>{c.vehiclePlate}</span>
          <span style={{ flex: 1, fontWeight: 500 }}>{c.customerName}</span>
          <span className="text-sub" style={{ fontSize: 11 }}>{c.vehicleModel}</span>
          <span className="text-weak" style={{ fontSize: 11 }}>{c.company}</span>
          <span className="text-weak mono" style={{ fontSize: 11 }}>{c.customerPhone1}</span>
        </button>
      ))}
    </div>
  );
}

function HistoryForm({
  contract, onBack, onSubmit,
}: { contract: Contract; onBack: () => void; onSubmit: (scope: HistoryScope) => void }) {
  const [scope, setScope] = useState<HistoryScope>('vehicle');
  const [category, setCategory] = useState<HistoryCategory>('정비');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState('');
  const [vendor, setVendor] = useState('');
  const [mileage, setMileage] = useState('');
  const [status, setStatus] = useState<'완료' | '진행' | '예정'>('완료');
  const [description, setDescription] = useState('');

  const categories = scope === 'vehicle' ? VEHICLE_CATEGORIES : CONTRACT_CATEGORIES;
  function changeScope(s: HistoryScope) {
    setScope(s);
    setCategory(s === 'vehicle' ? '정비' : '연락기록');
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(scope); }}
      style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}
    >
      <div className="detail-hero">
        <div className="detail-hero-main">
          <div className="detail-hero-name">{contract.customerName}</div>
          <div className="detail-hero-meta">
            <span className="plate">{contract.vehiclePlate}</span>
            <span>·</span>
            <span>{contract.vehicleModel}</span>
            <span>·</span>
            <span>{contract.company}</span>
          </div>
        </div>
        <button type="button" className="btn btn-sm" onClick={onBack}>
          <CaretLeft size={12} /> 다른 차량 선택
        </button>
      </div>

      <div className="detail-section">
        <div className="detail-section-header">
          <span className="icon"><Wrench size={12} weight="duotone" /></span>
          이력 정보
        </div>
        <div className="detail-section-body">
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px 14px', alignItems: 'center' }}>
            <label className="form-label">귀속</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button type="button" className={`chip ${scope === 'vehicle' ? 'active' : ''}`} onClick={() => changeScope('vehicle')}>
                <Car size={11} /> 차량 이력
              </button>
              <button type="button" className={`chip ${scope === 'contract' ? 'active' : ''}`} onClick={() => changeScope('contract')}>
                <ClipboardText size={11} /> 계약 이력
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-weak)', marginLeft: 6 }}>
                {scope === 'vehicle'
                  ? `→ ${contract.vehiclePlate} 번호에 영구 기록`
                  : `→ ${contract.contractNo} 계약에만 기록`}
              </span>
            </div>

            <label className="form-label">종류</label>
            <div className="filter-bar">
              {categories.map((cat) => (
                <button type="button" key={cat} className={`chip ${category === cat ? 'active' : ''}`} onClick={() => setCategory(cat)}>
                  {cat}
                </button>
              ))}
            </div>

            <label className="form-label">일자</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 180 }} />

            <label className="form-label">제목</label>
            <input className="input" placeholder="예: 엔진오일·필터 교환" value={title} onChange={(e) => setTitle(e.target.value)} required />

            <label className="form-label">처리상태</label>
            <div className="filter-bar">
              {(['완료', '진행', '예정'] as const).map((s) => (
                <button type="button" key={s} className={`chip ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>
                  {s}
                </button>
              ))}
            </div>

            <label className="form-label">비용</label>
            <input className="input" type="text" placeholder="원 단위"
              value={cost} onChange={(e) => setCost(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 200 }} />

            <label className="form-label">업체</label>
            <input className="input" placeholder="정비소 / 카센터 / 보험사" value={vendor} onChange={(e) => setVendor(e.target.value)} />

            <label className="form-label">주행거리</label>
            <input className="input" type="text" placeholder="km"
              value={mileage} onChange={(e) => setMileage(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 200 }} />

            <label className="form-label" style={{ alignSelf: 'start', paddingTop: 6 }}>메모</label>
            <textarea className="input" rows={4} placeholder="세부 내용 / 부품 / 처리 결과"
              value={description} onChange={(e) => setDescription(e.target.value)}
              style={{ height: 'auto', padding: '8px 12px', resize: 'vertical' }} />
          </div>
        </div>
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onBack}>취소</button>
        <button type="submit" className="btn btn-primary" disabled={!title}>
          <ClipboardText size={14} /> 이력 저장
        </button>
      </div>
    </form>
  );
}

function formatCell(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return formatCurrency(v) || String(v);
  return String(v);
}
