import type { Contract, BankTransaction, CardTransaction } from './types';

/** 기준일 — 오늘 (한국 시간) */
function todayKr(): string {
  const d = new Date();
  const kr = new Date(d.getTime() + (d.getTimezoneOffset() + 540) * 60000);
  return kr.toISOString().slice(0, 10);
}

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
      const refDate = c.lastPaidDate || c.contractDate;
      const expected = addDays(refDate, 35);
      if (expected < today) {
        out.push({
          contractId: c.id, type: '결제지연',
          customerName: c.customerName, vehiclePlate: c.vehiclePlate,
          vehicleModel: c.vehicleModel, company: c.company, manager: c.manager,
          referenceDate: expected,
          overdueDays: daysBetween(expected, today),
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
