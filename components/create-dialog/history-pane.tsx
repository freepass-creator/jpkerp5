'use client';

/**
 * 이력 등록 Pane — CreateDialog 에서 분리.
 *
 *  · 차량 검색 → 계약 선택 → 이력 폼
 *  · 귀속 toggle (차량 영구 / 계약만)
 *  · 카테고리 (정비/사고/검사/세차/위반/보험/부품교체 등)
 */

import { useMemo, useState } from 'react';
import { Car, CaretLeft, ClipboardText, MagnifyingGlass, Wrench } from '@phosphor-icons/react';
import { DateInput } from '@/components/ui/date-input';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { useBusyAction } from '@/lib/use-busy-action';
import { toast } from '@/lib/toast';
import { friendlyError } from '@/lib/friendly-error';
import type { Contract, HistoryCategory, HistoryScope } from '@/lib/types';

const VEHICLE_CATEGORIES: HistoryCategory[] = ['정비', '사고', '검사', '세차', '위반', '보험', '부품교체', '기타'];
const CONTRACT_CATEGORIES: HistoryCategory[] = ['연락기록', '분쟁', '클레임', '수납이슈', '메모', '기타'];

export function HistoryAddPane({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Contract | null>(null);
  const { add: addHistory } = useHistoryEntries();
  const [busy, runMutation] = useBusyAction();

  if (selected) {
    return <HistoryForm contract={selected} onBack={() => setSelected(null)} busy={busy} onSubmit={(form) => {
      void runMutation(async () => {
        try {
          await addHistory({
            scope: form.scope,
            contractId: form.scope === 'contract' ? selected.id : undefined,
            vehiclePlate: form.scope === 'vehicle' ? selected.vehiclePlate : undefined,
            date: form.date,
            category: form.category,
            title: form.title,
            description: form.description || undefined,
            cost: form.cost || undefined,
            status: form.status,
            vendor: form.vendor || undefined,
            mileage: form.mileage || undefined,
          });
          toast.success(`${selected.vehiclePlate} ${form.scope === 'vehicle' ? '차량' : '계약'} 이력 저장됨`);
          onClose();
        } catch (e) {
          toast.error(`이력 저장 실패 — ${friendlyError(e)}`);
        }
      });
    }} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div className="topbar-search" style={{ width: '100%', maxWidth: 'none' }}>
        <MagnifyingGlass size={14} className="icon" />
        <input
          className="input"
          autoFocus
          placeholder="차량번호 / 계약자명 / 계약번호로 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <HistorySearchResults q={search} onPick={setSelected} />
    </div>
  );
}

function HistorySearchResults({ q, onPick }: { q: string; onPick: (c: Contract) => void }) {
  const { contracts } = useContracts();
  const matches = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return contracts.filter((c) => {
      const hay = `${c.vehiclePlate ?? ''} ${c.customerName ?? ''} ${c.contractNo ?? ''} ${c.vehicleModel ?? ''} ${c.customerPhone1 ?? ''}`.toLowerCase();
      return hay.includes(query);
    }).slice(0, 20);
  }, [q, contracts]);

  if (!q.trim()) {
    return (
      <div className="dropzone" style={{ minHeight: 320, cursor: 'default' }}>
        <div className="dropzone-icon">
          <Car size={28} weight="duotone" />
        </div>
        <div className="dropzone-title">차량 검색</div>
        <div className="dropzone-desc">
          차량번호, 계약자명, 계약번호 중 하나로 검색하면<br />
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

type HistoryFormData = {
  scope: HistoryScope;
  category: HistoryCategory;
  date: string;
  title: string;
  cost: number | undefined;
  vendor: string;
  mileage: number | undefined;
  status: '완료' | '진행' | '예정';
  description: string;
};

function HistoryForm({
  contract, onBack, busy, onSubmit,
}: { contract: Contract; onBack: () => void; busy: boolean; onSubmit: (form: HistoryFormData) => void }) {
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
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          scope, category, date, title, vendor, status, description,
          cost: cost ? parseInt(cost, 10) || undefined : undefined,
          mileage: mileage ? parseInt(mileage, 10) || undefined : undefined,
        });
      }}
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
            <DateInput value={date} onChange={setDate} style={{ width: 180 }} />

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
        <button type="button" className="btn" onClick={onBack} disabled={busy}>취소</button>
        <button type="submit" className="btn btn-primary" disabled={!title || busy}>
          <ClipboardText size={14} /> {busy ? '저장 중…' : '이력 저장'}
        </button>
      </div>
    </form>
  );
}
