'use client';

/**
 * 법인 상세 다이얼로그 — 자산·보험 detail dialog 와 동일 규격 (DetailDialogShell).
 *
 *   더블클릭 → 이 dialog (read-only KV 표시)
 *     → [수정] 버튼 → 모든 KV 가 input 으로 전환
 *     → [저장] → companies-store update + 닫기
 *     → [취소] → 변경 폐기 + read-only 복귀
 */

import { useEffect, useState } from 'react';
import { DetailDialogShell } from '@/components/ui/detail-dialog-shell';
import { Section, Grid2, Stack } from '@/components/ui/detail-primitives';
import { EditableField } from '@/components/ui/editable-field';
import { AttachedFilePreview } from '@/components/ui/attached-file-preview';
import { KpiCard, KpiGrid } from '@/components/ui/kpi-card';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { audit } from '@/lib/firebase/audit-store';
import { displayCompanyShort } from '@/lib/company-display';
import { reassignVehiclesToCompany } from '@/lib/entity-sync';
import { toast } from '@/lib/toast';
import type { Company, BankAccount, CorporateCard, AutoTransferChannel, CardTerminalChannel } from '@/lib/types';
import { Plus, Trash } from '@phosphor-icons/react';

const cleanReg = (s?: string) => (s ?? '').replace(/[^\d-]/g, '');
const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export function CompanyDetailDialog({
  companyId, onOpenChange,
}: {
  companyId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { companies, update } = useCompanies();
  const { vehicles, update: updateVehicle } = useVehicles();
  const { contracts } = useContracts();
  const company = companyId ? companies.find((c) => c.id === companyId) ?? null : null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Company | null>(null);

  useEffect(() => {
    if (company) {
      setDraft({
        ...company,
        bizRegNo: cleanReg(company.bizRegNo),
        corpRegNo: cleanReg(company.corpRegNo),
        contactPhone: cleanReg(company.contactPhone),
      });
      setEditing(false);
    }
  }, [company?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!company) return null;

  const cur = editing && draft ? draft : company;

  // 운영 KPI — 해당 회사의 보유 차량 + 진행 계약 + 누적 미수
  const companyKey = company.code || company.name;
  const companyVehicles = vehicles.filter((v) => v.company === companyKey);
  const vehicleCount = companyVehicles.length;
  const idleCount = companyVehicles.filter((v) => v.status === '휴차').length;
  const runningCount = companyVehicles.filter((v) => v.status === '운행').length;
  const companyContracts = contracts.filter((c) => c.company === companyKey);
  const contractCount = companyContracts.length;
  const activeCount = companyContracts.filter((c) => c.status === '운행' || c.status === '대기').length;
  const overdueCount = companyContracts.filter((c) => (c.unpaidAmount ?? 0) > 0).length;
  const totalUnpaid = companyContracts.reduce((s, c) => s + (c.unpaidAmount ?? 0), 0);

  async function handleSave() {
    if (!draft) return;
    try {
      await update(draft);
      void audit.update('company', draft.id, `법인 수정 — ${draft.name}`);
      // 매칭 차량 자동 재할당 (corpRegNo/bizRegNo 변경 시 효과)
      const reassigned = await reassignVehiclesToCompany(vehicles, draft, updateVehicle);
      toast.success(reassigned > 0 ? `저장됨 — ${draft.name} (차량 ${reassigned}대 자동 매칭)` : `저장됨 — ${draft.name}`);
      setEditing(false);
    } catch (e) {
      toast.error(`저장 실패: ${(e as Error).message}`);
    }
  }

  function handleCancel() {
    setDraft({
      ...company!,
      bizRegNo: cleanReg(company!.bizRegNo),
      corpRegNo: cleanReg(company!.corpRegNo),
      contactPhone: cleanReg(company!.contactPhone),
    });
    setEditing(false);
  }

  return (
    <DetailDialogShell
      open={!!company}
      onOpenChange={onOpenChange}
      title={`법인 상세 — ${company.name}`}
      heroName={displayCompanyShort(cur)}
      heroMeta={
        <>
          {cleanReg(cur.bizRegNo) && (<><span className="mono">{cleanReg(cur.bizRegNo)}</span><span>·</span></>)}
          {cleanReg(cur.corpRegNo) && (<><span className="mono">{cleanReg(cur.corpRegNo)}</span><span>·</span></>)}
          <span>대표 {cur.ceo || '-'}</span>
        </>
      }
      onEdit={() => setEditing(true)}
      editing={editing}
      onSave={() => void handleSave()}
      onCancel={handleCancel}
    >
      <Stack>
        {/* 회사 현황 — 보유/운행/휴차/계약/미수 한눈에 (Section 규격 통일) */}
        <Section title="회사 현황">
          <KpiGrid>
            <KpiCard label="보유 차량" value={`${vehicleCount}대`} hint={vehicleCount === 0 ? '미배정' : undefined} />
            <KpiCard label="운행 중" value={`${runningCount}대`} hint={vehicleCount > 0 ? `${Math.round((runningCount / vehicleCount) * 100)}%` : undefined} />
            <KpiCard label="휴차" value={`${idleCount}대`} hint={idleCount > 0 ? '미배정' : undefined} positive={idleCount === 0 ? undefined : false} />
            <KpiCard label="진행 계약" value={`${activeCount}건`} hint={contractCount > activeCount ? `종결 ${contractCount - activeCount}` : undefined} />
            <KpiCard label="미수 건수" value={`${overdueCount}건`} positive={overdueCount === 0 ? undefined : false} />
            <KpiCard label="누적 미수" value={`₩${totalUnpaid.toLocaleString()}`} positive={totalUnpaid === 0 ? undefined : false} />
          </KpiGrid>
        </Section>

        {/* 사업자등록 정보 — 사업자등록증에서 나오는 내용 */}
        <Section title="사업자등록 정보">
          <Grid2>
            <EditableField editing={editing} label="회사명 (정식)" value={cur.name} onChange={(v) => setDraft((d) => d && { ...d, name: v })} />
            <EditableField editing={editing} label="표기명" value={cur.displayName} onChange={(v) => setDraft((d) => d && { ...d, displayName: v })} />
            <EditableField editing={editing} label="대표자" value={cur.ceo} onChange={(v) => setDraft((d) => d && { ...d, ceo: v })} />
            <EditableField editing={editing} label="법인등록번호" value={cleanReg(cur.corpRegNo)} onChange={(v) => setDraft((d) => d && { ...d, corpRegNo: v })} mono />
            <EditableField editing={editing} label="사업자등록번호" value={cleanReg(cur.bizRegNo)} onChange={(v) => setDraft((d) => d && { ...d, bizRegNo: v })} mono />
            <EditableField editing={editing} label="업종" value={cur.bizType} onChange={(v) => setDraft((d) => d && { ...d, bizType: v })} />
            <EditableField editing={editing} label="종목" value={cur.bizItem} onChange={(v) => setDraft((d) => d && { ...d, bizItem: v })} />
            <EditableField editing={editing} label="주소" value={cur.address} onChange={(v) => setDraft((d) => d && { ...d, address: v })} />
          </Grid2>
        </Section>

        {/* 회사 정보 — 홈페이지·실무 담당자 (운영 contact) */}
        <Section title="회사 정보">
          <Grid2>
            <EditableField editing={editing} label="홈페이지" value={cur.homepage} onChange={(v) => setDraft((d) => d && { ...d, homepage: v })} />
            <EditableField editing={editing} label="대표 전화" value={cleanReg(cur.mainPhone)} onChange={(v) => setDraft((d) => d && { ...d, mainPhone: v })} mono />
            <EditableField editing={editing} label="실무자" value={cur.contactName} onChange={(v) => setDraft((d) => d && { ...d, contactName: v })} />
            <EditableField editing={editing} label="실무자 직책" value={cur.contactRole} onChange={(v) => setDraft((d) => d && { ...d, contactRole: v })} />
            <EditableField editing={editing} label="실무자 연락처" value={cleanReg(cur.contactPhone)} onChange={(v) => setDraft((d) => d && { ...d, contactPhone: v })} mono />
            <EditableField editing={editing} label="실무자 이메일" value={cur.contactEmail} onChange={(v) => setDraft((d) => d && { ...d, contactEmail: v })} />
          </Grid2>
        </Section>

        {/* 계좌 — 입출금 (BankTx 업로드 시 매칭) */}
        <ChannelSection
          title="계좌 (입출금)"
          editing={editing}
          rows={cur.accounts ?? []}
          columns={[
            { key: 'bankName', label: '은행', width: 90, placeholder: '국민/신한/우리…' },
            { key: 'accountNo', label: '계좌번호', width: 180, placeholder: '110-xxx-xxxxxx', mono: true },
            { key: 'accountHolder', label: '예금주', width: 110 },
            { key: 'nickname', label: '별명', width: 110, placeholder: '운영/수납/보증금…' },
            { key: 'purpose', label: '용도', width: 110, placeholder: '대여료수납/관리비…' },
          ]}
          onAdd={() => setDraft((d) => d && {
            ...d,
            accounts: [...(d.accounts ?? []), { id: newId('acct'), bankName: '', accountNo: '', accountHolder: '' } as BankAccount],
          })}
          onChange={(idx, key, value) => setDraft((d) => {
            if (!d) return d;
            const rows = [...(d.accounts ?? [])];
            rows[idx] = { ...rows[idx], [key]: value };
            return { ...d, accounts: rows };
          })}
          onRemove={(idx) => setDraft((d) => {
            if (!d) return d;
            const rows = [...(d.accounts ?? [])];
            rows.splice(idx, 1);
            return { ...d, accounts: rows };
          })}
        />

        {/* 자동이체 (CMS) — 입금 거래의 cmsId 로 회사 자동 식별 */}
        <ChannelSection
          title="자동이체 (CMS · 수입)"
          editing={editing}
          rows={cur.autoTransfers ?? []}
          columns={[
            { key: 'providerName', label: 'CMS 사업자', width: 140, placeholder: 'KICC/효성/KCP…' },
            { key: 'cmsId', label: 'CMS ID', width: 160, placeholder: '거래내역 식별자', mono: true },
            { key: 'nickname', label: '별명', width: 130, placeholder: '장기렌트CMS…' },
            { key: 'purpose', label: '용도', width: 110, placeholder: '대여료/관리비…' },
          ]}
          onAdd={() => setDraft((d) => d && {
            ...d,
            autoTransfers: [...(d.autoTransfers ?? []), { id: newId('at'), providerName: '', cmsId: '' } as AutoTransferChannel],
          })}
          onChange={(idx, key, value) => setDraft((d) => {
            if (!d) return d;
            const rows = [...(d.autoTransfers ?? [])];
            rows[idx] = { ...rows[idx], [key]: value };
            return { ...d, autoTransfers: rows };
          })}
          onRemove={(idx) => setDraft((d) => {
            if (!d) return d;
            const rows = [...(d.autoTransfers ?? [])];
            rows.splice(idx, 1);
            return { ...d, autoTransfers: rows };
          })}
        />

        {/* 카드매출 단말기 — CardTx 업로드 시 terminalId 로 회사 식별 */}
        <ChannelSection
          title="카드매출 단말기 (수입)"
          editing={editing}
          rows={cur.cardTerminals ?? []}
          columns={[
            { key: 'vanProvider', label: 'VAN사', width: 100, placeholder: 'KIS/NICE/KOCES…' },
            { key: 'terminalId', label: '단말기 ID', width: 160, placeholder: 'TID', mono: true },
            { key: 'merchantNo', label: '가맹점번호', width: 140, mono: true },
            { key: 'nickname', label: '별명', width: 140, placeholder: '사무실/출고장…' },
          ]}
          onAdd={() => setDraft((d) => d && {
            ...d,
            cardTerminals: [...(d.cardTerminals ?? []), { id: newId('ct'), vanProvider: '', terminalId: '' } as CardTerminalChannel],
          })}
          onChange={(idx, key, value) => setDraft((d) => {
            if (!d) return d;
            const rows = [...(d.cardTerminals ?? [])];
            rows[idx] = { ...rows[idx], [key]: value };
            return { ...d, cardTerminals: rows };
          })}
          onRemove={(idx) => setDraft((d) => {
            if (!d) return d;
            const rows = [...(d.cardTerminals ?? [])];
            rows.splice(idx, 1);
            return { ...d, cardTerminals: rows };
          })}
        />

        {/* 법인카드 — 지출 (CardTx 업로드 시 cardLast4 매칭) */}
        <ChannelSection
          title="법인카드 (지출)"
          editing={editing}
          rows={cur.cards ?? []}
          columns={[
            { key: 'cardName', label: '카드명', width: 130, placeholder: '법인BC / 운영비…' },
            { key: 'cardCompany', label: '카드사', width: 90, placeholder: 'KB/신한…' },
            { key: 'cardLast4', label: '끝 4자리', width: 80, mono: true },
            { key: 'holder', label: '명의자', width: 110 },
            { key: 'purpose', label: '용도', width: 130, placeholder: '주유/유료도로…' },
          ]}
          onAdd={() => setDraft((d) => d && {
            ...d,
            cards: [...(d.cards ?? []), { id: newId('card'), cardName: '', cardCompany: '', cardLast4: '' } as CorporateCard],
          })}
          onChange={(idx, key, value) => setDraft((d) => {
            if (!d) return d;
            const rows = [...(d.cards ?? [])];
            rows[idx] = { ...rows[idx], [key]: value };
            return { ...d, cards: rows };
          })}
          onRemove={(idx) => setDraft((d) => {
            if (!d) return d;
            const rows = [...(d.cards ?? [])];
            rows.splice(idx, 1);
            return { ...d, cards: rows };
          })}
        />

        {/* 첨부 문서 — 사업자등록증 등 */}
        {(company.documents ?? []).length > 0 && (
          <Section title={`첨부 문서 (${company.documents!.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {company.documents!.map((doc) => (
                <AttachedFilePreview
                  key={doc.id}
                  title={doc.title}
                  url={doc.fileUrl}
                  fileName={doc.fileName}
                  uploadedAt={doc.uploadedAt}
                />
              ))}
            </div>
          </Section>
        )}
      </Stack>
    </DetailDialogShell>
  );
}

type ChannelColumn<T> = {
  key: keyof T & string;
  label: string;
  width?: number;
  placeholder?: string;
  mono?: boolean;
};

function ChannelSection<T extends { id: string }>({
  title, editing, rows, columns, onAdd, onChange, onRemove,
}: {
  title: string;
  editing: boolean;
  rows: T[];
  columns: ChannelColumn<T>[];
  onAdd: () => void;
  onChange: (idx: number, key: keyof T & string, value: string) => void;
  onRemove: (idx: number) => void;
}) {
  const action = editing ? (
    <button type="button" className="btn btn-sm" onClick={onAdd}>
      <Plus size={11} weight="bold" /> 추가
    </button>
  ) : undefined;

  return (
    <Section title={`${title} (${rows.length})`} action={action}>
      {rows.length === 0 ? (
        <div className="muted" style={{ fontSize: 12, padding: '8px 0' }}>
          {editing ? '[+ 추가] 로 등록' : '등록된 항목 없음'}
        </div>
      ) : (
        <table className="table" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={{ width: c.width }}>{c.label}</th>
              ))}
              {editing && <th style={{ width: 40 }} />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.id}>
                {columns.map((c) => {
                  const value = String((row as Record<string, unknown>)[c.key] ?? '');
                  if (!editing) {
                    return (
                      <td key={c.key} className={c.mono ? 'mono dim' : 'dim'}>
                        {value || <span className="muted">-</span>}
                      </td>
                    );
                  }
                  return (
                    <td key={c.key} style={{ padding: 4 }}>
                      <input
                        type="text"
                        className={`input-compact ${c.mono ? 'mono' : ''}`}
                        style={{ width: '100%' }}
                        value={value}
                        placeholder={c.placeholder}
                        onChange={(e) => onChange(idx, c.key, e.target.value)}
                      />
                    </td>
                  );
                })}
                {editing && (
                  <td className="center" style={{ padding: 4 }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => onRemove(idx)}
                      title="삭제"
                      style={{ color: 'var(--red-text)' }}
                    >
                      <Trash size={11} weight="bold" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

