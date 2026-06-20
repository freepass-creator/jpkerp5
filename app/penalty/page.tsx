'use client';

import { useState, useMemo } from 'react';
import { Trash, X, PencilSimple, CheckCircle, Warning, FileXls, Eye, FileZip, CircleNotch, FileText, User, Receipt, Copy } from '@phosphor-icons/react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { downloadPenaltyZip, previewPenaltyItem, type PenaltyWorkItem } from '@/lib/penalty-pdf';
import { usePenaltyStore } from '@/lib/use-penalty-store';
import { dedupPenalties, describeDuplicate } from '@/lib/penalty-dedup';
import { EntityFormDialog, type FieldDef } from '@/components/ui/entity-form-dialog';
import { useCompanyStore } from '@/lib/use-company-store';
import dynamic from 'next/dynamic';
const PenaltyRegisterDialog = dynamic(
  () => import('@/components/penalty/penalty-register-dialog').then((m) => m.PenaltyRegisterDialog),
  { ssr: false },
);
import { exportToExcel } from '@/lib/excel-export';
import { PERIODS, type Period, periodRange, isInRange } from '@/lib/period-filter';
import { useAuth } from '@/lib/use-auth';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';
import { useVehicleDialog } from '@/lib/global-dialogs';
import { useRowSelection, useCtrlASelectAll } from '@/lib/use-row-selection';
import { useTableSelection } from '@/lib/use-table-selection';

/**
 * 과태료 변경부과 — 처리중 / 처리완료 두 단계로 분리.
 *  - 처리중: OCR 등록되었으나 아직 변경부과 PDF 미발행
 *  - 처리완료: 변경부과 PDF 다운로드한 이력 (회사 도장 + 임대차계약 사실확인서 묶음)
 */

// PDF footer 발급담당자 정보 — 로그인 user 의 displayName/email 을 우선 사용.
// 부서·직책·연락처는 staff 마스터(미구현)가 추가되면 그쪽에서 가져올 예정.
const STAFF_DEFAULTS = {
  department: '경영지원본부 총무팀',
  title: '',
  phone: '02-0000-0000',
  fax: '',
};

const CHECK_COL_WIDTH = 28;
const COMPANY_COL_WIDTH = 56;
const PLATE_COL_WIDTH = 96;

const PENALTY_FIELDS: FieldDef[] = [
  { key: 'car_number',  label: '차량번호',  required: true },
  { key: 'doc_type',    label: '구분',      type: 'select', options: ['과태료', '범칙금', '통행료', '주정차위반', '속도위반', '신호위반', '기타'] },
  { key: 'notice_no',   label: '고지서번호', colSpan: 2 },
  { key: 'issuer',      label: '발급기관', colSpan: 2 },
  { key: 'date',        label: '위반일시', placeholder: 'YYYY-MM-DD HH:mm' },
  { key: 'issue_date',  label: '발송일',   type: 'date' },
  { key: 'location',    label: '위반장소', colSpan: 2 },
  { key: 'description', label: '위반내용', colSpan: 4 },
  { key: 'amount',      label: '금액',     type: 'number' },
  { key: 'due_date',    label: '납부기한', type: 'date' },
  { key: 'pay_account', label: '납부 계좌', colSpan: 2 },
  { key: 'contractor_name',    label: '임차인명' },
  { key: 'contractor_kind',    label: '신분', type: 'select', options: ['개인', '사업자'] },
  { key: 'contractor_phone',   label: '연락처' },
  { key: 'contractor_ident',   label: '식별번호' },
  { key: 'contractor_address', label: '주소', colSpan: 4 },
  { key: 'start_date',  label: '계약 시작일', type: 'date' },
  { key: 'end_date',    label: '계약 종료일', type: 'date' },
  { key: 'partner_code', label: '회사코드' },
];

type Phase = 'in-progress' | 'completed';

export default function PenaltyPage() {
  const { user } = useAuth();
  // PDF footer 발급담당자 — 로그인 user 우선
  const STAFF = useMemo(() => ({
    ...STAFF_DEFAULTS,
    name: user?.displayName ?? user?.email?.split('@')[0] ?? '담당자',
    email: user?.email ?? '',
  }), [user?.displayName, user?.email]);

  const [allItems, setItems, itemsReady] = usePenaltyStore();
  const [companies] = useCompanyStore();
  const items = useMemo(() => allItems.filter((p) => !p.deletedAt), [allItems]);
  const findCompany = (code?: string) => code ? companies.find((c) => c.code === code) : undefined;
  const [busy, setBusy] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('in-progress');
  /** 체크박스로 선택된 항목 — lib/use-table-selection SSOT */
  const sel = useTableSelection();
  const { selectedIds, setSelectedIds } = sel;
  const { openVehicle } = useVehicleDialog();
  /** 처리완료 탭 기간 필터 */
  const [period, setPeriod] = useState<Period>('이번달');
  /** 처리완료 탭 기준 날짜 — 처리일자(_processedAt) 또는 단속일자(date) */
  const [periodBy, setPeriodBy] = useState<'processed' | 'violation'>('processed');
  /** 고지서 등록 다이얼로그 — 빈 상태 텍스트에서도 열 수 있도록 lift */
  const [registerOpen, setRegisterOpen] = useState(false);
  /** 우클릭 컨텍스트 메뉴 */
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number; row: PenaltyWorkItem | null }>({ open: false, x: 0, y: 0, row: null });

  function handleCreate(newItems: PenaltyWorkItem[]) {
    setItems((prev) => {
      // 신규 batch 를 기존 전체와 비교해 중복 식별
      const { unique, duplicates } = dedupPenalties(newItems, prev);

      // 중복 항목도 화면에는 추가 (사용자가 보고 판단) — 단 _duplicate 마커 박음
      const dupTagged = duplicates.map((d) => ({
        ...d.item,
        _phase: 'in-progress' as Phase,
        _duplicate: {
          reason: describeDuplicate(d.matchedKey, d.source),
          source: d.source,
          matchedExistingId: d.matchedExisting && (d.matchedExisting as PenaltyWorkItem).id,
        },
      }));
      const uniqueTagged = unique.map((it) => ({ ...it, _phase: 'in-progress' as Phase }));

      if (duplicates.length > 0) {
        // 사용자에게 알림 (suppressed silently 안되게)
        setTimeout(() => {
          toast.info(`중복으로 판정된 ${duplicates.length}건이 함께 추가되었습니다. 빨간 라벨로 표시되니 확인 후 삭제하세요.`);
        }, 0);
      }

      return [...uniqueTagged, ...dupTagged, ...prev];
    });
  }

  function removeItem(id: string) {
    setItems((p) => p.filter((i) => i.id !== id));
  }

  async function clearInProgress() {
    const n = items.filter((i) => (i._phase ?? 'in-progress') === 'in-progress').length;
    if (n === 0) return;
    if (!await showConfirm({ title: `처리중 ${n}건을 전체 초기화할까요? 처리완료 이력은 유지됩니다.` })) return;
    setItems((prev) => prev.filter((i) => i._phase === 'completed'));
  }

  /** 매칭 완료 (회사 + 임차인) 케이스만 처리완료 가능 */
  function isMatched(item: PenaltyWorkItem): boolean {
    return Boolean(item._company && item._contract?.contractor_name);
  }

  /** 단일 항목 처리완료로 이동 — PDF 다운로드 없이도 수동 마킹 */
  function markCompleted(id: string) {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((it) => it.id === id
      ? { ...it, _phase: 'completed' as Phase, _processedAt: now }
      : it,
    ));
  }

  /** 체크박스 토글 — sel.toggleRow alias (legacy 호출자) */
  const toggleSelect = sel.toggleRow;

  /** 현재 visible 행 전체 선택/해제 (penalty 만의 특수 로직 — 일부만 체크되어도 모두 선택) */
  function toggleSelectAll(visibleIds: string[]) {
    setSelectedIds((prev) => {
      const allChecked = visibleIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allChecked) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  const selAdapter = sel;

  /** 선택된 매칭 완료건 일괄 처리완료 */
  async function markSelectedCompleted() {
    const targets = items.filter((i) =>
      selectedIds.has(i.id) &&
      (i._phase ?? 'in-progress') === 'in-progress' &&
      isMatched(i),
    );
    if (targets.length === 0) {
      toast.info('처리완료 가능한 매칭 항목이 선택되지 않았습니다');
      return;
    }
    if (!await showConfirm({ title: `매칭 완료된 ${targets.length}건을 처리완료로 이동할까요?` })) return;
    const now = new Date().toISOString();
    const ids = new Set(targets.map((t) => t.id));
    setItems((prev) => prev.map((it) => ids.has(it.id)
      ? { ...it, _phase: 'completed' as Phase, _processedAt: now }
      : it,
    ));
    setSelectedIds(new Set());
  }

  /** 선택된 항목 PDF 다운로드 (중복 자동 제외) */
  async function handleDownloadSelected() {
    const targets = items.filter((i) => selectedIds.has(i.id) && !i._duplicate);
    if (targets.length === 0) {
      toast.info('다운로드 가능한 항목이 없습니다 (중복은 제외됨).');
      return;
    }
    setBusy(true);
    setPdfProgress({ done: 0, total: 0 });
    try {
      await downloadPenaltyZip(targets, STAFF, {
        onProgress: (done, total) => setPdfProgress({ done, total }),
      });
      // 처리중 → 처리완료 자동 전환
      const now = new Date().toISOString();
      const inProgIds = new Set(targets.filter((t) => (t._phase ?? 'in-progress') === 'in-progress').map((t) => t.id));
      setItems((prev) => prev.map((it) => inProgIds.has(it.id)
        ? { ...it, _phase: 'completed' as Phase, _processedAt: now }
        : it,
      ));
      setSelectedIds(new Set());
    } finally {
      setBusy(false);
      setPdfProgress(null);
    }
  }

  async function handleDownload() {
    const all = items.filter((i) => i._phase === 'in-progress');
    const dupCount = all.filter((i) => i._duplicate).length;
    const target = all.filter((i) => !i._duplicate);  // 중복 자동 제외
    if (target.length === 0) {
      toast.info(dupCount > 0 ? `처리중 ${dupCount}건이 모두 중복입니다. 중복 정리 후 다시 시도하세요.` : '처리할 항목이 없습니다.');
      return;
    }
    if (dupCount > 0 && !confirm(`중복 ${dupCount}건은 자동 제외하고 ${target.length}건만 PDF 생성합니다. 진행할까요?`)) return;
    setBusy(true);
    setPdfProgress({ done: 0, total: 0 });
    try {
      await downloadPenaltyZip(target, STAFF, {
        onProgress: (done, total) => setPdfProgress({ done, total }),
      });
      const now = new Date().toISOString();
      const doneIds = new Set(target.map((i) => i.id));
      setItems((prev) => prev.map((it) => doneIds.has(it.id)
        ? { ...it, _phase: 'completed' as Phase, _processedAt: now }
        : it,
      ));
      setPhase('completed');
    } finally {
      setBusy(false);
      setPdfProgress(null);
    }
  }

  async function handleDownloadCompletedFiltered() {
    if (completedFiltered.length === 0) return;
    setBusy(true);
    setPdfProgress({ done: 0, total: 0 });
    try {
      await downloadPenaltyZip(completedFiltered, STAFF, {
        onProgress: (done, total) => setPdfProgress({ done, total }),
      });
    } finally {
      setBusy(false);
      setPdfProgress(null);
    }
  }

  async function handlePreview(item: PenaltyWorkItem) {
    // 회사 매칭 안된 경우 PDF 본문에 "회사명없음" 으로 표기 (서버 templates 가 처리).
    // 임의로 defaultCompany 채우지 말 것.
    await previewPenaltyItem(item, STAFF);
  }

  function handleSaveEdit(d: Record<string, string>) {
    if (!editingId) return;
    setItems((prev) => prev.map((it) => {
      if (it.id !== editingId) return it;
      const partnerCode = d.partner_code ?? it._contract?.partner_code ?? '';
      return {
        ...it,
        car_number: d.car_number ?? it.car_number,
        doc_type: d.doc_type ?? it.doc_type,
        notice_no: d.notice_no ?? it.notice_no,
        issuer: d.issuer ?? it.issuer,
        date: d.date ?? it.date,
        issue_date: d.issue_date ?? it.issue_date,
        location: d.location ?? it.location,
        description: d.description ?? it.description,
        amount: d.amount ? Number(d.amount) : it.amount,
        due_date: d.due_date ?? it.due_date,
        pay_account: d.pay_account ?? it.pay_account,
        _contract: (d.contractor_name || d.start_date) ? {
          contractor_name: d.contractor_name,
          contractor_kind: d.contractor_kind,
          contractor_phone: d.contractor_phone,
          contractor_ident: d.contractor_ident,
          contractor_address: d.contractor_address,
          start_date: d.start_date,
          end_date: d.end_date,
          product_type: '장기렌트',
          partner_code: partnerCode,
        } : it._contract,
        _company: findCompany(partnerCode) ?? it._company,
      };
    }));
    setEditingId(null);
  }

  const editing = editingId ? items.find((i) => i.id === editingId) : null;
  const editInitial: Record<string, string> = editing ? {
    car_number: editing.car_number,
    doc_type: editing.doc_type,
    notice_no: editing.notice_no,
    issuer: editing.issuer,
    date: editing.date,
    issue_date: editing.issue_date,
    location: editing.location,
    description: editing.description,
    amount: editing.amount ? String(editing.amount) : '',
    due_date: editing.due_date,
    pay_account: editing.pay_account,
    contractor_name: editing._contract?.contractor_name ?? '',
    contractor_kind: editing._contract?.contractor_kind ?? '',
    contractor_phone: editing._contract?.contractor_phone ?? '',
    contractor_ident: editing._contract?.contractor_ident ?? '',
    contractor_address: editing._contract?.contractor_address ?? '',
    start_date: editing._contract?.start_date ?? '',
    end_date: editing._contract?.end_date ?? '',
    partner_code: editing._contract?.partner_code ?? '',
  } : {};

  const inProgress = useMemo(() => items.filter((i) => (i._phase ?? 'in-progress') === 'in-progress'), [items]);
  const completed = useMemo(() => items.filter((i) => i._phase === 'completed'), [items]);

  // 처리완료 탭 — 기간 필터 적용
  const completedFiltered = useMemo(() => {
    if (period === '전체') return completed;
    const range = periodRange(period);
    return completed.filter((it) => {
      const d = periodBy === 'processed'
        ? (it._processedAt ? it._processedAt.slice(0, 10) : '')
        : (it.date ? it.date.slice(0, 10) : '');
      return isInRange(d, range);
    });
  }, [completed, period, periodBy]);

  const visible = phase === 'in-progress' ? inProgress : completedFiltered;

  // 처리중 — 매칭 통계
  const inProgMatched = inProgress.filter((i) => i._contract).length;
  const inProgUnmatched = inProgress.filter((i) => !i._contract && i.car_number).length;
  const inProgNoCar = inProgress.filter((i) => !i.car_number).length;
  const inProgAmount = inProgress.reduce((s, i) => s + (i.amount ?? 0), 0);

  // 처리완료 — 필터 합계
  const compAmount = completedFiltered.reduce((s, i) => s + (i.amount ?? 0), 0);

  function handleExcel() {
    if (visible.length === 0) return;
    exportToExcel({
      title: phase === 'in-progress' ? '과태료 처리중' : '과태료 처리완료',
      subtitle: `${new Date().toLocaleDateString('ko-KR')} 기준 ${visible.length}건`,
      columns: [
        { key: 'companyCode', header: '회사', type: 'mono', width: 8, getter: (r) => (r as unknown as PenaltyWorkItem)._company?.code ?? ''},
        { key: 'car_number', header: '차량번호', type: 'mono', width: 12 },
        { key: 'doc_type', header: '구분', width: 10 },
        { key: 'notice_no', header: '고지서번호', type: 'mono', width: 22 },
        { key: 'issuer', header: '발급기관', width: 18 },
        { key: 'date', header: '위반일시', type: 'mono', width: 18 },
        { key: 'location', header: '위반장소', width: 24 },
        { key: 'description', header: '위반내용', width: 26 },
        { key: 'amount', header: '금액', type: 'number' },
        { key: 'due_date', header: '납부기한', type: 'date' },
        { key: 'pay_account', header: '납부계좌', type: 'mono', width: 22 },
        { key: 'contractor_name', header: '임차인', width: 12, getter: (r) => (r as unknown as PenaltyWorkItem)._contract?.contractor_name ?? '' },
        { key: 'contractor_phone', header: '연락처', type: 'mono', width: 14, getter: (r) => (r as unknown as PenaltyWorkItem)._contract?.contractor_phone ?? '' },
        ...(phase === 'completed' ? [{ key: '_processedAt', header: '처리완료일시', type: 'date' as const, width: 22 }] : []),
      ],
      rows: visible as unknown as Record<string, unknown>[],
    });
  }

  // 행 선택 - 현재 visible (in-progress 또는 completed) 기준
  const visibleRows = phase === 'in-progress' ? inProgress : completed;
  const rowSel = useRowSelection({ ids: visibleRows.map((i) => i.id), selection: selAdapter });
  useCtrlASelectAll(rowSel, selAdapter);

  return (
    <>
      {busy && (
        <div
          className="center"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            style={{
              background: 'var(--bg, #fff)',
              padding: '32px 40px',
              borderRadius: 8,
              minWidth: 280,
              textAlign: 'center',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
          >
            <CircleNotch size={36} className="mx-auto spin" style={{ color: 'var(--brand)' }} />
            <div className="mt-3 text-medium" style={{ fontWeight: 600 }}>PDF 생성 중...</div>
            {pdfProgress && pdfProgress.total > 0 ? (
              <div className="mt-2 text-weak">
                <strong>{pdfProgress.done}</strong> / {pdfProgress.total} 묶음 완료
              </div>
            ) : (
              <div className="mt-2 text-weak">서버에서 변경부과 PDF + 확인서 렌더링 중</div>
            )}
          </div>
        </div>
      )}
      <div className="layout">
        <Sidebar />
        <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <Receipt size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>과태료 업무</span>
          </div>
          <div className="filter-bar" role="tablist" aria-label="단계">
            <button
              type="button"
              className={`chip ${phase === 'in-progress' ? 'active' : ''}`}
              onClick={() => setPhase('in-progress')}
            >
              처리중
              {inProgress.length > 0 && <span className="chip-count">{inProgress.length}</span>}
            </button>
            <button
              type="button"
              className={`chip ${phase === 'completed' ? 'active' : ''}`}
              onClick={() => setPhase('completed')}
            >
              처리완료
              {completed.length > 0 && <span className="chip-count">{completed.length}</span>}
            </button>
          </div>
        </header>

      <PageShellInline
        footerLeft={phase === 'in-progress' ? (
          <>
            <span className="stat-item">처리중 <strong>{inProgress.length}</strong></span>
            <span className="stat-item">매칭됨 <strong style={{ color: '#10b981' }}>{inProgMatched}</strong></span>
            {inProgUnmatched > 0 && (
              <span className="stat-item alert">미매칭 <strong>{inProgUnmatched}</strong></span>
            )}
            {inProgNoCar > 0 && (
              <span className="stat-item alert">차량번호 인식실패 <strong>{inProgNoCar}</strong></span>
            )}
            <span className="stat-divider" />
            <span className="stat-item">합계 <strong className="num">{inProgAmount.toLocaleString('ko-KR')}</strong>원</span>
          </>
        ) : (
          <>
            <span className="stat-item">처리완료 누적 <strong>{completed.length}</strong></span>
            <span className="stat-divider" />
            <div className="chip-group" role="tablist" aria-label="기준 일자">
              <button
                type="button"
                className={`chip ${periodBy === 'processed' ? 'active' : ''}`}
                onClick={() => setPeriodBy('processed')}
              >처리일자</button>
              <button
                type="button"
                className={`chip ${periodBy === 'violation' ? 'active' : ''}`}
                onClick={() => setPeriodBy('violation')}
              >단속일자</button>
            </div>
            <div className="chip-group" role="tablist" aria-label="기간">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`chip ${period === p ? 'active' : ''}`}
                  onClick={() => setPeriod(p)}
                >{p}</button>
              ))}
            </div>
            <span className="stat-divider" />
            <span className="stat-item"><strong>{completedFiltered.length}</strong>건</span>
            <span className="stat-item">합계 <strong className="num">{compAmount.toLocaleString('ko-KR')}</strong>원</span>
          </>
        )}
        footerRight={
          <>
            <button
              className="btn"
              onClick={handleExcel}
              disabled={visible.length === 0}
              title={`현재 페이지 목록 (${visible.length}건) 엑셀 다운로드`}
            >
              <FileXls size={14} weight="bold" /> 엑셀 <span className="chip-count">{visible.length}</span>
            </button>
            {phase === 'in-progress' && (
              <>
                {selectedIds.size > 0 && (
                  <>
                    <button
                      className="btn"
                      onClick={markSelectedCompleted}
                      disabled={busy}
                      title="선택된 항목 중 매칭 완료된 것만 처리완료로 이동"
                    >
                      <CheckCircle size={14} weight="bold" /> 선택 처리완료 ({selectedIds.size})
                    </button>
                    <button
                      className="btn"
                      onClick={handleDownloadSelected}
                      disabled={busy}
                      title="선택된 항목만 PDF 묶음 다운로드"
                    >
                      <FileZip size={14} weight="bold" /> 선택 다운로드 ({selectedIds.size})
                    </button>
                  </>
                )}
                <button
                  className="btn"
                  onClick={clearInProgress}
                  disabled={inProgress.length === 0 || busy}
                >
                  <Trash size={14} weight="bold" /> 처리중 전체 초기화
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleDownload}
                  disabled={inProgress.length === 0 || busy}
                >
                  <FileZip size={14} weight="bold" /> {busy ? '생성 중...' : `변경부과 압축 (${inProgress.length}건)`}
                </button>
                <PenaltyRegisterDialog open={registerOpen} onOpenChange={setRegisterOpen} onCreate={handleCreate} />
              </>
            )}
          </>
        }
      >
        <div className="table-wrap penalty-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="checkbox-col sticky-col" style={{ left: 0, width: CHECK_COL_WIDTH }}>
                  <input
                    type="checkbox"
                    checked={visible.length > 0 && visible.every((it) => selectedIds.has(it.id))}
                    ref={(el) => {
                      if (!el) return;
                      const some = visible.some((it) => selectedIds.has(it.id));
                      const all = visible.every((it) => selectedIds.has(it.id));
                      el.indeterminate = some && !all;
                    }}
                    onChange={() => toggleSelectAll(visible.map((it) => it.id))}
                    title="현재 보이는 항목 전체 선택"
                    aria-label="전체 선택"
                  />
                </th>
                <th className="sticky-col" style={{ left: CHECK_COL_WIDTH, minWidth: COMPANY_COL_WIDTH }}>회사코드</th>
                <th className="sticky-col-2" style={{ left: CHECK_COL_WIDTH + COMPANY_COL_WIDTH, minWidth: PLATE_COL_WIDTH }}>차량번호</th>
                <th className="center" style={{ width: 36 }}>매칭</th>
                {phase === 'in-progress' ? (
                  <>
                    {/* 처리중 — 매칭 검증에 집중: 계약시작 ‖ 위반일시 ‖ 계약종료 나란히 */}
                    <th>임차인</th>
                    <th className="date">계약시작</th>
                    <th className="date">위반일시</th>
                    <th className="date">계약종료</th>
                    <th>구분</th>
                    <th>위반장소</th>
                    <th>위반내용</th>
                    <th className="num">금액</th>
                    <th>연락처</th>
                    <th className="date">납부기한</th>
                    <th>고지서번호</th>
                    <th>발급기관</th>
                    <th>파일</th>
                  </>
                ) : (
                  <>
                    {/* 처리완료 — 변경부과 풀 데이터 */}
                    <th className="date">처리완료</th>
                    <th>임차인</th>
                    <th>신분</th>
                    <th>연락처</th>
                    <th>식별번호</th>
                    <th>주소</th>
                    <th className="date">계약기간</th>
                    <th>구분</th>
                    <th className="date">위반일시</th>
                    <th>위반장소</th>
                    <th>위반내용</th>
                    <th>적용법조</th>
                    <th className="num">금액</th>
                    <th className="date">발송일</th>
                    <th className="date">납부기한</th>
                    <th>고지서번호</th>
                    <th>발급기관</th>
                    <th>납부계좌</th>
                    <th>파일</th>
                  </>
                )}
                <th className="center" style={{ width: 170, position: 'sticky', right: 0, background: 'var(--bg-header)' }}>동작</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={50} style={{ padding: 0 }}>
                    {!itemsReady ? (
                      <div className="empty-row" style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-weak)' }}>
                        데이터 불러오는 중…
                      </div>
                    ) : phase === 'in-progress' ? (
                      <button
                        type="button"
                        onClick={() => setRegisterOpen(true)}
                        className="dim"
                        style={{
                          width: '100%',
                          padding: '32px 0',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          font: 'inherit',
                          textAlign: 'center',
                          transition: 'background 120ms',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover, rgba(0,0,0,0.03))'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                      >
                        처리중 항목이 없습니다. 이 영역 또는 우측 하단{' '}
                        <span style={{ color: 'var(--brand)', textDecoration: 'underline' }}>[+ 고지서 등록]</span>
                        을 클릭해 고지서를 업로드하세요.
                      </button>
                    ) : (
                      <div className="empty-row">
                        처리완료 이력이 없습니다. 처리중 탭에서 [변경부과 PDF]를 생성하면 여기로 이동합니다.
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                visible.map((it) => {
                  // 위반일시가 계약기간 안에 있는지 검증
                  const violDate = it.date?.slice(0, 10);
                  const startD = it._contract?.start_date;
                  const endD = it._contract?.end_date;
                  const inRange = violDate && startD && endD
                    ? violDate >= startD && violDate <= endD
                    : null;
                  const violClass = inRange === false ? 'text-red' : 'mono';
                  return (
                    <tr key={it.id} onMouseDown={rowSel.onRowMouseDown} onClick={(e) => rowSel.onRowClick(e, it.id, visibleRows.findIndex((x) => x.id === it.id))} onDoubleClick={() => it.car_number && openVehicle(it.car_number, 'risk')} onContextMenu={(e) => rowSel.onRowContextMenu(e, it.id, visibleRows.findIndex((x) => x.id === it.id), () => setCtxMenu({ open: true, x: e.clientX, y: e.clientY, row: it }))} style={{ cursor: 'pointer' }}>
                      <td className="checkbox-col sticky-col" style={{ left: 0, width: CHECK_COL_WIDTH, background: 'var(--bg-card)' }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(it.id)}
                          onChange={() => toggleSelect(it.id)}
                        />
                      </td>
                      <td className="plate text-medium sticky-col" style={{ left: CHECK_COL_WIDTH, minWidth: COMPANY_COL_WIDTH }}>
                        {it._company?.code || <span className="text-muted">-</span>}
                      </td>
                      <td className="plate text-medium sticky-col-2" style={{ left: CHECK_COL_WIDTH + COMPANY_COL_WIDTH, minWidth: PLATE_COL_WIDTH }}>
                        {it.car_number || <span className="text-muted">-</span>}
                      </td>
                      <td className="center">
                        {it._duplicate ? (
                          <span title={`중복: ${it._duplicate.reason}`} style={{ display: 'inline-flex' }}>
                            <Warning size={14} weight="fill" style={{ color: '#dc2626' }} />
                          </span>
                        ) : it._contract ? (
                          <CheckCircle size={14} weight="fill" style={{ color: '#10b981' }} />
                        ) : it.car_number ? (
                          <Warning size={14} weight="fill" style={{ color: '#f59e0b' }} />
                        ) : <span className="text-muted">-</span>}
                      </td>

                      {phase === 'in-progress' ? (
                        <>
                          <td className="text-medium">{it._contract?.contractor_name || <span className="text-muted">미매칭</span>}</td>
                          <td className="date mono dim">{startD || ''}</td>
                          <td className={`date ${violClass}`}>{it.date || '-'}</td>
                          <td className="date mono dim">{endD || ''}</td>
                          <td className="dim">{it.doc_type || '-'}</td>
                          <td className="dim truncate" style={{ maxWidth: 220 }}>{it.location || '-'}</td>
                          <td>{it.description || '-'}</td>
                          <td className="num">{it.amount ? it.amount.toLocaleString('ko-KR') : '-'}</td>
                          <td className="mono dim">{it._contract?.contractor_phone || ''}</td>
                          <td className="date">{it.due_date || ''}</td>
                          <td className="mono dim truncate" style={{ maxWidth: 200 }}>{it.notice_no || '-'}</td>
                          <td>{it.issuer || '-'}</td>
                          <td className="mono dim truncate" style={{ maxWidth: 160 }} title={it.fileName}>{it.fileName}</td>
                        </>
                      ) : (
                        <>
                          <td className="date mono dim">
                            {it._processedAt ? new Date(it._processedAt).toLocaleString('ko-KR') : ''}
                          </td>
                          <td className="text-medium">{it._contract?.contractor_name || <span className="text-muted">미매칭</span>}</td>
                          <td className="dim">{it._contract?.contractor_kind || ''}</td>
                          <td className="mono dim">{it._contract?.contractor_phone || ''}</td>
                          <td className="mono dim">{it._contract?.contractor_ident || ''}</td>
                          <td className="dim truncate" style={{ maxWidth: 200 }}>{it._contract?.contractor_address || ''}</td>
                          <td className="date dim">{startD ? `${startD} ~ ${endD}` : ''}</td>
                          <td className="dim">{it.doc_type || '-'}</td>
                          <td className="date mono">{it.date || '-'}</td>
                          <td className="dim truncate" style={{ maxWidth: 220 }}>{it.location || '-'}</td>
                          <td>{it.description || '-'}</td>
                          <td className="dim">{it.law_article || '-'}</td>
                          <td className="num">{it.amount ? it.amount.toLocaleString('ko-KR') : '-'}</td>
                          <td className="date dim">{it.issue_date || ''}</td>
                          <td className="date">{it.due_date || ''}</td>
                          <td className="mono dim truncate" style={{ maxWidth: 200 }}>{it.notice_no || '-'}</td>
                          <td>{it.issuer || '-'}</td>
                          <td className="mono dim truncate" style={{ maxWidth: 180 }}>{it.pay_account || '-'}</td>
                          <td className="mono dim truncate" style={{ maxWidth: 160 }} title={it.fileName}>{it.fileName}</td>
                        </>
                      )}

                      <td className="center" style={{ position: 'sticky', right: 0, background: 'var(--bg-card)' }}>
                        <div className="flex items-center gap-1 justify-center">
                          <button
                            className="btn btn-sm"
                            onClick={() => handlePreview(it)}
                            title="변경부과 PDF 미리보기"
                          >
                            <Eye size={11} /> 미리보기
                          </button>
                          {phase === 'in-progress' && isMatched(it) && (
                            <button
                              className="btn btn-sm"
                              onClick={() => markCompleted(it.id)}
                              title="이 항목을 처리완료로 이동"
                            >
                              <CheckCircle size={11} /> 처리완료
                            </button>
                          )}
                          {phase === 'in-progress' && (
                            <button className="btn btn-sm" onClick={() => setEditingId(it.id)}>
                              <PencilSimple size={11} /> 수정
                            </button>
                          )}
                          <button className="btn-ghost btn btn-sm" onClick={() => removeItem(it.id)} title="삭제">
                            <X size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </PageShellInline>
      </div>
      </div>

      <ContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        onClose={() => setCtxMenu({ open: false, x: 0, y: 0, row: null })}
        items={ctxMenu.row ? (() => {
          const r = ctxMenu.row;
          const isInProg = (r._phase ?? 'in-progress') === 'in-progress';
          const matched = isMatched(r);
          const it: ContextMenuItem[] = [
            { label: '미리보기', icon: <Eye size={12} weight="bold" />, onClick: () => handlePreview(r) },
          ];
          if (r.car_number) {
            it.push({ label: '차량 상세 (리스크)', icon: <Warning size={12} weight="bold" />, onClick: () => openVehicle(r.car_number, 'risk') });
          }
          if (isInProg && matched) {
            it.push({ label: '처리완료로 이동', icon: <CheckCircle size={12} weight="bold" />, onClick: () => markCompleted(r.id) });
          }
          if (isInProg) {
            it.push({ label: '수정', icon: <PencilSimple size={12} weight="bold" />, onClick: () => setEditingId(r.id) });
          }
          it.push({ type: 'separator' });
          if (r.car_number) it.push({ label: '차량번호 복사', icon: <Copy size={12} weight="bold" />, onClick: () => navigator.clipboard.writeText(r.car_number) });
          if (r.notice_no) it.push({ label: '고지서번호 복사', icon: <Copy size={12} weight="bold" />, onClick: () => navigator.clipboard.writeText(r.notice_no) });
          if (r._contract?.contractor_name) it.push({ label: '임차인명 복사', icon: <Copy size={12} weight="bold" />, onClick: () => navigator.clipboard.writeText(r._contract!.contractor_name!) });
          if (r._contract?.contractor_phone) it.push({ label: '임차인 연락처 복사', icon: <Copy size={12} weight="bold" />, onClick: () => navigator.clipboard.writeText(r._contract!.contractor_phone!) });
          it.push({ type: 'separator' });
          it.push({ label: '삭제', icon: <X size={12} weight="bold" />, onClick: () => removeItem(r.id), danger: true });
          return it;
        })() : []}
      />

      <EntityFormDialog
        open={editingId !== null}
        onOpenChange={(o) => { if (!o) setEditingId(null); }}
        title={`고지서 정보 수정${editing ? ` — ${editing.fileName}` : ''}`}
        sections={[
          { title: '고지서', icon: FileText, fields: PENALTY_FIELDS.slice(0, 11) },
          { title: '임차인 / 계약', icon: User, fields: PENALTY_FIELDS.slice(11) },
        ]}
        initial={editInitial}
        submitLabel="저장"
        size="xl"
        onSubmit={handleSaveEdit}
      />
    </>
  );
}

/**
 * 본문 + 표준 BottomBar 래퍼.
 * footerLeft = stats (우측 표시), footerRight = actions (좌측 표시)
 * — 카톡 알림이 화면 우측 하단에 떠서 버튼은 좌측에 배치.
 */
function PageShellInline({
  footerLeft,
  footerRight,
  children,
}: {
  footerLeft?: React.ReactNode;
  footerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="penalty-body">{children}</div>
      <BottomBar left={footerRight} right={footerLeft} />
    </>
  );
}
