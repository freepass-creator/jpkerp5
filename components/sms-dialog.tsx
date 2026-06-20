'use client';

import { useMemo, useState } from 'react';
import { ChatCircleDots, PaperPlaneTilt } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import type { Contract } from '@/lib/types';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';

type Recipient = {
  contractId: string;
  customerName: string;
  vehiclePlate: string;
  phone: string;
  unpaidAmount: number;
  unpaidSeqCount: number;
  currentSeq: number;
  monthlyRent: number;
  depositDue: number;
  depositReceived: number;
  depositUnreceived: number;
  depositRefund: number;
};

const TEMPLATES = [
  {
    label: '미납 1차 안내',
    body: '[jpk] {{고객명}} 님, {{차량번호}} 미수금 {{미수금}} ({{미납회차}}). 금일 중 입금 부탁드립니다. 문의: 02-XXXX-XXXX',
  },
  {
    label: '미납 2차 독촉',
    body: '[jpk] {{고객명}} 님, {{차량번호}} 미수금 {{미수금}} ({{미납회차}}) 미납이 계속되어 시동제어 등 조치가 진행될 수 있습니다. 즉시 입금 또는 연락 부탁드립니다.',
  },
  {
    label: '시동제어 예고',
    body: '[jpk] {{고객명}} 님, {{차량번호}} 미납 누적으로 시동제어가 곧 시행됩니다. 입금 또는 회신 부탁드립니다.',
  },
  {
    label: '시동제어 시행',
    body: '[jpk] {{고객명}} 님, {{차량번호}} 시동제어가 시행되었습니다. 입금 후 해제 가능합니다.',
  },
  {
    label: '검사지연 안내',
    body: '[jpk] {{고객명}} 님, {{차량번호}} 자동차 정기검사 기한이 지났습니다. 신속한 검사 부탁드립니다.',
  },
  {
    label: '계약해지·차량회수 예고',
    body: '[jpk] {{고객명}} 님, {{차량번호}} 계약상 의무 미이행으로 계약해지 및 차량 회수 절차가 진행될 예정임을 통지드립니다. 즉시 연락 부탁드립니다.',
  },
  {
    label: '반납 임박',
    body: '[jpk] {{고객명}} 님, {{차량번호}} 차량 반납 예정일이 임박했습니다. 일정 확인 부탁드립니다.',
  },
  {
    label: '정기점검 안내',
    body: '[jpk] {{고객명}} 님, {{차량번호}} 차량 정기점검 일정 안내드립니다. 가까운 영업소 방문 부탁드립니다.',
  },
  {
    label: '대여료 청구',
    body: '[jpk] {{고객명}} 님, {{차량번호}} {{이번회차}} 대여료 {{월대여료}} 결제일이 도래했습니다. 입금 부탁드립니다.',
  },
  {
    label: '보증금 입금 안내',
    body: '[jpk] {{고객명}} 님, {{차량번호}} 계약 보증금 {{보증금}} 입금 부탁드립니다 (미수령 {{보증금미수령}}). 입금 후 출고 일정 안내드리겠습니다.',
  },
  {
    label: '보증금 입금 확인',
    body: '[jpk] {{고객명}} 님, {{차량번호}} 보증금 {{보증금수령}} 입금 확인되었습니다. 출고 일정 별도 안내드리겠습니다.',
  },
  {
    label: '반납 정산 안내',
    body: '[jpk] {{고객명}} 님, {{차량번호}} 반납 정산 — 보증금 {{보증금수령}} 중 차감액 제외 후 환불 {{보증금환불}} 예정입니다. 환불계좌 확인 부탁드립니다.',
  },
  {
    label: '직접 입력',
    body: '',
  },
];

export function SmsDialog({
  open, onOpenChange, contracts, selectedIds,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contracts: Contract[];
  selectedIds: Set<string>;
}) {
  const recipients: Recipient[] = useMemo(() => {
    const arr = contracts
      .filter((c) => (selectedIds.size > 0 ? selectedIds.has(c.id) : true))
      .map((c) => {
        const due = c.deposit ?? 0;
        const received = c.depositReceived ?? 0;
        const deductSum = (c.depositDeductions ?? []).reduce((s, d) => s + (d.amount ?? 0), 0);
        const refunded = c.depositRefunded ?? 0;
        return {
          contractId: c.id,
          customerName: c.customerName,
          vehiclePlate: c.vehiclePlate,
          phone: c.customerPhone1,
          unpaidAmount: c.unpaidAmount ?? 0,
          unpaidSeqCount: c.unpaidSeqCount ?? 0,
          currentSeq: c.currentSeq ?? 0,
          monthlyRent: c.monthlyRent ?? 0,
          depositDue: due,
          depositReceived: received,
          depositUnreceived: Math.max(0, due - received),
          depositRefund: Math.max(0, received - deductSum - refunded),
        };
      });
    return arr;
  }, [contracts, selectedIds]);

  const [templateIdx, setTemplateIdx] = useState(0);
  const [body, setBody] = useState(TEMPLATES[0].body);

  function applyTemplate(idx: number) {
    setTemplateIdx(idx);
    setBody(TEMPLATES[idx].body);
  }

  async function sendMessages() {
    const ok = await showConfirm({
      title: `${recipients.length}명에게 문자를 발송합니다`,
      description: `[미리보기]\n${preview(body, recipients[0])}`,
    });
    if (!ok) return;

    // Firebase ID token
    const { getFirebaseAuth } = await import('@/lib/firebase/client');
    const auth = getFirebaseAuth();
    const user = auth?.currentUser;
    const idToken = user ? await user.getIdToken() : '';

    // 멱등성 (ERP #16/#26) — 발송 세션 ID + recipient ID 조합 = 중복 발송 차단.
    // 같은 키로 재호출 시 서버가 기존 응답 반환 (네트워크 실패 retry 안전).
    const batchKey = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    let sent = 0, failed = 0, mocked = 0;
    for (const r of recipients) {
      try {
        const res = await fetch('/api/sms/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({
            tel: r.phone,
            message: preview(body, r),
            subject: TEMPLATES[templateIdx].label,
            idempotencyKey: `${batchKey}-${r.contractId}`,
          }),
        });
        const json = await res.json();
        if (json.mock) mocked++;
        else if (json.ok) sent++;
        else failed++;
      } catch {
        failed++;
      }
    }
    if (mocked > 0 && sent === 0 && failed === 0) {
      toast.warning(`Aligo 환경변수 미설정 — mock ${mocked}건 처리. .env.local 등록 필요.`);
    } else if (failed > 0) {
      toast.error(`발송 완료 — 성공 ${sent} · 실패 ${failed}${mocked > 0 ? ` · mock ${mocked}` : ''}`);
    } else {
      toast.success(`발송 완료 — ${sent}건${mocked > 0 ? ` (+ mock ${mocked})` : ''}`);
    }
    onOpenChange(false);
  }

  const bodyLen = body.length;
  const isLong = bodyLen > 90; // LMS 임계값

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`문자 발송 — ${recipients.length}건`}>
        <DialogBody className="p-0" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {/* 왼쪽: 수신자 리스트 */}
            <div style={{ width: 320, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
              <div className="detail-section-header" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
                수신자 ({recipients.length})
                {selectedIds.size === 0 && <span style={{ marginLeft: 6, color: 'var(--text-weak)', textTransform: 'none', letterSpacing: 0 }}>전체 발송</span>}
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {recipients.map((r) => (
                  <div key={r.contractId} className="list-item">
                    <div className="list-item-main">
                      <div className="list-item-top">{r.customerName}</div>
                      <div className="list-item-sub">
                        <span className="plate">{r.vehiclePlate}</span>
                        <span className="text-weak">·</span>
                        <span className="mono">{r.phone}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 오른쪽: 본문 작성 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, gap: 12, minWidth: 0 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-weak)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  템플릿
                </div>
                <div className="filter-bar">
                  {TEMPLATES.map((t, i) => (
                    <button
                      key={t.label}
                      type="button"
                      className={`chip ${templateIdx === i ? 'active' : ''}`}
                      onClick={() => applyTemplate(i)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--text-weak)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between' }}>
                  <span>본문 · 변수: <code>{'{{고객명}}'}</code> <code>{'{{차량번호}}'}</code> <code>{'{{미수금}}'}</code> <code>{'{{미납회차}}'}</code> <code>{'{{이번회차}}'}</code> <code>{'{{월대여료}}'}</code> <code>{'{{보증금}}'}</code> <code>{'{{보증금수령}}'}</code> <code>{'{{보증금미수령}}'}</code> <code>{'{{보증금환불}}'}</code></span>
                  <span className="mono" style={{ color: isLong ? 'var(--orange-text)' : 'var(--text-sub)' }}>
                    {bodyLen}자 {isLong ? '· LMS' : '· SMS'}
                  </span>
                </div>
                <textarea
                  className="input"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="문자 본문을 입력하세요"
                  style={{ flex: 1, height: 'auto', padding: 12, resize: 'none', fontFamily: 'inherit', fontSize: 13 }}
                />
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-weak)' }}>
                미리보기: {recipients[0]
                  ? <code style={{ background: 'var(--bg-sunken)', padding: '2px 6px', borderRadius: 'var(--radius)' }}>{preview(body, recipients[0])}</code>
                  : <span>수신자 없음</span>}
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <div style={{ flex: 1, fontSize: 11, color: 'var(--text-weak)' }}>
            발송 비용 예상: {recipients.length * (isLong ? 25 : 10)}원 ({isLong ? 'LMS 25원' : 'SMS 10원'} × {recipients.length}건)
          </div>
          <DialogClose asChild>
            <button className="btn">취소</button>
          </DialogClose>
          <button
            className="btn btn-primary"
            disabled={recipients.length === 0 || !body.trim()}
            onClick={sendMessages}
          >
            <PaperPlaneTilt size={14} /> {recipients.length}건 발송
          </button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

function preview(body: string, r: Recipient): string {
  const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
  return body
    .replace(/\{\{고객명\}\}/g, r.customerName)
    .replace(/\{\{차량번호\}\}/g, r.vehiclePlate)
    .replace(/\{\{미수금\}\}/g, won(r.unpaidAmount))
    .replace(/\{\{미납회차\}\}/g, `${r.unpaidSeqCount}회`)
    .replace(/\{\{이번회차\}\}/g, `${r.currentSeq}회차`)
    .replace(/\{\{월대여료\}\}/g, won(r.monthlyRent))
    .replace(/\{\{보증금\}\}/g, won(r.depositDue))
    .replace(/\{\{보증금수령\}\}/g, won(r.depositReceived))
    .replace(/\{\{보증금미수령\}\}/g, won(r.depositUnreceived))
    .replace(/\{\{보증금환불\}\}/g, won(r.depositRefund));
}
