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
import { Field, EditableField } from '@/components/ui/editable-field';
import { AttachedFilePreview } from '@/components/ui/attached-file-preview';
import { KpiCard, KpiGrid } from '@/components/ui/kpi-card';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { audit } from '@/lib/firebase/audit-store';
import { displayCompanyShort } from '@/lib/company-display';
import { reassignVehiclesToCompany } from '@/lib/entity-sync';
import { toast } from '@/lib/toast';
import type { Company } from '@/lib/types';

const cleanReg = (s?: string) => (s ?? '').replace(/[^\d-]/g, '');

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

