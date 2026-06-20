'use client';

/**
 * 세금계산서 발행 ledger — ERP #29 표준 보고서 Frozen Artifact.
 *
 * 발행 시점의 데이터를 별도 노드에 사본 보관.
 * 후속 계약 정보 변경 (월대여료 인상, 계약자 정보 수정 등) 이 있어도
 * 이미 발행된 세금계산서 row 는 그대로 보존.
 *
 * 구조:
 *   issued_invoices/{batchId}/
 *     issuedAt, issuedBy, billingMonth
 *     items: [{ contractId, customerIdentNo, customerName, vehiclePlate, monthlyRent, ... }]
 *
 * 사용:
 *   await recordIssuedInvoices({
 *     billingMonth: '2026-06',
 *     items: contracts.map(c => snapshotFromContract(c)),
 *     issuedBy: actor,
 *   });
 */

import { ref, push, set } from 'firebase/database';
import { getRtdb, dbPath, ensureAuth } from './client';
import { audit } from './audit-store';
import type { Contract } from '@/lib/types';

const PATH = dbPath('issued_invoices');

export type IssuedInvoiceSnapshot = {
  contractId: string;
  contractNo: string;
  customerName: string;
  customerIdentNo?: string;
  customerKind?: string;
  vehiclePlate: string;
  vehicleModel?: string;
  monthlyRent: number;
  supplyAmount: number;
  vatAmount: number;
  /** 그 시점의 계약 status — 정정 추적용 */
  statusAtIssue: Contract['status'];
};

export type IssuedInvoiceBatch = {
  batchId: string;
  issuedAt: string;
  issuedBy: string;
  billingMonth: string;        // YYYY-MM
  itemCount: number;
  totalSupply: number;
  totalVat: number;
  items: IssuedInvoiceSnapshot[];
  notes?: string;
};

export function snapshotFromContract(c: Contract): IssuedInvoiceSnapshot {
  const total = c.monthlyRent ?? 0;
  const supply = Math.round(total / 1.1);
  const vat = total - supply;
  return {
    contractId: c.id,
    contractNo: c.contractNo,
    customerName: c.customerName,
    customerIdentNo: c.customerIdentNo,
    customerKind: c.customerKind,
    vehiclePlate: c.vehiclePlate,
    vehicleModel: c.vehicleModel,
    monthlyRent: total,
    supplyAmount: supply,
    vatAmount: vat,
    statusAtIssue: c.status,
  };
}

export async function recordIssuedInvoices(opts: {
  billingMonth: string;
  items: IssuedInvoiceSnapshot[];
  issuedBy: string;
  notes?: string;
}): Promise<string> {
  await ensureAuth();
  const db = getRtdb();
  if (!db) throw new Error('RTDB 미설정');
  const newRef = push(ref(db, PATH));
  const batchId = newRef.key ?? `local-${Date.now()}`;
  const batch: IssuedInvoiceBatch = {
    batchId,
    issuedAt: new Date().toISOString(),
    issuedBy: opts.issuedBy,
    billingMonth: opts.billingMonth,
    itemCount: opts.items.length,
    totalSupply: opts.items.reduce((s, x) => s + x.supplyAmount, 0),
    totalVat: opts.items.reduce((s, x) => s + x.vatAmount, 0),
    items: opts.items,
    notes: opts.notes,
  };
  await set(newRef, batch);
  void audit.create('system', batchId,
    `세금계산서 발행 ${opts.billingMonth} ${opts.items.length}건 (₩${batch.totalSupply + batch.totalVat})`);
  return batchId;
}
