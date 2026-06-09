'use client';

/**
 * /asset/insurance — 자산 차량 단위 보험 현황 list.
 * 자산 메인과 동일 vehicles 소스 (rawVehicles + 계약 derived) → 카운트 일치.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMergedVehicles } from '@/lib/use-merged-vehicles';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useInsurances } from '@/lib/firebase/insurance-store';
import { downloadInsuranceExcel } from '@/lib/insurance-export';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomBar } from '@/components/layout/bottom-bar';
import { AssetTopbar } from '@/components/asset/asset-topbar';
import { InsuranceRegisterDialog } from '@/components/insurance/insurance-register-dialog';
import { InsuranceDetailDialog } from '@/components/insurance/insurance-detail-dialog';
import { useRole } from '@/lib/use-role';
import { displayCompanyName } from '@/lib/company-display';
import { matchesCompanyFilter, buildCompanyOptions } from '@/lib/filter-helpers';
import { todayKr } from '@/lib/mock-data';
import { Plus, FileXls } from '@phosphor-icons/react';

type QF = 'all' | 'missing' | 'expire' | 'expired';

export default function AssetInsurancePage() {
  const router = useRouter();
  const { isMaster: master, loading: roleLoading } = useRole();
  useEffect(() => { if (!roleLoading && !master) router.replace('/'); }, [master, roleLoading, router]);

  const { vehicles } = useMergedVehicles();
  const { contracts } = useContracts();
  const { companies: companyMaster } = useCompanies();
  const { policies } = useInsurances();

  /** 차량 plate → 활성 계약 (insuranceAge 비교용) */
  const activeContractByPlate = useMemo(() => {
    const m = new Map<string, typeof contracts[number]>();
    for (const c of contracts) {
      if (c.status === '해지' || c.status === '반납') continue;
      if (!c.vehiclePlate) continue;
      const key = c.vehiclePlate.replace(/\s/g, '');
      const cur = m.get(key);
      if (!cur || (c.contractDate ?? '') > (cur.contractDate ?? '')) m.set(key, c);
    }
    return m;
  }, [contracts]);

  /** 보험증권 운전가능연령 ("만30세이상한정") 에서 숫자만 추출 */
  function parseInsuranceMinAge(driverAge: string | undefined): number | null {
    if (!driverAge) return null;
    const m = driverAge.match(/(\d{2,3})/);
    return m ? Number(m[1]) : null;
  }
  /** 계약자 연령 (insuranceAge 우선, 없으면 customerIdentNo 앞 6자리로 추정) */
  function getContractorAge(contract: typeof contracts[number] | undefined): number | null {
    if (!contract) return null;
    if (contract.insuranceAge != null) return contract.insuranceAge;
    // 주민번호 앞 6자리 → 출생연도 → 만 나이 추정
    const ident = (contract.customerIdentNo ?? '').replace(/[\s-]/g, '');
    if (ident.length < 7) return null;
    const yy = Number(ident.slice(0, 2));
    if (!Number.isFinite(yy)) return null;
    const genderDigit = Number(ident[6]);
    const century = (genderDigit === 1 || genderDigit === 2 || genderDigit === 5 || genderDigit === 6) ? 1900 : 2000;
    const birthYear = century + yy;
    return new Date().getFullYear() - birthYear;
  }
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [qf, setQf] = useState<QF>('all');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [detailVehicleId, setDetailVehicleId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  function toggleRow(id: string) {
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  const today = todayKr();

  /** 차량 plate → 가장 최근 활성 보험증권 */
  const policyByPlate = useMemo(() => {
    const m = new Map<string, typeof policies[number]>();
    for (const p of policies) {
      if (!p.carNumber) continue;
      if (p.endDate && p.endDate < today) continue;
      const key = p.carNumber.replace(/\s/g, '');
      const cur = m.get(key);
      if (!cur || (p.startDate ?? '') > (cur.startDate ?? '')) m.set(key, p);
    }
    return m;
  }, [policies, today]);

  const companyOptions = useMemo(() => buildCompanyOptions(vehicles, (v) => v.company), [vehicles]);

  /** 차량별 보험 상태 평가 */
  function evalStatus(v: typeof vehicles[number]) {
    const p = v.plate ? policyByPlate.get(v.plate.replace(/\s/g, '')) : undefined;
    const insurer = p?.insurer ?? v.insuranceCompany;
    const policyNo = p?.policyNo ?? v.insurancePolicyNo;
    const endDate = p?.endDate ?? v.insuranceExpiryDate;
    const startDate = p?.startDate;
    const totalPremium = p?.totalPremium;
    const installmentCount = p?.installments?.length ?? 0;
    const days = endDate ? Math.round((new Date(endDate).getTime() - new Date(today).getTime()) / 86400000) : null;
    let status: 'missing' | 'expire' | 'expired' | 'normal' = 'normal';
    if (!endDate || !insurer) status = 'missing';
    else if (days != null && days < 0) status = 'expired';
    else if (days != null && days <= 30) status = 'expire';
    return { policy: p, insurer, policyNo, startDate, endDate: endDate ?? undefined, totalPremium, installmentCount, days, status };
  }

  const allRows = useMemo(() => vehicles.map((v) => ({ v, ...evalStatus(v) })), [vehicles, policyByPlate, today]);

  const counts = useMemo(() => {
    let missing = 0, expire = 0, expired = 0;
    for (const r of allRows) {
      if (r.status === 'missing') missing++;
      else if (r.status === 'expire') expire++;
      else if (r.status === 'expired') expired++;
    }
    return { all: allRows.length, missing, expire, expired };
  }, [allRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter(({ v, status }) => {
      if (!matchesCompanyFilter(v.company, companyFilter)) return false;
      if (qf !== 'all' && status !== qf) return false;
      if (q) {
        const hay = `${v.plate ?? ''} ${v.model ?? ''} ${v.insuranceCompany ?? ''} ${v.insurancePolicyNo ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (a.v.plate ?? '').localeCompare(b.v.plate ?? ''));
  }, [allRows, search, companyFilter, qf]);

  if (roleLoading || !master) {
    return <div className="layout"><Sidebar /><div className="app"><div style={{ padding: 40, fontSize: 12, color: 'var(--text-weak)' }}>로딩 중…</div></div></div>;
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <AssetTopbar
          currentPage="insurance"
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="차량번호 / 차종 / 보험사 / 증권번호"
          companyFilter={companyFilter}
          onCompanyFilterChange={setCompanyFilter}
          companyOptions={companyOptions}
          companyMaster={companyMaster}
          extraFilters={
            <>
              <button type="button" className={`chip ${qf === 'all' ? 'active' : ''}`} onClick={() => setQf('all')}>
                전체<span className="chip-count">{counts.all}</span>
              </button>
              <button type="button" className={`chip ${qf === 'missing' ? 'active' : ''}`} onClick={() => setQf('missing')}>
                미입력{counts.missing > 0 && <span className="chip-count">{counts.missing}</span>}
              </button>
              <button type="button" className={`chip ${qf === 'expire' ? 'active' : ''}`} onClick={() => setQf('expire')}>
                만기임박{counts.expire > 0 && <span className="chip-count">{counts.expire}</span>}
              </button>
              <button type="button" className={`chip ${qf === 'expired' ? 'active' : ''}`} onClick={() => setQf('expired')}>
                만료{counts.expired > 0 && <span className="chip-count">{counts.expired}</span>}
              </button>
            </>
          }
        />

        <div className="dashboard" style={{ gridTemplateColumns: '1fr' }}>
          <div className="panel">
            <div className="panel-body">
              <table className="table">
                <thead>
                  <tr>
                    <th className="checkbox-col">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && filtered.every(({ v }) => selectedIds.has(v.id))}
                        ref={(el) => {
                          if (!el) return;
                          const some = filtered.some(({ v }) => selectedIds.has(v.id));
                          const all = filtered.every(({ v }) => selectedIds.has(v.id));
                          el.indeterminate = some && !all;
                        }}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(new Set(filtered.map(({ v }) => v.id)));
                          else setSelectedIds(new Set());
                        }}
                        aria-label="전체 선택"
                      />
                    </th>
                    <th style={{ width: 56 }}>회사</th>
                    <th style={{ width: 96 }}>차량번호</th>
                    <th style={{ width: 130 }}>차명</th>
                    <th style={{ width: 110 }}>보험사</th>
                    <th className="mono" style={{ width: 100 }}>시작일</th>
                    <th className="mono" style={{ width: 100 }}>만기일</th>
                    <th className="center" style={{ width: 80 }}>D-N</th>
                    <th style={{ width: 110 }}>운전가능연령</th>
                    <th className="center" style={{ width: 90 }}>연령매칭</th>
                    <th className="num" style={{ width: 120 }}>총보험료</th>
                    <th className="center" style={{ width: 80 }}>분납회차</th>
                    <th className="center" style={{ width: 80 }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={13} className="muted center" style={{ padding: 32 }}>해당 차량 없음</td></tr>
                  ) : filtered.map(({ v, insurer, policy, startDate, endDate, totalPremium, installmentCount, days, status }) => {
                    const tone = status === 'expired' ? 'red' : status === 'expire' ? 'orange' : status === 'missing' ? 'red' : '';
                    return (
                      <tr key={v.id} style={{ verticalAlign: 'middle', cursor: 'pointer' }} onDoubleClick={() => setDetailVehicleId(v.id)} className={selectedIds.has(v.id) ? 'selected-row' : undefined}>
                        <td className="checkbox-col" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedIds.has(v.id)} onChange={() => toggleRow(v.id)} aria-label="행 선택" />
                        </td>
                        <td>{v.company ? displayCompanyName(v.company, companyMaster) : '-'}</td>
                        <td className="mono">{v.plate || '-'}</td>
                        <td>{v.vehicleModelLine || v.model || '-'}</td>
                        <td>{insurer || <span className="muted">-</span>}</td>
                        <td className="mono dim">{startDate || '-'}</td>
                        <td className="mono">{endDate || '-'}</td>
                        <td className="center mono" style={{ color: tone === 'red' ? 'var(--red-text)' : tone === 'orange' ? 'var(--orange-text, #c2410c)' : undefined, fontWeight: tone ? 700 : 400 }}>
                          {days == null ? '-' : days < 0 ? `${-days}일경과` : days === 0 ? '오늘만기' : `D-${days}`}
                        </td>
                        <td className="dim">{policy?.driverAge || <span className="muted">-</span>}</td>
                        <td className="center">
                          {(() => {
                            const minAge = parseInsuranceMinAge(policy?.driverAge);
                            const contract = v.plate ? activeContractByPlate.get(v.plate.replace(/\s/g, '')) : undefined;
                            const age = getContractorAge(contract);
                            if (minAge == null || age == null) return <span className="muted">-</span>;
                            const ok = age >= minAge;
                            return ok
                              ? <span className="status" style={{ background: 'var(--green-bg)', color: 'var(--green-text)', border: '1px solid var(--green-border)' }} title={`계약자 ${age}세 ≥ ${minAge}세`}>OK</span>
                              : <span className="status" style={{ background: 'var(--red-bg)', color: 'var(--red-text)', border: '1px solid var(--red-border)' }} title={`계약자 ${age}세 < ${minAge}세 — 보험 보장 X`}>불일치</span>;
                          })()}
                        </td>
                        <td className="num mono" style={{ fontWeight: 600 }}>{totalPremium ? `₩${totalPremium.toLocaleString()}` : '-'}</td>
                        <td className="center mono dim">{installmentCount > 0 ? `${installmentCount}회 분납` : '-'}</td>
                        <td className="center">
                          {status === 'missing' && <span className="status" style={{ background: 'var(--red-bg)', color: 'var(--red-text)', border: '1px solid var(--red-border)' }}>미입력</span>}
                          {status === 'expired' && <span className="status" style={{ background: 'var(--red-bg)', color: 'var(--red-text)', border: '1px solid var(--red-border)' }}>만료</span>}
                          {status === 'expire' && <span className="status" style={{ background: 'var(--orange-bg)', color: 'var(--orange-text, #c2410c)', border: '1px solid var(--orange-border, #fed7aa)' }}>임박</span>}
                          {status === 'normal' && <span className="status" style={{ background: 'var(--green-bg)', color: 'var(--green-text)', border: '1px solid var(--green-border)' }}>정상</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <BottomBar
          left={
            <>
              <button className="btn btn-primary" type="button" onClick={() => setRegisterOpen(true)}>
                <Plus size={14} weight="bold" /> 보험증권 등록
              </button>
              <span className="btn-sep" />
              <button
                className="btn"
                type="button"
                title="보험증권 전체 정보 엑셀 — JPK 네이비 헤더 + 1~6회차·담보·자동이체 모두 포함"
                onClick={() => {
                  downloadInsuranceExcel(
                    filtered.map(({ v, policy }) => ({ v, policy })),
                    companyMaster,
                    { title: `보험증권 일람${companyFilter !== 'all' ? ` (${companyFilter})` : ''}` },
                  );
                }}
              >
                <FileXls size={14} weight="bold" /> 엑셀
              </button>
            </>
          }
          right={null}
        />

        <InsuranceRegisterDialog open={registerOpen} onOpenChange={setRegisterOpen} />

        {/* 보험증권 상세 dialog — 차량 행 더블클릭 시 */}
        {(() => {
          const v = detailVehicleId ? vehicles.find((x) => x.id === detailVehicleId) ?? null : null;
          const p = v?.plate ? policyByPlate.get(v.plate.replace(/\s/g, '')) : undefined;
          const c = v?.plate ? activeContractByPlate.get(v.plate.replace(/\s/g, '')) : undefined;
          return (
            <InsuranceDetailDialog
              open={detailVehicleId != null}
              onOpenChange={(o) => { if (!o) setDetailVehicleId(null); }}
              vehicle={v}
              policy={p}
              contract={c}
              companyMaster={companyMaster}
            />
          );
        })()}
      </div>
    </div>
  );
}
