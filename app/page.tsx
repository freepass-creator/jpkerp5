'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MagnifyingGlass, ArrowsClockwise, Truck, ArrowUDownLeft, X, Plus, PaperPlaneTilt, DownloadSimple, Car, Upload, FileXls } from '@phosphor-icons/react';
import { BottomBar } from '@/components/layout/bottom-bar';
import { NewButton, ExcelButton, SmsButton, DeleteButton, ActionButton, ActionSep, ClearButton, PageStats } from '@/components/ui/page-actions';
import {
  todayKr,
  buildDeliveries,
  buildReturns,
} from '@/lib/mock-data';
import { useLiveTodayKr } from '@/lib/use-live-today';
import { formatCurrency, formatDate, daysSince, dateWithDow, formatRemainingHuman } from '@/lib/utils';
import type { Contract } from '@/lib/types';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { syncContractAndVehicleStatus } from '@/lib/firebase/contract-status-sync';
import { useCompanies } from '@/lib/firebase/companies-store';
import { displayCompanyName } from '@/lib/company-display';
import { CompanyCell } from '@/components/ui/company-cell';
import { MissingBadge, MissingText } from '@/components/ui/missing-badge';
import { useRowSelection, useCtrlASelectAll } from '@/lib/use-row-selection';
import { useTableSelection } from '@/lib/use-table-selection';
import { isContractEnded, isContractActive, isOperating } from '@/lib/contract-lifecycle';
import { downloadContractsExcel } from '@/lib/contract-export';
import { addMonthsKeepDay, extendSchedules } from '@/lib/payment-schedule';
import { ContractDetailDialog } from '@/components/contract-detail-dialog';
import { PageShell } from '@/components/ui/page-shell';
import { FilterSelect } from '@/components/ui/filter-select';
import { CompanyFilter } from '@/components/ui/filter-bar';
import { useVehicleDialog } from '@/lib/global-dialogs';
import { CreateDialog } from '@/components/create-dialog';
import { ExtendPopover } from '@/components/extend-popover';
import { SmsDialog } from '@/components/sms-dialog';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { useAuth } from '@/lib/use-auth';
import { usePersistentState } from '@/lib/use-persistent-state';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';
import { isSuperAdmin } from '@/lib/admin-emails';
import { ageFromIdent } from '@/lib/ident';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { vehicleStateTone, contractStateTone, paymentStateTone } from '@/lib/status-tones';
import { safeUpdate } from '@/lib/safe-update';
import { markDelivered, markReturned } from '@/lib/contract-actions';
import {
  getExpiryDate,
  getVehicleState, getContractState, getPaymentState,
  type VehicleState, type ContractState, type PaymentState,
} from '@/lib/contract-stage';

type View = '전체' | '확정대기' | '계약중' | '만기경과' | '만기임박' | '연장대기' | '종료대기' | '휴차' | '미수';
/** 항상 표시되는 기본 필터 */
const BASE_VIEWS: View[] = ['전체', '계약중', '휴차', '미수'];
/** 데이터 있을 때만 표시되는 조건부 필터 */
const CONDITIONAL_VIEWS: View[] = ['확정대기', '만기경과', '만기임박', '연장대기', '종료대기'];

/**
 * (구) 계약중 — 반납·해지 안 됨. 사용 안 함 (matchesView 가 isRunning 사용).
 * 다른 페이지/모듈에서 사용 시 참조 가능 — 미삭제.
 */
function isActiveContract(c: Contract): boolean {
  return isContractActive(c);
}
void isActiveContract; // 미사용 경고 회피 (export 안 함)

/**
 * 계약중(고객 있음) — 인도일 / 손님이름 / 운행 vehicleStatus 중 하나라도 있으면 계약중.
 * 스냅샷 업로드 후 인도일이 비어있어도 손님이 있으면 계약중으로 인식.
 */
function isRunning(c: Contract): boolean {
  if (isContractEnded(c)) return false;
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

/** 종료된 계약 — lib/contract-lifecycle SSOT alias */
function isClosed(c: Contract): boolean {
  return isContractEnded(c);
}

function matchesView(c: Contract, v: View): boolean {
  // 종료된 계약은 운영현황에서 제외 (리스크관리 → 종료 탭에서 확인)
  if (isClosed(c)) return false;
  if (v === '전체') return true;
  // '계약중' = 실제 운행 중인 계약만 (휴차/매각/상품화 제외 — 사용자 명시).
  // 휴차 chip 과 mutually exclusive. 합집합 = 전체.
  if (v === '계약중') return isRunning(c);
  if (v === '확정대기') return getContractState(c).name === '확정대기';
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
type SortCol = '회사' | '차량상태' | '차량번호' | '차종' | '사용처' | '연락처' | '운전연령' | '보험연령' | '계약상태' | '기간' | '월대여료' | '결제일' | '회차' | '반납까지' | '수납상태' | '미수금';
type SortDir = 'asc' | 'desc';

const VS_ORDER: VehicleState[] = [
  '구매대기', '등록대기', '상품화중', '인도대기',
  '운행중',
  '휴차대기', '휴차', '매각검토', '매각대기', '매각완료', '반납',
];
const CS_ORDER: ContractState[] = ['위반', '미수검', '연장대기', '종료대기', '만기경과', '만기임박', '확정대기', '계약중'];
const PS_ORDER: PaymentState[] = ['미납', '정상', '휴차', '종결'];

/**
 * 운전연령 만나이 — 임차인 종류별 기준이 다름.
 *   · 개인 임차인 → 임차인 생년월일(customerIdentNo) 기준 (=실제 운전자)
 *     · 폴백: customerIdentNo 가 없으면 driverIdentNo (등록만 다른 케이스)
 *   · 법인 임차인 → 주운전자(driverIdentNo) 기준 (법인은 생년월일 없음)
 *   · 식별번호 부재 / 잘못된 형식 → undefined
 */
function driverAge(c: Contract): number | undefined {
  const isIndividual = c.customerKind === '개인'
    || (!c.customerKind && (c.customerIdentNo ?? '').replace(/\D/g, '').length === 13);
  if (isIndividual) {
    return ageFromIdent(c.customerIdentNo, '개인') ?? ageFromIdent(c.driverIdentNo, '개인');
  }
  // 법인 — 주운전자 식별번호 기준
  if (c.driverIdentNo) return ageFromIdent(c.driverIdentNo, '개인');
  return undefined;
}

/**
 * 약정개월별 뱃지 색상 — status 색(green/blue/orange/red/gray)과 비충돌 팔레트 사용.
 * indigo(짧음) → blue → purple → amber → red(긺) 그라데이션.
 */
function termTone(months: number): BadgeTone {
  if (months <= 12) return 'indigo';
  if (months <= 24) return 'blue';
  if (months <= 36) return 'purple';
  if (months <= 48) return 'amber';
  return 'red'; // 60+ (매우 드묾)
}

function compareForCol(a: Contract, b: Contract, col: SortCol): number {
  switch (col) {
    case '회사': return a.company.localeCompare(b.company);
    case '차량상태': return VS_ORDER.indexOf(getVehicleState(a).name) - VS_ORDER.indexOf(getVehicleState(b).name);
    case '차량번호': return a.vehiclePlate.localeCompare(b.vehiclePlate);
    case '차종': return a.vehicleModel.localeCompare(b.vehicleModel);
    case '사용처': return resolveUsage(a).localeCompare(resolveUsage(b));
    case '연락처': return a.customerPhone1.localeCompare(b.customerPhone1);
    case '운전연령': return (driverAge(a) ?? 0) - (driverAge(b) ?? 0);
    case '보험연령': return (a.insuranceAge ?? 0) - (b.insuranceAge ?? 0);
    case '계약상태': return CS_ORDER.indexOf(getContractState(a).name) - CS_ORDER.indexOf(getContractState(b).name);
    case '기간': {
      // 장기(기간 정함 없음) = 가장 큰 값 취급
      const aM = a.termMonths && a.termMonths > 0 ? a.termMonths : 9999;
      const bM = b.termMonths && b.termMonths > 0 ? b.termMonths : 9999;
      return aM - bM;
    }
    case '월대여료': return (a.monthlyRent ?? 0) - (b.monthlyRent ?? 0);
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
  const router = useRouter();
  const today = useLiveTodayKr();
  const [search, setSearch] = useState('');
  const [view, setView] = usePersistentState<View>('filter:operation:view', '전체');
  // URL ?view= 진입 시 필터 prefill (dashboard drill-down)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const v = sp.get('view');
    if (v && ['전체', '확정대기', '계약중', '만기경과', '만기임박', '연장대기', '종료대기', '휴차', '미수'].includes(v)) {
      setView(v as View);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [companyFilter, setCompanyFilter] = usePersistentState<string>('filter:operation:company', '전체');
  const [manualSort, setManualSort] = useState<{ col: SortCol; dir: SortDir } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<'차량' | '계약' | '입출금' | '현황'>('계약');
  const [smsOpen, setSmsOpen] = useState(false);
  // 행 선택 — lib/use-table-selection SSOT
  const sel = useTableSelection();
  const { selectedIds, setSelectedIds, toggleRow } = sel;
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number; row: Contract | null }>({
    open: false, x: 0, y: 0, row: null,
  });

  // Firebase RTDB 실시간 구독 — /jpkerp5/contracts
  const { contracts: rawContracts, loading: contractsLoading, update: rtdbUpdate, remove: rtdbRemove } = useContracts();
  const { openVehicle } = useVehicleDialog();
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

  // 계약+차량 마스터 상태 동기화 — lib/firebase/contract-status-sync 의 공용 헬퍼 사용
  // 모바일(deliver/return) 과 같은 함수 호출 → 양립 보장
  const updateContract = useCallback(async (updated: Contract): Promise<void> => {
    await syncContractAndVehicleStatus(updated, vehicles, rtdbUpdate, updateVehicleMaster);
  }, [rtdbUpdate, vehicles, updateVehicleMaster]);

  // 계약 없는 휴차 차량(오펀 행) — RTDB contracts 노드에 없는 가짜 행. 계약 액션 불가.
  const isOrphanRow = (c: Contract) => c.id.startsWith('vehicle-orphan-');

  // 우클릭 컨텍스트 메뉴 액션 — 빠른 인도/반납/연락/SMS/삭제
  function ctxAction_openDetail(c: Contract) {
    setSelectedId(c.id);
    setDetailOpen(true);
  }
  function ctxAction_markDelivered(c: Contract) {
    if (isOrphanRow(c)) {
      toast.info(`${c.vehiclePlate} 는 계약이 없는 휴차 차량입니다 — 계약 등록 후 인도 처리하세요.`);
      return;
    }
    if (c.deliveredDate) {
      toast.info(`${c.vehiclePlate} 는 이미 인도 완료 (${c.deliveredDate})`);
      return;
    }
    const today = todayKr();   // UTC 기준이면 KST 00~09시 처리 시 전날로 기록됨
    void updateContract(markDelivered(c, today));
  }
  async function ctxAction_markReturned(c: Contract) {
    if (isOrphanRow(c)) {
      toast.info(`${c.vehiclePlate} 는 계약이 없는 휴차 차량입니다 — 반납할 계약이 없습니다.`);
      return;
    }
    if (c.returnedDate) {
      toast.info(`${c.vehiclePlate} 는 이미 반납 완료 (${c.returnedDate})`);
      return;
    }
    if (!await showConfirm({ title: `${c.vehiclePlate} ${c.customerName} 을 오늘 반납 처리하시겠습니까?` })) return;
    const today = todayKr();   // UTC 기준이면 KST 00~09시 처리 시 전날로 기록됨
    // 상태값 SSOT (ERP #4) — markReturned 가 일할 자동 정산 + 부수효과 통합
    void updateContract(markReturned(c, today));
  }
  function ctxAction_sendSms(c: Contract) {
    setSelectedIds(new Set([c.id]));
    setSmsOpen(true);
  }
  async function ctxAction_delete(c: Contract) {
    if (isOrphanRow(c)) {
      toast.info(`${c.vehiclePlate} 는 계약이 없는 휴차 차량입니다 — 삭제는 자산 관리에서 하세요.`);
      return;
    }
    if (!await showConfirm({ title: `정말 ${c.contractNo} ${c.vehiclePlate} ${c.customerName} 계약을 삭제하시겠습니까?\n(돌이킬 수 없음)`, danger: true })) return;
    try {
      await rtdbRemove(c.id);
      toast.success('계약 삭제됨');
    } catch (e) {
      toast.error(`삭제 실패: ${(e as Error).message ?? String(e)}`);
    }
  }

  // 선택된 계약 일괄 삭제 — SUPER_ADMIN 만
  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    const list = (Array.from(selectedIds).map((id) => contracts.find((c) => c.id === id)).filter(Boolean) as Contract[])
      .filter((c) => !isOrphanRow(c));
    if (list.length === 0) { toast.info('삭제할 계약이 없습니다 (휴차 차량은 자산 관리에서 삭제).'); return; }
    const preview = list.slice(0, 5).map((c) => `· ${c.vehiclePlate} ${c.customerName}`).join('\n');
    const more = list.length > 5 ? `\n... 외 ${list.length - 5}건` : '';
    if (!await showConfirm({ title: `정말 ${list.length}건 계약을 삭제하시겠습니까?\n\n${preview}${more}\n\n(돌이킬 수 없음)`, danger: true })) return;
    if (!await showConfirm({ title: `한 번 더 확인 — 진짜 삭제할까요? (${list.length}건)`, danger: true })) return;
    for (const c of list) {
      await rtdbRemove(c.id);
    }
    setSelectedIds(new Set());
    toast.success(`${list.length}건 삭제 완료`);
  }

  // 선택된 계약 일괄 인도완료 (계약시작일=인도일) — SUPER_ADMIN 만
  async function handleBulkMarkDelivered() {
    if (selectedIds.size === 0) return;
    const list = Array.from(selectedIds).map((id) => contracts.find((c) => c.id === id)).filter(Boolean) as Contract[];
    const targets = list.filter((c) => !c.deliveredDate && !isOrphanRow(c));
    if (targets.length === 0) {
      toast.info('인도 처리할 계약이 없습니다 (이미 인도 완료 또는 계약 없는 휴차 차량).');
      return;
    }
    if (!await showConfirm({ title: `${targets.length}건을 일괄 인도완료 처리하시겠습니까?\n(deliveredDate = 계약시작일, status = '운행')` })) return;
    // 상태값 SSOT (ERP #4) — markDelivered 가 부수효과 통합
    const updated = targets.map((c) => markDelivered(c, c.contractDate));
    // updateContract 헬퍼 한 건씩 순차 await — Vehicle 마스터 status 동기화 경합 방지 + 실패 감지
    let done = 0;
    const failed: string[] = [];
    for (const c of updated) {
      try { await updateContract(c); done++; } catch { failed.push(c.vehiclePlate ?? c.contractNo ?? c.id); }
    }
    if (failed.length > 0) toast.error(`${done}건 처리, ${failed.length}건 실패: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? ' 외' : ''}`);
    else toast.success(`${done}건 일괄 인도완료 처리`);
  }

  const clearSelection = useCallback(() => sel.clear(), [sel]);

  // 퀵필터 변경 시 수동 정렬·선택 초기화 (필터 의도된 자동 정렬 우선)
  // sel 객체는 selectedIds 변경마다 새 ref → deps 에 넣으면 무한루프. view 만 의존.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setManualSort(null); sel.clear(); }, [view]);

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
      전체: scoped.filter((c) => matchesView(c, '전체')).length,   // 목록과 동일 기준 (종료건 제외)
      계약중: scoped.filter((c) => matchesView(c, '계약중')).length,
      확정대기: scoped.filter((c) => matchesView(c, '확정대기')).length,
      만기경과: scoped.filter((c) => matchesView(c, '만기경과')).length,
      만기임박: scoped.filter((c) => matchesView(c, '만기임박')).length,
      연장대기: scoped.filter((c) => matchesView(c, '연장대기')).length,
      종료대기: scoped.filter((c) => matchesView(c, '종료대기')).length,
      휴차: scoped.filter((c) => matchesView(c, '휴차')).length,
      미수: scoped.filter((c) => matchesView(c, '미수')).length,
    };
  }, [contracts, companyFilter]);

  /** 화면에 표시할 view 칩 목록 — 사용자 룰: 전체만 항상, 나머지는 count > 0 일 때만 (반응형 필터) */
  const visibleViews = useMemo<View[]>(() => {
    const out: View[] = ['전체'];
    const candidates: View[] = ['계약중', ...CONDITIONAL_VIEWS, '휴차', '미수'];
    for (const v of candidates) {
      if (viewCounts[v] > 0) out.push(v);
    }
    return out;
  }, [viewCounts]);

  // 현재 view 의 count 가 0 이면 [전체] 로 자동 전환
  useEffect(() => {
    if (view !== '전체' && viewCounts[view] === 0) setView('전체');
  }, [view, viewCounts]);

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

  const deliveries = useMemo(() => buildDeliveries(scopedContracts, today), [scopedContracts, today]);
  const returns = useMemo(() => buildReturns(scopedContracts, today, 30), [scopedContracts, today]);

  function handleRowDoubleClick(c: Contract) {
    openVehicle(c.vehiclePlate ?? '', 'operation');
  }

  function handleExtend(contractId: string, months: number) {
    const c = contracts.find((x) => x.id === contractId);
    if (!c) return;
    if (!c.termMonths || c.termMonths <= 0) {
      // 무기한(장기) 계약은 termMonths=0 — 0+N개월로 만들면 과거 만기가 생겨 즉시 만기경과로 붕괴
      toast.info(`${c.vehiclePlate} 는 무기한(장기) 계약입니다 — 상세에서 약정기간을 먼저 지정하세요.`);
      return;
    }
    // 연장 기준일 = 만기 SSOT (returnScheduledDate 가 비었거나 어긋난 계약도 일관)
    const fromDate = getExpiryDate(c) ?? todayKr();
    const newTerm = c.termMonths + months;
    void rtdbUpdate({
      ...c,
      returnScheduledDate: addMonthsKeepDay(fromDate, months),
      termMonths: newTerm,
      totalSeq: newTerm,
      schedules: extendSchedules(c, newTerm),   // 연장분 회차 append — 청구 누락 방지
      // 연장대기 상태에서 연장 확정 시 운행 복귀 (연장대기 칩에 잔류하던 것)
      ...(c.vehicleStatus === '연장대기' ? { vehicleStatus: '운행' as const } : {}),
      notes: `${c.notes ?? ''}${c.notes ? ' / ' : ''}${todayKr()} ${months}개월 연장`.trim(),
    });
  }

  // Ctrl/Shift+click 행선택 + Ctrl+A
  const rowSel = useRowSelection({ ids: filteredContracts.map((c) => c.id), selection: sel });
  useCtrlASelectAll(rowSel, sel);

  return (
    <PageShell
      title="운영 현황"
      icon={<Car size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      topbarSearch={{ placeholder: '고객 / 차량 / 차종 / 담당 / 연락처', value: search, onChange: setSearch }}
      topbarFilter={
        <>
          <CompanyFilter
            value={companyFilter}
            onChange={setCompanyFilter}
            options={companies.filter((co) => co !== '전체')}
            master={companyMaster}
            allValue="전체"
            counts={companyCounts}
          />
          <span className="filter-divider" />
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
          <span className="topbar-date">{dateWithDow(today)}</span>
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
                  <SortableTh col="운전연령" align="center" width={70} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="보험연령" align="center" width={90} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="계약상태" align="center" width={80} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="기간" align="center" width={64} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="월대여료" align="num" width={100} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="결제일" align="center" width={72} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="회차" align="center" width={64} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="반납까지" align="center" width={84} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="수납상태" align="center" width={86} sort={manualSort} onSort={toggleSort} />
                  <SortableTh col="미수금" align="num" width={110} sort={manualSort} onSort={toggleSort} />
                  <th style={{ width: 240 }}>비고</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.length === 0 ? (
                  <tr>
                    <td colSpan={18} className="muted center" style={{ padding: 32 }}>
                      {contractsLoading ? '데이터 불러오는 중…' : '표시할 계약이 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  filteredContracts.map((c) => {
                    const expiryDate = getExpiryDate(c);
                    const isReturnOverdue = !!(expiryDate && !c.returnedDate && c.status === '운행' && expiryDate < today);
                    const vs = getVehicleState(c);
                    const cs = getContractState(c);
                    const ps = getPaymentState(c);

                    const isChecked = selectedIds.has(c.id);
                    // 행 배경 색칠 제거 — 상태는 칩(뱃지)으로 충분히 구분 가능
                    const alertClass = '';
                    return (
                      <tr
                        key={c.id}
                        onMouseDown={rowSel.onRowMouseDown}
                        onDoubleClick={() => handleRowDoubleClick(c)}
                        onContextMenu={(e) => {
                          setSelectedId(c.id);
                          const idx = filteredContracts.findIndex((x) => x.id === c.id);
                          rowSel.onRowContextMenu(e, c.id, idx, () => setCtxMenu({ open: true, x: e.clientX, y: e.clientY, row: c }));
                        }}
                        className={`status-row ${alertClass} ${selected?.id === c.id ? 'selected' : ''} ${isChecked ? 'selected-row' : ''}`}
                        onClick={(e) => {
                          setSelectedId(c.id);
                          const idx = filteredContracts.findIndex((x) => x.id === c.id);
                          rowSel.onRowClick(e, c.id, idx);
                        }}
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
                        {/* 회사 — 미입력이면 빨강 경고 뱃지 */}
                        <td className="center dim"><CompanyCell raw={c.company} master={companyMaster} /></td>
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
                                : <MissingText label="위치" />;
                            }
                            return c.customerName || <span className="muted">-</span>;
                          })()}
                        </td>
                        <td className="mono dim">{c.customerPhone1}</td>
                        {/* 운전연령 — 임차인 생년월일(개인) 또는 주운전자(법인) 기반.
                            휴차/매각/상품화/반납/해지 = 운전 안 함 → 의미 없음 (-).
                            운행 계약 중인데 운전자 미입력 = 빨강 경고.
                            운전연령 < 보험연령 = 보험 미커버 (운전 불가) 빨강 경고. */}
                        <td className="center mono">
                          {(() => {
                            const inactive = !isOperating(c);
                            if (inactive) return <span className="muted">-</span>;
                            const a = driverAge(c);
                            const ia = c.insuranceAge ?? 0;
                            if (a == null) {
                              return (
                                <MissingBadge
                                  label="운전자"
                                  title={ia > 0 ? `운전자 미입력 — 보험연령 ${ia}세 커버 대상 불명` : '운전자 미입력 — 등록번호 확인 필요'}
                                  compact
                                />
                              );
                            }
                            const blocked = ia > 0 && a < ia;
                            return (
                              <span
                                style={{ color: blocked ? 'var(--red-text)' : 'var(--text-sub)', fontWeight: blocked ? 700 : undefined }}
                                title={blocked ? `보험 미커버 — 운전연령 ${a}세 < 보험연령 ${ia}세 (운전 불가)` : undefined}
                              >
                                {a}세{blocked && ' ⚠'}
                              </span>
                            );
                          })()}
                        </td>
                        {/* 보험연령 — 휴차/매각/상품화/반납/해지는 의미 없음 → '-'.
                            운영 중인데 미입력 = 빨강. 추가운전자 중 보험연령보다 어린 사람 있으면 셀 아래 ⚠ 뱃지 */}
                        <td className="center mono dim">
                          {(() => {
                            const inactive = !isOperating(c);
                            if (inactive) return <span className="muted">-</span>;
                            const ia = c.insuranceAge ?? 0;
                            if (!ia) {
                              return (
                                <MissingBadge
                                  label="보험연령"
                                  title="보험연령 미입력 — 보험증권 확인 후 등록 필요"
                                  compact
                                />
                              );
                            }
                            // 추가운전자 중 보험연령 미커버 (보험연령보다 어림) 검사
                            const drivers = c.additionalDrivers ?? [];
                            const uncovered = drivers
                              .map((d) => ({ name: d.name, age: ageFromIdent(d.identNo, '개인') }))
                              .filter((d) => d.age != null && d.age < ia);
                            if (uncovered.length === 0) return `${ia}세`;
                            const tip = uncovered.map((d) => `${d.name ?? '추가운전자'}(${d.age}세)`).join(', ');
                            return (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                {ia}세
                                <span
                                  className="badge-base badge-red"
                                  style={{ fontSize: 9, padding: '0 5px', fontWeight: 700 }}
                                  title={`추가운전자 보험 미커버 — ${tip}`}
                                >추가{uncovered.length} ⚠</span>
                              </span>
                            );
                          })()}
                        </td>
                        {/* 계약상태 + 기간 */}
                        <td className="center">
                          <StatusBadge tone={contractStateTone(cs.name)}>{cs.name}</StatusBadge>
                        </td>
                        {/* 기간 — 12/24/36/48/60 별 색상 / 기간정함없음(장기) = brand. 휴차·매각·상품화·종료는 의미 없으니 미표시 */}
                        <td className="center">
                          {(() => {
                            const inactive = !isOperating(c);
                            if (inactive) return <span className="muted">-</span>;
                            const m = c.termMonths;
                            if (!m || m <= 0) {
                              return <StatusBadge tone="brand" title="00 = 기간 정함 없이 운용 (무기한)">00</StatusBadge>;
                            }
                            return <StatusBadge tone={termTone(m)} title={`${m}개월`}>{m}</StatusBadge>;
                          })()}
                        </td>
                        {/* 월대여료 */}
                        <td className="num mono">
                          {c.monthlyRent > 0 ? formatCurrency(c.monthlyRent) : <span className="muted">-</span>}
                        </td>
                        {/* 결제일 — 운행 중인 계약만 의미 있음. 휴차/상품화/매각/반납/해지는 비표시 */}
                        <td className="center mono dim">
                          {(() => {
                            const inactive = !isOperating(c);
                            if (inactive) return <span className="muted">-</span>;
                            const timing = c.paymentTiming ?? '선불';
                            return (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                {c.paymentDay ? `${c.paymentDay}일` : <span className="muted">-</span>}
                                <StatusBadge tone={timing === '후불' ? 'red' : 'blue'} title={timing}>{timing === '후불' ? '후' : '선'}</StatusBadge>
                              </span>
                            );
                          })()}
                        </td>
                        {/* 회차 — 운행 계약만 의미 있음 */}
                        <td className="center mono dim">
                          {(() => {
                            const inactive = !isOperating(c);
                            if (inactive) return <span className="muted">-</span>;
                            return c.currentSeq && c.totalSeq ? `${c.currentSeq}/${c.totalSeq}` : <span className="muted">-</span>;
                          })()}
                        </td>
                        {/* 반납까지 — 휴차/매각 차량은 비표시 */}
                        <td className={`center mono ${isReturnOverdue ? 'danger' : 'dim'}`}>
                          {(() => {
                            const s = c.vehicleStatus;
                            const skip = s === '휴차' || s === '휴차대기' || s === '매각검토' || s === '매각' || s === '매각대기' || isContractEnded(c);
                            if (skip) return <span className="muted">-</span>;
                            if (!expiryDate) return <span className="muted">-</span>;
                            if (c.contractDate && expiryDate < c.contractDate) {
                              return <span style={{ color: 'var(--red-text)', fontWeight: 600 }} title={`종료(${expiryDate}) < 시작(${c.contractDate})`}>날짜오류</span>;
                            }
                            return formatRemainingHuman(today, expiryDate);
                          })()}
                        </td>
                        {/* 수납상태 + 미납일수 — 미납액이 월대여료×N 이상이면 미납N (금액 기준) */}
                        <td className="center">
                          {(() => {
                            const isUnpaid = ps.name === '미납';
                            const unpaidMonths = isUnpaid && c.monthlyRent > 0
                              ? Math.floor(c.unpaidAmount / c.monthlyRent)
                              : 0;
                            const intense = unpaidMonths >= 2;
                            const label = intense ? `미납${unpaidMonths}` : ps.name;
                            return (
                              <>
                                {intense ? (
                                  <span className="badge-base" style={{
                                    background: 'var(--red-text)', color: '#fff',
                                    borderColor: 'var(--red-text)', fontWeight: 700,
                                  }}>{label}</span>
                                ) : (
                                  <StatusBadge tone={paymentStateTone(ps.name)}>{label}</StatusBadge>
                                )}
                                {isUnpaid && ps.days > 0 && (
                                  <span className="mono" style={{ marginLeft: 4, fontWeight: 600, color: 'var(--red-text)', fontSize: 11 }}>+{ps.days}</span>
                                )}
                              </>
                            );
                          })()}
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
            <NewButton label="운영 현황 등록" onClick={() => setCreateOpen(true)} title="운영현황 단건 수기 등록 · 엑셀 일괄 업로드 · 수납 입력 — 다이얼로그 탭에서 선택" />
            <ActionSep />
            <ExcelButton
              count={filteredContracts.length}
              onClick={() => downloadContractsExcel(filteredContracts, companyMaster, {
                title: `운영현황 — ${view}${companyFilter !== '전체' ? ` (${companyFilter})` : ''}`,
                fileName: `운영현황-${view}`,
                sheetName: '운영현황',
                filter: `${view}${companyFilter !== '전체' ? ` · ${companyFilter}` : ''}`,
              })}
            />
            <SmsButton count={selectedIds.size} onClick={() => setSmsOpen(true)} disabled={selectedIds.size === 0} />
            {superAdmin && (
              <>
                <ActionSep />
                <ActionButton
                  icon={<Truck size={14} />}
                  label={`일괄 인도완료${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
                  onClick={handleBulkMarkDelivered}
                  disabled={selectedIds.size === 0}
                  title={selectedIds.size === 0 ? '좌측 체크박스로 행을 선택하세요' : '선택 계약 일괄 인도완료 (deliveredDate = 계약시작일)'}
                />
                <DeleteButton
                  count={selectedIds.size}
                  label="일괄 삭제"
                  onClick={handleBulkDelete}
                  title={selectedIds.size === 0 ? '좌측 체크박스로 행을 선택하세요' : '선택 계약 일괄 삭제 (마스터관리자)'}
                />
              </>
            )}
            {selectedIds.size > 0 && <ClearButton count={selectedIds.size} onClick={clearSelection} />}
          </>
        }
        right={
          <PageStats total={contracts.length} selectedCount={selectedIds.size} unpaid={summary.totalUnpaid} />
        }
      />

      <ContractDetailDialog
        contract={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdate={(c) => { void safeUpdate(() => updateContract(c), { onConflict: () => setDetailOpen(false) }); }}
        onNavigate={(contractId) => setSelectedId(contractId)}
      />
      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        visibleModes={['현황', '차량', '계약', '입출금']}
        initialMode={createMode}
        onContractCreated={(newId) => {
          // 등록 즉시 detail 자동 오픈 (트렌드 UX)
          setSelectedId(newId);
          setDetailOpen(true);
        }}
        onVehicleCreated={(newId) => {
          // 차량 등록 후 자산 페이지로 SPA 네비게이션 + URL ?id= 로 detail 자동 오픈.
          // asset 페이지의 useEffect 가 rawVehicles 로드 완료 후 id 매칭하여 오픈 (자동 재시도)
          router.push(`/asset?id=${newId}`);
        }}
      />
      <SmsDialog open={smsOpen} onOpenChange={setSmsOpen} contracts={filteredContracts} selectedIds={selectedIds} />

      <ContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        onClose={() => setCtxMenu({ open: false, x: 0, y: 0, row: null })}
        items={ctxMenu.row ? (isOrphanRow(ctxMenu.row) ? ([
          // 계약 없는 휴차 차량(오펀 행) — 계약 액션(인도/반납/SMS/계약서발행/삭제)은 무의미.
          // 특히 '계약서 발행'은 /contract/vehicle-orphan-* 을 열어 무한 로딩됨 → 아예 제외.
          {
            label: '상세 보기',
            icon: <MagnifyingGlass size={12} weight="bold" />,
            onClick: () => { if (ctxMenu.row) ctxAction_openDetail(ctxMenu.row); },
          },
          { type: 'separator' },
          {
            label: '차량번호 복사',
            onClick: () => { if (ctxMenu.row?.vehiclePlate) navigator.clipboard.writeText(ctxMenu.row.vehiclePlate).catch(() => toast.error('복사 실패')); },
            disabled: !ctxMenu.row.vehiclePlate,
          },
        ] satisfies ContextMenuItem[]) : ([
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
        ] satisfies ContextMenuItem[])) : []}
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
          {/* 실시간 RTDB 구독이라 수동 새로고침 불필요 — no-op 버튼 제거 (2026-07-03 감사) */}
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

