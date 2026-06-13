'use client';

/**
 * 리스크 전용 상세 다이얼로그 — 조치 이력 중심.
 *
 *  · HERO: 계약자 · 차량 · 미수액 · D+N 경과
 *  · 조치 타임라인 (HistoryEntry scope='contract' 의 리스크 카테고리만)
 *      연락기록 / 분쟁 / 클레임 / 수납이슈 / 법적조치 / 메모
 *  · 액션 버튼: 연락기록 / 시동제어 / 내용증명·SMS / 채권화
 *
 * /receivables 행 더블클릭 진입. 운영현황(ContractDetailDialog)과 분리 — 리스크 컨텍스트만 보임.
 */

import { useMemo } from 'react';
import {
  Phone, Warning, Gavel, Note, CurrencyKrw, PaperPlaneTilt, Power, FileText, X as XIcon,
} from '@phosphor-icons/react';
import { DetailDialogShell } from '@/components/ui/detail-dialog-shell';
import { Section, Stack } from '@/components/ui/detail-primitives';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { displayCompanyName } from '@/lib/company-display';
import { todayKr } from '@/lib/mock-data';
import { formatCurrency, daysSince } from '@/lib/utils';
import type { Contract, HistoryEntry, HistoryCategory } from '@/lib/types';

const RISK_CATEGORIES: HistoryCategory[] = ['연락기록', '분쟁', '클레임', '수납이슈', '법적조치', '메모'];

function categoryIcon(cat: HistoryCategory) {
  switch (cat) {
    case '연락기록': return <Phone size={12} weight="fill" />;
    case '분쟁':
    case '클레임':
    case '수납이슈': return <Warning size={12} weight="fill" />;
    case '법적조치': return <Gavel size={12} weight="fill" />;
    case '메모': return <Note size={12} weight="fill" />;
    default: return null;
  }
}

function categoryTone(cat: HistoryCategory): string {
  if (cat === '법적조치') return 'var(--red-text)';
  if (cat === '수납이슈') return 'var(--red-text)';
  if (cat === '분쟁' || cat === '클레임') return 'var(--orange-text, #c2410c)';
  if (cat === '연락기록') return 'var(--brand)';
  return 'var(--text-sub)';
}

export function RiskDetailDialog({
  contract, open, onOpenChange, onAddContact, onEngineLock, onSendSms, onMarkDebt, onEdit,
}: {
  contract: Contract | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddContact?: (c: Contract) => void;
  onEngineLock?: (c: Contract) => void;
  onSendSms?: (c: Contract) => void;
  onMarkDebt?: (c: Contract) => void;
  /** 수정 콜백 — 계약 상세 dialog 호출 등 */
  onEdit?: () => void;
}) {
  const { entries: allHistory } = useHistoryEntries();
  const { companies } = useCompanies();

  const timeline = useMemo(() => {
    if (!contract) return [];
    return allHistory
      .filter((h) => h.scope === 'contract' && h.contractId === contract.id)
      .filter((h) => RISK_CATEGORIES.includes(h.category))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  }, [allHistory, contract]);

  if (!contract) return null;

  const today = todayKr();
  const overdueDays = (() => {
    const overdue = (contract.schedules ?? []).filter((s) => s.status === '연체' || s.status === '부분납');
    if (overdue.length === 0) return 0;
    const oldest = overdue.map((s) => s.dueDate).sort()[0];
    return daysSince(oldest, today);
  })();

  return (
    <DetailDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={`리스크 — ${contract.vehiclePlate} · ${contract.customerName}`}
      heroName={contract.customerName?.trim() || contract.vehicleModelLine || contract.vehicleModel || contract.vehiclePlate || '-'}
      heroMeta={
        <>
          <span className="plate">{contract.vehiclePlate}</span>
          {contract.customerName?.trim() && (
            <span>{contract.vehicleModel}</span>
          )}
          <span>·</span>
          <span>{displayCompanyName(contract.company, companies)}</span>
          <span>·</span>
          <span className="mono">{contract.customerPhone1 || '-'}</span>
        </>
      }
      heroRight={
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--text-sub)' }}>미수금</div>
            <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--red-text)' }}>
              ₩{formatCurrency(contract.unpaidAmount ?? 0)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--text-sub)' }}>경과</div>
            <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: overdueDays > 10 ? 'var(--red-text)' : undefined }}>
              D+{overdueDays}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--text-sub)' }}>미납회차</div>
            <div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
              {contract.unpaidSeqCount ?? 0}
            </div>
          </div>
        </div>
      }
      onEdit={onEdit}
    >
      <Stack>
        {/* 채권화 단계 진행 — D+N 경과 기준 자동 진행 + 채권 상태 시 종결 */}
        <CollectionStageProgress contract={contract} overdueDays={overdueDays} />

        {/* 즉시 액션 — 작은 버튼 row */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-sm btn-primary" type="button" onClick={() => onAddContact?.(contract)}>
            <Phone size={11} weight="bold" /> + 연락기록
          </button>
          <button className="btn btn-sm" type="button" onClick={() => onEngineLock?.(contract)}>
            <Power size={11} weight="bold" /> 시동제어
          </button>
          <button className="btn btn-sm" type="button" onClick={() => onSendSms?.(contract)}>
            <PaperPlaneTilt size={11} weight="bold" /> 내용증명·SMS
          </button>
          <button className="btn btn-sm" type="button" onClick={() => onMarkDebt?.(contract)} style={{ color: 'var(--red-text)' }}>
            <FileText size={11} weight="bold" /> 채권화
          </button>
        </div>

        <Section title={`조치 이력 (${timeline.length})`} bodyPadding={0}>
          {timeline.length === 0 ? (
            <div className="muted center" style={{ padding: 24, fontSize: 12 }}>
              아직 등록된 조치 이력이 없음 — 상단 + 연락기록 버튼으로 시작
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {timeline.map((h) => (
                <li key={h.id} style={{ display: 'flex', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border-soft)' }}>
                  <div style={{ width: 90, color: 'var(--text-sub)', fontSize: 11 }} className="mono">
                    {h.date}
                  </div>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 6px',
                    fontSize: 10, color: categoryTone(h.category),
                    border: `1px solid ${categoryTone(h.category)}`, borderRadius: 'var(--radius-sm)',
                    height: 18, flexShrink: 0,
                  }}>
                    {categoryIcon(h.category)}
                    {h.category}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{h.title}</div>
                    {h.description && (
                      <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 2 }}>{h.description}</div>
                    )}
                    {h.createdBy && (
                      <div style={{ fontSize: 10, color: 'var(--text-weak)', marginTop: 2 }}>by {h.createdBy}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </Stack>
    </DetailDialogShell>
  );
}

/**
 * 채권화 단계 progress — 미납 경과일 / contract.status 기준 자동 진행.
 *  Stage 1: 초기 연락 (D+1~3)
 *  Stage 2: 시동제어 권장 (D+4~10)
 *  Stage 3: 내용증명 발송 (D+11~30)
 *  Stage 4: 채권화 / 법적조치 (D+31~ 또는 status='채권')
 */
function CollectionStageProgress({ contract, overdueDays }: { contract: Contract; overdueDays: number }) {
  const isDebt = contract.status === '채권';
  const currentStage = isDebt ? 4
    : overdueDays >= 31 ? 4
    : overdueDays >= 11 ? 3
    : overdueDays >= 4 ? 2
    : overdueDays >= 1 ? 1
    : 0;
  const stages = [
    { idx: 1, label: '초기 연락', range: 'D+1~3' },
    { idx: 2, label: '시동제어', range: 'D+4~10' },
    { idx: 3, label: '내용증명', range: 'D+11~30' },
    { idx: 4, label: isDebt ? '채권화 (확정)' : '채권화', range: 'D+31~' },
  ];

  return (
    <div style={{
      display: 'flex',
      gap: 4,
      padding: '8px 10px',
      background: 'var(--bg-soft)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
    }}>
      {stages.map((s, i) => {
        const passed = s.idx < currentStage;
        const current = s.idx === currentStage;
        const future = s.idx > currentStage;
        const color = future ? 'var(--text-weak)'
          : current ? (s.idx === 4 ? 'var(--red-text)' : 'var(--orange-text, #c2410c)')
          : 'var(--green-text)';
        const bg = future ? 'transparent'
          : current ? (s.idx === 4 ? 'var(--red-bg)' : 'var(--orange-bg)')
          : 'var(--green-bg)';
        return (
          <div key={s.idx} style={{
            flex: 1,
            padding: '6px 8px',
            background: bg,
            border: `1px solid ${future ? 'var(--border)' : color}`,
            borderRadius: 'var(--radius)',
            opacity: future ? 0.55 : 1,
            fontSize: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}>
            <div style={{ fontWeight: 600, color }}>
              {passed ? '✓ ' : current ? '● ' : ''}{s.idx}. {s.label}
            </div>
            <div style={{ color: 'var(--text-weak)', fontSize: 9 }}>{s.range}</div>
          </div>
        );
      })}
    </div>
  );
}
