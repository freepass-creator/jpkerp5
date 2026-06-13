'use client';

import { useState } from 'react';
import { ref, push, get, update as rtdbUpdate, remove as rtdbRemove } from 'firebase/database';
import { Database, Upload, Warning, CheckCircle, MagnifyingGlass, ListChecks, Image, Truck, Skull } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { getRtdb, dbPath, RTDB_ROOT, ensureAuth, pruneUndefined } from '@/lib/firebase/client';
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

function mapCompany(s: string): CompanyCode {
  return (s ?? '').trim() || '기타';
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

  /** 진단 — Firebase 프로젝트 정보 + DB 노드 상태 전체 출력 */
  async function diagnose() {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    setRunning(true);
    setLog([]);
    try {
      // 1) 현재 연결된 Firebase 프로젝트
      append('═══ Firebase 연결 정보 ═══');
      append(`projectId: ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '(미설정)'}`);
      append(`databaseURL: ${process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || '(미설정)'}`);
      append(`authDomain: ${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '(미설정)'}`);

      await ensureAuth();
      const db = getRtdb();
      if (!db) throw new Error('Firebase 미설정');
      append(`auth user: ${user?.email ?? '(미로그인)'}`);
      append(`super admin: ${superAdmin ? 'YES' : 'NO'}`);

      // 2) root 노드 자식 카운트
      append(`═══ ${RTDB_ROOT} root 자식 노드 ═══`);
      const rootSnap = await get(ref(db, RTDB_ROOT));
      const root = rootSnap.val() ?? {};
      if (Object.keys(root).length === 0) {
        append('  (root 비어있음)');
      } else {
        for (const [key, val] of Object.entries(root)) {
          const count = val && typeof val === 'object' ? Object.keys(val).length : 0;
          append(`  · ${key}: ${count}건`);
        }
      }

      // 3) vehicles 노드 상세
      append('═══ vehicles 상세 (앞 40대) ═══');
      const vSnap = await get(ref(db, dbPath('vehicles')));
      const vehicles = vSnap.val() ?? {};
      const vList = Object.entries(vehicles) as Array<[string, { plate?: string; company?: string; status?: string; notes?: string }]>;
      append(`총 ${vList.length}대`);
      for (const [id, v] of vList.slice(0, 40)) {
        append(`  · ${id} | ${v.plate} | ${v.company} | ${v.status} | ${(v.notes ?? '').slice(0, 30)}`);
      }
      if (vList.length > 40) append(`  ... 외 ${vList.length - 40}대`);

      // 4) contracts 노드 상세 (회사='스위치플랜' 같은 의심 케이스)
      append('═══ contracts 상세 (앞 40건) ═══');
      const cSnap = await get(ref(db, dbPath('contracts')));
      const contracts = cSnap.val() ?? {};
      const cList = Object.entries(contracts) as Array<[string, { vehiclePlate?: string; customerName?: string; company?: string; notes?: string }]>;
      append(`총 ${cList.length}건`);
      for (const [id, c] of cList.slice(0, 40)) {
        append(`  · ${id} | ${c.vehiclePlate} | ${c.customerName || '(고객없음)'} | ${c.company} | ${(c.notes ?? '').slice(0, 30)}`);
      }
      if (cList.length > 40) append(`  ... 외 ${cList.length - 40}건`);

      append('═══ 진단 완료 ═══');
      append('판단 가이드:');
      append('  - vehicles 24대 보임 → 그게 운영현황 24건의 정체. wipe 버튼이 못 지웠다면 Rules 문제');
      append('  - vehicles/contracts 0건인데 화면엔 24건 → 브라우저 캐시 (Ctrl+Shift+R)');
      append('  - 그 외 노드(snapshots, vehicleMaster 등)에 들어있으면 알려주세요');
    } catch (e) {
      append(`✗ 실패: ${friendlyError(e)}`);
    } finally {
      setRunning(false);
    }
  }

  /** 운영 데이터 품질 진단 — 활성 계약에서 필수 필드 결손 카운트 */
  async function diagnoseOperational() {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    setRunning(true);
    setLog([]);
    try {
      await ensureAuth();
      const db = getRtdb();
      if (!db) throw new Error('Firebase 미설정');

      append('═══ 운영 데이터 품질 진단 ═══');
      const cSnap = await get(ref(db, dbPath('contracts')));
      const contracts = (cSnap.val() ?? {}) as Record<string, Contract>;
      const all = Object.values(contracts);
      const active = all.filter((c) => {
        const s = c.vehicleStatus;
        const inactive = s === '휴차' || s === '휴차대기' || s === '매각검토'
          || s === '매각' || s === '매각대기'
          || s === '상품화대기' || s === '상품화중' || s === '상품대기'
          || s === '구매대기' || s === '등록대기'
          || c.status === '반납' || c.status === '해지';
        return !inactive;
      });
      append(`전체 계약 ${all.length}건 · 활성 ${active.length}건`);

      // 필수 결손 카운트
      const missingCustomerIdent = active.filter((c) => {
        const d = (c.customerIdentNo ?? '').replace(/\D/g, '');
        return c.customerKind !== '법인' && d.length !== 13;
      });
      const missingDriverForCorp = active.filter((c) =>
        c.customerKind === '법인' && (c.driverIdentNo ?? '').replace(/\D/g, '').length !== 13,
      );
      const missingInsurance = active.filter((c) => !c.insuranceAge);
      const missingPaymentDay = active.filter((c) => !c.paymentDay);
      const missingMonthlyRent = active.filter((c) => !(c.monthlyRent > 0));

      append('');
      append('── 활성 계약 필수 결손 ──');
      append(`  · 개인 임차인 등록번호 결손: ${missingCustomerIdent.length}건`);
      append(`  · 법인 임차인 주운전자 결손: ${missingDriverForCorp.length}건`);
      append(`  · 보험연령 결손: ${missingInsurance.length}건`);
      append(`  · 결제일 결손: ${missingPaymentDay.length}건`);
      append(`  · 월대여료 0원: ${missingMonthlyRent.length}건`);

      // 샘플 표시 (각 카테고리 5건)
      function dumpSample(label: string, list: Contract[]) {
        if (list.length === 0) return;
        append('');
        append(`── ${label} 샘플 (앞 5건) ──`);
        for (const c of list.slice(0, 5)) {
          append(`  · ${c.vehiclePlate ?? '?'} | ${c.customerName ?? '?'} | ${c.company ?? '?'}`);
        }
        if (list.length > 5) append(`  ... 외 ${list.length - 5}건`);
      }
      dumpSample('등록번호 결손 개인', missingCustomerIdent);
      dumpSample('보험연령 결손', missingInsurance);

      // 사진 plate-키 진단
      append('');
      append('── 사진 plate-키 (자산 미등록) ──');
      const aSnap = await get(ref(db, dbPath('vehicle_attachments')));
      const allAttach = (aSnap.val() ?? {}) as Record<string, { photos?: unknown[] }>;
      const plateKeys = Object.keys(allAttach).filter((k) => k.startsWith('plate:'));
      append(`  plate: 키 노드 ${plateKeys.length}개`);
      for (const k of plateKeys.slice(0, 10)) {
        const n = allAttach[k]?.photos?.length ?? 0;
        append(`  · ${k.replace('plate:', '')} — 사진 ${n}장`);
      }
      if (plateKeys.length > 10) append(`  ... 외 ${plateKeys.length - 10}개`);

      append('');
      append('═══ 운영 진단 완료 ═══');
      append('→ 결손은 계약 detail 에서 직접 입력하거나 import 시트로 일괄 보강');
      append('→ 사진 plate-키는 아래 「사진 plate-키 → 자체코드 일괄 이관」 버튼으로 정리');
    } catch (e) {
      append(`✗ 실패: ${friendlyError(e)}`);
    } finally {
      setRunning(false);
    }
  }

  /** 사진 plate-키 → vehicleId 일괄 이관. plate(또는 plateHistory) 매칭되는 차량에 자동 흡수 */
  async function migratePlatePhotos() {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    if (!window.confirm('plate-키로 임시 저장된 사진을 자체코드(vehicleId) 로 일괄 이관합니다.\n(매칭되는 차량이 있는 plate만 처리, 미등록 차량은 그대로 plate 유지)')) return;
    setRunning(true);
    setLog([]);
    try {
      await ensureAuth();
      const db = getRtdb();
      if (!db) throw new Error('Firebase 미설정');

      const aSnap = await get(ref(db, dbPath('vehicle_attachments')));
      const allAttach = (aSnap.val() ?? {}) as Record<string, unknown>;
      const plateKeys = Object.keys(allAttach).filter((k) => k.startsWith('plate:'));
      append(`plate-키 노드 ${plateKeys.length}개 발견`);

      const vSnap = await get(ref(db, dbPath('vehicles')));
      const vehicles = (vSnap.val() ?? {}) as Record<string, { id?: string; plate?: string; plateHistory?: string[] }>;
      const vehicleList = Object.values(vehicles);

      const { mergePlateAttachmentsToVehicle } = await import('@/lib/firebase/vehicle-attachments-store');
      let merged = 0;
      let unmatched = 0;

      for (const k of plateKeys) {
        const plate = k.slice(6).trim(); // 'plate:' 6자
        const v = vehicleList.find((vv) =>
          (vv.plate ?? '').trim() === plate
          || (vv.plateHistory ?? []).some((p) => (p ?? '').trim() === plate),
        );
        if (v && v.id) {
          append(`✓ ${plate} → ${v.id} 이관`);
          await mergePlateAttachmentsToVehicle(plate, v.id);
          merged++;
        } else {
          append(`· ${plate} — 자산 미등록 (그대로 유지)`);
          unmatched++;
        }
      }
      append('');
      append(`═══ 완료: ${merged}건 이관 / ${unmatched}건 미매칭 ═══`);
      toast.success(`${merged}건 이관 완료${unmatched > 0 ? ` (${unmatched}건 미매칭)` : ''}`);
    } catch (e) {
      append(`✗ 실패: ${friendlyError(e)}`);
      toast.error(friendlyError(e));
    } finally {
      setRunning(false);
    }
  }

  /**
   * 계약자 있는데 인도일 없는 contracts — 일괄 인도완료 처리.
   * 사용자 정책: '계약자 있는 차들은 다 인도완료됐다고 봐야하는데 업로드하면서 정보가 안 갔나봐'
   *
   * 처리:
   *  · customerName 있고 deliveredDate 비어있는 활성 계약 검출
   *  · deliveredDate = contractDate, status='운행', vehicleStatus='운행' 일괄 update
   */
  async function backfillDeliveredDate() {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    if (!window.confirm('계약자가 있는데 인도일이 비어있는 계약을 일괄 인도완료(deliveredDate=contractDate, status/vehicleStatus=운행) 처리합니다.\n\n진행할까요?')) return;
    setRunning(true);
    setLog([]);
    try {
      await ensureAuth();
      const db = getRtdb();
      if (!db) throw new Error('Firebase 미설정');

      append('═══ 인도일 없는 계약 일괄 인도완료 ═══');
      const cSnap = await get(ref(db, dbPath('contracts')));
      const contracts = (cSnap.val() ?? {}) as Record<string, Contract>;
      const candidates = Object.values(contracts).filter((c) => {
        if (!c.customerName?.trim()) return false;
        if (c.deliveredDate) return false;
        // 반납/해지/매각 등은 제외 — 이미 종료 상태
        if (c.status === '반납' || c.status === '해지') return false;
        if (c.vehicleStatus === '매각' || c.vehicleStatus === '매각대기' || c.vehicleStatus === '매각검토') return false;
        return true;
      });
      append(`대상: ${candidates.length}건`);

      const batch: Record<string, Partial<Contract>> = {};
      let count = 0;
      for (const c of candidates) {
        const deliveredDate = c.contractDate || new Date().toISOString().slice(0, 10);
        batch[`${c.id}/deliveredDate`] = deliveredDate as unknown as Partial<Contract>;
        batch[`${c.id}/status`] = '운행' as unknown as Partial<Contract>;
        batch[`${c.id}/vehicleStatus`] = '운행' as unknown as Partial<Contract>;
        append(`✓ ${c.vehiclePlate ?? '?'} | ${c.customerName} | 인도일 → ${deliveredDate}`);
        count++;
      }

      if (Object.keys(batch).length === 0) {
        append('처리할 대상 없음');
        toast.info('대상 없음');
      } else {
        await rtdbUpdate(ref(db, dbPath('contracts')), batch as unknown as Record<string, unknown>);
        append('');
        append(`═══ ${count}건 인도완료 처리 ═══`);
        toast.success(`${count}건 인도완료 처리`);
      }
    } catch (e) {
      append(`✗ 실패: ${friendlyError(e)}`);
      toast.error(friendlyError(e));
    } finally {
      setRunning(false);
    }
  }

  /** 강제 wipe — root 통째로 삭제 (companies/audit_logs 포함 모든 것) */
  async function nukeEverything() {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    if (!window.confirm(`핵 wipe — ${RTDB_ROOT} root 노드 전체 삭제\n\ncompanies/audit_logs 포함 모든 데이터 사라집니다.\n진행할까요?`)) return;
    // Type-to-confirm — 머슬 메모리 'Enter Enter' 사고 방지
    const typed = window.prompt(`마지막 확인 — 아래 문자열을 그대로 입력하세요:\n\n  ${RTDB_ROOT}\n\n(빈 입력·다른 문자 = 취소)`, '');
    if (typed !== RTDB_ROOT) {
      toast.info(typed == null ? '취소됨' : `입력 불일치 — 취소됨 (입력: "${typed}")`);
      return;
    }
    setRunning(true);
    setLog([]);
    try {
      await ensureAuth();
      const db = getRtdb();
      if (!db) throw new Error('Firebase 미설정');
      append(`${RTDB_ROOT} root 삭제 중...`);
      await rtdbRemove(ref(db, RTDB_ROOT));
      append(`✓ ${RTDB_ROOT} root 통째로 삭제 완료`);
      toast.success(`${RTDB_ROOT} 전체 삭제 완료`);
    } catch (e) {
      append(`✗ 실패: ${friendlyError(e)}`);
      toast.error(friendlyError(e));
    } finally {
      setRunning(false);
    }
  }

  /** 초강력 위험: 모든 contract + vehicle 일괄 삭제 + 검증 */
  async function wipeAllContracts() {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    setRunning(true);
    setLog([]);
    try {
      await ensureAuth();
      const db = getRtdb();
      if (!db) throw new Error('Firebase 미설정');

      // ── 1) 삭제 전 진단: root 전체 상태 ──
      append('═══ 삭제 전 진단 ═══');
      const rootSnap = await get(ref(db, RTDB_ROOT));
      const root = rootSnap.val() ?? {};
      append(`${RTDB_ROOT} root 자식 노드:`);
      for (const [key, val] of Object.entries(root)) {
        const count = val && typeof val === 'object' ? Object.keys(val).length : 0;
        append(`  · ${key}: ${count}건`);
      }

      const cSnap = await get(ref(db, dbPath('contracts')));
      const vSnap = await get(ref(db, dbPath('vehicles')));
      const cAll = Object.values(cSnap.val() ?? {}) as Array<{ vehiclePlate?: string; customerName?: string; company?: string }>;
      const vAll = Object.values(vSnap.val() ?? {}) as Array<{ plate?: string; company?: string; status?: string; notes?: string }>;
      append(`contracts: ${cAll.length}건 / vehicles: ${vAll.length}대`);

      // vehicles 상세 (24건 정체 확인)
      append('vehicles 샘플 (앞 30대):');
      for (const v of vAll.slice(0, 30)) {
        append(`  · ${v.plate} | ${v.company} | ${v.status} | ${v.notes ?? ''}`);
      }

      if (cAll.length === 0 && vAll.length === 0) {
        append('이미 비어있음. 그런데 화면에 24건이 보인다면:');
        append('  1) 브라우저 강제 새로고침 (Ctrl+Shift+R)');
        append('  2) Firebase 프로젝트가 다른 곳을 가리킬 수 있음 — .env 확인');
        toast.warning('삭제할 데이터 없음');
        return;
      }

      if (!window.confirm(`⚠️ contracts ${cAll.length}건 + vehicles ${vAll.length}대 영구 삭제. 진행?`)) return;
      // Type-to-confirm — 머슬 메모리 'Enter Enter' 사고 방지
      const phrase = 'WIPE';
      const typed = window.prompt(`마지막 확인 — 아래 단어를 그대로 입력하세요:\n\n  ${phrase}\n\n(빈 입력·다른 문자 = 취소)`, '');
      if (typed !== phrase) {
        append(`✗ 취소됨 (입력: "${typed ?? ''}")`);
        toast.info(typed == null ? '취소됨' : `입력 불일치 — 취소됨`);
        return;
      }

      // ── 2) 삭제 ──
      append('═══ 삭제 실행 ═══');
      append('contracts 노드 삭제 중...');
      try {
        await rtdbRemove(ref(db, dbPath('contracts')));
        append(`✓ contracts 삭제 성공`);
      } catch (e) {
        append(`✗ contracts 삭제 실패: ${friendlyError(e)}`);
      }

      append('vehicles 노드 삭제 중...');
      try {
        await rtdbRemove(ref(db, dbPath('vehicles')));
        append(`✓ vehicles 삭제 성공`);
      } catch (e) {
        append(`✗ vehicles 삭제 실패: ${friendlyError(e)}`);
        append(`  → Rules가 막을 가능성. Firebase Console에서 직접 삭제 필요`);
      }

      // ── 3) 삭제 후 검증 ──
      append('═══ 삭제 후 재조회 (실제 지워졌는지 검증) ═══');
      const cSnap2 = await get(ref(db, dbPath('contracts')));
      const vSnap2 = await get(ref(db, dbPath('vehicles')));
      const cAfter = Object.keys(cSnap2.val() ?? {}).length;
      const vAfter = Object.keys(vSnap2.val() ?? {}).length;
      append(`삭제 후 — contracts: ${cAfter}건 / vehicles: ${vAfter}대`);

      if (cAfter === 0 && vAfter === 0) {
        append(`🎉 DB 완전 삭제 확인. 화면에 아직 보이면 Ctrl+Shift+R로 강제새로고침`);
        toast.success(`DB wipe 성공 — 화면 새로고침 필요`);
      } else {
        append(`⚠️ DB에 아직 데이터 남음 — Rules 또는 권한 문제 의심`);
        append(`해결: Firebase Console → Realtime Database → ${RTDB_ROOT} 노드 직접 삭제`);
        toast.error(`삭제 완료 메시지 떴지만 실제 ${cAfter + vAfter}건 남음 — Rules 문제`);
      }
    } catch (e) {
      append(`✗ 전체 실패: ${friendlyError(e)}`);
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
      `· 회사명 잘못된 경우 시드값으로 자동 보정\n` +
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
      const snap = await get(ref(db, dbPath('contracts')));
      const existing: Record<string, Contract> = snap.val() ?? {};
      let existingContracts = Object.values(existing);
      append(`현재 DB: 계약 ${existingContracts.length}건`);

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
          const newRef = push(ref(db, dbPath('contracts')));
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
        await rtdbUpdate(ref(db, dbPath('contracts')), updateOnly);
      }
      for (const id of removeIds) {
        await rtdbRemove(ref(db, `${dbPath('contracts')}/${id}`));
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
          <div className="topbar-title">
            <Database size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>DB 진단·정리</span>
          </div>
        </header>

        <div style={{ padding: 24, maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <header className="page-header">
            <div className="page-header-title-group">
              <h1 className="page-header-title">
                <Database size={18} weight="duotone" />
                DB 진단·정리
              </h1>
              <div className="page-header-title-sub">
                Firebase RTDB 노드 진단 · 전체 wipe · 중복 자동 정리
              </div>
            </div>
          </header>

          {!superAdmin && (
            <div className="notice notice--error">
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
                onClick={wipeAllContracts}
                style={{ height: 40, fontSize: 13, background: '#7F1D1D', color: '#fff' }}
              >
                <Warning weight="bold" size={14} /> 전체 계약 + 차량 wipe (clean slate)
              </button>
              <button
                className="btn"
                type="button"
                disabled={running || !superAdmin}
                onClick={diagnose}
                style={{ height: 36, fontSize: 12 }}
              >
                <MagnifyingGlass weight="bold" size={14} /> 진단 — 현재 노드 상태 확인 (어디 데이터 있는지)
              </button>
              <button
                className="btn"
                type="button"
                disabled={running || !superAdmin}
                onClick={diagnoseOperational}
                style={{ height: 36, fontSize: 12 }}
              >
                <ListChecks weight="bold" size={14} /> 운영 데이터 품질 진단 (등록번호·보험연령·결제일·사진 결손)
              </button>
              <button
                className="btn"
                type="button"
                disabled={running || !superAdmin}
                onClick={migratePlatePhotos}
                style={{ height: 36, fontSize: 12 }}
              >
                <Image weight="bold" size={14} /> 사진 plate-키 → 자체코드 일괄 이관
              </button>
              <button
                className="btn"
                type="button"
                disabled={running || !superAdmin}
                onClick={backfillDeliveredDate}
                style={{ height: 36, fontSize: 12 }}
              >
                <Truck weight="bold" size={14} /> 인도일 없는 계약 일괄 인도완료 (계약자 있는 거)
              </button>
              <button
                className="btn btn-danger"
                type="button"
                disabled={running || !superAdmin}
                onClick={nukeEverything}
                style={{ height: 36, fontSize: 12, background: '#450A0A', color: '#fff' }}
              >
                <Skull weight="bold" size={14} /> 핵 wipe — DB root 통째로 삭제 (최후의 수단)
              </button>
              <div style={{ fontSize: 11, color: 'var(--text-weak)', lineHeight: 1.6 }}>
                ✓ (차량+고객) 기준 중복 발견 시 실 입금 많은 쪽 keeper → 나머지 삭제 + 입금 이전<br />
                ✓ 회사명 잘못된 것 → 시드값으로 자동 보정<br />
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
                  padding: 10, borderRadius: 'var(--radius)', maxHeight: 400, overflow: 'auto',
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
