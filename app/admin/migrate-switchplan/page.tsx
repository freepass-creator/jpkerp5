'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, Upload, Warning, CheckCircle, FileXls, ArrowsDownUp } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { useAuth } from '@/lib/use-auth';
import { isSuperAdmin } from '@/lib/admin-emails';
import { parseSwitchplanWorkbook, toSnapshotRows, type SwitchplanParseResult, type SwitchplanContract } from '@/lib/migrate/switchplan';
import { validateSnapshotRow, applySnapshotToContract } from '@/lib/import-commit';
import { assignContractNos } from '@/lib/code-scheme';
import { upsertVehicleFromContract } from '@/lib/entity-sync';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';
import { friendlyError } from '@/lib/friendly-error';
import type { Contract } from '@/lib/types';

const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');

export default function MigrateSwitchplanPage() {
  const router = useRouter();
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user?.email);
  useEffect(() => { if (user && !superAdmin) router.replace('/'); }, [user, superAdmin, router]);

  const { contracts, addMany: addContracts, updateMany: updateContracts } = useContracts();
  const { vehicles, add: addVehicle, update: updateVehicle } = useVehicles();
  const { companies } = useCompanies();

  const [fileName, setFileName] = useState('');
  const [res, setRes] = useState<SwitchplanParseResult | null>(null);
  const [companyKey, setCompanyKey] = useState('스위치플랜');
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const append = (line: string) => setLog((l) => [...l, `[${new Date().toLocaleTimeString('ko-KR')}] ${line}`]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setRes(null);
    setLog([]);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseSwitchplanWorkbook(buf);
      setFileName(file.name);
      setRes(parsed);
      append(`파싱 완료 — 운행중 ${parsed.totals.countCurrent} · 종료 ${parsed.totals.countReturned}`);
      if (parsed.warnings.length) parsed.warnings.forEach((w) => append(`⚠ ${w}`));
      toast.success(`파싱 완료 — 운행중 ${parsed.totals.countCurrent}건`);
    } catch (err) {
      append(`✗ 파싱 실패: ${friendlyError(err)}`);
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  // 운행중 계약을 씨앗값(carry) 내림차순 정렬
  const currentSorted = useMemo(
    () => (res ? [...res.current].sort((a, b) => b.carryUnpaid - a.carryUnpaid) : []),
    [res],
  );
  const reviewFlags = (c: SwitchplanContract) =>
    c.carryUnpaid !== c.grossUnpaid || c.hasPenaltyMonth || c.hasOverpay;

  async function commitSeeds() {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    if (!res) return;
    const rows = toSnapshotRows(res, companyKey);
    if (rows.length === 0) { toast.info('씨앗 대상 없음'); return; }
    if (!await showConfirm({
      title: `운행중 계약 ${rows.length}건 씨앗 커밋`,
      description:
        `현재미수 씨앗 = 직원 미납칸(carry) 합 ${won(res.totals.carryCurrent)}.\n`
        + `차량번호 기준 upsert — 있으면 갱신, 없으면 신규. 차량도 자동 동기화됩니다.\n`
        + `회사 = "${companyKey}". (종료 계약은 이번 커밋 대상 아님 — 이력은 별도)`,
      confirmLabel: '씨앗 커밋 진행',
    })) return;

    setBusy(true);
    try {
      // create-dialog.commitSnapshotRows 와 동일 파이프라인
      const validations = rows.map((r) => validateSnapshotRow(r, companies));
      const contractV = validations.filter((v) => v.kind === 'contract' && v.patch);
      const invalid = validations.filter((v) => v.kind === 'invalid').length;

      const byPlate = new Map(contracts.map((c) => [(c.vehiclePlate ?? '').trim(), c]));
      const updates: Contract[] = [];
      const creates: Array<Omit<Contract, 'id'>> = [];
      for (const v of contractV) {
        const p = v.patch!;
        const plateKey = (p.vehiclePlate ?? '').trim();
        const existing = plateKey === '미정' ? undefined : byPlate.get(plateKey);
        const out = applySnapshotToContract(existing, p);
        if (existing && 'id' in out) updates.push(out as Contract);
        else creates.push(out as Omit<Contract, 'id'>);
      }
      if (updates.length > 0) await updateContracts(updates);
      const createsWithNos = assignContractNos(creates, contracts, companies);
      const created = createsWithNos.length > 0 ? await addContracts(createsWithNos) : 0;

      // 차량 자동 동기화
      const syncCtx = { vehicles, companies, addVehicle, updateVehicle };
      for (const c of [...updates, ...createsWithNos]) {
        try { await upsertVehicleFromContract(c as Contract, syncCtx); }
        catch (err) { append(`차량동기 실패 ${(c as Contract).vehiclePlate}: ${friendlyError(err)}`); }
      }

      append(`✓ 씨앗 커밋 완료 — 갱신 ${updates.length} · 신규 ${created}` + (invalid ? ` (오류 ${invalid}건 제외)` : ''));
      toast.success(`씨앗 ${updates.length + created}건 반영 완료`);
      if (invalid > 0) toast.warning(`${invalid}행 미반영 — 필수(차량번호·계약자·대여료) 누락`);
    } catch (err) {
      append(`✗ 커밋 실패: ${friendlyError(err)}`);
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const t = res?.totals;

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <Database size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>스위치플랜 마이그레이션</span>
          </div>
        </header>

        <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <header className="page-header">
            <div className="page-header-title-group">
              <h1 className="page-header-title">
                <Database size={18} weight="duotone" />
                사업현황.xlsx → 씨앗 마이그레이션
              </h1>
              <div className="page-header-title-sub">
                원본 업로드 → 미수 3정의 대조(엑셀 vs ERP) → 확인 후 씨앗 커밋
              </div>
            </div>
          </header>

          {!superAdmin && (
            <div className="notice notice--error">
              <Warning size={14} weight="fill" style={{ marginRight: 6, verticalAlign: 'middle' }} />
              SUPER_ADMIN 만 실행할 수 있습니다.
            </div>
          )}

          {/* 업로드 */}
          <section className="detail-section">
            <div className="detail-section-header"><span className="title">1. 원본 업로드</span></div>
            <div className="detail-section-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label className="btn btn-primary" style={{ height: 40, cursor: busy ? 'default' : 'pointer' }}>
                <FileXls weight="bold" size={16} /> 사업현황.xlsx 선택
                <input type="file" accept=".xlsx,.xls" hidden disabled={busy} onChange={onFile} />
              </label>
              {fileName && <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>{fileName}</span>}
              <label style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-weak)', display: 'flex', alignItems: 'center', gap: 6 }}>
                회사
                <input
                  type="text" value={companyKey} onChange={(e) => setCompanyKey(e.target.value)}
                  style={{ width: 130, fontSize: 12, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
                />
              </label>
            </div>
          </section>

          {/* 총계 대조 */}
          {t && (
            <section className="detail-section">
              <div className="detail-section-header"><span className="title">2. 미수 3정의 대조 (엑셀 원본 vs ERP 계산)</span></div>
              <div className="detail-section-body">
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-weak)', fontSize: 11, textAlign: 'right' }}>
                      <th style={{ textAlign: 'left', padding: '4px 8px' }} />
                      <th style={{ padding: '4px 8px' }}>carry (씨앗·직원 미납칸)</th>
                      <th style={{ padding: '4px 8px' }}>gross (Σ청구−Σ결제)</th>
                      <th style={{ padding: '4px 8px' }}>pastDue (월별클램프)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ textAlign: 'right' }}>
                      <td style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-sub)' }}>운행중 {t.countCurrent}건</td>
                      <td style={{ padding: '4px 8px', fontWeight: 700, color: 'var(--brand)' }}>{won(t.carryCurrent)}</td>
                      <td style={{ padding: '4px 8px' }}>{won(t.grossCurrent)}</td>
                      <td style={{ padding: '4px 8px', color: 'var(--text-weak)' }}>{won(t.pastDueCurrent)}</td>
                    </tr>
                    <tr style={{ textAlign: 'right' }}>
                      <td style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-sub)' }}>종료 {t.countReturned}건 (이력)</td>
                      <td style={{ padding: '4px 8px', fontWeight: 600 }}>{won(t.carryReturned)}</td>
                      <td style={{ padding: '4px 8px' }}>{won(t.grossReturned)}</td>
                      <td style={{ padding: '4px 8px', color: 'var(--text-weak)' }}>{won(t.pastDueReturned)}</td>
                    </tr>
                    <tr style={{ textAlign: 'right', borderTop: '1px solid var(--border)' }}>
                      <td style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>합계</td>
                      <td style={{ padding: '4px 8px', fontWeight: 700, color: 'var(--brand)' }}>{won(t.carryCurrent + t.carryReturned)}</td>
                      <td style={{ padding: '4px 8px' }}>{won(t.grossCurrent + t.grossReturned)}</td>
                      <td style={{ padding: '4px 8px', color: 'var(--text-weak)' }}>{won(t.pastDueCurrent + t.pastDueReturned)}</td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ fontSize: 11, color: 'var(--text-weak)', lineHeight: 1.7, marginTop: 10 }}>
                  · <b>carry</b> = 직원이 유지하는 미납칸(running balance). 묶음결제·반납정산 반영 → <b>씨앗값</b>.<br />
                  · <b>gross</b>는 반납 정산(보증금상계·대손)을 못 봐서, <b>pastDue</b>는 묶음결제(2개월치 한번에) 때 과대.<br />
                  · 미래 선청구(도래 전, 미수 아님) {won(t.futureBilled)} · 과태료월 {t.penaltyCount}건 · 과오납 {t.overpayCount}건 → 아래 ⚑ 검토대상.
                </div>
              </div>
            </section>
          )}

          {/* 계약별 대조표 */}
          {res && (
            <section className="detail-section">
              <div className="detail-section-header">
                <span className="title">3. 운행중 계약별 대조 ({currentSorted.length}건)</span>
                <button className="btn" type="button" style={{ marginLeft: 'auto', height: 26, fontSize: 11 }} onClick={() => setShowAll((s) => !s)}>
                  <ArrowsDownUp size={12} /> {showAll ? '상위 30건만' : '전체 보기'}
                </button>
              </div>
              <div className="detail-section-body" style={{ maxHeight: 460, overflow: 'auto', padding: 0 }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1 }}>
                    <tr style={{ color: 'var(--text-weak)', fontSize: 11, textAlign: 'right', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px' }}>차량번호</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px' }}>계약자</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px' }}>차종</th>
                      <th style={{ padding: '6px 8px' }}>대여료</th>
                      <th style={{ padding: '6px 8px' }}>씨앗(carry)</th>
                      <th style={{ padding: '6px 8px' }}>gross</th>
                      <th style={{ padding: '6px 8px' }}>pastDue</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px' }}>검토</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAll ? currentSorted : currentSorted.slice(0, 30)).map((c, i) => {
                      const flag = reviewFlags(c);
                      return (
                        <tr key={`${c.vehiclePlate}-${i}`} style={{ textAlign: 'right', borderBottom: '1px solid var(--border-weak)', background: flag ? 'var(--bg-sunken)' : undefined }}>
                          <td style={{ textAlign: 'left', padding: '5px 8px', fontVariantNumeric: 'tabular-nums' }}>{c.vehiclePlate}</td>
                          <td style={{ textAlign: 'left', padding: '5px 8px' }}>{c.customerName}</td>
                          <td style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text-weak)' }}>{c.vehicleModel ?? '—'}</td>
                          <td style={{ padding: '5px 8px', fontVariantNumeric: 'tabular-nums' }}>{won(c.monthlyRent)}</td>
                          <td style={{ padding: '5px 8px', fontWeight: 700, color: 'var(--brand)', fontVariantNumeric: 'tabular-nums' }}>{won(c.carryUnpaid)}</td>
                          <td style={{ padding: '5px 8px', color: c.grossUnpaid !== c.carryUnpaid ? 'var(--orange-text)' : 'var(--text-weak)', fontVariantNumeric: 'tabular-nums' }}>{won(c.grossUnpaid)}</td>
                          <td style={{ padding: '5px 8px', color: 'var(--text-weak)', fontVariantNumeric: 'tabular-nums' }}>{won(c.pastDueUnpaid)}</td>
                          <td style={{ textAlign: 'left', padding: '5px 8px', fontSize: 10, color: 'var(--orange-text)' }}>
                            {[c.hasPenaltyMonth ? '과태료' : '', c.hasOverpay ? '과오납' : '', c.grossUnpaid !== c.carryUnpaid ? '정산차이' : ''].filter(Boolean).join(' · ')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 커밋 */}
          {res && (
            <section className="detail-section">
              <div className="detail-section-header"><span className="title">4. 씨앗 커밋</span></div>
              <div className="detail-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  className="btn btn-primary" type="button"
                  disabled={busy || !superAdmin}
                  onClick={commitSeeds}
                  style={{ height: 44, fontSize: 14, fontWeight: 600 }}
                >
                  <Upload weight="bold" size={16} /> 운행중 {res.totals.countCurrent}건 씨앗 커밋 (현재미수 = carry)
                </button>
                <div style={{ fontSize: 11, color: 'var(--text-weak)', lineHeight: 1.6 }}>
                  ✓ 차량번호 기준 upsert — 있으면 갱신, 없으면 신규 (기존 SNAPSHOT 파이프라인 그대로)<br />
                  ✓ 현재미수 = carry → distributeUnpaid 로 직전 회차부터 역순 미납 분배 (期初 씨앗)<br />
                  ✓ 차량 자동 동기화 · 종료(반납) 계약은 이번 대상 아님 (이력 임포트 별도)
                </div>
              </div>
            </section>
          )}

          {/* 로그 */}
          {log.length > 0 && (
            <section className="detail-section">
              <div className="detail-section-header">
                <CheckCircle size={12} weight="duotone" style={{ color: 'var(--green-text)' }} />
                <span className="title">로그</span>
              </div>
              <div className="detail-section-body">
                <pre style={{ fontSize: 11, color: 'var(--text-sub)', background: 'var(--bg-sunken)', padding: 10, borderRadius: 'var(--radius)', maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {log.join('\n')}
                </pre>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
