'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ref, get, update as rtdbUpdate, push } from 'firebase/database';
import { Upload, Warning, Download, FileXls, CheckCircle, Info, CaretDown, CaretRight } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { getRtdb, dbPath, ensureAuth, pruneUndefined } from '@/lib/firebase/client';
import { useAuth } from '@/lib/use-auth';
import { isSuperAdmin } from '@/lib/admin-emails';
import { toast } from '@/lib/toast';
import { showConfirm } from '@/lib/confirm';
import { friendlyError } from '@/lib/friendly-error';
import { downloadHorizontalTemplate } from '@/lib/excel-template';
import { CONTRACT_HISTORY_TEMPLATE, RECEIPT_HISTORY_TEMPLATE } from '@/lib/import-schema';
import {
  parseContractHistory, buildContractsFromParsed, type ParsedContractRow,
  parseReceiptHistory, applyReceiptsToContracts, type ParsedReceiptRow,
} from '@/lib/migrate/templates';
import type { Contract } from '@/lib/types';

export default function ImportTemplatesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user?.email);
  // 위험 작업 — superAdmin 아니면 즉시 redirect
  useEffect(() => {
    if (user && !superAdmin) router.replace('/');
  }, [user, superAdmin, router]);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [contractParsed, setContractParsed] = useState<ParsedContractRow[] | null>(null);
  const [receiptParsed, setReceiptParsed] = useState<ParsedReceiptRow[] | null>(null);
  const [guideOpen, setGuideOpen] = useState(true);

  function append(line: string) {
    setLog((l) => [...l, `[${new Date().toLocaleTimeString('ko-KR')}] ${line}`]);
  }

  async function handleContractFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const rows = await parseContractHistory(f);
      setContractParsed(rows);
      const blockSum = rows.reduce((s, r) => s + r.blocks.length, 0);
      append(`✓ 계약이력 파싱: 차량 ${rows.length}대, 계약 ${blockSum}건`);
    } catch (err) {
      toast.error(friendlyError(err));
      append(`✗ 파싱 실패: ${friendlyError(err)}`);
    }
  }

  async function handleReceiptFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const rows = await parseReceiptHistory(f);
      setReceiptParsed(rows);
      const sumP = rows.reduce((s, r) => s + r.payments.length, 0);
      append(`✓ 수납이력 파싱: 계약 ${rows.length}건, 결제 ${sumP}건`);
    } catch (err) {
      toast.error(friendlyError(err));
      append(`✗ 파싱 실패: ${friendlyError(err)}`);
    }
  }

  async function applyContractHistory() {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    if (!contractParsed || contractParsed.length === 0) { toast.warning('계약이력 파일을 먼저 업로드하세요'); return; }
    if (!await showConfirm({ title: `계약이력 ${contractParsed.length}대(차량) 적용 — 같은 차량+계약자는 갱신, 신규는 추가` })) return;
    setRunning(true);
    try {
      await ensureAuth();
      const db = getRtdb();
      if (!db) throw new Error('Firebase 미설정');

      append('현재 DB 조회 중...');
      const cSnap = await get(ref(db, dbPath('contracts')));
      const vSnap = await get(ref(db, dbPath('vehicles')));
      const existing: Record<string, Contract> = cSnap.val() ?? {};
      const existingArr = Object.values(existing);
      const existingVehicles = vSnap.val() ?? {};
      const existingPlates = new Set<string>([
        ...existingArr.map((c) => c.vehiclePlate?.trim()).filter(Boolean),
        ...Object.values(existingVehicles).map((v) => (v as { plate?: string }).plate?.trim()).filter(Boolean) as string[],
      ]);
      append(`현재 계약 ${existingArr.length}건 / 차량 ${Object.keys(existingVehicles).length}대`);

      const { newOrUpdated, idleVehicles, touched } = buildContractsFromParsed(contractParsed, existingArr, existingPlates);
      append(`처리 대상: 계약 ${newOrUpdated.length}건 / 휴차 차량 ${idleVehicles.length}대 (차량 ${touched.size}대 총)`);

      const writeBatch: Record<string, Contract> = {};
      let created = 0;
      let updated = 0;
      for (const item of newOrUpdated) {
        const { _existingId, ...c } = item;
        if (_existingId) {
          writeBatch[_existingId] = { ...c, id: _existingId };
          updated += 1;
        } else {
          const newRef = push(ref(db, dbPath('contracts')));
          const id = newRef.key!;
          writeBatch[id] = { ...c, id };
          created += 1;
        }
      }

      append(`contracts 일괄 적용 중... (신규 ${created} / 갱신 ${updated})`);
      const pruned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(writeBatch)) pruned[k] = pruneUndefined(v);
      if (Object.keys(pruned).length > 0) {
        await rtdbUpdate(ref(db, dbPath('contracts')), pruned);
      }

      // 휴차 차량 — vehicles 노드에 push
      let vehiclesAdded = 0;
      if (idleVehicles.length > 0) {
        append(`vehicles 노드에 휴차 차량 ${idleVehicles.length}대 등록 중...`);
        const vBatch: Record<string, unknown> = {};
        for (const v of idleVehicles) {
          const newRef = push(ref(db, dbPath('vehicles')));
          const id = newRef.key!;
          vBatch[id] = pruneUndefined({
            id,
            plate: v.plate,
            model: v.model,
            company: v.company,
            status: v.status,
            notes: v.notes,
            createdAt: new Date().toISOString(),
          });
          vehiclesAdded += 1;
        }
        await rtdbUpdate(ref(db, dbPath('vehicles')), vBatch);
      }

      append(`✓ 완료 — 계약 신규 ${created} / 갱신 ${updated} / 휴차 차량 신규 ${vehiclesAdded}`);
      toast.success(`계약이력 적용 완료 (계약 ${created + updated} / 휴차 ${vehiclesAdded})`);
    } catch (err) {
      append(`✗ 실패: ${friendlyError(err)}`);
      toast.error(friendlyError(err));
    } finally {
      setRunning(false);
    }
  }

  async function applyReceiptHistory() {
    if (!superAdmin) { toast.error('관리자만 실행 가능합니다'); return; }
    if (!receiptParsed || receiptParsed.length === 0) { toast.warning('수납이력 파일을 먼저 업로드하세요'); return; }
    const totalP = receiptParsed.reduce((s, r) => s + r.payments.length, 0);
    if (!await showConfirm({ title: `수납이력 ${totalP}건 결제 매칭 적용 — 차량+등록번호로 계약 찾아 schedule에 입금 누적` })) return;
    setRunning(true);
    try {
      await ensureAuth();
      const db = getRtdb();
      if (!db) throw new Error('Firebase 미설정');

      append('현재 DB 조회 중...');
      const snap = await get(ref(db, dbPath('contracts')));
      const existing: Record<string, Contract> = snap.val() ?? {};
      const existingArr = Object.values(existing);
      append(`현재 계약 ${existingArr.length}건`);

      const { writeBatch, result } = applyReceiptsToContracts(receiptParsed, existingArr);
      append(`매칭 결과 — 결제 ${result.paymentsAdded}건 / 등록번호 백필 ${result.contractsBackfilled}건 / 미매칭 ${result.unmatchedRows.length}건`);

      if (result.unmatchedRows.length > 0) {
        for (const u of result.unmatchedRows.slice(0, 10)) {
          append(`  · 미매칭: ${u.vehiclePlate} / ${u.customerIdentNo}`);
        }
      }

      const updateOnly: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(writeBatch)) updateOnly[k] = pruneUndefined(v);
      if (Object.keys(updateOnly).length > 0) {
        append(`RTDB 일괄 적용 중... (${Object.keys(updateOnly).length}건)`);
        await rtdbUpdate(ref(db, dbPath('contracts')), updateOnly);
      }

      append(`✓ 수납이력 적용 완료`);
      toast.success(`수납이력 적용 완료 — 결제 ${result.paymentsAdded}건 매칭`);
    } catch (err) {
      append(`✗ 실패: ${friendlyError(err)}`);
      toast.error(friendlyError(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <Upload size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>이력 업로드</span>
          </div>
        </header>

        <div style={{ padding: 24, maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <header className="page-header">
            <div className="page-header-title-group">
              <h1 className="page-header-title">
                <Upload size={18} weight="duotone" />
                템플릿 일괄 업로드
              </h1>
              <div className="page-header-title-sub">
                계약이력 / 수납이력 horizontal 양식 — 1행 = 1차량(또는 1계약), 우측으로 이력 누적
              </div>
            </div>
          </header>

          {!superAdmin && (
            <div className="notice notice--error">
              <Warning size={14} weight="fill" style={{ marginRight: 6, verticalAlign: 'middle' }} />
              SUPER_ADMIN 만 실행할 수 있습니다.
            </div>
          )}

          {/* 가이드 패널 — 접힘 */}
          <section style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--blue-bg)',
            overflow: 'hidden',
          }}>
            <button
              type="button"
              onClick={() => setGuideOpen((v) => !v)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-main)',
              }}
            >
              {guideOpen ? <CaretDown size={12} /> : <CaretRight size={12} />}
              <Info size={14} weight="duotone" />
              사용 가이드 (한 번 읽어두세요)
            </button>
            {guideOpen && (
              <div style={{ padding: '4px 16px 14px 32px', fontSize: 12, lineHeight: 1.7, color: 'var(--text-main)' }}>
                <div style={{ marginBottom: 12 }}>
                  <strong style={{ color: 'var(--brand)' }}>전체 흐름:</strong>{' '}
                  ① 계약이력.xlsx 다운로드 → 채움 → 업로드 → DB 적용 &nbsp;→&nbsp;
                  ② 수납이력.xlsx 다운로드 → 채움 → 업로드 → DB 적용
                </div>

                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>📋 계약이력.xlsx</div>
                  <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'disc' }}>
                    <li>1행 = 1차량. 한 차량의 <strong>현재 계약 + 직전 계약 + 휴차 여부</strong>를 한 줄에</li>
                    <li>좌측 5칸 고정: <code>차량번호 | 회사 | 차종 | 차량상태 | 현재미수</code></li>
                    <li>블록 10칸 × 5회 반복: <code>구분|고객명|연락처|인도일|종료일|반납일|대여료|보증금|결제일|영업자</code></li>
                    <li>블록 1번 = 현재, 2~5번 = 직전 (시간 역순). 빈 블록 무시</li>
                    <li>모든 블록 비우면 → <strong>휴차 차량</strong>으로 자동 등록</li>
                    <li><strong>현재미수 N원</strong> 입력 → 직전 회차부터 역순으로 자동 미납/부분납 분배</li>
                    <li>현재미수 0 → lastPaidDate=오늘로 자동 (이전 회차 정산 완료)</li>
                  </ul>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>💰 수납이력.xlsx (계약이력 적용 후)</div>
                  <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'disc' }}>
                    <li>1행 = 1계약(차량+등록번호). 같은 차량이라도 계약자별로 따로</li>
                    <li>좌측 2칸: <code>차량번호 | 계약자등록번호</code></li>
                    <li>블록 5칸 × 20회: <code>청구금액|결제금액|결제일자|결제수단|미납금액</code></li>
                    <li>매칭 키: 차량번호 + 등록번호 → 자동으로 가장 가까운 회차에 입금 push</li>
                    <li>등록번호 없는 계약은 첫 결제 매칭 시 자동 백필</li>
                    <li>결제일자 비어있는 블록은 무시</li>
                  </ul>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>📅 날짜 형식</div>
                  <div>아무 형식이나 가능: <code>2025-04-22 / 25.4.22 / 250422 / 엑셀 날짜 셀</code></div>
                </div>

                <div style={{ padding: 8, background: 'var(--bg-main)', borderRadius: 'var(--radius)', marginTop: 8 }}>
                  <strong style={{ color: 'var(--red-text)' }}>⚠️ 주의:</strong>{' '}
                  같은 차량+계약자가 이미 있으면 <strong>덮어쓰기 갱신</strong>, 없으면 신규.
                  먼저 계약이력 → 수납이력 순서로 진행. 반대로 하면 매칭 안 됨.
                </div>
              </div>
            )}
          </section>

          {/* 1단계: 템플릿 다운로드 */}
          <section className="detail-section">
            <div className="detail-section-header"><span className="title">1단계 — 양식 다운로드</span></div>
            <div className="detail-section-body" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="btn"
                type="button"
                onClick={() => downloadHorizontalTemplate(CONTRACT_HISTORY_TEMPLATE)}
                style={{ flex: '1 1 280px', height: 56, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start', padding: '8px 14px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                  <Download size={14} /> 계약이력.xlsx
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-weak)' }}>
                  차량번호 + [구분/고객명/인도/종료/반납/대여료/보증금/영업자] × {CONTRACT_HISTORY_TEMPLATE.blockRepeat}
                </div>
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => downloadHorizontalTemplate(RECEIPT_HISTORY_TEMPLATE)}
                style={{ flex: '1 1 280px', height: 56, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start', padding: '8px 14px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                  <Download size={14} /> 수납이력.xlsx
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-weak)' }}>
                  차량번호 + 등록번호 + [청구/결제/일자/수단/미납] × {RECEIPT_HISTORY_TEMPLATE.blockRepeat}
                </div>
              </button>
            </div>
          </section>

          {/* 2단계: 계약이력 업로드 */}
          <section className="detail-section">
            <div className="detail-section-header"><span className="title">2단계 — 계약이력 업로드</span></div>
            <div className="detail-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label className="btn" style={{ height: 40, fontSize: 13, cursor: 'pointer' }}>
                <FileXls size={14} /> 계약이력.xlsx 파일 선택
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={handleContractFile}
                  disabled={!superAdmin || running}
                />
              </label>
              {contractParsed && (
                <div style={{ padding: 10, background: 'var(--blue-bg)', borderRadius: 'var(--radius)', fontSize: 12 }}>
                  파싱됨 — 차량 <strong>{contractParsed.length}대</strong>,
                  계약 <strong>{contractParsed.reduce((s, r) => s + r.blocks.length, 0)}건</strong>
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-sub)' }}>
                    예시: {contractParsed.slice(0, 3).map((r) => `${r.vehiclePlate}(${r.blocks.length})`).join(', ')}
                    {contractParsed.length > 3 && ` ... 외 ${contractParsed.length - 3}대`}
                  </div>
                </div>
              )}
              <button
                className="btn btn-primary"
                type="button"
                disabled={!superAdmin || running || !contractParsed}
                onClick={applyContractHistory}
                style={{ height: 44, fontSize: 14, fontWeight: 600 }}
              >
                <Upload weight="bold" size={14} /> 계약이력 DB 적용
              </button>
            </div>
          </section>

          {/* 3단계: 수납이력 업로드 */}
          <section className="detail-section">
            <div className="detail-section-header"><span className="title">3단계 — 수납이력 업로드 (계약이력 적용 후)</span></div>
            <div className="detail-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label className="btn" style={{ height: 40, fontSize: 13, cursor: 'pointer' }}>
                <FileXls size={14} /> 수납이력.xlsx 파일 선택
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={handleReceiptFile}
                  disabled={!superAdmin || running}
                />
              </label>
              {receiptParsed && (
                <div style={{ padding: 10, background: 'var(--green-bg)', borderRadius: 'var(--radius)', fontSize: 12 }}>
                  파싱됨 — 계약 <strong>{receiptParsed.length}건</strong>,
                  결제 <strong>{receiptParsed.reduce((s, r) => s + r.payments.length, 0)}건</strong>
                </div>
              )}
              <button
                className="btn btn-primary"
                type="button"
                disabled={!superAdmin || running || !receiptParsed}
                onClick={applyReceiptHistory}
                style={{ height: 44, fontSize: 14, fontWeight: 600 }}
              >
                <Upload weight="bold" size={14} /> 수납이력 DB 적용
              </button>
            </div>
          </section>

          {log.length > 0 && (
            <section className="detail-section">
              <div className="detail-section-header">
                <CheckCircle size={12} weight="duotone" style={{ color: 'var(--green-text)' }} />
                <span className="title">로그</span>
              </div>
              <div className="detail-section-body">
                <pre style={{
                  fontSize: 11,
                  lineHeight: 1.6,
                  margin: 0,
                  padding: 10,
                  background: 'var(--bg-sub)',
                  borderRadius: 'var(--radius)',
                  maxHeight: 400,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                }}>
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
