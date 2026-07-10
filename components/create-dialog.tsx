'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import * as XLSX from 'xlsx';
import {
  FileArrowUp, FileXls, CheckCircle, Warning, X, Plus,
  MagnifyingGlass, CaretLeft, Car, ClipboardText, Wrench, DownloadSimple,
  Camera, Keyboard, CircleNotch,
} from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { DateInput } from '@/components/ui/date-input';
import { PhoneInput } from '@/components/ui/phone-input';
import { IdentInput } from '@/components/ui/ident-input';
import { parseExcelFile, type ParsedSheet, type UploadKind } from '@/lib/excel-detect';
import { formatCurrency, cn, monthsBetween } from '@/lib/utils';
import { MAKERS, MODELS_BY_MAKER, buildVehicleFullName } from '@/lib/vehicle-master';
import type { Contract, HistoryCategory, HistoryScope, AdditionalDriver, BankTransaction, CardTransaction } from '@/lib/types';
import { HistoryAddPane } from "./create-dialog/history-pane";
import {
  VEHICLE_COLUMNS, CONTRACT_COLUMNS, BANK_TX_COLUMNS, CARD_TX_COLUMNS, SNAPSHOT_COLUMNS,
  type ColumnSpec,
} from '@/lib/import-schema';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useVehicles } from '@/lib/firebase/vehicles-store';
import { useBankTx, useCardTx } from '@/lib/firebase/transactions-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { parsePastedText } from '@/lib/text-paste';
import { parseBankTxRow as parseBankRow, parseCardTxRow as parseCardRow } from '@/lib/import-commit';
import {
  parseVehicleRow, parseContractRow, parseBankTxRow, parseCardTxRow,
  matchTransactions, applyPaymentsToContracts,
  applySnapshotToContract, validateSnapshotRow,
  parseHorizontalContractsRow, isHorizontalMultiContractSheet, diagnoseHorizontalSheet,
  parseReceivablesRow, isHorizontalReceivablesSheet, inferSeqFromDate, mapPaymentMethodToSource,
  diagnoseContractRow, previewRow,
} from '@/lib/import-commit';
import { todayKr } from '@/lib/mock-data';
import { generateSchedules } from '@/lib/payment-schedule';
import { normalizeKoreanDate } from '@/lib/parsers/date';
import { autoMatchAll, autoMatchCardAll, applyMatch, applyCardMatch, applyFifoPayment } from '@/lib/receipt-match';
import { dedupAgainst } from '@/lib/dedup';
import { enrichBankTxBatch, enrichCardTxBatch } from '@/lib/channel-matching';
import { bankTxKeys, cardTxKeys, vehicleKeys, contractKeys } from '@/lib/dedup-keys';
import { normalizePlateLoose } from '@/lib/customer-match';
import { toast } from '@/lib/toast';
import { friendlyError } from '@/lib/friendly-error';
import { downloadTemplate as excelTemplate } from '@/lib/excel-template';
import { StatusBadge } from '@/components/ui/status-badge';
import { upsertVehicleFromContract, normPlate, findVehicleByPlate } from '@/lib/entity-sync';
import { nextContractNo, nextAssetCode, yymmOf, assignContractNos } from '@/lib/code-scheme';
import { customerKey } from '@/lib/customer-derive';
import { useAuth } from '@/lib/use-auth';
// Phase 2.2 — intake 평행 기록 (배치 단위)
import { addIntakeItem, markIntakeCommitted, setIntakeMatch } from '@/lib/firebase/intake-store';
import type { IntakeKind } from '@/lib/intake/types';

type Mode = '현황' | '차량' | '계약' | '입출금' | '자동이체' | '카드매출' | '법인카드' | '이력';

const ALL_MODES: Mode[] = ['현황', '차량', '계약', '입출금', '자동이체', '카드매출', '법인카드', '이력'];

/**
 * 다이얼로그 풋터 슬롯 — 자식 Pane에서 "닫기" 옆에 액션 버튼을 등록할 수 있게 함.
 * 탭 전환 시 자동으로 비워짐 (useEffect cleanup).
 */
type FooterCtxValue = {
  setFooterActions: (actions: ReactNode | null) => void;
};
const FooterCtx = createContext<FooterCtxValue>({ setFooterActions: () => {} });

/** Pane에서 호출 — deps가 바뀌면 자동 갱신, 언마운트 시 null */
function useDialogFooterActions(actions: ReactNode | null, deps: React.DependencyList) {
  const { setFooterActions } = useContext(FooterCtx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setFooterActions(actions);
    return () => setFooterActions(null);
  }, deps);
}

export function CreateDialog({
  open, onOpenChange, initialMode, visibleModes = ALL_MODES, onContractCreated, onVehicleCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialMode?: Mode;
  /** 노출할 탭 화이트리스트. 미지정 시 전체 노출 */
  visibleModes?: Mode[];
  /** 신규 계약 등록 완료 시 호출 — 호출자가 ContractDetailDialog 자동 오픈 가능 (트렌드 UX) */
  onContractCreated?: (newContractId: string) => void;
  /** 신규 차량 등록 완료 시 호출 — 호출자가 VehicleDetailDialog 자동 오픈 가능 */
  onVehicleCreated?: (newVehicleId: string) => void;
}) {
  const defaultMode = initialMode && visibleModes.includes(initialMode) ? initialMode : visibleModes[0] ?? '현황';
  const [mode, setMode] = useState<Mode>(defaultMode);

  // open 될 때마다 defaultMode 로 리셋 (다른 페이지에서 다른 탭으로 진입 가능)
  React.useEffect(() => {
    if (open) setMode(defaultMode);
  }, [open, defaultMode]);

  // 자식 Pane 이 풋터에 등록한 액션 버튼
  const [footerActions, setFooterActions] = useState<ReactNode | null>(null);
  const footerCtxValue = useMemo(() => ({ setFooterActions }), []);
  // 탭 전환 시 자동 비움 (자식의 useEffect cleanup 보강용)
  useEffect(() => { setFooterActions(null); }, [mode]);
  const [parsed, setParsed] = useState<ParsedSheet[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  // RTDB stores
  const { contracts, addMany: addContracts, updateMany: updateContracts } = useContracts();
  const { vehicles, add: addVehicle, addMany: addVehicles, update: updateVehicle } = useVehicles();
  const { rows: existingBankTx, addMany: addBankTx, update: updateBankTx } = useBankTx();
  const { rows: existingCardTx, addMany: addCardTx, update: updateCardTx } = useCardTx();
  const { companies } = useCompanies();
  const { user } = useAuth();

  /**
   * Phase 2.2 — 엑셀 배치 commit 을 intake 에 평행 기록.
   *
   * 행 단위가 아닌 BATCH 단위 1건만 기록 (write 폭증 방지).
   * raw 는 manual payload 로 fileName / sheetName / rowCount / kind 보존.
   * 한 commit 시작 시 intake item 1개 push → 끝나면 결과로 status 갱신.
   */
  async function intakeBatchStart(kind: IntakeKind, payload: Record<string, unknown>): Promise<string | null> {
    try {
      return await addIntakeItem({
        source: 'desktop-excel',
        raw: { mode: 'manual', kind, payload },
        createdBy: user?.email ?? undefined,
      });
    } catch (e) {
      console.warn('[intake] addIntakeItem 실패 (계속 진행)', e);
      return null;
    }
  }
  async function intakeBatchEnd(intakeId: string | null, ok: boolean, committedNodes: string[], reason?: string): Promise<void> {
    if (!intakeId) return;
    try {
      if (ok && committedNodes.length > 0) {
        await markIntakeCommitted(
          intakeId,
          committedNodes.map((n) => ({ node: n, id: '(batch)' })),
          user?.email ?? undefined,
        );
      } else {
        await setIntakeMatch(
          intakeId,
          { confidence: 'none', reason: reason ?? '배치 commit 결과 empty' },
          'pending',
          user?.email ?? undefined,
        );
      }
    } catch (e) { console.warn('[intake] batch 결과 갱신 실패', e); }
  }

  const reset = useCallback(() => {
    setParsed([]);
    setBusy(false);
    setResult(null);
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      setBusy(true);
      const results: ParsedSheet[] = [];
      for (const f of files) {
        try {
          const sheets = await parseExcelFile(f);
          results.push(...sheets);
        } catch (e) {
          console.error('parse fail', f.name, e);
        }
      }
      // Mode → UploadKind 매핑.
      // 입출금/자동이체/카드매출/법인카드 같은 Mode 값은 UploadKind 와 1:1 매칭 안 되므로 정의 필수.
      // 매핑 누락 시 fallback='미분류' → 파일이 paymentFiles 필터를 통과 못 해 업로드 동작 X.
      const KIND_BY_MODE: Partial<Record<typeof mode, UploadKind>> = {
        '계약':     '계약',
        '입출금':   '계좌',
        '자동이체': '자동이체',
        '카드매출': '카드',
        '법인카드': '카드',
      };
      const fallback: UploadKind = KIND_BY_MODE[mode] ?? '미분류';
      setParsed((prev) => [
        ...prev,
        ...results.map((r) => ({ ...r, kind: r.kind === '미분류' ? fallback : r.kind })),
      ]);
      setBusy(false);
    },
    [mode]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const files = Array.from(e.dataTransfer.files).filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
      if (files.length > 0) void handleFiles(files);
    },
    [handleFiles]
  );

  const onPick = useCallback(() => document.getElementById('jpk-bulk-file-input')?.click(), []);

  // '미분류' 만 차량 후보로 처리 — 차량 전용 분류('차량') 추가 시 OR 조건으로 확장
  const vehicleFiles = parsed.filter((p) => p.kind === '미분류');
  const contractFiles = parsed.filter((p) => p.kind === '계약');
  const paymentFiles = parsed.filter((p) => p.kind === '계좌' || p.kind === '자동이체' || p.kind === '카드');

  const contractsCount = contractFiles.reduce((s, p) => s + p.rows.length, 0);
  const paymentsCount = paymentFiles.reduce((s, p) => s + p.rows.length, 0);

  function updateKind(filteredIdx: number, kind: UploadKind, group: 'contract' | 'payment') {
    const target = (group === 'contract' ? contractFiles : paymentFiles)[filteredIdx];
    setParsed((all) => all.map((p) => (p === target ? { ...p, kind } : p)));
  }

  // ─── 커밋 핸들러 ─── //
  async function commitContractFiles() {
    setBusy(true);
    const intakeId = await intakeBatchStart('contract', {
      fileNames: contractFiles.map((p) => p.fileName),
      sheetNames: contractFiles.map((p) => p.sheetName),
      rowCount: contractFiles.reduce((s, p) => s + p.rows.length, 0),
    });
    try {
      const rows = contractFiles.flatMap((p) => p.rows);
      // 행별 진단 — 파싱 실패 시 어떤 행이 왜 빠졌는지 토스트로 알림
      const failed: Array<{ idx: number; reason: string; preview: string }> = [];
      const valid: Omit<Contract, 'id'>[] = [];
      rows.forEach((r, idx) => {
        const parsed = parseContractRow(r);
        if (parsed) valid.push(parsed);
        else failed.push({ idx: idx + 1, reason: diagnoseContractRow(r) ?? '필수값 누락', preview: previewRow(r) });
      });
      // 중복 검증 — 계약번호 또는 차량번호+계약일+고객 기준
      const dedup = dedupAgainst(valid, contracts, contractKeys);
      const skipped = dedup.duplicates.length;
      const withNos = assignContractNos(dedup.unique, contracts, companies); // 회사·월 순번 계약번호(#쓰기경로 v6정합)
      const n = await addContracts(withNos);
      // 차량 자동 동기화 — 계약 등록 후 같은 plate Vehicle 없으면 자동 생성
      const syncCtx = { vehicles, companies, addVehicle, updateVehicle };
      for (const c of withNos) {
        try { await upsertVehicleFromContract(c as Contract, syncCtx); }
        catch (e) { console.error('bulk vehicle sync failed', c.contractNo, e); }
      }
      const invalid = failed.length;
      const note = [
        invalid > 0 ? `필수값 누락 ${invalid}` : '',
        skipped > 0 ? `중복 ${skipped}` : '',
      ].filter(Boolean).join(' / ');
      const msg = `계약 ${n}건 저장 완료 (전체 ${rows.length}행${note ? ` · 제외: ${note}` : ''})`;
      setResult(msg);
      toast.success(`계약 ${n}건 저장`);
      if (invalid > 0) {
        // 첫 3건 행번호+사유+미리보기를 토스트에 노출 → 어느 행을 고쳐야 하는지 직원이 즉시 인지
        const sample = failed.slice(0, 3).map((f) => `${f.idx}행: ${f.reason} (${f.preview})`).join('\n');
        const more = invalid > 3 ? `\n…외 ${invalid - 3}행` : '';
        toast.warning(`${invalid}행 미반영\n${sample}${more}`, 9000);
      }
      setParsed((all) => all.filter((p) => p.kind !== '계약'));
      await intakeBatchEnd(intakeId, n > 0, n > 0 ? ['contracts'] : [], n === 0 ? '저장된 계약 0건' : undefined);
    } catch (e) {
      const msg = friendlyError(e);
      setResult(`오류 — ${msg}`);
      toast.error(msg);
      await intakeBatchEnd(intakeId, false, [], msg);
    } finally {
      setBusy(false);
    }
  }

  async function commitPaymentFiles() {
    setBusy(true);
    const paymentKind: IntakeKind =
      mode === '자동이체' ? 'auto-debit'
      : mode === '카드매출' ? 'card-tx'
      : mode === '법인카드' ? 'card-tx'
      : 'bank-tx';
    const intakeId = await intakeBatchStart(paymentKind, {
      mode,
      fileNames: paymentFiles.map((p) => p.fileName),
      rowCount: paymentFiles.reduce((s, p) => s + p.rows.length, 0),
    });
    try {
      // 모드별 채널 라우팅 — 4 variant 가 같은 commit 함수를 공유하므로 mode 로 분기.
      const isAutopay = mode === '자동이체';
      const cardVariantHint: '매출' | '법인카드' | undefined =
        mode === '법인카드' ? '법인카드' : mode === '카드매출' ? '매출' : undefined;
      // 자동이체 모드: kind='자동이체' (탐지) 또는 kind='계좌' (fallback) 모두 bank 로 → source='CMS' 강제
      // 입출금 모드:   kind='계좌' 만 bank
      const bankKinds = isAutopay ? ['계좌', '자동이체'] : ['계좌'];
      const bankRows = paymentFiles.filter((p) => bankKinds.includes(p.kind)).flatMap((p) => p.rows.map((r) => ({ row: r, file: p.fileName, bank: p.bankHint })));
      const cardRows = paymentFiles.filter((p) => p.kind === '카드').flatMap((p) => p.rows.map((r) => ({ row: r, file: p.fileName })));
      // parse + 실패 행 카운트 (사용자 피드백용)
      const bankParseAll = bankRows.map((x) => parseBankTxRow(x.row, x.file, x.bank));
      const bankParseFail = bankParseAll.filter((x) => x === null).length;
      let bankParsed = bankParseAll.filter((x): x is NonNullable<typeof x> => !!x);
      if (isAutopay) {
        bankParsed = bankParsed.map((b) => ({ ...b, source: 'CMS' as const, method: b.method || 'CMS' }));
      }
      const cardParseAll = cardRows.map((x) => parseCardTxRow(x.row, x.file, cardVariantHint));
      const cardParseFail = cardParseAll.filter((x) => x === null).length;
      const cardParsed = cardParseAll.filter((x): x is NonNullable<typeof x> => !!x);

      // 전부 parse 실패 + 시트 있음 → 헤더 진단 (사용자가 어느 헤더가 잘못됐는지 알 수 있게)
      const totalParsedOk = bankParsed.length + cardParsed.length;
      const totalAttempted = bankRows.length + cardRows.length;
      if (totalParsedOk === 0 && totalAttempted > 0) {
        const sampleHeaders: string[] = [];
        for (const p of paymentFiles) {
          const h = p.headers?.slice(0, 8).join(' / ') ?? '';
          if (h) sampleHeaders.push(`「${p.fileName} > ${p.sheetName}」: ${h}`);
        }
        toast.error(`${totalAttempted}행 전부 미반영 — 필수 컬럼 (거래일/금액/입금자 또는 승인일/금액/승인번호) 누락. 시트 헤더 확인:\n${sampleHeaders.slice(0, 2).join('\n')}`);
      }

      // 중복 검증 — DB 기존 거래 + 시트 내 중복 동시 처리
      const bankDedup = dedupAgainst(bankParsed, existingBankTx, bankTxKeys);
      const cardDedup = dedupAgainst(cardParsed, existingCardTx, cardTxKeys);
      const bankSkipped = bankDedup.duplicates.length;
      const cardSkipped = cardDedup.duplicates.length;

      // 회사 채널(계좌·CMS·단말기·법인카드) 자동 매핑 + CMS 회원명 → 계약 자동 매칭
      const bankEnriched = enrichBankTxBatch(bankDedup.unique, companies, contracts);
      const cardEnriched = enrichCardTxBatch(cardDedup.unique, companies);
      const companyMatched = bankEnriched.stats.matched + cardEnriched.stats.matched;
      const companyUnmatched = bankEnriched.stats.unmatched + cardEnriched.stats.unmatched;
      const contractAutoMatched = bankEnriched.stats.contractMatched;

      const bankSaved = await addBankTx(bankEnriched.rows);
      const cardSaved = await addCardTx(cardEnriched.rows);

      // ─── 회차 반영 매칭 (실제 schedule.payments[] 에 entry 추가) ───
      // 이전: matchTransactions + applyPaymentsToContracts → unpaidAmount 캐시만 갱신, schedule 미반영 (스케줄 표 + autoMatch 후속 동작 깨짐).
      // 이번: receipt-match 의 applyMatch / applyFifoPayment 호출 → schedule.status/paidAmount/payments[] 까지 완전 반영.
      const contractById = new Map(contracts.map((c) => [c.id, c]));
      const updatedContractMap = new Map<string, Contract>();
      const bankTxPatches: Array<{ id: string; patch: Partial<BankTransaction> }> = [];
      const cardTxPatches: Array<{ id: string; patch: Partial<CardTransaction> }> = [];
      const getCurrent = (cid: string) => updatedContractMap.get(cid) ?? contractById.get(cid);

      // 부분납·잉여(leftover) 통계 — 사용자에게 사후 알림용
      let fifoApplied = 0;        // FIFO 분배로 적용된 거래 수
      let leftoverTotal = 0;      // 회차 잔액보다 많이 들어온 잉여 합계 (미매칭 보충 필요)
      let leftoverCount = 0;      // leftover 발생 거래 수

      // 1. enrich 단계에서 matchedContractId 잡힌 bank tx → 정확 회차 or FIFO 자동 분배
      for (const tx of bankSaved) {
        if (!tx.matchedContractId) continue;
        const c = getCurrent(tx.matchedContractId);
        if (!c) continue;
        const schedules = c.schedules ?? [];
        // 정확 회차 매칭 시도 (미납 중 amount 또는 잔액 일치)
        const exact = schedules.find((s) =>
          s.status !== '완료' && s.status !== '면제' &&
          (s.amount === tx.amount || Math.max(0, s.amount - (s.paidAmount ?? 0)) === tx.amount)
        );
        try {
          if (exact) {
            const { txPatch, contractPatch } = applyMatch(tx, c, exact.seq);
            bankTxPatches.push({ id: tx.id, patch: txPatch });
            updatedContractMap.set(c.id, { ...c, ...contractPatch });
          } else {
            const { txPatch, contractPatch, leftover } = applyFifoPayment(tx, c);
            bankTxPatches.push({ id: tx.id, patch: txPatch });
            updatedContractMap.set(c.id, { ...c, ...contractPatch });
            fifoApplied += 1;
            if (leftover > 0) { leftoverTotal += leftover; leftoverCount += 1; }
          }
        } catch (e) {
          console.error('[upload bank match] failed', tx.id, e);
        }
      }

      // 2. 미매칭 bank tx → autoMatchAll high confidence (이름/4자리 + amount 정확)
      const unmatchedBank = bankSaved.filter((t) => !t.matchedContractId);
      const liveContracts = contracts.map((c) => updatedContractMap.get(c.id) ?? c);
      const bankAutoMatches = autoMatchAll(unmatchedBank, liveContracts);
      for (const m of bankAutoMatches) {
        const c = getCurrent(m.candidate.contract.id);
        if (!c) continue;
        try {
          const { txPatch, contractPatch } = applyMatch(m.tx, c, m.candidate.scheduleSeq);
          bankTxPatches.push({ id: m.tx.id, patch: txPatch });
          updatedContractMap.set(c.id, { ...c, ...contractPatch });
        } catch (e) {
          console.error('[upload bank auto] failed', m.tx.id, e);
        }
      }

      // 3. 카드 tx → autoMatchCardAll
      const liveContracts2 = contracts.map((c) => updatedContractMap.get(c.id) ?? c);
      const cardAutoMatches = autoMatchCardAll(cardSaved, liveContracts2);
      for (const m of cardAutoMatches) {
        const c = getCurrent(m.candidate.contract.id);
        if (!c) continue;
        try {
          const { txPatch, contractPatch } = applyCardMatch(m.tx, c, m.candidate.scheduleSeq);
          cardTxPatches.push({ id: m.tx.id, patch: txPatch });
          updatedContractMap.set(c.id, { ...c, ...contractPatch });
        } catch (e) {
          console.error('[upload card auto] failed', m.tx.id, e);
        }
      }

      // Persist tx patches + contract patches
      for (const { id, patch } of bankTxPatches) { try { await updateBankTx(id, patch); } catch (e) { console.error('[upload bankTx update]', e); } }
      for (const { id, patch } of cardTxPatches) { try { await updateCardTx(id, patch); } catch (e) { console.error('[upload cardTx update]', e); } }
      if (updatedContractMap.size > 0) await updateContracts(Array.from(updatedContractMap.values()));
      const matchedCount = bankTxPatches.length + cardTxPatches.length;
      const skippedNote = bankSkipped + cardSkipped > 0 ? ` (중복 ${bankSkipped + cardSkipped}건 제외)` : '';
      const companyNote = companyMatched > 0
        ? ` · 회사 자동분류 ${companyMatched}건${companyUnmatched > 0 ? ` (미분류 ${companyUnmatched})` : ''}`
        : '';
      const contractNote = contractAutoMatched > 0
        ? ` · 계약자명 자동매칭 ${contractAutoMatched}건`
        : '';
      const total = bankSaved.length + cardSaved.length;
      const fifoNote = fifoApplied > 0 ? ` · FIFO 분배 ${fifoApplied}건` : '';
      const leftoverNote = leftoverCount > 0
        ? ` · 잉여 ${leftoverCount}건 ${leftoverTotal.toLocaleString('ko-KR')}원 (수동 매칭 필요)`
        : '';
      const parseFailNote = (bankParseFail + cardParseFail) > 0
        ? ` · parse 실패 ${bankParseFail + cardParseFail}행 (필수 컬럼 누락: 거래일/금액/입금자)`
        : '';
      setResult(`수납 ${total}건 저장 / 자동매칭 ${matchedCount}건 (계약 ${updatedContractMap.size}건 갱신)${fifoNote}${leftoverNote}${parseFailNote}${companyNote}${contractNote}${skippedNote}`);
      if (total > 0) toast.success(`수납 ${total}건 저장 · 자동매칭 ${matchedCount} · 회사분류 ${companyMatched}${contractAutoMatched > 0 ? ` · 계약자 자동매칭 ${contractAutoMatched}` : ''}${parseFailNote ? ` · ${bankParseFail + cardParseFail}행 미반영` : ''}`);
      if (bankParseFail + cardParseFail > 0) {
        toast.warning(`parse 실패 ${bankParseFail + cardParseFail}행 — 필수 컬럼 (거래일·금액·입금자) 누락 또는 형식 오류. 시트 헤더명 확인 필요.`);
      }
      else if (bankSkipped + cardSkipped > 0) toast.warning(`전부 중복 — ${bankSkipped + cardSkipped}건 제외됨`);
      // 잉여 발생 시 별도 경고 토스트 (수동 매칭 동선 안내)
      if (leftoverCount > 0) {
        toast.warning(`잉여 ${leftoverCount}건 ${leftoverTotal.toLocaleString('ko-KR')}원 — /payments 매칭 dialog 에서 잔여분 계약 매칭 필요`);
      }
      setParsed((all) => all.filter((p) => p.kind !== '계좌' && p.kind !== '자동이체' && p.kind !== '카드'));
      await intakeBatchEnd(
        intakeId,
        total > 0,
        total > 0 ? (paymentKind === 'card-tx' ? ['cardTransactions'] : ['bankTransactions']) : [],
        total === 0 ? '저장된 거래 0건' : undefined,
      );
    } catch (e) {
      const msg = friendlyError(e);
      setResult(`오류 — ${msg}`);
      toast.error(msg);
      await intakeBatchEnd(intakeId, false, [], msg);
    } finally {
      setBusy(false);
    }
  }

  /** 가로확장 다중계약 시트 import — 한 행에서 N개 contract 추출 */
  async function commitHorizontalSheet(sheet: ParsedSheet) {
    setBusy(true);
    try {
      // rawAoa 직접 사용 — sheet.headers 는 dropIdx 적용된 상태라 row 인덱스와 안 맞음
      const rawHeaders = (sheet.rawAoa[sheet.headerRow] || []).map((v) =>
        v == null || v === '' ? '' : String(v).trim().replace(/\s*\*\s*$/, '').trim()
      );
      const all: Array<Omit<Contract, 'id'>> = [];
      const dataRows = sheet.rawAoa.slice(sheet.headerRow + 1);
      for (const row of dataRows) {
        if (!row || row.every((v) => v == null || String(v).trim() === '')) continue;
        const result = parseHorizontalContractsRow(rawHeaders, row, companies);
        if (!result || result.contracts.length === 0) continue;
        for (const patch of result.contracts) {
          const out = applySnapshotToContract(undefined, patch);  // 가로확장은 무조건 신규 (각 계약이 별건)
          all.push(out as Omit<Contract, 'id'>);
        }
      }
      // 중복 검증 (재 import 안전)
      const dedup = dedupAgainst(all, contracts, contractKeys);
      const skipped = dedup.duplicates.length;
      const withNos = assignContractNos(dedup.unique, contracts, companies); // 회사·월 순번 계약번호
      const created = await addContracts(withNos);
      // 차량 자동 동기화 — 가로확장 import 후 vehicle 자동 생성/매칭
      const syncCtx = { vehicles, companies, addVehicle, updateVehicle };
      for (const c of withNos) {
        try { await upsertVehicleFromContract(c as Contract, syncCtx); }
        catch (e) { console.error('horizontal import vehicle sync failed', c.contractNo, e); }
      }
      const msg = `가로확장 import 완료 — ${created}건 등록${skipped > 0 ? ` (중복 ${skipped}건 제외)` : ''}`;
      setResult(msg);
      if (created > 0) toast.success(`계약 ${created}건 import`);
      else if (skipped > 0) toast.warning(`전부 중복 — ${skipped}건 제외`);
      else toast.warning('가져올 계약이 없습니다');
    } catch (e) {
      const m = friendlyError(e);
      setResult(`오류 — ${m}`);
      toast.error(m);
    } finally {
      setBusy(false);
    }
  }

  /** 가로확장 채권 시트 import — 한 행에서 N개 월 payment entry 추출 → 매칭 contract의 schedule에 payment 추가 */
  async function commitHorizontalReceivables(sheet: ParsedSheet) {
    setBusy(true);
    try {
      // rawAoa + rawHeaders 사용 (인덱스 정합)
      const rawHeaders = (sheet.rawAoa[sheet.headerRow] || []).map((v) =>
        v == null || v === '' ? '' : String(v).trim().replace(/\s*\*\s*$/, '').trim()
      );
      const dataRows = sheet.rawAoa.slice(sheet.headerRow + 1);
      const byPlate = new Map(contracts.map((c) => [c.vehiclePlate.trim(), c]));
      const updates: Contract[] = [];
      let totalPaymentsAdded = 0;
      let unmatchedRows = 0;
      const today = todayKr();

      for (const row of dataRows) {
        if (!row || row.every((v) => v == null || String(v).trim() === '')) continue;
        const parsed = parseReceivablesRow(rawHeaders, row);
        if (!parsed || parsed.payments.length === 0) continue;

        // 매칭 — 차량번호 + (가능하면 contractDate 일치)
        const target = byPlate.get(parsed.vehiclePlate.trim());
        if (!target) { unmatchedRows += 1; continue; }
        // contractDate가 시트와 너무 다르면 (1개월 이상 차이) 다른 계약일 수 있음 — 그래도 일단 매칭
        const updatedContract: Contract = JSON.parse(JSON.stringify(target));
        const schedules = updatedContract.schedules ?? [];
        if (schedules.length === 0) { unmatchedRows += 1; continue; }

        for (const p of parsed.payments) {
          if (p.paid <= 0 || !p.date) continue;
          // 결제일자 → 회차 추정
          const seq = inferSeqFromDate(updatedContract.contractDate, p.date, updatedContract.totalSeq);
          const sched = schedules.find((s) => s.seq === seq);
          if (!sched) continue;
          // 중복 체크 — 같은 날짜+금액 entry 이미 있으면 skip
          const exists = (sched.payments ?? []).some(
            (e) => e.date === p.date && e.amount === p.paid && e.source !== '정산'
          );
          if (exists) continue;
          if (!sched.payments) sched.payments = [];
          sched.payments.push({
            date: p.date,
            amount: p.paid,
            source: mapPaymentMethodToSource(p.method),
            memo: p.method ? `채권탭 import (${p.method})` : '채권탭 import',
          });
          sched.paidAmount = sched.payments.reduce((sum, e) => sum + e.amount, 0);
          sched.paidAt = sched.payments.reduce((mx, e) => e.date > mx ? e.date : mx, '');
          // 정산 entry 있으면 제거 (실제 입금으로 대체)
          sched.payments = sched.payments.filter((e) => e.source !== '정산');
          if (sched.paidAmount >= sched.amount) sched.status = '완료';
          else if (sched.paidAmount > 0) sched.status = '부분납';
          totalPaymentsAdded += 1;
        }

        // 캐시 재계산
        const unpaidAmount = schedules.reduce((sum, s) => {
          if (s.status === '연체') return sum + s.amount;
          if (s.status === '부분납') return sum + Math.max(0, s.amount - s.paidAmount);
          return sum;
        }, 0);
        const unpaidSeqCount = schedules.filter((s) => s.status === '연체' || s.status === '부분납').length;
        const overdue = schedules.filter((s) => (s.status === '연체' || s.status === '부분납') && s.dueDate <= today).sort((a, b) => a.seq - b.seq);
        const currentSeq = overdue[0]?.seq
          ?? schedules.find((s) => s.status === '예정')?.seq
          ?? schedules.length;
        const lastPayment = schedules.flatMap((s) => s.payments ?? []).sort((a, b) => b.date.localeCompare(a.date))[0];
        updates.push({
          ...updatedContract,
          schedules,
          unpaidAmount,
          unpaidSeqCount,
          currentSeq,
          lastPaidDate: lastPayment?.date,
          lastPaidAmount: lastPayment?.amount,
        });
      }

      if (updates.length > 0) await updateContracts(updates);
      const msg = `채권탭 import 완료 — 입금 ${totalPaymentsAdded}건 추가 (계약 ${updates.length}건 갱신)${unmatchedRows > 0 ? `, 미매칭 ${unmatchedRows}행` : ''}`;
      setResult(msg);
      if (totalPaymentsAdded > 0) toast.success(`입금 ${totalPaymentsAdded}건 import`);
      else toast.warning('매칭되는 계약이 없습니다 — 계약탭 먼저 import 하세요');
    } catch (e) {
      const m = friendlyError(e);
      setResult(`오류 — ${m}`);
      toast.error(m);
    } finally {
      setBusy(false);
    }
  }

  async function commitSnapshotRows(rows: Record<string, unknown>[]) {
    setBusy(true);
    const intakeId = await intakeBatchStart('snapshot-mixed', { rowCount: rows.length });
    try {
      // 행별 분류 — contract / vehicle-only / invalid
      const validations = rows.map((r) => validateSnapshotRow(r, companies));
      const contractValidations = validations.filter((v) => v.kind === 'contract' && v.patch);
      const vehicleOnly = validations.filter((v) => v.kind === 'vehicle-only' && v.vehiclePatch);

      // 1) 계약 행 — contract UPSERT (단, plate='미정'은 항상 신규)
      const byPlate = new Map(contracts.map((c) => [(c.vehiclePlate ?? '').trim(), c]));
      const updates: Contract[] = [];
      const creates: Array<Omit<Contract, 'id'>> = [];
      for (const v of contractValidations) {
        const p = v.patch!;
        const plateKey = (p.vehiclePlate ?? '').trim();
        const existing = plateKey === '미정' ? undefined : byPlate.get(plateKey);
        const out = applySnapshotToContract(existing, p);
        if (existing && 'id' in out) updates.push(out as Contract);
        else creates.push(out as Omit<Contract, 'id'>);
      }
      if (updates.length > 0) await updateContracts(updates);
      const createsWithNos = assignContractNos(creates, contracts, companies); // 신규만 회사·월 순번 계약번호
      const created = createsWithNos.length > 0 ? await addContracts(createsWithNos) : 0;
      // 차량 자동 동기화 — 신규 계약에 대해 vehicle 자동 생성/매칭 (updates 도 status 갱신)
      const syncCtx = { vehicles, companies, addVehicle, updateVehicle };
      for (const c of [...updates, ...createsWithNos]) {
        try { await upsertVehicleFromContract(c as Contract, syncCtx); }
        catch (e) { console.error('snapshot vehicle sync failed', (c as Contract).contractNo, e); }
      }

      // 2) 휴차 차량 — vehicle 만 등록 (이미 같은 plate 의 vehicle 있으면 skip)
      const existingPlates = new Set([
        ...contracts.map((c) => (c.vehiclePlate ?? '').trim()),
        ...vehicles.map((v) => (v.plate ?? '').trim()),
      ]);
      const newVehicles: Array<Omit<import('@/lib/types').Vehicle, 'id'>> = [];
      for (const v of vehicleOnly) {
        const vp = v.vehiclePatch!;
        if (existingPlates.has((vp.plate ?? '').trim())) continue;  // 이미 있으면 skip
        newVehicles.push({
          plate: vp.plate,
          model: vp.model,
          company: vp.company as import('@/lib/types').CompanyCode,
          status: vp.vehicleStatus,
          notes: `스냅샷 업로드 — ${vp.vehicleStatus}`,
          createdAt: new Date().toISOString(),
        });
        existingPlates.add((vp.plate ?? '').trim());
      }
      const vehiclesAdded = newVehicles.length > 0 ? await addVehicles(newVehicles) : 0;

      const invalid = validations.filter((v) => v.kind === 'invalid').length;
      setResult(
        `스냅샷 반영 완료 — 계약 갱신 ${updates.length}, 계약 신규 ${created}, 휴차 차량 신규 ${vehiclesAdded}`
        + (invalid > 0 ? ` (오류 ${invalid}건 제외)` : ''),
      );
      if (invalid > 0) toast.warning(`${invalid}행 미반영 — 필수 컬럼 (차량번호·계약자명·계약일) 누락 또는 형식 오류. 시트 헤더 확인 필요.`);
      else toast.success(`스냅샷 ${updates.length + created + vehiclesAdded}건 처리 완료`);
      const totalSnapshotChanged = updates.length + created + vehiclesAdded;
      await intakeBatchEnd(
        intakeId,
        totalSnapshotChanged > 0,
        totalSnapshotChanged > 0 ? ['contracts', 'vehicles'] : [],
        totalSnapshotChanged === 0 ? '변경된 항목 0건' : undefined,
      );
    } catch (e) {
      const msg = friendlyError(e);
      setResult(`오류 — ${msg}`);
      toast.error(msg);
      await intakeBatchEnd(intakeId, false, [], msg);
    } finally {
      setBusy(false);
    }
  }

  async function commitVehicleRows(rows: Record<string, unknown>[]) {
    setBusy(true);
    const intakeId = await intakeBatchStart('vehicle', { rowCount: rows.length });
    try {
      const valid = rows.map((r) => parseVehicleRow(r)).filter((x): x is NonNullable<typeof x> => !!x);
      // 차량번호 중복 검증 (계약 테이블의 차량번호도 포함)
      const usedPlates = new Set<string>([
        ...vehicles.map((v) => v.plate?.trim().toLowerCase() ?? '').filter(Boolean),
        ...contracts.map((c) => c.vehiclePlate?.trim().toLowerCase() ?? '').filter(Boolean),
      ]);
      const fresh: typeof valid = [];
      let skipped = 0;
      for (const v of valid) {
        const p = v.plate?.trim().toLowerCase();
        if (p && p !== '미정' && usedPlates.has(p)) { skipped += 1; continue; }
        if (p && p !== '미정') usedPlates.add(p);  // 같은 시트 안 중복 방지
        fresh.push(v);
      }
      const invalid = rows.length - valid.length;
      const n = await addVehicles(fresh);
      const note = [
        invalid > 0 ? `필수값 누락 ${invalid}` : '',
        skipped > 0 ? `차량번호 중복 ${skipped}` : '',
      ].filter(Boolean).join(' / ');
      setResult(`차량 ${n}건 등록 (전체 ${rows.length}행${note ? ` · 제외: ${note}` : ''})`);
      if (n > 0) toast.success(`차량 ${n}건 등록`);
      else if (skipped > 0) toast.warning(`전부 중복 — ${skipped}건 제외됨`);
      if (invalid > 0) toast.warning(`${invalid}행 미반영 — 차량번호·차종 모두 비어있음. 시트 헤더 확인 필요.`);
      await intakeBatchEnd(intakeId, n > 0, n > 0 ? ['vehicles'] : [], n === 0 ? '저장된 차량 0건' : undefined);
    } catch (e) {
      const msg = friendlyError(e);
      setResult(`오류 — ${msg}`);
      toast.error(msg);
      await intakeBatchEnd(intakeId, false, [], msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogRoot
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent title="신규 등록" mode="new">
        <input
          id="jpk-bulk-file-input"
          type="file"
          multiple
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              void handleFiles(Array.from(e.target.files));
              e.target.value = '';
            }
          }}
        />

        <FooterCtx.Provider value={footerCtxValue}>
        <DialogBody className="p-0" style={{ display: 'flex', flexDirection: 'column' }}>
          <Tabs.Root value={mode} onValueChange={(v) => setMode(v as Mode)} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <Tabs.List className="tabs-list">
              {visibleModes.includes('현황') && (
                <Tabs.Trigger value="현황" className="tabs-trigger">운영 현황 업로드</Tabs.Trigger>
              )}
              {visibleModes.includes('차량') && (
                <Tabs.Trigger value="차량" className="tabs-trigger">차량 등록</Tabs.Trigger>
              )}
              {visibleModes.includes('계약') && (
                <Tabs.Trigger value="계약" className="tabs-trigger">
                  계약 생성
                  {contractsCount > 0 && <span className="count">{contractsCount}</span>}
                </Tabs.Trigger>
              )}
              {visibleModes.includes('입출금') && (
                <Tabs.Trigger value="입출금" className="tabs-trigger">
                  수납 입력
                  {paymentsCount > 0 && <span className="count">{paymentsCount}</span>}
                </Tabs.Trigger>
              )}
              {visibleModes.includes('자동이체') && (
                <Tabs.Trigger value="자동이체" className="tabs-trigger">자동이체 등록</Tabs.Trigger>
              )}
              {visibleModes.includes('카드매출') && (
                <Tabs.Trigger value="카드매출" className="tabs-trigger">카드매출 등록</Tabs.Trigger>
              )}
              {visibleModes.includes('법인카드') && (
                <Tabs.Trigger value="법인카드" className="tabs-trigger">법인카드 등록</Tabs.Trigger>
              )}
              {visibleModes.includes('이력') && (
                <Tabs.Trigger value="이력" className="tabs-trigger">이력 등록</Tabs.Trigger>
              )}
            </Tabs.List>

            <div
              style={{ flex: 1, overflow: 'auto', padding: 16 }}
              onDragOver={(e) => { e.preventDefault(); if (mode !== '이력' && mode !== '차량' && mode !== '현황') setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { if (mode !== '이력' && mode !== '차량' && mode !== '현황') onDrop(e); }}
            >
              <Tabs.Content value="현황">
                <SnapshotPane onCommit={commitSnapshotRows} onCommitHorizontal={commitHorizontalSheet} onCommitReceivables={commitHorizontalReceivables} busy={busy} result={result} />
              </Tabs.Content>
              <Tabs.Content value="차량">
                <VehicleRegisterPane
                  onClose={() => onOpenChange(false)}
                  onVehicleCreated={onVehicleCreated}
                  onCommit={commitVehicleRows}
                  busy={busy}
                  result={result}
                />
              </Tabs.Content>
              <Tabs.Content value="계약">
                <ContractRegisterPane
                  files={contractFiles}
                  drag={drag}
                  onPick={onPick}
                  onChangeKind={(idx, k) => updateKind(idx, k, 'contract')}
                  onClose={() => onOpenChange(false)}
                  onContractCreated={onContractCreated}
                  onCommit={commitContractFiles}
                  busy={busy}
                  result={result}
                />
              </Tabs.Content>
              <Tabs.Content value="입출금">
                <PaymentRegisterPane
                  files={paymentFiles}
                  drag={drag}
                  onPick={onPick}
                  onChangeKind={(idx, k) => updateKind(idx, k, 'payment')}
                  onClose={() => onOpenChange(false)}
                  onCommit={commitPaymentFiles}
                  busy={busy}
                  result={result}
                  variant="입출금"
                />
              </Tabs.Content>
              <Tabs.Content value="자동이체">
                <PaymentRegisterPane
                  files={paymentFiles}
                  drag={drag}
                  onPick={onPick}
                  onChangeKind={(idx, k) => updateKind(idx, k, 'payment')}
                  onClose={() => onOpenChange(false)}
                  onCommit={commitPaymentFiles}
                  busy={busy}
                  result={result}
                  variant="자동이체"
                />
              </Tabs.Content>
              <Tabs.Content value="카드매출">
                <PaymentRegisterPane
                  files={paymentFiles}
                  drag={drag}
                  onPick={onPick}
                  onChangeKind={(idx, k) => updateKind(idx, k, 'payment')}
                  onClose={() => onOpenChange(false)}
                  onCommit={commitPaymentFiles}
                  busy={busy}
                  result={result}
                  variant="카드매출"
                />
              </Tabs.Content>
              <Tabs.Content value="법인카드">
                <PaymentRegisterPane
                  files={paymentFiles}
                  drag={drag}
                  onPick={onPick}
                  onChangeKind={(idx, k) => updateKind(idx, k, 'payment')}
                  onClose={() => onOpenChange(false)}
                  onCommit={commitPaymentFiles}
                  busy={busy}
                  result={result}
                  variant="법인카드"
                />
              </Tabs.Content>
              <Tabs.Content value="이력">
                <HistoryAddPane onClose={() => onOpenChange(false)} />
              </Tabs.Content>
            </div>
          </Tabs.Root>
        </DialogBody>

        <DialogFooter>
          <div className="flex-1" />
          {footerActions}
          <DialogClose asChild>
            <button className="btn" type="button">닫기</button>
          </DialogClose>
        </DialogFooter>
        </FooterCtx.Provider>
      </DialogContent>
    </DialogRoot>
  );
}

/* ─────────────── 업로드 Pane (단일 스키마) ─────────────── */

function UploadPane({
  files, drag, onPick, onChangeKind,
  emptyTitle, emptyDesc, columns, templateName,
  onCommit, busy, result, commitLabel,
}: {
  files: ParsedSheet[];
  drag: boolean;
  onPick: () => void;
  onChangeKind: (idx: number, k: UploadKind) => void;
  emptyTitle: string;
  emptyDesc: string;
  columns: ColumnSpec[];
  templateName: string;
  onCommit?: () => void | Promise<void>;
  busy?: boolean;
  result?: string | null;
  commitLabel?: string;
}) {
  const totalRows = files.reduce((s, f) => s + f.rows.length, 0);
  if (files.length === 0) {
    return (
      <div className={cn('dropzone', drag && 'drag')} onClick={onPick} style={{ minHeight: 'auto', paddingTop: 32, paddingBottom: 32 }}>
        <div className="dropzone-icon">
          <FileArrowUp size={28} weight="duotone" />
        </div>
        <div className="dropzone-title">{emptyTitle}</div>
        <div className="dropzone-desc">{emptyDesc}</div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" type="button" onClick={(e) => { e.stopPropagation(); onPick(); }}>
            <Plus size={14} weight="bold" /> 엑셀 파일 선택
          </button>
          <button
            className="btn"
            type="button"
            onClick={(e) => { e.stopPropagation(); downloadTemplate(templateName, columns); }}
          >
            <DownloadSimple size={14} /> 템플릿
          </button>
        </div>
        <div className="dropzone-hint">또는 여기에 끌어다 놓기 · .xlsx / .xls / .csv</div>

        <SchemaList columns={columns} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className={cn('dropzone compact', drag && 'drag')} onClick={onPick}>
        <div className="dropzone-icon">
          <FileArrowUp size={16} weight="duotone" />
        </div>
        <div className="dropzone-title">파일 추가</div>
        <span className="text-weak text-xs ml-auto">또는 끌어다 놓기</span>
      </div>
      {files.map((p, i) => (
        <SheetPreview key={`${p.fileName}-${p.sheetName}-${i}`} sheet={p} onChangeKind={(k) => onChangeKind(i, k)} />
      ))}
      {result && (
        <div style={{ padding: 10, background: 'var(--green-bg)', color: 'var(--green-text)', borderRadius: 'var(--radius-md)', fontSize: 12, border: '1px solid var(--green-border)' }}>
          {result}
        </div>
      )}
      {onCommit && totalRows > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void onCommit()}>
            {busy ? <CircleNotch size={14} weight="bold" style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} weight="bold" />}
            {' '}{commitLabel ?? `최종 저장 ${totalRows}건`}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────── 업로드 Pane (수납: 계좌 + 카드 둘 다) ─────────────── */

function UploadPaneMulti({
  files, drag, onPick, onChangeKind, groups,
  onCommit, busy, result,
  dropTitle, dropDesc,
}: {
  files: ParsedSheet[];
  drag: boolean;
  onPick: () => void;
  onChangeKind: (idx: number, k: UploadKind) => void;
  groups: { title: string; desc: string; columns: ColumnSpec[]; templateName: string }[];
  onCommit?: () => void | Promise<void>;
  busy?: boolean;
  result?: string | null;
  dropTitle?: string;
  dropDesc?: string;
}) {
  const totalRows = files.reduce((s, f) => s + f.rows.length, 0);
  if (files.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className={cn('dropzone', drag && 'drag')} onClick={onPick} style={{ minHeight: 200, paddingTop: 32, paddingBottom: 32 }}>
          <div className="dropzone-icon">
            <FileArrowUp size={28} weight="duotone" />
          </div>
          <div className="dropzone-title">{dropTitle ?? '엑셀 업로드'}</div>
          <div className="dropzone-desc">{dropDesc ?? '헤더 자동 인식 · 행 단위 미리보기'}</div>
          <button className="btn btn-primary" type="button" onClick={(e) => { e.stopPropagation(); onPick(); }}>
            <Plus size={14} weight="bold" /> 엑셀 파일 선택
          </button>
        </div>

        {groups.map((g) => (
          <div key={g.title} className="detail-section">
            <div className="detail-section-header">
              <span style={{ flex: 1 }}>{g.title}</span>
              <button
                className="btn btn-sm"
                type="button"
                onClick={() => downloadTemplate(g.templateName, g.columns)}
              >
                <DownloadSimple size={12} /> 템플릿
              </button>
            </div>
            <div className="detail-section-body">
              <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 8 }}>{g.desc}</div>
              <SchemaList columns={g.columns} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className={cn('dropzone compact', drag && 'drag')} onClick={onPick}>
        <div className="dropzone-icon">
          <FileArrowUp size={16} weight="duotone" />
        </div>
        <div className="dropzone-title">파일 추가</div>
        <span className="text-weak text-xs ml-auto">또는 끌어다 놓기</span>
      </div>
      {files.map((p, i) => (
        <SheetPreview key={`${p.fileName}-${p.sheetName}-${i}`} sheet={p} onChangeKind={(k) => onChangeKind(i, k)} />
      ))}
      {result && (
        <div style={{ padding: 10, background: 'var(--green-bg)', color: 'var(--green-text)', borderRadius: 'var(--radius-md)', fontSize: 12, border: '1px solid var(--green-border)' }}>
          {result}
        </div>
      )}
      {onCommit && totalRows > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void onCommit()}>
            {busy ? <CircleNotch size={14} weight="bold" style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} weight="bold" />}
            {' '}최종 저장 {totalRows}건 (자동매칭 실행)
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────── 스키마 표시 ─────────────── */

function SchemaList({ columns }: { columns: ColumnSpec[] }) {
  const req = columns.filter((c) => c.required);
  const opt = columns.filter((c) => !c.required);
  return (
    <div style={{ marginTop: 14, width: '100%' }}>
      <div className="schema-legend">
        <span><span className="schema-legend-dot" style={{ background: 'var(--red-text)' }} />필수</span>
        <span><span className="schema-legend-dot" style={{ background: 'var(--border-strong)' }} />선택</span>
      </div>
      <div style={{ marginTop: 8, marginBottom: 6, fontSize: 10, color: 'var(--text-weak)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        필수 {req.length}개
      </div>
      <div className="schema-grid">
        {req.map((c) => (
          <div key={c.field} className="schema-col required" title={c.hint}>
            <span className="schema-col-dot" />
            <span className="schema-col-name">{c.label}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, marginBottom: 6, fontSize: 10, color: 'var(--text-weak)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        선택 {opt.length}개
      </div>
      <div className="schema-grid">
        {opt.map((c) => (
          <div key={c.field} className="schema-col" title={c.hint}>
            <span className="schema-col-dot" />
            <span className="schema-col-name">{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── 템플릿 다운로드 — 양식·노트·예시 포함 ─────────────── */

function downloadTemplate(filename: string, columns: ColumnSpec[]) {
  // 파일명에서 의미 추출 → 타이틀/노트 자동 결정
  let title = '일괄 등록 양식';
  let notes: string[] = [];
  if (filename.includes('계약')) {
    title = '계약 일괄 등록 양식';
    notes = [
      '· 회사코드 / 사업자번호 / 법인등록번호 중 하나로 회사 자동 매칭',
      '· 차량번호 한국형식 「12가1234」 또는 「123가1234」',
      '· 날짜 = 거의 모든 표기 OK — 예: 2026-05-20 / 26-05-20 / 260520 / 20260520 / 26.5.20 / 2026.5.20 / 2026/5/20 / 2026년 5월 20일 / 엑셀 날짜 셀 (자동 변환됨)',
      '· 결제방법 = CMS / 카드 / 세금계산서 / 이체 / 후불 / 현금 / 기타',
      '· 금액 컬럼은 천단위 콤마 자동 — 콤마 안 찍어도 됨',
    ];
  } else if (filename.includes('스냅샷') || filename.includes('현황')) {
    title = '운영 현황 스냅샷 양식';
    notes = [
      '· UPSERT — 차량번호 기준 동일 번호 있으면 갱신, 없으면 신규',
      '· 법인등록번호 = 회사 마스터 등록된 법인번호로 자동 매칭 → 회사명 결정',
      '· 계약시작일/계약종료일 = 거의 모든 표기 OK — 예: 2026-05-20 / 260520 / 26.5.20 / 2026/5/20 / 엑셀 날짜 셀. 회차는 자동 계산',
      '· 현재미수 = 오늘 기준 미수 합계. 이후 수납 엑셀로 자동 차감',
    ];
  } else if (filename.includes('차량')) {
    title = '차량(자산) 일괄 등록 양식';
    notes = [
      '· 차량번호 미정이면 「미정」 으로 입력 → 구매대기 상태로 등록',
      '· 회사명 = 회사 마스터 등록된 회사명',
    ];
  } else if (filename.includes('계좌')) {
    title = '계좌 입금내역 일괄 등록 양식';
    notes = [
      '· 입금자명·금액 기준으로 계약과 자동 매칭 (±10%)',
      '· 출금 행은 무시 (입금만)',
    ];
  } else if (filename.includes('카드')) {
    title = '카드 매출내역 일괄 등록 양식';
    notes = [
      '· 승인번호·금액 기준으로 계약과 자동 매칭',
      '· 계약자명 입력 시 매칭 정확도 향상',
    ];
  }
  excelTemplate(filename, columns, { title, notes });
}

/* ─────────────── 파일 미리보기 ─────────────── */

function SheetPreview({ sheet, onChangeKind }: { sheet: ParsedSheet; onChangeKind: (k: UploadKind) => void }) {
  const preview = sheet.rows.slice(0, 5);
  const isLowConfidence = sheet.detectedConfidence < 0.5;
  return (
    <div className="border rounded">
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-header)] border-b">
        <FileXls size={14} className="text-sub" />
        <div className="font-medium">{sheet.fileName}</div>
        <span className="text-weak">·</span>
        <div className="text-sub">{sheet.sheetName}</div>
        <span className="text-weak">·</span>
        <div className="text-sub mono">{sheet.rows.length}행</div>
        {sheet.kind === '계좌' && sheet.bankHint && (
          <span className="chip" style={{ height: 16, padding: '0 6px', fontSize: 10, background: 'var(--blue-bg)', color: 'var(--blue-text)' }}>
            {sheet.bankHint}은행
          </span>
        )}
        {isLowConfidence && (
          <span className="flex items-center gap-1 text-[var(--alert-orange-text)] text-xs">
            <Warning size={12} /> 분류 신뢰도 낮음
          </span>
        )}
        <div className="flex-1" />
        <span className="text-weak text-xs">분류:</span>
        <select
          className="select"
          value={sheet.kind}
          onChange={(e) => onChangeKind(e.target.value as UploadKind)}
          style={{ width: 90, height: 26 }}
        >
          <option value="계약">계약</option>
          <option value="계좌">계좌</option>
          <option value="자동이체">자동이체</option>
          <option value="카드">카드</option>
          <option value="미분류">미분류</option>
        </select>
      </div>
      <div className="overflow-auto" style={{ maxHeight: 200 }}>
        <table className="table">
          <thead>
            <tr>
              {sheet.headers.map((h, i) => (
                <th key={`${h}-${i}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, ri) => (
              <tr key={ri}>
                {sheet.headers.map((h, i) => (
                  <td key={i}>{formatCell(row[h])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sheet.rows.length > 5 && (
        <div className="text-weak text-xs px-3 py-1 border-t bg-[var(--bg-stripe)]">
          ... 외 {sheet.rows.length - 5}행
        </div>
      )}
    </div>
  );
}

/* ─────────────── 차량 등록 Pane (개별 / OCR / 엑셀) ─────────────── */

type VehicleMode = 'manual' | 'ocr' | 'excel' | 'paste';

function VehicleRegisterPane({
  onClose, onVehicleCreated, onCommit, busy, result,
}: {
  onClose: () => void;
  /** 등록 후 detail 자동 오픈 콜백 (트렌드 UX) */
  onVehicleCreated?: (id: string) => void;
  onCommit: (rows: Record<string, unknown>[]) => Promise<void>;
  busy: boolean;
  result: string | null;
}) {
  const [mode, setMode] = useState<VehicleMode>('manual');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <div className="filter-bar">
        <button type="button" className={`chip ${mode === 'manual' ? 'active' : ''}`} onClick={() => setMode('manual')}>
          <Keyboard size={11} /> 개별 입력
        </button>
        <button type="button" className={`chip ${mode === 'ocr' ? 'active' : ''}`} onClick={() => setMode('ocr')}>
          <Camera size={11} /> OCR (자동차등록증)
        </button>
        <button type="button" className={`chip ${mode === 'excel' ? 'active' : ''}`} onClick={() => setMode('excel')}>
          <FileXls size={11} /> 엑셀 일괄
        </button>
      </div>

      {mode === 'manual' && <VehicleManualForm onSubmit={(newId) => {
        onClose();
        if (newId) onVehicleCreated?.(newId);
      }} />}
      {mode === 'ocr' && <VehicleOcrPane onSubmit={onClose} />}
      {mode === 'excel' && <VehicleExcelPane onCommit={onCommit} busy={busy} result={result} />}
    </div>
  );
}

const VEHICLE_STATUSES = ['구매대기', '등록대기', '상품화중', '인도대기', '재고'] as const;

/** 등록된 회사 마스터에서 회사명 가져오기 (없으면 빈 배열) */
function useCompanyNames(): string[] {
  const { companies } = useCompanies();
  return companies.map((c) => c.name).filter(Boolean);
}

function VehicleManualForm({ onSubmit }: { onSubmit: (newVehicleId?: string) => void }) {
  const companyNames = useCompanyNames();
  const { add: addVehicle, vehicles } = useVehicles();
  const { companies } = useCompanies();
  const [company, setCompany] = useState(companyNames[0] ?? '');
  // 5단 분류
  const [vehicleMaker, setVehicleMaker] = useState('');
  const [vehicleModelLine, setVehicleModelLine] = useState('');
  const [vehicleSubModel, setVehicleSubModel] = useState('');
  const [vehicleVariant, setVehicleVariant] = useState('');
  const [vehicleTrim, setVehicleTrim] = useState('');
  const [plate, setPlate] = useState('');
  const [vehicleStatus, setVehicleStatus] = useState<string>('구매대기');
  // 제조사 스펙
  const [exteriorColor, setExteriorColor] = useState('');
  const [interiorColor, setInteriorColor] = useState('');
  const [vehicleOptions, setVehicleOptions] = useState('');
  // 등록증 정보
  const [vin, setVin] = useState('');
  const [manufacturedDate, setManufacturedDate] = useState('');
  const [firstRegisteredDate, setFirstRegisteredDate] = useState('');
  const [fuelType, setFuelType] = useState('');
  const [displacementCc, setDisplacementCc] = useState('');
  const [seatingCapacity, setSeatingCapacity] = useState('');
  const [garage, setGarage] = useState('');
  const [ownerName, setOwnerName] = useState('');
  // 매입 정보
  const [purchasedDate, setPurchasedDate] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [insuranceAge, setInsuranceAge] = useState('26');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fullName = buildVehicleFullName({
    maker: vehicleMaker, model: vehicleModelLine, subModel: vehicleSubModel,
    variant: vehicleVariant, trim: vehicleTrim,
  });

  async function handleSave() {
    if (!fullName || saving) return;
    setSaving(true);
    try {
      const newVehicleId = await addVehicle({
        plate: normPlate(plate.trim()) || '미정',
        model: fullName,
        company: (company || '기타') as import('@/lib/types').CompanyCode,
        assetCode: nextAssetCode(companies.find((co) => co.name === company || co.code === company)?.code ?? company, vehicles), // 자산코드 발급
        status: vehicleStatus as import('@/lib/types').VehicleStatus,
        purchasedDate: purchasedDate || undefined,
        // 제조사 스펙
        vehicleMaker: vehicleMaker.trim() || undefined,
        vehicleModelLine: vehicleModelLine.trim() || undefined,
        vehicleSubModel: vehicleSubModel.trim() || undefined,
        vehicleVariant: vehicleVariant.trim() || undefined,
        vehicleTrim: vehicleTrim.trim() || undefined,
        vehicleOptions: vehicleOptions.trim() || undefined,
        exteriorColor: exteriorColor.trim() || undefined,
        interiorColor: interiorColor.trim() || undefined,
        // 등록증 정보
        vin: vin.trim() || undefined,
        manufacturedDate: manufacturedDate || undefined,
        firstRegisteredDate: firstRegisteredDate || undefined,
        fuelType: fuelType.trim() || undefined,
        displacementCc: displacementCc ? parseInt(displacementCc, 10) || undefined : undefined,
        seatingCapacity: seatingCapacity ? parseInt(seatingCapacity, 10) || undefined : undefined,
        garage: garage.trim() || undefined,
        ownerName: ownerName.trim() || undefined,
        // 매입 정보
        purchasePrice: purchasePrice ? parseInt(purchasePrice, 10) || undefined : undefined,
        insuranceAge: insuranceAge ? parseInt(insuranceAge, 10) || undefined : undefined,
        notes: notes.trim() || undefined,
        createdAt: new Date().toISOString(),
      });
      onSubmit(newVehicleId);
    } catch (e) {
      toast.error('차량 등록 실패: ' + ((e as Error).message ?? String(e)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void handleSave(); }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflow: 'auto' }}
    >
      {/* 필수 정보 */}
      <div className="detail-section">
        <div className="detail-section-header">필수 정보</div>
        <div className="detail-section-body">
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px 14px', alignItems: 'center' }}>
            <label className="form-label">회사 *</label>
            <CompanyPicker value={company} onChange={setCompany} options={companyNames} />

            <label className="form-label">차량상태 *</label>
            <div className="filter-bar">
              {VEHICLE_STATUSES.map((s) => (
                <button type="button" key={s} className={`chip ${vehicleStatus === s ? 'active' : ''}`} onClick={() => setVehicleStatus(s)}>
                  {s}
                </button>
              ))}
            </div>

            <label className="form-label">① 제조사 *</label>
            <input className="input" required list="dl-vh-makers" placeholder="예: 현대" value={vehicleMaker} onChange={(e) => { setVehicleMaker(e.target.value); setVehicleModelLine(''); }} />

            <label className="form-label">② 모델 *</label>
            <input className="input" required list="dl-vh-models" placeholder="예: 그랜저" value={vehicleModelLine} onChange={(e) => setVehicleModelLine(e.target.value)} />

            <label className="form-label">차량번호</label>
            <input
              className="input"
              placeholder={vehicleStatus === '구매대기' ? '미정 (구매 후 입력)' : '예: 109호1234'}
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              style={{ width: 240 }}
            />
            <datalist id="dl-vh-makers">
              {MAKERS.map((m) => <option key={m} value={m} />)}
            </datalist>
            <datalist id="dl-vh-models">
              {(MODELS_BY_MAKER[vehicleMaker] ?? []).map((m) => <option key={m} value={m} />)}
            </datalist>
          </div>
        </div>
      </div>

      {/* 제조사 스펙 — advanced, 필요 시 펼침 */}
      <details open={!!vehicleSubModel || !!vehicleVariant || !!vehicleTrim || !!exteriorColor} className="detail-section">
        <summary className="detail-section-header" style={{ cursor: 'pointer' }}>
          제조사 스펙 <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-weak)', marginLeft: 6 }}>(선택 — 등록 후에도 입력 가능)</span>
        </summary>
        <div className="detail-section-body">
          <div className="form-grid-2">
            <label className="form-label">③ 세부모델</label>
            <input className="input" placeholder="예: 더 뉴 그랜저 GN7" value={vehicleSubModel} onChange={(e) => setVehicleSubModel(e.target.value)} />

            <label className="form-label">④ 모델구분</label>
            <input className="input" placeholder="예: 가솔린 3.5 AWD (연료·엔진·구동·인승)" value={vehicleVariant} onChange={(e) => setVehicleVariant(e.target.value)} />

            <label className="form-label">⑤ 트림</label>
            <input className="input" placeholder="예: 캘리그래피" value={vehicleTrim} onChange={(e) => setVehicleTrim(e.target.value)} />

            <label className="form-label">외부 색상</label>
            <input className="input" placeholder="예: 화이트 펄" value={exteriorColor} onChange={(e) => setExteriorColor(e.target.value)} />

            <label className="form-label">내부 색상</label>
            <input className="input" placeholder="예: 베이지" value={interiorColor} onChange={(e) => setInteriorColor(e.target.value)} />

            <label className="form-label">선택옵션</label>
            <input className="input" placeholder="예: 선루프, 풀옵션, 18인치휠, 내비" value={vehicleOptions} onChange={(e) => setVehicleOptions(e.target.value)} />
          </div>
        </div>
      </details>

      {/* 자동차등록증 정보 — advanced (OCR 등록 시 채워짐) */}
      <details open={!!vin || !!manufacturedDate || !!firstRegisteredDate} className="detail-section">
        <summary className="detail-section-header" style={{ cursor: 'pointer' }}>
          자동차등록증 정보 <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-weak)', marginLeft: 6 }}>(선택 — OCR 또는 상세에서 입력 가능)</span>
        </summary>
        <div className="detail-section-body">
          <div className="form-grid-2">
            <label className="form-label">차대번호</label>
            <input className="input" placeholder="예: KMHJ381ABLU123456" value={vin} onChange={(e) => setVin(e.target.value)} />

            <label className="form-label">제작연월일</label>
            <DateInput value={manufacturedDate} onChange={setManufacturedDate} style={{ width: 200 }} />

            <label className="form-label">최초등록일</label>
            <DateInput value={firstRegisteredDate} onChange={setFirstRegisteredDate} style={{ width: 200 }} />

            <label className="form-label">사용연료</label>
            <input className="input" placeholder="예: 가솔린 / 디젤 / 하이브리드 / 전기 / LPG" value={fuelType} onChange={(e) => setFuelType(e.target.value)} />

            <label className="form-label">배기량 (cc)</label>
            <input className="input" placeholder="예: 3470" value={displacementCc} onChange={(e) => setDisplacementCc(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 160 }} />

            <label className="form-label">승차정원</label>
            <input className="input" placeholder="예: 5" value={seatingCapacity} onChange={(e) => setSeatingCapacity(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 120 }} />

            <label className="form-label">사용본거지</label>
            <input className="input" placeholder="등록증상 차고지 주소" value={garage} onChange={(e) => setGarage(e.target.value)} />

            <label className="form-label">소유자명</label>
            <input className="input" placeholder="등록증상 소유자명 (회사 명의)" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
          </div>
        </div>
      </details>

      {/* 매입 정보 — advanced */}
      <details open={!!purchasedDate || !!purchasePrice || !!notes} className="detail-section">
        <summary className="detail-section-header" style={{ cursor: 'pointer' }}>
          매입 정보 <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-weak)', marginLeft: 6 }}>(선택)</span>
        </summary>
        <div className="detail-section-body">
          <div className="form-grid-2">
            <label className="form-label">매입일</label>
            <DateInput value={purchasedDate} onChange={setPurchasedDate} style={{ width: 200 }} />

            <label className="form-label">매입가</label>
            <input className="input" placeholder="원 단위" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 200 }} />

            <label className="form-label">보험연령</label>
            <input className="input" value={insuranceAge} onChange={(e) => setInsuranceAge(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 120 }} />

            <label className="form-label" style={{ alignSelf: 'start', paddingTop: 6 }}>비고</label>
            <textarea
              className="input"
              rows={2}
              placeholder="발주처 · 특이사항 등"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ height: 'auto', padding: '8px 12px', resize: 'vertical' }}
            />
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-weak)' }}>
            ↑ 필수: 회사 · 차량상태 · 제조사 · 모델. 나머지는 상세 페이지에서 추가/수정 가능.
          </div>
        </div>
      </details>

      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: 8, position: 'sticky', bottom: 0, background: 'var(--bg-card)', paddingTop: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={!fullName || saving}>
          {saving ? <CircleNotch size={14} weight="bold" style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} />}
          {saving ? '저장 중...' : '차량 등록'}
        </button>
      </div>
    </form>
  );
}

function VehicleOcrPane({ onSubmit }: { onSubmit: () => void }) {
  const { vehicles, add: addVehicle, update: updateVehicle } = useVehicles();
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<{ plate: string; model: string; company: string; vin?: string; year?: string } | null>(null);
  const [matchedVehicle, setMatchedVehicle] = useState<import('@/lib/types').Vehicle | null>(null);

  const normalizePlate = normalizePlateLoose;

  async function handleSaveAsNew() {
    if (!extracted || saving) return;
    setSaving(true);
    try {
      await addVehicle({
        plate: extracted.plate.trim() || '미정',
        model: extracted.model.trim() || '미정',
        company: (extracted.company || '기타') as import('@/lib/types').CompanyCode,
        assetCode: nextAssetCode(extracted.company || 'CP00', vehicles), // 자산코드 발급
        status: '등록대기',
        notes: [
          extracted.vin && `차대번호 ${extracted.vin}`,
          extracted.year && `${extracted.year}년식`,
          'OCR 자동 등록',
        ].filter(Boolean).join(' / ') || undefined,
        createdAt: new Date().toISOString(),
      });
      onSubmit();
    } catch (e) {
      toast.error('차량 등록 실패: ' + ((e as Error).message ?? String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateExisting(mode: 'diff' | 'overwrite') {
    if (!extracted || !matchedVehicle || saving) return;
    setSaving(true);
    try {
      const merged: import('@/lib/types').Vehicle = { ...matchedVehicle };
      const setIf = (cur: string | undefined, next: string) => {
        if (mode === 'overwrite') return next || cur || '';
        return (cur && cur !== '미정') ? cur : (next || cur || '');
      };
      merged.plate = setIf(matchedVehicle.plate, extracted.plate.trim());
      merged.model = setIf(matchedVehicle.model, extracted.model.trim());
      // 차대번호/연식은 notes에 누적되는 패턴이라 별도 prepend
      const ocrLine = [
        extracted.vin && `차대번호 ${extracted.vin}`,
        extracted.year && `${extracted.year}년식`,
        `OCR 갱신 (${mode === 'overwrite' ? '덮어쓰기' : '차이만 갱신'})`,
      ].filter(Boolean).join(' / ');
      merged.notes = matchedVehicle.notes
        ? `${ocrLine}\n${matchedVehicle.notes}`
        : ocrLine;
      await updateVehicle(merged);
      onSubmit();
    } catch (e) {
      toast.error('차량 갱신 실패: ' + ((e as Error).message ?? String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function handleImage(file: File) {
    setBusy(true);
    setError(null);
    setMatchedVehicle(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'vehicle_reg');

      const { getFirebaseAuth } = await import('@/lib/firebase/client');
      const auth = getFirebaseAuth();
      const user = auth?.currentUser;
      const idToken = user ? await user.getIdToken() : '';

      const res = await fetch('/api/ocr/extract', {
        method: 'POST',
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
        body: fd,
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'OCR 실패');
      const raw = json.extracted as Record<string, unknown>;
      const next = {
        plate: String(raw.car_number ?? raw.plate ?? ''),
        model: String(raw.car_name ?? raw.model ?? ''),
        company: String(raw.owner_name ?? raw.company ?? ''),
        vin: String(raw.vin ?? raw.chassis_no ?? '') || undefined,
        year: String(raw.year_model ?? raw.model_year ?? '') || undefined,
      };
      setExtracted(next);

      // 신규/기존 판별: plate 정규화 매칭 우선, 없으면 vin 매칭
      const np = normalizePlate(next.plate);
      const found = vehicles.find((v) => {
        if (np && normalizePlate(v.plate) === np) return true;
        if (next.vin && v.notes?.includes(next.vin)) return true;
        return false;
      });
      setMatchedVehicle(found ?? null);
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  if (busy) {
    return (
      <div className="dropzone" style={{ minHeight: 320, cursor: 'default', flex: 1 }}>
        <div className="dropzone-icon">
          <CircleNotch size={28} weight="bold" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
        <div className="dropzone-title">OCR 처리 중...</div>
        <div className="dropzone-desc">자동차등록증을 분석하고 있습니다 (약 1~2초)</div>
      </div>
    );
  }

  if (extracted) {
    const isExisting = !!matchedVehicle;
    const diff = matchedVehicle ? [
      { field: '차량번호', cur: matchedVehicle.plate, next: extracted.plate },
      { field: '차종', cur: matchedVehicle.model, next: extracted.model },
      { field: '회사', cur: matchedVehicle.company, next: extracted.company },
    ].filter((r) => r.next && r.cur !== r.next) : [];

    return (
      <form
        onSubmit={(e) => { e.preventDefault(); if (!isExisting) void handleSaveAsNew(); }}
        style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}
      >
        {/* 판별 결과 배너 */}
        <div
          className="detail-section"
          style={{
            borderColor: isExisting ? 'var(--orange-border)' : 'var(--green-border)',
            background: isExisting ? 'var(--orange-bg)' : 'var(--green-bg)',
          }}
        >
          <div className="detail-section-header" style={{ color: isExisting ? 'var(--orange-text)' : 'var(--green-text)' }}>
            <CheckCircle size={12} weight="duotone" />
            <span className="title">
              {isExisting
                ? `이미 등록된 차량입니다 — ${matchedVehicle!.plate} ${matchedVehicle!.model}`
                : '신규 차량 — 시스템에 등록되지 않은 등록증입니다'}
            </span>
            <button type="button" className="btn btn-sm" onClick={() => { setExtracted(null); setMatchedVehicle(null); }}>다시 스캔</button>
          </div>
          {isExisting && (
            <div className="detail-section-body" style={{ fontSize: 11, color: 'var(--text)' }}>
              {diff.length === 0
                ? '추출된 정보가 기존 정보와 동일합니다 — 차대번호/연식만 비고에 추가됩니다.'
                : (
                  <div>
                    <div style={{ marginBottom: 6, fontWeight: 600 }}>변경 항목 ({diff.length}개):</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-soft)' }}>
                          <th style={{ padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>필드</th>
                          <th style={{ padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>기존</th>
                          <th style={{ padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--orange-text)' }}>OCR (변경 후)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diff.map((r) => (
                          <tr key={r.field}>
                            <td style={{ padding: '3px 8px' }}>{r.field}</td>
                            <td style={{ padding: '3px 8px', color: 'var(--text-weak)' }}>{r.cur || '-'}</td>
                            <td style={{ padding: '3px 8px', color: 'var(--orange-text)', fontWeight: 600 }}>{r.next}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          )}
        </div>

        {/* 추출 정보 편집 */}
        <div className="detail-section">
          <div className="detail-section-header">
            <span className="title">OCR 추출 정보 — 편집 가능</span>
          </div>
          <div className="detail-section-body">
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px 14px', alignItems: 'center' }}>
              <label className="form-label">회사</label>
              <input className="input" value={extracted.company} onChange={(e) => setExtracted({ ...extracted, company: e.target.value })} style={{ width: 200 }} />
              <label className="form-label">차종</label>
              <input className="input" value={extracted.model} onChange={(e) => setExtracted({ ...extracted, model: e.target.value })} />
              <label className="form-label">차량번호</label>
              <input className="input" value={extracted.plate} onChange={(e) => setExtracted({ ...extracted, plate: e.target.value })} style={{ width: 240 }} />
              {extracted.vin && (
                <>
                  <label className="form-label">차대번호</label>
                  <input className="input mono" value={extracted.vin} onChange={(e) => setExtracted({ ...extracted, vin: e.target.value })} />
                </>
              )}
              {extracted.year && (
                <>
                  <label className="form-label">연식</label>
                  <input className="input mono" value={extracted.year} onChange={(e) => setExtracted({ ...extracted, year: e.target.value })} style={{ width: 120 }} />
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={() => { setExtracted(null); setMatchedVehicle(null); }}>취소</button>
          {isExisting ? (
            <>
              <button
                type="button"
                className="btn"
                disabled={saving}
                onClick={() => void handleSaveAsNew()}
                title="동일 차량번호가 있더라도 새 row로 추가"
              >
                신규로 추가
              </button>
              <button
                type="button"
                className="btn"
                disabled={saving}
                onClick={() => void handleUpdateExisting('diff')}
                title="기존 값이 미정인 항목만 채움 + OCR 메모 추가"
              >
                차이만 갱신
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={() => void handleUpdateExisting('overwrite')}
              >
                {saving ? <CircleNotch size={14} weight="bold" style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} />}
                {saving ? '저장 중...' : '덮어쓰기 갱신'}
              </button>
            </>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <CircleNotch size={14} weight="bold" style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} />}
              {saving ? '저장 중...' : '신규 등록'}
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <div
      className="dropzone"
      style={{ minHeight: 320, flex: 1 }}
      onClick={() => document.getElementById('jpk-ocr-file')?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) handleImage(f);
      }}
    >
      <input
        id="jpk-ocr-file"
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) handleImage(e.target.files[0]); }}
      />
      <div className="dropzone-icon">
        <Camera size={28} weight="duotone" />
      </div>
      <div className="dropzone-title">자동차등록증 스캔</div>
      <div className="dropzone-desc">
        등록증 사진(.jpg/.png) 또는 스캔본(.pdf) 업로드 시<br />
        차량번호 · 차종 · 차대번호 · 연식 · 소유자 등 자동 추출 (Gemini Vision)
      </div>
      <button className="btn btn-primary" type="button" onClick={(e) => { e.stopPropagation(); document.getElementById('jpk-ocr-file')?.click(); }}>
        <Camera size={14} /> 이미지 선택
      </button>
      <div className="dropzone-hint">또는 여기에 끌어다 놓기</div>
      {error && (
        <div style={{ marginTop: 10, padding: 8, background: 'var(--red-bg)', color: 'var(--red-text)', fontSize: 11, border: '1px solid var(--red-border)' }}>
          ❌ {error}
        </div>
      )}
    </div>
  );
}

function VehicleExcelPane({
  onCommit, busy, result,
}: {
  onCommit: (rows: Record<string, unknown>[]) => Promise<void>;
  busy: boolean;
  result: string | null;
}) {
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [drag, setDrag] = useState(false);
  const inputId = 'jpk-vehicle-bulk-file';

  const handleFiles = useCallback(async (files: File[]) => {
    const out: ParsedSheet[] = [];
    for (const f of files) {
      try {
        const parsed = await parseExcelFile(f);
        out.push(...parsed);
      } catch (e) {
        console.error(e);
      }
    }
    setSheets((prev) => [...prev, ...out]);
  }, []);

  const totalRows = sheets.reduce((s, p) => s + p.rows.length, 0);

  if (sheets.length === 0) {
    return (
      <div
        className={cn('dropzone', drag && 'drag')}
        style={{ minHeight: 240, flex: 1 }}
        onClick={() => document.getElementById(inputId)?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault(); setDrag(false);
          const fs = Array.from(e.dataTransfer.files).filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
          if (fs.length > 0) void handleFiles(fs);
        }}
      >
        <input
          id={inputId} type="file" multiple accept=".xlsx,.xls,.csv" className="hidden"
          onChange={(e) => { if (e.target.files) { void handleFiles(Array.from(e.target.files)); e.target.value = ''; } }}
        />
        <div className="dropzone-icon"><FileXls size={28} weight="duotone" /></div>
        <div className="dropzone-title">자산(차량) 엑셀 업로드</div>
        <div className="dropzone-desc">기존 차량 리스트 일괄 등록 — 차량번호 + 차명 + 회사만 필수</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" type="button" onClick={(e) => { e.stopPropagation(); document.getElementById(inputId)?.click(); }}>
            <Plus size={14} weight="bold" /> 엑셀 파일 선택
          </button>
          <button className="btn" type="button" onClick={(e) => { e.stopPropagation(); downloadTemplate('차량등록_템플릿.xlsx', VEHICLE_COLUMNS); }}>
            <DownloadSimple size={14} /> 템플릿
          </button>
        </div>
        <div className="dropzone-hint">또는 여기에 끌어다 놓기 · .xlsx / .xls / .csv</div>
        <SchemaList columns={VEHICLE_COLUMNS} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="dropzone compact" onClick={() => document.getElementById(inputId)?.click()}>
        <div className="dropzone-icon"><FileArrowUp size={16} weight="duotone" /></div>
        <div className="dropzone-title">파일 추가</div>
        <span className="text-weak text-xs ml-auto">또는 끌어다 놓기</span>
        <input
          id={inputId} type="file" multiple accept=".xlsx,.xls,.csv" className="hidden"
          onChange={(e) => { if (e.target.files) { void handleFiles(Array.from(e.target.files)); e.target.value = ''; } }}
        />
      </div>
      {sheets.map((p, i) => (
        <SheetPreview key={`${p.fileName}-${p.sheetName}-${i}`} sheet={p} onChangeKind={() => { /* no-op */ }} />
      ))}
      {result && (
        <div style={{ padding: 10, background: 'var(--green-bg)', color: 'var(--green-text)', borderRadius: 'var(--radius-md)', fontSize: 12, border: '1px solid var(--green-border)' }}>
          {result}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn btn-primary"
          type="button"
          disabled={busy}
          onClick={async () => {
            const rows = sheets.flatMap((s) => s.rows);
            await onCommit(rows);
            setSheets([]);
          }}
        >
          {busy ? <CircleNotch size={14} weight="bold" style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} weight="bold" />}
          {' '}최종 저장 {totalRows}건
        </button>
      </div>
    </div>
  );
}

/* ─────────────── 현황 스냅샷 Pane — 차량번호 upsert ─────────────── */

type SnapshotPaneProps = {
  onCommit: (rows: Record<string, unknown>[]) => Promise<void>;
  onCommitHorizontal?: (sheet: ParsedSheet) => Promise<void>;
  onCommitReceivables?: (sheet: ParsedSheet) => Promise<void>;
  busy: boolean;
  result: string | null;
};

/** 운영현황 등록 = [수기 입력 | 엑셀 업로드]. 수기 1건도 엑셀과 같은 파이프라인(onCommit→parseSnapshotRow). */
function SnapshotPane(props: SnapshotPaneProps) {
  const [mode, setMode] = useState<'manual' | 'excel'>('manual');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="filter-bar" style={{ gap: 6 }}>
        <button type="button" className={`chip ${mode === 'manual' ? 'active' : ''}`} onClick={() => setMode('manual')}>수기 입력</button>
        <button type="button" className={`chip ${mode === 'excel' ? 'active' : ''}`} onClick={() => setMode('excel')}>엑셀 업로드</button>
      </div>
      {mode === 'manual'
        ? <SnapshotManualForm onCommit={props.onCommit} busy={props.busy} result={props.result} />
        : <SnapshotExcelPane {...props} />}
    </div>
  );
}

/** 운영현황 1건 수기 입력 — SNAPSHOT_COLUMNS 스키마에서 폼 생성. 저장 시 onCommit([row]) 로 엑셀과 동일 처리. */
function SnapshotManualForm({ onCommit, busy, result }: {
  onCommit: (rows: Record<string, unknown>[]) => Promise<void>;
  busy: boolean;
  result: string | null;
}) {
  const { companies } = useCompanies();
  const companyOptions = useMemo(
    () => Array.from(new Set(companies.map((c) => c.name).filter((n): n is string => !!n))),
    [companies],
  );
  const [vals, setVals] = useState<Record<string, string>>({});
  const [company, setCompany] = useState('');
  const set = (label: string, v: string) => setVals((p) => ({ ...p, [label]: v }));

  const NUM_FIELDS = new Set(['monthlyRent', 'deposit', 'unpaidAmount', 'paymentDay', 'insuranceAge']);
  const DATE_FIELDS = new Set(['contractDate', 'returnScheduledDate']);

  const missing = SNAPSHOT_COLUMNS.filter((c) => c.required)
    .filter((c) => c.field === 'company' ? !company.trim() : !(vals[c.label] ?? '').trim());

  async function submit() {
    if (missing.length > 0) { toast.error(`필수 미입력: ${missing.map((m) => m.label).join(', ')}`); return; }
    const row: Record<string, unknown> = { 회사: company.trim() };
    for (const c of SNAPSHOT_COLUMNS) {
      if (c.field === 'company') continue;
      const v = (vals[c.label] ?? '').trim();
      if (v) row[c.label] = v;
    }
    await onCommit([row]);
    setVals({});
    setCompany('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="dim" style={{ fontSize: 12, lineHeight: 1.5 }}>
        운영현황 1건을 엑셀 없이 직접 입력. <strong>차량번호 기준 upsert</strong>(있으면 갱신). 저장하면 엑셀 업로드와 <strong>같은 파이프라인</strong>으로 반영돼요. 마지막 입금일은 계좌 연동으로 자동 산출.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        {SNAPSHOT_COLUMNS.map((c) => (
          <label key={c.field} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
            <span style={{ fontWeight: 600 }}>
              {c.label}{c.required && <span style={{ color: 'var(--red-text)' }}> *</span>}
            </span>
            {c.field === 'company' ? (
              <CompanyPicker value={company} onChange={setCompany} options={companyOptions} />
            ) : (
              <input
                className="input"
                type={NUM_FIELDS.has(c.field) ? 'number' : DATE_FIELDS.has(c.field) ? 'date' : 'text'}
                placeholder={c.example}
                value={vals[c.label] ?? ''}
                onChange={(e) => set(c.label, e.target.value)}
              />
            )}
            {c.hint && <span className="dim" style={{ fontSize: 10, lineHeight: 1.4 }}>{c.hint}</span>}
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center' }}>
        {result && <span className="dim" style={{ fontSize: 12 }}>{result}</span>}
        <button className="btn btn-primary" type="button" disabled={busy || missing.length > 0} onClick={submit}>
          {busy ? '저장 중…' : '운영현황 등록'}
        </button>
      </div>
    </div>
  );
}

function SnapshotExcelPane({
  onCommit, onCommitHorizontal, onCommitReceivables, busy, result,
}: {
  onCommit: (rows: Record<string, unknown>[]) => Promise<void>;
  onCommitHorizontal?: (sheet: ParsedSheet) => Promise<void>;
  onCommitReceivables?: (sheet: ParsedSheet) => Promise<void>;
  busy: boolean;
  result: string | null;
}) {
  const { companies } = useCompanies();
  const { contracts } = useContracts();
  const { vehicles } = useVehicles();
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [drag, setDrag] = useState(false);
  // 행별 체크 선택 (기본: valid 행만 체크) — Map<rowKey, boolean>
  const [picks, setPicks] = useState<Record<string, boolean>>({});
  const inputId = 'jpk-snapshot-bulk-file';

  const handleFiles = useCallback(async (files: File[]) => {
    const out: ParsedSheet[] = [];
    for (const f of files) {
      try {
        const parsed = await parseExcelFile(f);
        out.push(...parsed);
      } catch (e) {
        console.error(e);
      }
    }
    setSheets((prev) => [...prev, ...out]);
  }, []);

  // rawAoa 기반 헤더 — dropIdx 적용 안 됨 (가로확장 인덱스 정합)
  function rawHeadersOf(s: ParsedSheet): string[] {
    return (s.rawAoa[s.headerRow] || []).map((v) =>
      v == null || v === '' ? '' : String(v).trim().replace(/\s*\*\s*$/, '').trim()
    );
  }
  // 가로확장 다중계약 시트 자동감지 (계약탭)
  const horizontalSheets = useMemo(
    () => sheets.filter((s) => isHorizontalMultiContractSheet(rawHeadersOf(s))),
    [sheets],
  );

  // 가로확장 채권 시트 자동감지 (채권탭)
  const receivablesSheets = useMemo(
    () => sheets.filter((s) => isHorizontalReceivablesSheet(rawHeadersOf(s))),
    [sheets],
  );

  // 기존 DB 색인 — 중복 판정용 (호출 시점 계약/차량과 비교)
  const existingPlates = useMemo(() => {
    const m = new Map<string, 'contract' | 'vehicle'>();
    for (const c of contracts) {
      if (c.vehiclePlate) m.set(c.vehiclePlate.trim(), 'contract');
    }
    for (const v of vehicles) {
      if (v.plate && !m.has(v.plate.trim())) m.set(v.plate.trim(), 'vehicle');
    }
    return m;
  }, [contracts, vehicles]);

  // 모든 행 검증 결과 (sheet idx + row idx 키) + dup 정보
  const validated = useMemo(() => {
    // 같은 업로드 안에서 plate 중복도 체크
    const inSheetPlates = new Map<string, number>();  // plate → 처음 등장 row idx
    return sheets.flatMap((s, sIdx) =>
      s.rows.map((r, rIdx) => {
        const v = validateSnapshotRow(r, companies);
        const plate = v.raw.plate.trim();
        // 같은 시트 내 중복?
        let inSheetDup = false;
        if (plate) {
          const firstIdx = inSheetPlates.get(plate);
          if (firstIdx === undefined) inSheetPlates.set(plate, rIdx);
          else inSheetDup = true;
        }
        // DB 와 비교
        const dbHit = plate ? existingPlates.get(plate) : undefined;
        return {
          key: `${sIdx}-${rIdx}`,
          sheetName: s.sheetName,
          fileName: s.fileName,
          row: r,
          inSheetDup,
          dbHit,  // undefined / 'contract' / 'vehicle'
          ...v,
        };
      }),
    );
  }, [sheets, companies, existingPlates]);

  // sheets 바뀔 때 — 기본 체크 규칙:
  //  · 계약 신규/갱신 → ON
  //  · 휴차 신규 → ON
  //  · 휴차 중복 (이미 있음) → OFF
  //  · 시트 내 중복 → OFF
  //  · 오류 → OFF
  useEffect(() => {
    // validated 변경 시 picks 통째 재계산 — 옛 false 상태가 잠겨서 0건 commit 되는 문제 해결
    const next: Record<string, boolean> = {};
    for (const v of validated) {
      if (v.kind === 'invalid' || v.inSheetDup) { next[v.key] = false; continue; }
      if (v.kind === 'vehicle-only' && v.dbHit) { next[v.key] = false; continue; }
      next[v.key] = true;
    }
    setPicks(next);
  }, [validated]);

  // 행별 최종 상태 (UI 라벨 + commit 동작)
  function rowState(v: typeof validated[number]): 'contract-new' | 'contract-update' | 'vehicle-new' | 'vehicle-dup' | 'sheet-dup' | 'invalid' {
    if (v.kind === 'invalid') return 'invalid';
    if (v.inSheetDup) return 'sheet-dup';
    if (v.kind === 'contract') return v.dbHit === 'contract' ? 'contract-update' : 'contract-new';
    // vehicle-only
    return v.dbHit ? 'vehicle-dup' : 'vehicle-new';
  }
  const states = validated.map((v) => rowState(v));
  const contractNewCount = states.filter((s) => s === 'contract-new').length;
  const contractUpdateCount = states.filter((s) => s === 'contract-update').length;
  const vehicleNewCount = states.filter((s) => s === 'vehicle-new').length;
  const vehicleDupCount = states.filter((s) => s === 'vehicle-dup').length;
  const sheetDupCount = states.filter((s) => s === 'sheet-dup').length;
  const invalidCount = states.filter((s) => s === 'invalid').length;
  const pickedCount = validated.filter((v) => picks[v.key]).length;

  const togglePick = (key: string) => setPicks((p) => ({ ...p, [key]: !p[key] }));
  const toggleAll = () => {
    const allOn = validated.every((v) => picks[v.key]);
    const next: Record<string, boolean> = {};
    for (const v of validated) next[v.key] = !allOn;
    setPicks(next);
  };

  const totalRows = sheets.reduce((s, p) => s + p.rows.length, 0);

  if (sheets.length === 0) {
    return (
      <div
        className={cn('dropzone', drag && 'drag')}
        style={{ minHeight: 240, flex: 1 }}
        onClick={() => document.getElementById(inputId)?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault(); setDrag(false);
          const fs = Array.from(e.dataTransfer.files).filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
          if (fs.length > 0) void handleFiles(fs);
        }}
      >
        <input
          id={inputId} type="file" multiple accept=".xlsx,.xls,.csv" className="hidden"
          onChange={(e) => { if (e.target.files) { void handleFiles(Array.from(e.target.files)); e.target.value = ''; } }}
        />
        <div className="dropzone-icon"><FileXls size={28} weight="duotone" /></div>
        <div className="dropzone-title">계약 현황 스냅샷 업로드</div>
        <div className="dropzone-desc">
          운영중인 계약의 현재 상태를 일괄 반영 — 차량번호 기준 UPSERT.<br />
          이후 수납 엑셀 업로드 시 자동매칭으로 미수금이 차감되며 회차가 진행됩니다.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" type="button" onClick={(e) => { e.stopPropagation(); document.getElementById(inputId)?.click(); }}>
            <Plus size={14} weight="bold" /> 엑셀 파일 선택
          </button>
          <button className="btn" type="button" onClick={(e) => { e.stopPropagation(); downloadTemplate('계약현황_스냅샷_템플릿.xlsx', SNAPSHOT_COLUMNS); }}>
            <DownloadSimple size={14} /> 템플릿
          </button>
        </div>
        <div className="dropzone-hint">또는 여기에 끌어다 놓기 · .xlsx / .xls / .csv</div>
        <SchemaList columns={SNAPSHOT_COLUMNS} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 요약 + 파일 추가 + 새로 올리기 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <FileArrowUp size={14} weight="duotone" style={{ color: 'var(--text-sub)' }} />
        <span style={{ fontSize: 12 }}>{sheets.length}개 시트 · 전체 {totalRows}행</span>
        {contractNewCount > 0 && <span style={{ fontSize: 11, color: 'var(--green-text)' }}>계약 신규 {contractNewCount}</span>}
        {contractUpdateCount > 0 && <span style={{ fontSize: 11, color: 'var(--brand)' }}>계약 갱신 {contractUpdateCount}</span>}
        {vehicleNewCount > 0 && <span style={{ fontSize: 11, color: 'var(--orange-text)' }}>휴차 신규 {vehicleNewCount}</span>}
        {vehicleDupCount > 0 && <span style={{ fontSize: 11, color: 'var(--text-weak)' }}>휴차 중복 {vehicleDupCount}</span>}
        {sheetDupCount > 0 && <span style={{ fontSize: 11, color: 'var(--text-weak)' }}>시트내 중복 {sheetDupCount}</span>}
        {invalidCount > 0 && <span style={{ fontSize: 11, color: 'var(--red-text)' }}>오류 {invalidCount}</span>}
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm" type="button" onClick={() => document.getElementById(inputId)?.click()}>
          <Plus size={11} /> 파일 추가
        </button>
        <button className="btn btn-sm btn-ghost" type="button" onClick={() => { setSheets([]); setPicks({}); }}>
          <X size={11} /> 전부 비우기
        </button>
        <input
          id={inputId} type="file" multiple accept=".xlsx,.xls,.csv" className="hidden"
          onChange={(e) => { if (e.target.files) { void handleFiles(Array.from(e.target.files)); e.target.value = ''; } }}
        />
      </div>

      {/* 가로확장 import — 자동감지 / 수동강제 둘 다 지원 */}
      {sheets.length > 0 && onCommitHorizontal && sheets.map((s, i) => {
        // 진단·import 모두 rawAoa 헤더 기준 (dropIdx 적용 안 함 — row 인덱스 정합)
        const rawHeadersForDiag = (s.rawAoa[s.headerRow] || []).map((v) =>
          v == null || v === '' ? '' : String(v).trim().replace(/\s*\*\s*$/, '').trim()
        );
        const diag = diagnoseHorizontalSheet(rawHeadersForDiag);
        const isAutoDetected = horizontalSheets.includes(s);
        const canImport = !!diag.vehiclePlateCol;  // 차량번호만 있으면 시도 가능
        return (
          <div
            key={`hc-${i}`}
            style={{
              padding: 14,
              background: isAutoDetected ? 'var(--brand-bg)' : 'var(--bg-sunken)',
              border: `1px solid ${isAutoDetected ? 'var(--brand)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: isAutoDetected ? 'var(--brand)' : 'var(--text-main)' }}>
                  {isAutoDetected ? '📋 가로확장 계약 시트 감지' : '📊 가로확장 import (수동 강제)'} — {s.sheetName}
                </div>
                {!isAutoDetected && (
                  <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 2 }}>
                    자동감지 안 됐지만 수동 시도 가능. 진단 결과 확인 후 import 클릭.
                  </div>
                )}
              </div>
              <button
                className={isAutoDetected ? 'btn btn-primary' : 'btn'}
                type="button"
                disabled={busy || !canImport}
                onClick={() => onCommitHorizontal(s)}
                title={!canImport ? '차량번호 컬럼 (차량번호/자산번호/번호판) 필요' : '시트 한 행에서 N개 계약 추출 → 일괄 등록'}
              >
                <CheckCircle weight="bold" /> import {diag.customerCols.length > 1 ? `(차량당 ${diag.customerCols.length}개)` : ''}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-sub)', display: 'grid', gridTemplateColumns: '90px 1fr', gap: '4px 8px' }}>
              <span style={{ fontWeight: 600 }}>차량번호</span>
              <span className="mono">{diag.vehiclePlateCol ?? <span style={{ color: 'var(--red-text)' }}>❌ 없음</span>}</span>
              <span style={{ fontWeight: 600 }}>계약자명 ({diag.customerCols.length})</span>
              <span className="mono" style={{ fontSize: 10 }}>{diag.customerCols.length > 0 ? diag.customerCols.join(' · ') : <span className="dim">없음</span>}</span>
              <span style={{ fontWeight: 600 }}>인도일 ({diag.deliveryCols.length})</span>
              <span className="mono" style={{ fontSize: 10 }}>{diag.deliveryCols.length > 0 ? diag.deliveryCols.join(' · ') : <span className="dim">없음</span>}</span>
              <span style={{ fontWeight: 600 }}>종료일 ({diag.returnCols.length})</span>
              <span className="mono" style={{ fontSize: 10 }}>{diag.returnCols.length > 0 ? diag.returnCols.join(' · ') : <span className="dim">없음</span>}</span>
              <span style={{ fontWeight: 600 }}>대여료 ({diag.rentCols.length})</span>
              <span className="mono" style={{ fontSize: 10 }}>{diag.rentCols.length > 0 ? diag.rentCols.join(' · ') : <span className="dim">없음</span>}</span>
              <span style={{ fontWeight: 600 }}>보증금 ({diag.depositCols.length})</span>
              <span className="mono" style={{ fontSize: 10 }}>{diag.depositCols.length > 0 ? diag.depositCols.join(' · ') : <span className="dim">없음</span>}</span>
            </div>
            {/* 전체 헤더 보기 — 매칭 안 잡힌 케이스 디버깅 */}
            <details style={{ fontSize: 11, color: 'var(--text-weak)' }}>
              <summary style={{ cursor: 'pointer' }}>전체 헤더 ({rawHeadersForDiag.length}개) 보기</summary>
              <div className="mono" style={{ fontSize: 10, padding: 6, background: 'var(--bg-card)', marginTop: 4, borderRadius: 'var(--radius)', wordBreak: 'break-all' }}>
                {rawHeadersForDiag.map((h, idx) => `${idx + 1}.${h || '(빈)'}`).join(' | ')}
              </div>
            </details>
          </div>
        );
      })}

      {/* 가로확장 채권 시트 감지 시 */}
      {receivablesSheets.length > 0 && onCommitReceivables && (
        <div style={{
          padding: 14, background: 'var(--green-bg)', border: '1px solid var(--green-text)',
          borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--green-text)' }}>
              💰 가로확장 채권 시트 감지 ({receivablesSheets.length}개)
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 2 }}>
              한 행에 [청구·결제·일자·수단·미납] 블록이 월별로 반복.<br />
              import 시 차량번호 매칭 → 기존 계약의 회차에 결제이력 자동 추가 (계약탭 먼저 import 필요).
            </div>
          </div>
          {receivablesSheets.map((s, i) => (
            <button
              key={i}
              className="btn"
              style={{ borderColor: 'var(--green-text)', color: 'var(--green-text)', fontWeight: 600 }}
              type="button"
              disabled={busy}
              onClick={() => onCommitReceivables(s)}
            >
              <CheckCircle weight="bold" /> {s.sheetName} import
            </button>
          ))}
        </div>
      )}

      {/* 검증 결과 표 */}
      <div style={{ maxHeight: 380, overflow: 'auto', border: '1px solid var(--border)' }}>
        <table className="table" style={{ fontSize: 11 }}>
          <thead>
            <tr>
              <th className="checkbox-col">
                <input
                  type="checkbox"
                  checked={validated.length > 0 && validated.every((v) => picks[v.key])}
                  ref={(el) => {
                    if (!el) return;
                    const some = validated.some((v) => picks[v.key]);
                    const all = validated.every((v) => picks[v.key]);
                    el.indeterminate = some && !all;
                  }}
                  onChange={toggleAll}
                  aria-label="전체 선택"
                />
              </th>
              <th className="center" style={{ width: 50 }}>#</th>
              <th className="center" style={{ width: 64 }}>상태</th>
              <th style={{ width: 110 }}>차량번호</th>
              <th>계약자</th>
              <th style={{ width: 80 }}>회사</th>
              <th className="center" style={{ width: 80 }}>차량상태</th>
              <th className="mono">계약기간</th>
              <th className="num" style={{ width: 110 }}>월대여료</th>
              <th className="num" style={{ width: 110 }}>현재미수</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            {validated.length === 0 ? (
              <tr><td colSpan={11} className="muted center" style={{ padding: '24px 10px' }}>데이터 없음</td></tr>
            ) : validated.map((v, i) => (
              <tr key={v.key} className={picks[v.key] ? 'selected-row' : undefined}>
                <td className="checkbox-col">
                  <input type="checkbox" checked={!!picks[v.key]} onChange={() => togglePick(v.key)} disabled={v.kind === 'invalid'} />
                </td>
                <td className="center mono dim">{i + 1}</td>
                <td className="center">
                  {(() => {
                    const s = states[i];
                    if (s === 'contract-new') return <StatusBadge tone="green">계약 신규</StatusBadge>;
                    if (s === 'contract-update') return <StatusBadge tone="brand">계약 갱신</StatusBadge>;
                    if (s === 'vehicle-new') return <StatusBadge tone="blue">휴차 신규</StatusBadge>;
                    if (s === 'vehicle-dup') return <StatusBadge tone="gray">휴차 중복</StatusBadge>;
                    if (s === 'sheet-dup') return <StatusBadge tone="gray">시트내 중복</StatusBadge>;
                    return <StatusBadge tone="red">오류</StatusBadge>;
                  })()}
                </td>
                <td className="mono">{v.raw.plate || '-'}</td>
                <td>{v.raw.customer || (v.kind === 'vehicle-only' ? <span className="dim">(미정)</span> : '-')}</td>
                <td className="dim">{v.patch?.company || v.vehiclePatch?.company || '-'}</td>
                <td className="center">
                  {(() => {
                    const vs = v.patch?.vehicleStatus || v.vehiclePatch?.vehicleStatus;
                    if (!vs) return <span className="dim" style={{ fontSize: 10 }}>-</span>;
                    return <span className="chip" style={{ height: 16, padding: '0 6px', fontSize: 10 }}>{vs}</span>;
                  })()}
                </td>
                <td className="mono dim">
                  {v.patch ? `${v.patch.contractDate?.slice(2) ?? '-'} ~ ${v.patch.returnScheduledDate?.slice(2) ?? '-'} (${v.patch.termMonths}개월)` : '-'}
                </td>
                <td className="num mono">{v.raw.monthlyRent > 0 ? `₩${formatCurrency(v.raw.monthlyRent)}` : '-'}</td>
                <td className="num mono" style={{ color: v.raw.unpaid > 0 ? 'var(--red-text)' : undefined }}>
                  {v.raw.unpaid > 0 ? `₩${formatCurrency(v.raw.unpaid)}` : '-'}
                </td>
                <td style={{ fontSize: 10, color: v.kind === 'invalid' ? 'var(--red-text)' : (states[i] === 'vehicle-dup' || states[i] === 'sheet-dup') ? 'var(--text-weak)' : v.kind === 'vehicle-only' ? 'var(--orange-text)' : 'var(--text-weak)' }}>
                  {v.errors.join(', ') || (v.inSheetDup ? '시트 안 같은 차량번호 중복' : v.dbHit === 'vehicle' ? '이미 차량 등록됨 (skip)' : v.dbHit === 'contract' && v.kind === 'contract' ? '기존 계약 갱신' : v.patch?.unpaidSeqCount ? `미납 ${v.patch.unpaidSeqCount}회차 추정` : '')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result && (
        <div style={{ padding: 10, background: 'var(--green-bg)', color: 'var(--green-text)', borderRadius: 'var(--radius-md)', fontSize: 12, border: '1px solid var(--green-border)' }}>
          {result}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>
          {pickedCount}건 선택 · 계약은 UPSERT, 휴차 차량은 신규 등록 (이미 있으면 skip)
        </span>
        <div style={{ flex: 1 }} />
        <button
          className="btn btn-primary"
          type="button"
          disabled={busy || pickedCount === 0}
          onClick={async () => {
            const rows = validated.filter((v) => picks[v.key]).map((v) => v.row);
            await onCommit(rows);
            setSheets([]);
            setPicks({});
          }}
        >
          {busy ? <CircleNotch size={14} weight="bold" style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} weight="bold" />}
          {' '}{busy ? '반영 중...' : `${pickedCount}건 반영하기`}
        </button>
      </div>
    </div>
  );
}

/* ─────────────── 계약 등록 Pane (개별 / OCR / 엑셀) ─────────────── */

function ContractRegisterPane({
  files, drag, onPick, onChangeKind, onClose, onContractCreated,
  onCommit, busy, result,
}: {
  files: ParsedSheet[];
  drag: boolean;
  onPick: () => void;
  onChangeKind: (idx: number, k: UploadKind) => void;
  onClose: () => void;
  /** 등록 완료 시 detail 자동 오픈 콜백 — 트렌드 UX (등록 후 점진 입력) */
  onContractCreated?: (id: string) => void;
  onCommit: () => Promise<void>;
  busy: boolean;
  result: string | null;
}) {
  const [mode, setMode] = useState<VehicleMode>('manual');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <div className="filter-bar">
        <button type="button" className={`chip ${mode === 'manual' ? 'active' : ''}`} onClick={() => setMode('manual')}>
          <Keyboard size={11} /> 개별 입력
        </button>
        <button type="button" className={`chip ${mode === 'ocr' ? 'active' : ''}`} onClick={() => setMode('ocr')}>
          <Camera size={11} /> OCR (계약서)
        </button>
        <button type="button" className={`chip ${mode === 'excel' ? 'active' : ''}`} onClick={() => setMode('excel')}>
          <FileXls size={11} /> 엑셀 일괄
        </button>
      </div>

      {mode === 'manual' && <ContractManualForm onSubmit={(newId) => {
        onClose();
        if (newId) onContractCreated?.(newId);
      }} />}
      {mode === 'ocr' && <ContractOcrPane onSubmit={() => { toast.success('OCR 계약 등록 완료'); onClose(); }} />}
      {mode === 'excel' && (
        <UploadPane
          files={files} drag={drag} onPick={onPick} onChangeKind={onChangeKind}
          emptyTitle="계약 엑셀 일괄"
          emptyDesc="여러 신규 계약을 한번에 등록"
          columns={CONTRACT_COLUMNS}
          templateName="계약생성_템플릿.xlsx"
          onCommit={onCommit} busy={busy} result={result}
        />
      )}
    </div>
  );
}

function ContractManualForm({ onSubmit }: { onSubmit: (newContractId?: string) => void }) {
  const companyNames = useCompanyNames();
  const { add: addContract, contracts } = useContracts();
  const { vehicles, add: addVehicle, update: updateVehicle } = useVehicles();
  const { companies } = useCompanies();
  const [company, setCompany] = useState(companyNames[0] ?? '');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone1, setCustomerPhone1] = useState('');
  const [regNo, setRegNo] = useState('');
  const [plate, setPlate] = useState('');
  // 5단 분류
  const [vehicleMaker, setVehicleMaker] = useState('');
  const [vehicleModelLine, setVehicleModelLine] = useState('');
  const [vehicleSubModel, setVehicleSubModel] = useState('');
  const [vehicleVariant, setVehicleVariant] = useState('');
  const [vehicleTrim, setVehicleTrim] = useState('');
  const [vehicleOptions, setVehicleOptions] = useState('');
  const [exteriorColor, setExteriorColor] = useState('');
  const [interiorColor, setInteriorColor] = useState('');
  // 기존 차량 매칭 (차량번호 → vehicles 검색)
  const matchedVehicle = useMemo(() => {
    const key = plate.trim();
    if (!key || key === '미정') return null;
    return vehicles.find((v) => (v.plate ?? '').trim() === key) ?? null;
  }, [plate, vehicles]);
  // 매칭되면 차량 정보 5단 자동 채움 + 잠금 (편집은 차량 페이지에서)
  useEffect(() => {
    if (!matchedVehicle) return;
    setVehicleMaker(matchedVehicle.vehicleMaker ?? '');
    setVehicleModelLine(matchedVehicle.vehicleModelLine ?? '');
    setVehicleSubModel(matchedVehicle.vehicleSubModel ?? '');
    setVehicleVariant(matchedVehicle.vehicleVariant ?? '');
    setVehicleTrim(matchedVehicle.vehicleTrim ?? '');
    setVehicleOptions(matchedVehicle.vehicleOptions ?? '');
    setExteriorColor(matchedVehicle.exteriorColor ?? '');
    setInteriorColor(matchedVehicle.interiorColor ?? '');
  }, [matchedVehicle]);
  const [contractDate, setContractDate] = useState(todayKr());   // KST — UTC 는 0~9시 전날로 프리필돼 회차 dueDate 가 하루 당겨짐
  const [returnDate, setReturnDate] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [paymentDay, setPaymentDay] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState('이체');
  const [deposit, setDeposit] = useState('');
  const [manager, setManager] = useState('');
  const [notes, setNotes] = useState('');
  // 운전자 / 면허
  const [customerKind, setCustomerKind] = useState<'개인' | '사업자' | '법인'>('개인');
  const [driverName, setDriverName] = useState('');
  const [driverIdentNo, setDriverIdentNo] = useState('');
  const [additionalDrivers, setAdditionalDrivers] = useState<AdditionalDriver[]>([]);
  const [licenseNo, setLicenseNo] = useState('');
  const [licenseType, setLicenseType] = useState('1종 보통');
  const [licenseOcrBusy, setLicenseOcrBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const valid = customerName && customerPhone1 && contractDate && monthlyRent;

  async function handleSave() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const monthly = parseInt(monthlyRent.replace(/[^0-9]/g, ''), 10) || 0;
      const depositN = deposit ? parseInt(deposit.replace(/[^0-9]/g, ''), 10) || 0 : 0;
      const payDay = Math.max(1, Math.min(31, parseInt(paymentDay, 10) || 1));

      // 차량 처리:
      //  - matchedVehicle 있음 → 기존 차량 사용 (그대로)
      //  - 차량번호 입력 + matchedVehicle 없음 → 신규 차량 자동 등록
      //  - 차량번호 미정 → 차량 등록 안 함 (계약만)
      const plateTrim = plate.trim();
      if (plateTrim && plateTrim !== '미정' && !matchedVehicle) {
        const fullName = buildVehicleFullName({
          maker: vehicleMaker, model: vehicleModelLine, subModel: vehicleSubModel,
          variant: vehicleVariant, trim: vehicleTrim,
        });
        if (fullName) {
          await addVehicle({
            plate: plateTrim,
            model: fullName,
            company: (company || '기타') as import('@/lib/types').CompanyCode,
            status: '구매대기',
            vehicleMaker: vehicleMaker.trim() || undefined,
            vehicleModelLine: vehicleModelLine.trim() || undefined,
            vehicleSubModel: vehicleSubModel.trim() || undefined,
            vehicleVariant: vehicleVariant.trim() || undefined,
            vehicleTrim: vehicleTrim.trim() || undefined,
            vehicleOptions: vehicleOptions.trim() || undefined,
            exteriorColor: exteriorColor.trim() || undefined,
            interiorColor: interiorColor.trim() || undefined,
            createdAt: new Date().toISOString(),
          });
        }
      }

      // termMonths 자동 계산 — 진짜 calendar months (나누기 X)
      let termMonths = 12;
      if (returnDate && contractDate) {
        termMonths = monthsBetween(contractDate, returnDate) || 12;
      }

      const identDigits = (regNo || '').replace(/\D/g, '');
      // 계약번호 — 회사·월 scope 순번(#쓰기경로 v6정합). company 는 이름일 수 있어 코드로 resolve.
      const companyCode = companies.find((co) => co.name === company || co.code === company)?.code ?? company;
      const contractNo = nextContractNo(companyCode, contracts, yymmOf(contractDate));

      // 회차 자동 생성 — termMonths 만큼 monthlyRent 청구 (paymentDay 기준).
      // 누락 시 수납 탭 빈 화면 + autoMatch 동작 불가 → 등록 시점에 즉시 생성.
      const generatedRaw = generateSchedules({
        contractDate, termMonths, monthlyRent: monthly, paymentDay: payDay,
      });
      const inlineSchedules = generatedRaw.map((s) => ({
        seq: s.seq, dueDate: s.dueDate, amount: s.amount,
        status: s.status, paidAmount: s.paidAmount,
      }));

      // Phosphor types CompanyCode 가 alias 라 그대로 사용
      const newContractId = await addContract({
        contractNo,
        company: (company || '기타') as import('@/lib/types').CompanyCode,
        // FK write-stamp(#쓰기경로 v6정합) — customerId 결정적(등록번호 키), vehicleId 는 기존 plate면 확정(신규는 백필)
        customerId: customerKey({ customerIdentNo: identDigits || undefined, customerName: customerName.trim(), customerPhone1: customerPhone1.trim() }),
        vehicleId: findVehicleByPlate(vehicles, normPlate(plate.trim()))?.id,
        customerName: customerName.trim(),
        customerKind,
        customerIdentNo: identDigits || undefined,
        customerPhone1: customerPhone1.trim(),
        driverName: customerKind === '법인' ? driverName.trim() || undefined : undefined,
        driverIdentNo: customerKind === '법인' ? (driverIdentNo.replace(/\D/g, '') || undefined) : undefined,
        additionalDrivers: additionalDrivers.length > 0
          ? additionalDrivers.filter((d) => (d.identNo ?? '').replace(/\D/g, '').length === 13 || (d.name ?? '').trim().length > 0)
          : undefined,
        customerLicenseNo: licenseNo.trim() || undefined,
        customerLicenseType: licenseType,
        vehiclePlate: normPlate(plate.trim()) || '미정',
        vehicleModel: buildVehicleFullName({
          maker: vehicleMaker, model: vehicleModelLine, subModel: vehicleSubModel,
          variant: vehicleVariant, trim: vehicleTrim,
        }) || '미정',
        // 신규 계약 = 등록 시점에 인도완료·운행 처리 (사용자 정책 — 계약자 있으면 인도된 것으로 간주)
        vehicleStatus: '운행',
        status: '운행',
        vehicleMaker: vehicleMaker.trim() || undefined,
        vehicleModelLine: vehicleModelLine.trim() || undefined,
        vehicleSubModel: vehicleSubModel.trim() || undefined,
        vehicleVariant: vehicleVariant.trim() || undefined,
        vehicleTrim: vehicleTrim.trim() || undefined,
        vehicleOptions: vehicleOptions.trim() || undefined,
        vehicleExteriorColor: exteriorColor.trim() || undefined,
        vehicleInteriorColor: interiorColor.trim() || undefined,
        contractDate,
        deliveredDate: contractDate,
        returnScheduledDate: returnDate || undefined,
        termMonths,
        longTerm: termMonths >= 12,
        monthlyRent: monthly,
        deposit: depositN,
        paymentDay: payDay,
        paymentMethod,
        manager: manager.trim() || undefined,
        notes: notes.trim() || undefined,
        schedules: inlineSchedules,
        currentSeq: 1,
        totalSeq: termMonths,
        unpaidAmount: 0,
        unpaidSeqCount: 0,
      });
      // SSoT: 같은 plate Vehicle 자동 upsert (없으면 자동 생성 + 자산 노출)
      try {
        const builtContract = {
          id: newContractId,
          contractNo,
          company: (company || '기타') as import('@/lib/types').CompanyCode,
          vehiclePlate: normPlate(plate.trim()) || '미정',
          vehicleModel: buildVehicleFullName({
            maker: vehicleMaker, model: vehicleModelLine, subModel: vehicleSubModel,
            variant: vehicleVariant, trim: vehicleTrim,
          }) || '미정',
          vehicleStatus: '구매대기' as import('@/lib/types').VehicleStatus,
          vehicleMaker: vehicleMaker.trim() || undefined,
          vehicleModelLine: vehicleModelLine.trim() || undefined,
          vehicleSubModel: vehicleSubModel.trim() || undefined,
          vehicleVariant: vehicleVariant.trim() || undefined,
          vehicleTrim: vehicleTrim.trim() || undefined,
          status: '대기' as import('@/lib/types').ContractStatus,
          customerName: customerName.trim(),
          customerPhone1: customerPhone1.trim(),
          contractDate,
        } as unknown as import('@/lib/types').Contract;
        await upsertVehicleFromContract(builtContract, {
          vehicles, companies, addVehicle, updateVehicle,
        });
      } catch (syncErr) {
        console.error('vehicle sync from contract failed', syncErr);
      }
      onSubmit(newContractId);
    } catch (e) {
      toast.error('계약 등록 실패: ' + ((e as Error).message ?? String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function handleLicenseOcr(file: File) {
    setLicenseOcrBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'license');
      const { getFirebaseAuth } = await import('@/lib/firebase/client');
      const auth = getFirebaseAuth();
      const user = auth?.currentUser;
      const idToken = user ? await user.getIdToken() : '';
      const res = await fetch('/api/ocr/extract', {
        method: 'POST',
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
        body: fd,
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'OCR 실패');
      const raw = json.extracted as Record<string, string | null>;
      const ln = (raw.license_no ?? '').trim();
      const ltype = (raw.license_type ?? '').trim();
      const holder = (raw.holder_name ?? '').trim();
      if (ln) setLicenseNo(ln);
      if (ltype) setLicenseType(ltype);
      // 법인이면 주운전자명, 아니면 계약자명 채우기 (이미 있으면 덮어쓰지 않음)
      if (holder) {
        if (customerKind === '법인') {
          if (!driverName) setDriverName(holder);
        } else {
          if (!customerName) setCustomerName(holder);
        }
      }
    } catch (e) {
      toast.error('면허증 OCR 실패: ' + ((e as Error).message ?? String(e)));
    } finally {
      setLicenseOcrBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void handleSave(); }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflow: 'auto' }}
    >
      <div className="detail-section">
        <div className="detail-section-header">필수 정보</div>
        <div className="detail-section-body">
          <div className="form-grid-2">
            <label className="form-label">회사 *</label>
            <div style={{ gridColumn: 'span 3' }}>
              <CompanyPicker value={company} onChange={setCompany} options={companyNames} />
            </div>

            <label className="form-label">계약자명 *</label>
            <input className="input" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} />

            <label className="form-label">연락처 *</label>
            <PhoneInput value={customerPhone1} onChange={setCustomerPhone1} className="input" />

            <label className="form-label">계약일 *</label>
            <DateInput required value={contractDate} onChange={setContractDate} style={{ width: 200 }} />

            <label className="form-label">월 대여료 *</label>
            <input className="input" required placeholder="원 단위" value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 200 }} />
          </div>
        </div>
      </div>

      <div className="detail-section">
        <div className="detail-section-header">차량</div>
        <div className="detail-section-body">
          <div className="form-grid-2">
            <label className="form-label">차량번호</label>
            <input className="input" placeholder="입력 시 기존 차량 자동 조회 · 미정도 가능 (신차/구매예정)" value={plate} onChange={(e) => setPlate(e.target.value)} />
          </div>

          {/* 매칭 상태 배너 */}
          {plate.trim() && plate.trim() !== '미정' && (
            <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 12, border: '1px solid var(--line)', background: matchedVehicle ? '#ecfdf5' : '#fffbeb', color: matchedVehicle ? '#065f46' : '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
              {matchedVehicle ? (
                <>
                  <strong>✓ 기존 차량 매칭</strong>
                  <span>{matchedVehicle.plate} · {matchedVehicle.model}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-weak)' }}>차량 정보는 차량 상세 페이지에서 수정</span>
                </>
              ) : (
                <>
                  <strong>⚠ 미등록 차량</strong>
                  <span>저장 시 신규 차량으로 자동 등록됩니다. 아래 5단을 입력해주세요.</span>
                </>
              )}
            </div>
          )}
          {(!plate.trim() || plate.trim() === '미정') && (
            <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 12, border: '1px solid var(--line)', background: 'var(--bg-soft)', color: 'var(--text-weak)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong style={{ color: 'var(--ink)' }}>ⓘ 차량번호 미정</strong>
              <span>신차 구매예정 — 차량은 추후 별도 등록</span>
            </div>
          )}

          {/* 차량 상세 (5단 + 옵션·색상) — 등록 후 detail 에서도 입력 가능. 매칭된 차량은 자동 펼침. */}
          <details open={!matchedVehicle && (!!vehicleMaker || !!vehicleModelLine)} style={{ marginTop: 10 }}>
            <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--text-sub)', padding: '6px 0' }}>
              + 차량 5단 분류·색상·옵션 (선택 — 등록 후 차량 상세에서 입력 가능)
            </summary>
            <div className="form-grid-2" style={{ marginTop: 6, opacity: matchedVehicle ? 0.6 : 1 }}>
              <label className="form-label">① 제조사</label>
              <input className="input" disabled={!!matchedVehicle} list="dl-makers" placeholder="예: 현대" value={vehicleMaker} onChange={(e) => { setVehicleMaker(e.target.value); setVehicleModelLine(''); }} />

              <label className="form-label">② 모델</label>
              <input className="input" disabled={!!matchedVehicle} list="dl-models" placeholder="예: 그랜저" value={vehicleModelLine} onChange={(e) => setVehicleModelLine(e.target.value)} />

              <label className="form-label">③ 세부모델</label>
              <input className="input" disabled={!!matchedVehicle} placeholder="예: 더 뉴 그랜저 GN7" value={vehicleSubModel} onChange={(e) => setVehicleSubModel(e.target.value)} />

              <label className="form-label">④ 모델구분</label>
              <input className="input" disabled={!!matchedVehicle} placeholder="예: 가솔린 3.5 AWD (연료·엔진·구동·인승)" value={vehicleVariant} onChange={(e) => setVehicleVariant(e.target.value)} />

              <label className="form-label">⑤ 트림</label>
              <input className="input" disabled={!!matchedVehicle} placeholder="예: 캘리그래피" value={vehicleTrim} onChange={(e) => setVehicleTrim(e.target.value)} />

              <label className="form-label">선택옵션</label>
              <input className="input" disabled={!!matchedVehicle} placeholder="예: 선루프, 풀옵션, 18인치휠, 내비" value={vehicleOptions} onChange={(e) => setVehicleOptions(e.target.value)} />

              <label className="form-label">외부 색상</label>
              <input className="input" disabled={!!matchedVehicle} placeholder="예: 화이트 펄" value={exteriorColor} onChange={(e) => setExteriorColor(e.target.value)} />

              <label className="form-label">내부 색상</label>
              <input className="input" disabled={!!matchedVehicle} placeholder="예: 베이지" value={interiorColor} onChange={(e) => setInteriorColor(e.target.value)} />
            </div>
          </details>
          <datalist id="dl-makers">
            {MAKERS.map((m) => <option key={m} value={m} />)}
          </datalist>
          <datalist id="dl-models">
            {(MODELS_BY_MAKER[vehicleMaker] ?? []).map((m) => <option key={m} value={m} />)}
          </datalist>
        </div>
      </div>

      <details open={customerKind === '법인' || !!regNo || !!driverName || !!licenseNo} className="detail-section">
        <summary className="detail-section-header" style={{ cursor: 'pointer' }}>
          계약자 구분 / 운전자 면허 <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-weak)', marginLeft: 6 }}>(선택 — 등록 후에도 입력 가능)</span>
        </summary>
        <div className="detail-section-body">
          <div className="form-grid-2">
            <label className="form-label">구분</label>
            <select className="input" value={customerKind} onChange={(e) => setCustomerKind(e.target.value as typeof customerKind)} style={{ width: 200 }}>
              <option value="개인">개인</option>
              <option value="사업자">사업자</option>
              <option value="법인">법인</option>
            </select>

            <label className="form-label">등록번호</label>
            <IdentInput
              kind={customerKind === '사업자' ? '사업자' : 'auto'}
              value={regNo}
              onChange={setRegNo}
              className="input"
            />

            {customerKind === '법인' && (
              <>
                <label className="form-label">주운전자명 *</label>
                <input
                  className="input"
                  placeholder="실제 차량 운전자 (법인 계약 시 필수)"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  style={{ gridColumn: 'span 3' }}
                />
                <label className="form-label">주운전자 주민번호</label>
                <input
                  className="input mono"
                  placeholder="900101-1234567 (보험연령 검증용)"
                  value={driverIdentNo}
                  onChange={(e) => setDriverIdentNo(e.target.value)}
                  style={{ gridColumn: 'span 3' }}
                />
              </>
            )}

            {/* 추가운전자 — 가족·배우자·직원 등. 보험연령 자동 검증 대상.
                계약 등록 후에도 detail '운전자' 섹션에서 추가/수정 가능. */}
            <label className="form-label" style={{ alignSelf: 'start', paddingTop: 6 }}>추가운전자</label>
            <div style={{ gridColumn: 'span 3', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {additionalDrivers.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text-weak)', padding: '4px 0' }}>없음 — 필요 시 추가</div>
              ) : (
                additionalDrivers.map((d, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr auto', gap: 6, alignItems: 'center',
                  }}>
                    <input
                      className="input" placeholder="이름"
                      value={d.name ?? ''}
                      onChange={(e) => setAdditionalDrivers((arr) => arr.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}
                    />
                    <IdentInput
                      kind="개인"
                      value={d.identNo ?? ''}
                      onChange={(v) => setAdditionalDrivers((arr) => arr.map((x, idx) => idx === i ? { ...x, identNo: v } : x))}
                      className="input mono"
                    />
                    <input
                      className="input" placeholder="관계 (배우자/자녀 등)"
                      value={d.relation ?? ''}
                      onChange={(e) => setAdditionalDrivers((arr) => arr.map((x, idx) => idx === i ? { ...x, relation: e.target.value } : x))}
                    />
                    <button
                      type="button" className="btn-ghost"
                      onClick={() => setAdditionalDrivers((arr) => arr.filter((_, idx) => idx !== i))}
                      style={{ padding: '4px 6px', cursor: 'pointer', color: 'var(--red-text)' }}
                    >✕</button>
                  </div>
                ))
              )}
              <button
                type="button" className="btn btn-sm"
                onClick={() => setAdditionalDrivers((arr) => [...arr, { name: '', identNo: '', relation: '', registeredAt: new Date().toISOString() }])}
                style={{ alignSelf: 'flex-start' }}
              >+ 추가운전자</button>
            </div>

            <label className="form-label">
              면허번호
              {licenseNo && (
                <span style={{
                  marginLeft: 6, fontSize: 10,
                  color: licenseNo.replace(/\D/g, '').length === 12 ? 'var(--green-text)' : 'var(--orange-text)',
                }}>
                  {licenseNo.replace(/\D/g, '').length}/12
                </span>
              )}
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="input"
                placeholder="예: 11-12-345678-90 (숫자 12자리)"
                value={licenseNo}
                onChange={(e) => setLicenseNo(e.target.value)}
                style={{
                  flex: 1,
                  borderColor: licenseNo && licenseNo.replace(/\D/g, '').length !== 12 ? 'var(--orange-text)' : undefined,
                }}
              />
              <label className="btn" style={{ cursor: licenseOcrBusy ? 'wait' : 'pointer', flex: '0 0 auto' }}>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={licenseOcrBusy}
                  onChange={(e) => { if (e.target.files?.[0]) handleLicenseOcr(e.target.files[0]); }}
                />
                {licenseOcrBusy ? <CircleNotch weight="bold" style={{ animation: 'spin 1s linear infinite' }} /> : <Camera size={12} weight="duotone" />}
                면허증 OCR
              </label>
            </div>

            <label className="form-label">면허종별</label>
            <select className="input" value={licenseType} onChange={(e) => setLicenseType(e.target.value)} style={{ width: 200 }}>
              <option value="1종 대형">1종 대형</option>
              <option value="1종 보통">1종 보통</option>
              <option value="1종 소형">1종 소형</option>
              <option value="대형견인차">대형견인차</option>
              <option value="구난차">구난차</option>
              <option value="소형견인차">소형견인차</option>
              <option value="2종 보통">2종 보통</option>
              <option value="2종 소형">2종 소형</option>
              <option value="2종 원동기">2종 원동기</option>
            </select>
          </div>
        </div>
      </details>

      <div className="detail-section">
        <div className="detail-section-header">계약 조건 (선택)</div>
        <div className="detail-section-body">
          <div className="form-grid-2">
            <label className="form-label">반납예정</label>
            <DateInput value={returnDate} onChange={setReturnDate} style={{ width: 200 }} />

            <label className="form-label">결제일</label>
            <input className="input" placeholder="1~31" value={paymentDay} onChange={(e) => setPaymentDay(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 100 }} />

            <label className="form-label">결제방법</label>
            <input className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} />

            <label className="form-label">보증금</label>
            <input className="input" placeholder="원 단위" value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 200 }} />

            <label className="form-label">담당자</label>
            <input className="input" value={manager} onChange={(e) => setManager(e.target.value)} />

            <label className="form-label" style={{ alignSelf: 'start', paddingTop: 6 }}>비고</label>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              style={{ height: 'auto', padding: '8px 12px', resize: 'vertical', gridColumn: 'span 3' }} />
          </div>
        </div>
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: 8, position: 'sticky', bottom: 0, background: 'var(--bg-card)', paddingTop: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={!valid || saving}>
          {saving ? <CircleNotch size={14} weight="bold" style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} />}
          {saving ? '저장 중...' : '계약 등록'}
        </button>
      </div>
    </form>
  );
}

type ExtractedRow = {
  fileName: string;
  customerName: string;
  customerPhone1: string;
  plate: string;
  model: string;
  company: string;          // 회사 마스터 매칭 결과 (또는 raw)
  matchedVehicleId?: string; // 기존 vehicle 매칭 시
  licenseNo: string;
  licenseType: string;
  monthlyRent: string;
  contractDate: string;
  endDate: string;
  termMonths: number;
  error?: string;
};

function ContractOcrPane({ onSubmit }: { onSubmit: () => void }) {
  const { addMany: addContracts, contracts } = useContracts();
  const { vehicles, add: addVehicle, addMany: addVehicles, update: updateVehicle } = useVehicles();
  const { companies } = useCompanies();
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<ExtractedRow[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // 회사 마스터 fuzzy 매칭
  const matchCompany = useCallback((raw: string): string => {
    if (!raw) return '';
    const norm = raw.replace(/[\s()]/g, '').toLowerCase();
    for (const co of companies) {
      const n = co.name.replace(/[\s()주식회사㈜]/g, '').toLowerCase();
      if (norm.includes(n) || n.includes(norm)) return co.name;
    }
    return raw;
  }, [companies]);

  // 차량 마스터 plate 매칭 — SSOT findVehicleByPlate (하이픈·OCR O→0/I→1·번호변경 이력 포함).
  //   공백만 제거하던 로컬 비교는 하이픈/OCR 편차·plateHistory 차량을 못 잡아 기존 차량을
  //   '신규 생성(+)'으로 오표시했음.
  const matchVehicle = useCallback((plate: string): string | undefined => {
    return findVehicleByPlate(vehicles, plate)?.id;
  }, [vehicles]);

  async function handleFiles(fileList: File[]) {
    if (fileList.length === 0) return;
    setBusy(true);
    setProgress({ done: 0, total: fileList.length });
    const out: ExtractedRow[] = [];
    const { getFirebaseAuth } = await import('@/lib/firebase/client');
    const auth = getFirebaseAuth();
    const user = auth?.currentUser;
    const idToken = user ? await user.getIdToken() : '';

    for (const file of fileList) {
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('type', 'rental_contract');
        const res = await fetch('/api/ocr/extract', {
          method: 'POST',
          headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
          body: fd,
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || 'OCR 실패');
        const raw = json.extracted as Record<string, unknown>;
        const plate = String(raw.car_number ?? '').trim();
        const rawCompany = String(raw.company_name ?? '');
        out.push({
          fileName: file.name,
          customerName: String(raw.contractor_name ?? ''),
          customerPhone1: String(raw.contractor_phone ?? ''),
          plate,
          model: String(raw.car_name ?? ''),
          company: matchCompany(rawCompany),
          matchedVehicleId: matchVehicle(plate),
          licenseNo: String(raw.contractor_license_no ?? ''),
          licenseType: '1종 보통',
          monthlyRent: String(raw.monthly_amount ?? ''),
          // OCR 날짜는 '2026.05.20' 등 비ISO 가능 — 정규화 없이 저장하면 회차 dueDate/기간필터/정렬 전부 오작동
          contractDate: normalizeKoreanDate(String(raw.start_date ?? raw.contract_date ?? '')),
          endDate: normalizeKoreanDate(String(raw.end_date ?? '')),
          termMonths: (() => {
            // 시작·종료일이 있으면 실제 기간 우선 (OCR 개월수는 fallback) — 수기·엑셀 경로와 동일 규칙
            const s = normalizeKoreanDate(String(raw.start_date ?? raw.contract_date ?? ''));
            const e = normalizeKoreanDate(String(raw.end_date ?? ''));
            if (s && e) { const m = monthsBetween(s, e); if (m > 0) return m; }
            return Number(raw.rental_period_months ?? 12) || 12;
          })(),
        });
      } catch (e) {
        out.push({
          fileName: file.name,
          customerName: '', customerPhone1: '', plate: '', model: '', company: '',
          licenseNo: '', licenseType: '1종 보통', monthlyRent: '',
          contractDate: '', endDate: '', termMonths: 12,
          error: (e as Error).message ?? String(e),
        });
      }
      setProgress({ done: out.length, total: fileList.length });
    }
    setRows(out);
    setBusy(false);
    setProgress(null);
  }

  function updateRow(idx: number, patch: Partial<ExtractedRow>) {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSaveAll() {
    const valid = rows.filter((r) => !r.error && r.customerName.trim() && r.plate.trim());
    if (valid.length === 0) return;
    setSaving(true);
    try {
      // 신규 차량 사전 생성 제거 — 아래 upsertVehicleFromContract 가 미등록 plate 를 자동 생성한다.
      // (기존엔 addVehicles 로 먼저 만든 뒤 stale vehicles 목록으로 upsert 를 또 돌려 같은 차가 2대 생겼음)

      // 계약 일괄 등록
      const today = todayKr();
      const newContracts = valid.map((r) => {
        const monthly = parseInt((r.monthlyRent || '0').replace(/[^0-9]/g, ''), 10) || 0;
        const start = r.contractDate || today;
        const yy = start.slice(2, 4);
        const mm = start.slice(5, 7);
        return {
          contractNo: '', // assignContractNos 로 회사·월 순번 재할당(아래)
          company: (r.company || '기타') as import('@/lib/types').CompanyCode,
          customerName: r.customerName.trim() || '미상',
          customerPhone1: r.customerPhone1.trim(),
          customerLicenseNo: r.licenseNo.trim() || undefined,
          customerLicenseType: r.licenseType,
          vehiclePlate: r.plate.trim(),
          vehicleModel: r.model.trim() || '미정',
          vehicleStatus: '운행' as const,
          contractDate: start,
          deliveredDate: start,   // status='운행' 인데 인도일 없으면 3경로(수기/엑셀/OCR) 불일치
          returnScheduledDate: r.endDate || undefined,
          termMonths: r.termMonths,
          longTerm: r.termMonths >= 12,
          monthlyRent: monthly,
          deposit: 0,
          paymentDay: 1,
          paymentMethod: '이체',
          status: '운행' as const,
          currentSeq: 1,
          totalSeq: r.termMonths,
          unpaidAmount: 0,
          unpaidSeqCount: 0,
          // 회차표 — 누락 시 수납 매칭/FIFO 불가 (수기·엑셀 경로와 동일)
          schedules: r.termMonths > 0
            ? generateSchedules({ contractDate: start, termMonths: r.termMonths, monthlyRent: monthly, paymentDay: 1 })
            : undefined,
        };
      });
      const withNos = assignContractNos(newContracts, contracts, companies); // 회사·월 순번 계약번호
      await addContracts(withNos);
      // 차량 자동 동기화 — upsert 가 미등록 plate 를 자동 생성 + currentContractId 갱신.
      // ctx.vehicles 가 stale 상태라 같은 plate 를 두 번 upsert 하면 중복 생성 → plate 당 1회만.
      const syncCtx2 = { vehicles, companies, addVehicle, updateVehicle };
      const upsertedPlates = new Set<string>();
      for (const c of withNos) {
        const p = (c.vehiclePlate ?? '').trim();
        if (p && upsertedPlates.has(p)) continue;
        if (p) upsertedPlates.add(p);
        try { await upsertVehicleFromContract(c as Contract, syncCtx2); }
        catch (e) { console.error('legacy contracts vehicle sync failed', (c as Contract).contractNo, e); }
      }
      toast.success(`${valid.length}건 계약 등록 (미등록 차량은 자동 생성)`);
      onSubmit();
    } catch (e) {
      toast.error('계약 등록 실패: ' + ((e as Error).message ?? String(e)));
    } finally {
      setSaving(false);
    }
  }

  // ─── 결과 리스트 화면 ───
  if (rows.length > 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
        <div className="detail-section" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="detail-section-header" style={{ color: 'var(--green-text)' }}>
            <CheckCircle size={12} weight="duotone" />
            <span className="title">OCR 추출 완료 — {rows.length}건 (확인 후 일괄 저장)</span>
            <button type="button" className="btn btn-sm" onClick={() => setRows([])} style={{ marginLeft: 'auto' }}>
              다시 스캔
            </button>
          </div>
          <div className="detail-section-body" style={{ flex: 1, overflow: 'auto' }}>
            <table className="table" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th style={{ width: 90 }}>차량번호</th>
                  <th style={{ width: 100 }}>차종</th>
                  <th style={{ width: 90 }}>계약자</th>
                  <th style={{ width: 110 }}>연락처</th>
                  <th style={{ width: 90 }}>회사</th>
                  <th style={{ width: 90 }}>계약시작</th>
                  <th style={{ width: 90 }}>계약종료</th>
                  <th style={{ width: 90 }} className="num">월대여료</th>
                  <th style={{ width: 60 }} className="center">차량매칭</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={r.error ? { background: 'var(--red-bg)' } : undefined}>
                    <td className="center">
                      <button type="button" className="btn btn-sm" onClick={() => removeRow(i)} title="제외">
                        <X size={11} />
                      </button>
                    </td>
                    <td><input className="input mono" value={r.plate} onChange={(e) => updateRow(i, { plate: e.target.value, matchedVehicleId: matchVehicle(e.target.value) })} style={{ width: '100%' }} /></td>
                    <td><input className="input" value={r.model} onChange={(e) => updateRow(i, { model: e.target.value })} style={{ width: '100%' }} /></td>
                    <td><input className="input" value={r.customerName} onChange={(e) => updateRow(i, { customerName: e.target.value })} style={{ width: '100%' }} /></td>
                    <td><input className="input mono" value={r.customerPhone1} onChange={(e) => updateRow(i, { customerPhone1: e.target.value })} style={{ width: '100%' }} /></td>
                    <td><input className="input" value={r.company} onChange={(e) => updateRow(i, { company: e.target.value })} style={{ width: '100%' }} /></td>
                    <td><input className="input mono" value={r.contractDate} onChange={(e) => updateRow(i, { contractDate: e.target.value })} style={{ width: '100%' }} placeholder="YYYY-MM-DD" /></td>
                    <td><input className="input mono" value={r.endDate} onChange={(e) => updateRow(i, { endDate: e.target.value })} style={{ width: '100%' }} placeholder="YYYY-MM-DD" /></td>
                    <td><input className="input num" value={r.monthlyRent} onChange={(e) => updateRow(i, { monthlyRent: e.target.value.replace(/[^0-9]/g, '') })} style={{ width: '100%' }} /></td>
                    <td className="center">
                      {r.error ? (
                        <span style={{ color: 'var(--red-text)' }} title={r.error}>✗</span>
                      ) : r.matchedVehicleId ? (
                        <span style={{ color: 'var(--green-text)' }} title="기존 차량 매칭">✓</span>
                      ) : (
                        <span style={{ color: 'var(--amber-text)' }} title="신규 차량 자동 생성">+</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-weak)' }}>
            ✓ 기존 차량 매칭 / + 신규 차량 자동 생성 / ✗ OCR 실패
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" onClick={() => setRows([])}>취소</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveAll}
              disabled={saving || rows.filter((r) => !r.error && r.customerName.trim() && r.plate.trim()).length === 0}
            >
              {saving ? <CircleNotch size={14} weight="bold" style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} />}
              {saving ? '저장 중...' : `${rows.filter((r) => !r.error && r.customerName.trim() && r.plate.trim()).length}건 일괄 등록`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── 업로드 영역 ───
  if (busy) {
    return (
      <div className="dropzone" style={{ minHeight: 320, cursor: 'default', flex: 1 }}>
        <div className="dropzone-icon">
          <CircleNotch size={28} weight="bold" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
        <div className="dropzone-title">OCR 처리 중...</div>
        <div className="dropzone-desc">
          계약서 {progress ? `${progress.done} / ${progress.total}` : ''} 분석 중
        </div>
      </div>
    );
  }

  return (
    <div
      className="dropzone"
      style={{ minHeight: 320, flex: 1 }}
      onClick={() => document.getElementById('jpk-ocr-contract')?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf');
        if (files.length > 0) void handleFiles(files);
      }}
    >
      <input
        id="jpk-ocr-contract"
        type="file"
        multiple
        accept="image/*,.pdf"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) void handleFiles(files);
          e.target.value = '';
        }}
      />
      <div className="dropzone-icon"><Camera size={28} weight="duotone" /></div>
      <div className="dropzone-title">계약서 스캔 (다중 업로드)</div>
      <div className="dropzone-desc">
        계약서 PDF/이미지 여러 장 한 번에 — 회사·차량 자동 매칭. 일치 차량은 매칭, 없으면 차량 자동 생성.
      </div>
      <button className="btn btn-primary" type="button" onClick={(e) => { e.stopPropagation(); document.getElementById('jpk-ocr-contract')?.click(); }}>
        <Camera size={14} /> 파일 선택
      </button>
      <div className="dropzone-hint">또는 여기에 끌어다 놓기 · PDF 여러 장 가능</div>
    </div>
  );
}

/* ─────────────── 수납 등록 Pane (개별 / OCR / 엑셀) ─────────────── */

type PaymentVariant = '입출금' | '자동이체' | '카드매출' | '법인카드';

function PaymentRegisterPane({
  files, drag, onPick, onChangeKind, onClose,
  onCommit, busy, result, variant,
}: {
  files: ParsedSheet[];
  drag: boolean;
  onPick: () => void;
  onChangeKind: (idx: number, k: UploadKind) => void;
  onClose: () => void;
  onCommit: () => Promise<void>;
  busy: boolean;
  result: string | null;
  variant: PaymentVariant;
}) {
  // variant 별 기본 모드 — 입출금/자동이체/카드수납/법인카드 모두 엑셀 일괄이 기본 (직원 워크플로)
  const [mode, setMode] = useState<VehicleMode>(variant === '카드매출' || variant === '법인카드' ? 'manual' : 'excel');

  /** variant 별 엑셀 일괄 그룹 정의 */
  const excelGroups =
    variant === '입출금'
      ? [
          { title: '계좌 입출금', desc: '은행 거래내역 — 입금자/금액 자동 매칭, 출금도 같이 등록', columns: BANK_TX_COLUMNS, templateName: '계좌입출금_템플릿.xlsx' },
        ]
      : variant === '자동이체'
      ? [
          { title: '자동이체 명세', desc: 'CMS/자동이체 명세 — 출금일·계약자명·금액 매칭', columns: BANK_TX_COLUMNS, templateName: '자동이체_템플릿.xlsx' },
        ]
      : variant === '카드매출'
      ? [
          { title: '카드 매출', desc: '카드사 매출 — 승인번호 + 금액 자동 매칭', columns: CARD_TX_COLUMNS, templateName: '카드수납_템플릿.xlsx' },
        ]
      : [
          { title: '법인카드 사용', desc: '직원 법인카드 지출 — 가맹점/사용자/용도 분류', columns: CARD_TX_COLUMNS, templateName: '법인카드_템플릿.xlsx' },
        ];

  /** variant 별 드롭존 카피 */
  const dropCopy =
    variant === '입출금'
      ? { title: '계좌 입출금 엑셀 업로드', desc: '은행 거래내역 (입금·출금 모두) — 입금자·금액으로 계약 자동 매칭' }
      : variant === '자동이체'
      ? { title: '자동이체 명세 업로드', desc: 'CMS/자동이체 명세 — 출금일·계약자명·금액으로 회차 매칭' }
      : variant === '카드매출'
      ? { title: '카드 매출 엑셀 업로드', desc: '카드사 매출전표 — 승인번호·금액으로 계약 자동 매칭' }
      : { title: '법인카드 명세 업로드', desc: '카드사 사용 명세 — 가맹점·사용일·금액 일괄 등록' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <div className="filter-bar">
        <button type="button" className={`chip ${mode === 'excel' ? 'active' : ''}`} onClick={() => setMode('excel')}>
          <FileXls size={11} /> 엑셀 일괄
        </button>
        <button type="button" className={`chip ${mode === 'paste' ? 'active' : ''}`} onClick={() => setMode('paste')}>
          <ClipboardText size={11} /> 텍스트 붙여넣기
        </button>
        <button type="button" className={`chip ${mode === 'manual' ? 'active' : ''}`} onClick={() => setMode('manual')}>
          <Keyboard size={11} /> 개별 입력
        </button>
        {variant !== '자동이체' && (
          <button type="button" className={`chip ${mode === 'ocr' ? 'active' : ''}`} onClick={() => setMode('ocr')}>
            <Camera size={11} /> OCR (영수증)
          </button>
        )}
      </div>

      {mode === 'manual' && <PaymentManualForm onSubmit={onClose} variant={variant} />}
      {mode === 'ocr' && variant !== '자동이체' && <PaymentOcrPane onSubmit={onClose} />}
      {mode === 'paste' && <PaymentPastePane variant={variant} onClose={onClose} />}
      {mode === 'excel' && (
        <UploadPaneMulti
          files={files} drag={drag} onPick={onPick} onChangeKind={onChangeKind}
          groups={excelGroups}
          onCommit={onCommit} busy={busy} result={result}
          dropTitle={dropCopy.title}
          dropDesc={dropCopy.desc}
        />
      )}
    </div>
  );
}

/**
 * 텍스트 붙여넣기 모드 — Excel/표를 죽 긁어 textarea 에 붙여넣으면 자동 파싱.
 * 헤더 → row[] 만들어서 parseBankTxRow / parseCardTxRow 로 그대로 import.
 */
function PaymentPastePane({ variant, onClose }: { variant: PaymentVariant; onClose: () => void }) {
  const { addMany: addBankMany } = useBankTx();
  const { addMany: addCardMany } = useCardTx();
  const { companies } = useCompanies();
  const { contracts: allContracts } = useContracts();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const isBank = variant === '입출금' || variant === '자동이체';

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    try {
      return parsePastedText(text);
    } catch (e) {
      console.error('[paste] parse error', e);
      return null;
    }
  }, [text]);

  const handleClear = useCallback(() => {
    setText(''); setResult(null); setErr(null);
  }, []);

  const handleCommit = useCallback(async () => {
    if (!parsed || busy) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      let saved = 0;
      let companyMatched = 0;
      if (isBank) {
        const items = parsed.rows
          .map((r) => parseBankRow(r, '텍스트 붙여넣기', variant === '자동이체' ? 'CMS' : undefined))
          .filter((x): x is NonNullable<typeof x> => !!x);
        // 자동이체는 source 강제 'CMS'
        const base = variant === '자동이체'
          ? items.map((it) => ({ ...it, source: 'CMS' as const, method: it.method || 'CMS' }))
          : items;
        const enriched = enrichBankTxBatch(base, companies, allContracts);
        companyMatched = enriched.stats.matched;
        await addBankMany(enriched.rows);
        saved = enriched.rows.length;
      } else {
        const items = parsed.rows
          .map((r) => parseCardRow(r, '텍스트 붙여넣기', variant === '법인카드' ? '법인카드' : '매출'))
          .filter((x): x is NonNullable<typeof x> => !!x);
        const enriched = enrichCardTxBatch(items, companies);
        companyMatched = enriched.stats.matched;
        await addCardMany(enriched.rows);
        saved = enriched.rows.length;
      }
      const skipped = parsed.rows.length - saved;
      const companyNote = companyMatched > 0 ? ` · 회사 자동분류 ${companyMatched}` : '';
      setResult(`${saved}건 등록 완료${companyNote}${skipped > 0 ? ` · ${skipped}행은 필수 필드 부족으로 건너뜀` : ''}`);
      if (saved > 0) {
        toast.success(`텍스트 붙여넣기 ${saved}건 등록${companyMatched > 0 ? ` · 회사분류 ${companyMatched}` : ''}`);
        setTimeout(() => onClose(), 1200);
      }
      if (skipped > 0) {
        toast.warning(`${skipped}행 미반영 — 필수 필드 (거래일/금액/입금자) 누락. 헤더 행이 있는지 확인.`);
      }
    } catch (e) {
      console.error('[paste] commit error', e);
      setErr((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [parsed, busy, isBank, variant, addBankMany, addCardMany, onClose]);

  const placeholder = `엑셀에서 헤더 + 데이터 행을 Ctrl+C → 여기에 붙여넣기.

예시 (CMS 자동이체):
회원명\t결제일\t수납금액\t결제수단
정유림 145가1796\t2026-05-26\t1070000\tCMS
김근하 16부2718\t2026-05-11\t390000\tCMS
...`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflow: 'auto' }}>
      <div style={{
        padding: '10px 12px',
        background: 'var(--bg-sunken)',
        border: '1px solid var(--border-soft)',
        borderRadius: 'var(--radius)',
        fontSize: 11, color: 'var(--text-sub)', lineHeight: 1.7,
      }}>
        <strong>붙여넣기 가능한 형식</strong>
        <br/>· Excel에서 셀 영역 Ctrl+C → 여기에 Ctrl+V (탭으로 자동 분리)
        <br/>· 표 텍스트(2칸 이상 공백 구분)도 인식
        <br/>· 첫 줄 = 헤더. 인식 컬럼: <span className="mono" style={{ fontSize: 10 }}>회원명·납부자·입금자·결제일·수납금액·청구금액·금액·적요 등</span>
      </div>

      <textarea
        className="input"
        placeholder={placeholder}
        value={text}
        onChange={(e) => { setText(e.target.value); setResult(null); setErr(null); }}
        style={{ minHeight: 220, fontFamily: 'var(--font-mono)', fontSize: 11, height: 'auto', padding: '10px 12px', resize: 'vertical', whiteSpace: 'pre' }}
      />

      {parsed && (
        <div style={{ fontSize: 11, color: 'var(--text-sub)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>구분자: <strong>{parsed.delimiter === 'tab' ? '탭(Excel)' : parsed.delimiter === 'pipe' ? '파이프' : '다중 공백'}</strong></span>
          <span>·</span>
          <span>헤더 {parsed.headers.length}개</span>
          <span>·</span>
          <span><strong>{parsed.rows.length}행</strong> 데이터 인식</span>
        </div>
      )}

      {parsed && parsed.rows.length > 0 && (
        <div style={{ border: '1px solid var(--border)', overflowX: 'auto' }}>
          <table className="table" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                <th style={{ width: 36, textAlign: 'right', color: 'var(--text-weak)' }}>#</th>
                {parsed.headers.map((h) => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {parsed.rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'right', color: 'var(--text-weak)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                  {parsed.headers.map((h) => <td key={h}>{r[h]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && (
        <div style={{ padding: '8px 12px', background: 'var(--green-bg)', color: 'var(--green-text)', borderRadius: 'var(--radius)', fontSize: 12 }}>
          ✓ {result}
        </div>
      )}
      {err && (
        <div style={{ padding: '8px 12px', background: 'var(--red-bg)', color: 'var(--red-text)', borderRadius: 'var(--radius)', fontSize: 12 }}>
          {err}
        </div>
      )}

      <PastePaneFooter
        hasText={text.length > 0}
        rowCount={parsed?.rows.length ?? 0}
        busy={busy}
        onClear={handleClear}
        onCommit={handleCommit}
      />
    </div>
  );
}

/** 풋터 컨텍스트에 액션 등록 — 다이얼로그 하단바에만 표시 (Pane 내부 중복 X) */
function PastePaneFooter({
  hasText, rowCount, busy, onClear, onCommit,
}: { hasText: boolean; rowCount: number; busy: boolean; onClear: () => void; onCommit: () => void }) {
  // useMemo로 JSX 안정화 — primitive deps만 변하면 ref 갱신, 그 외 동일
  const node = useMemo(() => (
    <>
      <button type="button" className="btn" onClick={onClear} disabled={busy || !hasText}>지우기</button>
      <button type="button" className="btn btn-primary" onClick={onCommit} disabled={rowCount === 0 || busy}>
        {busy
          ? <><CircleNotch size={12} weight="bold" style={{ animation: 'spin 1s linear infinite' }} /> 저장 중...</>
          : <>{rowCount}건 등록</>}
      </button>
    </>
  ), [hasText, rowCount, busy, onClear, onCommit]);
  useDialogFooterActions(node, [node]);
  return null;
}

/** localStorage 기반 — 변종별 최근 선택 (회사/계좌/카드) 기억 */
function lastKey(variant: PaymentVariant, field: 'company' | 'account' | 'card'): string {
  return `jpkerp5_last_${variant}_${field}`;
}
function readLast(variant: PaymentVariant, field: 'company' | 'account' | 'card'): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(lastKey(variant, field)) ?? '';
}
function saveLast(variant: PaymentVariant, field: 'company' | 'account' | 'card', value: string) {
  if (typeof window === 'undefined') return;
  if (value) localStorage.setItem(lastKey(variant, field), value);
}

function PaymentManualForm({ onSubmit, variant }: { onSubmit: () => void; variant: PaymentVariant }) {
  const { add: addBankTx } = useBankTx();
  const { add: addCardTx } = useCardTx();
  const { companies } = useCompanies();

  // 회사 — variant 별 마지막 선택 복원 / 없으면 첫 회사
  const [companyId, setCompanyId] = useState<string>(() => {
    const last = readLast(variant, 'company');
    return last || '';
  });
  // 회사 로드된 후 빈 값이면 첫 회사로 default
  useEffect(() => {
    if (!companyId && companies.length > 0) setCompanyId(companies[0].id);
  }, [companies, companyId]);

  const selectedCompany = useMemo(() => companies.find((c) => c.id === companyId), [companies, companyId]);
  const accountOptions = selectedCompany?.accounts ?? [];
  const cardOptions = selectedCompany?.cards ?? [];

  // 입출금/자동이체 — 계좌 선택
  const [accountId, setAccountId] = useState<string>(() => readLast(variant, 'account'));
  useEffect(() => {
    if (!accountOptions.find((a) => a.id === accountId) && accountOptions.length > 0) {
      setAccountId(accountOptions[0].id);
    }
  }, [accountOptions, accountId]);

  // 법인카드 — 카드 선택
  const [cardId, setCardId] = useState<string>(() => readLast(variant, 'card'));
  useEffect(() => {
    if (!cardOptions.find((c) => c.id === cardId) && cardOptions.length > 0) {
      setCardId(cardOptions[0].id);
    }
  }, [cardOptions, cardId]);

  // 입출금: 계좌 in/out 토글, 자동이체: 입금 고정, 카드매출: 카드 매출, 법인카드: 카드 지출
  const [direction, setDirection] = useState<'입금' | '출금'>('입금');
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [counterparty, setCounterparty] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [approvalNo, setApprovalNo] = useState('');
  // 법인카드 전용
  const [merchant, setMerchant] = useState('');         // 가맹점
  const [category, setCategory] = useState('');         // 용도
  const [usedBy, setUsedBy] = useState('');             // 사용자
  const [saving, setSaving] = useState(false);

  const isBank = variant === '입출금' || variant === '자동이체';
  const isCorpCard = variant === '법인카드';
  // 자동이체는 항상 입금 (고객 → 회사)
  const effectiveDirection = variant === '자동이체' ? '입금' : direction;

  const selectedAccount = accountOptions.find((a) => a.id === accountId);
  const selectedCard = cardOptions.find((c) => c.id === cardId);

  const valid = isCorpCard
    ? (txDate && amount && merchant.trim() && companyId)
    : (txDate && counterparty.trim() && amount && companyId);

  async function handleSave() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const amountN = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;
      // 선택값 기억
      saveLast(variant, 'company', companyId);
      if (isBank) saveLast(variant, 'account', accountId);
      if (isCorpCard) saveLast(variant, 'card', cardId);

      if (isBank) {
        const isWithdraw = effectiveDirection === '출금';
        await addBankTx({
          txDate,
          amount: isWithdraw ? 0 : amountN,
          withdraw: isWithdraw ? amountN : undefined,
          counterparty: counterparty.trim(),
          memo: memo.trim() || undefined,
          source: variant === '자동이체' ? '자동이체' : '수동',
          companyCode: selectedCompany?.code || selectedCompany?.name,
          account: selectedAccount?.accountNo,
          subject: isWithdraw ? undefined : '대여료수입',
        });
      } else if (isCorpCard) {
        // 법인카드 — 직원 지출 (CardTransaction with kind='법인카드')
        await addCardTx({
          kind: '법인카드',
          txDate,
          amount: amountN,
          approvalNo: approvalNo.trim() || `manual-${Date.now()}`,
          cardLast4: selectedCard?.cardLast4,
          source: selectedCard?.cardCompany,
          companyCode: selectedCompany?.code || selectedCompany?.name,
          merchant: merchant.trim(),
          category: category.trim() || undefined,
          usedBy: usedBy.trim() || undefined,
          approved: false,
        });
      } else {
        // 카드매출
        await addCardTx({
          kind: '매출',
          txDate,
          amount: amountN,
          approvalNo: approvalNo.trim(),
          cardLast4: selectedCard?.cardLast4,
          customerName: counterparty.trim(),
          companyCode: selectedCompany?.code || selectedCompany?.name,
          source: '수동',
        });
      }
      onSubmit();
    } catch (e) {
      toast.error('등록 실패: ' + ((e as Error).message ?? String(e)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void handleSave(); }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflow: 'auto' }}
    >
      <div className="detail-section">
        <div className="detail-section-header">필수 정보</div>
        <div className="detail-section-body">
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px 14px', alignItems: 'center' }}>
            {/* 회사 선택 — 모든 variant 공통 */}
            <label className="form-label">회사 *</label>
            <select
              className="input"
              required
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              style={{ maxWidth: 280 }}
            >
              {companies.length === 0 && <option value="">법인 마스터에 회사 등록 필요</option>}
              {companies.map((co) => (
                <option key={co.id} value={co.id}>{co.name}{co.code ? ` (${co.code})` : ''}</option>
              ))}
            </select>

            {/* 계좌 선택 — 입출금/자동이체 */}
            {isBank && (
              <>
                <label className="form-label">계좌 *</label>
                {accountOptions.length === 0 ? (
                  <span style={{ fontSize: 11, color: 'var(--orange-text)' }}>
                    이 회사에 등록된 계좌가 없습니다. 법인 관리 → 재무 정보에서 계좌 추가
                  </span>
                ) : (
                  <select
                    className="input"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    style={{ maxWidth: 320 }}
                  >
                    {accountOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.bankName} {a.nickname?.trim() || a.accountNo}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}

            {/* 카드 선택 — 카드매출/법인카드 */}
            {!isBank && (
              <>
                <label className="form-label">{isCorpCard ? '법인카드' : '결제 카드'}{isCorpCard ? ' *' : ''}</label>
                {cardOptions.length === 0 ? (
                  <span style={{ fontSize: 11, color: 'var(--orange-text)' }}>
                    이 회사에 등록된 법인카드가 없습니다. 법인 관리 → 재무 정보에서 카드 추가
                  </span>
                ) : (
                  <select
                    className="input"
                    value={cardId}
                    onChange={(e) => setCardId(e.target.value)}
                    style={{ maxWidth: 320 }}
                  >
                    {cardOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.cardCompany} {c.cardName ? `· ${c.cardName}` : ''} ({c.cardLast4})
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}

            {/* 입출금 만 입금/출금 토글 노출. 자동이체는 입금 고정 */}
            {variant === '입출금' && (
              <>
                <label className="form-label">구분 *</label>
                <div className="filter-bar">
                  <button type="button" className={`chip ${direction === '입금' ? 'active' : ''}`} onClick={() => setDirection('입금')}>입금</button>
                  <button type="button" className={`chip ${direction === '출금' ? 'active' : ''}`} onClick={() => setDirection('출금')}>출금</button>
                </div>
              </>
            )}

            <label className="form-label">{isBank ? '거래일자' : isCorpCard ? '사용일' : '승인일'} *</label>
            <DateInput required value={txDate} onChange={setTxDate} style={{ width: 200 }} />

            {isCorpCard ? (
              <>
                <label className="form-label">가맹점 *</label>
                <input className="input" required placeholder="어디서 썼는지 (예: GS25 강남점)" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
              </>
            ) : (
              <>
                <label className="form-label">
                  {!isBank ? '계약자명' : effectiveDirection === '출금' ? '수취인' : '입금자'} *
                </label>
                <input
                  className="input" required
                  placeholder={!isBank ? '카드 결제자명' : effectiveDirection === '출금' ? '받는 사람/업체' : '계약자명과 자동 매칭'}
                  value={counterparty} onChange={(e) => setCounterparty(e.target.value)}
                />
              </>
            )}

            <label className="form-label">금액 *</label>
            <input className="input" required placeholder="원 단위" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 240 }} />

            {isBank && (
              <>
                <label className="form-label">적요</label>
                <input
                  className="input"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder={variant === '자동이체' ? 'CMS 자동이체 출금' : '5월 대여료 등'}
                />
              </>
            )}

            {isCorpCard && (
              <>
                <label className="form-label">용도</label>
                <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="식비 / 주유 / 통행료 / 사무용품 / 정비 등" />
                <label className="form-label">사용자</label>
                <input className="input" value={usedBy} onChange={(e) => setUsedBy(e.target.value)} placeholder="사용한 직원 이름" />
              </>
            )}

            {!isBank && !isCorpCard && (
              <>
                <label className="form-label">승인번호</label>
                <input className="input" value={approvalNo} onChange={(e) => setApprovalNo(e.target.value)} placeholder="예: 20260514001" />
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: 8, position: 'sticky', bottom: 0, background: 'var(--bg-card)', paddingTop: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={!valid || saving}>
          {saving ? <CircleNotch size={14} weight="bold" style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} />}
          {saving
            ? '저장 중...'
            : variant === '입출금' ? '수납 입력'
            : variant === '자동이체' ? '자동이체 등록'
            : variant === '카드매출' ? '카드매출 등록'
            : '법인카드 등록'}
        </button>
      </div>
    </form>
  );
}

function PaymentOcrPane({ onSubmit }: { onSubmit: () => void }) {
  const [busy, setBusy] = useState(false);
  const [extracted, setExtracted] = useState<{ txDate: string; counterparty: string; amount: string } | null>(null);

  function handleImage(_file: File) {
    setBusy(true);
    setTimeout(() => {
      setExtracted({
        txDate: new Date().toISOString().slice(0, 10),
        counterparty: '김지영',
        amount: '850000',
      });
      setBusy(false);
    }, 1300);
  }

  if (busy) {
    return (
      <div className="dropzone" style={{ minHeight: 320, cursor: 'default', flex: 1 }}>
        <div className="dropzone-icon">
          <CircleNotch size={28} weight="bold" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
        <div className="dropzone-title">OCR 처리 중...</div>
        <div className="dropzone-desc">영수증/거래내역을 분석하고 있습니다</div>
      </div>
    );
  }

  if (extracted) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <div className="detail-section">
          <div className="detail-section-header" style={{ color: 'var(--green-text)' }}>
            <CheckCircle size={12} weight="duotone" />
            <span style={{ flex: 1 }}>OCR 추출 완료</span>
            <button type="button" className="btn btn-sm" onClick={() => setExtracted(null)}>다시 스캔</button>
          </div>
          <div className="detail-section-body">
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px 14px', alignItems: 'center' }}>
              <label className="form-label">일자</label>
              <DateInput value={extracted.txDate} onChange={(v) => setExtracted({ ...extracted, txDate: v })} style={{ width: 200 }} />
              <label className="form-label">입금자</label>
              <input className="input" value={extracted.counterparty} onChange={(e) => setExtracted({ ...extracted, counterparty: e.target.value })} />
              <label className="form-label">금액</label>
              <input className="input" value={extracted.amount} onChange={(e) => setExtracted({ ...extracted, amount: e.target.value.replace(/[^0-9]/g, '') })} style={{ width: 240 }} />
            </div>
          </div>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={() => setExtracted(null)}>취소</button>
          <button type="submit" className="btn btn-primary"><CheckCircle size={14} /> 수납 등록</button>
        </div>
      </form>
    );
  }

  return (
    <div
      className="dropzone"
      style={{ minHeight: 320, flex: 1 }}
      onClick={() => document.getElementById('jpk-ocr-pay')?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImage(f); }}
    >
      <input id="jpk-ocr-pay" type="file" accept="image/*,.pdf" className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) handleImage(e.target.files[0]); }} />
      <div className="dropzone-icon"><Camera size={28} weight="duotone" /></div>
      <div className="dropzone-title">영수증 / 입금 확인 스캔</div>
      <div className="dropzone-desc">영수증·이체확인증 사진 — 일자·입금자·금액 자동 추출</div>
      <button className="btn btn-primary" type="button" onClick={(e) => { e.stopPropagation(); document.getElementById('jpk-ocr-pay')?.click(); }}>
        <Camera size={14} /> 이미지 선택
      </button>
      <div className="dropzone-hint">또는 여기에 끌어다 놓기</div>
    </div>
  );
}


function formatCell(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return formatCurrency(v) || String(v);
  return String(v);
}

/** 회사 선택기 — 등록된 회사가 있으면 칩, 없거나 직접 입력하려면 텍스트 입력. */
function CompanyPicker({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [mode, setMode] = useState<'chip' | 'text'>(options.length > 0 ? 'chip' : 'text');

  if (mode === 'chip' && options.length > 0) {
    return (
      <div className="filter-bar">
        {options.map((co) => (
          <button type="button" key={co} className={`chip ${value === co ? 'active' : ''}`} onClick={() => onChange(co)}>
            {co}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          onClick={() => { setMode('text'); onChange(''); }}
          title="등록되지 않은 회사명 직접 입력"
          style={{ color: 'var(--text-weak)' }}
        >
          + 직접입력
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        className="input"
        placeholder={options.length > 0 ? '회사명 직접 입력' : '회사명 (사이드바 → 회사 마스터에서 등록)'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ flex: 1 }}
      />
      {options.length > 0 && (
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMode('chip')} title="등록 회사에서 선택">
          ↩ 선택
        </button>
      )}
    </div>
  );
}
