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
  Megaphone, Calendar, Pulse,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { FleetApplyView, type PendingVehicle } from '@/components/general/fleet-apply';
import { useCompanies } from '@/lib/firebase/companies-store';
import { BusinessRegRegisterDialog } from '@/components/companies/business-reg-register-dialog';
import { CompanyDetailDialog } from '@/components/companies/company-detail-dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { audit } from '@/lib/firebase/audit-store';
import { useStaffList } from '@/lib/use-staff-list';
import { displayCompanyShort } from '@/lib/company-display';
import type { Company } from '@/lib/types';
import { usePersistentState } from '@/lib/use-persistent-state';

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
  const [view, setView] = usePersistentState<GeneralView>('filter:general:view', 'company');
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

            <div className="page-shell-nav-group-label" style={{ marginTop: 14 }}>운영 지원</div>
            <Link href="/dispatch" className="page-shell-nav-item" title="디스패치 — 현장 직원 업무 지시 발송 + 처리 현황">
              <Megaphone size={14} /><span>디스패치</span>
            </Link>
            <Link href="/attendance" className="page-shell-nav-item" title="근태 결재 — 휴가·반차·조퇴 신청 승인">
              <Calendar size={14} /><span>근태 결재</span>
            </Link>
            <Link href="/activity" className="page-shell-nav-item" title="활동 피드 — 모바일·웹 입력 실시간 통합">
              <Pulse size={14} /><span>활동 피드</span>
            </Link>

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
              <td>
                {c.name || c.displayName ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span>{displayCompanyShort(c)}</span>
                    {c.displayName?.trim() && c.displayName.trim() !== c.name && (
                      <span className="dim" style={{ fontSize: 11 }}>{c.name}</span>
                    )}
                  </div>
                ) : <span className="muted">이름 미입력</span>}
              </td>
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
