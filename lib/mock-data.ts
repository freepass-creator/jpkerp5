import type { Contract } from './types';

/** 기준일 — 오늘 (한국 시간). 호출 시점에 계산되므로 자정 넘기면 자동으로 새 날짜 반환. */
export function todayKr(): string {
  const d = new Date();
  const kr = new Date(d.getTime() + (d.getTimezoneOffset() + 540) * 60000);
  return kr.toISOString().slice(0, 10);
}


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

function addDays(yyyymmdd: string, days: number): string {
  const d = new Date(yyyymmdd);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

