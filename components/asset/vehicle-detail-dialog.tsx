'use client';

/**
 * 자산(차량) 상세 다이얼로그 — 6탭 구성.
 *
 *  · 자산현황 view: 6탭 모두 (요약·할부·보험·계약이력·수납·정비)
 *  · 등록차량 view: 요약 탭 단일 (제조사 스펙 + 자등증 + 첨부)
 *
 *  탭 컴포넌트는 향후 별도 파일로 분할 예정 (vehicle-detail/tabs/*).
 *  공용 부품: COL/COL_FLEX (표 컬럼 width 토큰).
 */

import React, { useMemo, useState } from 'react';
import type { Vehicle, Contract, HistoryEntry, VehicleStatus, LoanRepaymentMethod } from '@/lib/types';
import { generateLoanSchedule, summarizeLoanSchedule, shouldReplaceLoanSchedule, buildLoanScheduleFromOcr, matchLoanPaymentsToWithdrawals } from '@/lib/loan-schedule-calc';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { simpleVehicleState } from '@/lib/vehicle-state';
import { nextTransitions, isItemSatisfied, isTransitionReady, transitionProgress } from '@/lib/vehicle-transitions';

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

/** 상태 전이 — 라이프사이클 자연 흐름. 클릭 시 confirm → vehicle.status update */
const NEXT_STATES: Record<VehicleStatus, VehicleStatus[]> = {
  '구매대기':   ['등록대기', '매각검토'],
  '등록대기':   ['상품화대기', '매각검토'],
  '상품화대기': ['상품화중'],
  '상품화중':   ['상품대기'],
  '상품대기':   ['재고', '인도대기'],
  '재고':       ['상품대기', '인도대기'],
  '인도대기':   ['운행'],
  '운행':       ['연장대기', '종료대기', '정비', '사고'],
  '연장대기':   ['운행', '종료대기'],
  '종료대기':   ['반납'],
  '반납':       ['휴차대기'],
  '휴차대기':   ['재고', '매각검토', '휴차'],
  '휴차':       ['재고', '매각검토'],
  '정비':       ['운행', '휴차'],
  '사고':       ['정비'],
  '매각검토':   ['매각대기'],
  '매각대기':   ['매각'],
  '매각':       [],
  '출고대기':   ['운행'],
  '임시배차':   ['운행'],
};
import { DetailDialogShell } from '@/components/ui/detail-dialog-shell';
import { AttachedFilePreview, FileLightbox } from '@/components/ui/attached-file-preview';
import { MissingBadge, MissingText } from '@/components/ui/missing-badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { showConfirm } from '@/lib/confirm';
import { toast } from '@/lib/toast';
import { Field } from '@/components/ui/editable-field';
import { InlineTextEdit } from '@/components/ui/inline-text-edit';
import { EmptyRow } from '@/components/ui/empty-row';
import { Section, Stack, Grid2 } from '@/components/ui/detail-primitives';
import { VehiclePhotosSection, VehiclePhotosByKind } from '@/components/vehicle-photos-section';
import { contractStatusTone, vehicleStatusTone } from '@/lib/status-tones';
import { markTerminated, revertToOperating } from '@/lib/contract-actions';
import { COL, COL_FLEX } from '@/lib/table-cols';
import { useCompanies } from '@/lib/firebase/companies-store';
import { displayCompanyName } from '@/lib/company-display';
import { computeAssetLedgerEntry } from '@/lib/asset-ledger';
import { todayKr } from '@/lib/mock-data';
import { addMonthsKeepDay } from '@/lib/payment-schedule';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useBankTx, useCardTx } from '@/lib/firebase/transactions-store';
import { PaymentTab as ContractPaymentTab } from '@/components/contract-detail-dialog';
import { CollectionStageProgress } from '@/components/risk-detail-dialog';
import { daysSince } from '@/lib/utils';

/** KV — 공용 Field wrap alias (시각 통일). */
function KV({ k, v, mono = false }: { k: string; v?: React.ReactNode; mono?: boolean }) {
  return <Field label={k} value={v == null || v === '' ? '-' : v} mono={mono} muted={v == null || v === ''} />;
}

/* ─── 자산현황 탭1: 운영 요약 — 한 화면 운영 상태 한눈에 ─── */
function OperationOverviewTab({
  vehicle, contracts, history, onUpdate,
}: {
  vehicle: Vehicle;
  contracts: Contract[];
  history: HistoryEntry[];
  onUpdate: (v: Vehicle) => void;
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
  // 자동차세
  const taxExpiry = activeContract?.vehicleTaxDueDate;
  const taxDaysLeft = taxExpiry ? Math.round((new Date(taxExpiry).getTime() - Date.now()) / 86400000) : null;
  // 시동제어
  const engineLocked = contracts.some((c) => c.engineDisabled);
  // 큰 이슈 수집 — 부각 카드용
  const issues: { tone: 'red' | 'orange'; label: string; value: string }[] = [];
  if (unpaid > 0) issues.push({ tone: 'red', label: '미수금', value: `₩${unpaid.toLocaleString()}` });
  if (engineLocked) issues.push({ tone: 'red', label: '시동제어', value: '활성' });
  if (insDaysLeft != null && insDaysLeft < 0) issues.push({ tone: 'red', label: '보험만기', value: `D+${Math.abs(insDaysLeft)} 경과` });
  else if (insDaysLeft != null && insDaysLeft < 30) issues.push({ tone: 'orange', label: '보험만기', value: `D-${insDaysLeft}` });
  if (inspectDaysLeft != null && inspectDaysLeft < 0) issues.push({ tone: 'red', label: '정기검사', value: `D+${Math.abs(inspectDaysLeft)} 경과` });
  else if (inspectDaysLeft != null && inspectDaysLeft < 30) issues.push({ tone: 'orange', label: '정기검사', value: `D-${inspectDaysLeft}` });
  if (taxDaysLeft != null && taxDaysLeft < 0) issues.push({ tone: 'red', label: '자동차세', value: `D+${Math.abs(taxDaysLeft)} 경과` });
  else if (taxDaysLeft != null && taxDaysLeft < 14) issues.push({ tone: 'orange', label: '자동차세', value: `D-${taxDaysLeft}` });
  if (!regOk && vehicle.status !== '구매대기') issues.push({ tone: 'orange', label: '자등증', value: '미입력' });

  // 가능한 다음 상태
  const nextStates = NEXT_STATES[vehicle.status as VehicleStatus] ?? [];

  async function changeStatus(next: VehicleStatus) {
    if (!await showConfirm({ title: `차량 상태를 [${vehicle.status}] → [${next}] 로 변경하시겠습니까?` })) return;
    // 매각 전환 시 saleDate stamp — 자산대장 감가 컷오프 (처분 페이지와 동일 규칙)
    const saleDate = next === '매각' && !vehicle.saleDate ? todayKr() : vehicle.saleDate;
    onUpdate({ ...vehicle, status: next, saleDate });
  }

  // 간편 상태(2축) + 체크리스트 게이팅 전이
  const simpleState = simpleVehicleState(vehicle.status as VehicleStatus, activeContract ?? null);
  const transitions = nextTransitions(vehicle.status as VehicleStatus);
  function toggleCheck(key: string) {
    const cur = vehicle.prepChecks ?? {};
    const nextChecks = { ...cur };
    if (nextChecks[key]) delete nextChecks[key];
    else nextChecks[key] = new Date().toISOString();
    onUpdate({ ...vehicle, prepChecks: nextChecks });
  }

  // 등록 체크리스트 — 각 단계별 prerequisites
  const checklist: { label: string; ok: boolean; hint?: string }[] = [
    { label: '자동차등록증 정보', ok: !!(vehicle.vin && vehicle.manufacturedDate), hint: 'VIN + 제작연월' },
    { label: '자동차등록증 첨부', ok: !!vehicle.registrationCertUrl },
    { label: '자동차보험 가입', ok: !!(vehicle.insuranceCompany && vehicle.insurancePolicyNo) },
    { label: '보험증권 첨부', ok: !!vehicle.insuranceCertUrl },
    { label: '할부 정보 입력', ok: !!(vehicle.loanCompany && vehicle.loanMonths), hint: '할부사 + 개월수' },
    { label: 'GPS 설치', ok: !!(vehicle.gpsProvider || vehicle.gpsDeviceId) },
  ];

  return (
    <Stack>
      {/* 큰 이슈 부각 — 있을 때만 빨강/주황 강조 카드 */}
      {issues.length > 0 && (
        <div style={{
          background: 'var(--red-bg)',
          border: '1px solid var(--red-text)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: 'var(--red-text)' }}>
            <span>즉시 처리 필요</span>
            <span style={{ fontSize: 10, color: 'var(--text-sub)', fontWeight: 500 }}>{issues.length}건</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {issues.map((it, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'baseline', gap: 4,
                fontSize: 11, padding: '3px 8px',
                background: it.tone === 'red' ? 'var(--red-text)' : 'var(--orange-text, #c2410c)',
                color: 'white', borderRadius: 'var(--radius-sm)',
              }}>
                <span style={{ fontWeight: 600 }}>{it.label}</span>
                <span className="mono" style={{ fontSize: 10, opacity: 0.95 }}>{it.value}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 차량 상태 + 다음 단계 chip — 클릭으로 진행 */}
      <Section title="차량 상태">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          <StatusBadge tone={simpleState.tone}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{simpleState.label}</span>
          </StatusBadge>
          <span style={{ fontSize: 10, color: 'var(--text-weak)' }} title="세부 상태(전이·이력용)">세부: {vehicle.status}</span>
          <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>
            {NEXT_ACTION[vehicle.status as VehicleStatus] ?? '-'}
          </span>
        </div>
        {transitions.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--text-weak)' }}>다음 단계로 — 준비 항목을 체크하면 활성화</span>
            {transitions.map((t) => {
              const prog = transitionProgress(t, vehicle, activeContract ?? null, vehicle.prepChecks);
              const ready = isTransitionReady(t, vehicle, activeContract ?? null, vehicle.prepChecks);
              return (
                <div key={t.to} style={{ border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-md)', padding: '8px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600 }}>{t.actionLabel}</span>
                    <span className="dim" style={{ fontSize: 10 }}>{prog.done}/{prog.total}</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={!ready}
                      onClick={() => void changeStatus(t.to)}
                      style={{ marginLeft: 'auto', fontSize: 11 }}
                      title={ready ? `[${t.to}] 로 변경` : '준비 항목을 모두 체크하세요'}
                    >
                      → {t.to}
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {t.checklist.map((item) => {
                      const auto = !!item.auto && item.auto(vehicle, activeContract ?? null);
                      const done = isItemSatisfied(item, vehicle, activeContract ?? null, vehicle.prepChecks);
                      return (
                        <label
                          key={item.key}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11,
                            padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                            background: done ? 'var(--green-bg)' : 'transparent',
                            color: done ? 'var(--green-text)' : 'var(--text)',
                            cursor: auto ? 'default' : 'pointer', opacity: auto && !done ? 0.6 : 1,
                          }}
                          title={auto ? (item.autoHint ?? '데이터로 자동 판정') : '클릭하여 체크'}
                        >
                          <input type="checkbox" checked={done} disabled={auto} onChange={() => toggleCheck(item.key)} />
                          {item.label}{auto && <span style={{ fontSize: 9 }}> (자동)</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : nextStates.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--text-weak)', marginRight: 2 }}>→ 다음:</span>
            {nextStates.map((s) => (
              <button key={s} type="button" className="btn btn-sm" onClick={() => changeStatus(s)} style={{ fontSize: 11 }} title={`상태 [${s}] 로 변경`}>{s}</button>
            ))}
          </div>
        ) : null}
        <Grid2>
          <KV k="회사" v={vehicle.company ? displayCompanyName(vehicle.company, companies) : undefined} />
          <KV k="활성 계약" v={activeContract ? (
            <span>{activeContract.contractNo ?? ''} · {activeContract.customerName ?? ''}</span>
          ) : <span className="dim">없음</span>} />
        </Grid2>
      </Section>

      {/* 등록 체크리스트 — 자등증/보험/할부/GPS 입력·첨부 상태 */}
      <Section title="등록 체크리스트">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {checklist.map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12, padding: '4px 0',
            }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 16, height: 16, borderRadius: 3,
                border: `1px solid ${item.ok ? 'var(--green-text)' : 'var(--border)'}`,
                background: item.ok ? 'var(--green-bg)' : 'transparent',
                color: item.ok ? 'var(--green-text)' : 'var(--text-weak)',
                fontSize: 10, fontWeight: 700,
              }}>{item.ok ? '✓' : ''}</span>
              <span style={{ color: item.ok ? undefined : 'var(--text-sub)' }}>{item.label}</span>
              {item.hint && <span className="dim" style={{ fontSize: 10 }}>({item.hint})</span>}
            </div>
          ))}
        </div>
      </Section>

      <Section title="등록 상태">
        <Grid2>
          <KV k="자등증 입력" v={regOk ? <StatusBadge tone="green">완료</StatusBadge> : <MissingBadge />} />
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

      <AssetLedgerSection vehicle={vehicle} onUpdate={onUpdate} />

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
  const [backing, setBacking] = useState(false);

  // Drive 미러 백업 — Firebase 가 원본, Google 공유드라이브에 백업본. 실패해도 ERP 흐름 무관(non-blocking).
  async function handleDriveBackup(attachedCount: number) {
    if (attachedCount === 0) { toast.info('백업할 첨부 파일이 없습니다'); return; }
    setBacking(true);
    try {
      const { getCurrentIdToken } = await import('@/lib/firebase/client');
      const idToken = await getCurrentIdToken();
      if (!idToken) { toast.error('로그인 세션 만료 — 다시 로그인해주세요'); return; }
      const { driveMirrorVehicleDocs } = await import('@/lib/google/drive-mirror');
      const { uploaded, failed, details } = await driveMirrorVehicleDocs({
        vehicle,
        companyName: vehicle.company ?? '미상',
        idToken,
      });
      if (uploaded > 0 && failed === 0) toast.success(`Drive 백업 완료 — ${uploaded}건`);
      else if (uploaded > 0) toast.info(`${uploaded}건 백업, ${failed}건 실패`);
      else {
        const firstErr = details.find((d) => !d.result.ok)?.result.error ?? '실패';
        toast.error(`Drive 백업 실패: ${firstErr}`);
      }
    } catch (e) {
      toast.error(`Drive 백업 오류: ${(e as Error).message ?? String(e)}`);
    } finally {
      setBacking(false);
    }
  }

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
      <div style={{ marginBottom: 8, fontSize: 11, color: 'var(--text-sub)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>등록 완료 <strong style={{ color: 'var(--brand)' }}>{attached}</strong> / {items.length}</span>
        <button
          className="btn btn-sm"
          type="button"
          onClick={() => handleDriveBackup(attached)}
          disabled={backing || attached === 0}
          style={{ marginLeft: 'auto' }}
          title="첨부 서류를 Google Drive 공유드라이브에 미러 백업 (Firebase가 원본, Drive는 백업본)"
        >
          {backing ? '백업 중…' : 'Drive 백업'}
        </button>
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
  const { companies } = useCompanies();
  const [certOpen, setCertOpen] = useState(false);
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

      {showAttachment && (vehicle.manufacturerQuoteUrl || vehicle.purchaseOrderUrl) && (
        <>
          <AttachedFilePreview
            title="제조사 견적서"
            url={vehicle.manufacturerQuoteUrl}
            fileName={vehicle.manufacturerQuoteFileName}
            uploadedAt={vehicle.manufacturerQuoteUploadedAt}
          />
          <AttachedFilePreview
            title="발주서"
            url={vehicle.purchaseOrderUrl}
            fileName={vehicle.purchaseOrderFileName}
            uploadedAt={vehicle.purchaseOrderUploadedAt}
          />
        </>
      )}

      <Section
        title="자동차등록증 정보"
        action={showAttachment && vehicle.registrationCertUrl ? (
          <button
            type="button"
            onClick={() => setCertOpen(true)}
            title="클릭하면 원본 확대"
            style={{
              marginLeft: 'auto',
              background: 'transparent', border: 0, padding: 0,
              color: 'var(--brand)', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, textDecoration: 'underline',
            }}
          >
            {vehicle.registrationCertFileName || '원본 보기'}
          </button>
        ) : undefined}
      >
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
          {/* 사용본거지 — 인라인 클릭 편집 (자주 변경, 트렌드 UX) */}
          <Field label="사용본거지" value={
            <InlineTextEdit
              value={vehicle.garage}
              onSave={(v) => onUpdate({ ...vehicle, garage: v || undefined })}
              placeholder="-"
            />
          } />
          <KV k="매입일" v={vehicle.purchasedDate} mono />
          <KV k="매입가" v={vehicle.purchasePrice ? `₩${vehicle.purchasePrice.toLocaleString()}` : undefined} mono />
        </Grid2>
      </Section>

      <FileLightbox
        url={vehicle.registrationCertUrl}
        fileName={vehicle.registrationCertFileName}
        title="자동차등록증"
        open={certOpen}
        onClose={() => setCertOpen(false)}
      />

      {/* 차량 마스터 관리 정보 (주행·검사·세금) — 계약 무관 추적 */}
      <VehicleTrackingSection vehicle={vehicle} onUpdate={onUpdate} />

      {/* 비고 — 인라인 즉시 편집 (직원이 차량별 메모·발주처·특이사항 입력) */}
      <Section title="비고">
        <InlineTextEdit
          value={vehicle.notes}
          onSave={(v) => onUpdate({ ...vehicle, notes: v || undefined })}
          placeholder="차량 메모 없음 — 클릭하여 입력"
          multiline rows={3}
        />
      </Section>
    </Stack>
  );
}

/* ─── 탭2: 할부스케줄 ─── */
function LoanScheduleTab({ vehicle, onUpdate }: { vehicle: Vehicle; onUpdate: (v: Vehicle) => void }) {
  const schedule = vehicle.loanSchedule ?? [];
  const hasSchedule = schedule.length > 0;
  const source = vehicle.loanScheduleSource;
  const today = todayKr();

  // 생성 폼 — 차량에 값 있으면 프리필. 표 없어도 원금·금리·기간으로 생성 가능.
  const [principal, setPrincipal] = useState(String(vehicle.loanPrincipal ?? vehicle.purchasePrice ?? ''));
  const [ratePct, setRatePct] = useState(String(vehicle.loanInterestRate ?? ''));
  const [months, setMonths] = useState(String(vehicle.loanMonths ?? ''));
  const [start, setStart] = useState(vehicle.loanStartDate ?? '');
  const [method, setMethod] = useState<LoanRepaymentMethod>(vehicle.loanMethod ?? '원리금균등');
  const [note, setNote] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { rows: bankTx } = useBankTx();

  const genValid = Number(principal) > 0 && Number(ratePct) >= 0 && Number(months) > 0 && !!start;
  const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: 'var(--text-weak)' };

  function handleGenerate() {
    setNote(null);
    if (!genValid) { setNote('원금·연이율·기간·개시일을 입력하세요.'); return; }
    // 업로드(OCR) 상환표가 우선 — 생성값이 덮지 않음
    if (!shouldReplaceLoanSchedule(source, 'generated')) {
      setNote('업로드된 상환표가 우선 적용 중입니다 — 생성값으로 대체하지 않았습니다. (대체하려면 업로드본을 먼저 제거)');
      return;
    }
    const g = generateLoanSchedule({ principal: Number(principal), annualRatePct: Number(ratePct), months: Number(months), startDate: start, method });
    onUpdate({
      ...vehicle,
      loanSchedule: g.rows, loanScheduleSource: 'generated',
      loanPrincipal: g.principal, loanInterestRate: Number(ratePct), loanMonths: g.months,
      loanStartDate: start, loanMethod: method,
      loanMonthlyPayment: g.monthlyPayment, loanTotalRepayment: g.totalRepayment,
      loanRemainingPrincipal: vehicle.loanRemainingPrincipal ?? g.principal,
    });
    setNote(`생성 완료 — ${g.months}회차, 월불입 ₩${g.monthlyPayment.toLocaleString()}, 총이자 ₩${g.totalInterest.toLocaleString()}`);
  }

  // 상환스케줄표 PDF/이미지 업로드 → OCR(loan_schedule) → 저장(업로드 우선)
  async function handleUploadSchedule(file: File) {
    setNote(null); setUploading(true);
    try {
      const user = getFirebaseAuth()?.currentUser;
      if (!user) { setNote('로그인이 필요합니다.'); return; }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'loan_schedule');
      const res = await fetch('/api/ocr/extract', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` }, body: fd });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'OCR 실패');
      const raw = json.extracted as Record<string, unknown>;
      const rows = buildLoanScheduleFromOcr(raw);
      if (!rows.length) { setNote('상환표 회차를 못 읽었습니다 — 파일을 확인하세요.'); return; }
      const n = (k: string) => { const v = raw[k]; const x = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[,\s]/g, '')); return Number.isFinite(x) && x > 0 ? x : undefined; };
      onUpdate({
        ...vehicle,
        loanSchedule: rows, loanScheduleSource: 'uploaded', // 업로드본 우선
        loanCompany: (raw.loan_company as string) || vehicle.loanCompany,
        loanContractNo: (raw.contract_no as string) || vehicle.loanContractNo,
        loanMonths: n('months') ?? rows.length,
        loanPrincipal: n('principal') ?? n('acquisition_cost') ?? vehicle.loanPrincipal,
        loanTotalRepayment: n('total_repayment') ?? vehicle.loanTotalRepayment,
        loanMonthlyPayment: n('monthly_payment') ?? rows[0]?.payment ?? vehicle.loanMonthlyPayment,
      });
      setNote(`업로드 완료 — ${rows.length}회차 (업로드 상환표 우선 적용)`);
    } catch (e) {
      setNote('업로드 실패: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setUploading(false);
    }
  }

  // 각 회차 월불입금 ↔ 은행 출금 매칭(자금 연결) — matchedTxId/paidDate 저장
  function handleMatchPayments() {
    if (!hasSchedule) return;
    const m = matchLoanPaymentsToWithdrawals(schedule, bankTx);
    onUpdate({ ...vehicle, loanSchedule: m.rows });
    setNote(`출금 매칭 — ${m.matchedCount}/${schedule.length}회차 납입확인(은행 출금과 대사)`);
  }

  const sum = hasSchedule ? summarizeLoanSchedule(schedule) : null;

  return (
    <Stack>
      <Section
        title="할부/리스 개요"
        action={source && (
          <span style={{ marginLeft: 'auto', fontSize: 10, padding: '1px 7px', borderRadius: 'var(--radius-sm)',
            background: source === 'uploaded' ? 'var(--green-bg)' : 'var(--brand-bg)',
            color: source === 'uploaded' ? 'var(--green-text)' : 'var(--brand)' }}>
            {source === 'uploaded' ? '업로드 상환표(우선)' : '생성 상환표'}
          </span>
        )}
      >
        <Grid2>
          <KV k="금융사" v={vehicle.loanCompany || '-'} />
          <KV k="상환방식" v={vehicle.loanMethod || '-'} />
          <KV k="기간" v={vehicle.loanMonths ? `${vehicle.loanMonths}개월` : '-'} />
          <KV k="개시일" v={vehicle.loanStartDate || '-'} mono />
          <KV k="대출원금" v={vehicle.loanPrincipal != null ? `₩${vehicle.loanPrincipal.toLocaleString()}` : '-'} mono />
          <KV k="월불입금" v={vehicle.loanMonthlyPayment != null ? `₩${vehicle.loanMonthlyPayment.toLocaleString()}` : '-'} mono />
          {sum && <KV k="총상환(원금+이자)" v={`₩${sum.paymentSum.toLocaleString()}`} mono />}
          {sum && <KV k="총이자(금융비용)" v={`₩${sum.interestSum.toLocaleString()}`} mono />}
        </Grid2>
      </Section>

      <Section title="상환표 생성 — 표 없이 원금·금리·기간으로">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', padding: '2px 0' }}>
          <label style={fieldStyle}>원금(원)<input className="input input-compact mono" type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} style={{ width: 130 }} /></label>
          <label style={fieldStyle}>연이율(%)<input className="input input-compact mono" type="number" step="0.1" value={ratePct} onChange={(e) => setRatePct(e.target.value)} style={{ width: 74 }} /></label>
          <label style={fieldStyle}>기간(개월)<input className="input input-compact mono" type="number" value={months} onChange={(e) => setMonths(e.target.value)} style={{ width: 74 }} /></label>
          <label style={fieldStyle}>개시일<input className="input input-compact mono" type="date" value={start} onChange={(e) => setStart(e.target.value)} style={{ width: 140 }} /></label>
          <label style={fieldStyle}>방식
            <select className="input input-compact" value={method} onChange={(e) => setMethod(e.target.value as LoanRepaymentMethod)}>
              <option value="원리금균등">원리금균등</option>
              <option value="원금균등">원금균등</option>
              <option value="만기일시">만기일시</option>
            </select>
          </label>
          <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={!genValid}>스케줄 생성</button>
        </div>
        {note && <div style={{ fontSize: 11, color: 'var(--text-weak)', paddingTop: 6 }}>{note}</div>}
      </Section>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label className="btn btn-sm" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
          {uploading ? '읽는 중…' : '상환스케줄표 업로드(OCR)'}
          <input
            type="file"
            accept="application/pdf,image/*"
            hidden
            disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUploadSchedule(f); e.currentTarget.value = ''; }}
          />
        </label>
        {hasSchedule && <button type="button" className="btn btn-sm" onClick={handleMatchPayments}>출금 매칭</button>}
        <span className="dim" style={{ fontSize: 11 }}>업로드 상환표는 생성값보다 우선 · 출금 매칭 = 각 회차↔은행 출금 대사</span>
      </div>

      <Section title="회차별 상환표" bodyPadding={0}>
        <table className="table">
          <thead>
            <tr>
              <th className="num" style={{ width: COL.cycle }}>회차</th>
              <th style={{ width: 96 }}>예정일</th>
              <th className="num" style={{ width: COL.money }}>원금</th>
              <th className="num" style={{ width: COL.money }}>이자</th>
              <th className="num" style={{ width: COL.money }}>월불입금</th>
              <th className="num" style={{ width: COL.money }}>미회수원금</th>
              <th className="center" style={{ width: COL.status }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {!hasSchedule && <EmptyRow colSpan={7}>상환표 없음 — 위에서 생성하거나 상환스케줄표를 업로드하세요</EmptyRow>}
            {schedule.map((r) => {
              const passed = !!r.dueDate && r.dueDate <= today;
              return (
                <tr key={r.seq}>
                  <td className="num mono">{r.seq}</td>
                  <td className="mono">{r.dueDate || '-'}</td>
                  <td className="num mono">₩{(r.principal ?? 0).toLocaleString()}</td>
                  <td className="num mono dim">₩{(r.interest ?? 0).toLocaleString()}</td>
                  <td className="num mono">₩{(r.payment ?? 0).toLocaleString()}</td>
                  <td className="num mono dim">₩{(r.remainingPrincipal ?? 0).toLocaleString()}</td>
                  <td className="center">
                    {r.matchedTxId
                      ? <StatusBadge tone="green">납입확인</StatusBadge>
                      : passed ? <StatusBadge tone="gray">예정경과</StatusBadge> : <StatusBadge tone="gray">예정</StatusBadge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-weak)', borderTop: '1px solid var(--border-soft)' }}>
          ※ 원금=부채상환, 이자=금융비용(회계 분리). 실 납입은 은행 출금 매칭으로 자동 확정(납입확인).
        </div>
      </Section>
      <AttachedFilePreview
        title="원본 할부계약서/상환표"
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
function ContractListTab({ contracts, onUpdateContract }: { contracts: Contract[]; onUpdateContract?: (c: Contract) => void }) {
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
              <th style={{ width: COL.contractNo }}>계약번호</th>
              <th style={{ width: COL.date }}>계약일</th>
              <th style={{ width: COL.date }}>종료일</th>
              <th style={{ width: COL.date }} title="고객 미납 등으로 차량을 회수한 날짜 — 수기 입력 시 계약이 해지 처리됨">회수일</th>
              <th style={COL_FLEX.customer}>계약자</th>
              <th className="center" style={{ width: COL.term }}>약정</th>
              <th className="num" style={{ width: COL.money }}>월대여료</th>
              <th className="num" style={{ width: COL.money }}>보증금</th>
              <th className="center" style={{ width: 90 }}>계약서</th>
              <th className="center" style={{ width: COL.status }}>상태</th>
              <th style={{ width: 130 }}>종료</th>
            </tr>
          </thead>
          <tbody>
            {isEmpty ? (
              <EmptyRow colSpan={11}>계약 이력 없음</EmptyRow>
            ) : contracts.map((c) => {
              const isActive = c.status === '운행' || c.status === '대기';
              return (
              <tr key={c.id} style={isActive ? { background: 'var(--brand-bg)' } : undefined}>
                <td className="mono dim">{c.contractNo || <span className="muted">-</span>}</td>
                <td className="mono">{c.contractDate}</td>
                <td className="mono dim">{c.returnScheduledDate || <span className="muted">-</span>}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    type="date"
                    className="input-compact"
                    value={c.returnedDate ?? ''}
                    disabled={!onUpdateContract}
                    onChange={(e) => {
                      if (!onUpdateContract) return;
                      const date = e.target.value;
                      onUpdateContract(date ? markTerminated(c, date) : revertToOperating(c));
                    }}
                    style={{ width: 116, fontSize: 11 }}
                    title="입력하면 계약이 해지 처리되고, 비우면 운행으로 되돌립니다"
                  />
                </td>
                <td>
                  {isActive && (
                    <span style={{
                      fontSize: 9, fontWeight: 700,
                      padding: '1px 6px', marginRight: 4,
                      background: 'var(--brand)', color: 'white',
                      borderRadius: 'var(--radius-sm)',
                    }}>현재</span>
                  )}
                  {c.customerName || <span className="muted">-</span>}
                </td>
                <td className="center mono dim">{c.termMonths ? `${c.termMonths}개월` : <span className="muted">-</span>}</td>
                <td className="num mono">{c.monthlyRent ? `₩${c.monthlyRent.toLocaleString()}` : <span className="muted">-</span>}</td>
                <td className="num mono">{c.deposit ? `₩${c.deposit.toLocaleString()}` : <span className="muted">-</span>}</td>
                <td className="center">
                  {c.contractDocUrl ? (
                    <a
                      href={c.contractDocUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--brand)', fontSize: 11, textDecoration: 'none' }}
                      title={c.contractDocFileName ?? '계약서 다운로드'}
                    >
                      열기 →
                    </a>
                  ) : (
                    <span className="muted" style={{ fontSize: 11 }}>미첨부</span>
                  )}
                </td>
                <td className="center"><StatusBadge tone={contractStatusTone(c.status)}>{c.status}</StatusBadge></td>
                <td>
                  {isActive ? (
                    <span className="dim" style={{ fontSize: 11 }}>진행중</span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, fontSize: 11 }}>
                      <span style={{
                        color: c.endReason === '정상종료' ? 'var(--green-text)'
                          : c.endReason === '중도해지' ? 'var(--orange-text)'
                          : c.endReason === '채권보전' ? 'var(--red-text)'
                          : 'var(--text-sub)',
                        fontWeight: 600,
                      }}>
                        {c.endReason ?? c.status}
                      </span>
                      {c.endedAt && <span className="dim mono" style={{ fontSize: 10 }}>{c.endedAt}</span>}
                      {(c.unpaidAtEnd ?? 0) > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--red-text)' }}>
                          미수 ₩{(c.unpaidAtEnd ?? 0).toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
            })}
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
  vehicle, history, contracts, view, onUpdate, onUpdateContract, onClose, onEdit, initialTab,
}: {
  vehicle: Vehicle;
  history: HistoryEntry[];
  contracts: Contract[];
  view: 'status' | 'registered';
  onUpdate: (v: Vehicle) => void;
  /** 회수일 수기 입력 등 — 계약 이력에서 직접 계약 수정 */
  onUpdateContract?: (c: Contract) => void;
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
              content: <OperationOverviewTab vehicle={vehicle} contracts={sortedContracts} history={sortedHistory} onUpdate={onUpdate} />
            },
            { value: 'risk', label: `리스크 현황${incidentHistory.length > 0 ? ` (${incidentHistory.length})` : ''}`,
              content: <RiskTab vehicle={vehicle} contracts={sortedContracts} incidentHistory={incidentHistory} allHistory={sortedHistory} />
            },
            { value: 'asset', label: '자산 관리',
              content: <AssetTab vehicle={vehicle} repairHistory={repairHistory} contracts={sortedContracts} onUpdate={onUpdate} />
            },
            { value: 'contract', label: `계약 관리${sortedContracts.length > 0 ? ` (${sortedContracts.length})` : ''}`,
              content: <ContractListTab contracts={sortedContracts} onUpdateContract={onUpdateContract} />
            },
            { value: 'payment', label: '수납 관리',
              content: <PaymentManagementTab contracts={sortedContracts} />
            },
            { value: 'photos', label: '사진',
              content: <VehiclePhotosTabSection vehicle={vehicle} contracts={sortedContracts} />
            },
          ]}
    />
  );
}

/* ─── 자산대장 (ERP 표준) — 취득가/감가/장부가/처분손익 ─── */
function AssetLedgerSection({ vehicle, onUpdate }: { vehicle: Vehicle; onUpdate: (v: Vehicle) => void }) {
  const entry = useMemo(() => computeAssetLedgerEntry(vehicle, todayKr()), [vehicle]);
  const [editingSale, setEditingSale] = useState(false);
  const [saleDraft, setSaleDraft] = useState('');
  // 매각가 입력 — 처분손익(매각가-장부가) 계산의 유일한 미싱 인풋. 저장 시 saleDate 없으면 오늘로 스탬프.
  function commitSale() {
    const n = Number(saleDraft.replace(/[,\s₩]/g, ''));
    if (!Number.isFinite(n) || n < 0) { toast.error('매각가는 0 이상 숫자로 입력하세요'); return; }
    onUpdate({ ...vehicle, salePrice: n, saleDate: vehicle.saleDate ?? todayKr() });
    setEditingSale(false);
    toast.success(`매각가 ₩${n.toLocaleString()} 저장`);
  }
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
            <KV k="매각가" v={
              editingSale ? (
                <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  <input
                    type="number" className="input" autoFocus value={saleDraft}
                    style={{ width: 110, fontSize: 12, padding: '2px 6px' }}
                    onChange={(e) => setSaleDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitSale(); if (e.key === 'Escape') setEditingSale(false); }}
                  />
                  <button className="btn btn-sm btn-primary" type="button" onClick={commitSale}>저장</button>
                  <button className="btn btn-sm" type="button" onClick={() => setEditingSale(false)}>취소</button>
                </span>
              ) : (
                <span
                  style={{ cursor: 'pointer', textDecoration: entry.salePrice === undefined ? 'underline dotted' : undefined }}
                  title="클릭하여 매각가 입력 (처분손익 계산)"
                  onClick={() => { setSaleDraft(entry.salePrice !== undefined ? String(entry.salePrice) : ''); setEditingSale(true); }}
                >
                  {entry.salePrice !== undefined ? fmt(entry.salePrice) : <span className="dim">입력 →</span>}
                </span>
              )
            } mono />
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

/* ─── 차량 마스터 관리 정보 (주행·검사·세금) — 계약 무관, 무계약 차량도 추적 ─── */
function VehicleTrackingSection({ vehicle, onUpdate }: { vehicle: Vehicle; onUpdate: (v: Vehicle) => void }) {
  const today = todayKr();
  function dueBadge(due?: string) {
    if (!due) return null;
    const days = Math.round((new Date(due).getTime() - new Date(today).getTime()) / 86400000);
    if (!Number.isFinite(days)) return null;
    if (days < 0) return <StatusBadge tone="red">경과 {-days}일</StatusBadge>;
    if (days <= 30) return <StatusBadge tone="orange">D-{days}</StatusBadge>;
    return null;
  }
  function dateField(label: string, key: 'inspectionDueDate' | 'vehicleTaxDueDate') {
    return (
      <Field label={label} value={
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <InlineTextEdit value={vehicle[key]} onSave={(v) => onUpdate({ ...vehicle, [key]: v.trim() || undefined })} placeholder="YYYY-MM-DD" />
          {dueBadge(vehicle[key])}
        </span>
      } />
    );
  }
  return (
    <Section title="차량 관리 (주행·검사·세금)">
      <div className="dim" style={{ fontSize: 11, marginBottom: 6 }}>
        계약과 무관하게 차량 마스터에 기록 — 재고·휴차·상품화중(무계약) 차량도 검사·세금·주행 추적.
      </div>
      <Grid2>
        <Field label="현재 주행거리(km)" value={
          <InlineTextEdit
            value={vehicle.currentMileage !== undefined ? vehicle.currentMileage.toLocaleString() : ''}
            onSave={(v) => {
              const n = v.replace(/[,\s]/g, '');
              if (n === '') { onUpdate({ ...vehicle, currentMileage: undefined }); return; }
              const num = Number(n);
              if (Number.isFinite(num) && num >= 0) onUpdate({ ...vehicle, currentMileage: num });
            }}
            placeholder="-"
          />
        } />
        {dateField('정기검사 만기', 'inspectionDueDate')}
        {dateField('자동차세 납부일', 'vehicleTaxDueDate')}
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

  const today = todayKr();
  // 채권화 진행 단계 표시 대상: 미수 있거나 채권 상태인 계약 (운행/채권 우선)
  const stageContracts = contracts
    .filter((c) => (c.unpaidAmount ?? 0) > 0 || c.status === '채권' || c.engineDisabled)
    .slice(0, 3);

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

      {/* 채권화 진행 단계 — 미수/채권/시동제어 계약별로 표시 */}
      {stageContracts.length > 0 && (
        <Section title="채권화 진행 단계">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stageContracts.map((c) => {
              const overdueSched = (c.schedules ?? []).filter((s) => s.status === '연체' || s.status === '부분납');
              const overdueDays = overdueSched.length === 0
                ? 0
                : daysSince(overdueSched.map((s) => s.dueDate).sort()[0], today);
              return (
                <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11 }}>
                    <span>
                      <span className="mono">{c.contractNo ?? c.id}</span>
                      <span className="dim" style={{ marginLeft: 6 }}>{c.customerName ?? '-'}</span>
                    </span>
                    <span className="dim mono" style={{ fontSize: 10 }}>
                      D+{overdueDays} · 미수 ₩{(c.unpaidAmount ?? 0).toLocaleString()} · 미납 {c.unpaidSeqCount ?? 0}회
                    </span>
                  </div>
                  <CollectionStageProgress contract={c} overdueDays={overdueDays} />
                </div>
              );
            })}
          </div>
        </Section>
      )}

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

/* ─── 자산 관리 탭 — 제조사스펙+등록증 → 보험·검사 → 정비 → 할부 → 기타첨부 ─── */
function AssetTab({
  vehicle, repairHistory, contracts, onUpdate,
}: { vehicle: Vehicle; repairHistory: HistoryEntry[]; contracts: Contract[]; onUpdate: (v: Vehicle) => void }) {
  // 인라인 첨부 외 GPS·매도증 같은 기타 항목만 표시 (이미 각 섹션 inline 처리됨)
  const hasOrphanAttachment = !!(vehicle.gpsInstallUrl || vehicle.disposalCertUrl);
  return (
    <Stack>
      <SummaryTab vehicle={vehicle} onUpdate={onUpdate} showAttachment />
      <ComplianceTab vehicle={vehicle} contracts={contracts} />
      <RepairHistoryTab history={repairHistory} />
      <OperatingCostSection vehicle={vehicle} contracts={contracts} repairHistory={repairHistory} />
      <LoanScheduleTab vehicle={vehicle} onUpdate={onUpdate} />
      {hasOrphanAttachment && (
        <>
          <AttachedFilePreview
            title="GPS 설치 증빙"
            url={vehicle.gpsInstallUrl}
            fileName={vehicle.gpsInstallFileName}
            uploadedAt={vehicle.gpsInstallUploadedAt}
          />
          <AttachedFilePreview
            title="매도증·매각계약서"
            url={vehicle.disposalCertUrl}
            fileName={vehicle.disposalCertFileName}
            uploadedAt={vehicle.disposalCertUploadedAt}
          />
        </>
      )}
    </Stack>
  );
}

/* ─── 누적 운영비 — 이 차량에 귀속된 카드 지출 + 계좌 출금 + History cost 합산 ─── */
function OperatingCostSection({
  vehicle, contracts, repairHistory,
}: { vehicle: Vehicle; contracts: Contract[]; repairHistory: HistoryEntry[] }) {
  const { rows: bankTx } = useBankTx();
  const { rows: cardTx } = useCardTx();
  // plate (현행 + plateHistory) 모두 매칭
  const plates = new Set<string>([vehicle.plate, ...(vehicle.plateHistory ?? [])].filter(Boolean));
  const contractIds = new Set(contracts.map((c) => c.id));

  // 법인카드 — linkedVehiclePlate 가 이 차량인 것
  const corpCards = cardTx.filter((t) => t.kind === '법인카드' && t.linkedVehiclePlate && plates.has(t.linkedVehiclePlate));
  const corpSum = corpCards.reduce((s, t) => s + (t.amount ?? 0), 0);
  // 계좌 출금 — linkedVehiclePlate 이 이 차량 OR 매칭된 계약이 이 차량 OR linkedCustomerName 으로 차량 표시
  const bankOuts = bankTx.filter((t) => {
    if (!(t.withdraw ?? 0)) return false;
    if (t.linkedVehiclePlate && plates.has(t.linkedVehiclePlate)) return true;
    if (t.matchedContractId && contractIds.has(t.matchedContractId)) return true;
    return false;
  });
  const bankSum = bankOuts.reduce((s, t) => s + (t.withdraw ?? 0), 0);
  // 정비·검사·사고 cost (HistoryEntry)
  const histCostEntries = repairHistory.filter((h) => (h.cost ?? 0) > 0);
  const histSum = histCostEntries.reduce((s, h) => s + (h.cost ?? 0), 0);

  // 카테고리 분류 (법인카드 카테고리 기준)
  const byCategory = new Map<string, { count: number; sum: number }>();
  for (const t of corpCards) {
    const cat = t.category || '미분류';
    const cur = byCategory.get(cat) ?? { count: 0, sum: 0 };
    cur.count += 1;
    cur.sum += t.amount ?? 0;
    byCategory.set(cat, cur);
  }
  const categories = Array.from(byCategory.entries()).sort((a, b) => b[1].sum - a[1].sum);

  const totalSum = corpSum + bankSum + histSum;
  if (totalSum === 0) {
    return (
      <Section title="누적 운영비">
        <div className="dim" style={{ fontSize: 12, padding: 8 }}>
          이 차량에 귀속된 지출 없음 — 자금일보에서 차량번호 입력 시 자동 집계
        </div>
      </Section>
    );
  }
  return (
    <Section title={`누적 운영비 — 합계 ₩${totalSum.toLocaleString()}`}>
      <Grid2>
        <KV k="법인카드" v={corpCards.length > 0 ? `${corpCards.length}건 · ₩${corpSum.toLocaleString()}` : '없음'} mono />
        <KV k="계좌 출금" v={bankOuts.length > 0 ? `${bankOuts.length}건 · ₩${bankSum.toLocaleString()}` : '없음'} mono />
        <KV k="정비·검사 비용" v={histCostEntries.length > 0 ? `${histCostEntries.length}건 · ₩${histSum.toLocaleString()}` : '없음'} mono />
        <KV k="자료 기간" v={`${corpCards.length + bankOuts.length + histCostEntries.length}건 누적`} />
      </Grid2>
      {categories.length > 0 && (
        <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--bg-soft)', borderRadius: 'var(--radius-md)', fontSize: 11 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>법인카드 카테고리별</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {categories.map(([cat, { count, sum }]) => (
              <span key={cat} className="mono">
                {cat} <span className="dim">{count}건</span> ₩{sum.toLocaleString()}
              </span>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

/* ─── 수납 관리 탭 — 활성 계약 = 입력 가능 PaymentTab, 종료 계약 = read-only 이력 ─── */
function PaymentManagementTab({ contracts }: { contracts: Contract[] }) {
  const { update: updateContract } = useContracts();
  const active = contracts.find((c) => c.status === '운행' || c.status === '대기');
  const ended = contracts.filter((c) => c !== active);
  return (
    <Stack>
      {active ? (
        <Section title={`현재 계약 수납 — ${active.customerName ?? ''} ${active.contractNo ?? ''}`}>
          <ContractPaymentTab c={active} onUpdate={(u) => void updateContract(u)} />
        </Section>
      ) : (
        <Section title="현재 계약 수납">
          <div className="dim" style={{ fontSize: 12, padding: 8 }}>활성 계약 없음</div>
        </Section>
      )}
      {ended.length > 0 && (
        <Section title={`이전 계약 수납 이력 (${ended.length})`}>
          <PaymentHistoryTab contracts={ended} />
        </Section>
      )}
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
