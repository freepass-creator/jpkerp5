'use client';

/**
 * /admin/integrity — 교차 엔티티 정합성 점검 (읽기 전용).
 *
 * v6(jpkerp6-app)의 정합성 페이지를 v5로 백포트. lib/data-integrity 순수함수 사용.
 * v5 기존 리스크(risk-issues: 미납·검사지연·보험만기)와 중복되지 않는
 * **마스터 간 참조무결성**만 본다: plate 고아 · 날짜 역전 · 핵심 필수 누락.
 *
 * 저장·기존 로직 무변경. 진단만 (문제 행을 눈으로 확인 → 해당 화면에서 수기 정정).
 */

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldWarning, Warning, CheckCircle } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useInsurances } from '@/lib/firebase/insurance-store';
import { useBankTx, useCardTx } from '@/lib/firebase/transactions-store';
import { usePenaltyStore } from '@/lib/use-penalty-store';
import { useRole } from '@/lib/use-role';
import { StatusBadge } from '@/components/ui/status-badge';
import { computeDataIntegrity } from '@/lib/data-integrity';

export default function IntegrityPage() {
  const router = useRouter();
  const { isMaster, loading: roleLoading } = useRole();
  const { vehicles } = useVehicles();
  const { contracts } = useContracts();
  const { policies } = useInsurances();
  const { rows: bankTx } = useBankTx();
  const { rows: cardTx } = useCardTx();
  const [penalties] = usePenaltyStore();

  const issues = useMemo(
    () => computeDataIntegrity({ vehicles, contracts, insurances: policies, penalties, bankTx, cardTx }),
    [vehicles, contracts, policies, penalties, bankTx, cardTx],
  );

  const high = issues.filter((i) => i.sev === 'high').length;

  if (!roleLoading && !isMaster) {
    router.replace('/');
    return null;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: 24, maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <header className="page-header" style={{ marginBottom: 16 }}>
          <h1 className="page-header-title">
            <ShieldWarning size={18} weight="duotone" /> 정합성 점검
          </h1>
          <div className="page-header-title-sub">
            차량 마스터 ↔ 계약·보험·과태료의 참조무결성 진단. 미납·검사·보험 만기는 리스크 현황에서 봅니다.
          </div>
        </header>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 13 }}>총 <strong>{issues.length}</strong>건</span>
          <span style={{ fontSize: 13, color: 'var(--red-text)' }}>위험 <strong>{high}</strong></span>
          <span style={{ fontSize: 13, color: 'var(--orange-text)' }}>주의 <strong>{issues.length - high}</strong></span>
        </div>

        <section className="detail-section">
          <div className="detail-section-body" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>심각도</th>
                  <th style={{ width: 100 }}>유형</th>
                  <th style={{ width: 70 }}>영역</th>
                  <th style={{ width: 220 }}>대상</th>
                  <th>내용</th>
                </tr>
              </thead>
              <tbody>
                {issues.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted center" style={{ padding: 40 }}>
                      <CheckCircle size={22} weight="duotone" style={{ color: 'var(--green-text)', display: 'block', margin: '0 auto 8px' }} />
                      정합성 문제 없음 — 모든 차량번호 참조·날짜·필수 필드 정상
                    </td>
                  </tr>
                ) : issues.map((it, i) => (
                  <tr key={i}>
                    <td>
                      <StatusBadge tone={it.sev === 'high' ? 'red' : 'orange'}>
                        {it.sev === 'high' ? '위험' : '주의'}
                      </StatusBadge>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Warning size={12} weight="fill" style={{ color: it.sev === 'high' ? 'var(--red-text)' : 'var(--orange-text)' }} />
                        {it.kind}
                      </span>
                    </td>
                    <td className="dim">{it.entity}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{it.target}</td>
                    <td className="dim">{it.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
