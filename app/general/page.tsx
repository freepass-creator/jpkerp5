'use client';

/**
 * /general — 일반 관리 (설정 페이지 패턴 = 좌측 nav + 우측 main).
 * 사무·행정 전반: 직원·법인·임대·시설·차고지·증차·공문·손익.
 *
 * 법인관리 = 목록형 큰 카드 + KPI + 디테일 (계좌/차고지/사무실/증차).
 * 다른 view 는 placeholder — 추후 같은 카드 패턴으로 확장.
 */

import { useState } from 'react';
import {
  Folder, Users, Buildings, Wrench, MapPin, Plus, FileText, ChartLineUp, PencilSimple, Trash, Car, Package,
} from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { FleetApplyView, type PendingVehicle } from '@/components/general/fleet-apply';
import { useCompanies } from '@/lib/firebase/companies-store';
import { BusinessRegRegisterDialog } from '@/components/companies/business-reg-register-dialog';
import { CompanyDetailDialog } from '@/components/companies/company-detail-dialog';
import { audit } from '@/lib/firebase/audit-store';
import { useStaffList } from '@/lib/use-staff-list';
import { stripCorpAndEnglish } from '@/lib/company-display';
import type { Company } from '@/lib/types';

type GeneralView =
  | 'staff' | 'company'
  | 'office' | 'garage' | 'parking'
  | 'supplies'
  | 'fleet_apply' | 'docs' | 'credentials'
  | 'profit';

const VIEW_LABEL: Record<GeneralView, string> = {
  staff: '직원 관리',
  company: '법인 관리',
  office: '사무실',
  garage: '차고지 (등록)',
  parking: '주차장',
  supplies: '비품 관리',
  fleet_apply: '증차 신청',
  docs: '공문·인감',
  credentials: '사이트 계정',
  profit: '손익 (집계)',
};

export default function GeneralPage() {
  const [view, setView] = useState<GeneralView>('company');
  const [companyRegisterOpen, setCompanyRegisterOpen] = useState(false);
  const [editCompanyId, setEditCompanyId] = useState<string | null>(null);
  const [companySelectedIds, setCompanySelectedIds] = useState<Set<string>>(new Set());
  const { companies, remove: removeCompany } = useCompanies();

  async function deleteSelectedCompanies() {
    const target = companies.filter((c) => companySelectedIds.has(c.id));
    if (target.length === 0) return;
    if (!window.confirm(`선택한 ${target.length}건 삭제하시겠습니까?`)) return;
    for (const c of target) {
      await removeCompany(c.id);
      void audit.delete('company', c.id, `법인 삭제 — ${c.name}`);
    }
    setCompanySelectedIds(new Set());
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <Folder size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>일반 관리</span>
            <span style={{ color: 'var(--text-weak)', margin: '0 6px', fontSize: 11 }}>›</span>
            <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{VIEW_LABEL[view]}</span>
          </div>
        </header>

        <div className="page-shell">
          <nav className="page-shell-nav">
            <div className="page-shell-nav-group-label">조직</div>
            <NavBtn label="직원 관리" icon={<Users size={14} />} active={view === 'staff'} onClick={() => setView('staff')} />
            <NavBtn label="법인 관리" icon={<Buildings size={14} />} active={view === 'company'} onClick={() => setView('company')} />

            <div className="page-shell-nav-group-label" style={{ marginTop: 14 }}>임대·시설</div>
            <NavBtn label="사무실" icon={<Buildings size={14} />} active={view === 'office'} onClick={() => setView('office')} />
            <NavBtn label="차고지 (등록)" icon={<MapPin size={14} />} active={view === 'garage'} onClick={() => setView('garage')} />
            <NavBtn label="주차장" icon={<Car size={14} />} active={view === 'parking'} onClick={() => setView('parking')} />
            <NavBtn label="비품 관리" icon={<Package size={14} />} active={view === 'supplies'} onClick={() => setView('supplies')} />

            <div className="page-shell-nav-group-label" style={{ marginTop: 14 }}>사무</div>
            <NavBtn label="증차 신청" icon={<Plus size={14} />} active={view === 'fleet_apply'} onClick={() => setView('fleet_apply')} />
            <NavBtn label="공문·인감" icon={<FileText size={14} />} active={view === 'docs'} onClick={() => setView('docs')} />
            <NavBtn label="사이트 계정" icon={<Wrench size={14} />} active={view === 'credentials'} onClick={() => setView('credentials')} />

            <div className="page-shell-nav-group-label" style={{ marginTop: 14 }}>보고</div>
            <NavBtn label="손익 (집계)" icon={<ChartLineUp size={14} />} active={view === 'profit'} onClick={() => setView('profit')} />
          </nav>

          <main className="page-shell-main" style={(view === 'company' || view === 'fleet_apply' || view === 'staff') ? { padding: 0, overflow: 'hidden' } : undefined}>
            {view === 'company' && (
              <CompanyListView
                onEdit={setEditCompanyId}
                selectedIds={companySelectedIds}
                setSelectedIds={setCompanySelectedIds}
              />
            )}
            {view === 'staff' && <StaffListView />}
            {view === 'fleet_apply' && <FleetApplyView companies={MOCK_COMPANIES} pendingByCompany={MOCK_PENDING} />}
            {view !== 'company' && view !== 'staff' && view !== 'fleet_apply' && <ViewPlaceholder view={view} />}
          </main>
        </div>

        <BottomBar
          left={
            view === 'company' ? (
              <>
                <button className="btn btn-primary" type="button" onClick={() => setCompanyRegisterOpen(true)}>
                  <Plus size={14} weight="bold" /> 법인 등록
                </button>
                {companySelectedIds.size > 0 && (
                  <>
                    <span className="btn-sep" />
                    <span style={{ fontSize: 12 }}>선택 <strong>{companySelectedIds.size}</strong>건</span>
                    <button className="btn btn-sm" type="button" onClick={() => setCompanySelectedIds(new Set())}>선택 해제</button>
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => void deleteSelectedCompanies()}
                      style={{ color: 'var(--red-text)' }}
                    >
                      <Trash size={11} weight="bold" /> 선택 삭제 ({companySelectedIds.size})
                    </button>
                  </>
                )}
              </>
            ) : view === 'staff' ? (
              <span className="dim" style={{ fontSize: 12 }}>
                직원은 로그인 화면 [계정 만들기] 로 가입 — 가입 즉시 목록에 자동 반영됩니다.
              </span>
            ) : (
              <button className="btn btn-primary" type="button">
                <Plus size={14} weight="bold" /> {VIEW_LABEL[view]} 신규 등록
              </button>
            )
          }
          right={<span>{VIEW_LABEL[view]}</span>}
        />

        {/* 법인 신규 등록 — OCR/수기 다이얼로그 */}
        <BusinessRegRegisterDialog
          open={companyRegisterOpen}
          onOpenChange={(o) => { if (!o) setCompanyRegisterOpen(false); }}
        />
        {/* 법인 상세 (read-only → [수정]) — DetailDialogShell 패턴 */}
        <CompanyDetailDialog
          companyId={editCompanyId}
          onOpenChange={(o) => { if (!o) setEditCompanyId(null); }}
        />
      </div>
    </div>
  );
}

function NavBtn({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`page-shell-nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

/* ─────────────── 법인관리 — 목록형 카드 ─────────────── */

type MockCompany = {
  id: string;
  name: string;
  branchType: '본점' | '지점' | '영업소';   // 법인 자체의 분류
  branchName?: string;        // 지점/영업소면 그 명칭 (예: 인천 영업소)
  corpRegNo: string;          // 법인등록번호 (자동차 등록증·관청 신청 시 필요)
  bizRegNo: string;           // 사업자등록번호 (세무·매출세금계산서)
  ceo: string;
  address: string;
  phone: string;
  fax?: string;
  bizType?: string;           // 업태 (사업자등록증)
  bizItem?: string;           // 종목 (사업자등록증)
  establishedDate?: string;   // 개업일
  accounts: Array<{ id: string; bank: string; no: string; holder: string }>;
  cards: Array<{ id: string; issuer: string; last4: string; holder: string; type: '체크/직불' | '신용' }>;
  garages: Array<{ id: string; name: string; address: string; parkingSlots: number; allowedFleet: number; currentCount: number; monthlyRent: number; areaSqm: number; endDate: string }>;
  // 지점 = 사무실/지점. 본사 외 지점은 분사업장이라 사업자등록번호 별도 가능
  offices: Array<{ id: string; name: string; address: string; areaSqm: number; monthlyRent: number; endDate: string; isHeadquarters?: boolean; subBizRegNo?: string }>;
  fleetApps: Array<{ id: string; appliedDate: string; garageName: string; vehicleCount: number; status: string; agency: string }>;
  sites: Array<{ id: string; name: string; url: string; userId: string; category: 'GPS' | '자동이체' | '카드사' | '관청' | '보험' | '기타' }>;
  vehicleCount: number;
  fleetLimit: number;
  operatingCount: number;     // 운행 중 차량 수 (가동률 = operating/vehicleCount)
  pendingPurchase: number;
  staffCount: number;
  unpaid: number;
  taxExemptCount: number;     // 취득세 감면 차량 수
  taxExemptAmount: number;    // 누적 감면 금액 (원)
};

const MOCK_PENDING: Record<string, PendingVehicle[]> = {};

const MOCK_COMPANIES: MockCompany[] = [];

/** 직원 관리 — 가입한 회원 (Firebase Auth + RTDB users) 명단. read-only. */
function StaffListView() {
  const { staff, loading, error } = useStaffList();
  return (
    <table className="table">
      <thead>
        <tr>
          <th style={{ width: 36 }}>#</th>
          <th style={{ minWidth: 140 }}>이름</th>
          <th>이메일</th>
          <th className="mono" style={{ width: 160 }}>UID</th>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr><td colSpan={4} className="muted center" style={{ padding: 32 }}>가입회원 불러오는 중…</td></tr>
        ) : error ? (
          <tr><td colSpan={4} className="muted center" style={{ padding: 32, color: 'var(--red-text)' }}>오류: {error}</td></tr>
        ) : staff.length === 0 ? (
          <tr><td colSpan={4} className="muted center" style={{ padding: 32 }}>가입한 직원이 없습니다. 로그인 1회 후 자동 등록됩니다.</td></tr>
        ) : staff.map((s, i) => (
          <tr key={s.uid}>
            <td className="dim center">{i + 1}</td>
            <td>{s.displayName || <span className="muted">이름 없음</span>}</td>
            <td className="dim">{s.email}</td>
            <td className="dim" style={{ fontSize: 11 }}>{s.uid}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 실 RTDB 연결 — useCompanies 기반. 행 더블클릭 → 수정 다이얼로그. */
function CompanyListView({
  onEdit, selectedIds, setSelectedIds,
}: {
  onEdit: (id: string) => void;
  selectedIds: Set<string>;
  setSelectedIds: (s: Set<string>) => void;
}) {
  const { companies } = useCompanies();
  const allChecked = companies.length > 0 && companies.every((c) => selectedIds.has(c.id));

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  }
  function toggleAll() {
    if (allChecked) setSelectedIds(new Set());
    else setSelectedIds(new Set(companies.map((c) => c.id)));
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th className="checkbox-col">
            <input
              type="checkbox"
              checked={allChecked}
              ref={(el) => {
                if (!el) return;
                const some = selectedIds.size > 0;
                el.indeterminate = some && !allChecked;
              }}
              onChange={toggleAll}
              aria-label="전체 선택"
            />
          </th>
          <th style={{ minWidth: 200 }}>회사명</th>
          <th style={{ width: 60 }}>구분</th>
          <th style={{ width: 130 }}>법인등록</th>
          <th style={{ width: 120 }}>사업자등록</th>
          <th style={{ width: 70 }}>대표</th>
          <th>주소</th>
          <th style={{ width: 80 }}>업종</th>
          <th style={{ width: 90 }}>종목</th>
          <th style={{ width: 110 }}>실무자</th>
          <th style={{ width: 120 }}>연락처</th>
          <th style={{ width: 160 }}>이메일</th>
        </tr>
      </thead>
      <tbody>
        {companies.length === 0 ? (
          <tr><td colSpan={12} className="muted center" style={{ padding: 32 }}>등록된 법인 없음 — 우측 하단 [+ 법인 등록] 으로 시작하세요.</td></tr>
        ) : companies.map((c) => {
          const checked = selectedIds.has(c.id);
          return (
            <tr
              key={c.id}
              style={{ cursor: 'pointer', background: checked ? 'var(--bg-stripe)' : undefined }}
              onDoubleClick={() => onEdit(c.id)}
              title="더블클릭 → 상세 정보 (수정)"
            >
              <td className="checkbox-col" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={checked} onChange={() => toggle(c.id)} aria-label={`${c.name} 선택`} />
              </td>
              <td>{stripCorpAndEnglish(c.name) || c.name || <span className="muted">이름 미입력</span>}</td>
              <td className="dim">{c.partnerKind || '기타'}</td>
              <td className="dim">{c.corpRegNo?.replace(/[^\d-]/g, '') || '-'}</td>
              <td className="dim">{c.bizRegNo?.replace(/[^\d-]/g, '') || '-'}</td>
              <td>{c.ceo || <span className="muted">-</span>}</td>
              <td className="dim">{c.address || '-'}</td>
              <td className="dim">{c.bizType || '-'}</td>
              <td className="dim">{c.bizItem || '-'}</td>
              <td>{c.contactName || <span className="muted">-</span>}{c.contactRole && <span className="dim" style={{ marginLeft: 4 }}>· {c.contactRole}</span>}</td>
              <td className="dim">{c.contactPhone || '-'}</td>
              <td className="dim">{c.contactEmail || '-'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** @deprecated MOCK 기반 — CompanyListView 로 교체됨. 미사용 placeholder. */
function CompanyCardsView() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const opened = MOCK_COMPANIES.find((c) => c.id === openId) ?? null;
  const allChecked = MOCK_COMPANIES.length > 0 && MOCK_COMPANIES.every((c) => selectedIds.has(c.id));

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (allChecked) setSelectedIds(new Set());
    else setSelectedIds(new Set(MOCK_COMPANIES.map((c) => c.id)));
  }
  function deleteSelected() {
    const target = MOCK_COMPANIES.filter((c) => selectedIds.has(c.id));
    const blocked = target.filter((c) => c.vehicleCount > 0 || c.staffCount > 0 || c.unpaid > 0);
    if (blocked.length > 0) {
      alert(`삭제 불가 — 등록 데이터 존재:\n${blocked.map((c) => `· ${c.name}: 차량 ${c.vehicleCount}대 / 직원 ${c.staffCount}명 / 미수 ₩${(c.unpaid/10000).toFixed(0)}만`).join('\n')}\n\n각 항목 먼저 정리 후 삭제 가능`);
      return;
    }
    if (!window.confirm(`선택한 ${target.length}건 삭제하시겠습니까?`)) return;
    // 실제 RTDB 삭제는 companies-store 연동 후 활성화 (현재 화면은 정책 검토 단계, MOCK 데이터)
    alert('실제 삭제는 법인 마스터 RTDB 연동 후 지원됩니다. (정책 검토 단계)');
    setSelectedIds(new Set());
  }

  return (
    <>
      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 8, background: 'var(--bg-stripe)', border: '1px solid var(--border-soft)', borderRadius: 4, fontSize: 12 }}>
          <span>선택 <strong>{selectedIds.size}</strong>건</span>
          <button className="btn btn-sm" type="button" onClick={() => setSelectedIds(new Set())}>선택 해제</button>
          <button className="btn btn-sm" type="button" onClick={deleteSelected} style={{ color: 'var(--red-text)', marginLeft: 'auto' }}>
            <Trash size={11} weight="bold" /> 선택 삭제 ({selectedIds.size})
          </button>
        </div>
      )}
      <table className="table">
        <thead>
          <tr>
            <th className="checkbox-col">
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => {
                  if (!el) return;
                  const some = selectedIds.size > 0;
                  el.indeterminate = some && !allChecked;
                }}
                onChange={toggleAll}
                aria-label="전체 선택"
              />
            </th>
            <th style={{ minWidth: 220 }}>회사명</th>
            <th style={{ width: 70 }}>구분</th>
            <th style={{ width: 115 }}>법인등록</th>
            <th style={{ width: 110 }}>사업자등록</th>
            <th style={{ width: 60 }}>대표</th>
            <th style={{ width: 130 }}>본사</th>
            <th className="center" style={{ width: 100 }}>차량/한도</th>
            <th className="center" style={{ width: 100 }}>가동률</th>
            <th className="center" style={{ width: 90 }}>구매대기</th>
            <th className="center" style={{ width: 110 }}>시설</th>
            <th className="center" style={{ width: 100 }}>증차 진행</th>
            <th className="num" style={{ width: 130 }}>감면 누적</th>
            <th className="num" style={{ width: 100 }}>미수금</th>
          </tr>
        </thead>
        <tbody>
          {MOCK_COMPANIES.map((c) => {
            const avail = Math.max(0, c.fleetLimit - c.vehicleCount);
            const checked = selectedIds.has(c.id);
            const operRate = c.vehicleCount > 0 ? Math.round(c.operatingCount / c.vehicleCount * 100) : 0;
            return (
              <tr
                key={c.id}
                style={{ cursor: 'pointer', background: checked ? 'var(--bg-stripe)' : undefined }}
                onDoubleClick={() => setOpenId(c.id)}
                title="더블클릭 시 상세 (계좌·차고지·사무실·증차·서류 관리)"
              >
                <td className="checkbox-col" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(c.id)} aria-label={`${c.name} 선택`} />
                </td>
                <td>
                  <strong>{c.name}</strong>
                  {c.branchName && <span className="dim" style={{ marginLeft: 6, fontSize: 11 }}>· {c.branchName}</span>}
                </td>
                <td><span className={`status ${c.branchType === '본점' ? '운행중' : ''}`} style={{ fontSize: 10 }}>{c.branchType}</span></td>
                <td className="mono dim">{c.corpRegNo}</td>
                <td className="mono dim">{c.bizRegNo}</td>
                <td>{c.ceo}</td>
                <td className="dim" style={{ fontSize: 11 }}>{c.address.split(/\s+/).slice(0, 2).join(' ')}</td>
                <td className="center mono">
                  {c.vehicleCount}/{c.fleetLimit}
                  <span style={{ marginLeft: 4, color: avail > 0 ? 'var(--green-text)' : 'var(--text-weak)', fontSize: 10 }}>
                    {avail > 0 ? `+${avail}` : '-'}
                  </span>
                </td>
                <td className="center mono" style={{ color: operRate >= 90 ? 'var(--green-text)' : undefined }}>
                  {operRate}%
                  <span style={{ fontSize: 10, color: 'var(--text-weak)' }}> ({c.operatingCount}/{c.vehicleCount})</span>
                </td>
                <td className="center mono" style={{ color: c.pendingPurchase > 0 ? 'var(--orange-text, #c2410c)' : 'var(--text-weak)' }}>
                  {c.pendingPurchase > 0 ? `${c.pendingPurchase}대 ⚠` : '-'}
                </td>
                <td className="center" style={{ fontSize: 11 }}>
                  사무 <strong>{c.offices.length}</strong> · 차고 <strong>{c.garages.length}</strong>
                </td>
                <td className="center" style={{ color: c.fleetApps.length > 0 ? 'var(--brand)' : 'var(--text-weak)', fontSize: 11 }}>
                  {c.fleetApps.length > 0 ? <><strong>{c.fleetApps.length}건</strong> 진행 중</> : '-'}
                </td>
                <td className="num mono" style={{ color: c.taxExemptAmount > 0 ? 'var(--green-text)' : undefined }}>
                  ₩{(c.taxExemptAmount/10000).toFixed(0)}만
                  <span style={{ fontSize: 10, color: 'var(--text-weak)' }}> ({c.taxExemptCount}대)</span>
                </td>
                <td className="num mono" style={{ color: c.unpaid > 0 ? 'var(--red-text)' : undefined }}>
                  ₩{(c.unpaid/10000).toFixed(0)}만
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {opened && <CompanyDetailDialogMock c={opened} onClose={() => setOpenId(null)} />}
    </>
  );
}

function CompanyDetailDialogMock({ c, onClose }: { c: MockCompany; onClose: () => void }) {
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState(c);
  const fleetAvail = Math.max(0, c.fleetLimit - c.vehicleCount);

  // 등록 데이터 존재 검증 (삭제 차단)
  const linkedCounts = [
    c.vehicleCount > 0 ? `차량 ${c.vehicleCount}대` : '',
    c.staffCount > 0 ? `직원 ${c.staffCount}명` : '',
    c.unpaid > 0 ? `미수금 ₩${(c.unpaid/10000).toFixed(0)}만` : '',
    c.garages.length > 0 ? `차고지 ${c.garages.length}개` : '',
    c.offices.length > 0 ? `사무실 ${c.offices.length}개` : '',
    c.accounts.length > 0 ? `계좌 ${c.accounts.length}개` : '',
  ].filter(Boolean);
  const canDelete = linkedCounts.length === 0;

  function handleDelete() {
    if (!canDelete) {
      alert(`삭제 불가 — 등록 데이터 존재:\n  · ${linkedCounts.join('\n  · ')}\n\n각 항목 먼저 정리 후 삭제 가능`);
      return;
    }
    if (!window.confirm(`${c.name}을(를) 삭제하시겠습니까?`)) return;
    // 실제 RTDB 삭제는 companies-store 연동 후 활성화 (현재 화면은 정책 검토 단계, MOCK 데이터)
    alert('실제 삭제는 법인 마스터 RTDB 연동 후 지원됩니다. (정책 검토 단계)');
    onClose();
  }

  return (
    <div
      role="dialog"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-card)', borderRadius: 8, width: '95vw', maxWidth: 1500, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더바 — 제목 + 닫기 (X) */}
        <div style={{ flex: '0 0 auto', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>법인 상세 — {c.name}</h2>
          <button className="btn btn-sm btn-ghost" type="button" onClick={onClose} title="닫기" aria-label="닫기" style={{ padding: '4px 8px' }}>✕</button>
        </div>

        {/* 스크롤 영역 — form + KPI + 섹션들 (헤더·하단바 제외) */}
        <div style={{ flex: '1 1 auto', overflow: 'auto' }}>
        {/* 회사 마스터 정보 — 3 컬럼 grid (주소만 풀 너비) */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-soft)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px 16px', fontSize: 12 }}>
          <Field label="회사명"        value={draft.name}                 edit={editMode} onChange={(v) => setDraft({ ...draft, name: v })} autoFocus />
          <Field label="대표자"        value={draft.ceo}                  edit={editMode} onChange={(v) => setDraft({ ...draft, ceo: v })} />
          <Field label="개업일"        value={draft.establishedDate ?? ''} mono edit={editMode} onChange={(v) => setDraft({ ...draft, establishedDate: v })} />
          <Field label="법인등록번호"   value={draft.corpRegNo}            mono edit={editMode} onChange={(v) => setDraft({ ...draft, corpRegNo: v })} />
          <Field label="사업자등록번호" value={draft.bizRegNo}             mono edit={editMode} onChange={(v) => setDraft({ ...draft, bizRegNo: v })} />
          <Field label="업태/종목"     value={`${draft.bizType ?? ''} ${draft.bizItem ? '· ' + draft.bizItem : ''}`.trim()} edit={editMode} onChange={(v) => {
            const [t, ...rest] = v.split('·'); setDraft({ ...draft, bizType: t.trim(), bizItem: rest.join('·').trim() });
          }} />
          <Field label="대표번호"      value={draft.phone}                mono edit={editMode} onChange={(v) => setDraft({ ...draft, phone: v })} />
          <Field label="팩스"          value={draft.fax ?? ''}            mono edit={editMode} onChange={(v) => setDraft({ ...draft, fax: v })} />
          <div /> {/* 칸 채우기 */}
          <Field label="본사 주소" value={draft.address} edit={editMode} onChange={(v) => setDraft({ ...draft, address: v })} fullSpan />
        </div>

        {/* KPI 8칸 — 차량/한도/증차/구매대기 + 가동률/감면·금액/미수금 */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-soft)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <Kpi label="차량 보유" value={`${c.vehicleCount}대`} />
          <Kpi label="면허 한도" value={`${c.fleetLimit}대`} />
          <Kpi label="증차 가능" value={`${fleetAvail}대`} tone={fleetAvail > 0 ? 'good' : 'gray'} />
          <Kpi label="구매대기" value={`${c.pendingPurchase}대`} tone={c.pendingPurchase > 0 ? 'warn' : 'gray'} />
          <Kpi label="가동률" value={`${c.vehicleCount > 0 ? Math.round(c.operatingCount/c.vehicleCount*100) : 0}%`} tone={c.vehicleCount > 0 && c.operatingCount/c.vehicleCount >= 0.9 ? 'good' : 'gray'} />
          <Kpi label="운행중" value={`${c.operatingCount}대`} />
          <Kpi label={`감면 누적 (${c.taxExemptCount}대)`} value={`₩${(c.taxExemptAmount/10000).toFixed(0)}만`} tone="good" />
          <Kpi label="미수금" value={`₩${(c.unpaid/10000).toFixed(0)}만`} tone={c.unpaid > 0 ? 'bad' : 'gray'} />
        </div>

        {/* 섹션 카테고리 묶음: 시설 (사무실/차고지) · 금융 (계좌/카드) · 운영 (증차) · 행정 (사이트) */}
        <style dangerouslySetInnerHTML={{ __html: `
          .cd-tables .table thead th {
            position: sticky;
            top: 0;
            background: var(--bg-card) !important;
            border-bottom: 1px solid var(--border);
            box-shadow: 0 1px 0 var(--border);
            z-index: 1;
          }
        `}} />
        <div className="cd-tables" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* ── 시설 ── */}
          <CategoryHeader title="시설" sub="사무실·지점·차고지" />
          <SectionBlock title={`사무실/지점 (${c.offices.length})`} addLabel="+ 지점">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>구분</th>
                  <th>지점명</th>
                  <th>주소</th>
                  <th style={{ width: 130 }}>분사업장 등록</th>
                  <th className="num">면적</th>
                  <th className="num">월세</th>
                  <th>임대만료</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {c.offices.map((o) => (
                  <tr key={o.id} style={{ cursor: 'pointer' }}>
                    <td><span className={`status ${o.isHeadquarters ? '운행중' : ''}`} style={{ fontSize: 10 }}>{o.isHeadquarters ? '본사' : '지점'}</span></td>
                    <td><strong>{o.name}</strong></td>
                    <td className="dim">{o.address}</td>
                    <td className="mono dim">{o.subBizRegNo || <span className="muted">-</span>}</td>
                    <td className="num mono">{o.areaSqm}㎡</td>
                    <td className="num mono">₩{(o.monthlyRent/10000).toFixed(0)}만</td>
                    <td className="mono dim">{o.endDate}</td>
                    <td><button className="btn btn-sm btn-ghost" type="button" title="임대차계약서 첨부">📎</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionBlock>

          <SectionBlock title={`차고지 (${c.garages.length})`} addLabel="+ 차고지">
            <table className="table">
              <thead>
                <tr>
                  <th>차고지명</th><th>주소</th>
                  <th className="num">주차면</th><th className="num">허가</th><th className="num">현재</th><th className="num">여유</th>
                  <th className="num">면적</th><th className="num">월세</th><th>임대만료</th><th></th>
                </tr>
              </thead>
              <tbody>
                {c.garages.map((g) => (
                  <tr key={g.id} style={{ cursor: 'pointer' }}>
                    <td><strong>{g.name}</strong></td>
                    <td className="dim">{g.address}</td>
                    <td className="num mono">{g.parkingSlots}</td>
                    <td className="num mono">{g.allowedFleet}</td>
                    <td className="num mono">{g.currentCount}</td>
                    <td className="num mono" style={{ color: g.allowedFleet - g.currentCount > 0 ? 'var(--green-text)' : 'var(--text-weak)' }}>
                      {g.allowedFleet - g.currentCount}
                    </td>
                    <td className="num mono">{g.areaSqm}㎡</td>
                    <td className="num mono">₩{(g.monthlyRent/10000).toFixed(0)}만</td>
                    <td className="mono dim">{g.endDate}</td>
                    <td><button className="btn btn-sm btn-ghost" type="button" title="등록증/임대차계약서 첨부">📎</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionBlock>

          {/* ── 금융 ── */}
          <CategoryHeader title="금융" sub="계좌·법인카드" />
          <SectionBlock title={`등록 계좌 (${c.accounts.length})`} addLabel="+ 계좌">
            <table className="table">
              <thead><tr><th>은행</th><th>계좌번호</th><th>예금주</th><th></th></tr></thead>
              <tbody>
                {c.accounts.map((a) => (
                  <tr key={a.id} style={{ cursor: 'pointer' }}>
                    <td><strong>{a.bank}</strong></td>
                    <td className="mono">{a.no}</td>
                    <td className="dim">{a.holder}</td>
                    <td><button className="btn btn-sm btn-ghost" type="button" title="통장사본 첨부">📎</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionBlock>

          <SectionBlock title={`법인카드 (${c.cards.length})`} addLabel="+ 카드">
            <table className="table">
              <thead><tr><th>카드사</th><th>구분</th><th>카드번호</th><th>명의</th><th></th></tr></thead>
              <tbody>
                {c.cards.map((card) => (
                  <tr key={card.id} style={{ cursor: 'pointer' }}>
                    <td><strong>{card.issuer}</strong></td>
                    <td className="dim">{card.type}</td>
                    <td className="mono">**** **** **** {card.last4}</td>
                    <td className="dim">{card.holder}</td>
                    <td><button className="btn btn-sm btn-ghost" type="button" title="카드 사본 첨부">📎</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionBlock>

          {/* ── 운영 ── */}
          <CategoryHeader title="운영" sub="증차 신청·면허 capacity" />
          <SectionBlock title={`증차 신청 (${c.fleetApps.length})`} addLabel="+ 증차 신청">
            <table className="table">
              <thead><tr><th>신청일</th><th>차고지</th><th className="num">대수</th><th>관청</th><th>상태</th><th></th></tr></thead>
              <tbody>
                {c.fleetApps.length === 0 ? (
                  <tr><td colSpan={6} className="muted center" style={{ padding: 18 }}>진행 중 없음</td></tr>
                ) : c.fleetApps.map((f) => (
                  <tr key={f.id} style={{ cursor: 'pointer' }}>
                    <td className="mono">{f.appliedDate}</td>
                    <td><strong>{f.garageName}</strong></td>
                    <td className="num mono">{f.vehicleCount}</td>
                    <td className="dim">{f.agency}</td>
                    <td>{f.status}</td>
                    <td><button className="btn btn-sm btn-ghost" type="button" title="신구대비표·신청서 첨부">📎</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionBlock>

          {/* ── 행정 ── */}
          <CategoryHeader title="행정" sub="사이트 계정 (GPS·자동이체·관청·보험)" />
          <SectionBlock title={`사이트 계정 (${c.sites.length})`} addLabel="+ 사이트">
            <table className="table">
              <thead><tr><th style={{ width: 80 }}>분류</th><th>사이트명</th><th>URL</th><th>아이디</th><th></th></tr></thead>
              <tbody>
                {c.sites.map((s) => (
                  <tr key={s.id} style={{ cursor: 'pointer' }}>
                    <td><span className="status" style={{ fontSize: 10 }}>{s.category}</span></td>
                    <td><strong>{s.name}</strong></td>
                    <td className="mono dim" style={{ fontSize: 11 }}>{s.url}</td>
                    <td className="mono">{s.userId}</td>
                    <td><button className="btn btn-sm btn-ghost" type="button" title="비밀번호 보기/수정 (로그 남김)">🔒</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionBlock>
        </div>
        </div>{/* /스크롤 영역 */}

        {/* 하단바 — 좌측 액션 / 우측 닫기 (flex 고정) */}
        <div style={{ flex: '0 0 auto', background: 'var(--bg-card)', borderTop: '1px solid var(--border)', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {!editMode ? (
              <button className="btn" type="button" onClick={() => setEditMode(true)}>
                <PencilSimple size={13} weight="bold" /> 정보 수정
              </button>
            ) : (
              <>
                <button className="btn btn-primary" type="button" onClick={() => setEditMode(false)}>저장</button>
                <button className="btn" type="button" onClick={() => { setDraft(c); setEditMode(false); }}>취소</button>
              </>
            )}
            <span style={{ width: 1, height: 16, background: 'var(--border)', alignSelf: 'center' }} />
            <button
              className="btn"
              type="button"
              onClick={handleDelete}
              disabled={!canDelete}
              title={!canDelete ? `등록 데이터 존재로 삭제 불가 — ${linkedCounts.join(' · ')}` : '법인 삭제'}
              style={{ color: canDelete ? 'var(--red-text)' : undefined, opacity: canDelete ? 1 : 0.5, cursor: canDelete ? 'pointer' : 'not-allowed' }}
            >
              <Trash size={13} weight="bold" /> 삭제
            </button>
          </div>
          <button className="btn" type="button" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, edit, onChange, mono, fullSpan, autoFocus }: { label: string; value: string; edit: boolean; onChange: (v: string) => void; mono?: boolean; fullSpan?: boolean; autoFocus?: boolean }) {
  return (
    <div style={{ gridColumn: fullSpan ? '1 / -1' : undefined, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10, color: 'var(--text-weak)', letterSpacing: '0.04em', fontWeight: 600 }}>{label}</span>
      {edit ? (
        <input
          type="text" value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
          style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, fontFamily: mono ? 'monospace' : 'inherit', width: '100%' }}
        />
      ) : (
        <span className={mono ? 'mono' : ''} style={{ fontSize: 12.5, fontWeight: 500, padding: '4px 0' }}>{value || <span className="muted">-</span>}</span>
      )}
    </div>
  );
}

function CategoryHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="cd-cat-header" style={{ display: 'flex', alignItems: 'baseline', gap: 8, paddingBottom: 4, borderBottom: '1.5px solid var(--brand)', marginTop: 4 }}>
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--text-main)', letterSpacing: '0.02em' }}>{title}</h3>
      {sub && <span style={{ fontSize: 11, color: 'var(--text-weak)' }}>· {sub}</span>}
    </div>
  );
}

function SectionBlock({ title, addLabel, children }: { title: string; addLabel?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="cd-sec-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h4 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-main)', letterSpacing: '0.02em' }}>{title}</h4>
        {addLabel && <button className="btn btn-sm btn-ghost" type="button" style={{ fontSize: 11 }}>{addLabel}</button>}
      </div>
      {children}
    </div>
  );
}

function FormRow({ label, value, edit, onChange, mono }: { label: string; value: string; edit: boolean; onChange: (v: string) => void; mono?: boolean }) {
  return (
    <tr>
      <td className="dim" style={{ width: 120, padding: '6px 10px' }}>{label}</td>
      <td style={{ padding: '6px 10px' }}>
        {edit ? (
          <input
            type="text"
            className="input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: '100%', fontFamily: mono ? 'monospace' : undefined, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4 }}
            autoFocus={label === '회사명'}
          />
        ) : (
          <span className={mono ? 'mono' : ''} style={{ fontWeight: 500 }}>{value}</span>
        )}
      </td>
    </tr>
  );
}

function CompanyCard({ c }: { c: MockCompany }) {
  const fleetAvail = Math.max(0, c.fleetLimit - c.vehicleCount);
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: '4px solid var(--brand)',
        borderRadius: 6,
        padding: '14px 18px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      {/* 헤더 — 회사명·기본정보·액션 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border-soft)' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>{c.name}</h3>
          <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 3 }}>
            사업자등록 <span className="mono">{c.bizRegNo}</span> · 대표 {c.ceo}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-weak)', marginTop: 1 }}>
            {c.address} · <span className="mono">{c.phone}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-sm" type="button" title="법인 정보 수정"><PencilSimple size={11} weight="bold" /> 수정</button>
          <button className="btn btn-sm" type="button" title="법인 삭제" style={{ color: 'var(--red-text)' }}><Trash size={11} weight="bold" /> 삭제</button>
        </div>
      </div>

      {/* KPI 8칸 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        <Kpi label="차량 보유" value={`${c.vehicleCount}대`} />
        <Kpi label="면허 한도" value={`${c.fleetLimit}대`} />
        <Kpi label="증차 가능" value={`${fleetAvail}대`} tone={fleetAvail > 0 ? 'good' : 'gray'} />
        <Kpi label="구매대기" value={`${c.pendingPurchase}대`} tone={c.pendingPurchase > 0 ? 'warn' : 'gray'} />
        <Kpi label="차고지" value={`${c.garages.length}개소`} />
        <Kpi label="사무실/지점" value={`${c.offices.length}개`} />
        <Kpi label="직원" value={`${c.staffCount}명`} />
        <Kpi label="미수금" value={`₩${(c.unpaid/10000).toFixed(0)}만`} tone={c.unpaid > 0 ? 'bad' : 'gray'} />
      </div>

      {/* 디테일 섹션들 */}
      <Section title={`등록 계좌 (${c.accounts.length})`} addLabel="+ 계좌 추가">
        {c.accounts.map((a) => (
          <Row key={a.id}>
            <span><strong>{a.bank}</strong> <span className="mono">{a.no}</span></span>
            <span style={{ color: 'var(--text-weak)' }}>예금주 {a.holder}</span>
          </Row>
        ))}
      </Section>

      <Section title={`차고지 (${c.garages.length})`} addLabel="+ 차고지 추가">
        {c.garages.map((g) => (
          <Row key={g.id}>
            <div style={{ flex: 1 }}>
              <strong>{g.name}</strong>
              <span style={{ color: 'var(--text-weak)' }}> · {g.address}</span>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
              <span className="mono" style={{ fontSize: 11 }}>
                {g.parkingSlots}면 · 허가 {g.allowedFleet} / 현재 {g.currentCount} / <strong style={{ color: g.allowedFleet - g.currentCount > 0 ? 'var(--green-text)' : 'var(--text-weak)' }}>여유 {g.allowedFleet - g.currentCount}</strong>
              </span>
              <span style={{ color: 'var(--text-weak)', fontSize: 11 }}>
                {g.areaSqm}㎡ · <span className="mono">₩{(g.monthlyRent/10000).toFixed(0)}만</span>/월 · ~{g.endDate}
              </span>
            </div>
          </Row>
        ))}
      </Section>

      <Section title={`사무실/지점 (${c.offices.length})`} addLabel="+ 지점 추가">
        {c.offices.map((o) => (
          <Row key={o.id}>
            <div style={{ flex: 1 }}>
              <strong>{o.name}</strong>
              <span style={{ color: 'var(--text-weak)' }}> · {o.address}</span>
            </div>
            <span style={{ color: 'var(--text-weak)', fontSize: 11 }}>
              {o.areaSqm}㎡ · <span className="mono">₩{(o.monthlyRent/10000).toFixed(0)}만</span>/월 · ~{o.endDate}
            </span>
          </Row>
        ))}
      </Section>

      <Section title={`증차 신청 (${c.fleetApps.length})`} addLabel="+ 증차 신청">
        {c.fleetApps.length === 0 ? (
          <div style={{ padding: '6px 8px', color: 'var(--text-weak)', fontSize: 11 }}>진행 중 없음</div>
        ) : c.fleetApps.map((f) => (
          <Row key={f.id}>
            <span className="mono" style={{ fontSize: 11 }}>{f.appliedDate}</span>
            <span><strong>{f.garageName}</strong> · {f.vehicleCount}대</span>
            <span style={{ color: 'var(--text-weak)' }}>{f.agency} · {f.status}</span>
          </Row>
        ))}
      </Section>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'gray' }) {
  const color = tone === 'good' ? 'var(--green-text)'
              : tone === 'warn' ? 'var(--orange-text, #c2410c)'
              : tone === 'bad'  ? 'var(--red-text)'
              : 'var(--text-main)';
  return (
    <div style={{ padding: '8px 10px', background: 'var(--bg-sunken)', border: '1px solid var(--border-soft)', borderRadius: 4 }}>
      <div style={{ fontSize: 9.5, color: 'var(--text-weak)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Section({ title, addLabel, children }: { title: string; addLabel?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-main)', letterSpacing: '0.02em' }}>{title}</div>
        {addLabel && (
          <button className="btn btn-sm btn-ghost" type="button" style={{ fontSize: 10, padding: '2px 6px' }}>{addLabel}</button>
        )}
      </div>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)', borderRadius: 4 }}>{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '6px 10px', fontSize: 12, borderBottom: '1px solid var(--border-soft)', cursor: 'pointer' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-stripe)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = '')}
    >
      {children}
    </div>
  );
}

/* ─────────────── 다른 view placeholder ─────────────── */

function ViewPlaceholder({ view }: { view: GeneralView }) {
  const map: Record<GeneralView, { title: string; desc: string; sub: string; perCompany?: boolean }> = {
    staff:       { title: '직원 관리',     desc: '임직원 명부·직급/부서·근태',       sub: '회사명 컬럼 + 더블클릭 상세. 한 화면에 전 직원' },
    company:     { title: '법인 관리',     desc: '법인 마스터',                       sub: '' },
    office:      { title: '사무실',         desc: '본사·지점 임차 계약',              sub: '회사명 컬럼 + 더블클릭 상세. 주소·면적·월세·기간·임대차계약서', perCompany: true },
    garage:      { title: '차고지 (등록)', desc: '운수면허 등록 차고지 (capacity 추적)', sub: '회사명 컬럼 + 더블클릭 상세. 허가대수/현재/여유·면적·등록증', perCompany: true },
    parking:     { title: '주차장',         desc: '실 주차장 (자가 또는 임대)',        sub: '회사명 컬럼 + 더블클릭 상세. 자가=등기부등본 / 임대=임대차계약서', perCompany: true },
    supplies:    { title: '비품 관리',     desc: '복합기·사무기기·기타 비품',         sub: '회사명 컬럼 + 더블클릭 상세. 구입·점검·유지보수', perCompany: true },
    fleet_apply: { title: '증차 신청',     desc: '운수사업 증차/변경 등록 신청',     sub: '회사명 + 차고지 + 구매대기 차량 + 신구대비표 + 증차신청서', perCompany: true },
    docs:        { title: '공문·인감',     desc: '발송 공문, 법인 인감, 사용 인감', sub: '회사명 + 발수신 + 사용 이력', perCompany: true },
    credentials: { title: '사이트 계정',   desc: 'GPS·자동이체·카드사·관청 등 사이트 ID/PW', sub: '회사명 + 사이트명 + URL + 아이디 + 비밀번호 (안전 저장)', perCompany: true },
    profit:      { title: '손익 (집계)',   desc: '매출·비용·순익 (월/분기/연)',     sub: '입출금관리 자동 집계 (회사별 분리)', perCompany: true },
  };
  const v = map[view];
  return (
    <div style={{ maxWidth: 720 }}>
      <header className="page-header">
        <div className="page-header-title-group">
          <h1 className="page-header-title">{v.title}</h1>
          <div className="page-header-title-sub">{v.desc}</div>
        </div>
        {v.perCompany && (
          <div className="page-header-actions">
            <select className="input-compact" data-w="md" title="법인별 필터">
              <option value="all">법인: 전체</option>
            </select>
          </div>
        )}
      </header>
      <div className="settings-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-sub)', fontSize: 13 }}>
        준비 중
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-weak)' }}>{v.sub}</div>
      </div>
    </div>
  );
}
