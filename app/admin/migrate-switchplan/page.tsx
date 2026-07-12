'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, Upload, Warning, CheckCircle, FileXls, ArrowsDownUp, Car } from '@phosphor-icons/react';
import { ref, push, update as rtdbUpdate } from 'firebase/database';
import { Sidebar } from '@/components/layout/sidebar';
import { getRtdb, dbPath, ensureAuth, pruneUndefined } from '@/lib/firebase/client';
import { useAuth } from '@/lib/use-auth';
import { isSuperAdmin } from '@/lib/admin-emails';
import { parseSwitchplanWorkbook, toSnapshotRows, toReturnedContracts, buildVehicleFields, buildLoanFields, type SwitchplanParseResult, type SwitchplanContract } from '@/lib/migrate/switchplan';
import { parseSwitchplanJbo, type JboParseResult } from '@/lib/migrate/switchplan-jbo';
import { parseSwitchplanCms, type CmsParseResult } from '@/lib/migrate/switchplan-cms';
import { reconcileSwitchplan } from '@/lib/migrate/switchplan-recon';
import { verifyMisuVsCms } from '@/lib/migrate/switchplan-verify';
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
  const [jboRes, setJboRes] = useState<JboParseResult | null>(null);
  const [jboFileName, setJboFileName] = useState('');
  const [cmsRes, setCmsRes] = useState<CmsParseResult | null>(null);
  const [cmsFileName, setCmsFileName] = useState('');
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

  async function onJboFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setJboRes(null);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseSwitchplanJbo(buf);
      setJboFileName(file.name);
      setJboRes(parsed);
      append(`자금일보 파싱 — 거래 ${parsed.totals.count}건 · 계좌 ${parsed.totals.accounts} · 계정과목 ${parsed.totals.subjects}`);
      toast.success(`자금일보 ${parsed.totals.count}건 파싱`);
    } catch (err) {
      append(`✗ 자금일보 파싱 실패: ${friendlyError(err)}`);
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

  const returnedSorted = useMemo(
    () => (res ? [...res.returned].sort((a, b) => b.carryUnpaid - a.carryUnpaid) : []),
    [res],
  );

  async function onCmsFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setCmsRes(null);
    try {
      const parsed = parseSwitchplanCms(await file.arrayBuffer());
      setCmsFileName(file.name);
      setCmsRes(parsed);
      append(`CMS 정산내역 파싱 — ${parsed.totals.count}건 · 차량태깅 ${parsed.totals.withPlate} · 성공수납 ${won(parsed.totals.collected)}`);
      toast.success(`CMS ${parsed.totals.count}건 파싱`);
    } catch (err) {
      append(`✗ CMS 파싱 실패: ${friendlyError(err)}`);
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  // 채권 ↔ 계좌+CMS 대사 (사업현황 + 자금일보 둘 다 있을 때, CMS 있으면 계약별 배분)
  const recon = useMemo(
    () => (res && jboRes ? reconcileSwitchplan(res, jboRes, cmsRes ?? undefined) : null),
    [res, jboRes, cmsRes],
  );

  // 현재 미수 검증 (사업현황 + CMS 있을 때) — CMS로 채권 미수 오류 적발
  const misuVerify = useMemo(
    () => (res && cmsRes ? verifyMisuVsCms(res, cmsRes, res.asOf, 6) : null),
    [res, cmsRes],
  );

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

  async function commitReturned() {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    if (!res) return;
    const built = toReturnedContracts(res, companyKey);
    const key = (plate: string, name: string, date: string) => `${plate.trim()}|${name.trim()}|${date}`;
    const existingKeys = new Set(contracts.map((c) => key(c.vehiclePlate ?? '', c.customerName ?? '', c.contractDate ?? '')));
    const fresh = built.filter((c) => !existingKeys.has(key(c.vehiclePlate, c.customerName, c.contractDate)));
    const dup = built.length - fresh.length;
    const chaseCount = fresh.filter((c) => c.endReason === '채권보전').length;
    if (fresh.length === 0) { toast.info(`신규 반납 이력 없음 (이미 있음 ${dup})`); return; }
    if (!await showConfirm({
      title: `반납 이력 ${fresh.length}건 커밋`,
      description:
        `종료 계약을 이력(status='반납')으로 등록 — 손바뀜 연속성.\n`
        + `채권보전(잔여미수>0, 추심 대상) ${chaseCount}건 · 잔여 합 ${won(res.totals.carryReturned)}.\n`
        + `이미 등록된 ${dup}건은 제외. 차량 상태는 건드리지 않습니다.`,
      confirmLabel: '반납 이력 커밋',
    })) return;

    setBusy(true);
    try {
      const withNos = assignContractNos(fresh, contracts, companies);
      const created = withNos.length > 0 ? await addContracts(withNos) : 0;
      append(`✓ 반납 이력 커밋 — 신규 ${created} · 채권보전 ${chaseCount} (이미 있음 ${dup} 제외)`);
      toast.success(`반납 이력 ${created}건 반영`);
    } catch (err) {
      append(`✗ 반납 커밋 실패: ${friendlyError(err)}`);
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  // 자산+할부 → 차량 마스터 upsert (plate 합집합, 직접 RTDB 배치)
  const vehiclePlan = useMemo(() => {
    if (!res) return { total: 0, update: 0, create: 0, loans: 0 };
    const existing = new Set(vehicles.map((v) => (v.plate ?? '').trim()));
    const plates = new Set([...res.vehicles.map((v) => v.vehiclePlate.trim()), ...res.loans.map((l) => l.vehiclePlate.trim())]);
    let update = 0;
    let create = 0;
    for (const p of plates) { if (existing.has(p)) update++; else create++; }
    return { total: plates.size, update, create, loans: res.loans.filter((l) => !l.cashOnly).length };
  }, [res, vehicles]);

  async function commitVehicles() {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    if (!res || (res.vehicles.length === 0 && res.loans.length === 0)) { toast.info('자산·할부 데이터 없음'); return; }
    if (!await showConfirm({
      title: `자산·할부 ${vehiclePlan.total}대 → 차량 마스터`,
      description:
        `차대번호·연식·배기량·트림·취득원가 + 할부(금융사·원금·총상환·월납)를 반영.\n`
        + `기존 차량 갱신 ${vehiclePlan.update} · 신규 ${vehiclePlan.create} · 할부 ${vehiclePlan.loans}대. 기존 상태·계약연결은 보존.`,
      confirmLabel: '차량 마스터 반영',
    })) return;

    setBusy(true);
    try {
      await ensureAuth();
      const db = getRtdb();
      if (!db) throw new Error('Firebase 미설정');
      const nowIso = new Date().toISOString();
      const existingByPlate = new Map(vehicles.map((v) => [(v.plate ?? '').trim(), v]));
      const assetByPlate = new Map(res.vehicles.map((a) => [a.vehiclePlate.trim(), a]));
      const loanByPlate = new Map(res.loans.map((l) => [l.vehiclePlate.trim(), l]));
      const plates = new Set([...assetByPlate.keys(), ...loanByPlate.keys()]);
      const batch: Record<string, unknown> = {};
      let updated = 0;
      let created = 0;
      for (const plate of plates) {
        const asset = assetByPlate.get(plate);
        const loan = loanByPlate.get(plate);
        const fields = asset ? buildVehicleFields(asset, companyKey) : { plate, company: companyKey };
        const loanFields = loan ? buildLoanFields(loan) : {};
        const existing = existingByPlate.get(plate);
        if (existing) {
          batch[existing.id] = pruneUndefined({ ...existing, ...fields, ...loanFields, id: existing.id, status: existing.status, createdAt: existing.createdAt });
          updated++;
        } else {
          const id = push(ref(db, dbPath('vehicles'))).key;
          if (!id) continue;
          batch[id] = pruneUndefined({ model: '미정', ...fields, ...loanFields, id, status: '휴차대기', createdAt: nowIso });
          created++;
        }
      }
      await rtdbUpdate(ref(db, dbPath('vehicles')), batch);
      append(`✓ 자산·할부 커밋 — 차량 갱신 ${updated} · 신규 ${created} · 할부 ${vehiclePlan.loans}`);
      toast.success(`차량 마스터 ${updated + created}대 반영`);
    } catch (err) {
      append(`✗ 자산 커밋 실패: ${friendlyError(err)}`);
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

          {/* 사전 점검 */}
          {res && (
            <section className="detail-section">
              <div className="detail-section-header">
                <CheckCircle size={13} weight="duotone" style={{ color: 'var(--green-text)' }} />
                <span className="title">사전 점검 · 미수 기준일 {res.asOf}</span>
              </div>
              <div className="detail-section-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, fontSize: 12 }}>
                  {[
                    { label: '채권(운행중)', n: res.totals.countCurrent, base: 102 },
                    { label: '반납(종료)', n: res.totals.countReturned, base: 75 },
                    { label: '자산(차량)', n: res.vehicles.length, base: 163 },
                    { label: '상환합계(할부)', n: res.loans.length, base: 157 },
                    { label: '등록번호 매칭', n: res.current.filter((c) => c.customerIdentNo).length, base: res.totals.countCurrent },
                  ].map((c) => (
                    <div key={c.label} style={{ padding: 8, background: 'var(--bg-sunken)', borderRadius: 'var(--radius)' }}>
                      <div style={{ color: 'var(--text-weak)', fontSize: 11, marginBottom: 2 }}>{c.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: c.n > 0 ? 'var(--brand)' : 'var(--red-text)' }}>
                        {c.n > 0 ? '✓ ' : '⚠ '}{c.n}
                      </div>
                      <div style={{ color: 'var(--text-weak)', fontSize: 10 }}>직전 {c.base}</div>
                    </div>
                  ))}
                </div>
                {res.warnings.length > 0 && (
                  <div className="notice notice--error" style={{ marginTop: 10, fontSize: 12 }}>
                    <Warning size={13} weight="fill" style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    {res.warnings.join(' · ')}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-weak)', marginTop: 8, lineHeight: 1.6 }}>
                  건수가 「직전」과 비슷하면 정상(최신화). 어느 항목이 <b>0(⚠)</b>이거나 크게 다르면 그 시트명·헤더가 바뀐 것 → 파일 확인.
                </div>
              </div>
            </section>
          )}

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

          {/* 종료 계약 (반납 이력) */}
          {res && res.returned.length > 0 && (
            <section className="detail-section">
              <div className="detail-section-header">
                <span className="title">5. 종료 계약 이력 ({res.returned.length}건 · 추심대상 {res.returned.filter((c) => c.carryUnpaid > 0).length}건)</span>
              </div>
              <div className="detail-section-body" style={{ padding: 0 }}>
                <div style={{ maxHeight: 320, overflow: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1 }}>
                      <tr style={{ color: 'var(--text-weak)', fontSize: 11, textAlign: 'right', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '6px 8px' }}>차량번호</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px' }}>계약자</th>
                        <th style={{ padding: '6px 8px' }}>대여료</th>
                        <th style={{ padding: '6px 8px' }}>잔여미수(carry)</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px' }}>구분</th>
                      </tr>
                    </thead>
                    <tbody>
                      {returnedSorted.slice(0, 20).map((c, i) => (
                        <tr key={`${c.vehiclePlate}-r${i}`} style={{ textAlign: 'right', borderBottom: '1px solid var(--border-weak)', background: c.carryUnpaid > 0 ? 'var(--bg-sunken)' : undefined }}>
                          <td style={{ textAlign: 'left', padding: '5px 8px', fontVariantNumeric: 'tabular-nums' }}>{c.vehiclePlate}</td>
                          <td style={{ textAlign: 'left', padding: '5px 8px' }}>{c.customerName}</td>
                          <td style={{ padding: '5px 8px', fontVariantNumeric: 'tabular-nums' }}>{won(c.monthlyRent)}</td>
                          <td style={{ padding: '5px 8px', fontWeight: c.carryUnpaid > 0 ? 700 : 400, color: c.carryUnpaid > 0 ? 'var(--red-text)' : 'var(--text-weak)', fontVariantNumeric: 'tabular-nums' }}>{won(c.carryUnpaid)}</td>
                          <td style={{ textAlign: 'left', padding: '5px 8px', fontSize: 10, color: c.carryUnpaid > 0 ? 'var(--red-text)' : 'var(--text-weak)' }}>{c.carryUnpaid > 0 ? '채권보전(추심)' : '정상종료'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
                  {returnedSorted.length > 20 && <div style={{ fontSize: 11, color: 'var(--text-weak)' }}>… 외 {returnedSorted.length - 20}건</div>}
                  <button
                    className="btn" type="button"
                    disabled={busy || !superAdmin}
                    onClick={commitReturned}
                    style={{ height: 40, fontSize: 13, fontWeight: 600 }}
                  >
                    <Upload weight="bold" size={15} /> 반납 이력 {res.returned.length}건 커밋 (손바뀜 연속성 + 추심 잔여)
                  </button>
                  <div style={{ fontSize: 11, color: 'var(--text-weak)', lineHeight: 1.6 }}>
                    ✓ status='반납' 이력으로 등록 — 차량 상세에 과거 임차인 이력 연속 표시<br />
                    ✓ 잔여미수(carry)&gt;0 → endReason='채권보전'(추심 대상), 리스크/미수 화면에 노출<br />
                    ✓ 차량번호+계약자+계약일 중복은 자동 제외 · 차량 상태는 안 건드림
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 자산 → 차량 마스터 */}
          {res && res.vehicles.length > 0 && (
            <section className="detail-section">
              <div className="detail-section-header">
                <Car size={13} weight="duotone" style={{ color: 'var(--brand)' }} />
                <span className="title">6. 자산·할부 → 차량 마스터 (자산 {res.vehicles.length}대 · 할부 {res.loans.filter((l) => !l.cashOnly).length}대)</span>
              </div>
              <div className="detail-section-body" style={{ padding: 0 }}>
                <div style={{ maxHeight: 300, overflow: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1 }}>
                      <tr style={{ color: 'var(--text-weak)', fontSize: 11, textAlign: 'right', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '6px 8px' }}>차량번호</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px' }}>차종</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px' }}>차대번호</th>
                        <th style={{ padding: '6px 8px' }}>실구입가</th>
                        <th style={{ padding: '6px 8px' }}>취득부대</th>
                      </tr>
                    </thead>
                    <tbody>
                      {res.vehicles.slice(0, 15).map((a, i) => (
                        <tr key={`${a.vehiclePlate}-v${i}`} style={{ textAlign: 'right', borderBottom: '1px solid var(--border-weak)' }}>
                          <td style={{ textAlign: 'left', padding: '5px 8px', fontVariantNumeric: 'tabular-nums' }}>{a.vehiclePlate}</td>
                          <td style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text-weak)' }}>{a.fullModel || '—'}</td>
                          <td style={{ textAlign: 'left', padding: '5px 8px', fontSize: 10, color: 'var(--text-weak)', fontVariantNumeric: 'tabular-nums' }}>{a.vin || '—'}</td>
                          <td style={{ padding: '5px 8px', fontVariantNumeric: 'tabular-nums' }}>{a.purchasePrice > 0 ? won(a.purchasePrice) : '—'}</td>
                          <td style={{ padding: '5px 8px', color: 'var(--text-weak)', fontVariantNumeric: 'tabular-nums' }}>{a.acqCostTotal > 0 ? won(a.acqCostTotal) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
                  {res.vehicles.length > 15 && <div style={{ fontSize: 11, color: 'var(--text-weak)' }}>… 외 {res.vehicles.length - 15}대</div>}
                  <button
                    className="btn" type="button"
                    disabled={busy || !superAdmin}
                    onClick={commitVehicles}
                    style={{ height: 40, fontSize: 13, fontWeight: 600 }}
                  >
                    <Car weight="bold" size={15} /> 자산·할부 → 차량 마스터 (갱신 {vehiclePlan.update} · 신규 {vehiclePlan.create} · 할부 {vehiclePlan.loans})
                  </button>
                  <div style={{ fontSize: 11, color: 'var(--text-weak)', lineHeight: 1.6 }}>
                    ✓ 차량번호 기준 upsert — 차대번호·제조사·트림·연식·배기량·색상·실구입가 반영<br />
                    ✓ 할부: 금융사·할부원금·총상환·월납입(총상환/개월) 반영 · 현금차량 표시 (원금/이자 회차분리는 금융사 상환스케줄표 PDF에서)<br />
                    ✓ 취득 부대비용은 비고에 내역 보존 · 기존 상태/계약연결 불변
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 자금일보 (별도 파일 · 프리뷰) */}
          <section className="detail-section">
            <div className="detail-section-header">
              <Database size={13} weight="duotone" style={{ color: 'var(--brand)' }} />
              <span className="title">7. 자금일보 (별도 파일 · 현금흐름 프리뷰)</span>
            </div>
            <div className="detail-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label className="btn" style={{ height: 36, fontSize: 12, cursor: busy ? 'default' : 'pointer' }}>
                  <FileXls weight="bold" size={14} /> 자금일보.xlsx 선택
                  <input type="file" accept=".xlsx,.xls" hidden disabled={busy} onChange={onJboFile} />
                </label>
                {jboFileName && <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>{jboFileName}</span>}
                <label className="btn" style={{ height: 36, fontSize: 12, cursor: busy ? 'default' : 'pointer', marginLeft: 8 }}>
                  <FileXls weight="bold" size={14} /> CMS 정산내역 선택
                  <input type="file" accept=".xlsx,.xls" hidden disabled={busy} onChange={onCmsFile} />
                </label>
                {cmsFileName && <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>{cmsFileName} · 성공 {won(cmsRes?.totals.collected ?? 0)}</span>}
              </div>

              {jboRes && (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.7 }}>
                    거래 <b>{jboRes.totals.count.toLocaleString()}</b>건 · {jboRes.totals.dateFrom}~{jboRes.totals.dateTo} · 계좌 {jboRes.totals.accounts} · 계정과목 {jboRes.totals.subjects}종<br />
                    실입금(자금이동 제외) <b style={{ color: 'var(--green-text)' }}>{won(jboRes.totals.realDeposit)}</b> · 실출금 <b style={{ color: 'var(--red-text)' }}>{won(jboRes.totals.realWithdraw)}</b> · 계좌간이체(sweep) {won(jboRes.totals.sweepDeposit)}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-weak)', marginBottom: 4 }}>계좌별</div>
                      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                        <thead><tr style={{ color: 'var(--text-weak)', textAlign: 'right' }}>
                          <th style={{ textAlign: 'left', padding: '3px 6px' }}>계좌</th><th style={{ padding: '3px 6px' }}>입금</th><th style={{ padding: '3px 6px' }}>출금</th>
                        </tr></thead>
                        <tbody>
                          {jboRes.byAccount.map((a) => (
                            <tr key={a.account} style={{ textAlign: 'right', borderTop: '1px solid var(--border-weak)' }}>
                              <td style={{ textAlign: 'left', padding: '3px 6px' }}>{a.account}</td>
                              <td style={{ padding: '3px 6px', color: 'var(--green-text)', fontVariantNumeric: 'tabular-nums' }}>{won(a.deposit)}</td>
                              <td style={{ padding: '3px 6px', color: 'var(--red-text)', fontVariantNumeric: 'tabular-nums' }}>{won(a.withdraw)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-weak)', marginBottom: 4 }}>계정과목 Top 12 (입출 합)</div>
                      <div style={{ maxHeight: 230, overflow: 'auto' }}>
                        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                          <thead style={{ position: 'sticky', top: 0, background: 'var(--bg)' }}><tr style={{ color: 'var(--text-weak)', textAlign: 'right' }}>
                            <th style={{ textAlign: 'left', padding: '3px 6px' }}>계정과목</th><th style={{ padding: '3px 6px' }}>입금</th><th style={{ padding: '3px 6px' }}>출금</th><th style={{ padding: '3px 6px' }}>건</th>
                          </tr></thead>
                          <tbody>
                            {jboRes.bySubject.slice(0, 12).map((s) => (
                              <tr key={s.subject} style={{ textAlign: 'right', borderTop: '1px solid var(--border-weak)' }}>
                                <td style={{ textAlign: 'left', padding: '3px 6px' }}>{s.subject}</td>
                                <td style={{ padding: '3px 6px', color: s.deposit > 0 ? 'var(--green-text)' : 'var(--text-weak)', fontVariantNumeric: 'tabular-nums' }}>{s.deposit > 0 ? won(s.deposit) : '—'}</td>
                                <td style={{ padding: '3px 6px', color: s.withdraw > 0 ? 'var(--red-text)' : 'var(--text-weak)', fontVariantNumeric: 'tabular-nums' }}>{s.withdraw > 0 ? won(s.withdraw) : '—'}</td>
                                <td style={{ padding: '3px 6px', color: 'var(--text-weak)', fontVariantNumeric: 'tabular-nums' }}>{s.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className="notice" style={{ fontSize: 11, color: 'var(--text-weak)', lineHeight: 1.6, background: 'var(--bg-sunken)', padding: 10, borderRadius: 'var(--radius)' }}>
                    <Warning size={12} weight="fill" style={{ marginRight: 4, verticalAlign: 'middle', color: 'var(--orange-text)' }} />
                    프리뷰 전용입니다. 자금일보를 bankTransactions로 커밋 + 수납 자동매칭하면, 씨앗 미수(carry)가 이미 2026 입금을 반영하고 있어 <b>미수가 이중 차감</b>될 수 있습니다. 실제 DB 반영은 期初 실현(realizeOpeningBalance) 경로 검증 후 별도로 진행합니다.
                  </div>
                </>
              )}
            </div>
          </section>

          {/* 채권 ↔ 계좌·CMS 대사 (둘 다 업로드 시) */}
          {recon && (
            <section className="detail-section">
              <div className="detail-section-header">
                <CheckCircle size={13} weight="duotone" style={{ color: 'var(--brand)' }} />
                <span className="title">8. 채권 ↔ 계좌·CMS 대사 ({recon.period.from}~{recon.period.to} · 매칭율 {(recon.totals.matchRate * 100).toFixed(1)}%)</span>
              </div>
              <div className="detail-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.7 }}>
                  사업현황 채권 결제 <b>{won(recon.totals.bizPaid)}</b> vs 계좌 실입금(계약별) <b>{won(recon.totals.jboTotal)}</b> · 차량 {recon.totals.plates}대(양쪽 {recon.totals.bothPlates})<br />
                  계좌 채널: 대여료 {won(recon.totals.rent)} · 보증금 {won(recon.totals.deposit)} · 기타 {won(recon.totals.other)}
                  {recon.hasCms && <> · <span style={{ color: 'var(--green-text)' }}>CMS성공 {won(recon.totals.cmsSuccess)}</span> · <span style={{ color: 'var(--red-text)' }}>CMS실패 {won(recon.totals.cmsFailed)}</span></>}
                </div>

                {!recon.hasCms ? (
                  <div className="notice" style={{ fontSize: 12, background: 'var(--bg-sunken)', padding: 12, borderRadius: 'var(--radius)', lineHeight: 1.6 }}>
                    <Warning size={13} weight="fill" style={{ marginRight: 6, verticalAlign: 'middle', color: 'var(--orange-text)' }} />
                    직접 대여료는 이미 계약별로 붙어 대사됩니다. 위 <b>「CMS 정산내역 선택」</b>으로 CMS 파일을 올리면 <b>결제성공/실패(미수 신호)</b>를 계약별로 함께 봅니다. (은행 CMS뭉텅이 {won(recon.totals.cmsLumpBank)}·카드뭉텅이 {won(recon.totals.cardLumpBank)})
                  </div>
                ) : (
                  <div className="notice" style={{ fontSize: 12, background: 'var(--bg-sunken)', padding: 12, borderRadius: 'var(--radius)', lineHeight: 1.6 }}>
                    <CheckCircle size={13} weight="fill" style={{ marginRight: 6, verticalAlign: 'middle', color: 'var(--green-text)' }} />
                    실측 결론: CMS 집금 대부분이 이미 자금일보 <b>대여료로 태깅</b>돼 있어(겹침 <b>{recon.totals.overlapCount}건</b> 이중계상 방지) — 채권↔계좌는 <b>직접대여료로 대사</b>됩니다.
                    <br /><span style={{ color: 'var(--text-weak)' }}>CMS 결제실패(최종미납) {won(recon.totals.cmsFailed)}은 대부분 <b>재결제·직접납부로 해소</b>돼 실제 미수와 다름 — 참고 지표일 뿐, <b>실미수는 채권 carry(씨앗)가 정본</b>.</span>
                  </div>
                )}

                <div style={{ maxHeight: 380, overflow: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1 }}>
                      <tr style={{ color: 'var(--text-weak)', fontSize: 11, textAlign: 'right', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '6px 8px' }}>차량번호</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px' }}>임차인</th>
                        <th style={{ padding: '6px 8px' }}>채권 결제</th>
                        <th style={{ padding: '6px 8px' }}>계좌 실입금</th>
                        <th style={{ padding: '6px 8px' }}>차이</th>
                        {recon.hasCms && <th style={{ padding: '6px 8px' }}>CMS실패</th>}
                        <th style={{ textAlign: 'left', padding: '6px 8px' }}>상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recon.rows.slice(0, 60).map((r, i) => (
                        <tr key={`${r.plate}-rc${i}`} style={{ textAlign: 'right', borderBottom: '1px solid var(--border-weak)', background: r.status !== '일치' ? 'var(--bg-sunken)' : undefined }}>
                          <td style={{ textAlign: 'left', padding: '5px 8px', fontVariantNumeric: 'tabular-nums' }}>{r.plate}</td>
                          <td style={{ textAlign: 'left', padding: '5px 8px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.bizTenants || r.jboTenants || '—'}</td>
                          <td style={{ padding: '5px 8px', fontVariantNumeric: 'tabular-nums' }}>{won(r.bizPaid)}</td>
                          <td style={{ padding: '5px 8px', fontVariantNumeric: 'tabular-nums' }}>{won(r.jboTotal)}</td>
                          <td style={{ padding: '5px 8px', fontVariantNumeric: 'tabular-nums', color: Math.abs(r.diff) > 300000 ? 'var(--orange-text)' : 'var(--text-weak)' }}>{won(r.diff)}</td>
                          {recon.hasCms && <td style={{ padding: '5px 8px', fontVariantNumeric: 'tabular-nums', color: r.cmsFailed > 0 ? 'var(--red-text)' : 'var(--text-weak)' }}>{r.cmsFailed > 0 ? won(r.cmsFailed) : '—'}</td>}
                          <td style={{ textAlign: 'left', padding: '5px 8px', fontSize: 10, color: r.status === '일치' ? 'var(--green-text)' : 'var(--orange-text)' }}>{r.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-weak)', lineHeight: 1.6 }}>
                  「일치」 = 채권 결제 ≈ 계좌 실입금 · 「채권&gt;계좌」 = 월경계 시점차·보증금/정산 혼입·카드뭉텅이 등(대부분 노이즈) · 「채권만」 = 이 기간 계좌 입금 없음(종료·선납·연체) · CMS실패 열 = 참고(재결제·직접납부로 대부분 해소, 미수 아님)
                </div>
              </div>
            </section>
          )}

          {/* 현재 미수 검증 (채권 ↔ CMS) */}
          {misuVerify && (
            <section className="detail-section">
              <div className="detail-section-header">
                <CheckCircle size={13} weight="duotone" style={{ color: misuVerify.summary.falseMisuCount > 0 ? 'var(--orange-text)' : 'var(--green-text)' }} />
                <span className="title">9. 현재 미수 검증 (채권 ↔ CMS) · {misuVerify.window.from}~{misuVerify.window.to} · {misuVerify.summary.checked}계약 검증</span>
              </div>
              <div className="detail-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {misuVerify.summary.falseMisuCount === 0 ? (
                  <div className="notice" style={{ fontSize: 12, background: 'var(--bg-sunken)', padding: 12, borderRadius: 'var(--radius)', lineHeight: 1.6 }}>
                    <CheckCircle size={13} weight="fill" style={{ marginRight: 6, verticalAlign: 'middle', color: 'var(--green-text)' }} />
                    <b>✓ 허수 미수 오류 0건</b> — CMS가 걷은 건 채권에 모두 반영돼 있습니다(돈 받았는데 미수로 남긴 게 없음). <b>직원 미수 정리가 CMS와 일치.</b>
                    <br /><span style={{ color: 'var(--text-weak)' }}>참고: CMS 최종 미수납인데 채권 미수 적은 「누락참고」 {misuVerify.summary.missingRefCount}건 — 대부분 직접납부로 해소된 것(오탐), 아래 참고.</span>
                  </div>
                ) : (
                  <div className="notice notice--error" style={{ fontSize: 12, lineHeight: 1.6 }}>
                    <Warning size={13} weight="fill" style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    <b>⚠ 허수 미수 의심 {misuVerify.summary.falseMisuCount}건 · {won(misuVerify.summary.falseMisuAmount)}</b> — CMS가 걷었는데 채권엔 미납으로 남음(수납 기록 누락). 아래 계약 확인 필요.
                  </div>
                )}

                {(misuVerify.summary.falseMisuCount > 0 || misuVerify.summary.missingRefCount > 0) && (
                  <div style={{ maxHeight: 320, overflow: 'auto' }}>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1 }}>
                        <tr style={{ color: 'var(--text-weak)', fontSize: 11, textAlign: 'right', borderBottom: '1px solid var(--border)' }}>
                          <th style={{ textAlign: 'left', padding: '6px 8px' }}>차량번호</th>
                          <th style={{ textAlign: 'left', padding: '6px 8px' }}>임차인</th>
                          <th style={{ padding: '6px 8px' }}>채권 미수</th>
                          <th style={{ padding: '6px 8px' }}>허수(CMS걷힘)</th>
                          <th style={{ padding: '6px 8px' }}>CMS최종미납</th>
                          <th style={{ textAlign: 'left', padding: '6px 8px' }}>판정</th>
                        </tr>
                      </thead>
                      <tbody>
                        {misuVerify.rows.filter((r) => r.verdict === '허수의심' || r.verdict === '누락참고').slice(0, 60).map((r, i) => (
                          <tr key={`${r.plate}-mv${i}`} style={{ textAlign: 'right', borderBottom: '1px solid var(--border-weak)', background: r.verdict === '허수의심' ? 'var(--bg-sunken)' : undefined }}>
                            <td style={{ textAlign: 'left', padding: '5px 8px', fontVariantNumeric: 'tabular-nums' }}>{r.plate}</td>
                            <td style={{ textAlign: 'left', padding: '5px 8px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.tenant}</td>
                            <td style={{ padding: '5px 8px', fontVariantNumeric: 'tabular-nums' }}>{won(r.staffMisu)}</td>
                            <td style={{ padding: '5px 8px', fontVariantNumeric: 'tabular-nums', color: r.falseMisu > 0 ? 'var(--red-text)' : 'var(--text-weak)' }}>{r.falseMisu > 0 ? won(r.falseMisu) : '—'}</td>
                            <td style={{ padding: '5px 8px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-weak)' }}>{r.cmsFinalUnpaid > 0 ? won(r.cmsFinalUnpaid) : '—'}</td>
                            <td style={{ textAlign: 'left', padding: '5px 8px', fontSize: 10, color: r.verdict === '허수의심' ? 'var(--red-text)' : 'var(--text-weak)' }}>{r.verdict}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-weak)', lineHeight: 1.6 }}>
                  「허수의심」 = 그 달 CMS가 실제 걷혔는데 채권은 미납 → <b>직원이 미수 잘못 잡음(고쳐야 함)</b> · 「누락참고」 = CMS 최종 미수납인데 채권 미수 적음 → 직접납부면 정상(오탐 많음, 참고만)
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
