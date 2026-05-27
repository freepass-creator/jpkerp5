'use client';

import { useState } from 'react';
import { ref, push, get, update as rtdbUpdate } from 'firebase/database';
import { Database, Upload, Warning, CheckCircle } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { getRtdb, icarPath, ensureAuth, pruneUndefined } from '@/lib/firebase/client';
import { useAuth } from '@/lib/use-auth';
import { isSuperAdmin } from '@/lib/admin-emails';
import { generateSchedules } from '@/lib/payment-schedule';
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

function normalize(s: string): string {
  return (s ?? '').trim().toLowerCase();
}

/** 계약 dedup composite 키 — plate + contractDate + customerName */
function contractKey(c: { vehiclePlate?: string; contractDate?: string; customerName?: string }): string {
  return `${normalize(c.vehiclePlate ?? '')}|${c.contractDate ?? ''}|${normalize(c.customerName ?? '')}`;
}

export default function MigrateSheetPage() {
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user?.email);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [stats, setStats] = useState<{
    contractsCreated: number;
    contractsSkipped: number;
    paymentsAdded: number;
    paymentsSkipped: number;
    unmatched: number;
  } | null>(null);

  const data = seedData as { contracts: SeedContract[]; receivables: SeedReceivable[] };

  function append(line: string) {
    setLog((l) => [...l, `[${new Date().toLocaleTimeString('ko-KR')}] ${line}`]);
  }

  async function runFullMigration() {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    if (!window.confirm(
      `구글 시트에서 계약 ${data.contracts.length}건 + 결제 ${data.receivables.length}건을 import 합니다.\n\n` +
      `· 기존 계약과 중복은 자동 skip\n· 결제는 차량+계약일 매칭해서 schedules.payments에 추가\n· '정산' placeholder는 실 입금으로 자동 대체\n\n진행하시겠습니까?`,
    )) return;

    setRunning(true);
    setLog([]);
    setStats(null);
    try {
      await ensureAuth();
      const db = getRtdb();
      if (!db) throw new Error('Firebase 미설정');

      // ─── 0. 현재 DB 상태 조회 ───
      append('DB 현재 상태 조회 중...');
      const snap = await get(ref(db, icarPath('contracts')));
      const existing: Record<string, Contract> = snap.val() ?? {};
      const existingContracts = Object.values(existing);
      append(`현재 DB: 계약 ${existingContracts.length}건`);

      const existingKeys = new Set(existingContracts.map(contractKey));

      // ─── 1. 계약 생성 (시트 → Contract) ───
      append(`시드 계약 ${data.contracts.length}건 변환 중...`);
      const allContractsById = new Map<string, Contract>();
      for (const c of existingContracts) allContractsById.set(c.id, c);

      const newBatch: Record<string, Contract> = {};
      let createdCount = 0;
      let skippedDup = 0;

      for (const s of data.contracts) {
        const key = contractKey(s);
        if (existingKeys.has(key)) { skippedDup += 1; continue; }
        existingKeys.add(key);  // 시드 내 중복도 방지

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

        const newRef = push(ref(db, icarPath('contracts')));
        const id = newRef.key;
        if (!id) continue;

        const c: Contract = {
          id,
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
        newBatch[id] = pruneUndefined(c);
        allContractsById.set(id, c);
        createdCount += 1;
      }

      append(`신규 ${createdCount}건 / 기존중복 skip ${skippedDup}건`);
      if (createdCount > 0) {
        await rtdbUpdate(ref(db, icarPath('contracts')), newBatch as unknown as Record<string, unknown>);
        append(`✓ 계약 ${createdCount}건 DB 저장 완료`);
      }

      // ─── 2. 결제 매칭 (allContractsById 기준 — 신규+기존 통합) ───
      append(`결제 ${data.receivables.length}건 매칭 중...`);
      const byPlate = new Map<string, Contract[]>();
      for (const c of allContractsById.values()) {
        const arr = byPlate.get(normalize(c.vehiclePlate)) ?? [];
        arr.push(c);
        byPlate.set(normalize(c.vehiclePlate), arr);
      }

      // contracts에 변경 사항 누적 (Map<id, Contract>)
      const dirty = new Map<string, Contract>();
      let added = 0;
      let alreadyHad = 0;
      let unmatched = 0;

      for (const r of data.receivables) {
        const candidates = byPlate.get(normalize(r.vehiclePlate));
        if (!candidates || candidates.length === 0) { unmatched += 1; continue; }

        // contractDate 동일 우선, 없으면 paymentDate가 contract 기간에 들어가는 것
        let target = candidates.find((c) => c.contractDate === r.contractDate);
        if (!target) {
          target = candidates.find((c) => {
            const from = c.contractDate;
            const to = c.returnScheduledDate ?? '9999-12-31';
            return r.paymentDate >= from && r.paymentDate <= to;
          });
        }
        if (!target) target = candidates[0];

        // dirty Map 에서 working copy 가져오거나 새로 생성
        const working = dirty.get(target.id) ?? {
          ...target,
          schedules: (target.schedules ?? []).map((s) => ({ ...s, payments: [...(s.payments ?? [])] })),
        };

        // 결제일자 → seq 추정 (월 단위)
        const [cy, cm] = working.contractDate.split('-').map(Number);
        const [py, pm] = r.paymentDate.split('-').map(Number);
        const seqGuess = (py - cy) * 12 + (pm - cm) + 1;
        const seq = Math.max(1, Math.min(working.totalSeq || 99, seqGuess));
        const sched = working.schedules?.find((s) => s.seq === seq);
        if (!sched) { unmatched += 1; continue; }

        // 중복 (같은 날짜+금액) 이미 있으면 skip
        const exists = (sched.payments ?? []).some(
          (e) => e.date === r.paymentDate && e.amount === r.amount && e.source !== '정산',
        );
        if (exists) { alreadyHad += 1; continue; }

        if (!sched.payments) sched.payments = [];
        sched.payments.push({
          date: r.paymentDate,
          amount: r.amount,
          source: mapMethod(r.method),
          memo: `시트 import (${r.method.trim() || '입금'})`,
        });
        // 정산 entry 제거 (실 입금으로 대체)
        sched.payments = sched.payments.filter((e) => e.source !== '정산');
        sched.paidAmount = sched.payments.reduce((s, p) => s + p.amount, 0);
        sched.paidAt = sched.payments.reduce((mx, p) => p.date > mx ? p.date : mx, '') || undefined;
        if (sched.paidAmount >= sched.amount) sched.status = '완료';
        else if (sched.paidAmount > 0) sched.status = '부분납';
        dirty.set(working.id, working);
        added += 1;
      }
      append(`결제 매칭: 추가 ${added}건 / 이미존재 ${alreadyHad}건 / 미매칭 ${unmatched}건`);

      // ─── 3. 캐시 재계산 + DB 일괄 저장 ───
      if (dirty.size > 0) {
        const updateBatch: Record<string, Contract> = {};
        for (const c of dirty.values()) {
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
          updateBatch[c.id] = pruneUndefined({
            ...c,
            unpaidAmount: unpaid,
            unpaidSeqCount: seqCount,
            currentSeq,
            lastPaidDate: last?.date,
            lastPaidAmount: last?.amount,
          });
        }
        await rtdbUpdate(ref(db, icarPath('contracts')), updateBatch as unknown as Record<string, unknown>);
        append(`✓ 계약 ${dirty.size}건 결제이력 갱신 완료`);
      }

      setStats({
        contractsCreated: createdCount,
        contractsSkipped: skippedDup,
        paymentsAdded: added,
        paymentsSkipped: alreadyHad,
        unmatched,
      });
      toast.success(`마이그레이션 완료 — 계약 ${createdCount} / 결제 ${added}`);
      append('🎉 전체 완료. 운영현황으로 이동해서 결과 확인하세요.');
    } catch (e) {
      append(`❌ 오류: ${friendlyError(e)}`);
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
                스위치플랜 사업현황 시트 → Firebase RTDB (관리자 전용 · 한 번에 처리)
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
            <div className="detail-section-header"><span className="title">시트 데이터</span></div>
            <div className="detail-section-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 12 }}>
                <div>
                  <div style={{ color: 'var(--text-weak)', marginBottom: 2 }}>계약 (계약탭)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--brand)' }}>{data.contracts.length} 건</div>
                  <div style={{ color: 'var(--text-sub)', fontSize: 11, marginTop: 2 }}>
                    현재 {data.contracts.filter((c) => c.isCurrent).length} / 과거 {data.contracts.filter((c) => !c.isCurrent).length}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-weak)', marginBottom: 2 }}>결제 (채권탭)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green-text)' }}>{data.receivables.length} 건</div>
                  <div style={{ color: 'var(--text-sub)', fontSize: 11, marginTop: 2 }}>
                    회차 매칭 → schedules.payments
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="detail-section">
            <div className="detail-section-header"><span className="title">실행</span></div>
            <div className="detail-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn btn-primary"
                type="button"
                disabled={running || !superAdmin}
                onClick={runFullMigration}
                style={{ height: 44, fontSize: 14, fontWeight: 600 }}
              >
                <Upload weight="bold" size={16} /> 전체 import 실행 (계약 + 결제 한 번에)
              </button>
              <div style={{ fontSize: 11, color: 'var(--text-weak)', lineHeight: 1.6 }}>
                ✓ 기존 계약 중복(차량번호+계약일+이름)은 자동 skip<br />
                ✓ 결제는 차량번호로 매칭 → 결제일자로 회차 추정 → schedules.payments에 추가<br />
                ✓ 'spillover/스냅샷 자동 정리' (정산) entry 는 실 입금으로 자동 대체<br />
                ✓ 모든 캐시 (미수금/회차/최근결제) 자동 재계산
              </div>
            </div>
          </section>

          {stats && (
            <section className="detail-section">
              <div className="detail-section-header">
                <CheckCircle size={12} weight="duotone" style={{ color: 'var(--green-text)' }} />
                <span className="title">실행 결과</span>
              </div>
              <div className="detail-section-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: 13 }}>
                  <div>
                    <div style={{ color: 'var(--text-weak)', fontSize: 11 }}>신규 계약</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--green-text)' }}>{stats.contractsCreated}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-sub)' }}>중복 skip: {stats.contractsSkipped}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-weak)', fontSize: 11 }}>결제 매칭</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--green-text)' }}>{stats.paymentsAdded}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-sub)' }}>이미있음: {stats.paymentsSkipped}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-weak)', fontSize: 11 }}>미매칭</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: stats.unmatched > 0 ? 'var(--red-text)' : 'var(--text-sub)' }}>
                      {stats.unmatched}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-sub)' }}>차량 미등록</div>
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
                  padding: 10, borderRadius: 4, maxHeight: 400, overflow: 'auto',
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
