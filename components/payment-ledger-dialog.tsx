'use client';

import { useMemo, useState } from 'react';
import { Upload, Bank, CreditCard, CheckCircle, MagnifyingGlass, X, Link as LinkIcon, CaretLeft, ArrowsCounterClockwise, Warning } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { MOCK_BANK_TX, MOCK_CARD_TX, MOCK_CMS_TX } from '@/lib/mock-data';
import { formatCurrency, formatDateFull } from '@/lib/utils';
import type { Contract } from '@/lib/types';

type Filter = '전체' | '매칭' | '미매칭';
type ViewMode = '목록' | '기간별';
type Period = '일' | '주' | '월' | '분기' | '반기' | '연';

type PaymentCategory = '계약금' | '대여료' | '보증금' | '면책금' | '위약금' | '기타';
const PAYMENT_CATEGORIES: PaymentCategory[] = ['계약금', '대여료', '보증금', '면책금', '위약금', '기타'];

type LedgerRow = {
  id: string;
  source: '계좌' | '카드' | '이체';
  date: string;
  amount: number;
  counterparty: string;
  memo: string;
  sourceDetail: string;
  matchedContractId?: string;
  result?: string;
};

export function PaymentLedgerDialog({
  open, onOpenChange, contracts,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contracts: Contract[];
}) {
  const [view, setView] = useState<ViewMode>('목록');
  const [period, setPeriod] = useState<Period>('월');
  const [filter, setFilter] = useState<Filter>('전체');
  const [search, setSearch] = useState('');
  const [matchingTx, setMatchingTx] = useState<LedgerRow | null>(null);

  const ledger: LedgerRow[] = useMemo(() => {
    const bank = MOCK_BANK_TX.map<LedgerRow>((t) => ({
      id: t.id,
      source: '계좌',
      date: t.txDate,
      amount: t.amount,
      counterparty: t.counterparty,
      memo: t.memo ?? '',
      sourceDetail: t.source ?? '',
      matchedContractId: t.matchedContractId,
    }));
    const card = MOCK_CARD_TX.map<LedgerRow>((t) => ({
      id: t.id,
      source: '카드',
      date: t.txDate,
      amount: t.amount,
      counterparty: t.customerName ?? '카드결제',
      memo: `승인 ${t.approvalNo} · ${t.cardLast4 ?? ''}`,
      sourceDetail: t.source ?? '',
      matchedContractId: t.matchedContractId,
    }));
    const cms = MOCK_CMS_TX
      .filter((t) => t.result !== '실패') // 출금 실패는 입금 ledger에서 제외
      .map<LedgerRow>((t) => ({
        id: t.id,
        source: '이체',
        date: t.txDate,
        amount: t.amount,
        counterparty: t.customerName,
        memo: t.result === '부분' ? `자동이체 부분 (${t.failReason})` : `자동이체 ${t.cmsNo ?? ''}`,
        sourceDetail: t.source ?? '',
        matchedContractId: t.matchedContractId,
        result: t.result,
      }));
    return [...bank, ...card, ...cms].sort((a, b) => b.date.localeCompare(a.date));
  }, []);

  const counts = useMemo(() => ({
    전체: ledger.length,
    매칭: ledger.filter((l) => l.matchedContractId).length,
    미매칭: ledger.filter((l) => !l.matchedContractId).length,
  } as Record<Filter, number>), [ledger]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ledger.filter((l) => {
      if (filter === '매칭' && !l.matchedContractId) return false;
      if (filter === '미매칭' && l.matchedContractId) return false;
      if (q) {
        const hay = `${l.counterparty} ${l.memo} ${l.sourceDetail} ${l.amount}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [ledger, filter, search]);

  const totalAmount = filtered.reduce((s, l) => s + l.amount, 0);
  const unmatchedAmount = ledger.filter((l) => !l.matchedContractId).reduce((s, l) => s + l.amount, 0);

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent title="수납 이력">
        <DialogBody className="p-0" style={{ display: 'flex', flexDirection: 'column' }}>
          {matchingTx ? (
            <MatchPane tx={matchingTx} contracts={contracts} onBack={() => setMatchingTx(null)} onAssign={(cId, cat) => {
              alert(`mock: ${matchingTx.id} → 계약 ${cId} 매칭, 항목: ${cat}`);
              setMatchingTx(null);
            }} />
          ) : (
            <>
              {/* 상단 액션 + 요약 */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => alert('mock: 계좌 엑셀 업로드')}>
                  <Bank size={14} weight="duotone" /> 계좌 업로드
                </button>
                <button className="btn" onClick={() => alert('mock: 자동이체 결과 업로드 (CMS 출금 결과)')}>
                  <ArrowsCounterClockwise size={14} weight="duotone" /> 자동이체 업로드
                </button>
                <button className="btn" onClick={() => alert('mock: 카드 매출 엑셀 업로드')}>
                  <CreditCard size={14} weight="duotone" /> 카드 업로드
                </button>

                <div style={{ display: 'flex', gap: 14, marginLeft: 'auto', alignItems: 'center' }}>
                  <Metric label="총 입금" value={`₩${formatCurrency(totalAmount)}`} />
                  <Metric label="미매칭" value={`₩${formatCurrency(unmatchedAmount)}`} danger />
                </div>
              </div>

              {/* 뷰 토글 + 기간 (목록 모드) */}
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div className="filter-bar">
                  <button className={`chip ${view === '목록' ? 'active' : ''}`} onClick={() => setView('목록')}>
                    목록
                  </button>
                  <button className={`chip ${view === '기간별' ? 'active' : ''}`} onClick={() => setView('기간별')}>
                    기간별
                  </button>
                </div>

                {view === '목록' ? (
                  <>
                    <span className="filter-divider" />
                    <div className="filter-bar">
                      {(['전체', '매칭', '미매칭'] as Filter[]).map((f) => (
                        <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                          {f}
                          <span className="chip-count">{counts[f]}</span>
                        </button>
                      ))}
                    </div>
                    <div className="topbar-search" style={{ width: 240, marginLeft: 'auto' }}>
                      <MagnifyingGlass size={14} className="icon" />
                      <input className="input" placeholder="입금자/적요/금액" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                  </>
                ) : (
                  <>
                    <span className="filter-divider" />
                    <div className="filter-bar">
                      {(['일', '주', '월', '분기', '반기', '연'] as Period[]).map((p) => (
                        <button key={p} className={`chip ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
                          {p}별
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* 본문 */}
              {view === '목록' ? (
                <div style={{ flex: 1, overflow: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="center" style={{ width: 60 }}>경로</th>
                        <th style={{ width: 100 }}>일자</th>
                        <th>입금자</th>
                        <th>적요</th>
                        <th className="num" style={{ width: 130 }}>금액</th>
                        <th className="center" style={{ width: 80 }}>출처</th>
                        <th style={{ width: 200 }}>매칭 상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="muted center" style={{ padding: 32 }}>표시할 항목이 없습니다.</td>
                        </tr>
                      ) : (
                        filtered.map((l) => {
                          const matchedContract = l.matchedContractId ? contracts.find((c) => c.id === l.matchedContractId) : null;
                          return (
                            <tr key={l.id}>
                              <td className="center">
                                <span className="chip" style={{ height: 18, padding: '0 8px', fontSize: 10 }}>{l.source}</span>
                              </td>
                              <td className="mono">{formatDateFull(l.date)}</td>
                              <td>{l.counterparty}</td>
                              <td className="dim" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }} title={l.memo}>{l.memo}</td>
                              <td className="num mono">₩{formatCurrency(l.amount)}</td>
                              <td className="center dim">{l.sourceDetail}</td>
                              <td>
                                {matchedContract ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                                    <CheckCircle size={12} weight="fill" style={{ color: 'var(--green-text)' }} />
                                    <span className="plate">{matchedContract.vehiclePlate}</span>
                                    <span className="text-sub">{matchedContract.customerName}</span>
                                  </span>
                                ) : (
                                  <button className="btn btn-sm" onClick={() => setMatchingTx(l)}>
                                    <LinkIcon size={11} /> 수동 매칭
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <PeriodView ledger={ledger} period={period} />
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <div className="flex-1" />
          <DialogClose asChild>
            <button className="btn">닫기</button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

/* ─────────────── 기간별 집계 뷰 ─────────────── */

function periodKey(dateStr: string, p: Period): { key: string; label: string } {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  switch (p) {
    case '일': {
      const k = dateStr.slice(0, 10);
      return { key: k, label: k };
    }
    case '주': {
      // ISO 주 (월요일 시작)
      const tmp = new Date(d);
      const dayOfWeek = (tmp.getDay() + 6) % 7;
      tmp.setDate(tmp.getDate() - dayOfWeek);
      const monStr = tmp.toISOString().slice(0, 10);
      const sun = new Date(tmp);
      sun.setDate(sun.getDate() + 6);
      const sunStr = sun.toISOString().slice(0, 10);
      return { key: monStr, label: `${monStr} ~ ${sunStr.slice(5)}` };
    }
    case '월': {
      const k = `${y}-${String(m).padStart(2, '0')}`;
      return { key: k, label: `${y}년 ${m}월` };
    }
    case '분기': {
      const q = Math.floor((m - 1) / 3) + 1;
      const k = `${y}-Q${q}`;
      return { key: k, label: `${y}년 ${q}분기` };
    }
    case '반기': {
      const h = m <= 6 ? '상반기' : '하반기';
      const k = `${y}-${m <= 6 ? 'H1' : 'H2'}`;
      return { key: k, label: `${y}년 ${h}` };
    }
    case '연': {
      return { key: String(y), label: `${y}년` };
    }
  }
}

function PeriodView({ ledger, period }: { ledger: LedgerRow[]; period: Period }) {
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; total: number; count: number; bank: number; card: number; cms: number; matched: number; unmatched: number }>();
    for (const l of ledger) {
      const { key, label } = periodKey(l.date, period);
      const g = map.get(key) ?? { label, total: 0, count: 0, bank: 0, card: 0, cms: 0, matched: 0, unmatched: 0 };
      g.total += l.amount;
      g.count += 1;
      if (l.source === '계좌') g.bank += l.amount;
      else if (l.source === '카드') g.card += l.amount;
      else g.cms += l.amount;
      if (l.matchedContractId) g.matched += l.amount;
      else g.unmatched += l.amount;
      map.set(key, g);
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [ledger, period]);

  const grandTotal = grouped.reduce((s, g) => s + g.total, 0);
  const maxBar = Math.max(1, ...grouped.map((g) => g.total));

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 8 }}>
        총 입금 <span className="mono" style={{ fontWeight: 600, color: 'var(--text-main)' }}>₩{formatCurrency(grandTotal)}</span>
        {' · '} {grouped.length}개 {period}
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>기간</th>
            <th className="num" style={{ width: 130 }}>총 입금</th>
            <th className="num" style={{ width: 110 }}>계좌</th>
            <th className="num" style={{ width: 110 }}>자동이체</th>
            <th className="num" style={{ width: 110 }}>카드</th>
            <th className="num" style={{ width: 90 }}>매칭</th>
            <th className="num" style={{ width: 90 }}>미매칭</th>
            <th className="center" style={{ width: 50 }}>건</th>
            <th style={{ width: 160 }}>분포</th>
          </tr>
        </thead>
        <tbody>
          {grouped.map((g) => (
            <tr key={g.key}>
              <td style={{ fontWeight: 500 }}>{g.label}</td>
              <td className="num mono" style={{ fontWeight: 600 }}>₩{formatCurrency(g.total)}</td>
              <td className="num mono dim">{g.bank > 0 ? `₩${formatCurrency(g.bank)}` : '-'}</td>
              <td className="num mono dim">{g.cms > 0 ? `₩${formatCurrency(g.cms)}` : '-'}</td>
              <td className="num mono dim">{g.card > 0 ? `₩${formatCurrency(g.card)}` : '-'}</td>
              <td className="num mono" style={{ color: 'var(--green-text)' }}>{g.matched > 0 ? `₩${formatCurrency(g.matched)}` : '-'}</td>
              <td className="num mono" style={{ color: g.unmatched > 0 ? 'var(--red-text)' : 'var(--text-weak)' }}>
                {g.unmatched > 0 ? `₩${formatCurrency(g.unmatched)}` : '-'}
              </td>
              <td className="center mono dim">{g.count}</td>
              <td>
                <div style={{ height: 6, background: 'var(--bg-sunken)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${(g.total / maxBar) * 100}%`, height: '100%', background: 'var(--brand)' }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="metric">
      <span className="label">{label}</span>
      <span className="value" style={{ color: danger ? 'var(--red-text)' : 'var(--text-main)' }}>{value}</span>
    </div>
  );
}

function MatchPane({
  tx, contracts, onBack, onAssign,
}: {
  tx: LedgerRow;
  contracts: Contract[];
  onBack: () => void;
  onAssign: (contractId: string, category: PaymentCategory) => void;
}) {
  const [picked, setPicked] = useState<Contract | null>(null);
  const [category, setCategory] = useState<PaymentCategory>('대여료');
  const [q, setQ] = useState(tx.counterparty);

  const matches = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return contracts.slice(0, 20);
    return contracts.filter((c) => {
      const hay = `${c.customerName} ${c.vehiclePlate} ${c.contractNo} ${c.customerPhone1}`.toLowerCase();
      return hay.includes(query);
    }).slice(0, 30);
  }, [q, contracts]);

  // 트랜잭션 정보 헤더 (양 단계 공통)
  const TxHeader = (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
      <button className="btn btn-sm" onClick={picked ? () => setPicked(null) : onBack}>
        {picked ? <><CaretLeft size={11} /> 계약 다시 선택</> : <><X size={11} /> 취소</>}
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>
          {picked ? `2단계 — 항목 분류` : `1단계 — 계약 선택`}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginTop: 2 }}>
          <span style={{ fontWeight: 600 }}>{tx.counterparty}</span>
          <span className="text-weak">·</span>
          <span className="mono">{formatDateFull(tx.date)}</span>
          <span className="text-weak">·</span>
          <span className="mono" style={{ fontWeight: 600 }}>₩{formatCurrency(tx.amount)}</span>
          <span className="text-weak">·</span>
          <span className="text-sub">{tx.memo}</span>
        </div>
      </div>
    </div>
  );

  // 2단계: 카테고리 선택
  if (picked) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {TxHeader}

        <div style={{ padding: 16, flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 선택된 계약 요약 */}
          <div className="detail-hero">
            <div className="detail-hero-main">
              <div className="detail-hero-name">{picked.customerName}</div>
              <div className="detail-hero-meta">
                <span className="plate">{picked.vehiclePlate}</span>
                <span>·</span>
                <span>{picked.vehicleModel}</span>
                <span>·</span>
                <span>{picked.company}</span>
                <span>·</span>
                <span>{picked.contractNo}</span>
                {picked.unpaidAmount > 0 && (
                  <>
                    <span>·</span>
                    <span style={{ color: 'var(--red-text)', fontWeight: 600 }}>미수 ₩{formatCurrency(picked.unpaidAmount)}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 카테고리 선택 */}
          <div className="detail-section">
            <div className="detail-section-header">입금 항목 분류</div>
            <div className="detail-section-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {PAYMENT_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`chip ${category === cat ? 'active' : ''}`}
                    onClick={() => setCategory(cat)}
                    style={{ height: 36, justifyContent: 'flex-start', paddingLeft: 14 }}
                  >
                    <CategoryIcon name={cat} /> {cat}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-weak)' }}>
                {categoryHint(category)}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn" onClick={() => setPicked(null)}>뒤로</button>
            <button type="button" className="btn btn-primary" onClick={() => onAssign(picked.id, category)}>
              <CheckCircle size={14} /> {category}으로 매칭 확정
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 1단계: 계약 검색
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {TxHeader}

      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
        <div className="topbar-search" style={{ width: '100%', maxWidth: 'none' }}>
          <MagnifyingGlass size={14} className="icon" />
          <input
            className="input"
            autoFocus
            placeholder="계약자 / 차량번호 / 계약번호로 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {matches.length === 0 ? (
          <div className="empty-state">매칭할 계약이 없습니다.</div>
        ) : (
          matches.map((c) => (
            <button
              key={c.id}
              className="search-result-row"
              onClick={() => setPicked(c)}
              type="button"
              style={{ width: '100%' }}
            >
              <span className="plate" style={{ minWidth: 92 }}>{c.vehiclePlate}</span>
              <span style={{ flex: 1, fontWeight: 500 }}>{c.customerName}</span>
              <span className="text-sub" style={{ fontSize: 11 }}>{c.vehicleModel}</span>
              <span className="text-weak" style={{ fontSize: 11 }}>{c.company}</span>
              <span className="text-weak mono" style={{ fontSize: 11 }}>{c.customerPhone1}</span>
              <span className="mono" style={{ fontSize: 11, color: c.unpaidAmount > 0 ? 'var(--red-text)' : 'var(--text-weak)' }}>
                {c.unpaidAmount > 0 ? `미수 ₩${formatCurrency(c.unpaidAmount)}` : '정상'}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function CategoryIcon({ name }: { name: PaymentCategory }) {
  const color =
    name === '계약금' ? 'var(--blue-text)' :
    name === '대여료' ? 'var(--green-text)' :
    name === '보증금' ? 'var(--indigo-text)' :
    name === '면책금' ? 'var(--orange-text)' :
    name === '위약금' ? 'var(--red-text)' :
    'var(--text-weak)';
  return <span style={{ width: 6, height: 6, borderRadius: 50, background: color, display: 'inline-block', marginRight: 6 }} />;
}

function categoryHint(c: PaymentCategory): string {
  switch (c) {
    case '계약금': return '계약 체결 시 받는 초기 비용 — 차량 매입·등록 자금 충당';
    case '대여료': return '월 단위 정기 입금 — 미수금 차감 대상';
    case '보증금': return '계약 종료 시 반환 (정산 후 차액)';
    case '면책금': return '사고/파손 발생 시 자부담금 — 차량 이력에 함께 기록';
    case '위약금': return '계약 해지·위반 시 부과 — 별도 정산';
    default: return '기타 — 메모로 사유 명시 권장';
  }
}
