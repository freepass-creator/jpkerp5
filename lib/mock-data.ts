import type { Contract, BankTransaction, CardTransaction } from './types';

/** 기준일 — 오늘 (한국 시간). 호출 시점에 계산되므로 자정 넘기면 자동으로 새 날짜 반환. */
export function todayKr(): string {
  const d = new Date();
  const kr = new Date(d.getTime() + (d.getTimezoneOffset() + 540) * 60000);
  return kr.toISOString().slice(0, 10);
}

/** @deprecated 모듈 로드 시점에 고정되므로 todayKr() 함수 호출 사용 권장. 호환 위해 유지. */
export const TODAY = todayKr();

/** 운영 데이터 — RTDB /icar001/contracts 에서 실시간 로드. 빈 배열로 시작. */
export const MOCK_CONTRACTS: Contract[] = [];

/* 출고 일정 */
export type DeliveryItem = {
  contractId: string;
  scheduledDate: string;
  customerName: string;
  vehiclePlate: string;
  vehicleModel: string;
  company: string;
  manager?: string;
  status: '예정' | '지연';
};

export type ReturnItem = {
  contractId: string;
  scheduledDate: string;
  customerName: string;
  vehiclePlate: string;
  vehicleModel: string;
  company: string;
  manager?: string;
  status: '예정' | '지연';
};

export type OverdueItem = {
  contractId: string;
  type: '반납지연' | '결제지연';
  customerName: string;
  vehiclePlate: string;
  vehicleModel: string;
  company: string;
  manager?: string;
  referenceDate: string;
  overdueDays: number;
  unpaidAmount?: number;
};

export type IdleItem = {
  contractId: string;
  customerName: string;
  vehiclePlate: string;
  vehicleModel: string;
  company: string;
  manager?: string;
  reason?: string;
};

export function buildDeliveries(contracts: Contract[], today: string): DeliveryItem[] {
  const out: DeliveryItem[] = [];
  for (const c of contracts) {
    if (c.deliveryScheduledDate && !c.deliveredDate) {
      out.push({
        contractId: c.id,
        scheduledDate: c.deliveryScheduledDate,
        customerName: c.customerName,
        vehiclePlate: c.vehiclePlate,
        vehicleModel: c.vehicleModel,
        company: c.company,
        manager: c.manager,
        status: c.deliveryScheduledDate < today ? '지연' : '예정',
      });
    }
  }
  out.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  return out;
}

export function buildReturns(contracts: Contract[], today: string, withinDays = 30): ReturnItem[] {
  const out: ReturnItem[] = [];
  const horizon = addDays(today, withinDays);
  for (const c of contracts) {
    if (!c.returnScheduledDate || c.returnedDate) continue;
    if (c.status !== '운행') continue;
    if (c.returnScheduledDate > horizon) continue;
    out.push({
      contractId: c.id,
      scheduledDate: c.returnScheduledDate,
      customerName: c.customerName,
      vehiclePlate: c.vehiclePlate,
      vehicleModel: c.vehicleModel,
      company: c.company,
      manager: c.manager,
      status: c.returnScheduledDate < today ? '지연' : '예정',
    });
  }
  out.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  return out;
}

export function buildIdle(contracts: Contract[]): IdleItem[] {
  return contracts
    .filter((c) => c.vehicleStatus === '휴차')
    .map((c) => ({
      contractId: c.id,
      customerName: c.customerName,
      vehiclePlate: c.vehiclePlate,
      vehicleModel: c.vehicleModel,
      company: c.company,
      manager: c.manager,
      reason: c.notes,
    }));
}

export function buildOverdue(contracts: Contract[], today: string): OverdueItem[] {
  const out: OverdueItem[] = [];
  for (const c of contracts) {
    if (c.returnScheduledDate && !c.returnedDate && c.status === '운행' && c.returnScheduledDate < today) {
      out.push({
        contractId: c.id, type: '반납지연',
        customerName: c.customerName, vehiclePlate: c.vehiclePlate,
        vehicleModel: c.vehicleModel, company: c.company, manager: c.manager,
        referenceDate: c.returnScheduledDate,
        overdueDays: daysBetween(c.returnScheduledDate, today),
      });
    }
    if (c.unpaidAmount > 0) {
      // 미납 일수 = 가장 최근(이번달) 미납 회차의 dueDate ~ 오늘
      //   여러 회차 밀려있어도 가장 최근 결제일 기준 (직전월 끌어쓰지 않음)
      const overdue = (c.schedules ?? [])
        .filter((s) => (s.status === '연체' || s.status === '부분납') && s.dueDate <= today)
        .sort((a, b) => b.dueDate.localeCompare(a.dueDate));  // 최신 → 과거
      let referenceDate: string;
      if (overdue.length > 0) {
        referenceDate = overdue[0].dueDate;
      } else if (c.contractDate) {
        // legacy 폴백 — 이번달(or 가장 최근 지난) 결제일 역산
        const [yy, mm] = today.split('-').map(Number);
        const payDay = c.paymentDay || parseInt(c.contractDate.slice(8, 10), 10) || 1;
        const thisMonthLast = new Date(yy, mm, 0).getDate();
        const thisMonthDay = Math.min(payDay, thisMonthLast);
        let ref = `${yy}-${String(mm).padStart(2, '0')}-${String(thisMonthDay).padStart(2, '0')}`;
        if (ref > today) {
          const prevY = mm === 1 ? yy - 1 : yy;
          const prevM = mm === 1 ? 12 : mm - 1;
          const prevLast = new Date(prevY, prevM, 0).getDate();
          const prevDay = Math.min(payDay, prevLast);
          ref = `${prevY}-${String(prevM).padStart(2, '0')}-${String(prevDay).padStart(2, '0')}`;
        }
        referenceDate = ref;
      } else {
        continue;
      }
      if (referenceDate < today) {
        out.push({
          contractId: c.id, type: '결제지연',
          customerName: c.customerName, vehiclePlate: c.vehiclePlate,
          vehicleModel: c.vehicleModel, company: c.company, manager: c.manager,
          referenceDate,
          overdueDays: daysBetween(referenceDate, today),
          unpaidAmount: c.unpaidAmount,
        });
      }
    }
  }
  out.sort((a, b) => b.overdueDays - a.overdueDays);
  return out;
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

function addDays(yyyymmdd: string, days: number): string {
  const d = new Date(yyyymmdd);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/* 수납 트랜잭션 — 모두 RTDB에서 실시간 로드 예정. 현재는 빈 배열. */
export const MOCK_BANK_TX: BankTransaction[] = [];
export const MOCK_CARD_TX: CardTransaction[] = [];

export type CmsTransaction = {
  id: string;
  txDate: string;
  customerName: string;
  amount: number;
  result: '성공' | '실패' | '부분';
  failReason?: string;
  cmsNo?: string;
  source?: string;
  matchedContractId?: string;
};
export const MOCK_CMS_TX: CmsTransaction[] = [];

export function getUnmatchedBank(): BankTransaction[] {
  return MOCK_BANK_TX.filter((t) => !t.matchedContractId).sort((a, b) => b.txDate.localeCompare(a.txDate));
}
