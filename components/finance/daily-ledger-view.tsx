'use client';



/**

 * 자금일보 ?듯빀 view ??BankTx(계좌·?동?체) + CardTx(留ㅼ텧·법인카드) 거래 ?듯빀 ??

 *

 *  쨌 媛??? ?쇱옄 / 종류(계좌/?먮룞?댁껜/카드留ㅼ텧/법인카드) / 회사 / 입금 / 출금 / 거래상대 / 적요

 *  쨌 계정과목 (subject) ??inline dropdown (RECEIPT/EXPENSE/INTERNAL_SUBJECTS)

 *  쨌 留ㅼ묶 계약 ??inline dropdown (?대떦 계약??ȸ contracts)

 *  쨌 onChange 利됱떆 store update ??audit_log ?먮룞

 *

 * 계좌/?먮룞?댁껜/카드留ㅼ텧/법인카드 view ??raw ?대젰留? 자금일보???듯빀 + 계정과목 吏???먮━.

 */



import { useMemo, useState, Fragment } from 'react';
import { toast } from '@/lib/toast';
import { MagnifyingGlass, CaretLeft, CaretRight } from '@phosphor-icons/react';

import { useVendors } from '@/lib/firebase/vendors-store';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useBankTx } from '@/lib/firebase/transactions-store';
import { CounterpartySearchDialog } from '@/components/finance/counterparty-search-dialog';
import { MultiContractMatchDialog } from '@/components/finance/multi-contract-match-dialog';

import type { BankTransaction, CardTransaction, Contract, Vendor } from '@/lib/types';

import { displayCompanyName } from '@/lib/company-display';

import { resolveCompanyKey, matchesCompanyFilter } from '@/lib/filter-helpers';

import { RECEIPT_SUBJECTS, EXPENSE_SUBJECTS, INTERNAL_SUBJECTS } from '@/lib/ledger-subjects';

import type { Company as JpkCompany } from '@/lib/types';



type Kind = '계좌' | '자동이체' | '카드매출' | '법인카드';



type UnifiedRow = {

  id: string;

  kind: Kind;

  source: 'bank' | 'card';

  txDate: string;

  /** 계좌번호 (BankTx.account / ?먮룞?댁껜=CMS ID) ?먮뒗 카드???━ (CardTx.cardLast4) */

  channelId: string;

  deposit: number;

  withdraw: number;

  counterparty: string;

  memo: string;

  subject: string;

  matchedContractId: string;

  companyCode?: string;

  approvalNo?: string;

  cardLast4?: string;

  note: string;

  /** 留ㅼ묶 계약 ?놁쓣 ???ъ슜?먭? 吏곸젒 ?낅젰??李⑤웾번호/거래泥?*/

  linkedVehiclePlate: string;

  linkedCustomerName: string;

};



function depositForBank(t: BankTransaction): number { return t.amount ?? 0; }

function withdrawForBank(t: BankTransaction): number { return t.withdraw ?? 0; }



const fmtNum = (v: number) => v ? v.toLocaleString('ko-KR') : '';



export function DailyLedgerView({

  bankTx, cardTx, contractById, contracts, companyMaster,

  inPeriod, search, companyFilter, kindFilter,

  onUpdateBank, onUpdateCard,

}: {

  bankTx: BankTransaction[];

  cardTx: CardTransaction[];

  contractById: Map<string, Contract>;

  contracts: Contract[];

  companyMaster: JpkCompany[];

  inPeriod: (date: string) => boolean;

  search: string;

  companyFilter: string;

  /** ?뱀젙 종류留??쒖떆. undefined 硫??꾩껜 (자금일보) */

  kindFilter?: Kind;

  onUpdateBank: (id: string, patch: Partial<BankTransaction>) => void;

  onUpdateCard: (id: string, patch: Partial<CardTransaction>) => void;

}) {

  const { vendors, add: addVendor } = useVendors();
  const { update: updateContract } = useContracts();
  const { update: updateBankTxStore } = useBankTx();



  /** ???쇱묠 ??CMS 留ㅼ묶 ?댁뿭 보기 (자금일보 ?꾩슜) */

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());


  /** 분할 매칭 다이얼로그 — 거래 1건 ↔ N개 계약 */
  const [splitTx, setSplitTx] = useState<BankTransaction | null>(null);
  /** 거래상대(계약자/거래처) 통합 검색 다이얼로그 — 매칭 셀의 🔍에서 열기 */
  const [searchTarget, setSearchTarget] = useState<{
    rowId: string;
    companyCode?: string;
    initialQuery?: string;
    direction?: 'deposit' | 'withdraw';
    currentContractId?: string;
    currentVendorName?: string;
  } | null>(null);

  function toggleExpand(rowKey: string) {

    setExpandedIds((prev) => {

      const next = new Set(prev);

      if (next.has(rowKey)) next.delete(rowKey); else next.add(rowKey);

      return next;

    });

  }



  /** settlementId 같? ?먮룞?댁껜 묶음 ??CMS 吏묎툑건이 펼쳐서 표시 */

  function findCmsItems(settlementId: string | undefined): BankTransaction[] {

    if (!settlementId) return [];

    return bankTx.filter((t) => t.settlementId === settlementId && t.settlementRole === 'item');

  }

  const unified = useMemo<UnifiedRow[]>(() => {

    const out: UnifiedRow[] = [];

    for (const t of bankTx) {

      const day = (t.txDate ?? '').slice(0, 10);

      if (!inPeriod(day)) continue;

      const co = resolveCompanyKey(t, contractById);

      if (!matchesCompanyFilter(co, companyFilter)) continue;

      out.push({

        id: t.id,

        kind: (t.source === '자동이체' ? '자동이체' : '계좌') as Kind,

        source: 'bank',

        txDate: t.txDate,

        channelId: t.account ?? '',

        deposit: depositForBank(t),

        withdraw: withdrawForBank(t),

        counterparty: t.counterparty ?? '',

        memo: t.memo ?? '',

        subject: t.subject ?? '',

        matchedContractId: t.matchedContractId ?? '',

        companyCode: co,

        note: t.note ?? '',

        linkedVehiclePlate: t.linkedVehiclePlate ?? '',

        linkedCustomerName: t.linkedCustomerName ?? '',

      });

    }

    for (const t of cardTx) {

      const day = (t.txDate ?? '').slice(0, 10);

      if (!inPeriod(day)) continue;

      const co = (t.matchedContractId ? contractById.get(t.matchedContractId)?.company : undefined) ?? t.companyCode;

      if (!matchesCompanyFilter(co, companyFilter)) continue;

      const isSales = (t.kind ?? '留ㅼ텧') === '留ㅼ텧';

      out.push({

        id: t.id,

        kind: (isSales ? '카드留ㅼ텧' : '법인카드') as Kind,

        source: 'card',

        txDate: t.txDate,

        channelId: t.cardLast4 ? `****-${t.cardLast4}` : '',

        deposit: isSales ? (t.amount ?? 0) : 0,

        withdraw: isSales ? 0 : (t.amount ?? 0),

        counterparty: t.customerName ?? t.merchant ?? '',

        memo: isSales ? (t.approvalNo ? `승인 ${t.approvalNo}` : '카드留ㅼ텧') : (t.category ?? '법인카드'),

        subject: isSales ? '카드留ㅼ텧' : (t.category ?? ''),

        matchedContractId: t.matchedContractId ?? '',

        companyCode: co,

        approvalNo: t.approvalNo,

        cardLast4: t.cardLast4,

        note: '',  // CardTx ?먮뒗 note ?꾨뱶 ?놁쓬 ??추후 추?

        linkedVehiclePlate: t.linkedVehiclePlate ?? '',

        linkedCustomerName: '',

      });

    }

    // 종류 ?꾪꽣 (raw view??

    const kindFiltered = kindFilter ? out.filter((r) => r.kind === kindFilter) : out;

    // 寃??
    const q = search.trim().toLowerCase();

    const filtered = q

      ? kindFiltered.filter((r) => `${r.counterparty} ${r.memo} ${r.subject}`.toLowerCase().includes(q))

      : kindFiltered;

    return filtered.sort((a, b) => (b.txDate ?? '').localeCompare(a.txDate ?? ''));

  }, [bankTx, cardTx, contractById, companyFilter, inPeriod, search, kindFilter]);



  /** datalist ?꾨낫 ??contracts 留덉뒪?곗뿉??distinct 추출 */

  const vehiclePlates = useMemo(() => {

    const s = new Set<string>();

    for (const c of contracts) if (c.vehiclePlate) s.add(c.vehiclePlate);

    return Array.from(s).sort();

  }, [contracts]);

  const customerNames = useMemo(() => {

    const s = new Set<string>();

    for (const c of contracts) if (c.customerName) s.add(c.customerName);

    return Array.from(s).sort();

  }, [contracts]);



  /** 李⑤웾번호 ?낅젰 ??plate ?쇱튂 계약 ?먮룞 留ㅼ묶. ?놁쑝硫?linkedVehiclePlate 留????*/

  function handleVehiclePlateInput(row: UnifiedRow, plate: string) {

    const v = plate.trim();

    if (row.source === 'bank') {

      if (!v) { onUpdateBank(row.id, { linkedVehiclePlate: undefined }); return; }

      const matched = contracts.find((c) => c.vehiclePlate === v && (!row.companyCode || c.company === row.companyCode));

      if (matched) onUpdateBank(row.id, { matchedContractId: matched.id, linkedVehiclePlate: undefined });

      else onUpdateBank(row.id, { linkedVehiclePlate: v });

      return;

    }

    if (row.source === 'card') {

      if (!v) { onUpdateCard(row.id, { linkedVehiclePlate: undefined }); return; }

      // 법인카드 차량 매칭은 contract 자동 매칭 X (영수증·정비비라 일대일 의미 약함). plate 만 저장.

      onUpdateCard(row.id, { linkedVehiclePlate: v });

    }

  }

  /** 거래泥??낅젰 ??customerName ?쇱튂 계약 ?먮룞 留ㅼ묶. ?놁쑝硫?linkedCustomerName ???*/

  function handleCustomerNameInput(row: UnifiedRow, name: string) {

    if (row.source !== 'bank') return;

    const v = name.trim();

    if (!v) {

      onUpdateBank(row.id, { linkedCustomerName: undefined });

      return;

    }

    const matched = contracts.find((c) => c.customerName === v && (!row.companyCode || c.company === row.companyCode));

    if (matched) {

      onUpdateBank(row.id, { matchedContractId: matched.id, linkedCustomerName: undefined });

    } else {

      onUpdateBank(row.id, { linkedCustomerName: v });

    }

  }



  /** ??거래泥?利됱떆 ?깅줉 ??자금일보 dropdown ?먯꽌 prompt ??름 받고 vendor 留덉뒪???깅줉 + BankTx 留ㅼ묶 */

  async function handleQuickVendorAdd(row: UnifiedRow) {

    const name = window.prompt('??거래泥??대쫫 (?뺣퉬공장·공급??외???');

    if (!name?.trim() || row.source !== 'bank') return;

    const cleanName = name.trim();

    // ?대? ?덉쑝硫?留ㅼ묶留? ?놁쑝硫?추?

    let vendor = vendors.find((v) => v.name === cleanName);

    if (!vendor) {

      try {

        await addVendor({

          name: cleanName,

          kind: '공급사',

          companyCode: row.companyCode as Vendor['companyCode'] | undefined,

          createdAt: new Date().toISOString(),

        });

        // store ?낅뜲?댄듃??onValue ??동, 留ㅼ묶? linkedCustomerName ?쇰줈 ?꾩떆

      } catch (e) {

        toast.error(`거래처 등록 실패: ${(e as Error).message ?? String(e)}`);

        return;

      }

    }

    onUpdateBank(row.id, { linkedCustomerName: cleanName, matchedContractId: undefined });

  }



  function handleSubjectChange(row: UnifiedRow, subject: string) {

    if (row.source === 'bank') onUpdateBank(row.id, { subject: subject || undefined });

    else onUpdateCard(row.id, { category: subject || undefined });

  }

  function handleContractMatch(row: UnifiedRow, contractId: string) {

    if (row.source === 'bank') onUpdateBank(row.id, { matchedContractId: contractId || undefined });

    else onUpdateCard(row.id, { matchedContractId: contractId || undefined });

  }



  if (unified.length === 0) {

    return (

      <div className="muted center" style={{ padding: 56, fontSize: 13 }}>

        {kindFilter

          ? `해당 기간에 ${kindFilter} 거래 없음 · 신규 등록 또는 엑셀 업로드로 등록`

          : '해당 기간에 거래 없음 · 계좌/자동이체/카드매출/법인카드 view 에서 등록 → 자금일보 자동 합산'}

      </div>

    );

  }



  return (

    <>

    {/* ?먮룞?꾩꽦 ?꾨낫 ??input list="..." 媛 李몄“ */}

    <datalist id="ledger-vehicle-plates">

      {vehiclePlates.map((p) => <option key={p} value={p} />)}

    </datalist>

    <datalist id="ledger-customer-names">

      {customerNames.map((n) => <option key={n} value={n} />)}

    </datalist>

    <table className="table">

      <thead>

        <tr>

          <th style={{ width: 96 }}>거래일자</th>

          <th style={{ width: 64 }}>구분</th>

          <th style={{ width: 56 }}>회사</th>

          <th style={{ width: 120 }}>계좌·카드</th>

          <th className="num" style={{ width: 96 }}>입금</th>

          <th className="num" style={{ width: 96 }}>출금</th>

          <th style={{ width: 120 }}>거래처</th>

          <th>적요</th>

          <th style={{ width: 116 }}>계정과목</th>

          <th style={{ width: 84 }}>차량번호</th>

          <th style={{ width: 130 }}>매칭 계약</th>

          <th style={{ width: 110 }}>비고</th>

        </tr>

      </thead>

      <tbody>

        {unified.map((r) => {

          const matched = r.matchedContractId ? contractById.get(r.matchedContractId) : undefined;

          const rowKey = `${r.source}-${r.id}`;

          // CMS 吏묎툑嫄?= 계좌 입금 + (memo쨌counterparty ??'CMS' ?ы븿 OR settlementRole='deposit')

          const bankRecord = r.source === 'bank' ? bankTx.find((b) => b.id === r.id) : undefined;

          const isCmsDeposit = r.kind === '계좌' && r.deposit > 0 && (

            bankRecord?.settlementRole === 'deposit'

            || /CMS|吏묎툑/i.test(`${r.counterparty} ${r.memo}`)

          );

          const settlementItems = isCmsDeposit ? findCmsItems(bankRecord?.settlementId) : [];

          const expanded = expandedIds.has(rowKey);

          return (

          <Fragment key={rowKey}>

          <tr>

            {/* 1. 거래일자 + CMS ?쇱묠 ??*/}

            <td className="mono" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>

              {isCmsDeposit && (

                <button

                  type="button"

                  onClick={() => toggleExpand(rowKey)}

                  style={{

                    width: 14, height: 14, border: 'none', background: 'transparent',

                    cursor: 'pointer', padding: 0, color: 'var(--text-sub)',

                    transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',

                    transition: 'transform 0.12s',

                  }}

                  title="CMS 매칭 이력 일치기"
                ><CaretRight size={11} weight="bold" /></button>
              )}

              {(r.txDate ?? '').slice(0, 10)}

            </td>

            {/* 2. 구분 */}

            <td>

              <span className="badge" style={{

                fontSize: 10, padding: '1px 6px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',

                background: r.kind === '계좌' || r.kind === '자동이체' ? 'var(--blue-bg)' : 'var(--purple-bg)',

                color: r.kind === '계좌' || r.kind === '자동이체' ? 'var(--blue-text)' : 'var(--purple-text)',

              }}>{r.kind}</span>

            </td>

            {/* 3. 회사 */}

            <td className="dim">{r.companyCode ? displayCompanyName(r.companyCode, companyMaster) : '-'}</td>

            {/* 4. 계좌/카드 ?앸퀎 (계좌번호 / CMS ID / 카드 ??) */}

            <td className="mono dim" style={{ fontSize: 11 }}>{r.channelId || '-'}</td>

            {/* 5. 입금 */}

            <td className="num mono" style={{ color: r.deposit > 0 ? 'var(--blue-text)' : 'var(--text-weak)' }}>

              {fmtNum(r.deposit) || '-'}

            </td>

            {/* 6. 출금 */}

            <td className="num mono" style={{ color: r.withdraw > 0 ? 'var(--red-text)' : 'var(--text-weak)' }}>

              {fmtNum(r.withdraw) || '-'}

            </td>

            {/* 7. 거래처(?듭옣 ?쒓린) */}

            <td>{r.counterparty || <span className="muted">-</span>}</td>

            {/* 8. 적요 */}

            <td className="dim" style={{ fontSize: 11 }}>{r.memo || '-'}</td>

            {/* 9. 계정과목 (분개 dropdown) */}

            <td>

              <select

                className="input"

                style={{ height: 24, fontSize: 11, padding: '0 4px', width: '100%' }}

                value={r.subject}

                onChange={(e) => handleSubjectChange(r, e.target.value)}

              >

                <option value="">미지정</option>

                <optgroup label="입금 계정">

                  {RECEIPT_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}

                </optgroup>

                <optgroup label="출금 계정">

                  {EXPENSE_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}

                </optgroup>

                <optgroup label="내부 이체">

                  {INTERNAL_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}

                </optgroup>

              </select>

            </td>

            {/* 11. 차량번호 — 매칭된 계약이 있으면 그 plate (읽기), 없으면 직접 입력 (linkedVehiclePlate). */}

            <td>

              {matched ? (

                <span

                  className="mono"

                  style={{

                    display: 'inline-block', maxWidth: '100%',

                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',

                    background: 'var(--brand-bg, #eef2ff)',

                    padding: '2px 4px', borderRadius: 3, fontSize: 11,

                  }}

                  title={`${matched.vehiclePlate} ${matched.vehicleModel ?? ''}`}

                >

                  {matched.vehiclePlate}

                </span>

              ) : (

                <input

                  type="text"

                  className="input-bare mono"

                  defaultValue={r.linkedVehiclePlate ?? ''}

                  placeholder="차량번호"

                  onBlur={(e) => {

                    const v = e.target.value.trim();

                    if (v !== (r.linkedVehiclePlate ?? '')) handleVehiclePlateInput(r, v);

                  }}

                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}

                  style={{

                    width: '100%', fontSize: 11, padding: '2px 4px',

                    background: r.linkedVehiclePlate ? '#fef9c3' : 'transparent',

                    border: '1px solid transparent', borderRadius: 3,

                  }}

                  title={`${r.kind} — 차량번호 입력 시 plate 일치 계약 자동 매칭 (없으면 차량 비용으로만 기록)`}

                />

              )}

            </td>

            {/* 12. 매칭 계약 — 돋보기 검색 다이얼로그 (드롭다운 폐기) */}

            <td>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>

                <span className="mono" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>

                  {matched ? matched.contractNo : <span className="muted">미매칭</span>}

                </span>

                {r.source === 'bank' && (

                  <button

                    type="button"

                    className="btn btn-sm"

                    title="계약 검색 (거래처/차량번호/계약번호/별칭)"

                    onClick={() => setSearchTarget({

                      rowId: r.id,

                      companyCode: r.companyCode,

                      initialQuery: r.linkedCustomerName || r.linkedVehiclePlate || '',

                      direction: r.source === 'bank' && (r.withdraw ?? 0) > 0 ? 'withdraw' : 'deposit',

                      currentContractId: r.matchedContractId,

                      currentVendorName: !r.matchedContractId ? r.linkedCustomerName : undefined,

                    })}

                    style={{ padding: '0 4px', height: 20 }}

                  >

                    <MagnifyingGlass size={11} weight="bold" />

                  </button>

                )}

              </div>

            </td>

            {/* 13. 비고 (?먯쑀 ?낅젰 ??BankTx 留? */}

            <td>

              {r.source === 'bank' ? (

                <input

                  className="input"

                  style={{ height: 24, fontSize: 11, padding: '0 6px', width: '100%' }}

                  defaultValue={r.note}

                  onBlur={(e) => {

                    const v = e.target.value;

                    if (v !== r.note) onUpdateBank(r.id, { note: v || undefined });

                  }}

                  placeholder="메모"

                />

              ) : <span className="muted">-</span>}

            </td>

          </tr>

          {/* CMS 留ㅼ묶 ?쇱묠 ??留ㅼ묶???먮룞?댁껜 list OR 미매칭?덈궡 */}

          {expanded && isCmsDeposit && (

            <tr>

              <td colSpan={12} style={{ background: 'var(--bg-sunken)', padding: '10px 14px' }}>

                {settlementItems.length > 0 ? (

                  <div>

                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: 'var(--text-sub)' }}>

                      매칭된 CMS 자동이체 ({settlementItems.length}건)

                      {bankRecord?.settlementGrossAmount && (

                        <span style={{ marginLeft: 8 }}>

                          · 묶음 합계 <strong className="mono">₩{fmtNum(bankRecord.settlementGrossAmount)}</strong>

                          {bankRecord.settlementFeeAmount != null && (

                            <span style={{ marginLeft: 8, color: 'var(--red-text)' }}>

                              · CMS 수수료 <strong className="mono">-₩{fmtNum(bankRecord.settlementFeeAmount)}</strong>

                            </span>

                          )}

                        </span>

                      )}

                    </div>

                    <table className="table" style={{ fontSize: 11 }}>

                      <thead>

                        <tr>

                          <th style={{ width: 96 }}>거래일자</th>

                          <th style={{ width: 130 }}>입금일</th>

                          <th>적요</th>

                          <th style={{ width: 84 }}>李⑤웾번호</th>

                          <th className="num" style={{ width: 100 }}>금액</th>

                        </tr>

                      </thead>

                      <tbody>

                        {settlementItems.map((it) => {

                          const itC = it.matchedContractId ? contractById.get(it.matchedContractId) : undefined;

                          return (

                            <tr key={it.id}>

                              <td className="mono">{(it.txDate ?? '').slice(0, 10)}</td>

                              <td>{it.counterparty}</td>

                              <td className="dim">{it.memo || '-'}</td>

                              <td className="mono">{itC?.vehiclePlate || <span className="muted">-</span>}</td>

                              <td className="num mono">{fmtNum(it.amount ?? 0)}</td>

                            </tr>

                          );

                        })}

                      </tbody>

                    </table>

                  </div>

                ) : (

                  <div style={{ fontSize: 12, color: 'var(--orange-text)', padding: '8px 12px', background: 'var(--orange-bg)', borderRadius: 'var(--radius)' }}>

                    · 매칭된 CMS 이력 없음 — 해당 기간 CMS(자동이체) 업로드가 안 된 것으로 추정됩니다

                    <br />

                    <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>

                      ???먮룞?댁껜 view ?먯꽌 CMS 紐낆꽭 ?묒? ?낅줈?????먮룞 묶음 留ㅼ묶?⑸땲??

                    </span>

                  </div>

                )}

              </td>

            </tr>

          )}

          </Fragment>

          );

        })}

      </tbody>

    </table>

    <CounterpartySearchDialog
      open={!!searchTarget}
      onClose={() => setSearchTarget(null)}
      contracts={contracts}
      vendors={vendors}
      companyCode={searchTarget?.companyCode}
      initialQuery={searchTarget?.initialQuery}
      direction={searchTarget?.direction}
      currentContractId={searchTarget?.currentContractId}
      currentVendorName={searchTarget?.currentVendorName}
      onPickContract={(contractId) => {
        const row = unified.find((r) => r.id === searchTarget?.rowId);
        if (row) handleContractMatch(row, contractId);
      }}
      onPickVendor={(vendorName) => {
        if (!searchTarget) return;
        onUpdateBank(searchTarget.rowId, { linkedCustomerName: vendorName, matchedContractId: undefined });
      }}
      onClear={() => {
        const row = unified.find((r) => r.id === searchTarget?.rowId);
        if (!row) return;
        if (row.source === 'bank') {
          onUpdateBank(row.id, { matchedContractId: undefined, linkedCustomerName: undefined });
        } else {
          handleContractMatch(row, '');
        }
      }}
      onQuickAddVendor={(suggested) => {
        const row = unified.find((r) => r.id === searchTarget?.rowId);
        if (!row) return;
        if (suggested && row.source === 'bank') {
          // 빠른 등록: 검색어를 vendor 이름으로 즉시 등록 + linkedCustomerName 설정
          void (async () => {
            try {
              await addVendor({
                name: suggested,
                kind: '공급사',
                companyCode: row.companyCode as Vendor['companyCode'] | undefined,
                createdAt: new Date().toISOString(),
              });
              onUpdateBank(row.id, { linkedCustomerName: suggested, matchedContractId: undefined });
            } catch (e) {
              toast.error(`거래처 등록 실패: ${(e as Error).message ?? String(e)}`);
            }
          })();
        } else {
          void handleQuickVendorAdd(row);
        }
      }}
      onSplitMatch={(() => {
        const row = unified.find((r) => r.id === searchTarget?.rowId);
        if (!row || row.source !== 'bank') return undefined;
        const original = bankTx.find((t) => t.id === row.id);
        if (!original) return undefined;
        return () => setSplitTx(original);
      })()}
    />

    {splitTx && (
      <MultiContractMatchDialog
        tx={splitTx}
        contracts={contracts}
        updateBank={updateBankTxStore}
        updateContract={updateContract}
        onClose={() => setSplitTx(null)}
      />
    )}

    </>

  );

}

