'use client';

/**
 * /finance/vendor — 거래처별 입출금 집계 (파생) + 거래처 마스터 등록·수정.
 *
 * 입력: bank_tx + card_tx 의 counterparty / vendorId
 * 출력: 거래처별 입금합·출금합·순증감·최근거래일·거래건수
 *
 * 등록 진입점:
 *  - 우측 하단 [+ 거래처 등록] 버튼
 *  - 행 더블클릭 → 마스터에 있으면 수정, 없으면 prefill 등록
 *  - (자금일보 quick add 도 동일 useVendors().add() 호출 → 마스터 일관성)
 */

import { useMemo, useState } from 'react';
import { Buildings, Plus } from '@phosphor-icons/react';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { FINANCE_SUB } from '@/components/layout/sub-nav';
import { BottomBar } from '@/components/layout/bottom-bar';
import { useBankTx, useCardTx } from '@/lib/firebase/transactions-store';
import { useVendors } from '@/lib/firebase/vendors-store';
import { useDataContext } from '@/lib/data-context';
import { formatCurrency } from '@/lib/utils';
import { EmptyRow } from '@/components/ui/empty-row';
import { EntityFormDialog, type FieldDef, type EntityDialogMode } from '@/components/ui/entity-form-dialog';
import { toast } from '@/lib/toast';
import type { Vendor } from '@/lib/types';

type VendorRow = {
  name: string;
  inSum: number;
  outSum: number;
  net: number;
  lastDate: string;
  count: number;
};

const VENDOR_KINDS = ['공급사', '협력사', '외주', '고객', '기타'] as const;

export default function FinanceVendorPage() {
  const { rows: bankTx, loading: bankLoading } = useBankTx();
  const { rows: cardTx, loading: cardLoading } = useCardTx();
  const { vendors, add: addVendor, update: updateVendor } = useVendors();
  const { companies } = useDataContext();
  const dataLoading = bankLoading || cardLoading;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<EntityDialogMode>('create');
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [initialData, setInitialData] = useState<Record<string, string>>({});

  const companyOptions = useMemo(() => companies.map((c) => c.code), [companies]);

  const vendorRows = useMemo<VendorRow[]>(() => {
    const m = new Map<string, VendorRow>();
    function add(name: string, inn: number, out: number, date: string) {
      if (!name) name = '(미지정)';
      const r = m.get(name) ?? { name, inSum: 0, outSum: 0, net: 0, lastDate: '', count: 0 };
      r.inSum += inn;
      r.outSum += out;
      r.net = r.inSum - r.outSum;
      if (date > r.lastDate) r.lastDate = date;
      r.count++;
      m.set(name, r);
    }
    for (const t of bankTx) {
      add(t.counterparty || '', t.amount ?? 0, t.withdraw ?? 0, (t.txDate ?? '').slice(0, 10));
    }
    for (const t of cardTx) {
      // CardTransaction 엔 counterparty 필드가 없어 항상 ''이던 것 → 가맹점(merchant) 사용
      const name = t.merchant ?? t.customerName ?? '';
      add(name, t.amount ?? 0, 0, (t.txDate ?? '').slice(0, 10));
    }
    // 마스터에는 있지만 거래 없는 거래처도 표시 (count 0)
    for (const v of vendors) {
      if (!m.has(v.name)) {
        m.set(v.name, { name: v.name, inSum: 0, outSum: 0, net: 0, lastDate: '', count: 0 });
      }
    }
    return Array.from(m.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name));
  }, [bankTx, cardTx, vendors]);

  const total = useMemo(() => {
    let inn = 0, out = 0;
    for (const r of vendorRows) { inn += r.inSum; out += r.outSum; }
    return { inn, out, net: inn - out };
  }, [vendorRows]);

  const masterCount = useMemo(() => vendors.length, [vendors]);

  function openCreate(prefillName?: string) {
    setDialogMode('create');
    setEditing(null);
    setInitialData(prefillName ? { name: prefillName } : {});
    setDialogOpen(true);
  }

  function openEdit(v: Vendor) {
    setDialogMode('view');
    setEditing(v);
    setInitialData({
      name: v.name ?? '',
      kind: v.kind ?? '',
      bizNo: v.bizNo ?? '',
      ceo: v.ceo ?? '',
      bizType: v.bizType ?? '',
      bizCategory: v.bizCategory ?? '',
      address: v.address ?? '',
      phone: v.phone ?? '',
      email: v.email ?? '',
      companyCode: v.companyCode ?? '',
      notes: v.notes ?? '',
    });
    setDialogOpen(true);
  }

  function handleRowDoubleClick(name: string) {
    if (name === '(미지정)') {
      toast.info('미지정 거래처는 자금일보에서 이름을 채워주세요');
      return;
    }
    const existing = vendors.find((v) => v.name === name);
    if (existing) openEdit(existing);
    else openCreate(name);
  }

  async function handleSubmit(data: Record<string, string>) {
    const cleanName = (data.name ?? '').trim();
    if (!cleanName) {
      toast.error('거래처 이름은 필수입니다');
      return;
    }
    const dup = vendors.find((v) => v.name === cleanName && v.id !== editing?.id);
    if (dup) {
      toast.error(`같은 이름의 거래처가 이미 있습니다: ${cleanName}`);
      return;
    }
    const payload: Omit<Vendor, 'id'> = {
      name: cleanName,
      kind: (data.kind || undefined) as Vendor['kind'],
      bizNo: data.bizNo || undefined,
      ceo: data.ceo || undefined,
      bizType: data.bizType || undefined,
      bizCategory: data.bizCategory || undefined,
      address: data.address || undefined,
      phone: data.phone || undefined,
      email: data.email || undefined,
      companyCode: (data.companyCode || undefined) as Vendor['companyCode'],
      notes: data.notes || undefined,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      if (editing) {
        await updateVendor({ ...payload, id: editing.id });
        toast.success(`거래처 수정: ${cleanName}`);
      } else {
        await addVendor(payload);
        toast.success(`거래처 등록: ${cleanName}`);
      }
      setDialogOpen(false);
    } catch (e) {
      toast.error(`저장 실패: ${(e as Error).message ?? String(e)}`);
    }
  }

  const fields: FieldDef[] = [
    { key: 'name', label: '거래처명', required: true, colSpan: 2 },
    { key: 'kind', label: '종류', type: 'select', options: VENDOR_KINDS as unknown as string[], colSpan: 1 },
    { key: 'companyCode', label: '소속 회사', type: 'select', options: companyOptions, colSpan: 1, placeholder: '전체 공유' },
    { key: 'bizNo', label: '사업자등록번호', colSpan: 2, placeholder: '000-00-00000' },
    { key: 'ceo', label: '대표', colSpan: 1 },
    { key: 'phone', label: '전화', colSpan: 1 },
    { key: 'bizType', label: '업태', colSpan: 1 },
    { key: 'bizCategory', label: '종목', colSpan: 1 },
    { key: 'email', label: '이메일', colSpan: 2 },
    { key: 'address', label: '주소', colSpan: 4 },
    { key: 'notes', label: '메모', type: 'textarea', colSpan: 4 },
  ];

  return (
    <MasterPageShell
      title="거래처"
      icon={<Buildings size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      subNav={FINANCE_SUB}
      bottomBar={
        <BottomBar
          left={
            <button className="btn btn-primary" type="button" onClick={() => openCreate()}>
              <Plus size={14} weight="bold" /> 거래처 등록
            </button>
          }
        />
      }
    >
      <div className="dashboard">
        <div className="panel" style={{ marginBottom: 12 }}>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            <Kpi label="거래처 수 (집계)" value={`${vendorRows.length}곳`} />
            <Kpi label="마스터 등록" value={`${masterCount}건`} />
            <Kpi label="총 입금" value={`₩${formatCurrency(total.inn)}`} />
            <Kpi label="총 출금" value={`₩${formatCurrency(total.out)}`} />
            <Kpi label="순증감" value={`${total.net >= 0 ? '+' : ''}₩${formatCurrency(Math.abs(total.net))}`} tone={total.net >= 0 ? 'green' : 'red'} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-body">
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>거래처</th>
                  <th className="center" style={{ width: 80 }}>마스터</th>
                  <th className="num">입금</th>
                  <th className="num">출금</th>
                  <th className="num">순증감</th>
                  <th className="center">건수</th>
                  <th className="center">최근거래일</th>
                </tr>
              </thead>
              <tbody>
                {dataLoading ? (
                  <EmptyRow colSpan={7}>거래처 데이터 불러오는 중…</EmptyRow>
                ) : vendorRows.length === 0 ? (
                  <EmptyRow colSpan={7}>거래처 없음 — 우측 하단 [+ 거래처 등록] 으로 시작하거나, 자금일보에서 거래처 셀에 이름 입력 시 자동 등록</EmptyRow>
                ) : vendorRows.map((r) => {
                  const isMaster = vendors.some((v) => v.name === r.name);
                  return (
                    <tr
                      key={r.name}
                      onDoubleClick={() => handleRowDoubleClick(r.name)}
                      style={{ cursor: 'pointer' }}
                      title="더블클릭 = 마스터 수정 / 없으면 등록"
                    >
                      <td><strong>{r.name}</strong></td>
                      <td className="center">
                        {isMaster ? <span style={{ color: 'var(--green-text)' }}>●</span> : <span className="muted">○</span>}
                      </td>
                      <td className="num">{r.inSum ? `₩${formatCurrency(r.inSum)}` : '-'}</td>
                      <td className="num">{r.outSum ? `₩${formatCurrency(r.outSum)}` : '-'}</td>
                      <td className="num" style={{ color: r.net >= 0 ? 'var(--green-text)' : 'var(--red-text)', fontWeight: 700 }}>
                        {r.net >= 0 ? '+' : ''}₩{formatCurrency(Math.abs(r.net))}
                      </td>
                      <td className="center">{r.count}</td>
                      <td className="center mono">{r.lastDate || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <EntityFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? `거래처 — ${editing.name}` : '거래처 등록'}
        mode={dialogMode}
        fields={fields}
        initial={initialData}
        size="lg"
        onSubmit={handleSubmit}
      />
    </MasterPageShell>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) {
  const color = tone === 'green' ? 'var(--green-text)' : tone === 'red' ? 'var(--red-text)' : 'var(--text-main)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  );
}
