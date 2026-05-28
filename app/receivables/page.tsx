'use client';

import { useMemo, useState } from 'react';
import { Power, FileXls, ChatCircleDots, X, MagnifyingGlass, Plus, Gavel, Warning, DownloadSimple } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import dynamic from 'next/dynamic';
const CreateDialog = dynamic(() => import('@/components/create-dialog').then((m) => m.CreateDialog), { ssr: false });
import { useContracts } from '@/lib/firebase/contracts-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { downloadOverdueExcel } from '@/lib/contract-export';
import { useAuth } from '@/lib/use-auth';
import { isAdmin } from '@/lib/admin-emails';
import { toast } from '@/lib/toast';
import { todayKr } from '@/lib/mock-data';
import { friendlyError } from '@/lib/friendly-error';
import type { Contract } from '@/lib/types';

type Filter = '전체' | '연체중' | '부분납' | '시동제어' | '채권화' | '검사지연';

const FILTERS: Filter[] = ['전체', '연체중', '부분납', '시동제어', '채권화', '검사지연'];

/** 검사지연 — 정기검사 예정일 지남 (임차인이 받아야 하는 책임 사항) */
function isInspectionOverdue(c: Contract, today: string): boolean {
  return !!(c.inspectionDueDate && c.inspectionDueDate < today);
}

function hasOverdue(c: Contract): boolean {
  return (c.schedules ?? []).some((s) => s.status === '연체');
}
function hasPartial(c: Contract): boolean {
  return (c.schedules ?? []).some((s) => s.status === '부분납');
}

function maxOverdueDays(c: Contract, today: string): number {
  const overdue = (c.schedules ?? []).filter((s) => s.status === '연체' || s.status === '부분납');
  if (overdue.length === 0) return 0;
  const oldest = overdue.map((s) => s.dueDate).sort()[0];
  const t = new Date(today).getTime();
  const o = new Date(oldest).getTime();
  return Math.max(0, Math.round((t - o) / (1000 * 60 * 60 * 24)));
}

function lastContactDate(contractId: string, history: ReturnType<typeof useHistoryEntries>['entries']): string | undefined {
  const logs = history.filter((h) => h.scope === 'contract' && h.contractId === contractId && h.category === '연락기록');
  if (logs.length === 0) return undefined;
  return logs.map((l) => l.date).sort().reverse()[0];
}

export default function ReceivablesPage() {
  const { contracts, update: updateContract } = useContracts();
  const { companies: companyMaster } = useCompanies();
  const { entries: history, add: addHistory } = useHistoryEntries();
  const { user } = useAuth();
  const admin = isAdmin(user?.email);
  const [filter, setFilter] = useState<Filter>('전체');
  const [search, setSearch] = useState('');
  const [contactOpen, setContactOpen] = useState<Contract | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const today = todayKr();

  const filtered = useMemo<Contract[]>(() => {
    const base = contracts.filter((c) => c.id && !c.id.startsWith('vehicle-orphan-'));
    // 전체 = 한 가지 이상 리스크 가진 계약만 (정상 계약 제외)
    const hasAnyRisk = (c: Contract) =>
      hasOverdue(c) || hasPartial(c) || c.engineDisabled === true || c.status === '채권'
      || isInspectionOverdue(c, today);

    let list: Contract[];
    if (filter === '전체') list = base.filter(hasAnyRisk);
    else if (filter === '연체중') list = base.filter(hasOverdue);
    else if (filter === '부분납') list = base.filter(hasPartial);
    else if (filter === '시동제어') list = base.filter((c) => c.engineDisabled === true);
    else if (filter === '채권화') list = base.filter((c) => c.status === '채권');
    else if (filter === '검사지연') list = base.filter((c) => isInspectionOverdue(c, today));
    else list = base;

    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) =>
      (c.customerName ?? '').toLowerCase().includes(q)
      || (c.vehiclePlate ?? '').toLowerCase().includes(q)
      || (c.vehicleModel ?? '').toLowerCase().includes(q)
      || (c.manager ?? '').toLowerCase().includes(q),
    );
  }, [contracts, filter, search]);

  const counts = useMemo(() => {
    const base = contracts.filter((c) => c.id && !c.id.startsWith('vehicle-orphan-'));
    const hasAnyRisk = (c: Contract) =>
      hasOverdue(c) || hasPartial(c) || c.engineDisabled === true || c.status === '채권'
      || isInspectionOverdue(c, today);
    return {
      전체: base.filter(hasAnyRisk).length,
      연체중: base.filter(hasOverdue).length,
      부분납: base.filter(hasPartial).length,
      시동제어: base.filter((c) => c.engineDisabled === true).length,
      채권화: base.filter((c) => c.status === '채권').length,
      검사지연: base.filter((c) => isInspectionOverdue(c, today)).length,
    };
  }, [contracts, today]);

  /** 채권화 토글 — 회수 어려운 미수금 분류 (수동) */
  async function toggleDebtFlag(c: Contract) {
    if (!admin) { toast.error('관리자만 채권 변경 가능'); return; }
    const isDebt = c.status === '채권';
    if (!isDebt) {
      if (!window.confirm(`${c.vehiclePlate} ${c.customerName} — 채권화 처리 (회수불가/법적조치 검토)?`)) return;
    } else {
      if (!window.confirm(`${c.vehiclePlate} ${c.customerName} — 채권 해제하시겠습니까?`)) return;
    }
    try {
      // 채권화 시 status='채권', 해제 시 returnedDate 있으면 '반납', 없으면 '운행'
      const nextStatus: Contract['status'] = isDebt
        ? (c.returnedDate ? '반납' : '운행')
        : '채권';
      await updateContract({ ...c, status: nextStatus });
      toast.success(isDebt ? `${c.vehiclePlate} 채권 해제` : `${c.vehiclePlate} 채권화`);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  async function toggleEngineLock(c: Contract) {
    if (!admin) { toast.error('관리자만 시동제어 가능'); return; }
    const next = !c.engineDisabled;
    const reason = next ? (prompt('시동제어 사유\n(미납 / 검사지연 / 기타 중 입력)') ?? '') : '';
    if (next && reason === null) return;
    try {
      await updateContract({
        ...c,
        engineDisabled: next,
        engineDisabledAt: next ? new Date().toISOString() : undefined,
        engineDisabledBy: next ? user?.email ?? '' : undefined,
        engineDisabledReason: next ? reason : undefined,
      });
      toast.success(next ? `${c.vehiclePlate} 시동제어 ON` : `${c.vehiclePlate} 시동제어 해제`);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  const filterTone = (f: Filter): string => {
    if (f === '전체') return 'brand';
    if (f === '연체중') return 'red';
    if (f === '부분납') return 'orange';
    if (f === '시동제어') return 'amber';
    if (f === '채권화') return 'gray';
    if (f === '검사지연') return 'blue';
    return 'brand';
  };

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <Warning size={16} weight="fill" style={{ color: 'var(--red-text)' }} />
            <span>리스크 관리</span>
          </div>
          <div className="topbar-search">
            <MagnifyingGlass size={14} className="icon" />
            <input
              className="input"
              placeholder="고객 / 차량 / 차종 / 담당"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="filter-bar">
            {FILTERS.map((f) => (
              <button
                key={f}
                className={`chip chip-tone-${filterTone(f)} ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f}
                {counts[f] > 0 && <span className="chip-count">{counts[f]}</span>}
              </button>
            ))}
          </div>

          <div className="topbar-right">
            <span className="topbar-date">{today}</span>
          </div>
        </header>

        <div className="dashboard">
          <div className="panel">
            <div className="panel-body">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>차량번호</th>
                    <th>계약자</th>
                    <th style={{ width: 110 }}>연락처</th>
                    <th className="num" style={{ width: 110 }}>미수금</th>
                    <th className="center" style={{ width: 60 }}>미납회차</th>
                    <th className="center" style={{ width: 76 }}>경과일</th>
                    <th className="center" style={{ width: 100 }}>마지막연락</th>
                    <th className="center" style={{ width: 80 }}>시동제어</th>
                    <th className="center" style={{ width: 70 }}>채권</th>
                    <th style={{ width: 100 }}>액션</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="muted center" style={{ padding: 32 }}>
                        {filter} 해당 계약 없음
                      </td>
                    </tr>
                  ) : (
                    filtered.map((c) => {
                      const days = maxOverdueDays(c, today);
                      const lastC = lastContactDate(c.id, history);
                      return (
                        <tr key={c.id}>
                          <td className="mono">{c.vehiclePlate}</td>
                          <td>{c.customerName}</td>
                          <td className="mono" style={{ fontSize: 11 }}>{c.customerPhone1 || '-'}</td>
                          <td className="num">{(c.unpaidAmount ?? 0).toLocaleString()}</td>
                          <td className="center">{c.unpaidSeqCount ?? 0}</td>
                          <td className="center" style={{ color: days > 60 ? 'var(--red-text)' : days > 30 ? 'var(--orange-text)' : undefined }}>
                            {days > 0 ? `${days}일` : '-'}
                          </td>
                          <td className="center mono" style={{ fontSize: 11 }}>{lastC ?? '-'}</td>
                          <td className="center">
                            <button
                              type="button"
                              className="btn"
                              onClick={() => toggleEngineLock(c)}
                              style={{
                                height: 22,
                                padding: '0 8px',
                                fontSize: 10,
                                background: c.engineDisabled ? 'var(--red-text)' : 'transparent',
                                color: c.engineDisabled ? '#fff' : 'var(--text-sub)',
                                border: '1px solid ' + (c.engineDisabled ? 'var(--red-text)' : 'var(--border)'),
                              }}
                              title={c.engineDisabled ? `${c.engineDisabledAt?.slice(0, 10) ?? ''} 제어 시작` : '시동제어 ON'}
                            >
                              <Power size={11} weight={c.engineDisabled ? 'fill' : 'regular'} />
                              {c.engineDisabled ? 'ON' : 'OFF'}
                            </button>
                          </td>
                          <td className="center">
                            <button
                              type="button"
                              className="btn"
                              onClick={() => toggleDebtFlag(c)}
                              style={{
                                height: 22,
                                padding: '0 8px',
                                fontSize: 10,
                                background: c.status === '채권' ? 'var(--zinc-text)' : 'transparent',
                                color: c.status === '채권' ? '#fff' : 'var(--text-sub)',
                                border: '1px solid ' + (c.status === '채권' ? 'var(--zinc-text)' : 'var(--border)'),
                              }}
                              title={c.status === '채권' ? '채권 해제' : '채권화 (회수불가)'}
                            >
                              <Gavel size={11} weight={c.status === '채권' ? 'fill' : 'regular'} />
                              {c.status === '채권' ? 'ON' : 'OFF'}
                            </button>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => setContactOpen(c)}
                              style={{ height: 22, padding: '0 8px', fontSize: 10 }}
                              title="연락기록 추가"
                            >
                              <ChatCircleDots size={11} /> 연락
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 보조 패널 — 시동제어 현황 (사유 뱃지) */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <span style={{ color: 'var(--red-text)' }}>
                  <Power size={14} weight="fill" />
                </span>
                시동제어 현황
                <span className="badge" style={{ background: 'var(--red-bg)', color: 'var(--red-text)' }}>
                  {counts['시동제어']}
                </span>
              </div>
              <div className="panel-meta danger">
                ₩{contracts.filter((c) => c.engineDisabled).reduce((s, c) => s + (c.unpaidAmount ?? 0), 0).toLocaleString()}
              </div>
            </div>
            <div className="panel-body">
              {counts['시동제어'] === 0 ? (
                <div className="empty-state">시동제어 중 차량 없음</div>
              ) : (
                <div>
                  {contracts
                    .filter((c) => c.engineDisabled)
                    .sort((a, b) => (b.engineDisabledAt ?? '').localeCompare(a.engineDisabledAt ?? ''))
                    .map((c) => {
                      const startDate = c.engineDisabledAt?.slice(0, 10) ?? '';
                      const daysSince = startDate
                        ? Math.max(0, Math.round((new Date(today).getTime() - new Date(startDate).getTime()) / 86400000))
                        : 0;
                      const reason = (c.engineDisabledReason || '').trim();
                      const reasonKey = ['미납', '검사지연'].find((k) => reason.includes(k)) ?? (reason || '기타');
                      return (
                        <div key={c.id} className="list-item" onClick={() => setContactOpen(c)} style={{ cursor: 'pointer' }}>
                          <span className="tag over">{reasonKey}</span>
                          <div className="list-item-main">
                            <div className="list-item-top">
                              {c.customerName}
                              <span className="text-weak text-xs">{c.company}</span>
                            </div>
                            <div className="list-item-sub">
                              <span className="plate">{c.vehiclePlate}</span>
                              <span className="text-weak">·</span>
                              <span className="danger mono">₩{(c.unpaidAmount ?? 0).toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="list-item-right">
                            <div className="dday danger">D+{daysSince}</div>
                            <div className="date">{startDate}</div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>

        <BottomBar
          left={
            <>
              <button className="btn btn-primary" type="button" onClick={() => setCreateOpen(true)}>
                <Plus size={14} weight="bold" /> 신규 등록
              </button>
              <button className="btn" type="button" onClick={() => setContactOpen(filtered[0] ?? null)} disabled={filtered.length === 0} title="첫 행 연락기록 — 행 선택 후 우측 연락 버튼 권장">
                <ChatCircleDots size={14} /> 연락기록
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => downloadOverdueExcel(contracts, companyMaster)}
                title="미수 있는 계약만 엑셀로 내려받기"
                disabled={contracts.every((c) => (c.unpaidAmount ?? 0) === 0)}
              >
                <DownloadSimple size={14} /> 미수 엑셀
              </button>
            </>
          }
          right={
            <>
              <span>표시 <strong>{filtered.length}</strong>건</span>
              <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
              <span>미수 <strong className="mono" style={{ color: 'var(--red-text)' }}>₩{filtered.reduce((s, c) => s + (c.unpaidAmount ?? 0), 0).toLocaleString()}</strong></span>
              {counts['시동제어'] > 0 && (
                <>
                  <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
                  <span><Power size={11} weight="fill" style={{ color: 'var(--red-text)', verticalAlign: 'middle' }} /> {counts['시동제어']}</span>
                </>
              )}
            </>
          }
        />
      </div>

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* 연락기록 다이얼로그 */}
      {contactOpen && (
        <ContactLogDialog
          contract={contactOpen}
          onClose={() => setContactOpen(null)}
          onSave={async (date, method, response, nextPromise, notes) => {
            try {
              await addHistory({
                scope: 'contract',
                contractId: contactOpen.id,
                vehiclePlate: contactOpen.vehiclePlate,
                date,
                category: '연락기록',
                title: `${method} — ${response.slice(0, 30)}`,
                description: [response, nextPromise && `약속일: ${nextPromise}`, notes].filter(Boolean).join('\n'),
                status: '완료',
              });
              toast.success('연락기록 저장');
              setContactOpen(null);
            } catch (e) {
              toast.error(friendlyError(e));
            }
          }}
        />
      )}
    </div>
  );
}

/* ─────────────── 연락기록 다이얼로그 ─────────────── */
function ContactLogDialog({
  contract,
  onClose,
  onSave,
}: {
  contract: Contract;
  onClose: () => void;
  onSave: (date: string, method: string, response: string, nextPromise: string, notes: string) => Promise<void>;
}) {
  const [date, setDate] = useState(todayKr());
  const [method, setMethod] = useState('전화');
  const [response, setResponse] = useState('');
  const [nextPromise, setNextPromise] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-main)', borderRadius: 8, width: 480, maxWidth: '90vw',
        padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            연락기록 — {contract.vehiclePlate} {contract.customerName}
          </div>
          <button type="button" className="btn" onClick={onClose} style={{ height: 26, padding: '0 8px' }}>
            <X size={12} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 8, fontSize: 12 }}>
          <label style={{ alignSelf: 'center' }}>연락일</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ height: 28, padding: '0 8px' }} />

          <label style={{ alignSelf: 'center' }}>방법</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ height: 28, padding: '0 8px' }}>
            <option>전화</option>
            <option>문자</option>
            <option>카톡</option>
            <option>방문</option>
            <option>이메일</option>
          </select>

          <label style={{ alignSelf: 'flex-start', paddingTop: 6 }}>고객반응</label>
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="예) 5/30 입금 약속, 통화 안 됨, 연체이유 등"
            rows={3}
            style={{ padding: 8, resize: 'vertical', fontFamily: 'inherit' }}
          />

          <label style={{ alignSelf: 'center' }}>다음 약속일</label>
          <input type="date" value={nextPromise} onChange={(e) => setNextPromise(e.target.value)} style={{ height: 28, padding: '0 8px' }} />

          <label style={{ alignSelf: 'flex-start', paddingTop: 6 }}>비고</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            style={{ padding: 8, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button type="button" className="btn" onClick={onClose} disabled={saving} style={{ height: 30 }}>
            취소
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || !response.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(date, method, response, nextPromise, notes);
              } finally {
                setSaving(false);
              }
            }}
            style={{ height: 30 }}
          >
            <FileXls size={12} weight="bold" /> 저장
          </button>
        </div>
      </div>
    </div>
  );
}
