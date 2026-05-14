'use client';

import { useState } from 'react';
import { CheckCircle, FileArrowUp, Keyboard, Camera, CircleNotch } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Penalty, PenaltyDocType } from '@/lib/types-penalty';
import { TODAY } from '@/lib/mock-data';

type Mode = 'manual' | 'ocr';
const DOC_TYPES: PenaltyDocType[] = ['과태료', '범칙금', '통행료', '속도위반', '주정차위반', '신호위반', '기타'];

export function PenaltyRegisterDialog({
  open, onOpenChange, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (p: Omit<Penalty, 'id'>) => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>('manual');

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent title="과태료 등록">
        <DialogBody className="p-0" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div className="filter-bar">
              <button className={`chip ${mode === 'manual' ? 'active' : ''}`} onClick={() => setMode('manual')}>
                <Keyboard size={11} /> 개별 입력
              </button>
              <button className={`chip ${mode === 'ocr' ? 'active' : ''}`} onClick={() => setMode('ocr')}>
                <Camera size={11} /> OCR (고지서 스캔)
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
            {mode === 'manual' ? <ManualForm onSubmit={onSubmit} /> : <OcrPane onSubmit={onSubmit} />}
          </div>
        </DialogBody>
        <DialogFooter>
          <div className="flex-1" />
          <DialogClose asChild>
            <button className="btn">닫기</button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

function ManualForm({ onSubmit }: { onSubmit: (p: Omit<Penalty, 'id'>) => Promise<void> }) {
  const [docType, setDocType] = useState<PenaltyDocType>('과태료');
  const [noticeNo, setNoticeNo] = useState('');
  const [issuer, setIssuer] = useState('');
  const [issueDate, setIssueDate] = useState(TODAY);
  const [violationDate, setViolationDate] = useState('');
  const [carNumber, setCarNumber] = useState('');
  const [description, setDescription] = useState('');
  const [violationLocation, setViolationLocation] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');

  const valid = noticeNo && carNumber && violationDate && amount;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    void onSubmit({
      docType,
      noticeNo,
      issuer,
      issueDate,
      violationDate,
      carNumber,
      description,
      violationLocation,
      amount: parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0,
      dueDate: dueDate || undefined,
      status: '접수',
      createdAt: new Date().toISOString(),
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="detail-section">
        <div className="detail-section-header">필수 정보</div>
        <div className="detail-section-body">
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px 1fr', gap: '10px 14px', alignItems: 'center' }}>
            <label className="form-label">종류 *</label>
            <div className="filter-bar" style={{ gridColumn: 'span 3' }}>
              {DOC_TYPES.map((t) => (
                <button type="button" key={t} className={`chip ${docType === t ? 'active' : ''}`} onClick={() => setDocType(t)}>
                  {t}
                </button>
              ))}
            </div>

            <label className="form-label">통지번호 *</label>
            <input className="input" required value={noticeNo} onChange={(e) => setNoticeNo(e.target.value)} placeholder="예: 2026-A-12345" />

            <label className="form-label">차량번호 *</label>
            <input className="input" required value={carNumber} onChange={(e) => setCarNumber(e.target.value)} placeholder="예: 109호1234" />

            <label className="form-label">위반일 *</label>
            <input type="date" className="input" required value={violationDate} onChange={(e) => setViolationDate(e.target.value)} style={{ width: 200 }} />

            <label className="form-label">금액 *</label>
            <input className="input" required value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} placeholder="원" style={{ width: 200 }} />
          </div>
        </div>
      </div>

      <div className="detail-section">
        <div className="detail-section-header">선택 정보</div>
        <div className="detail-section-body">
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px 1fr', gap: '10px 14px', alignItems: 'center' }}>
            <label className="form-label">발급일</label>
            <input type="date" className="input" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} style={{ width: 200 }} />

            <label className="form-label">발급기관</label>
            <input className="input" value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="예: 서울지방경찰청" />

            <label className="form-label">위반 장소</label>
            <input className="input" value={violationLocation} onChange={(e) => setViolationLocation(e.target.value)} placeholder="예: 강남대로 123" />

            <label className="form-label">납부기한</label>
            <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ width: 200 }} />

            <label className="form-label" style={{ alignSelf: 'start', paddingTop: 6 }}>위반 내용</label>
            <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="속도위반 20km/h 초과 등" style={{ height: 'auto', padding: '8px 12px', resize: 'vertical', gridColumn: 'span 3' }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" className="btn btn-primary" disabled={!valid}>
          <CheckCircle size={14} /> 과태료 등록
        </button>
      </div>
    </form>
  );
}

function OcrPane({ onSubmit }: { onSubmit: (p: Omit<Penalty, 'id'>) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [extracted, setExtracted] = useState<Omit<Penalty, 'id'> | null>(null);

  function handleImage(_file: File) {
    setBusy(true);
    // mock OCR
    setTimeout(() => {
      setExtracted({
        docType: '속도위반',
        noticeNo: '2026-S-' + Math.floor(10000 + Math.random() * 90000),
        issuer: '서울지방경찰청',
        issueDate: TODAY,
        violationDate: '2026-05-08',
        violationLocation: '강남대로 123',
        carNumber: '109호1234',
        description: '제한속도 위반 (20km/h 초과)',
        amount: 70000,
        status: '접수',
        createdAt: new Date().toISOString(),
      });
      setBusy(false);
    }, 1300);
  }

  if (busy) {
    return (
      <div className="dropzone" style={{ minHeight: 320, cursor: 'default' }}>
        <div className="dropzone-icon">
          <CircleNotch size={28} weight="bold" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
        <div className="dropzone-title">OCR 처리 중...</div>
        <div className="dropzone-desc">고지서를 분석하고 있습니다</div>
      </div>
    );
  }

  if (extracted) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="detail-section">
          <div className="detail-section-header" style={{ color: 'var(--green-text)' }}>
            <CheckCircle size={12} weight="duotone" />
            <span style={{ flex: 1, marginLeft: 6 }}>OCR 추출 완료 — 확인 후 저장</span>
            <button className="btn btn-sm" onClick={() => setExtracted(null)}>다시 스캔</button>
          </div>
          <div className="detail-section-body">
            <pre style={{ fontSize: 11, color: 'var(--text-sub)', whiteSpace: 'pre-wrap', margin: 0 }}>
              {JSON.stringify(extracted, null, 2)}
            </pre>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={() => setExtracted(null)}>취소</button>
          <button className="btn btn-primary" onClick={() => onSubmit(extracted)}>
            <CheckCircle size={14} /> 등록
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="dropzone"
      style={{ minHeight: 360 }}
      onClick={() => document.getElementById('icar-penalty-ocr')?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImage(f); }}
    >
      <input id="icar-penalty-ocr" type="file" accept="image/*,.pdf" className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) handleImage(e.target.files[0]); }} />
      <div className="dropzone-icon"><FileArrowUp size={28} weight="duotone" /></div>
      <div className="dropzone-title">과태료 고지서 스캔</div>
      <div className="dropzone-desc">고지서 사진(.jpg/.png) 또는 PDF — 통지번호·차량번호·위반정보·금액 자동 추출</div>
      <button className="btn btn-primary" type="button" onClick={(e) => { e.stopPropagation(); document.getElementById('icar-penalty-ocr')?.click(); }}>
        <Camera size={14} /> 파일 선택
      </button>
      <div className="dropzone-hint">또는 여기에 끌어다 놓기 · 여러 페이지 PDF 가능</div>
    </div>
  );
}
