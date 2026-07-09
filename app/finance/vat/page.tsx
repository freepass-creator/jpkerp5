'use client';

/**
 * /finance/vat — 부가세 신고 기초자료 (H16).
 *
 * GL/손익은 그대로 두고 별도 산출(사용자 결정: 별도 신고자료만).
 * 관례: 대여료·카드매출 = VAT 포함가 → 공급가액=÷1.1, 세액=차액. GL 분개 재사용해 과세매출 인식 일치.
 * ⚠ 매입세액은 세금계산서 수취 통상 비용만 화이트리스트 추정 — 세무 검토용 기초자료.
 */

import { useMemo, useState } from 'react';
import { Receipt } from '@phosphor-icons/react';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { FINANCE_SUB } from '@/components/layout/sub-nav';
import { useBankTx, useCardTx } from '@/lib/firebase/transactions-store';
import { computeVatReport, vatPeriodRange, type VatLine } from '@/lib/vat-report';
import { formatCurrency } from '@/lib/utils';
import { EmptyRow } from '@/components/ui/empty-row';
import { todayKr } from '@/lib/mock-data';

type Period = '1기' | '2기' | '1분기' | '2분기' | '3분기' | '4분기';
const PERIODS: Period[] = ['1기', '2기', '1분기', '2분기', '3분기', '4분기'];

export default function FinanceVatPage() {
  const { rows: bankTx } = useBankTx();
  const { rows: cardTx } = useCardTx();

  const today = todayKr();
  const curYear = Number(today.slice(0, 4));
  const curMonth = Number(today.slice(5, 7));
  const [year, setYear] = useState(curYear);
  const [period, setPeriod] = useState<Period>(curMonth <= 6 ? '1기' : '2기');

  const { from, to } = useMemo(() => vatPeriodRange(year, period), [year, period]);
  const report = useMemo(() => computeVatReport(bankTx, cardTx, from, to), [bankTx, cardTx, from, to]);

  const years = Array.from({ length: 6 }, (_, i) => curYear - i);
  const won = (n: number) => `₩${formatCurrency(n)}`;

  const LineTable = ({ lines, kind }: { lines: VatLine[]; kind: '매출' | '매입' }) => (
    <table className="table" style={{ fontSize: 12 }}>
      <thead>
        <tr>
          <th>계정</th>
          <th className="num">건수</th>
          <th className="num">합계(VAT 포함)</th>
          <th className="num">공급가액</th>
          <th className="num">{kind === '매출' ? '매출세액' : '매입세액'}</th>
        </tr>
      </thead>
      <tbody>
        {lines.length === 0 ? (
          <EmptyRow colSpan={5}>해당 기간 {kind} 없음</EmptyRow>
        ) : lines.map((l) => (
          <tr key={l.account}>
            <td style={{ fontWeight: 600 }}>{l.accountName}</td>
            <td className="num mono dim">{l.count}</td>
            <td className="num mono">{won(l.total)}</td>
            <td className="num mono">{won(l.supply)}</td>
            <td className="num mono" style={{ fontWeight: 600 }}>{won(l.vat)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <MasterPageShell
      title="부가세 신고자료"
      icon={<Receipt size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      subNav={FINANCE_SUB}
    >
      <div className="dashboard">
        {/* 기간 선택 */}
        <div className="panel" style={{ marginBottom: 12 }}>
          <div style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 100 }}>
              {years.map((y) => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select className="input" value={period} onChange={(e) => setPeriod(e.target.value as Period)} style={{ width: 110 }}>
              {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <span className="dim mono" style={{ fontSize: 12 }}>{from} ~ {to}</span>
          </div>
        </div>

        {/* 요약 카드 */}
        <div className="panel" style={{ marginBottom: 12 }}>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Kpi label="매출세액" value={won(report.salesVat)} sub={`과세매출 ${won(report.salesSupply)}`} tone="var(--blue-text)" />
            <Kpi label="매입세액(추정)" value={won(report.purchaseVat)} sub={`과세매입 ${won(report.purchaseSupply)}`} tone="var(--text-sub)" />
            <Kpi
              label={report.netVatPayable >= 0 ? '납부예상세액' : '환급예상세액'}
              value={won(Math.abs(report.netVatPayable))}
              sub="매출세액 − 매입세액"
              tone={report.netVatPayable >= 0 ? 'var(--red-text)' : 'var(--green-text)'}
            />
          </div>
        </div>

        <section style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>과세 매출 (대여료·카드)</h3>
          <LineTable lines={report.salesLines} kind="매출" />
        </section>

        <section>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>과세 매입 (추정 — 세금계산서 수취 통상 비용)</h3>
          <LineTable lines={report.purchaseLines} kind="매입" />
          <div className="dim" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.6 }}>
            ※ 매입세액은 세금계산서 수취 통상 비용(정비·소모품·연료·통행·주차·임차·통신·관리·수수료)만 추정 집계합니다.
            면세(보험료·제세공과금·인건비)·불공제(과태료)·공제여부 복잡(차량매입)은 제외되며, 실제 신고 금액은 세무 검토가 필요한 <strong>기초자료</strong>입니다.
            <br />※ 대여료·카드매출은 VAT 포함가로 보고 공급가액=÷1.1 로 분리합니다(총계정원장·손익은 변경 없음).
          </div>
        </section>
      </div>
    </MasterPageShell>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div style={{ padding: '4px 8px' }}>
      <div className="dim" style={{ fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: tone }}>{value}</div>
      <div className="dim mono" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>
    </div>
  );
}
