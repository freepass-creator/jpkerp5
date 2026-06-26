'use client';

/**
 * /admin/fix-1900-dates — 엑셀 2자리 연도 변환 버그로 1900년대로 잘못 저장된
 * 계약 날짜(계약일·만기일) 일괄 보정.
 *
 * 배경: 엑셀이 2자리 연도를 00~29→20xx, 30~99→19xx 로 자동 해석 — 2030년 이후
 * 만기일이 셀 단계에서 이미 1930년대로 깨진 채 import 됨 (v5.0.19 에서 신규
 * import 재발 방지는 끝났고, 이 페이지는 기존에 깨진 채 저장된 건을 1회성 보정).
 *
 * 대상 검출: contractDate 또는 returnScheduledDate 의 연도가 1990 미만.
 * 처리: 해당 필드 +100년.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { CalendarX, CheckCircle } from '@phosphor-icons/react';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useAuth } from '@/lib/use-auth';
import { isSuperAdmin } from '@/lib/admin-emails';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';
import type { Contract } from '@/lib/types';

function plus100(d: string): string {
  const y = parseInt(d.slice(0, 4), 10);
  return `${y + 100}${d.slice(4)}`;
}

type Candidate = {
  contract: Contract;
  field: 'contractDate' | 'returnScheduledDate';
  oldValue: string;
  newValue: string;
};

export default function Fix1900DatesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user?.email);
  useEffect(() => { if (user && !superAdmin) router.replace('/'); }, [user, superAdmin, router]);

  const { contracts, update: updateContract } = useContracts();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  const candidates = useMemo(() => {
    const out: Candidate[] = [];
    for (const c of contracts) {
      if (c.contractDate && /^\d{4}-\d{2}-\d{2}$/.test(c.contractDate) && parseInt(c.contractDate.slice(0, 4), 10) < 1990) {
        out.push({ contract: c, field: 'contractDate', oldValue: c.contractDate, newValue: plus100(c.contractDate) });
      }
      if (c.returnScheduledDate && /^\d{4}-\d{2}-\d{2}$/.test(c.returnScheduledDate) && parseInt(c.returnScheduledDate.slice(0, 4), 10) < 1990) {
        out.push({ contract: c, field: 'returnScheduledDate', oldValue: c.returnScheduledDate, newValue: plus100(c.returnScheduledDate) });
      }
    }
    return out;
  }, [contracts]);

  const key = (cand: Candidate) => `${cand.contract.id}:${cand.field}`;

  const toggleAll = () => {
    if (selected.size === candidates.length) setSelected(new Set());
    else setSelected(new Set(candidates.map(key)));
  };

  const toggleOne = (k: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  async function handleFix() {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    const targets = candidates.filter((cand) => selected.has(key(cand)));
    if (targets.length === 0) { toast.warning('선택된 항목 없음'); return; }
    if (!await showConfirm({ title: `${targets.length}건의 날짜를 +100년 보정합니다.\n\n진행할까요?` })) return;

    setRunning(true);
    setDoneCount(0);
    try {
      // 같은 계약에 두 필드 다 걸리는 경우 합쳐서 한 번에 update
      const byContractId = new Map<string, Contract>();
      for (const cand of targets) {
        const base = byContractId.get(cand.contract.id) ?? cand.contract;
        byContractId.set(cand.contract.id, { ...base, [cand.field]: cand.newValue });
      }
      for (const c of byContractId.values()) {
        await updateContract(c);
        setDoneCount((n) => n + 1);
      }
      toast.success(`${byContractId.size}건 보정 완료`);
      setSelected(new Set());
    } catch (e) {
      toast.error(`실패: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <CalendarX size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>개발도구</span>
            <span style={{ color: 'var(--text-weak)', margin: '0 6px', fontSize: 11 }}>›</span>
            <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>1900년대 날짜 보정</span>
          </div>
        </header>

        <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          <header className="page-header" style={{ flexShrink: 0 }}>
            <div className="page-header-title-group">
              <h1 className="page-header-title">
                <CalendarX size={18} weight="duotone" />
                1900년대 날짜 보정
              </h1>
              <div className="page-header-title-sub">
                엑셀 2자리 연도 변환 버그로 1900년대로 잘못 저장된 계약일·만기일 검출 → 선택 → +100년 일괄 보정.
              </div>
            </div>
          </header>

          <section className="detail-section" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="detail-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <span className="title">대상 ({candidates.length}건)</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>선택 {selected.size}건</span>
                <button className="btn btn-sm" onClick={toggleAll}>
                  {selected.size === candidates.length ? '전체 해제' : '전체 선택'}
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleFix}
                  disabled={running || selected.size === 0 || !superAdmin}
                  title={!superAdmin ? '관리자 전용' : ''}
                >
                  <CheckCircle size={12} weight="bold" />
                  {running ? `처리 중 ${doneCount}/${selected.size}` : '선택 일괄 보정'}
                </button>
              </div>
            </div>

            <div className="detail-section-body" style={{ padding: 0, flex: 1, minHeight: 0, overflow: 'auto' }}>
              {candidates.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-weak)', fontSize: 12 }}>
                  1900년대로 잘못 저장된 날짜 없음
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>
                        <input
                          type="checkbox"
                          checked={candidates.length > 0 && selected.size === candidates.length}
                          ref={(el) => { if (el) el.indeterminate = selected.size > 0 && selected.size < candidates.length; }}
                          onChange={toggleAll}
                        />
                      </th>
                      <th style={{ width: 110 }}>차량번호</th>
                      <th>계약자</th>
                      <th style={{ width: 100 }}>필드</th>
                      <th style={{ width: 110 }}>기존값</th>
                      <th style={{ width: 110 }}>보정값</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((cand) => (
                      <tr key={key(cand)} onClick={() => toggleOne(key(cand))} style={{ cursor: 'pointer' }}>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(key(cand))} onChange={() => toggleOne(key(cand))} />
                        </td>
                        <td className="plate">{cand.contract.vehiclePlate}</td>
                        <td>{cand.contract.customerName}</td>
                        <td className="dim">{cand.field === 'contractDate' ? '계약일' : '만기일'}</td>
                        <td className="mono dim">{cand.oldValue}</td>
                        <td className="mono">{cand.newValue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
