'use client';

/**
 * 보험증권 상세 다이얼로그 — 증권에 적힌 정보 거의 그대로 반영.
 *
 *  · 보험사·상품·증권번호·계약자·피보험자·사업자번호
 *  · 보험기간·운전자 조건
 *  · 차량 사항 (차명·차대번호·연식·차종·배기량·정원·차량가액·부속품)
 *  · 가입담보/보상한도 (대인Ⅰ·대인Ⅱ·대물·자손·무보험·자차·긴급출동)
 *  · 보험료 (납입한·총·1~6회차)
 *  · 분납 자동이체 (은행·계좌·예금주)
 */

import { DetailDialogShell } from '@/components/ui/detail-dialog-shell';
import type { InsurancePolicy, Vehicle, Contract } from '@/lib/types';
import { daysToExpiry, installmentSum, installmentMatchesTotal } from '@/lib/insurance-calc';
import { displayCompanyName } from '@/lib/company-display';
import { Warning } from '@phosphor-icons/react';

type CompanyMaster = Parameters<typeof displayCompanyName>[1];

const fmt = (n: number | undefined | null): string =>
  n == null ? '-' : `₩${n.toLocaleString('ko-KR')}`;

export function InsuranceDetailDialog({
  open, onOpenChange, vehicle, policy, contract, companyMaster,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vehicle: Vehicle | null;
  policy: InsurancePolicy | undefined | null;
  contract?: Contract | undefined;
  companyMaster: CompanyMaster;
}) {
  if (!vehicle) return null;

  const days = policy ? daysToExpiry(policy) : null;
  const totalMatch = policy ? installmentMatchesTotal(policy) : true;
  const totalSum = policy ? installmentSum(policy) : 0;

  return (
    <DetailDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={`보험증권 상세 — ${vehicle.plate ?? '미정'} ${policy?.insurer ?? ''}`}
      heroName={policy?.insurer ?? vehicle.insuranceCompany ?? '보험증권 미등록'}
      heroMeta={
        <>
          <span className="plate">{vehicle.plate || '-'}</span>
          <span>·</span>
          <span>{policy?.carName || vehicle.vehicleModelLine || vehicle.model || '-'}</span>
          <span>·</span>
          <span>{vehicle.company ? displayCompanyName(vehicle.company, companyMaster) : '회사 미지정'}</span>
          {policy?.policyNo && (<><span>·</span><span style={{ fontFamily: 'var(--font-mono)' }}>{policy.policyNo}</span></>)}
        </>
      }
      heroRight={
        days != null ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className="dim" style={{ fontSize: 10 }}>D-N</span>
            <span className={`status ${days < 0 ? '해지' : days <= 30 ? '만기임박' : '운행'}`}>
              {days < 0 ? `${-days}일 경과` : days === 0 ? '오늘 만기' : `D-${days}`}
            </span>
          </div>
        ) : null
      }
    >
      {!policy && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-sub)', fontSize: 13 }}>
          이 차량의 보험증권 미등록 — BottomBar <strong>[보험증권 등록]</strong> 으로 OCR/개별/엑셀 등록
        </div>
      )}

      {policy && (
        <div className="detail-stack">
          {/* 보험사 정보 */}
          <section className="detail-section">
            <div className="detail-section-header">보험사 · 증권</div>
            <div className="detail-section-body">
              <div className="detail-grid-2">
                <KV k="보험사" v={policy.insurer} />
                <KV k="상품명" v={policy.productName} />
                <KV k="증권번호" v={policy.policyNo} mono />
                <KV k="사업자번호" v={policy.bizNo} mono />
                <KV k="계약자" v={policy.contractor} />
                <KV k="피보험자" v={policy.insured} />
              </div>
            </div>
          </section>

          {/* 보험기간 + 운전 조건 */}
          <section className="detail-section">
            <div className="detail-section-header">보험기간 · 운전 조건</div>
            <div className="detail-section-body">
              <div className="detail-grid-2">
                <KV k="시작일" v={policy.startDate} mono />
                <KV k="만기일" v={policy.endDate} mono />
                <KV k="운전자 범위" v={policy.driverScope} />
                <KV k="운전 가능 연령" v={policy.driverAge} />
                <KV k="물적할증" v={policy.deductibleMan ? `${policy.deductibleMan.toLocaleString()}만원` : undefined} />
                {contract && (
                  <KV k="계약자 연령" v={contract.insuranceAge ? `${contract.insuranceAge}세` : undefined} />
                )}
              </div>
            </div>
          </section>

          {/* 차량 사항 */}
          <section className="detail-section">
            <div className="detail-section-header">차량 사항</div>
            <div className="detail-section-body">
              <div className="detail-grid-2">
                <KV k="차량(차대)번호" v={policy.carNumber} mono />
                <KV k="차명" v={policy.carName} />
                <KV k="연식" v={policy.carYear ? String(policy.carYear) : undefined} mono />
                <KV k="차종" v={policy.carClass} />
                <KV k="배기량" v={policy.displacement ? `${policy.displacement.toLocaleString()}cc` : undefined} mono />
                <KV k="정원" v={policy.seats ? `${policy.seats}인` : undefined} mono />
                <KV k="차량가액" v={policy.vehicleValueMan ? `${policy.vehicleValueMan.toLocaleString()}만원` : undefined} mono />
                <KV k="부속품가액" v={policy.accessoryValueMan ? `${policy.accessoryValueMan.toLocaleString()}만원` : undefined} mono />
              </div>
              {policy.accessories && (
                <div style={{ marginTop: 8 }}>
                  <span className="dim" style={{ fontSize: 11 }}>부속품: </span>
                  <span style={{ fontSize: 12 }}>{policy.accessories}</span>
                </div>
              )}
            </div>
          </section>

          {/* 가입담보 / 보상한도 */}
          <section className="detail-section">
            <div className="detail-section-header">가입 담보 · 보상 한도</div>
            <div className="detail-section-body">
              <div className="detail-grid-2">
                <KV k="대인배상Ⅰ" v={policy.covPersonal1} />
                <KV k="대인배상Ⅱ" v={policy.covPersonal2} />
                <KV k="대물배상" v={policy.covProperty} />
                <KV k="자기신체사고" v={policy.covSelfAccident} />
                <KV k="무보험차상해" v={policy.covUninsured} />
                <KV k="자기차량손해" v={policy.covSelfVehicle} />
                <KV k="긴급출동" v={policy.covEmergency} />
              </div>
            </div>
          </section>

          {/* 보험료 + 분납 */}
          <section className="detail-section">
            <div className="detail-section-header">
              <span>보험료 — 1회차 자동 산출</span>
              {!totalMatch && (
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--orange-text)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Warning size={11} weight="duotone" /> 분납 합계 ≠ 총보험료 ({fmt(totalSum)})
                </span>
              )}
            </div>
            <div className="detail-section-body">
              <div className="detail-grid-2" style={{ marginBottom: 10 }}>
                <KV k="납입한 보험료 (OCR)" v={fmt(policy.paidPremium)} mono />
                <KV k="총보험료" v={fmt(policy.totalPremium)} mono />
              </div>
              <table className="table" style={{ fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ width: 48 }}>회차</th>
                    <th className="mono" style={{ width: 110 }}>출금일</th>
                    <th className="num">금액</th>
                    <th className="center" style={{ width: 64 }}>납부</th>
                  </tr>
                </thead>
                <tbody>
                  {(policy.installments ?? []).length === 0 ? (
                    <tr><td colSpan={4} className="muted center" style={{ padding: 16 }}>분납 내역 없음</td></tr>
                  ) : policy.installments!.map((it) => (
                    <tr key={it.cycle} style={{ background: it.cycle === 1 ? 'var(--brand-bg)' : undefined }}>
                      <td className="mono center">{it.cycle}{it.cycle === 1 ? ' (산출)' : ''}</td>
                      <td className="mono">{it.dueDate || '-'}</td>
                      <td className="num mono">{fmt(it.amount)}</td>
                      <td className="center">{it.paid ? '✓' : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 자동이체 */}
          <section className="detail-section">
            <div className="detail-section-header">분납 자동이체</div>
            <div className="detail-section-body">
              <div className="detail-grid-2">
                <KV k="이체 은행" v={policy.autoDebitBank} />
                <KV k="이체 계좌" v={policy.autoDebitAccount} mono />
                <KV k="이체 예금주" v={policy.autoDebitHolder} />
              </div>
            </div>
          </section>

          {/* 원본 파일 — OCR 시 첨부됨 */}
          {policy.fileUrl && (
            <section className="detail-section">
              <div className="detail-section-header">
                <span>원본 파일</span>
                {policy.fileName && <span className="dim" style={{ marginLeft: 'auto', fontSize: 10 }}>{policy.fileName}</span>}
              </div>
              <div className="detail-section-body">
                {policy.fileUrl.startsWith('data:image') ? (
                  <img
                    src={policy.fileUrl}
                    alt={policy.fileName ?? '보험증권 원본'}
                    style={{ maxWidth: '100%', maxHeight: 480, objectFit: 'scale-down', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
                  />
                ) : policy.fileUrl.startsWith('data:application/pdf') ? (
                  <embed src={policy.fileUrl} type="application/pdf" style={{ width: '100%', height: 480, border: '1px solid var(--border)', borderRadius: 'var(--radius)' }} />
                ) : (
                  <a href={policy.fileUrl} download={policy.fileName ?? 'insurance.pdf'} className="btn">
                    원본 다운로드
                  </a>
                )}
                <div style={{ marginTop: 8 }}>
                  <a href={policy.fileUrl} download={policy.fileName ?? 'insurance.pdf'} style={{ fontSize: 11, color: 'var(--brand)' }}>
                    {policy.fileName ?? 'insurance.pdf'} 다운로드
                  </a>
                  {policy.uploadedAt && (
                    <span className="dim" style={{ marginLeft: 8, fontSize: 10 }}>
                      업로드: {policy.uploadedAt.slice(0, 10)}
                    </span>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </DetailDialogShell>
  );
}

function KV({ k, v, mono = false }: { k: string; v?: string | number | null; mono?: boolean }) {
  return (
    <div className="detail-field" style={{ display: 'flex', gap: 8 }}>
      <span className="detail-field-label" style={{ minWidth: 96, color: 'var(--text-sub)', fontSize: 11 }}>{k}</span>
      <span className={`detail-field-value ${mono ? 'mono' : ''}`} style={{ fontSize: 12, color: 'var(--text-main)', flex: 1 }}>
        {v == null || v === '' ? <span className="muted">-</span> : v}
      </span>
    </div>
  );
}
