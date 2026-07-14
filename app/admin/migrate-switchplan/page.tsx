'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, Upload, Warning, CheckCircle, FileXls, ArrowsDownUp, Car } from '@phosphor-icons/react';
import { ref, push, get, update as rtdbUpdate } from 'firebase/database';
import { Sidebar } from '@/components/layout/sidebar';
import { getRtdb, dbPath, ensureAuth, pruneUndefined } from '@/lib/firebase/client';
import { BusyButton } from '@/components/ui/spinner';
import { useAuth } from '@/lib/use-auth';
import { isSuperAdmin } from '@/lib/admin-emails';
import { parseSwitchplanWorkbook, toSnapshotRows, toReturnedContracts, buildVehicleFields, buildLoanFields, type SwitchplanParseResult, type SwitchplanContract } from '@/lib/migrate/switchplan';
import { parseSwitchplanJbo, type JboParseResult } from '@/lib/migrate/switchplan-jbo';
import { parseSwitchplanCms, type CmsParseResult } from '@/lib/migrate/switchplan-cms';
import { reconcileSwitchplan } from '@/lib/migrate/switchplan-recon';
import { verifyMisuVsCms } from '@/lib/migrate/switchplan-verify';
import { validateSnapshotRow, applySnapshotToContract } from '@/lib/import-commit';
import { assignContractNos } from '@/lib/code-scheme';
import { upsertVehicleFromContract, normPlate } from '@/lib/entity-sync';
import { isContractEnded } from '@/lib/contract-lifecycle';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useBankTx } from '@/lib/firebase/transactions-store';
import { bankTxKeys } from '@/lib/dedup-keys';
import { mapJboSubject } from '@/lib/migrate/jbo-subject-map';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';
import { friendlyError } from '@/lib/friendly-error';
import type { Contract, BankTransaction, Vehicle, VehicleStatus } from '@/lib/types';

const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');

export default function MigrateSwitchplanPage() {
  const router = useRouter();
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user?.email);
  useEffect(() => { if (user && !superAdmin) router.replace('/'); }, [user, superAdmin, router]);

  const { contracts, addMany: addContracts, updateMany: updateContracts } = useContracts();
  const { vehicles, add: addVehicle, update: updateVehicle } = useVehicles();
  const { companies } = useCompanies();
  const { rows: existingBankTx, addMany: addBankTx, updateMany: updateManyBankTx } = useBankTx();

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

  // 마이그레이션 차량상태 = 계약 상태에서 파생하는 단일 헬퍼(파이프라인 통일).
  //   운행중 계약 있는 plate → '운행', 그 외(종료만/무계약) → '휴차대기'(유휴).
  //   ※ 앱 일상흐름의 "인도까지 휴차"와 달리, 마이그레이션은 이미 인도된 과거 계약이라 운행 반영.
  //   유효 자산(현보유) = 채권(활성) 시트 전체 plate — 실계약(res.current)뿐 아니라 코드명 없는 빈행(2번째차)까지.
  //   res.current(실계약 102)만 쓰면 유효자산이 과소(사업현황 118과 불일치)라 res.activePlates 사용.
  //   비보유(자산시트에 있으나 활성 아님) = '매각'(처분) — '휴차대기'로 넣으면 운영현황이 휴차행으로 편입해 129 부풀림.
  const activePlates = useMemo(() => {
    const s = new Set<string>();
    if (res) for (const p of res.activePlates) if (p) s.add(normPlate(p));
    return s;
  }, [res]);
  const migVehStatus = (plate: string | undefined): VehicleStatus =>
    plate && activePlates.has(normPlate(plate)) ? '운행' : '매각';

  // 로컬 dev — 디스크의 기존 파일(사업현황+자금일보)을 dev 서버가 읽어 자동 로드.
  // → 업로드 없이 페이지 열면 데이터 채워지고 [전체 일괄 반영] 한 번이면 끝.
  const [autoTried, setAutoTried] = useState(false);
  async function autoLoad(force = false) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/admin/migrate-source', { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) { append(`자동 불러오기 불가 (${j.error ?? 'dev 전용'})`); return; }
      const toBuf = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
      if (j.bizStatus && (force || !res)) {
        const parsed = parseSwitchplanWorkbook(toBuf(j.bizStatus.b64));
        setFileName(j.bizStatus.name); setRes(parsed);
        append(`자동 불러오기 ✓ ${j.bizStatus.name} — 운행중 ${parsed.totals.countCurrent} · 종료 ${parsed.totals.countReturned}`);
      } else if (!j.bizStatus) {
        append(`⚠ 사업현황 파일 못 찾음: ${j.bizPath}. 수동 업로드 하세요.`);
      }
      if (j.jbo && (force || !jboRes)) {
        const jbo = parseSwitchplanJbo(toBuf(j.jbo.b64));
        setJboFileName(j.jbo.name); setJboRes(jbo);
        append(`자금일보 자동 ✓ ${jbo.totals.count}건 (대사용, 미반영)`);
      }
    } catch (err) {
      append(`자동 불러오기 오류: ${friendlyError(err)} — 수동 업로드 폴백`);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!superAdmin || res || autoTried) return;
    setAutoTried(true);
    void autoLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [superAdmin, res, autoTried]);

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

  async function commitSeeds(skipConfirm = false) {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    if (!res) return;
    const rows = toSnapshotRows(res, companyKey);
    if (rows.length === 0) { toast.info('씨앗 대상 없음'); return; }
    if (!skipConfirm && !await showConfirm({
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

  async function commitReturned(skipConfirm = false) {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    if (!res) return;
    const built = toReturnedContracts(res, companyKey);
    const key = (plate: string, name: string, date: string) => `${plate.trim()}|${name.trim()}|${date}`;
    const existingKeys = new Set(contracts.map((c) => key(c.vehiclePlate ?? '', c.customerName ?? '', c.contractDate ?? '')));
    const fresh = built.filter((c) => !existingKeys.has(key(c.vehiclePlate, c.customerName, c.contractDate)));
    const dup = built.length - fresh.length;
    const chaseCount = fresh.filter((c) => c.endReason === '채권보전').length;
    if (fresh.length === 0) { toast.info(`신규 반납 이력 없음 (이미 있음 ${dup})`); return; }
    if (!skipConfirm && !await showConfirm({
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

  // 🔬 실 DB 차량 진단 — 자산현황 129 의 정확한 출처 추적 (고립 운행차 vs 계약 synthetic)
  const vehDiag = useMemo(() => {
    const live = vehicles.filter((v) => !v.deletedAt);
    const byStatus: Record<string, number> = {};
    for (const v of live) byStatus[v.status ?? '(무상태)'] = (byStatus[v.status ?? '(무상태)'] ?? 0) + 1;
    const sheetNorm = new Set<string>();
    if (res) { for (const v of res.vehicles) sheetNorm.add(normPlate(v.vehiclePlate)); for (const l of res.loans) sheetNorm.add(normPlate(l.vehiclePlate)); }
    const vehNorm = new Set(live.map((v) => normPlate(v.plate ?? '')));
    const hasSheet = sheetNorm.size > 0;
    const running = live.filter((v) => v.status === '운행');
    const runningOrphan = hasSheet ? running.filter((v) => !sheetNorm.has(normPlate(v.plate ?? ''))) : [];
    const orphans = hasSheet ? live.filter((v) => !sheetNorm.has(normPlate(v.plate ?? ''))) : [];
    const activeCon = contracts.filter((c) => !isContractEnded(c) && (c.vehiclePlate ?? '').trim());
    const conSyn = activeCon.filter((c) => !vehNorm.has(normPlate(c.vehiclePlate ?? '')));
    return {
      dbVehicles: live.length, byStatus, running: running.length,
      runningOrphan: runningOrphan.length, runningOrphanSample: runningOrphan.slice(0, 12).map((v) => v.plate),
      orphans: orphans.length,
      activeContracts: activeCon.length, conSyn: conSyn.length, conSynSample: conSyn.slice(0, 12).map((c) => c.vehiclePlate),
    };
  }, [vehicles, contracts, res]);

  async function commitVehicles(skipConfirm = false) {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    if (!res || (res.vehicles.length === 0 && res.loans.length === 0)) { toast.info('자산·할부 데이터 없음'); return; }
    if (!skipConfirm && !await showConfirm({
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
      // fresh 조회 — commitAll 체인에서 commitSeeds 가 방금 만든 차량이 stale 훅 상태엔 없어
      //   중복 생성·정합 누락되던 것 방지 (적대검증 B-2). 훅 대신 RTDB 즉시 read.
      const vehSnap = await get(ref(db, dbPath('vehicles')));
      const liveVehicles = Object.values((vehSnap.val() ?? {}) as Record<string, Vehicle>);
      // normPlate 키 — "01도 9893" vs "01도9893" 표기 차이로 중복 생성·매칭 실패 방지
      const existingByPlate = new Map(liveVehicles.map((v) => [normPlate(v.plate ?? ''), v]));
      const assetByPlate = new Map(res.vehicles.map((a) => [normPlate(a.vehiclePlate), a]));
      const loanByPlate = new Map(res.loans.map((l) => [normPlate(l.vehiclePlate), l]));
      const plates = new Set([...assetByPlate.keys(), ...loanByPlate.keys()]);
      const batch: Record<string, unknown> = {};
      let updated = 0;
      let created = 0;
      let heldN = 0;  // 운행(현보유)
      let idleN = 0;  // 휴차대기(유휴)
      for (const plate of plates) {
        const asset = assetByPlate.get(plate);
        const loan = loanByPlate.get(plate);
        const fields = asset ? buildVehicleFields(asset, companyKey) : { plate, company: companyKey };
        const loanFields = loan ? buildLoanFields(loan) : {};
        const existing = existingByPlate.get(plate);
        const st = migVehStatus(plate);
        if (st === '운행') heldN++; else idleN++;
        if (existing) {
          batch[existing.id] = pruneUndefined({ ...existing, ...fields, ...loanFields, id: existing.id, status: st, createdAt: existing.createdAt });
          updated++;
        } else {
          const id = push(ref(db, dbPath('vehicles'))).key;
          if (!id) continue;
          batch[id] = pruneUndefined({ model: '미정', ...fields, ...loanFields, id, status: st, createdAt: nowIso });
          created++;
        }
      }
      // 고립 차량 정화 — 현재 사업현황(자산∪할부)에 없는 기존 차량 = 이전 버전 마이그레이션·템플릿 잔재.
      //   '매각'(비보유)으로 → 운영현황·현보유 카운트에서 제외. 삭제 아님(원본 보존·복구가능).
      let deactivated = 0;
      for (const v of liveVehicles) {
        const vp = normPlate(v.plate ?? '');
        if (!vp || plates.has(vp)) continue;                         // 현재 fleet 이면 유지
        if (v.company && companyKey && v.company !== companyKey) continue; // 타 회사 차량 보호
        if (v.status === '매각') continue;                            // 이미 비보유
        batch[`${v.id}/status`] = '매각';                             // status 만 경로 패치
        deactivated++;
      }
      await rtdbUpdate(ref(db, dbPath('vehicles')), batch);
      append(`✓ 자산·할부 커밋 — 총 ${updated + created}대 (갱신 ${updated}·신규 ${created}) · 현보유(운행) ${heldN} · 비보유(매각) ${idleN} · 고립 매각처리 ${deactivated} · 할부 ${vehiclePlan.loans}`);
      toast.success(`차량 ${updated + created}대 반영 — 현보유 ${heldN} · 비보유 ${idleN}${deactivated > 0 ? ` · 고립 ${deactivated}` : ''}`);
    } catch (err) {
      append(`✗ 자산 커밋 실패: ${friendlyError(err)}`);
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  // 자금일보 → 재무관리 (bankTransactions) 반영. **자동매칭 안 함** — carry 씨앗이 이미 입금 반영이라
  //   매칭하면 미수 이중차감. 거래 이력만 넣어 재무관리에 계좌/CMS 거래가 뜨게. dedup(bankTxKeys)로 재실행 안전.
  async function commitJboToBank(skipConfirm = false) {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    if (!jboRes) { toast.info('자금일보 없음 — 먼저 불러오세요'); return; }
    const bank = (s: string) => /신한/.test(s) ? '신한' : /농협/.test(s) ? '농협' : /국민|kb/i.test(s) ? 'KB' : /우리/.test(s) ? '우리' : /하나/.test(s) ? '하나' : undefined;
    const mapped: Array<Omit<BankTransaction, 'id'>> = jboRes.transactions.map((t) => ({
      txDate: t.date,
      amount: t.deposit,
      withdraw: t.withdraw || undefined,
      counterparty: (t.detail || t.memo || '').slice(0, 60),
      memo: t.memo || undefined,
      source: bank(t.account),
      account: t.account,
      companyCode: companyKey,
      subject: mapJboSubject(t.subject),   // 자금일보 원문 → 재무 enum 정규화 (드롭다운·GL 정합)
      linkedVehiclePlate: t.plate || undefined,
      linkedCustomerName: t.tenant || undefined,
    }));
    const existKeys = new Set(existingBankTx.flatMap((tx) => bankTxKeys(tx).filter(Boolean)));
    const fresh = mapped.filter((tx) => !bankTxKeys(tx).some((k) => k && existKeys.has(k)));
    const dup = mapped.length - fresh.length;
    if (fresh.length === 0) { toast.info(`신규 거래 없음 (이미 있음 ${dup})`); return; }
    if (!skipConfirm && !await showConfirm({
      title: `자금일보 → 재무관리 ${fresh.length}건 반영`,
      description:
        `계좌 거래(입금·출금·자금이동)를 재무관리에 등록 — 이미 있음 ${dup}건 제외.\n`
        + `⚠ 자동매칭 안 함 → 미수 영향 없음(carry 씨앗 이중차감 방지). 필요 시 재무관리에서 계약 수동매칭.`,
      confirmLabel: '재무 반영',
    })) return;
    setBusy(true);
    try {
      await addBankTx(fresh);
      append(`✓ 자금일보 → 재무관리 ${fresh.length}건 반영 (매칭 X · 이미 있음 ${dup} 제외)`);
      toast.success(`재무관리 ${fresh.length}건 반영`);
    } catch (err) {
      append(`✗ 재무 반영 실패: ${friendlyError(err)}`);
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  // 보유 확정 — DB 의 이 회사 차량 전체를 사업현황 기준으로 정렬: 채권(활성) plate = '운행'(현보유),
  //   그 외 전부 '매각'(비보유). 상태만 patch(다른 필드 보존). 템플릿·이전 잔재가 뭐가 남아있든 강제 정합.
  async function commitHeldOnly(skipConfirm = false) {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    if (!res || activePlates.size === 0) { toast.info('사업현황을 먼저 불러오세요'); return; }
    setBusy(true);
    try {
      await ensureAuth();
      const db = getRtdb();
      if (!db) throw new Error('Firebase 미설정');
      // fresh 조회 — commitAll 체인에서 seeds/자산커밋이 방금 만든 차량까지 전부 정합 (stale 훅 금지)
      const vehSnap = await get(ref(db, dbPath('vehicles')));
      const liveVehicles = Object.values((vehSnap.val() ?? {}) as Record<string, Vehicle>);
      let toHeld = 0, toSold = 0;
      // status 만 경로 패치 — 객체 전체 덮어쓰기 금지 (방금 커밋한 차대번호·가격 보존)
      const batch: Record<string, unknown> = {};
      for (const v of liveVehicles) {
        if (v.deletedAt) continue;
        if (v.company && companyKey && v.company !== companyKey) continue; // 타 회사 보호
        const want: VehicleStatus = activePlates.has(normPlate(v.plate ?? '')) ? '운행' : '매각';
        if (v.status === want) continue;
        batch[`${v.id}/status`] = want;
        if (want === '운행') toHeld++; else toSold++;
      }
      if (Object.keys(batch).length === 0) {
        append(`✓ 보유 확정 — 이미 정합 (현보유 ${activePlates.size}대 기준, DB ${liveVehicles.length}대)`);
        if (!skipConfirm) toast.info(`이미 정합 — 현보유 ${activePlates.size}대 기준`);
        return;
      }
      if (!skipConfirm && !await showConfirm({
        title: `보유 확정 — 현보유 ${activePlates.size}대만 운행`,
        description: `DB 차량(${liveVehicles.length}대) 상태를 사업현황(채권 활성 plate) 기준으로 강제 정렬:\n· 운행 전환 ${toHeld}대 · 매각(비보유) 전환 ${toSold}대\n다른 필드는 보존, 상태만 변경. 재실행 안전(멱등).`,
        confirmLabel: '보유 확정',
      })) return;
      await rtdbUpdate(ref(db, dbPath('vehicles')), batch);
      append(`✓ 보유 확정 — 운행 전환 ${toHeld} · 매각 전환 ${toSold} (기준: 현보유 ${activePlates.size} · DB ${liveVehicles.length}대)`);
      toast.success(`보유 확정 — 운행 ${toHeld} · 매각 ${toSold} 전환`);
    } catch (err) {
      append(`✗ 보유 확정 실패: ${friendlyError(err)}`);
      toast.error(friendlyError(err));
    } finally { setBusy(false); }
  }

  // 기존 재무관리 거래의 계정과목을 자금일보 원문 → 재무 enum 으로 재매핑 (매핑 도입 전 raw 정리).
  //   mapJboSubject 는 idempotent — 이미 enum 값이면 그대로. subject 만 patch(금액·매칭·미수 무관).
  async function remapExistingSubjects(skipConfirm = false) {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    const patches: Record<string, Partial<BankTransaction>> = {};
    for (const tx of existingBankTx) {
      if (!tx.subject) continue;
      const mapped = mapJboSubject(tx.subject);
      if (mapped && mapped !== tx.subject) patches[tx.id] = { subject: mapped };
    }
    const count = Object.keys(patches).length;
    if (count === 0) { toast.info('재매핑할 계정과목 없음 (이미 정규화됨)'); return; }
    if (!skipConfirm && !await showConfirm({
      title: `계정과목 재매핑 ${count}건`,
      description: '기존 재무관리 거래의 계정과목을 자금일보 원문(대여료·이체수수료·할부금 등) → 재무 표준(대여료수입·수수료·할부금납부 등)으로 정규화합니다. 금액·매칭·미수 영향 없음.',
      confirmLabel: '재매핑',
    })) return;
    setBusy(true);
    try {
      await updateManyBankTx(patches);
      append(`✓ 계정과목 재매핑 ${count}건 (자금일보 원문 → enum)`);
      toast.success(`계정과목 재매핑 ${count}건`);
    } catch (err) {
      append(`✗ 재매핑 실패: ${friendlyError(err)}`);
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  // 1900년대 날짜 보정 — 엑셀 2자리 연도 버그로 <1990 저장된 계약일·만기일 +100년. 멱등(재실행 안전).
  async function commitFix1900(skipConfirm = false) {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    const shift = (d?: string): string | undefined => {
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return undefined;
      const y = parseInt(d.slice(0, 4), 10);
      return y < 1990 ? `${y + 100}${d.slice(4)}` : undefined;
    };
    const patches: Contract[] = [];
    for (const c of contracts) {
      const cd = shift(c.contractDate);
      const rd = shift(c.returnScheduledDate);
      if (cd || rd) patches.push({ ...c, ...(cd ? { contractDate: cd } : {}), ...(rd ? { returnScheduledDate: rd } : {}) });
    }
    if (patches.length === 0) { if (!skipConfirm) toast.info('1900년대 날짜 없음 — 보정 불필요'); return; }
    if (!skipConfirm && !await showConfirm({ title: `1900년대 날짜 ${patches.length}건 +100년 보정`, confirmLabel: '보정' })) return;
    setBusy(true);
    try {
      await updateContracts(patches);
      append(`✓ 1900년대 날짜 보정 ${patches.length}건 (+100년)`);
      toast.success(`날짜 보정 ${patches.length}건`);
    } catch (err) {
      append(`✗ 날짜 보정 실패: ${friendlyError(err)}`);
      toast.error(friendlyError(err));
    } finally { setBusy(false); }
  }

  // 전체 일괄 반영 — 씨앗 → 반납 이력 → 자산·할부 → 날짜보정 순차 (합쳐진 확인창 1개). 개별 버튼은 그대로 유지.
  async function commitAll() {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    if (!res) return;
    const seedN = toSnapshotRows(res, companyKey).length;
    if (!await showConfirm({
      title: '전체 일괄 반영',
      description:
        `한 번에 순차 반영 (차량번호 기준 upsert — 재실행 안전):\n`
        + `① 씨앗(운영 계약) ${seedN}건 · 현재미수 carry ${won(res.totals.carryCurrent)}\n`
        + `② 반납 이력 ${res.returned.length}건 (신규만 · 추심 잔여 ${won(res.totals.carryReturned)})\n`
        + `③ 자산·할부 ${vehiclePlan.total}대 (현보유 ${res.activePlates.length}·유휴 ${vehiclePlan.total - res.activePlates.length}) + 고립 차량 휴차 정화\n`
        + `④ 1900년대 날짜 보정 (엑셀 연도버그 +100년)\n`
        + `※ 자금일보는 대사 전용 — 이번 반영 대상 아님(이중차감 방지). 회사="${companyKey}".`,
      confirmLabel: '전체 반영 진행',
    })) return;
    append('▶ 전체 일괄 반영 시작…');
    await commitSeeds(true);
    await commitReturned(true);
    await commitVehicles(true);
    await commitFix1900(true);   // 1900년대 날짜 보정 통합
    await commitHeldOnly(true);  // 최종 보유 정합 — DB 에 뭐가 남아있든 현보유 118 기준 강제 정렬
    append('✓ 전체 일괄 반영 완료 (씨앗·반납·자산할부·날짜보정·보유확정)');
    toast.success('전체 일괄 반영 완료');
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

        <div className="mig-page-flow">
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
            <div className="detail-section-header"><span className="title">1. 원본 (기존 파일 자동 불러옴)</span></div>
            <div className="detail-section-body" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <BusyButton busy={busy} busyLabel="불러오는 중…" className="btn btn-primary" onClick={() => autoLoad(true)} style={{ height: 40 }}>
                <ArrowsDownUp weight="bold" size={16} /> 기존 파일 다시 불러오기
              </BusyButton>
              <label className="btn" style={{ height: 40, cursor: busy ? 'default' : 'pointer' }}>
                <FileXls weight="bold" size={15} /> 직접 선택(수동)
                <input type="file" accept=".xlsx,.xls" hidden disabled={busy} onChange={onFile} />
              </label>
              {fileName
                ? <span style={{ fontSize: 12, color: res ? 'var(--green-text)' : 'var(--text-sub)', fontWeight: 600 }}>✓ {fileName}</span>
                : !busy && <span style={{ fontSize: 12, color: 'var(--text-weak)' }}>자동 불러오기 대기 — 위 버튼 누르거나 직접 선택</span>}
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, fontSize: 12 }}>
                  {([
                    { label: '전체 구매(자산)', n: res.vehicles.length, base: 163 },
                    { label: '현보유(활성)', n: res.activePlates.length, base: 118 },
                    { label: '운행중(계약)', n: res.totals.countCurrent, base: 102 },
                    { label: '월 대여료(합)', money: res.current.reduce((s, c) => s + (c.monthlyRent ?? 0), 0) },
                    { label: '반납(종료)', n: res.totals.countReturned, base: 75 },
                    { label: '상환합계(할부)', n: res.loans.length, base: 157 },
                    { label: '등록번호 매칭', n: res.current.filter((c) => c.customerIdentNo).length, base: res.totals.countCurrent },
                    { label: '현재 미수건수', n: res.current.filter((c) => (c.carryUnpaid ?? 0) > 0).length, tone: 'plain' },
                    { label: '현재 미수액', money: res.totals.carryCurrent },
                    { label: '추심잔여 건수', n: res.returned.filter((c) => (c.carryUnpaid ?? 0) > 0).length, tone: 'plain' },
                    { label: '추심잔여액', money: res.totals.carryReturned },
                  ] as Array<{ label: string; n?: number; base?: number; money?: number; tone?: 'plain' }>).map((c) => (
                    <div key={c.label} style={{ padding: 8, background: 'var(--bg-sunken)', borderRadius: 'var(--radius)' }}>
                      <div style={{ color: 'var(--text-weak)', fontSize: 11, marginBottom: 2 }}>{c.label}</div>
                      {c.money !== undefined ? (
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)' }}>{won(c.money)}</div>
                      ) : (
                        <>
                          <div style={{ fontSize: 18, fontWeight: 700, color: c.tone === 'plain' ? 'var(--text-main)' : (c.n ?? 0) > 0 ? 'var(--brand)' : 'var(--red-text)' }}>
                            {c.tone === 'plain' ? '' : (c.n ?? 0) > 0 ? '✓ ' : '⚠ '}{c.n}
                          </div>
                          {c.base !== undefined && <div style={{ color: 'var(--text-weak)', fontSize: 10 }}>직전 {c.base}</div>}
                        </>
                      )}
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

          {/* 🔬 차량 진단 — 자산현황 129 출처 추적 */}
          {superAdmin && (
            <section className="detail-section" style={{ border: '2px solid var(--orange-text)' }}>
              <div className="detail-section-header"><span className="title" style={{ color: 'var(--orange-text)' }}>🔬 차량 진단 — 자산현황 129 출처 추적 (실 DB)</span></div>
              <div className="detail-section-body" style={{ fontSize: 13, lineHeight: 2 }}>
                <div>DB 실제 차량(비삭제): <b style={{ fontSize: 16 }}>{vehDiag.dbVehicles}</b> · 그중 상태='운행': <b style={{ fontSize: 16, color: 'var(--brand)' }}>{vehDiag.running}</b></div>
                <div>상태별 분포: {Object.entries(vehDiag.byStatus).map(([s, n]) => `${s} ${n}`).join(' · ') || '(없음)'}</div>
                <div style={{ color: vehDiag.runningOrphan > 0 ? 'var(--red-text)' : undefined }}>
                  🔴 <b>고립 운행차</b>(운행인데 자산시트에 plate 없음 = 이전 잔재): <b style={{ fontSize: 16 }}>{vehDiag.runningOrphan}</b>
                  {vehDiag.runningOrphanSample.length > 0 && <span className="dim"> — {vehDiag.runningOrphanSample.join(', ')}</span>}
                </div>
                <div style={{ color: vehDiag.conSyn > 0 ? 'var(--red-text)' : undefined }}>
                  🔴 <b>계약 synthetic</b>(활성계약인데 차량마스터에 plate 없음 → 자산현황이 가짜차 생성): <b style={{ fontSize: 16 }}>{vehDiag.conSyn}</b> / 활성계약 {vehDiag.activeContracts}
                  {vehDiag.conSynSample.length > 0 && <span className="dim"> — {vehDiag.conSynSample.join(', ')}</span>}
                </div>
                <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>
                  자산현황 129 = 운행 {vehDiag.running} + 계약synthetic {vehDiag.conSyn}. <b>고립운행 or 계약synthetic 이 11이면 그게 범인.</b>
                  {res ? '' : ' (사전점검 로드 후 정확 — 지금은 자산시트 미로드라 고립수 부정확)'}
                </div>
              </div>
            </section>
          )}

          {/* 총계 대조 */}
          {t && (
            <section className="detail-section">
              <div className="detail-section-header"><span className="title">2. 미수 3정의 대조 (엑셀 원본 vs ERP 계산)</span></div>
              <div className="detail-section-body">
                <table className="table" style={{ fontSize: 13 }}>
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
              <div className="detail-section-body" style={{ overflowX: 'auto', padding: 0 }}>
                <table className="table" style={{ fontSize: 12 }}>
                  <thead>
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

          {/* 전체 일괄 반영 — 한 번에 씨앗+반납+자산할부 */}
          {res && (
            <section className="detail-section" style={{ borderColor: 'var(--brand)' }}>
              <div className="detail-section-header"><span className="title">전체 일괄 반영 (한 번에)</span></div>
              <div className="detail-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <BusyButton
                  busy={busy} busyLabel="일괄 반영 중…"
                  className="btn btn-primary"
                  disabled={!superAdmin}
                  onClick={() => commitAll()}
                  style={{ height: 48, fontSize: 15, fontWeight: 700 }}
                >
                  <Upload weight="bold" size={18} /> 전체 일괄 반영 — 자산 {vehiclePlan.total} · 현보유 {res.activePlates.length} · 운행 {res.totals.countCurrent} · 반납 {res.returned.length}
                </BusyButton>
                <div style={{ fontSize: 11, color: 'var(--text-weak)', lineHeight: 1.6 }}>
                  ① 씨앗(운영 계약·carry 미수) → ② 반납 이력(신규만) → ③ 자산·할부 순서로 한 번에 반영.
                  확인창 1개 · upsert라 재실행 안전 · <b>자금일보는 대사 전용(미반영)</b>. 단계별로 하려면 아래 개별 버튼 사용.
                </div>
              </div>
            </section>
          )}

          {/* 커밋 (개별 단계) */}
          {res && (
            <section className="detail-section">
              <div className="detail-section-header"><span className="title">4. 씨앗 커밋 (개별)</span></div>
              <div className="detail-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <BusyButton
                  busy={busy} busyLabel="씨앗 반영 중…"
                  className="btn btn-primary"
                  disabled={!superAdmin}
                  onClick={() => commitSeeds()}
                  style={{ height: 44, fontSize: 14, fontWeight: 600 }}
                >
                  <Upload weight="bold" size={16} /> 운행중 {res.totals.countCurrent}건 씨앗 커밋 (현재미수 = carry)
                </BusyButton>
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
                <div style={{ overflowX: 'auto' }}>
                  <table className="table" style={{ fontSize: 12 }}>
                    <thead>
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
                  <BusyButton
                    busy={busy} busyLabel="반납 이력 반영 중…"
                    className="btn"
                    disabled={!superAdmin}
                    onClick={() => commitReturned()}
                    style={{ height: 40, fontSize: 13, fontWeight: 600 }}
                  >
                    <Upload weight="bold" size={15} /> 반납 이력 {res.returned.length}건 커밋 (손바뀜 연속성 + 추심 잔여)
                  </BusyButton>
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
                <div style={{ overflowX: 'auto' }}>
                  <table className="table" style={{ fontSize: 12 }}>
                    <thead>
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
                  <BusyButton
                    busy={busy} busyLabel="차량 마스터 반영 중…"
                    className="btn"
                    disabled={!superAdmin}
                    onClick={() => commitVehicles()}
                    style={{ height: 40, fontSize: 13, fontWeight: 600 }}
                  >
                    <Car weight="bold" size={15} /> 자산·할부 → 차량 마스터 (갱신 {vehiclePlan.update} · 신규 {vehiclePlan.create} · 할부 {vehiclePlan.loans})
                  </BusyButton>
                  <BusyButton
                    busy={busy} busyLabel="보유 확정 중…"
                    className="btn btn-primary"
                    disabled={!superAdmin}
                    onClick={() => commitHeldOnly()}
                    style={{ height: 40, fontSize: 13, fontWeight: 700 }}
                    title="DB 차량 상태를 사업현황 기준으로 강제 정렬 — 채권(활성) plate 만 운행, 나머지 전부 매각(비보유). 템플릿·이전 잔재가 뭐가 남아있든 정합."
                  >
                    <CheckCircle weight="bold" size={15} /> 보유 확정 — 현보유 {res.activePlates.length}대만 운행 · 그 외 매각(비보유)
                  </BusyButton>
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
                  <BusyButton
                    busy={busy} busyLabel="재무 반영 중…"
                    className="btn btn-primary"
                    disabled={!superAdmin}
                    onClick={() => commitJboToBank()}
                    style={{ height: 42, fontSize: 13, fontWeight: 600, alignSelf: 'flex-start' }}
                  >
                    <Upload weight="bold" size={15} /> 재무관리에 반영 — 계좌 거래 {jboRes.totals.count.toLocaleString()}건 (자동매칭 X · 미수 영향 없음)
                  </BusyButton>
                  <BusyButton
                    busy={busy} busyLabel="재매핑 중…"
                    className="btn"
                    disabled={!superAdmin}
                    onClick={() => remapExistingSubjects()}
                    style={{ height: 34, fontSize: 12, alignSelf: 'flex-start' }}
                    title="이미 재무관리에 들어간 거래의 계정과목을 자금일보 원문 → 재무 표준(enum)으로 정규화. 드롭다운·총계정원장 정합용."
                  >
                    <ArrowsDownUp weight="bold" size={14} /> 계정과목 재매핑 — 기존 거래 원문 → 재무 표준 (금액·미수 무관)
                  </BusyButton>
                  <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.7 }}>
                    거래 <b>{jboRes.totals.count.toLocaleString()}</b>건 · {jboRes.totals.dateFrom}~{jboRes.totals.dateTo} · 계좌 {jboRes.totals.accounts} · 계정과목 {jboRes.totals.subjects}종<br />
                    실입금(자금이동 제외) <b style={{ color: 'var(--green-text)' }}>{won(jboRes.totals.realDeposit)}</b> · 실출금 <b style={{ color: 'var(--red-text)' }}>{won(jboRes.totals.realWithdraw)}</b> · 계좌간이체(sweep) {won(jboRes.totals.sweepDeposit)}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-weak)', marginBottom: 4 }}>계좌별</div>
                      <table className="table" style={{ fontSize: 11 }}>
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
                      <div style={{ overflowX: 'auto' }}>
                        <table className="table" style={{ fontSize: 11 }}>
                          <thead><tr style={{ color: 'var(--text-weak)', textAlign: 'right' }}>
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

                <div style={{ overflowX: 'auto' }}>
                  <table className="table" style={{ fontSize: 12 }}>
                    <thead>
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
                  <div style={{ overflowX: 'auto' }}>
                    <table className="table" style={{ fontSize: 12 }}>
                      <thead>
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
    </div>
  );
}
