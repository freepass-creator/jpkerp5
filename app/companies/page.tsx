'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  Buildings, Plus, CheckCircle, Camera, Trash, CircleNotch, Bank, Pencil, X, Warning, CreditCard,
  MapPin, FileText, Garage, Car, ArrowLeft, FloppyDisk,
} from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { audit } from '@/lib/firebase/audit-store';
import type {
  Company, BankAccount, CorporateCard, CompanyLocation, CompanyDocument, LocationKind,
} from '@/lib/types';

type Tab = 'info' | 'finance' | 'locations' | 'documents';

export default function CompaniesPage() {
  const { companies, add, update, remove } = useCompanies();
  const { contracts } = useContracts();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Company | null>(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<Tab>('info');

  const usageByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contracts) {
      const n = c.company?.trim();
      if (!n) continue;
      m.set(n, (m.get(n) ?? 0) + 1);
    }
    return m;
  }, [contracts]);

  const sortedCompanies = useMemo(
    () => [...companies].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [companies]
  );

  // 자동 선택 — 첫 번째 회사가 있으면 선택
  useEffect(() => {
    if (!selectedId && sortedCompanies.length > 0) {
      setSelectedId(sortedCompanies[0].id);
    }
  }, [selectedId, sortedCompanies]);

  const selected = selectedId ? sortedCompanies.find((c) => c.id === selectedId) : null;
  const isEditing = !!draft;

  function startCreate() {
    setDraft({
      id: '', code: '', name: '', bizRegNo: '', corpRegNo: '',
      ceo: '', address: '', bizType: '', bizItem: '',
      accounts: [], cards: [], locations: [], documents: [],
      notes: '', createdAt: new Date().toISOString(),
    });
    setCreating(true);
    setTab('info');
  }

  function startEdit() {
    if (!selected) return;
    setDraft({
      ...selected,
      accounts: selected.accounts ?? [],
      cards: selected.cards ?? [],
      locations: selected.locations ?? [],
      documents: selected.documents ?? [],
    });
    setCreating(false);
  }

  async function save() {
    if (!draft) return;
    if (creating) {
      const { id, ...payload } = draft;
      const newId = await add(payload);
      setSelectedId(newId);
      void audit.create('company', newId, `법인 등록 — ${draft.name}`, {
        name: draft.name, bizRegNo: draft.bizRegNo, corpRegNo: draft.corpRegNo,
      });
    } else {
      const before = sortedCompanies.find((c) => c.id === draft.id);
      await update(draft);
      void audit.update('company', draft.id, `법인 수정 — ${draft.name}`,
        before ? { name: before.name, bizRegNo: before.bizRegNo, corpRegNo: before.corpRegNo } : undefined,
        { name: draft.name, bizRegNo: draft.bizRegNo, corpRegNo: draft.corpRegNo },
      );
    }
    setDraft(null);
    setCreating(false);
  }

  function cancel() {
    setDraft(null);
    setCreating(false);
  }

  // 미등록 법인 검출 — 계약 데이터에 있지만 마스터에 없는 회사명
  const registered = new Set(sortedCompanies.map((c) => c.name.trim()));
  const unregistered = Array.from(usageByName.entries())
    .filter(([name]) => !registered.has(name))
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 14, color: 'var(--text-main)' }}>
            <Buildings size={16} weight="fill" style={{ color: 'var(--text-sub)' }} />
            법인 관리
          </div>
        </header>

        <div className="page-shell">
          {/* ───── 좌측: 법인 리스트 ───── */}
          <aside className="page-shell-nav">
            {sortedCompanies.length === 0 && unregistered.length === 0 ? (
              isEditing ? null : (
                <div className="empty-state" style={{ minHeight: 200 }}>
                  등록된 법인이 없습니다.<br />
                  <span style={{ fontSize: 11 }}>+ 신규 법인 으로 시작하세요.</span>
                </div>
              )
            ) : (
              <>
                {sortedCompanies.map((c) => {
                  const isActive = selectedId === c.id && !creating;
                  const count = usageByName.get(c.name.trim()) ?? 0;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`page-shell-nav-card ${isActive ? 'active' : ''}`}
                      onClick={() => { setSelectedId(c.id); setDraft(null); }}
                    >
                      <div className="page-shell-nav-card-icon">
                        <Buildings size={16} weight={isActive ? 'fill' : 'regular'} />
                      </div>
                      <div className="page-shell-nav-card-main">
                        <div className="page-shell-nav-card-name">
                          {c.code && <span className="mono" style={{ color: 'var(--brand)', marginRight: 6 }}>{c.code}</span>}
                          {c.name}
                        </div>
                        <div className="page-shell-nav-card-meta">
                          {c.bizRegNo && <span className="mono">{c.bizRegNo}</span>}
                          {!c.bizRegNo && <span className="muted">사업자번호 미등록</span>}
                        </div>
                        <div className="page-shell-nav-card-stats">
                          <span>계약 {count}</span>
                          <span>·</span>
                          <span>계좌 {c.accounts?.length ?? 0}</span>
                          <span>·</span>
                          <span>카드 {c.cards?.length ?? 0}</span>
                          <span>·</span>
                          <span>거점 {c.locations?.length ?? 0}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {unregistered.length > 0 && (
                  <>
                    <div className="page-shell-nav-divider">미등록 법인 (계약에서 발견)</div>
                    {unregistered.map((u) => (
                      <button
                        key={u.name}
                        type="button"
                        className="page-shell-nav-card unregistered"
                        onClick={() => {
                          setDraft({
                            id: '', code: '', name: u.name, bizRegNo: '', corpRegNo: '',
                            ceo: '', address: '', bizType: '', bizItem: '',
                            accounts: [], cards: [], locations: [], documents: [],
                            notes: '', createdAt: new Date().toISOString(),
                          });
                          setCreating(true);
                          setTab('info');
                        }}
                        title="클릭하여 등록"
                      >
                        <div className="page-shell-nav-card-icon" style={{ background: 'var(--orange-bg)', color: 'var(--orange-text)' }}>
                          <Warning size={14} weight="fill" />
                        </div>
                        <div className="page-shell-nav-card-main">
                          <div className="page-shell-nav-card-name">{u.name}</div>
                          <div className="page-shell-nav-card-meta" style={{ color: 'var(--orange-text)' }}>미등록 — 클릭하여 등록</div>
                          <div className="page-shell-nav-card-stats">
                            <span>계약 {u.count}건에서 사용</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </aside>

          {/* ───── 우측: 선택된 법인 상세 ───── */}
          <main className="page-shell-main">
            {isEditing && draft ? (
              <CompanyEditor
                draft={draft}
                onChange={setDraft}
                onSave={save}
                onCancel={cancel}
                tab={tab}
                onTabChange={setTab}
                isNew={creating}
              />
            ) : selected ? (
              <CompanyView
                company={selected}
                contractCount={usageByName.get(selected.name.trim()) ?? 0}
                tab={tab}
                onTabChange={setTab}
                onEdit={startEdit}
                onRemove={() => {
                  if (confirm(`"${selected.name}" 법인을 삭제하시겠습니까?\n계약 데이터는 유지됩니다.`)) {
                    void remove(selected.id).then(() => setSelectedId(null));
                  }
                }}
              />
            ) : (
              <div className="empty-state" style={{ minHeight: 320 }}>
                좌측에서 법인을 선택하세요.<br />
                <span style={{ fontSize: 11 }}>또는 + 신규 법인 으로 등록</span>
              </div>
            )}
          </main>
        </div>

        <BottomBar
          left={
            isEditing ? null : (
              <button className="btn btn-primary" type="button" onClick={startCreate}>
                <Plus weight="bold" /> 신규 법인
              </button>
            )
          }
          right={
            <>
              <span>법인 <strong>{sortedCompanies.length}</strong>곳</span>
              <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
              <span>계약 <strong>{contracts.length}</strong>건</span>
            </>
          }
        />
      </div>
    </div>
  );
}

/* ──────────────────── 탭 공통 ──────────────────── */

function CompanyTabs({ tab, onChange, counts }: {
  tab: Tab;
  onChange: (t: Tab) => void;
  counts?: { finance?: number; locations?: number; documents?: number };
}) {
  const finance = counts?.finance ?? 0;
  const locations = counts?.locations ?? 0;
  const documents = counts?.documents ?? 0;
  return (
    <nav className="page-shell-tabs">
      <button type="button" className={`tab ${tab === 'info' ? 'active' : ''}`} onClick={() => onChange('info')}>
        <Buildings weight={tab === 'info' ? 'fill' : 'regular'} /> 기본 정보
      </button>
      <button type="button" className={`tab ${tab === 'finance' ? 'active' : ''}`} onClick={() => onChange('finance')}>
        <Bank weight={tab === 'finance' ? 'fill' : 'regular'} /> 계좌·카드
        {finance > 0 && <span className="tab-count">{finance}</span>}
      </button>
      <button type="button" className={`tab ${tab === 'locations' ? 'active' : ''}`} onClick={() => onChange('locations')}>
        <MapPin weight={tab === 'locations' ? 'fill' : 'regular'} /> 거점
        {locations > 0 && <span className="tab-count">{locations}</span>}
      </button>
      <button type="button" className={`tab ${tab === 'documents' ? 'active' : ''}`} onClick={() => onChange('documents')}>
        <FileText weight={tab === 'documents' ? 'fill' : 'regular'} /> 서류
        {documents > 0 && <span className="tab-count">{documents}</span>}
      </button>
    </nav>
  );
}

/* ──────────────────── 보기 모드 ──────────────────── */

function CompanyView({
  company, contractCount, tab, onTabChange, onEdit, onRemove,
}: {
  company: Company;
  contractCount: number;
  tab: Tab;
  onTabChange: (t: Tab) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <header className="page-header">
        <div className="page-header-title-group">
          <h1 className="page-header-title">
            {company.code && <span className="mono" style={{ fontSize: 13, color: 'var(--brand)', fontWeight: 600 }}>{company.code}</span>}
            {company.name}
          </h1>
          <div className="page-header-title-sub">
            {company.bizRegNo && <span className="mono">{company.bizRegNo}</span>}
            {company.ceo && <> · 대표 {company.ceo}</>}
            <> · 계약 {contractCount}건</>
          </div>
        </div>
        <div className="page-header-actions">
          <button className="btn" type="button" onClick={onEdit}>
            <Pencil /> 수정
          </button>
          <button className="btn btn-danger" type="button" onClick={onRemove}>
            <Trash /> 삭제
          </button>
        </div>
      </header>

      <CompanyTabs
        tab={tab}
        onChange={onTabChange}
        counts={{
          finance: (company.accounts?.length ?? 0) + (company.cards?.length ?? 0),
          locations: company.locations?.length ?? 0,
          documents: company.documents?.length ?? 0,
        }}
      />

      {tab === 'info' && <InfoView company={company} />}
      {tab === 'finance' && <FinanceView company={company} />}
      {tab === 'locations' && <LocationsView company={company} />}
      {tab === 'documents' && <DocumentsView company={company} />}
    </div>
  );
}

function InfoView({ company }: { company: Company }) {
  return (
    <section className="detail-section">
      <div className="detail-section-header">기본 정보</div>
      <div className="detail-section-body">
        <div className="detail-grid-2">
          <div>
            <ViewField label="코드" value={company.code} mono />
            <ViewField label="회사명" value={company.name} />
            <ViewField label="대표자" value={company.ceo} />
            <ViewField label="사업자번호" value={company.bizRegNo} mono />
            <ViewField label="법인번호" value={company.corpRegNo} mono />
          </div>
          <div>
            <ViewField label="업태" value={company.bizType} />
            <ViewField label="종목" value={company.bizItem} />
            <ViewField label="주소" value={company.address} />
            <ViewField label="등록일" value={company.createdAt?.slice(0, 10)} mono />
          </div>
        </div>
      </div>
    </section>
  );
}

function FinanceView({ company }: { company: Company }) {
  const accounts = company.accounts ?? [];
  const cards = company.cards ?? [];
  return (
    <>
      <section className="detail-section">
        <div className="detail-section-header">
          <Bank size={12} weight="duotone" />
          <span className="title">계좌 ({accounts.length}개)</span>
        </div>
        <div className="detail-section-body" style={{ padding: 0 }}>
          {accounts.length === 0 ? <Empty msg="등록된 계좌가 없습니다." /> : (
            <table className="table">
              <thead><tr><th>은행</th><th className="mono">계좌번호</th><th>예금주</th><th>용도</th></tr></thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.bankName || '-'}</td>
                    <td className="mono">{a.accountNo || '-'}</td>
                    <td>{a.accountHolder || '-'}</td>
                    <td className="dim">{a.purpose || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="detail-section" style={{ marginTop: 14 }}>
        <div className="detail-section-header">
          <CreditCard size={12} weight="duotone" />
          <span className="title">법인 카드 ({cards.length}개)</span>
        </div>
        <div className="detail-section-body" style={{ padding: 0 }}>
          {cards.length === 0 ? <Empty msg="등록된 카드가 없습니다." /> : (
            <table className="table">
              <thead><tr><th>카드명</th><th>카드사</th><th className="mono">끝 4자리</th><th>명의자</th><th>용도</th></tr></thead>
              <tbody>
                {cards.map((c) => (
                  <tr key={c.id}>
                    <td>{c.cardName || '-'}</td>
                    <td>{c.cardCompany || '-'}</td>
                    <td className="mono">{c.cardLast4 || '-'}</td>
                    <td>{c.holder || '-'}</td>
                    <td className="dim">{c.purpose || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}

function LocationsView({ company }: { company: Company }) {
  const locations = company.locations ?? [];
  const offices = locations.filter((l) => l.kind === '사무실');
  const garages = locations.filter((l) => l.kind === '차고지');
  const parkings = locations.filter((l) => l.kind === '주차장');

  return (
    <>
      <LocationGroup title="사무실" icon={<Buildings size={12} weight="duotone" />} items={offices} />
      <LocationGroup title="차고지" icon={<Garage size={12} weight="duotone" />} items={garages} />
      <LocationGroup title="주차장" icon={<Car size={12} weight="duotone" />} items={parkings} showCapacity />
    </>
  );
}

function LocationGroup({ title, icon, items, showCapacity }: {
  title: string;
  icon: React.ReactNode;
  items: CompanyLocation[];
  showCapacity?: boolean;
}) {
  return (
    <section className="detail-section" style={{ marginBottom: 14 }}>
      <div className="detail-section-header">
        <span className="icon">{icon}</span>
        <span className="title">{title} ({items.length}곳)</span>
      </div>
      <div className="detail-section-body" style={{ padding: 0 }}>
        {items.length === 0 ? <Empty msg={`등록된 ${title}가 없습니다.`} /> : (
          <table className="table">
            <thead>
              <tr>
                <th>이름</th>
                <th>주소</th>
                <th className="mono">전화</th>
                {showCapacity && <th className="num">수용대수</th>}
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 500 }}>{l.name}</td>
                  <td className="dim">{l.address || '-'}</td>
                  <td className="mono dim">{l.phone || '-'}</td>
                  {showCapacity && <td className="num mono">{l.capacity ? `${l.capacity}대` : '-'}</td>}
                  <td className="dim">{l.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function DocumentsView({ company }: { company: Company }) {
  const docs = company.documents ?? [];
  return (
    <section className="detail-section">
      <div className="detail-section-header">
        <FileText size={12} weight="duotone" />
        <span className="title">서류 ({docs.length}개)</span>
      </div>
      <div className="detail-section-body" style={{ padding: 0 }}>
        {docs.length === 0 ? <Empty msg="등록된 서류가 없습니다." /> : (
          <table className="table">
            <thead><tr><th>제목</th><th>파일명</th><th className="mono">업로드일</th><th>비고</th></tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 500 }}>{d.title}</td>
                  <td className="dim mono">{d.fileName || '-'}</td>
                  <td className="mono dim">{d.uploadedAt?.slice(0, 10) || '-'}</td>
                  <td className="dim">{d.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/* ──────────────────── 편집 모드 ──────────────────── */

function CompanyEditor({
  draft, onChange, onSave, onCancel, tab, onTabChange, isNew,
}: {
  draft: Company;
  onChange: (c: Company) => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  tab: Tab;
  onTabChange: (t: Tab) => void;
  isNew: boolean;
}) {
  const canSave = !!draft.name?.trim();
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <header className="page-header">
        <div className="page-header-title-group">
          <h1 className="page-header-title">
            <Buildings size={16} weight="duotone" />
            {isNew ? '신규 법인 등록' : `${draft.name || '법인'} — 수정`}
          </h1>
          <div className="page-header-title-sub">
            {isNew ? '사업자등록증 OCR 또는 직접 입력으로 등록' : '회사 정보 / 계좌 / 거점 / 서류 수정'}
          </div>
        </div>
        <div className="page-header-actions">
          <button className="btn" type="button" onClick={onCancel}>
            <ArrowLeft /> 취소
          </button>
          <button className="btn btn-primary" type="button" onClick={onSave} disabled={!canSave}>
            <FloppyDisk weight="bold" /> {isNew ? '등록' : '저장'}
          </button>
        </div>
      </header>

      <CompanyTabs
        tab={tab}
        onChange={onTabChange}
        counts={{
          finance: (draft.accounts?.length ?? 0) + (draft.cards?.length ?? 0),
          locations: draft.locations?.length ?? 0,
          documents: draft.documents?.length ?? 0,
        }}
      />

      {tab === 'info' && <InfoEditor draft={draft} onChange={onChange} />}
      {tab === 'finance' && <FinanceEditor draft={draft} onChange={onChange} />}
      {tab === 'locations' && <LocationsEditor draft={draft} onChange={onChange} />}
      {tab === 'documents' && <DocumentsEditor draft={draft} onChange={onChange} />}
    </div>
  );
}

function InfoEditor({ draft, onChange }: { draft: Company; onChange: (c: Company) => void }) {
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);

  async function handleOcr(file: File) {
    setOcrBusy(true);
    setOcrError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'business_reg');
      const { getFirebaseAuth } = await import('@/lib/firebase/client');
      const auth = getFirebaseAuth();
      const user = auth?.currentUser;
      const idToken = user ? await user.getIdToken() : '';
      const res = await fetch('/api/ocr/extract', {
        method: 'POST',
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
        body: fd,
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'OCR 실패');
      const raw = json.extracted as Record<string, string | null>;
      onChange({
        ...draft,
        name: (raw.partner_name ?? draft.name) || draft.name,
        bizRegNo: raw.biz_no ?? draft.bizRegNo,
        corpRegNo: raw.corp_no ?? draft.corpRegNo,
        ceo: raw.ceo ?? draft.ceo,
        address: raw.address ?? draft.address,
        bizType: raw.industry ?? draft.bizType,
        bizItem: raw.category ?? draft.bizItem,
      });
    } catch (e) {
      setOcrError((e as Error).message ?? String(e));
    } finally {
      setOcrBusy(false);
    }
  }
  return (
    <>
      <section className="detail-section">
        <div className="detail-section-header">
          <Camera size={12} weight="duotone" />
          <span className="title">사업자등록증 OCR (선택)</span>
        </div>
        <div className="detail-section-body">
          {ocrBusy ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, color: 'var(--text-sub)' }}>
              <CircleNotch weight="bold" style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 12 }}>분석 중...</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <input id="companies-ocr-file" type="file" accept="image/*,.pdf" className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleOcr(e.target.files[0]); }} />
              <button className="btn btn-primary" type="button" onClick={() => document.getElementById('companies-ocr-file')?.click()}>
                <Camera weight="duotone" /> 등록증 이미지 업로드
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-weak)' }}>
                사업자등록증 사진/스캔 → 회사명·대표자·법인번호 자동 채움
              </span>
              {ocrError && (
                <span style={{ fontSize: 11, color: 'var(--red-text)' }}>오류: {ocrError}</span>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="detail-section" style={{ marginTop: 14 }}>
        <div className="detail-section-header">기본 정보</div>
        <div className="detail-section-body">
          <div className="form-grid-2">
            <label className="form-label">코드</label>
            <input
              className="input mono"
              value={draft.code ?? ''}
              onChange={(e) => onChange({ ...draft, code: e.target.value.toUpperCase() })}
              placeholder="자동 (CP01)"
            />
            <label className="form-label">사업자번호</label>
            <input className="input mono" value={draft.bizRegNo ?? ''} onChange={(e) => onChange({ ...draft, bizRegNo: e.target.value })} placeholder="000-00-00000" />

            <label className="form-label">회사명 *</label>
            <input className="input" required value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} placeholder="회사명" style={{ gridColumn: 'span 3' }} />

            <label className="form-label">대표자</label>
            <input className="input" value={draft.ceo ?? ''} onChange={(e) => onChange({ ...draft, ceo: e.target.value })} />
            <label className="form-label">법인번호</label>
            <input className="input mono" value={draft.corpRegNo ?? ''} onChange={(e) => onChange({ ...draft, corpRegNo: e.target.value })} placeholder="000000-0000000" />
            <label className="form-label">업태</label>
            <input className="input" value={draft.bizType ?? ''} onChange={(e) => onChange({ ...draft, bizType: e.target.value })} />
            <label className="form-label">종목</label>
            <input className="input" value={draft.bizItem ?? ''} onChange={(e) => onChange({ ...draft, bizItem: e.target.value })} />
            <label className="form-label">주소</label>
            <input className="input" value={draft.address ?? ''} onChange={(e) => onChange({ ...draft, address: e.target.value })} style={{ gridColumn: 'span 3' }} />
          </div>
        </div>
      </section>
    </>
  );
}

function FinanceEditor({ draft, onChange }: { draft: Company; onChange: (c: Company) => void }) {
  const accounts = draft.accounts ?? [];
  const cards = draft.cards ?? [];

  function setAccounts(next: BankAccount[]) { onChange({ ...draft, accounts: next }); }
  function setCards(next: CorporateCard[]) { onChange({ ...draft, cards: next }); }

  return (
    <>
      <section className="detail-section">
        <div className="detail-section-header">
          <Bank size={12} weight="duotone" />
          <span className="title">계좌 ({accounts.length}개)</span>
          <button className="btn btn-sm" type="button" onClick={() => setAccounts([...accounts, {
            id: `acc-${Date.now()}`, bankName: '', accountNo: '', accountHolder: draft.name, purpose: '대여료수납',
          }])}>
            <Plus weight="bold" /> 계좌 추가
          </button>
        </div>
        <div className="detail-section-body">
          {accounts.length === 0 ? <Empty msg="등록된 계좌가 없습니다." /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {accounts.map((a, idx) => (
                <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr 110px 32px', gap: 8, alignItems: 'center' }}>
                  <input className="input" placeholder="은행" value={a.bankName} onChange={(e) => { const next = [...accounts]; next[idx] = { ...a, bankName: e.target.value }; setAccounts(next); }} />
                  <input className="input mono" placeholder="계좌번호" value={a.accountNo} onChange={(e) => { const next = [...accounts]; next[idx] = { ...a, accountNo: e.target.value }; setAccounts(next); }} />
                  <input className="input" placeholder="예금주" value={a.accountHolder} onChange={(e) => { const next = [...accounts]; next[idx] = { ...a, accountHolder: e.target.value }; setAccounts(next); }} />
                  <input className="input" placeholder="용도" value={a.purpose ?? ''} onChange={(e) => { const next = [...accounts]; next[idx] = { ...a, purpose: e.target.value }; setAccounts(next); }} />
                  <button className="btn btn-sm btn-danger btn-icon" type="button" onClick={() => setAccounts(accounts.filter((_, i) => i !== idx))}>
                    <X />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="detail-section" style={{ marginTop: 14 }}>
        <div className="detail-section-header">
          <CreditCard size={12} weight="duotone" />
          <span className="title">법인 카드 ({cards.length}개)</span>
          <button className="btn btn-sm" type="button" onClick={() => setCards([...cards, {
            id: `card-${Date.now()}`, cardName: '', cardCompany: '', cardLast4: '', purpose: '차량유지비',
          }])}>
            <Plus weight="bold" /> 카드 추가
          </button>
        </div>
        <div className="detail-section-body">
          {cards.length === 0 ? <Empty msg="등록된 카드가 없습니다." /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cards.map((c, idx) => (
                <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 110px 110px 32px', gap: 8, alignItems: 'center' }}>
                  <input className="input" placeholder="카드명 (예: 법인 BC)" value={c.cardName} onChange={(e) => { const next = [...cards]; next[idx] = { ...c, cardName: e.target.value }; setCards(next); }} />
                  <input className="input" placeholder="카드사" value={c.cardCompany} onChange={(e) => { const next = [...cards]; next[idx] = { ...c, cardCompany: e.target.value }; setCards(next); }} />
                  <input className="input mono" placeholder="끝 4자리" value={c.cardLast4} onChange={(e) => { const next = [...cards]; next[idx] = { ...c, cardLast4: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) }; setCards(next); }} />
                  <input className="input" placeholder="명의자" value={c.holder ?? ''} onChange={(e) => { const next = [...cards]; next[idx] = { ...c, holder: e.target.value }; setCards(next); }} />
                  <input className="input" placeholder="용도" value={c.purpose ?? ''} onChange={(e) => { const next = [...cards]; next[idx] = { ...c, purpose: e.target.value }; setCards(next); }} />
                  <button className="btn btn-sm btn-danger btn-icon" type="button" onClick={() => setCards(cards.filter((_, i) => i !== idx))}>
                    <X />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function LocationsEditor({ draft, onChange }: { draft: Company; onChange: (c: Company) => void }) {
  const locations = draft.locations ?? [];
  function setLocations(next: CompanyLocation[]) { onChange({ ...draft, locations: next }); }
  function addLocation(kind: LocationKind) {
    setLocations([...locations, {
      id: `loc-${Date.now()}`, kind, name: '', address: '',
    }]);
  }

  const groups: Array<{ kind: LocationKind; icon: React.ReactNode; showCapacity?: boolean }> = [
    { kind: '사무실', icon: <Buildings size={12} weight="duotone" /> },
    { kind: '차고지', icon: <Garage size={12} weight="duotone" /> },
    { kind: '주차장', icon: <Car size={12} weight="duotone" />, showCapacity: true },
  ];

  return (
    <>
      {groups.map(({ kind, icon, showCapacity }) => {
        const items = locations.filter((l) => l.kind === kind);
        return (
          <section key={kind} className="detail-section" style={{ marginBottom: 14 }}>
            <div className="detail-section-header">
              <span className="icon">{icon}</span>
              <span className="title">{kind} ({items.length}곳)</span>
              <button className="btn btn-sm" type="button" onClick={() => addLocation(kind)}>
                <Plus weight="bold" /> 추가
              </button>
            </div>
            <div className="detail-section-body">
              {items.length === 0 ? <Empty msg={`등록된 ${kind}가 없습니다.`} /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {items.map((l) => {
                    const globalIdx = locations.indexOf(l);
                    const cols = showCapacity ? '160px 1fr 130px 90px 32px' : '160px 1fr 130px 32px';
                    return (
                      <div key={l.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center' }}>
                        <input className="input" placeholder="이름 (본사 / 강남지점)" value={l.name} onChange={(e) => {
                          const next = [...locations]; next[globalIdx] = { ...l, name: e.target.value }; setLocations(next);
                        }} />
                        <input className="input" placeholder="주소" value={l.address} onChange={(e) => {
                          const next = [...locations]; next[globalIdx] = { ...l, address: e.target.value }; setLocations(next);
                        }} />
                        <input className="input mono" placeholder="전화" value={l.phone ?? ''} onChange={(e) => {
                          const next = [...locations]; next[globalIdx] = { ...l, phone: e.target.value }; setLocations(next);
                        }} />
                        {showCapacity && (
                          <input className="input mono" placeholder="대수" value={l.capacity ?? ''} onChange={(e) => {
                            const next = [...locations]; next[globalIdx] = { ...l, capacity: Number(e.target.value.replace(/[^0-9]/g, '')) || undefined }; setLocations(next);
                          }} />
                        )}
                        <button className="btn btn-sm btn-danger btn-icon" type="button" onClick={() => setLocations(locations.filter((_, i) => i !== globalIdx))}>
                          <X />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </>
  );
}

function DocumentsEditor({ draft, onChange }: { draft: Company; onChange: (c: Company) => void }) {
  const docs = draft.documents ?? [];
  function setDocs(next: CompanyDocument[]) { onChange({ ...draft, documents: next }); }
  function addDoc() {
    setDocs([...docs, { id: `doc-${Date.now()}`, title: '', uploadedAt: new Date().toISOString() }]);
  }

  return (
    <section className="detail-section">
      <div className="detail-section-header">
        <FileText size={12} weight="duotone" />
        <span className="title">서류 ({docs.length}개)</span>
        <button className="btn btn-sm" type="button" onClick={addDoc}>
          <Plus weight="bold" /> 서류 추가
        </button>
      </div>
      <div className="detail-section-body">
        {docs.length === 0 ? <Empty msg="등록된 서류가 없습니다. 사업자등록증·법인등기부·인감증명 등 추가." /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {docs.map((d, idx) => (
              <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '180px 180px 1fr 32px', gap: 8, alignItems: 'center' }}>
                <input className="input" placeholder="제목 (사업자등록증)" value={d.title} onChange={(e) => { const next = [...docs]; next[idx] = { ...d, title: e.target.value }; setDocs(next); }} />
                <input className="input" placeholder="파일명" value={d.fileName ?? ''} onChange={(e) => { const next = [...docs]; next[idx] = { ...d, fileName: e.target.value }; setDocs(next); }} />
                <input className="input" placeholder="비고" value={d.notes ?? ''} onChange={(e) => { const next = [...docs]; next[idx] = { ...d, notes: e.target.value }; setDocs(next); }} />
                <button className="btn btn-sm btn-danger btn-icon" type="button" onClick={() => setDocs(docs.filter((_, i) => i !== idx))}>
                  <X />
                </button>
              </div>
            ))}
            <div style={{ fontSize: 11, color: 'var(--text-weak)', paddingTop: 4 }}>
              ※ 파일 업로드는 Phase 2 — 현재는 제목 + 파일명 메타데이터만 관리.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ──────────────────── helpers ──────────────────── */

function ViewField({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="detail-field">
      <span className="label">{label}</span>
      <span className={`value ${mono ? 'mono' : ''}`}>{value || <span className="muted">-</span>}</span>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '20px 12px', fontSize: 12, color: 'var(--text-weak)', textAlign: 'center' }}>{msg}</div>
  );
}
