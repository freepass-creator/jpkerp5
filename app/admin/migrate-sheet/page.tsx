'use client';

import { useState } from 'react';
import { ref, push, get, update as rtdbUpdate, remove as rtdbRemove } from 'firebase/database';
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
  const t = (s ?? '').trim();
  if (!t) return '기타';
  for (const c of COMPANY_CODES) if (t.includes(c)) return c;
  return t as CompanyCode;  // 알 수 없는 회사명 원본 보존
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

/** 차량+고객 기준 그룹키 (contractDate 차이 흡수) */
function groupKey(c: { vehiclePlate?: string; customerName?: string }): string {
  return `${normalize(c.vehiclePlate ?? '')}|${normalize(c.customerName ?? '')}`;
}

/** 실 입금(정산 아닌) entry 갯수 — 중복 그룹에서 keeper 선택 기준 */
function countRealPayments(c: Contract): number {
  return (c.schedules ?? [])
    .flatMap((s) => s.payments ?? [])
    .filter((p) => p.source !== '정산').length;
}

export default function MigrateSheetPage() {
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user?.email);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [stats, setStats] = useState<{
    contractsCreated: number;
    contractsDeleted: number;
    contractsCompanyFixed: number;
    paymentsAdded: number;
    settlementsRemoved: number;
    unmatched: number;
  } | null>(null);

  const data = seedData as { contracts: SeedContract[]; receivables: SeedReceivable[] };

  function append(line: string) {
    setLog((l) => [...l, `[${new Date().toLocaleTimeString('ko-KR')}] ${line}`]);
  }

  /** 위험: company === '아이카' 인 contract 일괄 삭제 */
  async function deleteAllIcar() {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    setRunning(true);
    setLog([]);
    try {
      await ensureAuth();
      const db = getRtdb();
      if (!db) throw new Error('Firebase 미설정');

      append('현재 DB 조회 중...');
      const snap = await get(ref(db, icarPath('contracts')));
      const existing: Record<string, Contract> = snap.val() ?? {};
      const allContracts = Object.values(existing);
      const targets = allContracts.filter((c) => c.company === '아이카');
      append(`전체 ${allContracts.length}건 중 '아이카' 회사: ${targets.length}건`);

      if (targets.length === 0) {
        toast.warning('아이카 계약 없음');
        return;
      }
      if (!window.confirm(`'아이카' 계약 ${targets.length}건을 영구 삭제합니다. 진행하시겠습니까?`)) return;
      if (!window.confirm(`한 번 더 확인 — 진짜 삭제할까요? (${targets.length}건)`)) return;

      let deleted = 0;
      for (const c of targets) {
        await rtdbRemove(ref(db, `${icarPath('contracts')}/${c.id}`));
        deleted += 1;
        if (deleted % 20 === 0) append(`삭제 진행: ${deleted}/${targets.length}`);
      }
      append(`✓ '아이카' 계약 ${deleted}건 삭제 완료`);
      toast.success(`아이카 ${deleted}건 삭제 완료`);
    } catch (e) {
      append(`❌ 오류: ${friendlyError(e)}`);
      toast.error(friendlyError(e));
    } finally {
      setRunning(false);
    }
  }

  async function runFullMigration() {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    if (!window.confirm(
      `구글 시트 import + 중복 자동 정리\n\n` +
      `· 같은 (차량번호+고객명) 중복 발견 시 실 입금 데이터 많은 쪽 keeper, 나머지 삭제\n` +
      `· 회사명 잘못된 경우 (예: 아이카로 박힘) 시드값으로 자동 보정\n` +
      `· 'spillover/스냅샷 자동 정리' 는 실 입금과 같은 월(회차)에 있으면 제거\n` +
      `· 결제는 차량+계약일 매칭 → schedules.payments에 추가\n\n진행하시겠습니까?`,
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
      let existingContracts = Object.values(existing);
      append(`현재 DB: 계약 ${existingContracts.length}건`);

      // ─── 0-Z. 회사='아이카' 잘못 박힌 계약 일괄 삭제 (시드에 아이카 없음 — 모두 잔재) ───
      const icarTargets = existingContracts.filter((c) => c.company === '아이카');
      if (icarTargets.length > 0) {
        append(`'아이카' 잘못 박힌 계약 ${icarTargets.length}건 삭제 중...`);
        for (const c of icarTargets) {
          await rtdbRemove(ref(db, `${icarPath('contracts')}/${c.id}`));
        }
        existingContracts = existingContracts.filter((c) => c.company !== '아이카');
        append(`✓ '아이카' ${icarTargets.length}건 삭제`);
      }

      // ─── 0-A. DB 자체 중복 정리 (시드 무관) ───
      // 같은 (plate+customer) 가 여러 건 있으면 → 실입금 많은 쪽 keeper, 나머지 입금 이전 후 삭제
      append('DB 자체 중복 검사 중 (plate+customer 그룹)...');
      const preCleanupBatch: Record<string, Contract | null> = {};
      {
        const preGroups = new Map<string, Contract[]>();
        for (const c of existingContracts) {
          const k = groupKey(c);
          const arr = preGroups.get(k) ?? [];
          arr.push(c);
          preGroups.set(k, arr);
        }
        let preDeleted = 0;
        for (const [k, group] of preGroups) {
          if (group.length <= 1) continue;
          const sorted = [...group].sort((a, b) => {
            const ra = countRealPayments(a); const rb = countRealPayments(b);
            if (ra !== rb) return rb - ra;
            return (b.contractDate || '').localeCompare(a.contractDate || '');
          });
          const keeper = sorted[0];
          const losers = sorted.slice(1);
          // 작업할 keeper 복사본 — schedule + payments deep copy
          const keeperWork: Contract = {
            ...keeper,
            schedules: (keeper.schedules ?? []).map((s) => ({ ...s, payments: [...(s.payments ?? [])] })),
          };
          for (const loser of losers) {
            // loser 의 실 입금 entry 들 keeper로 이전
            for (const ls of loser.schedules ?? []) {
              for (const p of ls.payments ?? []) {
                if (p.source === '정산') continue;
                // keeper 의 같은 회차 찾아 추가
                const [cy, cm] = keeperWork.contractDate.split('-').map(Number);
                const [py, pm] = p.date.split('-').map(Number);
                const seqGuess = Math.max(1, Math.min(keeperWork.totalSeq || 99, (py - cy) * 12 + (pm - cm) + 1));
                const target = keeperWork.schedules?.find((s) => s.seq === seqGuess);
                if (!target) continue;
                const exists = (target.payments ?? []).some((e) => e.date === p.date && e.amount === p.amount && e.source !== '정산');
                if (exists) continue;
                if (!target.payments) target.payments = [];
                target.payments.push(p);
              }
            }
            preCleanupBatch[loser.id] = null;  // 삭제
            preDeleted += 1;
            append(`  중복 삭제: ${loser.vehiclePlate} ${loser.customerName} (${loser.contractDate}) → keeper ${keeper.contractDate}`);
          }
          preCleanupBatch[keeper.id] = keeperWork;
        }
        if (preDeleted > 0) {
          append(`DB 자체 중복 ${preDeleted}건 발견 — 삭제 + 입금 이전`);
        } else {
          append('DB 자체 중복 없음');
        }
        // existingContracts 갱신 (다음 단계에서 사용)
        existingContracts = existingContracts.filter((c) => preCleanupBatch[c.id] !== null);
        // keeper 업데이트 반영
        existingContracts = existingContracts.map((c) => {
          const updated = preCleanupBatch[c.id];
          return updated && typeof updated === 'object' ? updated : c;
        });
      }

      // ─── 1. (차량+고객) 그룹 인덱스 — 시드 매칭용 (cleanup 후 상태) ───
      const groupMap = new Map<string, Contract[]>();
      for (const c of existingContracts) {
        const k = groupKey(c);
        const arr = groupMap.get(k) ?? [];
        arr.push(c);
        groupMap.set(k, arr);
      }

      let contractsCreated = 0;
      let contractsDeleted = 0;
      let contractsCompanyFixed = 0;
      const writeBatch: Record<string, Contract | null> = {};  // null = delete
      const keptContracts = new Map<string, Contract>();  // groupKey → kept contract

      // ─── 2. 시드 계약 처리 ───
      append(`시드 계약 ${data.contracts.length}건 처리 중...`);
      for (const s of data.contracts) {
        const k = groupKey(s);
        const correctCompany = mapCompany(s.company);
        const termMonths = s.returnScheduledDate && s.contractDate
          ? Math.max(1, Math.round((new Date(s.returnScheduledDate).getTime() - new Date(s.contractDate).getTime()) / (1000 * 60 * 60 * 24 * 30)))
          : 12;

        const dbGroup = groupMap.get(k) ?? [];

        if (dbGroup.length === 0) {
          // 신규 — 그대로 추가
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
            id, contractNo: `ICR-${yy}${mm}-${seqHash}`,
            company: correctCompany,
            manager: s.salesperson || undefined,
            customerName: s.customerName, customerPhone1: s.customerPhone1,
            vehiclePlate: s.vehiclePlate, vehicleModel: s.vehicleModel,
            vehicleStatus: s.returnedDate ? '반납' : (s.isCurrent ? '운행' : '반납'),
            contractDate: s.contractDate,
            deliveredDate: s.deliveredDate || undefined,
            returnScheduledDate: s.returnScheduledDate || undefined,
            returnedDate: s.returnedDate || undefined,
            termMonths, longTerm: termMonths >= 12,
            monthlyRent: s.monthlyRent, deposit: s.deposit,
            paymentDay: s.paymentDay, paymentMethod: s.paymentMethod,
            status: s.returnedDate ? '반납' : (s.isCurrent ? '운행' : '반납'),
            currentSeq: 1, totalSeq: termMonths,
            unpaidAmount: 0, unpaidSeqCount: 0,
            schedules,
          };
          writeBatch[id] = pruneUndefined(c);
          keptContracts.set(k, c);
          contractsCreated += 1;
          continue;
        }

        // 기존 계약 있음 — keeper 선택
        // 정렬: 실입금 많은 것 우선 → contractDate 최근 → 회사명 시드와 일치하는 것
        const sorted = [...dbGroup].sort((a, b) => {
          const ra = countRealPayments(a); const rb = countRealPayments(b);
          if (ra !== rb) return rb - ra;
          if (a.contractDate !== b.contractDate) return (b.contractDate || '').localeCompare(a.contractDate || '');
          return (a.company === correctCompany ? -1 : 1) - (b.company === correctCompany ? -1 : 1);
        });
        const keeper = sorted[0];
        const losers = sorted.slice(1);

        // keeper 의 회사명 보정 (시드 기준)
        let keeperUpdated = keeper;
        if (keeper.company !== correctCompany) {
          keeperUpdated = { ...keeper, company: correctCompany };
          contractsCompanyFixed += 1;
        }
        // 시드와 contractDate / monthlyRent / deposit 도 보정 (시드가 신뢰소스)
        if (keeperUpdated.contractDate !== s.contractDate || keeperUpdated.monthlyRent !== s.monthlyRent || keeperUpdated.deposit !== s.deposit) {
          keeperUpdated = {
            ...keeperUpdated,
            contractDate: s.contractDate,
            deliveredDate: s.deliveredDate || keeperUpdated.deliveredDate,
            returnScheduledDate: s.returnScheduledDate || keeperUpdated.returnScheduledDate,
            returnedDate: s.returnedDate || keeperUpdated.returnedDate,
            monthlyRent: s.monthlyRent,
            deposit: s.deposit,
            paymentDay: s.paymentDay,
            termMonths,
            totalSeq: Math.max(keeperUpdated.totalSeq ?? 0, termMonths),
          };
        }
        if (keeperUpdated !== keeper) writeBatch[keeper.id] = pruneUndefined(keeperUpdated);
        keptContracts.set(k, keeperUpdated);

        // losers 삭제 + 그들의 실입금 entry 를 keeper 로 이전
        for (const loser of losers) {
          const lostReal = (loser.schedules ?? [])
            .flatMap((s) => (s.payments ?? []).filter((p) => p.source !== '정산'));
          // keeper schedules 에 lost 실입금 추가 (회차 매칭 — paymentDate 기준)
          if (lostReal.length > 0) {
            const keeperSchedules = keeperUpdated.schedules ?? [];
            for (const p of lostReal) {
              const [cy, cm] = keeperUpdated.contractDate.split('-').map(Number);
              const [py, pm] = p.date.split('-').map(Number);
              const seqGuess = (py - cy) * 12 + (pm - cm) + 1;
              const seq = Math.max(1, Math.min(keeperUpdated.totalSeq || 99, seqGuess));
              const sched = keeperSchedules.find((sch) => sch.seq === seq);
              if (!sched) continue;
              const exists = (sched.payments ?? []).some((e) => e.date === p.date && e.amount === p.amount && e.source !== '정산');
              if (exists) continue;
              if (!sched.payments) sched.payments = [];
              sched.payments.push(p);
            }
            writeBatch[keeper.id] = pruneUndefined({ ...keeperUpdated, schedules: keeperSchedules });
          }
          writeBatch[loser.id] = null;  // 삭제 마커
          contractsDeleted += 1;
        }
      }

      append(`정리: 신규 ${contractsCreated} / 회사보정 ${contractsCompanyFixed} / 중복삭제 ${contractsDeleted}`);

      // ─── 3. 시트의 결제 매칭 ───
      append(`결제 ${data.receivables.length}건 매칭 중...`);
      const allKept = new Map<string, Contract>();
      // DB에 살아남는 것 + 신규 추가된 것 합쳐서 다시 그룹 매핑
      for (const c of existingContracts) {
        if (writeBatch[c.id] === null) continue;  // 삭제 예정
        const current = (writeBatch[c.id] as Contract | undefined) ?? c;
        allKept.set(current.id, current);
      }
      for (const [id, v] of Object.entries(writeBatch)) {
        if (v === null) continue;
        if (!allKept.has(id)) allKept.set(id, v as Contract);
      }
      const byPlate = new Map<string, Contract[]>();
      for (const c of allKept.values()) {
        const arr = byPlate.get(normalize(c.vehiclePlate)) ?? [];
        arr.push(c);
        byPlate.set(normalize(c.vehiclePlate), arr);
      }

      let paymentsAdded = 0;
      let unmatched = 0;
      const paymentDirty = new Map<string, Contract>();

      for (const r of data.receivables) {
        const candidates = byPlate.get(normalize(r.vehiclePlate));
        if (!candidates || candidates.length === 0) { unmatched += 1; continue; }
        // 가장 적합한 contract — paymentDate가 contract 기간 안에 있는 것
        let target = candidates.find((c) => {
          const from = c.contractDate;
          const to = c.returnScheduledDate ?? '9999-12-31';
          return r.paymentDate >= from && r.paymentDate <= to;
        });
        if (!target) target = candidates.find((c) => normalize(c.customerName) === normalize(r.customerName));
        if (!target) target = candidates[0];

        const working = paymentDirty.get(target.id) ?? {
          ...target,
          schedules: (target.schedules ?? []).map((sc) => ({ ...sc, payments: [...(sc.payments ?? [])] })),
        };
        const [cy, cm] = working.contractDate.split('-').map(Number);
        const [py, pm] = r.paymentDate.split('-').map(Number);
        const seq = Math.max(1, Math.min(working.totalSeq || 99, (py - cy) * 12 + (pm - cm) + 1));
        const sched = working.schedules?.find((s) => s.seq === seq);
        if (!sched) { unmatched += 1; continue; }
        const exists = (sched.payments ?? []).some((e) => e.date === r.paymentDate && e.amount === r.amount && e.source !== '정산');
        if (exists) continue;
        if (!sched.payments) sched.payments = [];
        sched.payments.push({
          date: r.paymentDate, amount: r.amount,
          source: mapMethod(r.method),
          memo: `시트 import (${r.method.trim() || '입금'})`,
        });
        paymentDirty.set(working.id, working);
        paymentsAdded += 1;
      }
      append(`결제 매칭: 추가 ${paymentsAdded}건 / 미매칭 ${unmatched}건`);

      // ─── 4. 정산 entry 제거 + 캐시 재계산 ───
      let settlementsRemoved = 0;
      const allDirty = new Map<string, Contract>(paymentDirty);
      // writeBatch에 이미 있는 contract도 schedule cleanup
      for (const [id, v] of Object.entries(writeBatch)) {
        if (v === null) continue;
        if (allDirty.has(id)) continue;
        if (v) allDirty.set(id, v as Contract);
      }

      for (const c of allDirty.values()) {
        const ss = c.schedules ?? [];
        let modified = false;
        for (const s of ss) {
          const realCount = (s.payments ?? []).filter((p) => p.source !== '정산').length;
          if (realCount > 0) {
            const before = s.payments?.length ?? 0;
            s.payments = (s.payments ?? []).filter((p) => p.source !== '정산');
            const after = s.payments?.length ?? 0;
            if (before !== after) {
              settlementsRemoved += before - after;
              modified = true;
            }
          }
          // status / paidAmount / paidAt 재계산
          const paid = (s.payments ?? []).reduce((sum, p) => sum + p.amount, 0);
          const lastDate = (s.payments ?? []).reduce<string>((mx, p) => p.date > mx ? p.date : mx, '');
          s.paidAmount = paid;
          s.paidAt = lastDate || undefined;
          if (s.status !== '면제') {
            if (paid >= s.amount) s.status = '완료';
            else if (paid > 0) s.status = '부분납';
            // 그 외는 read 시 recalcContract가 처리
          }
        }
        // 계약 캐시
        const unpaid = ss.reduce((sum, s) => {
          if (s.status === '연체') return sum + s.amount;
          if (s.status === '부분납') return sum + Math.max(0, s.amount - s.paidAmount);
          return sum;
        }, 0);
        const seqCount = ss.filter((s) => s.status === '연체' || s.status === '부분납').length;
        const overdue = ss.filter((s) => s.status === '연체' || s.status === '부분납').sort((a, b) => a.seq - b.seq);
        const currentSeq = overdue[0]?.seq ?? ss.find((s) => s.status === '예정')?.seq ?? ss.length;
        const last = ss.flatMap((sc) => sc.payments ?? []).sort((a, b) => b.date.localeCompare(a.date))[0];
        const finalContract = {
          ...c,
          schedules: ss,
          unpaidAmount: unpaid,
          unpaidSeqCount: seqCount,
          currentSeq,
          lastPaidDate: last?.date,
          lastPaidAmount: last?.amount,
        };
        writeBatch[c.id] = pruneUndefined(finalContract);
        void modified;
      }

      // ─── 5. DB 일괄 적용 (null = 삭제) ───
      // preCleanupBatch 결과를 writeBatch에 머지 (writeBatch 가 우선 — 시드 보정 반영된 값)
      for (const [id, v] of Object.entries(preCleanupBatch)) {
        if (writeBatch[id] === undefined) {
          writeBatch[id] = v;
        }
      }
      append(`DB 일괄 적용 중... (${Object.keys(writeBatch).length}건)`);
      const updateOnly: Record<string, unknown> = {};
      const removeIds: string[] = [];
      for (const [id, v] of Object.entries(writeBatch)) {
        if (v === null) removeIds.push(id);
        else updateOnly[id] = v;
      }
      if (Object.keys(updateOnly).length > 0) {
        await rtdbUpdate(ref(db, icarPath('contracts')), updateOnly);
      }
      for (const id of removeIds) {
        await rtdbRemove(ref(db, `${icarPath('contracts')}/${id}`));
      }

      append(`✓ 정산 entry 제거: ${settlementsRemoved}개`);
      append('🎉 전체 완료. 운영현황으로 이동해서 결과 확인하세요.');
      setStats({
        contractsCreated, contractsDeleted, contractsCompanyFixed,
        paymentsAdded, settlementsRemoved, unmatched,
      });
      toast.success(`완료 — 계약 ${contractsCreated}신규/${contractsDeleted}삭제 · 결제 ${paymentsAdded}`);
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
                스위치플랜 사업현황 시트 → Firebase RTDB · 중복 자동 정리
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
                <Upload weight="bold" size={16} /> 전체 import + 중복 정리
              </button>
              <button
                className="btn btn-danger"
                type="button"
                disabled={running || !superAdmin}
                onClick={deleteAllIcar}
                style={{ height: 40, fontSize: 13 }}
              >
                <Warning weight="bold" size={14} /> 회사='아이카' 계약 일괄 삭제 (잘못 박힌 것)
              </button>
              <div style={{ fontSize: 11, color: 'var(--text-weak)', lineHeight: 1.6 }}>
                ✓ (차량+고객) 기준 중복 발견 시 실 입금 많은 쪽 keeper → 나머지 삭제 + 입금 이전<br />
                ✓ 회사명 잘못된 것 (예: '아이카'로 잘못 박힘) → 시드값으로 자동 보정<br />
                ✓ contractDate / 월대여료 / 보증금 / paymentDay → 시드 기준으로 keeper 갱신<br />
                ✓ '스냅샷 자동 정리' (정산) entry → 실 입금 있는 회차에서 자동 제거<br />
                ✓ 캐시 (미수금/회차/최근결제) 모두 자동 재계산
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
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-weak)', fontSize: 11 }}>중복 삭제</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--orange-text)' }}>{stats.contractsDeleted}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-weak)', fontSize: 11 }}>회사 보정</div>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>{stats.contractsCompanyFixed}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-weak)', fontSize: 11 }}>결제 추가</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--green-text)' }}>{stats.paymentsAdded}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-weak)', fontSize: 11 }}>정산 제거</div>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>{stats.settlementsRemoved}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-weak)', fontSize: 11 }}>미매칭</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: stats.unmatched > 0 ? 'var(--red-text)' : 'var(--text-sub)' }}>
                      {stats.unmatched}
                    </div>
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
