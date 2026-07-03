'use client';

/**
 * 영수증 인쇄 다이얼로그 — A4 미리보기 + 인쇄 버튼.
 *
 * 호출:
 *   <ReceiptPrintDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     contract={contract}
 *     amount={500000}
 *     paymentDate="2026-08-05"
 *     purpose="대여료"
 *     period="2026-08 (5회차)"
 *   />
 *
 * 동작:
 *  - 미리보기 — 화면에 A4 영수증 표시 (스크롤)
 *  - 인쇄 — window.print() (다이얼로그 안 본문만 인쇄)
 *  - 닫기
 */

import { useMemo, useCallback, useEffect } from 'react';
import { Printer, X } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { ReceiptDocument, RECEIPT_PRINT_CSS } from './receipt-document';
import { useCompanies } from '@/lib/firebase/companies-store';
import type { Contract } from '@/lib/types';

export function ReceiptPrintDialog({
  open, onOpenChange,
  contract,
  amount,
  paymentDate,
  purpose = '대여료',
  period,
  receiptNo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contract: Contract | null;
  amount: number;
  paymentDate: string;
  purpose?: string;
  period?: string;
  receiptNo?: string;
}) {
  const { companies } = useCompanies();
  const issuer = useMemo(() => {
    if (!contract?.company) return undefined;
    return companies.find((co) => co.code === contract.company || co.name === contract.company);
  }, [contract, companies]);

  const handlePrint = useCallback(() => {
    // 영수증 dialog body 만 인쇄 — print stylesheet 가 .receipt-document 만 노출
    window.print();
  }, []);

  // 라벨에 'Ctrl+P'라 적혀 있으나 핸들러가 없던 것 — 실제 바인딩 추가 (열려있을 때만)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handlePrint]);

  if (!contract) return null;

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="영수증 발행"
        className="receipt-print-dialog"
        size="xl"
      >
        <DialogBody style={{ padding: 0, background: '#e5e7eb', overflow: 'auto' }}>
          <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}>
            <div style={{ boxShadow: '0 0 8px rgba(0,0,0,0.15)', background: '#fff' }}>
              <ReceiptDocument
                issuerCompany={issuer}
                receiverName={contract.customerName || '미입력'}
                receiverPhone={contract.customerPhone1}
                amount={amount}
                purpose={purpose}
                period={period}
                vehiclePlate={contract.vehiclePlate}
                paymentDate={paymentDate}
                receiptNo={receiptNo ?? (contract.contractNo ? `${contract.contractNo}-${(paymentDate ?? '').replace(/-/g, '')}` : undefined)}
                manager={contract.manager}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <button type="button" className="btn"><X size={14} /> 닫기</button>
          </DialogClose>
          <button type="button" className="btn btn-primary" onClick={handlePrint}>
            <Printer size={14} weight="bold" /> 인쇄 (Ctrl+P)
          </button>
        </DialogFooter>

        {/* 인쇄 스타일 — 화면은 dialog 안에만 표시, 인쇄는 receipt-document 만 */}
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body * { visibility: hidden !important; }
            .receipt-print-dialog .receipt-document,
            .receipt-print-dialog .receipt-document * { visibility: visible !important; }
            .receipt-print-dialog .receipt-document {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              margin: 0 !important;
            }
          }
          ${RECEIPT_PRINT_CSS}
        ` }} />
      </DialogContent>
    </DialogRoot>
  );
}
