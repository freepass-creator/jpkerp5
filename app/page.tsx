'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MagnifyingGlass, ArrowsClockwise, Truck, ArrowUDownLeft, Warning, X, Plus, PaperPlaneTilt, DownloadSimple, Car, Upload } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import {
  todayKr,
  buildDeliveries,
  buildReturns,
} from '@/lib/mock-data';
import { formatCurrency, formatDate, daysSince, shortDate, dateWithDow, formatRemainingHuman } from '@/lib/utils';
import type { Contract } from '@/lib/types';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { displayCompanyName } from '@/lib/company-display';
import { downloadContractsExcel } from '@/lib/contract-export';
import { ContractDetailDialog } from '@/components/contract-detail-dialog';
import { PageShell } from '@/components/ui/page-shell';
import { CreateDialog } from '@/components/create-dialog';
import { ExtendPopover } from '@/components/extend-popover';
import { SmsDialog } from '@/components/sms-dialog';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { useAuth } from '@/lib/use-auth';
import { isSuperAdmin } from '@/lib/admin-emails';
import { ageFromIdent } from '@/lib/ident';
import { StatusBadge } from '@/components/ui/status-badge';
import { vehicleStateTone, contractStateTone, paymentStateTone } from '@/lib/status-tones';
import {
  getExpiryDate, daysToExpiry,
  getVehicleState, getContractState, getPaymentState,
  type VehicleState, type ContractState, type PaymentState,
} from '@/lib/contract-stage';

type View = '전체' | '계약중' | '만기경과' | '만기임박' | '연장대기' | '종료대기' | '휴차' | '미수';
/** 항상 표시되는 기본 필터 */
const BASE_VIEWS: View[] = ['전체', '계약중', '휴차', '미수'];
/** 데이터 있을 때만 표시되는 조건부 필터 */
const CONDITIONAL_VIEWS: View[] = ['만기경과', '만기임박', '연장대기', '종료대기'];

/** 계약중 = 아직 반납·해지 안된 진행 계약 (운행·대기·휴차·채권 포함) */
function isActiveContract(c: Contract): boolean {
  if (c.returnedDate) return false;
  return c.status !== '반납' && c.status !== '해지';
}

/**
 * 계약중(고객 있음) — 인도일 / 손님이름 / 운행 vehicleStatus 중 하나라도 있으면 계약중.
 * 스냅샷 업로드 후 인도일이 비어있어도 손님이 있으면 계약중으로 인식.
 */
function isRunning(c: Contract): boolean {
  if (c.returnedDate) return false;
  if (c.status === '해지' || c.status === '반납') return false;
  // 손님이 있고 휴차/매각 상태가 아니면 계약중
  const isIdleStatus = c.vehicleStatus === '휴차'
    || c.vehicleStatus === '휴차대기'
    || c.vehicleStatus === '매각'
    || c.vehicleStatus === '매각대기'
    || c.vehicleStatus === '반납'
    || c.vehicleStatus === '구매대기'
    || c.vehicleStatus === '등록대기'
    || c.vehicleStatus === '상품화중'
    || c.vehicleStatus === '상품화대기'
    || c.vehicleStatus === '상품대기'
    || c.vehicleStatus === '인도대기'
    || c.vehicleStatus === '출고대기';
  if (isIdleStatus) return false;
  // 손님 있거나 인도일 있거나 운행/연장대기/종료대기 상태면 계약중
  return !!c.customerName?.trim()
    || !!c.deliveredDate
    || c.vehicleStatus === '운행'
    || c.vehicleStatus === '연장대기'
    || c.vehicleStatus === '종료대기';
}

/** 종료된 계약 — 반납/해지/채권 상태이거나 returnedDate 있는 경우 (리스크관리로 이관) */
function isClosed(c: Contract): boolean {
  return c.status === '반납' || c.status === '해지' || c.status === '채권' || !!c.returnedDate;
}

function matchesView(c: Contract, v: View): boolean {
  // 종료된 계약은 운영현황에서 제외 (리스크관리 → 종료 탭에서 확인)
  if (isClosed(c)) return false;
  if (v === '전체') return true;
  // '계약중' = 반납/해지 안 된 모든 계약 (휴차·상품화·매각 포함).
  // vehicleStatus 변경해도 운영현황에서 사라지지 않음 (직원 피드백 6,7 반영).
  if (v === '계약중') return isActiveContract(c);
  if (v === '만기경과') return getContractState(c).name === '만기경과';
  if (v === '만기임박') return getContractState(c).name === '만기임박';
  if (v === '연장대기') return c.vehicleStatus === '연장대기';
  if (v === '종료대기') return c.vehicleStatus === '종료대기';
  if (v === '휴차') return !isRunning(c);
  if (v === '미수') return c.unpaidAmount > 0;
  return true;
}

function matchesCompany(c: Contract, co: string): boolean {
  return co === '전체' || c.company === co;
}

/** 컬럼 정렬 키 — 수동 정렬 시 클릭한 컬럼명 */
type SortCol = '회사' | '차량상태' | '차량번호' | '차종' | '사용처' | '연락처' | '운전자나이' | '보험연령' | '계약상태' | '시작일' | '종료일' | '결제일' | '회차' | '반납까지' | '수납상태' | '미수금';
type SortDir = 'asc' | 'desc';

const VS_ORDER: VehicleState[] = [
  '구매대기', '등록대기', '상품화중', '인도대기',
  '운행중',
  '휴차대기', '휴차', '매각검토', '매각대기', '매각완료', '반납',
];
const CS_ORDER: ContractState[] = ['위반', '미수검', '연장대기', '종료대기', '만기경과', '만기임박', '계약중'];
const PS_ORDER: PaymentState[] = ['미납', '정상', '휴차', '종결'];

/**
 * 주운전자 만연령 — driverIdentNo 우선, 없으면 계약자 주민번호(개인 계약일 때).
 * 등록번호가 잘못됐거나 법인 계약이면 undefined.
 */
function driverAge(c: Contract): number | undefined {
  if (c.driverIdentNo) return ageFromIdent(c.driverIdentNo, '개인');
  if (c.customerKind === '개인' || (!c.customerKind && (c.customerIdentNo ?? '').replace(/\D/g, '').length === 13)) {
    return ageFromIdent(c.customerIdentNo, '개인');
  }
  return undefined;
}

function compareForCol(a: Contract, b: Contract, col: SortCol): number {
  switch (col) {
    case '회사': return a.company.localeCompare(b.company);
    case '차량상태': return VS_ORDER.indexOf(getVehicleState(a).name) - VS_ORDER.indexOf(getVehicleState(b).name);
    case '차량번호': return a.vehiclePlate.localeCompare(b.vehiclePlate);
    case '차종': return a.vehicleModel.localeCompare(b.vehicleModel);
    case '사용처': return resolveUsage(a).localeCompare(resolveUsage(b));
    case '연락처': return a.customerPhone1.localeCompare(b.customerPhone1);
    case '운전자나이': return (driverAge(a) ?? 0) - (driverAge(b) ?? 0);
    case '보험연령': return (a.insuranceAge ?? 0) - (b.insuranceAge ?? 0);
    case '계약상태': return CS_ORDER.indexOf(getContractState(a).name) - CS_ORDER.indexOf(getContractState(b).name);
    case '시작일': return (resolveStartDate(a) ?? '').localeCompare(resolveStartDate(b) ?? '');
    case '종료일': {
      const aD = resolveEndDate(a) ?? '9999-12-31';
      const bD = resolveEndDate(b) ?? '9999-12-31';
      return aD.localeCompare(bD);
    }
    case '결제일': return (a.paymentDay ?? 0) - (b.paymentDay ?? 0);
    case '회차': return (a.currentSeq ?? 0) - (b.currentSeq ?? 0);
    case '반납까지': {
      const aD = getExpiryDate(a) ?? '9999-12-31';
      const bD = getExpiryDate(b) ?? '9999-12-31';
      return aD.localeCompare(bD);
    }
    case '수납상태': {
      const pa = getPaymentState(a);
      const pb = getPaymentState(b);
      const oa = PS_ORDER.indexOf(pa.name);
      const ob = PS_ORDER.indexOf(pb.name);
      if (oa !== ob) return oa - ob;
      return pb.days - pa.days; // 같은 상태면 일수 큰 순
    }
    case '미수금': return a.unpaidAmount - b.unpaidAmount;
    default: return 0;
  }
}

/** 퀵필터별 기본 정렬 — 가장 시급한/관련성 높은 행이 위로 */
function sortComparator(view: View): (a: Contract, b: Contract) => number {
  // 미수: 연체 일수 많은 순 (오래된 미수 먼저)
  if (view === '미수') {
    return (a, b) => getPaymentState(b).days - getPaymentState(a).days;
  }
  // 휴차: 휴차 일수 많은 순 (오래된 휴차 먼저)
  if (view === '휴차') {
    return (a, b) => getVehicleState(b).days - getVehicleState(a).days;
  }
  // 만기경과: 가장 오래 경과된 순 (returnScheduledDate 오래된 것 먼저, asc)
  // 만기임박/계약중/연장대기/종료대기: 반납 임박 순 (D-day 작은 순)
  if (view === '계약중' || view === '만기임박' || view === '만기경과' || view === '연장대기' || view === '종료대기') {
    return (a, b) => {
      const aD = getExpiryDate(a) || '9999-12-31';
      const bD = getExpiryDate(b) || '9999-12-31';
      return aD.localeCompare(bD);
    };
  }
  // 전체: 액션 필요한 것 위로, 정상 운영 중은 맨 아래.
  //   1. 만기 경과 (운행 중 만기 지난 것) — 즉시 액션
  //   2. 만기 임박 D-30 (운행)
  //   3. 휴차 라이프사이클 (휴차대기/휴차/매각검토 — 오래된 순)
  //   4. 만기 임박 D-90 (연장대기/종료대기)
  //   5. 매각 진행 (매각대기)
  //   6. 정비/사고 — 일시 중단
  //   7. 입고 라이프사이클 (구매대기/등록대기/상품화)
  //   8. 매각 완료 — terminal
  //   9. 반납/해지 — 종결
  //  10. 계약중 (일반 운행, 만기 멀음) — 정상, 맨 아래
  return (a, b) => {
    const priority = (c: Contract): number => {
      const s = c.vehicleStatus;
      // 운행 — D-day 따라 분기 (경과/임박이 가장 위, 일반은 맨 아래)
      if (s === '운행' || s === '연장대기' || s === '종료대기') {
        const exp = getExpiryDate(c);
        if (exp) {
          const dLeft = Math.round((new Date(exp).getTime() - new Date(todayKr()).getTime()) / 86400000);
          if (dLeft < 0) return 10;     // 만기 경과 (운행 중) — 최우선
          if (dLeft <= 30) return 20;    // D-30
          if (dLeft <= 90) return 40;    // D-90 (연장/종료대기 포함)
          return 99;                      // 일반 운행 — 맨 아래
        }
        return 99;
      }
      // 휴차/매각검토 — 결정 필요
      if (s === '휴차대기') return 31;
      if (s === '휴차') return 32;
      if (s === '매각검토') return 33;
      // 매각 진행
      if (s === '매각대기') return 50;
      // 일시 중단
      if (s === '정비' || s === '사고') return 60;
      // 입고 라이프사이클
      if (s === '구매대기') return 71;
      if (s === '등록대기') return 72;
      if (s === '상품화대기' || s === '상품화중') return 73;
      if (s === '상품대기') return 74;
      // 종결
      if (s === '매각') return 90;
      if (c.status === '반납') return 91;
      if (c.status === '해지') return 92;
      return 95;
    };
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    // 같은 그룹 내 세부 정렬:
    // 만기 관련 운행 그룹 (10/20/40) — 만기일 가까운 순
    if (pa === 10 || pa === 20 || pa === 40) {
      const aD = getExpiryDate(a) || '9999-12-31';
      const bD = getExpiryDate(b) || '9999-12-31';
      return aD.localeCompare(bD);
    }
    // 휴차 그룹 — idleSince 오래된 순 (asc)
    if (pa === 31 || pa === 32 || pa === 33) return (a.idleSince ?? '').localeCompare(b.idleSince ?? '');
    // 매각/종결 — 최근 변경 순
    if (pa >= 50 && pa <= 92) return (b.returnedDate ?? b.idleSince ?? '').localeCompare(a.returnedDate ?? a.idleSince ?? '');
    // 일반 운행 (99) + 그 외 — 최근 계약 순
    return b.contractDate.localeCompare(a.contractDate);
  };
}

function sortLabel(view: View): string {
  switch (view) {
    case '미수': return '연체 오래된 순';
    case '휴차': return '휴차 오래된 순';
    case '계약중': return '반납 임박 순';
    case '만기임박': return '만기 임박 순';
    case '만기경과': return '만기 오래된 순';
    case '연장대기': return '만기 임박 순';
    case '종료대기': return '종료 임박 순';
    default: return '라이프사이클 순';
  }
}

// VehicleState / ContractState / PaymentState / getVehicleState / getContractState / getPaymentState
// → lib/contract-stage.ts 로 이관 (운영현황·상세 다이얼로그에서 공용)

// getExpiryDate / daysToExpiry / getVehicleState / getContractState → lib/contract-stage.ts

/**
 * 시작일 — vehicleStatus 별로 의미가 달라짐
 *   · 휴차/휴차대기/매각검토 → idleSince (휴차 진입일)
 *   · 상품화 단계(상품화대기/상품화중/상품대기) → readiedDate or registeredDate (상품화 시작일)
 *   · 그 외 (운행/연장대기/종료대기/만기임박/반납/해지) → contractDate (계약일)
 */
function resolveStartDate(c: Contract): string | undefined {
  const s = c.vehicleStatus;
  if (s === '휴차' || s === '휴차대기' || s === '매각검토') return c.idleSince ?? c.contractDate;
  if (s === '상품화대기' || s === '상품화중' || s === '상품대기') {
    return c.readiedDate ?? c.registeredDate ?? c.purchasedDate ?? c.contractDate;
  }
  return c.deliveredDate ?? c.contractDate;
}

/** 종료일 — 휴차는 idleUntil, 그 외는 returnScheduledDate */
function resolveEndDate(c: Contract): string | undefined {
  const s = c.vehicleStatus;
  if (s === '휴차' || s === '휴차대기' || s === '매각검토') return c.idleUntil;
  return c.returnScheduledDate;
}

/**
 * 사용처 — 차량이 지금 어디서/누구한테 쓰이고 있나
 *   · 운행 → 계약자명 (고객)
 *   · 휴차/매각/매각검토/휴차대기 → idleLocation (보관처/정비소 등)
 *   · 그 외 (구매대기/등록대기/상품화중/...) → 회사명 (운영 단계)
 */
function resolveUsage(c: Contract): string {
  const s = c.vehicleStatus;
  if (s === '휴차' || s === '휴차대기' || s === '매각검토' || s === '매각대기' || s === '매각') {
    return c.idleLocation?.trim() || '';
  }
  return c.customerName?.trim() || '';
}

// PaymentState / getPaymentState → lib/contract-stage.ts

export default function Page() {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>('전체');
  const [companyFilter, setCompanyFilter] = useState<string>('전체');
  const [manualSort, setManualSort] = useState<{ col: SortCol; dir: SortDir } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<'차량' | '계약' | '입출금' | '현황'>('계약');
  const [smsOpen, setSmsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number; row: Contract | null }>({
    open: false, x: 0, y: 0, row: null,
  });

  // Firebase RTDB 실시간 구독 — /jpkerp5/contracts
  const { contracts: rawContracts, loading: contractsLoading, update: rtdbUpdate, updateMany: rtdbUpdateMany, remove: rtdbRemove } = useContracts();
  const { vehicles, update: updateVehicleMaster } = useVehicles();

  /**
   * 운영현황 통합 view — 계약 + 휴차차량(계약 없는 차량 = 휴차중).
   * 사용자 명시: "계약탭에 계약정보가 없는건 휴차중이라고 보면됨"
   *
   * 차량 테이블에 존재 = 이미 구매됨. 따라서 '구매대기'/'운행'은 부적절.
   * 적절한 후보: 등록대기/상품화중/상품대기/휴차대기/매각대기 등. 그 외는 휴차대기로 통일.
   */
  const contracts = useMemo<Contract[]>(() => {
    const contractedPlates = new Set(rawContracts.map((c) => c.vehiclePlate?.trim()).filter(Boolean));
    // 차량 테이블에 있으면 = 구매 완료. 구매대기/운행 은 의미상 어색하므로 휴차대기로 정규화.
    const isIdleAppropriate = (s: string): boolean =>
      ['등록대기', '상품화대기', '상품화중', '상품대기', '인도대기', '출고대기', '휴차대기', '휴차', '매각대기', '정비', '사고', '반납'].includes(s);
    const orphans = vehicles
      .filter((v) => v.plate && !contractedPlates.has(v.plate.trim()))
      .map<Contract>((v) => ({
        id: `vehicle-orphan-${v.id}`,
        contractNo: '',
        company: v.company,
        customerName: '',
        customerPhone1: '',
        vehiclePlate: v.plate,
        vehicleModel: v.model,
        vehicleStatus: isIdleAppropriate(v.status) ? v.status : '휴차대기',
        contractDate: v.purchasedDate ?? v.createdAt?.slice(0, 10) ?? '',
        termMonths: 0,
        longTerm: false,
        monthlyRent: 0,
        deposit: 0,
        paymentDay: 1,
        paymentMethod: '이체',
        status: '대기',
        currentSeq: 0,
        totalSeq: 0,
        unpaidAmount: 0,
        unpaidSeqCount: 0,
        notes: v.notes,
      }));
    return [...rawContracts, ...orphans];
  }, [rawContracts, vehicles]);
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user?.email);
  const { companies: companyMaster } = useCompanies();

  // selectedId를 기준으로 fresh contract 참조 (업데이트 시 자동 반영)
  const selected = useMemo(
    () => contracts.find((c) => c.id === selectedId) ?? null,
    [contracts, selectedId]
  );

  const updateContract = useCallback((updated: Contract) => {
    void rtdbUpdate(updated);
    // 차량 마스터의 status 도 동기화 — Contract.vehicleStatus ↔ Vehicle.status 일치
    // (자산관리/운영현황/리스크 어디서 보든 같은 상태로 표시되게)
    if (updated.vehiclePlate && updated.vehicleStatus) {
      const v = vehicles.find((x) => (x.plate ?? '').trim() === updated.vehiclePlate.trim());
      if (v && v.status !== updated.vehicleStatus) {
        void updateVehicleMaster({ ...v, status: updated.vehicleStatus });
      }
    }
  }, [rtdbUpdate, vehicles, updateVehicleMaster]);

  // 우클릭 컨텍스트 메뉴 액션 — 빠른 인도/반납/연락/SMS/삭제
  function ctxAction_openDetail(c: Contract) {
    setSelectedId(c.id);
    setDetailOpen(true);
  }
  function ctxAction_markDelivered(c: Contract) {
    if (c.deliveredDate) {
      alert(`${c.vehiclePlate} 는 이미 인도 완료 (${c.deliveredDate})`);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    void rtdbUpdate({ ...c, deliveredDate: today, status: '운행', vehicleStatus: '운행' });
  }
  function ctxAction_markReturned(c: Contract) {
    if (c.returnedDate) {
      alert(`${c.vehiclePlate} 는 이미 반납 완료 (${c.returnedDate})`);
      return;
    }
    if (!confirm(`${c.vehiclePlate} ${c.customerName} 을 오늘 반납 처리하시겠습니까?`)) return;
    const today = new Date().toISOString().slice(0, 10);
    void rtdbUpdate({ ...c, returnedDate: today, status: '반납', vehicleStatus: '반납' });
  }
  function ctxAction_sendSms(c: Contract) {
    setSelectedIds(new Set([c.id]));
    setSmsOpen(true);
  }
  function ctxAction_delete(c: Contract) {
    if (!confirm(`정말 ${c.contractNo} ${c.vehiclePlate} ${c.customerName} 계약을 삭제하시겠습니까?\n(돌이킬 수 없음)`)) return;
    void rtdbRemove(c.id);
  }

  // 선택된 계약 일괄 삭제 — SUPER_ADMIN 만
  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    const list = Array.from(selectedIds).map((id) => contracts.find((c) => c.id === id)).filter(Boolean) as Contract[];
    if (list.length === 0) return;
    const preview = list.slice(0, 5).map((c) => `· ${c.vehiclePlate} ${c.customerName}`).join('\n');
    const more = list.length > 5 ? `\n... 외 ${list.length - 5}건` : '';
    if (!confirm(`정말 ${list.length}건 계약을 삭제하시겠습니까?\n\n${preview}${more}\n\n(돌이킬 수 없음)`)) return;
    if (!confirm(`한 번 더 확인 — 진짜 삭제할까요? (${list.length}건)`)) return;
    for (const c of list) {
      await rtdbRemove(c.id);
    }
    setSelectedIds(new Set());
    alert(`${list.length}건 삭제 완료`);
  }

  // 선택된 계약 일괄 인도완료 (계약시작일=인도일) — SUPER_ADMIN 만
  async function handleBulkMarkDelivered() {
    if (selectedIds.size === 0) return;
    const list = Array.from(selectedIds).map((id) => contracts.find((c) => c.id === id)).filter(Boolean) as Contract[];
    const targets = list.filter((c) => !c.deliveredDate);
    if (targets.length === 0) {
      alert('선택 항목 모두 이미 인도 완료됨');
      return;
    }
    if (!confirm(`${targets.length}건을 일괄 인도완료 처리하시겠습니까?\n(deliveredDate = 계약시작일, status = '운행')`)) return;
    const updated = targets.map((c) => ({
      ...c,
      deliveredDate: c.contractDate,
      status: '운행' as const,
      vehicleStatus: '운행' as const,
    }));
    await rtdbUpdateMany(updated);
    alert(`${targets.length}건 일괄 인도완료 처리`);
  }

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // 퀵필터 변경 시 수동 정렬·선택 초기화 (필터 의도된 자동 정렬 우선)
  useEffect(() => { setManualSort(null); setSelectedIds(new Set()); }, [view]);

  function toggleSort(col: SortCol) {
    setManualSort((prev) => {
      if (!prev || prev.col !== col) return { col, dir: 'asc' };
      if (prev.dir === 'asc') return { col, dir: 'desc' };
      return null;  // 3번째 클릭 → 해제
    });
  }

  /**
   * 회사 필터 칩 목록.
   *  - 회사 마스터(companyMaster) 우선 — 등록된 모든 법인이 칩으로 노출 (계약 0건이라도)
   *  - 마스터에 없는 raw 회사명도 fallback 으로 합쳐서 누락 방지
   *  - 표시는 displayCompanyName 으로 접미사 제거
   */
  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const m of companyMaster) if (m?.name) set.add(m.name);
    for (const c of contracts) if (c.company) set.add(c.company);
    return ['전체', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))];
  }, [contracts, companyMaster]);

  /** 회사 필터만 적용된 모집단 — 사이드패널/요약의 기준 */
  const scopedContracts = useMemo(() => {
    return contracts.filter((c) => matchesCompany(c, companyFilter));
  }, [contracts, companyFilter]);

  /** 상태 칩 카운트 — 회사 필터를 적용한 상태에서 각 view 별 수 (양방향 연동) */
  const viewCounts = useMemo<Record<View, number>>(() => {
    const scoped = contracts.filter((c) => matchesCompany(c, companyFilter));
    return {
      전체: scoped.length,
      계약중: scoped.filter((c) => matchesView(c, '계약중')).length,
      만기경과: scoped.filter((c) => matchesView(c, '만기경과')).length,
      만기임박: scoped.filter((c) => matchesView(c, '만기임박')).length,
      연장대기: scoped.filter((c) => matchesView(c, '연장대기')).length,
      종료대기: scoped.filter((c) => matchesView(c, '종료대기')).length,
      휴차: scoped.filter((c) => matchesView(c, '휴차')).length,
      미수: scoped.filter((c) => matchesView(c, '미수')).length,
    };
  }, [contracts, companyFilter]);

  /** 화면에 표시할 view 칩 목록 — 데이터 있는 conditional view만 포함 */
  const visibleViews = useMemo<View[]>(() => {
    const out: View[] = ['전체', '계약중'];
    for (const v of CONDITIONAL_VIEWS) {
      if (viewCounts[v] > 0) out.push(v);
    }
    out.push('휴차', '미수');
    return out;
  }, [viewCounts]);

  /** 회사 칩 카운트 — 상태 필터를 적용한 상태에서 각 회사별 수 (양방향 연동) */
  const companyCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const co of companies) {
      m[co] = contracts.filter((c) => matchesView(c, view) && matchesCompany(c, co)).length;
    }
    return m;
  }, [contracts, companies, view]);

  const filteredContracts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const arr = contracts.filter((c) => {
      if (!matchesCompany(c, companyFilter)) return false;
      // 검색어 있을 때 view 필터 우회 — 직원이 휴차/반납 계약자도 한 번에 찾을 수 있게.
      // (view 기본 '계약중' 이라 '정도하' 같은 계약자가 휴차/반납이면 안 보이던 버그 수정)
      if (!q && !matchesView(c, view)) return false;
      if (q) {
        const hay = `${c.customerName} ${c.vehiclePlate} ${c.vehicleModel} ${c.manager} ${c.customerPhone1}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // 수동 정렬 우선, 없으면 퀵필터별 자동 정렬
    if (manualSort) {
      const sign = manualSort.dir === 'asc' ? 1 : -1;
      return [...arr].sort((a, b) => sign * compareForCol(a, b, manualSort.col));
    }
    return [...arr].sort(sortComparator(view));
  }, [contracts, search, view, companyFilter, manualSort]);

  const summary = useMemo(() => {
    const totalUnpaid = scopedContracts.reduce((s, c) => s + c.unpaidAmount, 0);
    const unpaidCount = scopedContracts.filter((c) => c.unpaidAmount > 0).length;
    return { totalUnpaid, unpaidCount };
  }, [scopedContracts]);

  const deliveries = useMemo(() => buildDeliveries(scopedContracts, todayKr()), [scopedContracts]);
  const returns = useMemo(() => buildReturns(scopedContracts, todayKr(), 30), [scopedContracts]);

  function handleRowDoubleClick(c: Contract) {
    setSelectedId(c.id);
    setDetailOpen(true);
  }

  function handleExtend(contractId: string, months: number) {
    const c = contracts.find((x) => x.id === contractId);
    if (!c) return;
    const base = c.returnScheduledDate ? new Date(c.returnScheduledDate) : new Date(todayKr());
    base.setMonth(base.getMonth() + months);
    void rtdbUpdate({
      ...c,
      returnScheduledDate: base.toISOString().slice(0, 10),
      termMonths: c.termMonths + months,
      totalSeq: c.totalSeq + months,
      notes: `${c.notes ?? ''}${c.notes ? ' / ' : ''}${todayKr()} ${months}개월 연장`.trim(),
    });
  }

  return (
    <PageShell
      title="운영 현황"
      icon={<Car size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      topbarSearch={{ placeholder: '고객 / 차량 / 차종 / 담당', value: search, onChange: setSearch }}
      topbarFilter={
        <>
          {visibleViews.map((v) => {
            const count = viewCounts[v];
            const tone = v === '미수' ? 'red'
              : v === '만기경과' ? 'red'
              : v === '만기임박' ? 'amber'
              : v === '연장대기' ? 'blue'
              : v === '종료대기' ? 'orange'
              : v === '휴차' ? 'gray'
              : 'brand';
            return (
              <button
                key={v}
                className={`chip chip-tone-${tone} ${view === v ? 'active' : ''}`}
                onClick={() => setView(v)}
              >
                {v}
                {count > 0 && <span className="chip-count">{count}</span>}
              </button>
            );
          })}
          {companies.length > 1 && (
            <>
              <span className="filter-divider" />
              <select
                className="input-compact"
                data-w="md"
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                title="회사별 필터"
              >
                {companies.map((co) => {
                  const cnt = companyCounts[co] ?? 0;
                  const label = co === '전체' ? '회사: 전체' : displayCompanyName(co, companyMaster) || co;
                  return (
                    <option key={co} value={co}>
                      {label}{cnt > 0 ? ` (${cnt})` : ''}
                    </option>
                  );
                })}
              </select>
            </>
          )}
        </>
      }
      topbarRight={
        <>
          <span className="topbar-sort" title={manualSort ? '컬럼 헤더 다시 클릭으로 변경/해제' : '필터별 자동 정렬'}>
            <span className="arrow">{manualSort?.dir === 'asc' ? '▲' : '▼'}</span>
            {manualSort
              ? `${manualSort.col} ${manualSort.dir === 'asc' ? '오름' : '내림'}`
              : sortLabel(view)}
          </span>
          <span className="topbar-date">{dateWithDow(todayKr())}</span>
        </>
      }
      bare
      noBottomBar
    >
      <div className="dashboard">
        <div className="panel">
          <div className="panel-body">
            <table className="table">
              <thead>
                <tr>
                  <th className="checkbox-col">
                    <input
                      type="checkbox"
                      checked={filteredContracts.length > 0 && filteredContracts.every((c) => selectedIds.has(c.id))}
                      ref={(el) => {
                        if (!el) return;
                        const some = filteredContracts.some((c) => selectedIds.has(c.id));
                        const all = filteredContracts.every((c) => selectedIds.has(c.id));
                        el.indeterminate = some && !all;
                      }}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(new Set(filteredContracts.map((c) => c.id)));
                        else setSelectedIds(new Set());
                      }}
                      aria-label="전체 선택"
                    />
                  </th>
                  <SortableTh col="회사" align="center" width={64} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="차량상태" align="center" width={84} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="차량번호" width={92} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="차종" sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="사용처" width={96} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="연락처" width={116} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="운전자나이" align="center" width={70} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="보험연령" align="center" width={70} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="계약상태" align="center" width={80} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="시작일" align="center" width={88} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="종료일" align="center" width={88} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="결제일" align="center" width={64} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="회차" align="center" width={64} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="반납까지" align="center" width={76} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="수납상태" align="center" width={86} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="미수금" align="num" width={110} sort={manualSort} onSort={toggleSort} />
                  <th style={{ width: 240 }}>비고</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.length === 0 ? (
                  <tr>
                    <td colSpan={18} className="muted center" style={{ padding: 32 }}>표시할 계약이 없습니다.</td>
                  </tr>
                ) : (
                  filteredContracts.map((c) => {
                    const expiryDate = getExpiryDate(c);
                    const isReturnOverdue = !!(expiryDate && !c.returnedDate && c.status === '운행' && expiryDate < todayKr());
                    const vs = getVehicleState(c);
                    const cs = getContractState(c);
                    const ps = getPaymentState(c);

                    const isChecked = selectedIds.has(c.id);
                    // 행 배경 색칠 제거 — 상태는 칩(뱃지)으로 충분히 구분 가능
                    const alertClass = '';
                    return (
                      <tr
                        key={c.id}
                        onDoubleClick={() => handleRowDoubleClick(c)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setSelectedId(c.id);
                          setCtxMenu({ open: true, x: e.clientX, y: e.clientY, row: c });
                        }}
                        className={`status-row ${alertClass} ${selected?.id === c.id ? 'selected' : ''} ${isChecked ? 'selected-row' : ''}`}
                        onClick={() => setSelectedId(c.id)}
                      >
                        {/* 체크박스 */}
                        <td className="checkbox-col" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleRow(c.id)}
                            aria-label={`${c.customerName} 선택`}
                          />
                        </td>
                        {/* 회사 */}
                        <td className="center dim">{displayCompanyName(c.company, companyMaster)}</td>
                        {/* 차량상태 — display 만. 변경은 더블클릭 → dialog → 처리 flow 거쳐서 (휴차 사유/반납 검수 등) */}
                        <td className="center">
                          <StatusBadge tone={vehicleStateTone(vs.name)} title="더블클릭 → 상세 dialog → 상태 탭에서 처리 (휴차 사유·반납 검수 등 flow 거침)">
                            {vs.name}
                          </StatusBadge>
                        </td>
                        {/* 차량 */}
                        <td className="plate">{c.vehiclePlate}</td>
                        <td className="dim">{c.vehicleModel}</td>
                        {/* 사용처 — 운행=계약자명, 휴차/매각=현재 위치(idleLocation) */}
                        <td>
                          {(() => {
                            const s = c.vehicleStatus;
                            const isIdle = s === '휴차' || s === '휴차대기' || s === '매각검토' || s === '매각대기' || s === '매각';
                            if (isIdle) {
                              return c.idleLocation?.trim()
                                ? <span title={`현재 위치 — ${c.idleLocation}`}>{c.idleLocation}</span>
                                : <span className="muted" style={{ fontSize: 11 }}>위치 미입력</span>;
                            }
                            return c.customerName || <span className="muted">-</span>;
                          })()}
                        </td>
                        <td className="mono dim">{c.customerPhone1}</td>
                        {/* 운전자 만연령 — 보험연령보다 어리면 빨강 (운전 불가) */}
                        <td className="center mono">
                          {(() => {
                            const a = driverAge(c);
                            if (a == null) return <span className="muted">-</span>;
                            const ia = c.insuranceAge ?? 0;
                            const blocked = ia > 0 && a < ia;
                            return (
                              <span
                                style={{ color: blocked ? 'var(--red-text)' : 'var(--text-sub)', fontWeight: blocked ? 700 : undefined }}
                                title={blocked ? `운전 불가 — 운전자 ${a}세 < 보험연령 ${ia}세` : undefined}
                              >
                                {a}세{blocked && ' ⚠'}
                              </span>
                            );
                          })()}
                        </td>
                        {/* 보험연령 */}
                        <td className="center mono dim">
                          {c.insuranceAge ? `${c.insuranceAge}세` : <span className="muted">-</span>}
                        </td>
                        {/* 계약상태 + 기간 */}
                        <td className="center">
                          <StatusBadge tone={contractStateTone(cs.name)}>{cs.name}</StatusBadge>
                        </td>
                        {/* 시작일 — 휴차=idleSince, 상품화 단계=readiedDate, 운행 등=계약일/인도일 */}
                        <td className="center mono dim">
                          {(() => {
                            const s = c.vehicleStatus;
                            if ((s === '휴차' || s === '휴차대기' || s === '매각검토') && c.idleSince) {
                              return <span title={`휴차 시작 (계약일: ${shortDate(c.contractDate)})`}>{shortDate(c.idleSince)} <span style={{ fontSize: 10, color: 'var(--orange-text, #c2410c)' }}>휴</span></span>;
                            }
                            if (s === '상품화대기' || s === '상품화중' || s === '상품대기') {
                              const d = c.readiedDate ?? c.registeredDate ?? c.purchasedDate;
                              if (d) return <span title={`상품화 진입 (계약일: ${shortDate(c.contractDate)})`}>{shortDate(d)} <span style={{ fontSize: 10, color: 'var(--brand)' }}>상</span></span>;
                            }
                            return shortDate(c.deliveredDate ?? c.contractDate) || <span className="muted">-</span>;
                          })()}
                        </td>
                        {/* 종료일 — 휴차=idleUntil, 그 외=returnScheduledDate */}
                        <td className="center mono dim">
                          {(() => {
                            const s = c.vehicleStatus;
                            if ((s === '휴차' || s === '휴차대기' || s === '매각검토')) {
                              return shortDate(c.idleUntil) || <span className="muted">-</span>;
                            }
                            return shortDate(getExpiryDate(c) ?? undefined) || <span className="muted">-</span>;
                          })()}
                        </td>
                        {/* 결제일 — 운행 중인 계약만 의미 있음. 휴차/상품화/매각/반납/해지는 비표시 */}
                        <td className="center mono dim">
                          {(() => {
                            const s = c.vehicleStatus;
                            const inactive = s === '휴차' || s === '휴차대기' || s === '매각검토'
                              || s === '매각' || s === '매각대기'
                              || s === '상품화대기' || s === '상품화중' || s === '상품대기'
                              || s === '구매대기' || s === '등록대기'
                              || c.status === '반납' || c.status === '해지';
                            if (inactive) return <span className="muted">-</span>;
                            return c.paymentDay ? `${c.paymentDay}일` : <span className="muted">-</span>;
                          })()}
                        </td>
                        {/* 회차 — 운행 계약만 의미 있음 */}
                        <td className="center mono dim">
                          {(() => {
                            const s = c.vehicleStatus;
                            const inactive = s === '휴차' || s === '휴차대기' || s === '매각검토'
                              || s === '매각' || s === '매각대기'
                              || s === '상품화대기' || s === '상품화중' || s === '상품대기'
                              || s === '구매대기' || s === '등록대기'
                              || c.status === '반납' || c.status === '해지';
                            if (inactive) return <span className="muted">-</span>;
                            return c.currentSeq && c.totalSeq ? `${c.currentSeq}/${c.totalSeq}` : <span className="muted">-</span>;
                          })()}
                        </td>
                        {/* 반납까지 — 휴차/매각 차량은 비표시 */}
                        <td className={`center mono ${isReturnOverdue ? 'danger' : 'dim'}`}>
                          {(() => {
                            const s = c.vehicleStatus;
                            const skip = s === '휴차' || s === '휴차대기' || s === '매각검토' || s === '매각' || s === '매각대기' || c.status === '반납' || c.status === '해지';
                            if (skip) return <span className="muted">-</span>;
                            if (!expiryDate) return <span className="muted">-</span>;
                            if (c.contractDate && expiryDate < c.contractDate) {
                              return <span style={{ color: 'var(--red-text)', fontWeight: 600 }} title={`종료(${expiryDate}) < 시작(${c.contractDate})`}>날짜오류</span>;
                            }
                            return formatRemainingHuman(todayKr(), expiryDate);
                          })()}
                        </td>
                        {/* 수납상태 + 미수금 */}
                        <td className="center">
                          <StatusBadge tone={paymentStateTone(ps.name)}>
                            {ps.name}
                            {ps.name === '미납' && ps.days > 0 && (
                              <span style={{ marginLeft: 4, fontWeight: 600 }}>+{ps.days}</span>
                            )}
                          </StatusBadge>
                        </td>
                        <td className={`num mono ${c.unpaidAmount > 0 ? 'danger' : ''}`}>
                          {c.unpaidAmount > 0 ? formatCurrency(c.unpaidAmount) : <span className="muted">없음</span>}
                        </td>
                        <td className="dim" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.notes || ''}>
                          {c.notes || <span className="muted">-</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 보조 패널 — 반납·만기 / 출고 예정 (연체알림은 리스크 관리로 이동) */}
        <div className="sidebar-stack">
          <SidePanel
            icon={<ArrowUDownLeft size={14} />}
            title="반납 / 만기"
            count={returns.length}
            empty="만기 도래 계약 없음"
          >
            {returns.map((r) => (
              <div key={`ret-${r.contractId}`} className="list-item" onClick={() => {
                const c = contracts.find((x) => x.id === r.contractId);
                if (c) handleRowDoubleClick(c);
              }}>
                <span className="tag in">반납</span>
                <div className="list-item-main">
                  <div className="list-item-top">
                    {r.customerName}
                    <span className="text-weak text-xs">{r.company}</span>
                  </div>
                  <div className="list-item-sub">
                    <span className="plate">{r.vehiclePlate}</span>
                    <span className="text-weak">·</span>
                    {r.vehicleModel}
                  </div>
                </div>
                <DDay date={r.scheduledDate} danger={r.status === '지연'} />
                <div onClick={(e) => e.stopPropagation()}>
                  <ExtendPopover
                    currentReturnDate={r.scheduledDate}
                    customerName={r.customerName}
                    vehiclePlate={r.vehiclePlate}
                    onExtend={(months) => handleExtend(r.contractId, months)}
                  />
                </div>
              </div>
            ))}
          </SidePanel>

          <SidePanel
            icon={<Truck size={14} />}
            title="출고 예정"
            count={deliveries.length}
            empty="출고 예정 없음"
          >
            {deliveries.map((d) => (
              <div key={`del-${d.contractId}`} className="list-item" onClick={() => {
                const c = contracts.find((x) => x.id === d.contractId);
                if (c) handleRowDoubleClick(c);
              }}>
                <span className="tag out">출고</span>
                <div className="list-item-main">
                  <div className="list-item-top">
                    {d.customerName}
                    <span className="text-weak text-xs">{d.company}</span>
                  </div>
                  <div className="list-item-sub">
                    <span className="plate">{d.vehiclePlate}</span>
                    <span className="text-weak">·</span>
                    {d.vehicleModel}
                  </div>
                </div>
                <DDay date={d.scheduledDate} danger={d.status === '지연'} />
              </div>
            ))}
          </SidePanel>
        </div>
      </div>

      <BottomBar
        left={
          <>
            <button className="btn btn-primary" type="button" onClick={() => setCreateOpen(true)} title="자산·계약·입출금 1건 수기 등록 (다이얼로그에서 종류 선택)">
              <Plus size={14} weight="bold" /> 신규 등록
            </button>
            <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
            <button className="btn" type="button" onClick={() => setSmsOpen(true)} title="문자 발송" disabled={selectedIds.size === 0}>
              <PaperPlaneTilt size={14} /> 문자 발송{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => downloadContractsExcel(filteredContracts, companyMaster, { filter: `${view}${companyFilter !== '전체' ? ` · ${companyFilter}` : ''}` })}
              title="현재 표시중인 계약 리스트 엑셀로 내려받기"
              disabled={filteredContracts.length === 0}
            >
              <DownloadSimple size={14} /> 계약 엑셀
            </button>
            {superAdmin && (
              <>
                <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
                <button
                  className="btn"
                  type="button"
                  onClick={handleBulkMarkDelivered}
                  disabled={selectedIds.size === 0}
                  title={selectedIds.size === 0 ? '좌측 체크박스로 행을 선택하세요' : '선택 계약 일괄 인도완료 (deliveredDate = 계약시작일)'}
                >
                  <Truck size={14} /> 일괄 인도완료{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                </button>
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={selectedIds.size === 0}
                  title={selectedIds.size === 0 ? '좌측 체크박스로 행을 선택하세요' : '선택 계약 일괄 삭제 (마스터관리자)'}
                >
                  <X size={14} /> 일괄 삭제{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                </button>
              </>
            )}
          </>
        }
        right={
          <>
            <button className="btn" type="button" onClick={() => { setCreateMode('현황'); setCreateOpen(true); }} title="엑셀 일괄 업로드 (운영현황 형식)">
              <Upload size={14} weight="bold" /> 운영현황 업로드
            </button>
            <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
            <span>전체 <strong>{contracts.length}</strong>건</span>
            {selectedIds.size > 0 && (
              <>
                <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
                <span>선택 <strong>{selectedIds.size}</strong>건</span>
                <button className="btn btn-sm btn-ghost" type="button" onClick={clearSelection}>
                  <X size={11} /> 선택 해제
                </button>
              </>
            )}
            {summary.totalUnpaid > 0 && (
              <>
                <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
                <span>미수 <strong className="mono" style={{ color: 'var(--red-text)' }}>₩{formatCurrency(summary.totalUnpaid)}</strong></span>
              </>
            )}
          </>
        }
      />

      <ContractDetailDialog
        contract={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdate={updateContract}
        onNavigate={(contractId) => setSelectedId(contractId)}
      />
      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} visibleModes={['현황', '차량', '계약', '입출금']} initialMode={createMode} />
      <SmsDialog open={smsOpen} onOpenChange={setSmsOpen} contracts={filteredContracts} selectedIds={selectedIds} />

      <ContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        onClose={() => setCtxMenu({ open: false, x: 0, y: 0, row: null })}
        items={ctxMenu.row ? ([
          {
            label: '상세 보기',
            icon: <MagnifyingGlass size={12} weight="bold" />,
            onClick: () => { if (ctxMenu.row) ctxAction_openDetail(ctxMenu.row); },
          },
          { type: 'separator' },
          {
            label: ctxMenu.row.deliveredDate ? '인도 완료됨' : '인도 처리 (오늘)',
            icon: <Truck size={12} weight="bold" />,
            onClick: () => { if (ctxMenu.row) ctxAction_markDelivered(ctxMenu.row); },
            disabled: !!ctxMenu.row.deliveredDate,
          },
          {
            label: ctxMenu.row.returnedDate ? '반납 완료됨' : '반납 처리 (오늘)',
            icon: <ArrowUDownLeft size={12} weight="bold" />,
            onClick: () => { if (ctxMenu.row) ctxAction_markReturned(ctxMenu.row); },
            disabled: !!ctxMenu.row.returnedDate,
          },
          { type: 'separator' },
          {
            label: 'SMS 발송',
            icon: <PaperPlaneTilt size={12} weight="bold" />,
            onClick: () => { if (ctxMenu.row) ctxAction_sendSms(ctxMenu.row); },
          },
          {
            label: '계약서 발행 (새 탭)',
            icon: <DownloadSimple size={12} weight="bold" />,
            onClick: () => { if (ctxMenu.row) window.open(`/contract/${ctxMenu.row.id}`, '_blank'); },
          },
          { type: 'separator' },
          {
            label: '계약 삭제',
            icon: <X size={12} weight="bold" />,
            onClick: () => { if (ctxMenu.row) ctxAction_delete(ctxMenu.row); },
            danger: true,
          },
        ] satisfies ContextMenuItem[]) : []}
      />
    </PageShell>
  );
}

/* ─────────────── Sub components ─────────────── */

function SortableTh({
  col, align, width, sort, onSort,
}: {
  col: SortCol;
  align?: 'center' | 'num';
  width?: number;
  sort: { col: SortCol; dir: SortDir } | null;
  onSort: (col: SortCol) => void;
}) {
  const isActive = sort?.col === col;
  const arrow = isActive ? (sort?.dir === 'asc' ? '▲' : '▼') : null;
  const className = `sortable ${align === 'center' ? 'center' : align === 'num' ? 'num' : ''} ${isActive ? 'active' : ''}`;
  return (
    <th className={className} style={width ? { width } : undefined} onClick={() => onSort(col)}>
      {col}
      {arrow && <span className="sort-arrow">{arrow}</span>}
    </th>
  );
}

function Metric({ label, value, unit, danger }: { label: string; value: string; unit?: string; danger?: boolean }) {
  return (
    <div className={`metric ${danger ? 'danger' : ''}`}>
      <span className="label">{label}</span>
      <span className="value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </span>
    </div>
  );
}

function SidePanel({
  icon, title, count, tone, empty, meta, children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  tone?: 'red' | 'orange' | 'blue';
  empty: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  const toneColor = tone === 'red' ? 'var(--red-text)' : tone === 'orange' ? 'var(--orange-text)' : 'var(--text-sub)';
  const badgeBg = tone === 'red' ? 'var(--red-bg)' : tone === 'orange' ? 'var(--orange-bg)' : 'var(--zinc-bg)';
  const badgeText = tone === 'red' ? 'var(--red-text)' : tone === 'orange' ? 'var(--orange-text)' : 'var(--zinc-text)';

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <span style={{ color: toneColor }}>{icon}</span>
          {title}
          <span className="badge" style={{ background: badgeBg, color: badgeText }}>{count}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {meta}
          <button className="btn btn-sm btn-ghost" title="새로고침">
            <ArrowsClockwise size={12} />
          </button>
        </div>
      </div>
      <div className="panel-body">
        {count === 0 ? <div className="empty-state">{empty}</div> : <div>{children}</div>}
      </div>
    </div>
  );
}

function DDay({ date, danger }: { date: string; danger?: boolean }) {
  const diff = daysSince(todayKr(), date);
  const text = danger ? `D+${Math.abs(diff)}` : diff === 0 ? '오늘' : `D-${diff}`;
  return (
    <div className="list-item-right">
      <div className={`dday ${danger ? 'danger' : ''}`}>{text}</div>
      <div className="date">{formatDate(date)}</div>
    </div>
  );
}

/* 합 ₩ 표시 short — 1,234,567 → 1.23M */
function formatCurrencyShort(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(0)}만`;
  return formatCurrency(n);
}

