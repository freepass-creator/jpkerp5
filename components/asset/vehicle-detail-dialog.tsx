'use client';

/**
 * 자산(차량) 상세 다이얼로그 — 6탭 구성.
 *
 *  · 자산현황 view: 6탭 모두 (요약·할부·보험·계약이력·수납·정비)
 *  · 등록차량 view: 요약 탭 단일 (제조사 스펙 + 자등증 + 첨부)
 *
 *  탭 컴포넌트는 향후 별도 파일로 분할 예정 (vehicle-detail/tabs/*).
 *  공용 부품: DetailTabContent (탭 wrapper), COL/COL_FLEX (표 컬럼 width 토큰).
 */

import React, { useMemo } from 'react';
import type { Vehicle, Contract, HistoryEntry, VehicleStatus } from '@/lib/types';

/** VehicleStatus 별 다음 액션 안내 — 운영 현황 탭 라이프사이클 가이드 */
const NEXT_ACTION: Record<VehicleStatus, string> = {
  '구매대기':   '자동차 등록증 입력 + 보험 가입 → 등록대기',
  '등록대기':   '상품화 진행 (외관·내부·점검) → 상품화대기',
  '상품화대기': '상품화 항목 시작 → 상품화중',
  '상품화중':   '상품화 완료 → 상품대기',
  '상품대기':   '계약 체결 → 인도 → 운행',
  '운행':       '정기검사·보험만기·미수 추적',
  '연장대기':   '연장 조건 확정 → 운행',
  '종료대기':   '반납일 도래 → 반납 → 휴차대기',
  '휴차':       '복귀 사유 확정 또는 매각 검토',
  '휴차대기':   '재상품화 또는 매각 검토',
  '정비':       '정비 완료 → 휴차 또는 운행 복귀',
  '사고':       '사고 처리 → 정비 → 복귀',
  '매각검토':   '매각 결정 → 매각대기',
  '매각대기':   '매각 완료 → 처분손익 확정',
  '매각':       '종료 (자산대장 기록)',
  '인도대기':   '인도 처리 → 운행',
  '출고대기':   '출고 처리 → 운행',
  '재고':       '계약 매칭',
  '반납':       '점검 → 휴차대기',
  '임시배차':   '원본 차량 복귀 시 임시배차 해제',
};
import { DetailDialogShell } from '@/components/ui/detail-dialog-shell';
import { AttachedFilePreview } from '@/components/ui/attached-file-preview';
import { StatusBadge } from '@/components/ui/status-badge';
import { Field } from '@/components/ui/editable-field';
import { EmptyRow } from '@/components/ui/empty-row';
import { Section, Stack, Grid2 } from '@/components/ui/detail-primitives';
import { VehiclePhotosSection, VehiclePhotosByKind } from '@/components/vehicle-photos-section';
import { contractStatusTone, vehicleStatusTone } from '@/lib/status-tones';
import { COL, COL_FLEX } from '@/lib/table-cols';
import { useCompanies } from '@/lib/firebase/companies-store';
import { displayCompanyName } from '@/lib/company-display';
import { computeAssetLedgerEntry } from '@/lib/asset-ledger';
import { todayKr } from '@/lib/mock-data';

/** KV — 공용 Field wrap alias (시각 통일). */
function KV({ k, v, mono = false }: { k: string; v?: React.ReactNode; mono?: boolean }) {
  return <Field label={k} value={v == null || v === '' ? '-' : v} mono={mono} muted={v == null || v === ''} />;
}

/* ─── 자산현황 탭1: 운영 요약 — 한 화면 운영 상태 한눈에 ─── */
function OperationOverviewTab({
  vehicle, contracts, history,
}: {
  vehicle: Vehicle;
  contracts: Contract[];
  history: HistoryEntry[];
}) {
  const { companies } = useCompanies();
  // 등록 상태 — 자등증 입력 여부
  const regOk = !!vehicle.vin && !!vehicle.manufacturedDate;
  // 보험 만기 D-N
  const insExpiry = vehicle.insuranceExpiryDate;
  const insDaysLeft = insExpiry ? Math.round((new Date(insExpiry).getTime() - Date.now()) / 86400000) : null;
  // 정비 누적
  const repairs = history.filter((h) => ['정비', '수선', '부품교체'].includes(h.category as string));
  const repairCount = repairs.length;
  const repairTotal = repairs.reduce((s, h) => s + (h.cost ?? 0), 0);
  const repairLast = repairs[0];
  // 활성 계약
  const activeContract = contracts.find((c) => c.status === '운행' || c.status === '대기');
  const unpaid = contracts.reduce((s, c) => s + (c.unpaidAmount ?? 0), 0);
  // 검사 만기
  const inspectExpiry = activeContract?.inspectionDueDate;
  const inspectDaysLeft = inspectExpiry ? Math.round((new Date(inspectExpiry).getTime() - Date.now()) / 86400000) : null;

  return (
    <Stack>
      <Section title="차량 라이프사이클">
        <Grid2>
          <KV k="현재 상태" v={<StatusBadge tone={vehicleStatusTone(vehicle.status)}>{vehicle.status}</StatusBadge>} />
          <KV k="다음 액션" v={<span style={{ fontSize: 12 }}>{NEXT_ACTION[vehicle.status as VehicleStatus] ?? '-'}</span>} />
          <KV k="회사" v={vehicle.company ? displayCompanyName(vehicle.company, companies) : undefined} />
          <KV k="활성 계약" v={activeContract ? (
            <a href={`/?q=${encodeURIComponent(vehicle.plate ?? '')}`} style={{ color: 'var(--brand)', textDecoration: 'none' }}>
              {activeContract.contractNo ?? ''} · {activeContract.customerName ?? ''} →
            </a>
          ) : <span className="dim">없음</span>} />
        </Grid2>
      </Section>

      <Section title="등록 상태">
        <Grid2>
          <KV k="자등증 입력" v={regOk ? <StatusBadge tone="green">완료</StatusBadge> : <StatusBadge tone="orange">미입력</StatusBadge>} />
          <KV k="차량번호" v={vehicle.plate} mono />
          <KV k="제조사·모델" v={`${vehicle.vehicleMaker ?? '-'} ${vehicle.vehicleModelLine ?? vehicle.model ?? ''}`.trim() || undefined} />
          <KV k="차종·연료" v={[vehicle.vehicleType, vehicle.fuelType].filter(Boolean).join(' · ') || undefined} />
          <KV k="VIN" v={vehicle.vin} mono />
          <KV k="제작연월" v={vehicle.manufacturedDate} mono />
        </Grid2>
      </Section>

      <Section title="보험 가입">
        <Grid2>
          <KV k="보험사" v={vehicle.insuranceCompany} />
          <KV k="만기" v={insExpiry ? (
            <span style={{ color: insDaysLeft != null && insDaysLeft < 30 ? 'var(--red-text)' : insDaysLeft != null && insDaysLeft < 90 ? 'var(--orange-text)' : undefined }}>
              {insExpiry} {insDaysLeft != null && <span className="dim">(D{insDaysLeft >= 0 ? '-' : '+'}{Math.abs(insDaysLeft)})</span>}
            </span>
          ) : undefined} mono />
          <KV k="보험연령" v={activeContract?.insuranceAge ? `${activeContract.insuranceAge}세 이상` : undefined} />
          <KV k="자차" v={activeContract?.selfInsured === true ? <StatusBadge tone="green">자차</StatusBadge> : activeContract?.selfInsured === false ? <StatusBadge tone="orange">무자차</StatusBadge> : undefined} />
        </Grid2>
      </Section>

      <Section title="구매방식 (할부·매입가)">
        <Grid2>
          <KV k="매입가" v={vehicle.purchasePrice ? `₩${vehicle.purchasePrice.toLocaleString()}` : undefined} mono />
          <KV k="매입일" v={vehicle.purchasedDate} mono />
          <KV k="할부사" v={vehicle.loanCompany} />
          <KV k="할부 개월" v={vehicle.loanMonths ? `${vehicle.loanMonths}개월` : undefined} mono />
          <KV k="잔여 원금" v={vehicle.loanRemainingPrincipal != null ? `₩${vehicle.loanRemainingPrincipal.toLocaleString()}` : undefined} mono />
          <KV k="개시일" v={vehicle.loanStartDate} mono />
        </Grid2>
      </Section>

      <AssetLedgerSection vehicle={vehicle} />

      <Section title="GPS 설치">
        <Grid2>
          <KV k="설치 여부" v={(vehicle.gpsProvider || vehicle.gpsDeviceId) ? <StatusBadge tone="green">설치</StatusBadge> : <StatusBadge tone="orange">미설치</StatusBadge>} />
          <KV k="GPS 공급사" v={vehicle.gpsProvider} />
          <KV k="단말번호" v={vehicle.gpsDeviceId} mono />
          <KV k="설치일" v={vehicle.gpsInstallUploadedAt?.slice(0, 10)} mono />
        </Grid2>
      </Section>

      <Section title="검사·정비">
        <Grid2>
          <KV k="다음 검사" v={inspectExpiry ? (
            <span style={{ color: inspectDaysLeft != null && inspectDaysLeft < 0 ? 'var(--red-text)' : inspectDaysLeft != null && inspectDaysLeft < 30 ? 'var(--orange-text)' : undefined }}>
              {inspectExpiry} {inspectDaysLeft != null && <span className="dim">(D{inspectDaysLeft >= 0 ? '-' : '+'}{Math.abs(inspectDaysLeft)})</span>}
            </span>
          ) : undefined} mono />
          <KV k="정비 횟수" v={repairCount > 0 ? `${repairCount}회` : undefined} mono />
          <KV k="누적 비용" v={repairTotal > 0 ? `₩${repairTotal.toLocaleString()}` : undefined} mono />
          <KV k="최근 정비" v={repairLast ? `${repairLast.date} · ${repairLast.title}` : undefined} />
        </Grid2>
      </Section>

      <Section title="운영 현황">
        <Grid2>
          <KV k="현재 상태" v={<StatusBadge tone={vehicleStatusTone(vehicle.status)}>{vehicle.status}</StatusBadge>} />
          <KV k="회사" v={vehicle.company ? displayCompanyName(vehicle.company, companies) : undefined} />
          <KV k="활성 계약" v={activeContract ? (
            <a href={`/?q=${encodeURIComponent(vehicle.plate ?? '')}`} style={{ color: 'var(--brand)', textDecoration: 'none' }} title="운영현황에서 이 차량 계약 보기">
              {activeContract.contractNo ?? ''} · {activeContract.customerName ?? ''} →
            </a>
          ) : <span className="dim">없음</span>} />
          <KV k="누적 미수" v={unpaid > 0 ? (
            <a href={`/receivables?q=${encodeURIComponent(vehicle.plate ?? '')}`} style={{ color: 'var(--red-text)', textDecoration: 'none' }} title="미수 관리에서 이 차량 처리">
              ₩{unpaid.toLocaleString()} →
            </a>
          ) : <span className="dim">없음</span>} mono />
        </Grid2>
      </Section>

      {/* 관련 페이지 바로가기 — 직원이 다른 페이지로 즉시 점프 (실무자 워크플로우) */}
      <Section title="관련 페이지 바로가기">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
          <a href={`/asset/insurance?q=${encodeURIComponent(vehicle.plate ?? '')}`} className="btn" style={{ textDecoration: 'none' }}>보험증권 →</a>
          <a href={`/asset/loan?q=${encodeURIComponent(vehicle.plate ?? '')}`} className="btn" style={{ textDecoration: 'none' }}>구매방식 →</a>
          <a href={`/asset/gps?q=${encodeURIComponent(vehicle.plate ?? '')}`} className="btn" style={{ textDecoration: 'none' }}>GPS 설치 →</a>
          <a href={`/asset/repair?q=${encodeURIComponent(vehicle.plate ?? '')}`} className="btn" style={{ textDecoration: 'none' }}>수선 내역 →</a>
          <a href={`/asset/inspection?q=${encodeURIComponent(vehicle.plate ?? '')}`} className="btn" style={{ textDecoration: 'none' }}>검사 내역 →</a>
          <a href={`/contract?q=${encodeURIComponent(vehicle.plate ?? '')}`} className="btn" style={{ textDecoration: 'none' }}>계약 이력 →</a>
        </div>
      </Section>

      {/* 첨부 파일 — 자산 전체 등록 서류 일괄 (자등증/보험/할부/검사/GPS/매도증) */}
      <AttachmentSummary vehicle={vehicle} />
    </Stack>
  );
}

/** 자산 첨부 파일 요약 — 자등증/보험/할부/검사/GPS/매도증 6종 일괄 표시 (다운로드 링크). */
function AttachmentSummary({ vehicle }: { vehicle: Vehicle }) {
  const items: { label: string; url?: string; fileName?: string; uploadedAt?: string }[] = [
    { label: '자동차등록증',     url: vehicle.registrationCertUrl,  fileName: vehicle.registrationCertFileName,  uploadedAt: vehicle.registrationCertUploadedAt },
    { label: '보험가입증명서',   url: vehicle.insuranceCertUrl,     fileName: vehicle.insuranceCertFileName,     uploadedAt: vehicle.insuranceCertUploadedAt },
    { label: '할부계약서',       url: vehicle.loanContractUrl,      fileName: vehicle.loanContractFileName,      uploadedAt: vehicle.loanContractUploadedAt },
    { label: '정기검사증',       url: vehicle.inspectionCertUrl,    fileName: vehicle.inspectionCertFileName,    uploadedAt: vehicle.inspectionCertUploadedAt },
    { label: 'GPS 설치 증빙',    url: vehicle.gpsInstallUrl,        fileName: vehicle.gpsInstallFileName,        uploadedAt: vehicle.gpsInstallUploadedAt },
    { label: '매도증·매각계약서', url: vehicle.disposalCertUrl,      fileName: vehicle.disposalCertFileName,      uploadedAt: vehicle.disposalCertUploadedAt },
  ];
  const attached = items.filter((it) => !!it.url).length;
  return (
    <Section title="첨부 파일">
      <div style={{ marginBottom: 8, fontSize: 11, color: 'var(--text-sub)' }}>
        등록 완료 <strong style={{ color: 'var(--brand)' }}>{attached}</strong> / {items.length}
      </div>
      <div className="detail-grid-2">
        {items.map((it) => (
          <div key={it.label} className="detail-field" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0' }}>
            <span className="label" style={{ minWidth: 130, fontSize: 12, color: 'var(--text-sub)' }}>{it.label}</span>
            {it.url ? (
              <a href={it.url} download={it.fileName ?? undefined} target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, color: 'var(--brand)', fontSize: 12, fontWeight: 500, textDecoration: 'none' }}>
                {it.fileName ?? '다운로드'}
                {it.uploadedAt && <span className="dim" style={{ marginLeft: 6, fontSize: 10 }}>{it.uploadedAt.slice(0, 10)}</span>}
              </a>
            ) : (
              <span style={{ flex: 1, color: 'var(--text-weak)', fontSize: 11 }}>미첨부</span>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ─── 탭1: 요약 — 자산정보 + 등록증정보 ─── */
function SummaryTab({
  vehicle, onUpdate, showAttachment = true,
}: {
  vehicle: Vehicle;
  onUpdate: (v: Vehicle) => void;
  showAttachment?: boolean;
}) {
  void onUpdate;
  const { companies } = useCompanies();
  return (
    <Stack>
      <Section title="제조사 스펙">
        <Grid2>
          <KV k="회사" v={vehicle.company ? displayCompanyName(vehicle.company, companies) : undefined} />
          <KV k="차량번호" v={vehicle.plate} mono />
          <KV k="상태" v={vehicle.status} />
          <KV k="제조사" v={vehicle.vehicleMaker} />
          <KV k="모델" v={vehicle.vehicleModelLine || vehicle.model} />
          <KV k="세부모델" v={vehicle.vehicleSubModel} />
          <KV k="트림" v={vehicle.vehicleTrim} />
          <KV k="차종" v={vehicle.vehicleType} />
          <KV k="연료" v={vehicle.fuelType} />
          <KV k="배기량" v={vehicle.displacementCc ? `${vehicle.displacementCc.toLocaleString()}cc` : undefined} mono />
          <KV k="승차정원" v={vehicle.seatingCapacity ? `${vehicle.seatingCapacity}인` : undefined} />
          <KV k="외부 색상" v={vehicle.exteriorColor} />
          <KV k="내부 색상" v={vehicle.interiorColor} />
          <KV k="길이" v={vehicle.vehicleLength ? `${vehicle.vehicleLength.toLocaleString()}mm` : undefined} mono />
          <KV k="너비" v={vehicle.vehicleWidth ? `${vehicle.vehicleWidth.toLocaleString()}mm` : undefined} mono />
          <KV k="높이" v={vehicle.vehicleHeight ? `${vehicle.vehicleHeight.toLocaleString()}mm` : undefined} mono />
          <KV k="총중량" v={vehicle.totalWeight ? `${vehicle.totalWeight.toLocaleString()}kg` : undefined} mono />
        </Grid2>
      </Section>

      <Section title="자동차등록증 정보">
        <Grid2>
          <KV k="VIN" v={vehicle.vin} mono />
          <KV k="용도" v={vehicle.vehicleUsage} />
          <KV k="형식" v={vehicle.vehicleFormat} mono />
          <KV k="원동기형식" v={vehicle.engineFormat} mono />
          <KV k="제작연월" v={vehicle.manufacturedDate} mono />
          <KV k="최초등록" v={vehicle.firstRegisteredDate} mono />
          <KV k="소유자" v={vehicle.ownerName} />
          <KV k="법인등록번호" v={vehicle.ownerRegNo} mono />
          <KV k="제원관리번호" v={vehicle.specMgmtNo} mono />
          <KV k="사용본거지" v={vehicle.garage} />
          <KV k="매입일" v={vehicle.purchasedDate} mono />
          <KV k="매입가" v={vehicle.purchasePrice ? `₩${vehicle.purchasePrice.toLocaleString()}` : undefined} mono />
        </Grid2>
      </Section>

      {showAttachment && (
        <AttachedFilePreview
          title="원본 자동차등록증"
          url={vehicle.registrationCertUrl}
          fileName={vehicle.registrationCertFileName}
          uploadedAt={vehicle.registrationCertUploadedAt}
        />
      )}
    </Stack>
  );
}

/* ─── 탭2: 할부스케줄 ─── */
function LoanScheduleTab({ vehicle }: { vehicle: Vehicle }) {
  const months = vehicle.loanMonths ?? 0;
  const start = vehicle.loanStartDate;
  const remaining = vehicle.loanRemainingPrincipal ?? 0;
  const purchasePrice = vehicle.purchasePrice ?? 0;

  if (!vehicle.loanCompany || !months || !start) {
    return (
      <Stack>
        <Section
          title="할부 스케줄"
          action={<span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-weak)' }}>할부 정보 미입력</span>}
          bodyPadding={0}
        >
          <table className="table">
            <thead>
              <tr>
                <th className="num" style={{ width: COL.cycle }}>회차</th>
                <th style={{ width: 100 }}>예정일</th>
                <th className="num" style={{ width: COL.money }}>금액</th>
                <th className="center" style={{ width: COL.status }}>상태</th>
              </tr>
            </thead>
            <tbody>
              <EmptyRow colSpan={4}>자산 등록 시 할부사·개월·개시일 입력하면 회차별 스케줄 자동 생성</EmptyRow>
            </tbody>
          </table>
        </Section>
      </Stack>
    );
  }

  const monthly = purchasePrice && months ? Math.round(purchasePrice / months) : 0;
  const startD = new Date(start);
  const today = new Date();
  const rows = Array.from({ length: months }, (_, i) => {
    const due = new Date(startD);
    due.setMonth(due.getMonth() + i);
    const dueIso = due.toISOString().slice(0, 10);
    const paid = due < today;
    return { seq: i + 1, dueDate: dueIso, amount: monthly, paid };
  });
  const paidCount = rows.filter((r) => r.paid).length;
  const paidSum = paidCount * monthly;

  return (
    <Stack>
      <Section title="할부 개요">
        <Grid2>
          <KV k="할부사" v={vehicle.loanCompany} />
          <KV k="할부개월" v={`${months}개월`} />
          <KV k="개시일" v={start} mono />
          <KV k="잔여원금" v={`₩${remaining.toLocaleString()}`} mono />
          <KV k="납입회차" v={`${paidCount} / ${months}`} />
          <KV k="누적납입" v={`₩${paidSum.toLocaleString()}`} mono />
        </Grid2>
      </Section>

      <Section title="회차별 스케줄" bodyPadding={0}>
        <table className="table">
          <thead>
            <tr>
              <th className="num" style={{ width: COL.cycle }}>회차</th>
              <th style={{ width: 100 }}>예정일</th>
              <th className="num" style={{ width: COL.money }}>금액</th>
              <th className="center" style={{ width: COL.status }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.seq}>
                <td className="num mono">{r.seq}</td>
                <td className="mono">{r.dueDate}</td>
                <td className="num mono">₩{r.amount.toLocaleString()}</td>
                <td className="center">
                  {r.paid ? <StatusBadge tone="green">납입</StatusBadge> : <StatusBadge tone="gray">예정</StatusBadge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-weak)', borderTop: '1px solid var(--border-soft)' }}>
          ※ 실 납입 여부는 카드내역/계좌내역 매칭으로 자동 확정 — 위는 균등분할 추정치
        </div>
      </Section>
      <AttachedFilePreview
        title="원본 할부계약서"
        url={vehicle.loanContractUrl}
        fileName={vehicle.loanContractFileName}
        uploadedAt={vehicle.loanContractUploadedAt}
      />
    </Stack>
  );
}

/* ─── 탭3: 보험·검사 ─── */
function ComplianceTab({ vehicle, contracts }: { vehicle: Vehicle; contracts: Contract[] }) {
  const active = contracts.find((c) => c.status === '운행') ?? contracts[0];
  const insExp = active?.insuranceExpiryDate;
  const inspDue = active?.inspectionDueDate;
  const taxDue = active?.vehicleTaxDueDate;
  const today = new Date();
  const d = (s?: string) => s ? Math.floor((new Date(s).getTime() - today.getTime()) / 86400000) : null;

  return (
    <Stack>
      <Section title="자동차보험">
        <Grid2>
          <KV k="보험사" v={vehicle.insuranceCompany} />
          <KV k="증권번호" v={vehicle.insurancePolicyNo} mono />
          <KV k="만기일" v={insExp} mono />
          <KV k="만기까지" v={d(insExp) != null ? `${d(insExp)}일` : undefined} />
        </Grid2>
      </Section>

      <Section title="정기검사 · 자동차세">
        <Grid2>
          <KV k="다음 검사" v={inspDue} mono />
          <KV k="검사까지" v={d(inspDue) != null ? `${d(inspDue)}일` : undefined} />
          <KV k="자동차세 납기" v={taxDue} mono />
          <KV k="납기까지" v={d(taxDue) != null ? `${d(taxDue)}일` : undefined} />
        </Grid2>
      </Section>
      <AttachedFilePreview
        title="원본 보험가입증명서"
        url={vehicle.insuranceCertUrl}
        fileName={vehicle.insuranceCertFileName}
        uploadedAt={vehicle.insuranceCertUploadedAt}
      />
      <AttachedFilePreview
        title="원본 정기검사증"
        url={vehicle.inspectionCertUrl}
        fileName={vehicle.inspectionCertFileName}
        uploadedAt={vehicle.inspectionCertUploadedAt}
      />
    </Stack>
  );
}

/* ─── 탭4: 계약이력 — 자산 다른 탭(요약/할부/보험)과 동일 section.detail-section wrapper ─── */
function ContractListTab({ contracts }: { contracts: Contract[] }) {
  const totalUnpaid = contracts.reduce((s, c) => s + (c.unpaidAmount ?? 0), 0);
  const isEmpty = contracts.length === 0;
  return (
    <Stack>
      <Section
        title={`계약 이력 (${contracts.length})`}
        action={totalUnpaid > 0 ? (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-weak)' }}>
            현재 미수 <strong style={{ color: 'var(--red-text)' }}>₩{totalUnpaid.toLocaleString()}</strong>
          </span>
        ) : null}
        bodyPadding={0}
      >
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: COL.date }}>계약일</th>
              <th style={{ width: COL.contractNo }}>계약번호</th>
              <th style={COL_FLEX.customer}>계약자</th>
              <th className="center" style={{ width: COL.term }}>약정</th>
              <th className="num" style={{ width: COL.money }}>월대여료</th>
              <th className="num" style={{ width: COL.money }}>보증금</th>
              <th className="center" style={{ width: COL.status }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {isEmpty ? (
              <EmptyRow colSpan={7}>계약 이력 없음</EmptyRow>
            ) : contracts.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.contractDate}</td>
                <td className="mono dim">{c.contractNo || <span className="muted">-</span>}</td>
                <td>{c.customerName || <span className="muted">-</span>}</td>
                <td className="center mono dim">{c.termMonths ? `${c.termMonths}개월` : <span className="muted">-</span>}</td>
                <td className="num mono">{c.monthlyRent ? `₩${c.monthlyRent.toLocaleString()}` : <span className="muted">-</span>}</td>
                <td className="num mono">{c.deposit ? `₩${c.deposit.toLocaleString()}` : <span className="muted">-</span>}</td>
                <td className="center"><StatusBadge tone={contractStatusTone(c.status)}>{c.status}</StatusBadge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </Stack>
  );
}

/* ─── 탭5: 수납이력 ─── */
function PaymentHistoryTab({ contracts }: { contracts: Contract[] }) {
  type Row = { date: string; contractNo?: string; customer?: string; amount: number; method?: string; memo?: string };
  const rows: Row[] = [];
  for (const c of contracts) {
    for (const s of c.schedules ?? []) {
      for (const p of s.payments ?? []) {
        rows.push({
          date: p.date,
          contractNo: c.contractNo,
          customer: c.customerName,
          amount: p.amount,
          method: p.source,
          memo: `${s.seq}회차`,
        });
      }
    }
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const isEmpty = rows.length === 0;

  return (
    <Stack>
      <Section
        title={`수납 이력 (${rows.length})`}
        action={total > 0 ? (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-weak)' }}>
            누적 <strong style={{ color: 'var(--green-text)' }}>₩{total.toLocaleString()}</strong>
          </span>
        ) : null}
        bodyPadding={0}
      >
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: COL.date }}>일자</th>
              <th style={{ width: COL.contractNo }}>계약번호</th>
              <th style={COL_FLEX.customer}>계약자</th>
              <th className="center" style={{ width: COL.term }}>회차</th>
              <th className="center" style={{ width: COL.paymentMethod }}>경로</th>
              <th className="num" style={{ width: COL.money }}>금액</th>
            </tr>
          </thead>
          <tbody>
            {isEmpty ? (
              <EmptyRow colSpan={6}>수납 이력 없음</EmptyRow>
            ) : rows.map((r, i) => (
              <tr key={i}>
                <td className="mono">{r.date}</td>
                <td className="mono dim">{r.contractNo || <span className="muted">-</span>}</td>
                <td>{r.customer || <span className="muted">-</span>}</td>
                <td className="center dim">{r.memo}</td>
                <td className="center dim">{r.method || <span className="muted">-</span>}</td>
                <td className="num mono">₩{r.amount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </Stack>
  );
}

/* ─── 탭6: 정비·수선 ─── */
function RepairHistoryTab({ history }: { history: HistoryEntry[] }) {
  const total = history.reduce((s, h) => s + (h.cost ?? 0), 0);
  const isEmpty = history.length === 0;
  return (
    <Stack>
      <Section
        title={`정비·수선 (${history.length})`}
        action={total > 0 ? (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-weak)' }}>
            누적 <strong style={{ color: 'var(--red-text)' }}>₩{total.toLocaleString()}</strong>
          </span>
        ) : null}
        bodyPadding={0}
      >
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: COL.date }}>일자</th>
              <th className="center" style={{ width: COL.category }}>분류</th>
              <th style={COL_FLEX.title}>제목</th>
              <th style={{ width: COL.vendor }}>업체</th>
              <th className="num" style={{ width: COL.mileage }}>주행</th>
              <th className="num" style={{ width: COL.money }}>금액</th>
              <th className="center" style={{ width: COL.status }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {isEmpty ? (
              <EmptyRow colSpan={7}>정비·수선 이력 없음</EmptyRow>
            ) : history.map((h) => (
              <tr key={h.id}>
                <td className="mono">{h.date}</td>
                <td className="center"><StatusBadge tone="neutral">{h.category}</StatusBadge></td>
                <td>{h.title}</td>
                <td className="dim">{h.vendor || <span className="muted">-</span>}</td>
                <td className="num mono dim">{h.mileage ? `${h.mileage.toLocaleString()}km` : <span className="muted">-</span>}</td>
                <td className="num mono">{h.cost ? `₩${h.cost.toLocaleString()}` : <span className="muted">-</span>}</td>
                <td className="center">{h.status ? <StatusBadge tone={h.status === '완료' ? 'green' : 'blue'}>{h.status}</StatusBadge> : <span className="muted">-</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </Stack>
  );
}

/* ─── 탭7: 사고·위반 — history 의 사고/위반 카테고리만 ─── */
function IncidentTab({ history }: { history: HistoryEntry[] }) {
  const total = history.reduce((s, h) => s + (h.cost ?? 0), 0);
  const accidents = history.filter((h) => h.category === '사고').length;
  const violations = history.filter((h) => h.category === '위반').length;
  const isEmpty = history.length === 0;
  return (
    <Stack>
      <Section
        title={`사고·위반 (${history.length})`}
        action={history.length > 0 ? (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-weak)' }}>
            사고 {accidents} · 위반 {violations}{total > 0 && <> · 누적 <strong style={{ color: 'var(--red-text)' }}>₩{total.toLocaleString()}</strong></>}
          </span>
        ) : null}
        bodyPadding={0}
      >
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: COL.date }}>일자</th>
              <th className="center" style={{ width: COL.category }}>분류</th>
              <th style={COL_FLEX.title}>제목</th>
              <th style={{ width: COL.vendor }}>처리처</th>
              <th className="num" style={{ width: COL.money }}>비용</th>
              <th className="center" style={{ width: COL.status }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {isEmpty ? (
              <EmptyRow colSpan={6}>사고·위반 이력 없음</EmptyRow>
            ) : history.map((h) => (
              <tr key={h.id}>
                <td className="mono">{h.date}</td>
                <td className="center">
                  <StatusBadge tone={h.category === '사고' ? 'red' : 'orange'}>{h.category}</StatusBadge>
                </td>
                <td>
                  <div style={{ fontWeight: 500 }}>{h.title}</div>
                  {h.description && <div className="dim" style={{ fontSize: 10, marginTop: 2 }}>{h.description}</div>}
                </td>
                <td className="dim">{h.vendor || <span className="muted">-</span>}</td>
                <td className="num mono">{h.cost ? `₩${h.cost.toLocaleString()}` : <span className="muted">-</span>}</td>
                <td className="center">{h.status ? <StatusBadge tone={h.status === '완료' ? 'green' : 'blue'}>{h.status}</StatusBadge> : <span className="muted">-</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </Stack>
  );
}

/* ─── 메인 다이얼로그 ─── */
/** SSOT 차량 dialog 의 표준 탭 키 — 6분류
 *   operation / risk / asset / contract / payment / photos */
export type VehicleDialogTab =
  | 'operation' | 'risk' | 'asset' | 'contract' | 'payment' | 'photos';

export function VehicleDetailDialog({
  vehicle, history, contracts, view, onUpdate, onClose, onEdit, initialTab,
}: {
  vehicle: Vehicle;
  history: HistoryEntry[];
  contracts: Contract[];
  view: 'status' | 'registered';
  onUpdate: (v: Vehicle) => void;
  onClose: () => void;
  onEdit?: (v: Vehicle) => void;
  /** 진입 페이지 컨텍스트별 default 탭. 미지정 시 view 별 첫 탭 */
  initialTab?: VehicleDialogTab;
}) {
  const sortedHistory = useMemo(() => [...history].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')), [history]);
  const sortedContracts = useMemo(() => [...contracts].sort((a, b) => (b.contractDate ?? '').localeCompare(a.contractDate ?? '')), [contracts]);

  // 정비·수선 = 정비/수선/검사/세차 (자산 보존). 사고·위반은 별도 도메인이라 분리.
  const repairHistory = useMemo(
    () => sortedHistory.filter((h) => ['정비', '수선', '검사', '세차'].includes(h.category as string)),
    [sortedHistory],
  );
  const incidentHistory = useMemo(
    () => sortedHistory.filter((h) => ['사고', '위반'].includes(h.category as string)),
    [sortedHistory],
  );

  return (
    <DetailDialogShell
      open={true}
      onOpenChange={(v) => !v && onClose()}
      title={`자산 상세 — ${vehicle.plate || '미정'} ${vehicle.model || ''}`}
      heroName={vehicle.vehicleModelLine || vehicle.model || vehicle.plate || '미정'}
      heroMeta={
        <>
          <span className="plate">{vehicle.plate || '-'}</span>
          <span>{vehicle.vehicleMaker || '제조사 미입력'}</span>
          <span>·</span>
          <span>{vehicle.company || '회사 미지정'}</span>
          {vehicle.vin && (<><span>·</span><span style={{ fontFamily: 'var(--font-mono)' }}>{vehicle.vin}</span></>)}
        </>
      }
      heroRight={
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="dim" style={{ fontSize: 10 }}>상태</span>
          <StatusBadge tone={vehicleStatusTone(vehicle.status)}>{vehicle.status}</StatusBadge>
        </div>
      }
      onEdit={onEdit ? () => { onClose(); onEdit(vehicle); } : undefined}
      defaultTab={initialTab}
      tabs={view === 'registered'
        ? [
            { value: 'summary', label: '등록차량', content: <SummaryTab vehicle={vehicle} onUpdate={onUpdate} showAttachment={true} /> },
            { value: 'photos', label: '사진', content: <VehiclePhotosSection vehicleId={vehicle.id} readonly /> },
          ]
        : [
            // 페이지 메뉴와 동일 6분류
            { value: 'operation', label: '운영 현황',
              content: <OperationOverviewTab vehicle={vehicle} contracts={sortedContracts} history={sortedHistory} />
            },
            { value: 'risk', label: `리스크 현황${incidentHistory.length > 0 ? ` (${incidentHistory.length})` : ''}`,
              content: <RiskTab vehicle={vehicle} contracts={sortedContracts} incidentHistory={incidentHistory} allHistory={sortedHistory} />
            },
            { value: 'asset', label: '자산 관리',
              content: <AssetTab vehicle={vehicle} repairHistory={repairHistory} contracts={sortedContracts} />
            },
            { value: 'contract', label: `계약 관리${sortedContracts.length > 0 ? ` (${sortedContracts.length})` : ''}`,
              content: <ContractListTab contracts={sortedContracts} />
            },
            { value: 'payment', label: '수납 관리',
              content: <PaymentHistoryTab contracts={sortedContracts} />
            },
            { value: 'photos', label: '사진',
              content: <VehiclePhotosTabSection vehicle={vehicle} contracts={sortedContracts} />
            },
          ]}
    />
  );
}

/* ─── 자산대장 (ERP 표준) — 취득가/감가/장부가/처분손익 ─── */
function AssetLedgerSection({ vehicle }: { vehicle: Vehicle }) {
  const entry = useMemo(() => computeAssetLedgerEntry(vehicle, todayKr()), [vehicle]);
  if (entry.incomplete) {
    return (
      <Section title="자산대장 (ERP 표준)">
        <div className="dim" style={{ fontSize: 12 }}>
          매입가·취득일이 입력되어야 감가·장부가가 자동 계산됩니다.
          <br />
          현재: 매입가 {entry.acquisitionCost ? `₩${entry.acquisitionCost.toLocaleString()}` : '-'} · 취득일 {entry.acquisitionDate || '-'}
        </div>
      </Section>
    );
  }
  const fmt = (v: number) => `₩${v.toLocaleString()}`;
  return (
    <Section title="자산대장 (ERP 표준)">
      <div className="dim" style={{ fontSize: 11, marginBottom: 6 }}>
        정액법 60개월 · 잔존가치 10% (회사·차종별 정책은 추후 마스터)
      </div>
      <Grid2>
        <KV k="취득가" v={fmt(entry.acquisitionCost)} mono />
        <KV k="취득일" v={entry.acquisitionDate} mono />
        <KV k="경과" v={`${entry.monthsHeld}개월`} mono />
        <KV k="잔존가치" v={fmt(entry.salvageValue)} mono />
        <KV k="누적 감가" v={<span style={{ color: 'var(--orange-text)' }}>{fmt(entry.accumulatedDepreciation)}</span>} mono />
        <KV k="장부가" v={<span style={{ color: 'var(--brand)', fontWeight: 600 }}>{fmt(entry.bookValue)}</span>} mono />
        {entry.disposed && (
          <>
            <KV k="매각일" v={entry.saleDate} mono />
            <KV k="매각가" v={entry.salePrice !== undefined ? fmt(entry.salePrice) : '-'} mono />
            <KV
              k="처분손익"
              v={entry.disposalGainLoss === undefined ? '-' : (
                <span style={{
                  color: entry.disposalGainLoss >= 0 ? 'var(--green-text)' : 'var(--red-text)',
                  fontWeight: 600,
                }}>
                  {entry.disposalGainLoss >= 0 ? '+' : ''}{fmt(entry.disposalGainLoss)}
                </span>
              )}
              mono
            />
          </>
        )}
      </Grid2>
    </Section>
  );
}

/* ─── 리스크 현황 탭 — 처리 상태 + 연락기록 + 발생 이력 + 사고·위반 ─── */
function RiskTab({
  vehicle, contracts, incidentHistory, allHistory,
}: { vehicle: Vehicle; contracts: Contract[]; incidentHistory: HistoryEntry[]; allHistory: HistoryEntry[] }) {
  const unpaidContracts = contracts.filter((c) => (c.unpaidAmount ?? 0) > 0);
  const totalUnpaid = unpaidContracts.reduce((s, c) => s + (c.unpaidAmount ?? 0), 0);
  const lockActive = contracts.some((c) => c.engineDisabled);
  const debtActive = contracts.some((c) => c.status === '채권');

  const contactHistory = allHistory.filter((h) => h.category === '연락기록');
  const riskHistory = allHistory.filter((h) =>
    ['분쟁', '클레임', '수납이슈', '법적조치'].includes(h.category as string)
  );

  return (
    <Stack>
      {/* 현재 처리 상태 */}
      <Section title="현재 처리 상태">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {totalUnpaid > 0 && <StatusBadge tone="red">미수 ₩{totalUnpaid.toLocaleString()}</StatusBadge>}
          {lockActive && <StatusBadge tone="red">시동제어</StatusBadge>}
          {debtActive && <StatusBadge tone="red">채권화</StatusBadge>}
          {totalUnpaid === 0 && !lockActive && !debtActive && <StatusBadge tone="green">정상</StatusBadge>}
        </div>
        <Grid2>
          <KV k="미수 계약" v={unpaidContracts.length > 0 ? `${unpaidContracts.length}건` : '없음'} />
          <KV k="누적 미수" v={totalUnpaid > 0 ? <span style={{ color: 'var(--red-text)' }}>₩{totalUnpaid.toLocaleString()}</span> : '없음'} mono />
          <KV k="시동제어" v={lockActive ? <StatusBadge tone="red">활성</StatusBadge> : <span className="dim">없음</span>} />
          <KV k="채권화 계약" v={debtActive ? '있음' : '없음'} />
        </Grid2>
      </Section>

      {/* 연락 기록 */}
      <Section title={`연락 기록 (${contactHistory.length})`}>
        {contactHistory.length === 0 ? (
          <div className="dim" style={{ fontSize: 12 }}>연락 기록 없음</div>
        ) : (
          <table className="table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ width: 100 }}>일자</th>
                <th style={{ width: 100 }}>방식</th>
                <th>내용</th>
              </tr>
            </thead>
            <tbody>
              {contactHistory.slice(0, 10).map((h) => (
                <tr key={h.id}>
                  <td className="mono dim">{h.date}</td>
                  <td className="dim">{h.title || '-'}</td>
                  <td>{h.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* 리스크 발생 이력 */}
      <Section title={`리스크 발생 이력 (${riskHistory.length})`}>
        {riskHistory.length === 0 ? (
          <div className="dim" style={{ fontSize: 12 }}>리스크 발생 이력 없음</div>
        ) : (
          <table className="table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ width: 100 }}>일자</th>
                <th style={{ width: 90 }}>구분</th>
                <th>제목</th>
                <th style={{ width: 70 }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {riskHistory.slice(0, 15).map((h) => (
                <tr key={h.id}>
                  <td className="mono dim">{h.date}</td>
                  <td className="dim">{h.category}</td>
                  <td>{h.title || '-'}</td>
                  <td className="dim">{h.status || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* 사고·위반 (기존 IncidentTab) */}
      <IncidentTab history={incidentHistory} />
    </Stack>
  );
}

/* ─── 자산 관리 탭 — 보험·검사 + 정비·수선 + 할부 (할부 맨 마지막) + 첨부 서류 ─── */
function AssetTab({
  vehicle, repairHistory, contracts,
}: { vehicle: Vehicle; repairHistory: HistoryEntry[]; contracts: Contract[] }) {
  return (
    <Stack>
      <ComplianceTab vehicle={vehicle} contracts={contracts} />
      <RepairHistoryTab history={repairHistory} />
      <LoanScheduleTab vehicle={vehicle} />
      <AttachmentSummary vehicle={vehicle} />
    </Stack>
  );
}

/* ─── 사진 탭 — 운영현황 패턴 (반납/인도전/상품화 3종 stack) ─── */
function VehiclePhotosTabSection({ vehicle, contracts }: { vehicle: Vehicle; contracts: Contract[] }) {
  // 활성 계약(운행/대기) 우선 — contractId 가 있으면 사진 메타에 함께 보존
  const active = contracts.find((c) => c.status === '운행' || c.status === '대기');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <VehiclePhotosByKind vehicleId={vehicle.id} kind="return"   contractId={active?.id} title="최근 반납 사진" readonly />
      <VehiclePhotosByKind vehicleId={vehicle.id} kind="delivery" contractId={active?.id} title="최근 인도전 사진" readonly />
      <VehiclePhotosByKind vehicleId={vehicle.id} kind="product"  contractId={active?.id} title="최근 상품화 사진" readonly />
    </div>
  );
}
