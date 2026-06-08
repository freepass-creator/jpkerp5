'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MagnifyingGlass, Car, User, Buildings, CurrencyKrw } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody } from '@/components/ui/dialog';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useBankTx } from '@/lib/firebase/transactions-store';
import { displayCompanyName } from '@/lib/company-display';
import { formatCurrency } from '@/lib/utils';
import { matchesSearch } from '@/lib/filter-helpers';

/**
 * 글로벌 검색 — Ctrl/Cmd+K 로 어디서든 열림.
 *
 * 검색 대상:
 *   - 계약: 차량번호 / 계약자명 / 계약번호 / 면허번호 / 주운전자
 *   - 회사: 회사명 / 사업자번호 / 법인번호
 *   - 계좌 거래: 거래상대 / 적요
 *
 * 결과 클릭 → 해당 페이지로 이동 + 필요하면 쿼리 파라미터.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const { contracts } = useContracts();
  const { companies } = useCompanies();
  const { rows: bankTx } = useBankTx();

  // Ctrl/Cmd+K 단축키
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  const results = useMemo(() => {
    if (!q.trim()) return { contracts: [], companies: [], txs: [] };
    return {
      contracts: contracts.filter((c) =>
        matchesSearch(q, [c.vehiclePlate, c.customerName, c.contractNo, c.driverName, c.customerLicenseNo, c.customerPhone1])
      ).slice(0, 20),
      companies: companies.filter((co) =>
        matchesSearch(q, [co.name, co.code, co.bizRegNo, co.corpRegNo, co.ceo])
      ).slice(0, 10),
      txs: bankTx.filter((t) =>
        matchesSearch(q, [t.counterparty, t.memo, t.note, t.account])
      ).slice(0, 10),
    };
  }, [q, contracts, companies, bankTx]);

  const totalCount = results.contracts.length + results.companies.length + results.txs.length;

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogContent title="">
        <DialogBody className="p-0" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <MagnifyingGlass size={16} weight="bold" style={{ color: 'var(--text-sub)' }} />
            <input
              ref={inputRef}
              className="input"
              placeholder="차량번호 / 계약자 / 면허번호 / 회사명 / 사업자번호 / 거래상대"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ flex: 1, border: 'none', fontSize: 14, padding: 0, background: 'transparent' }}
              autoFocus
            />
            <span style={{ fontSize: 11, color: 'var(--text-weak)' }}>
              {q ? `${totalCount}건` : 'Esc 닫기'}
            </span>
          </div>

          <div style={{ maxHeight: 520, overflow: 'auto', padding: 8 }}>
            {!q ? (
              <div style={{ padding: 32, textAlign: 'center', fontSize: 12, color: 'var(--text-weak)' }}>
                검색어를 입력하세요. <kbd>Ctrl</kbd>+<kbd>K</kbd> 로 어디서든 열림.
              </div>
            ) : totalCount === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', fontSize: 12, color: 'var(--text-weak)' }}>
                검색 결과 없음
              </div>
            ) : (
              <>
                {results.contracts.length > 0 && (
                  <Section title={`계약 (${results.contracts.length})`}>
                    {results.contracts.map((c) => (
                      <ResultRow
                        key={c.id}
                        icon={<Car size={12} weight="duotone" />}
                        title={
                          <>
                            <span className="plate">{c.vehiclePlate}</span>
                            <span style={{ marginLeft: 8 }}>{c.customerName}</span>
                            {c.driverName && c.driverName !== c.customerName && (
                              <span style={{ color: 'var(--text-weak)', marginLeft: 6 }}>· 운전자 {c.driverName}</span>
                            )}
                          </>
                        }
                        meta={
                          <>
                            <span className="dim">{displayCompanyName(c.company, companies)}</span>
                            <span style={{ marginLeft: 8 }} className="dim">{c.contractNo}</span>
                            {(c.unpaidAmount ?? 0) > 0 && (
                              <span style={{ marginLeft: 8, color: 'var(--red-text)' }}>미수 ₩{formatCurrency(c.unpaidAmount)}</span>
                            )}
                          </>
                        }
                        onClick={() => { setOpen(false); router.push(`/?cid=${c.id}`); }}
                      />
                    ))}
                  </Section>
                )}

                {results.companies.length > 0 && (
                  <Section title={`법인 (${results.companies.length})`}>
                    {results.companies.map((co) => (
                      <ResultRow
                        key={co.id}
                        icon={<Buildings size={12} weight="duotone" />}
                        title={
                          <>
                            {co.code && <span className="mono" style={{ color: 'var(--brand)', marginRight: 6 }}>{co.code}</span>}
                            {displayCompanyName(co.name, companies)}
                          </>
                        }
                        meta={
                          <>
                            {co.bizRegNo && <span className="mono dim">{co.bizRegNo}</span>}
                            {co.ceo && <span style={{ marginLeft: 8 }} className="dim">대표 {co.ceo}</span>}
                          </>
                        }
                        onClick={() => { setOpen(false); router.push(`/companies`); }}
                      />
                    ))}
                  </Section>
                )}

                {results.txs.length > 0 && (
                  <Section title={`계좌 거래 (${results.txs.length})`}>
                    {results.txs.map((t) => (
                      <ResultRow
                        key={t.id}
                        icon={<CurrencyKrw size={12} weight="duotone" />}
                        title={
                          <>
                            <span className="mono">{t.txDate}</span>
                            <span style={{ marginLeft: 8 }}>{t.counterparty}</span>
                            {t.amount > 0 && <span style={{ marginLeft: 8, color: 'var(--green-text)' }}>입금 ₩{formatCurrency(t.amount)}</span>}
                            {(t.withdraw ?? 0) > 0 && <span style={{ marginLeft: 8, color: 'var(--red-text)' }}>출금 ₩{formatCurrency(t.withdraw!)}</span>}
                          </>
                        }
                        meta={<span className="dim">{t.memo ?? ''}</span>}
                        onClick={() => { setOpen(false); router.push(`/payments`); }}
                      />
                    ))}
                  </Section>
                )}
              </>
            )}
          </div>
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--text-weak)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function ResultRow({
  icon, title, meta, onClick,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '8px 12px',
        background: 'transparent', border: 'none', cursor: 'pointer',
        textAlign: 'left', fontSize: 12, color: 'var(--text-main)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ color: 'var(--text-sub)', display: 'flex' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div>{title}</div>
        {meta && <div style={{ fontSize: 11, marginTop: 2 }}>{meta}</div>}
      </div>
    </button>
  );
}
