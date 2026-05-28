'use client';

import { useMemo, useState } from 'react';
import { Warning, Power, Phone, FileXls, ChatCircleDots, X } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { useAuth } from '@/lib/use-auth';
import { isAdmin } from '@/lib/admin-emails';
import { toast } from '@/lib/toast';
import { todayKr } from '@/lib/mock-data';
import { friendlyError } from '@/lib/friendly-error';
import type { Contract } from '@/lib/types';

type Filter = '연체중' | '부분납' | '시동제어' | '채권화';

const FILTERS: Filter[] = ['연체중', '부분납', '시동제어', '채권화'];

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
  const { entries: history, add: addHistory } = useHistoryEntries();
  const { user } = useAuth();
  const admin = isAdmin(user?.email);
  const [filter, setFilter] = useState<Filter>('연체중');
  const [contactOpen, setContactOpen] = useState<Contract | null>(null);

  const today = todayKr();

  const filtered = useMemo<Contract[]>(() => {
    const base = contracts.filter((c) => c.id && !c.id.startsWith('vehicle-orphan-'));
    if (filter === '연체중') return base.filter(hasOverdue);
    if (filter === '부분납') return base.filter(hasPartial);
    if (filter === '시동제어') return base.filter((c) => c.engineDisabled === true);
    if (filter === '채권화') return base.filter((c) => c.status === '채권');
    return base;
  }, [contracts, filter]);

  const counts = useMemo(() => ({
    연체중: contracts.filter(hasOverdue).length,
    부분납: contracts.filter(hasPartial).length,
    시동제어: contracts.filter((c) => c.engineDisabled === true).length,
    채권화: contracts.filter((c) => c.status === '채권').length,
  }), [contracts]);

  async function toggleEngineLock(c: Contract) {
    if (!admin) { toast.error('관리자만 시동제어 가능'); return; }
    const next = !c.engineDisabled;
    const reason = next ? prompt('시동제어 사유 (선택)') ?? '' : '';
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

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 14, color: 'var(--text-main)' }}>
            <Warning size={16} weight="fill" style={{ color: 'var(--red-text)' }} />
            미수관리
          </div>
        </header>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 필터 탭 */}
          <div style={{ display: 'flex', gap: 6 }}>
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className="btn"
                onClick={() => setFilter(f)}
                style={{
                  height: 32,
                  padding: '0 14px',
                  fontSize: 12,
                  fontWeight: filter === f ? 600 : 400,
                  background: filter === f ? 'var(--brand)' : 'transparent',
                  color: filter === f ? '#fff' : 'var(--text-main)',
                  border: '1px solid ' + (filter === f ? 'var(--brand)' : 'var(--border)'),
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {f}
                <span style={{
                  fontSize: 11,
                  padding: '1px 6px',
                  background: filter === f ? 'rgba(255,255,255,0.25)' : 'var(--bg-sub)',
                  borderRadius: 8,
                  fontWeight: 500,
                }}>
                  {counts[f]}
                </span>
              </button>
            ))}
          </div>

          {/* 표 */}
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
                    <th style={{ width: 100 }}>액션</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="muted center" style={{ padding: 32 }}>
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

          <div style={{ fontSize: 11, color: 'var(--text-weak)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Phone size={12} />
            <span>행 더블클릭으로 계약 상세를 열려면 운영현황 페이지에서 진입하세요. 이 페이지는 미수 전문 관리용.</span>
          </div>
        </div>
      </div>

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
