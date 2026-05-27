'use client';

import { useState } from 'react';
import { Database, Upload, CheckCircle, Warning } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useAuth } from '@/lib/use-auth';
import { isSuperAdmin } from '@/lib/admin-emails';
import { generateSchedules } from '@/lib/payment-schedule';
import { dedupAgainst } from '@/lib/dedup';
import { contractKeys } from '@/lib/dedup-keys';
import { toast } from '@/lib/toast';
import { friendlyError } from '@/lib/friendly-error';
import type { Contract, CompanyCode, PaymentEntry, PaymentScheduleInline } from '@/lib/types';
import seedData from '@/lib/migrate/sheet-seed.json';

type SeedContract = {
  vehiclePlate: string; vehicleModel: string; company: string;
  customerName: string; customerPhone1: string;
  contractDate: string; deliveredDate: string;
  returnScheduledDate: string; returnedDate: string | null;
  monthlyRent: number; deposit: number;
  paymentDay: number; paymentMethod: string;
  isCurrent: boolean; salesperson: string; kind: string;
};
type SeedReceivable = {
  vehiclePlate: string; customerName: string; contractDate: string;
  paymentDate: string; amount: number; charged: number; method: string;
};

const COMPANY_CODES: CompanyCode[] = ['아이카', '달카', '렌트로', '직카', '기타'];
function mapCompany(s: string): CompanyCode {
  for (const c of COMPANY_CODES) if (s.includes(c)) return c;
  return '아이카';
}
function mapMethod(m: string): PaymentEntry['source'] {
  const t = (m || '').toLowerCase();
  if (t.includes('카드')) return '카드';
  if (t.includes('자동') || t.includes('cms')) return '계좌';
  if (t.includes('입금') || t.includes('이체')) return '계좌';
  if (t.includes('현금')) return '현금';
  return '수동';
}

export default function MigrateSheetPage() {
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user?.email);
  const { contracts, addMany: addContracts, updateMany } = useContracts();
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [stats, setStats] = useState<{ contractsCreated: number; paymentsAdded: number; unmatched: number } | null>(null);

  const data = seedData as { contracts: SeedContract[]; receivables: SeedReceivable[] };

  function append(line: string) {
    setLog((l) => [...l, `[${new Date().toLocaleTimeString('ko-KR')}] ${line}`]);
  }

  async function runMigration() {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    if (!window.confirm(`구글 시트에서 ${data.contracts.length}개 계약 + ${data.receivables.length}건 결제를 import 합니다. 진행하시겠습니까?`)) return;

    setRunning(true);
    setLog([]);
    setStats(null);
    try {
      // ─── 1단계: 계약 import ───
      append(`1단계: 계약 ${data.contracts.length}건 변환 중...`);
      const seedContracts: Array<Omit<Contract, 'id'>> = data.contracts.map((s) => {
        const termMonths = s.returnScheduledDate && s.contractDate
          ? Math.max(1, Math.round((new Date(s.returnScheduledDate).getTime() - new Date(s.contractDate).getTime()) / (1000 * 60 * 60 * 24 * 30)))
          : 12;
        const schedules: PaymentScheduleInline[] = generateSchedules({
          contractDate: s.contractDate,
          termMonths,
          monthlyRent: s.monthlyRent,
          paymentDay: s.paymentDay,
        }).map((sch) => ({ ...sch }));
        const yy = s.contractDate.slice(2, 4);
        const mm = s.contractDate.slice(5, 7);
        const seqHash = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return {
          contractNo: `ICR-${yy}${mm}-${seqHash}`,
          company: mapCompany(s.company),
          manager: s.salesperson || undefined,
          customerName: s.customerName,
          customerPhone1: s.customerPhone1,
          vehiclePlate: s.vehiclePlate,
          vehicleModel: s.vehicleModel,
          vehicleStatus: s.returnedDate ? '반납' : (s.isCurrent ? '운행' : '반납'),
          contractDate: s.contractDate,
          deliveredDate: s.deliveredDate || undefined,
          returnScheduledDate: s.returnScheduledDate || undefined,
          returnedDate: s.returnedDate || undefined,
          termMonths,
          longTerm: termMonths >= 12,
          monthlyRent: s.monthlyRent,
          deposit: s.deposit,
          paymentDay: s.paymentDay,
          paymentMethod: s.paymentMethod,
          status: s.returnedDate ? '반납' : (s.isCurrent ? '운행' : '반납'),
          currentSeq: 1,
          totalSeq: termMonths,
          unpaidAmount: 0,
          unpaidSeqCount: 0,
          schedules,
        };
      });

      append(`기존 ${contracts.length}건과 중복 검증...`);
      const { unique: freshContracts, duplicates } = dedupAgainst(seedContracts, contracts, contractKeys);
      append(`신규 ${freshContracts.length}건 / 중복 ${duplicates.length}건`);

      if (freshContracts.length === 0) {
        append('신규 계약 없음 — 결제 매칭 단계로 건너뜀');
      } else {
        const created = await addContracts(freshContracts);
        append(`✓ 계약 ${created}건 등록 완료`);
      }

      // ─── 2단계: 결제 매칭 ───
      append(`2단계: 결제 ${data.receivables.length}건 매칭 중...`);

      // 최신 contracts 다시 받기 — addContracts 후 contracts state 가 비동기 갱신되므로
      // 임시: 잠시 대기 + window snapshot
      await new Promise((r) => setTimeout(r, 1500));
      // 페이지에서는 contracts state 를 다시 못 가져오므로, 로컬에서 다시 합쳐서 진행
      // freshContracts 는 id 가 없는 상태 — 매칭하려면 id가 필요한데, addContracts 결과 활용 불가
      // → 그래서 useContracts 의 onValue 콜백이 갱신될 때까지 기다리는 게 정답
      // 대체 방법: contracts 의 plate 매칭으로 다시 찾기

      // 안전한 매칭: contracts state 가 갱신될 때까지 polling
      let updatedContracts = contracts;
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise((r) => setTimeout(r, 500));
        // 다시 contracts hook 의 데이터를 받기 위해 페이지를 새로고침
        // 대신, 임시로 window.location.reload() 후 결제 단계를 분리하자
        // 또는 한 번의 페이지 라이프사이클에서 다 처리하지 말고 사용자에게 2단계로 분리해서 다시 클릭하도록
        break;
      }

      // 결제 매칭은 별도 버튼/단계로 분리 (간단화)
      append('결제 매칭은 별도 단계입니다. 페이지 새로고침 후 [결제 매칭] 버튼을 누르세요.');

      setStats({ contractsCreated: freshContracts.length, paymentsAdded: 0, unmatched: 0 });
      toast.success(`계약 ${freshContracts.length}건 import 완료`);
    } catch (e) {
      append(`오류: ${friendlyError(e)}`);
      toast.error(friendlyError(e));
    } finally {
      setRunning(false);
    }
  }

  async function runPaymentMatching() {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    if (!window.confirm(`결제 ${data.receivables.length}건을 기존 계약에 매칭합니다. 진행하시겠습니까?`)) return;

    setRunning(true);
    setLog([]);
    try {
      append(`결제 ${data.receivables.length}건 → 계약 매칭 중...`);
      // 매칭 키: plate + contractDate 가능한 한 가깝게
      const byPlate = new Map<string, Contract[]>();
      for (const c of contracts) {
        const arr = byPlate.get(c.vehiclePlate.trim()) ?? [];
        arr.push(c);
        byPlate.set(c.vehiclePlate.trim(), arr);
      }

      const updates: Contract[] = [];
      let added = 0;
      let unmatched = 0;
      const contractUpdates = new Map<string, Contract>();

      for (const r of data.receivables) {
        const candidates = byPlate.get(r.vehiclePlate.trim());
        if (!candidates || candidates.length === 0) { unmatched++; continue; }
        // contractDate 일치하는 contract 선택 (없으면 paymentDate ≤ returnScheduledDate 안에 있는 것)
        let target: Contract | undefined;
        if (r.contractDate) {
          target = candidates.find((c) => c.contractDate === r.contractDate);
        }
        if (!target) {
          target = candidates.find((c) => {
            const from = c.contractDate;
            const to = c.returnScheduledDate ?? '9999-12-31';
            return r.paymentDate >= from && r.paymentDate <= to;
          });
        }
        if (!target) target = candidates[0];

        const working = contractUpdates.get(target.id) ?? { ...target, schedules: (target.schedules ?? []).map((s) => ({ ...s, payments: [...(s.payments ?? [])] })) };
        const [cy, cm] = working.contractDate.split('-').map(Number);
        const [py, pm] = r.paymentDate.split('-').map(Number);
        const seqGuess = (py - cy) * 12 + (pm - cm) + 1;
        const seq = Math.max(1, Math.min(working.totalSeq || 99, seqGuess));
        const sched = working.schedules?.find((s) => s.seq === seq);
        if (!sched) { unmatched++; continue; }

        // 중복 체크
        const exists = (sched.payments ?? []).some((e) => e.date === r.paymentDate && e.amount === r.amount && e.source !== '정산');
        if (exists) continue;
        if (!sched.payments) sched.payments = [];
        sched.payments.push({
          date: r.paymentDate, amount: r.amount,
          source: mapMethod(r.method),
          memo: `시트 import (${r.method})`,
        });
        sched.paidAmount = sched.payments.reduce((s, p) => s + p.amount, 0);
        sched.paidAt = sched.payments.reduce((mx, p) => p.date > mx ? p.date : mx, '');
        sched.payments = sched.payments.filter((e) => e.source !== '정산');
        if (sched.paidAmount >= sched.amount) sched.status = '완료';
        else if (sched.paidAmount > 0) sched.status = '부분납';
        contractUpdates.set(working.id, working);
        added++;
      }

      append(`매칭 결과: 추가 ${added}건 / 미매칭 ${unmatched}건 / 갱신 계약 ${contractUpdates.size}건`);
      // 캐시 재계산
      for (const c of contractUpdates.values()) {
        const ss = c.schedules ?? [];
        const unpaid = ss.reduce((sum, s) => {
          if (s.status === '연체') return sum + s.amount;
          if (s.status === '부분납') return sum + Math.max(0, s.amount - s.paidAmount);
          return sum;
        }, 0);
        const seqCount = ss.filter((s) => s.status === '연체' || s.status === '부분납').length;
        const overdue = ss.filter((s) => s.status === '연체' || s.status === '부분납').sort((a, b) => a.seq - b.seq);
        const currentSeq = overdue[0]?.seq ?? ss.find((s) => s.status === '예정')?.seq ?? ss.length;
        const last = ss.flatMap((s) => s.payments ?? []).sort((a, b) => b.date.localeCompare(a.date))[0];
        updates.push({ ...c, unpaidAmount: unpaid, unpaidSeqCount: seqCount, currentSeq, lastPaidDate: last?.date, lastPaidAmount: last?.amount });
      }

      if (updates.length > 0) await updateMany(updates);
      append(`✓ 계약 ${updates.length}건 갱신 완료`);
      toast.success(`결제 ${added}건 매칭`);
      setStats({ contractsCreated: 0, paymentsAdded: added, unmatched });
    } catch (e) {
      append(`오류: ${friendlyError(e)}`);
      toast.error(friendlyError(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 14, color: 'var(--text-main)' }}>
            <Database size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            구글 시트 → Firebase 마이그레이션
          </div>
        </header>

        <div style={{ padding: 24, maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <header className="page-header">
            <div className="page-header-title-group">
              <h1 className="page-header-title">
                <Database size={18} weight="duotone" />
                시트 마이그레이션
              </h1>
              <div className="page-header-title-sub">
                스위치플랜 사업현황 시트 → Firebase RTDB (관리자 전용)
              </div>
            </div>
          </header>

          {!superAdmin && (
            <div style={{ padding: 14, background: 'var(--red-bg)', color: 'var(--red-text)', borderRadius: 6, fontSize: 13 }}>
              <Warning size={14} weight="fill" style={{ marginRight: 6, verticalAlign: 'middle' }} />
              SUPER_ADMIN 만 실행할 수 있습니다.
            </div>
          )}

          <section className="detail-section">
            <div className="detail-section-header">
              <span className="title">시트 데이터 (이미 파싱됨)</span>
            </div>
            <div className="detail-section-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 12 }}>
                <div>
                  <div style={{ color: 'var(--text-weak)', marginBottom: 2 }}>계약 데이터 (계약탭)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--brand)' }}>{data.contracts.length} 건</div>
                  <div style={{ color: 'var(--text-sub)', fontSize: 11, marginTop: 2 }}>
                    현재 계약 {data.contracts.filter((c) => c.isCurrent).length} / 과거 계약 {data.contracts.filter((c) => !c.isCurrent).length}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-weak)', marginBottom: 2 }}>결제 데이터 (채권탭)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green-text)' }}>{data.receivables.length} 건</div>
                  <div style={{ color: 'var(--text-sub)', fontSize: 11, marginTop: 2 }}>
                    월별 입금이력 — 회차 매칭됨
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="detail-section">
            <div className="detail-section-header">
              <span className="title">실행</span>
            </div>
            <div className="detail-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={running || !superAdmin}
                  onClick={runMigration}
                >
                  <Upload weight="bold" /> 1단계: 계약 import ({data.contracts.length}건)
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={running || !superAdmin || contracts.length === 0}
                  onClick={runPaymentMatching}
                >
                  <CheckCircle weight="bold" /> 2단계: 결제 매칭 ({data.receivables.length}건)
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-weak)' }}>
                ※ 1단계 완료 후 페이지 새로고침(F5) → 2단계 실행. 중복은 자동 skip.
              </div>
            </div>
          </section>

          {stats && (
            <section className="detail-section">
              <div className="detail-section-header"><span className="title">결과</span></div>
              <div className="detail-section-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: 13 }}>
                  <div>
                    <div style={{ color: 'var(--text-weak)', fontSize: 11 }}>계약 등록</div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{stats.contractsCreated} 건</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-weak)', fontSize: 11 }}>결제 매칭</div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{stats.paymentsAdded} 건</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-weak)', fontSize: 11 }}>미매칭</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--red-text)' }}>{stats.unmatched} 건</div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {log.length > 0 && (
            <section className="detail-section">
              <div className="detail-section-header"><span className="title">로그</span></div>
              <div className="detail-section-body">
                <pre style={{
                  fontSize: 11, color: 'var(--text-sub)', background: 'var(--bg-sunken)',
                  padding: 10, borderRadius: 4, maxHeight: 300, overflow: 'auto',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>
                  {log.join('\n')}
                </pre>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
