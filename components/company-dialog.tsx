'use client';

import { useMemo, useState } from 'react';
import {
  Buildings, Plus, CheckCircle, Camera, Trash, CircleNotch, Bank, Pencil, X, Warning,
} from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { usePenalties } from '@/lib/firebase/penalty-store';
import type { Company, BankAccount } from '@/lib/types';

type CompanyUsage = {
  name: string;
  contractCount: number;
  penaltyCount: number;
};

export function CompanyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { companies, add, update, remove } = useCompanies();
  const { contracts } = useContracts();
  const { penalties } = usePenalties();
  const [editing, setEditing] = useState<Company | null>(null);
  const [creating, setCreating] = useState(false);

  /** 계약·과태료 데이터에서 사용된 법인명 집계 */
  const usageByName = useMemo(() => {
    const m = new Map<string, CompanyUsage>();
    for (const c of contracts) {
      const n = c.company?.trim();
      if (!n) continue;
      const cur = m.get(n) ?? { name: n, contractCount: 0, penaltyCount: 0 };
      cur.contractCount++;
      m.set(n, cur);
    }
    // 과태료는 차량번호로 계약 매칭되므로 계약 통해 간접 집계됨. 별도 필드 없음.
    return m;
  }, [contracts, penalties]);

  /** 마스터에 미등록된 법인 — 계약/과태료에서 발견된 이름 중 마스터에 없는 것 */
  const unregistered = useMemo(() => {
    const registered = new Set(companies.map((c) => c.name.trim()));
    return Array.from(usageByName.values())
      .filter((u) => !registered.has(u.name))
      .sort((a, b) => b.contractCount - a.contractCount);
  }, [usageByName, companies]);

  function startCreate(prefilledName?: string) {
    setEditing({
      id: '',
      name: prefilledName ?? '',
      bizRegNo: '',
      corpRegNo: '',
      ceo: '',
      address: '',
      bizType: '',
      bizItem: '',
      accounts: [],
      notes: '',
      createdAt: new Date().toISOString(),
    });
    setCreating(true);
  }

  function startEdit(c: Company) {
    setEditing({ ...c, accounts: c.accounts ?? [] });
    setCreating(false);
  }

  async function save() {
    if (!editing) return;
    if (creating) {
      const { id, ...payload } = editing;
      await add(payload);
    } else {
      await update(editing);
    }
    setEditing(null);
    setCreating(false);
  }

  function cancel() {
    setEditing(null);
    setCreating(false);
  }

  async function clearAll() {
    if (companies.length === 0) return;
    if (!confirm(`등록된 회사 ${companies.length}곳을 모두 삭제할까요?\n\n계약·과태료 데이터(법인명 문자열)는 그대로 유지됩니다.\n이후 미등록 법인 섹션에서 다시 등록 가능합니다.`)) return;
    for (const c of companies) {
      await remove(c.id);
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) cancel(); }}>
      <DialogContent title="회사(법인) 마스터">
        <DialogBody style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
          {editing ? (
            <CompanyForm
              company={editing}
              onChange={setEditing}
              onSave={save}
              onCancel={cancel}
              isNew={creating}
            />
          ) : (
            <CompanyList
              companies={companies}
              unregistered={unregistered}
              usageByName={usageByName}
              onCreate={() => startCreate()}
              onCreateFromName={(name) => startCreate(name)}
              onEdit={startEdit}
              onRemove={(id) => {
                if (confirm('이 회사를 삭제하시겠습니까? (계약 데이터는 유지됨)')) void remove(id);
              }}
              onClearAll={clearAll}
            />
          )}
        </DialogBody>
        <DialogFooter>
          <div style={{ flex: 1 }} />
          <DialogClose asChild>
            <button className="btn" type="button">닫기</button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

/* ─────────────── 회사 리스트 ─────────────── */

function CompanyList({
  companies, unregistered, usageByName, onCreate, onCreateFromName, onEdit, onRemove, onClearAll,
}: {
  companies: Company[];
  unregistered: CompanyUsage[];
  usageByName: Map<string, CompanyUsage>;
  onCreate: () => void;
  onCreateFromName: (name: string) => void;
  onEdit: (c: Company) => void;
  onRemove: (id: string) => void;
  onClearAll: () => void | Promise<void>;
}) {
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, flex: 1, overflow: 'auto' }}>
      {/* ───── 미등록 법인 — 계약·과태료에서 발견됨 ───── */}
      {unregistered.length > 0 && (
        <div className="detail-section" style={{ borderColor: 'var(--orange-border)' }}>
          <div className="detail-section-header" style={{ background: 'var(--orange-bg)', color: 'var(--orange-text)' }}>
            <span className="icon"><Warning size={12} weight="duotone" /></span>
            <span style={{ flex: 1 }}>미등록 법인 — 계약·과태료에 쓰이는 법인 ({unregistered.length}곳)</span>
            <span style={{ fontSize: 10, opacity: 0.8 }}>+등록 버튼으로 마스터에 추가</span>
          </div>
          <div className="detail-section-body" style={{ padding: 0 }}>
            <table className="table" style={{ marginBottom: 0 }}>
              <thead>
                <tr>
                  <th>법인명</th>
                  <th className="num" style={{ width: 90 }}>계약 건수</th>
                  <th className="center" style={{ width: 100 }}>등록</th>
                </tr>
              </thead>
              <tbody>
                {unregistered.map((u) => (
                  <tr key={u.name}>
                    <td style={{ fontWeight: 500 }}>{u.name}</td>
                    <td className="num mono dim">{u.contractCount > 0 ? `${u.contractCount}건` : '-'}</td>
                    <td className="center">
                      <button className="btn btn-sm btn-primary" type="button" onClick={() => onCreateFromName(u.name)}>
                        <Plus size={11} weight="bold" /> 등록
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ───── 등록된 회사 ───── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Buildings size={14} weight="duotone" style={{ color: 'var(--text-sub)' }} />
        <div style={{ fontSize: 12, fontWeight: 600 }}>등록된 회사 {companies.length}곳</div>
        <div style={{ flex: 1 }} />
        {companies.length > 0 && (
          <button
            className="btn btn-sm"
            type="button"
            onClick={onClearAll}
            style={{ color: 'var(--red-text)' }}
            title="등록된 회사 전체 삭제 (계약·과태료 데이터는 유지)"
          >
            <Trash size={11} /> 전체 삭제
          </button>
        )}
        <button className="btn btn-primary" type="button" onClick={onCreate}>
          <Plus size={14} weight="bold" /> 신규 회사 등록
        </button>
      </div>

      {companies.length === 0 ? (
        <div className="empty-state" style={{ minHeight: 120 }}>
          등록된 회사가 없습니다.<br />
          <span style={{ fontSize: 11 }}>
            {unregistered.length > 0
              ? '↑ 미등록 법인 섹션의 등록 버튼 또는 + 신규 회사 등록으로 시작하세요.'
              : '+ 신규 회사 등록 버튼으로 시작하세요.'}
          </span>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>회사명</th>
              <th className="num" style={{ width: 76 }}>사용</th>
              <th>대표자</th>
              <th className="mono">사업자등록번호</th>
              <th className="mono">법인등록번호</th>
              <th className="center">계좌</th>
              <th className="center" style={{ width: 100 }}>액션</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => {
              const usage = usageByName.get(c.name.trim());
              return (
                <tr key={c.id} onDoubleClick={() => onEdit(c)}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td className="num mono dim">{usage?.contractCount ? `${usage.contractCount}건` : <span className="muted">-</span>}</td>
                  <td className="dim">{c.ceo || '-'}</td>
                  <td className="mono dim">{c.bizRegNo || '-'}</td>
                  <td className="mono dim">{c.corpRegNo || '-'}</td>
                  <td className="center">{c.accounts?.length ?? 0}</td>
                  <td className="center" onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-sm" type="button" onClick={() => onEdit(c)}>
                      <Pencil size={11} /> 수정
                    </button>
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => onRemove(c.id)}
                      style={{ marginLeft: 4, color: 'var(--red-text)' }}
                    >
                      <Trash size={11} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ─────────────── 회사 폼 (신규/수정) ─────────────── */

function CompanyForm({
  company, onChange, onSave, onCancel, isNew,
}: {
  company: Company;
  onChange: (c: Company) => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  isNew: boolean;
}) {
  const [ocrBusy, setOcrBusy] = useState(false);

  function handleOcr(_file: File) {
    setOcrBusy(true);
    // mock OCR — 실제 사업자등록증/법인등기부 추출 자리. 1.4초 후 mock 채움.
    setTimeout(() => {
      onChange({
        ...company,
        name: company.name || '(주)○○',
        bizRegNo: company.bizRegNo || '000-00-00000',
        corpRegNo: company.corpRegNo || '000000-0000000',
        ceo: company.ceo || '대표자',
        address: company.address || '주소',
        bizType: company.bizType || '업태',
        bizItem: company.bizItem || '종목',
      });
      setOcrBusy(false);
    }, 1400);
  }

  function addAccount() {
    const newAcc: BankAccount = {
      id: `acc-${Date.now()}`,
      bankName: '',
      accountNo: '',
      accountHolder: company.name,
      purpose: '대여료수납',
      isDefault: (company.accounts?.length ?? 0) === 0,
    };
    onChange({ ...company, accounts: [...(company.accounts ?? []), newAcc] });
  }

  function updateAccount(idx: number, patch: Partial<BankAccount>) {
    const next = [...(company.accounts ?? [])];
    next[idx] = { ...next[idx], ...patch };
    onChange({ ...company, accounts: next });
  }

  function removeAccount(idx: number) {
    const next = [...(company.accounts ?? [])];
    next.splice(idx, 1);
    onChange({ ...company, accounts: next });
  }

  const canSave = !!company.name?.trim();

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, flex: 1, overflow: 'auto' }}>
      {/* OCR 영역 */}
      <div className="detail-section">
        <div className="detail-section-header">
          <span className="icon"><Camera size={12} weight="duotone" /></span>
          사업자등록증 OCR (선택)
        </div>
        <div className="detail-section-body">
          {ocrBusy ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, color: 'var(--text-sub)' }}>
              <CircleNotch size={16} weight="bold" style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 12 }}>사업자등록증 분석 중...</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                id="company-ocr-file"
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleOcr(e.target.files[0]); }}
              />
              <button
                className="btn"
                type="button"
                onClick={() => document.getElementById('company-ocr-file')?.click()}
              >
                <Camera size={14} /> 등록증 이미지 업로드
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-weak)' }}>
                사업자등록증 사진/스캔(.jpg/.png/.pdf) → 회사명·사업자번호·대표자·주소 자동 추출
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 기본 정보 */}
      <div className="detail-section">
        <div className="detail-section-header">기본 정보</div>
        <div className="detail-section-body">
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px 1fr', gap: '10px 14px', alignItems: 'center' }}>
            <label className="form-label">회사명 *</label>
            <input
              className="input"
              required
              value={company.name}
              onChange={(e) => onChange({ ...company, name: e.target.value })}
              placeholder="회사명"
            />

            <label className="form-label">대표자</label>
            <input
              className="input"
              value={company.ceo ?? ''}
              onChange={(e) => onChange({ ...company, ceo: e.target.value })}
            />

            <label className="form-label">사업자등록번호</label>
            <input
              className="input mono"
              value={company.bizRegNo ?? ''}
              onChange={(e) => onChange({ ...company, bizRegNo: e.target.value })}
              placeholder="123-45-67890"
            />

            <label className="form-label">법인등록번호</label>
            <input
              className="input mono"
              value={company.corpRegNo ?? ''}
              onChange={(e) => onChange({ ...company, corpRegNo: e.target.value })}
              placeholder="110111-1234567"
            />

            <label className="form-label">업태</label>
            <input
              className="input"
              value={company.bizType ?? ''}
              onChange={(e) => onChange({ ...company, bizType: e.target.value })}
              placeholder="예: 서비스업"
            />

            <label className="form-label">종목</label>
            <input
              className="input"
              value={company.bizItem ?? ''}
              onChange={(e) => onChange({ ...company, bizItem: e.target.value })}
              placeholder="예: 자동차 렌탈"
            />

            <label className="form-label">주소</label>
            <input
              className="input"
              value={company.address ?? ''}
              onChange={(e) => onChange({ ...company, address: e.target.value })}
              style={{ gridColumn: 'span 3' }}
            />
          </div>
        </div>
      </div>

      {/* 계좌 */}
      <div className="detail-section">
        <div className="detail-section-header">
          <span className="icon"><Bank size={12} weight="duotone" /></span>
          <span style={{ flex: 1 }}>계좌 ({company.accounts?.length ?? 0}개)</span>
          <button className="btn btn-sm" type="button" onClick={addAccount}>
            <Plus size={11} weight="bold" /> 계좌 추가
          </button>
        </div>
        <div className="detail-section-body">
          {(company.accounts?.length ?? 0) === 0 ? (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--text-weak)', textAlign: 'center' }}>
              등록된 계좌가 없습니다. 계좌 추가 버튼으로 등록하세요.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {company.accounts.map((acc, idx) => (
                <div
                  key={acc.id}
                  style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr 110px 32px', gap: 8, alignItems: 'center' }}
                >
                  <input
                    className="input"
                    placeholder="은행"
                    value={acc.bankName}
                    onChange={(e) => updateAccount(idx, { bankName: e.target.value })}
                  />
                  <input
                    className="input mono"
                    placeholder="계좌번호"
                    value={acc.accountNo}
                    onChange={(e) => updateAccount(idx, { accountNo: e.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="예금주"
                    value={acc.accountHolder}
                    onChange={(e) => updateAccount(idx, { accountHolder: e.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="용도"
                    value={acc.purpose ?? ''}
                    onChange={(e) => updateAccount(idx, { purpose: e.target.value })}
                  />
                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={() => removeAccount(idx)}
                    style={{ color: 'var(--red-text)', padding: '0 6px' }}
                    title="계좌 삭제"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 'auto', position: 'sticky', bottom: 0, background: 'var(--bg-card)', paddingTop: 8 }}>
        <button className="btn" type="button" onClick={onCancel}>취소</button>
        <button className="btn btn-primary" type="button" onClick={onSave} disabled={!canSave}>
          <CheckCircle size={14} /> {isNew ? '등록' : '저장'}
        </button>
      </div>
    </div>
  );
}
