/**
 * 거래 ↔ 회사 채널 자동 매핑.
 *
 * 업로드 시 BankTx / CardTx 의 채널 식별자(계좌번호·CMS ID·단말기 ID·카드 끝4자리)를
 * Company 마스터의 channels (accounts / autoTransfers / cardTerminals / cards) 와 매칭해
 * companyCode 를 자동 부여한다.
 *
 *  · BankTx.account (계좌번호)            → Company.accounts[].accountNo
 *  · BankTx.counterparty/memo (CMS ID)    → Company.autoTransfers[].cmsId / providerName
 *  · CardTx.terminalId / merchantNo       → Company.cardTerminals[].terminalId / merchantNo
 *  · CardTx.cardLast4                     → Company.cards[].cardLast4 (법인카드 지출)
 */

import type {
  BankTransaction,
  CardTransaction,
  Company,
} from '@/lib/types';

const onlyDigits = (s?: string) => (s ?? '').replace(/\D+/g, '');

export type ChannelIndex = {
  /** 계좌번호(숫자만) → companyCode */
  byAccountNo: Map<string, string>;
  /** cmsId → companyCode */
  byCmsId: Map<string, string>;
  /** providerName(공백 제거 소문자) → companyCode (자동이체 fallback) */
  byCmsProvider: Map<string, string>;
  /** terminalId → companyCode */
  byTerminalId: Map<string, string>;
  /** merchantNo(숫자만) → companyCode */
  byMerchantNo: Map<string, string>;
  /** cardLast4 → companyCode */
  byCardLast4: Map<string, string>;
};

/** 회사 마스터에서 채널 → company 역인덱스 구축. 단일 회사 키워드 매핑은 마지막에 등록된 회사가 우선. */
export function buildChannelIndex(companies: Company[]): ChannelIndex {
  const idx: ChannelIndex = {
    byAccountNo: new Map(),
    byCmsId: new Map(),
    byCmsProvider: new Map(),
    byTerminalId: new Map(),
    byMerchantNo: new Map(),
    byCardLast4: new Map(),
  };

  for (const co of companies) {
    const key = co.code || co.name;
    if (!key) continue;

    for (const a of co.accounts ?? []) {
      const no = onlyDigits(a.accountNo);
      if (no) idx.byAccountNo.set(no, key);
    }
    for (const at of co.autoTransfers ?? []) {
      if (at.cmsId) idx.byCmsId.set(at.cmsId.trim(), key);
      const provKey = (at.providerName ?? '').replace(/\s+/g, '').toLowerCase();
      if (provKey) idx.byCmsProvider.set(provKey, key);
    }
    for (const t of co.cardTerminals ?? []) {
      if (t.terminalId) idx.byTerminalId.set(t.terminalId.trim(), key);
      const mn = onlyDigits(t.merchantNo);
      if (mn) idx.byMerchantNo.set(mn, key);
    }
    for (const c of co.cards ?? []) {
      const last4 = onlyDigits(c.cardLast4);
      if (last4.length >= 4) idx.byCardLast4.set(last4.slice(-4), key);
    }
  }
  return idx;
}

/** 본 거래의 counterparty/memo 에서 등록된 cmsId 또는 providerName 토큰을 찾는다. */
function matchCmsFromText(text: string, idx: ChannelIndex): string | undefined {
  if (!text) return undefined;
  // 정확한 cmsId 토큰
  for (const [id, code] of idx.byCmsId) {
    if (text.includes(id)) return code;
  }
  const normalized = text.replace(/\s+/g, '').toLowerCase();
  for (const [prov, code] of idx.byCmsProvider) {
    if (normalized.includes(prov)) return code;
  }
  return undefined;
}

/** BankTx 한 건의 companyCode 추론. 기존 값이 있으면 보존. */
export function resolveBankCompanyCode(tx: BankTransaction, idx: ChannelIndex): string | undefined {
  if (tx.companyCode) return tx.companyCode;
  const accountNo = onlyDigits(tx.account);
  if (accountNo) {
    const hit = idx.byAccountNo.get(accountNo);
    if (hit) return hit;
  }
  // CMS 자동이체 입금 — counterparty/memo 에 사업자 식별자 포함
  const merged = `${tx.counterparty ?? ''} ${tx.memo ?? ''}`;
  return matchCmsFromText(merged, idx);
}

/** CardTx 한 건의 companyCode 추론. 기존 값이 있으면 보존. */
export function resolveCardCompanyCode(tx: CardTransaction, idx: ChannelIndex): string | undefined {
  if (tx.companyCode) return tx.companyCode;
  if (tx.terminalId) {
    const hit = idx.byTerminalId.get(tx.terminalId.trim());
    if (hit) return hit;
  }
  const mn = onlyDigits(tx.merchantNo);
  if (mn) {
    const hit = idx.byMerchantNo.get(mn);
    if (hit) return hit;
  }
  if (tx.kind === '법인카드') {
    const last4 = onlyDigits(tx.cardLast4).slice(-4);
    if (last4.length === 4) {
      const hit = idx.byCardLast4.get(last4);
      if (hit) return hit;
    }
  }
  return undefined;
}

export type EnrichStats = { matched: number; unmatched: number };

/** 배치 enrichment — 업로드 직전에 호출. 새 객체를 반환(원본 불변). */
export function enrichBankTxBatch<T extends BankTransaction | Omit<BankTransaction, 'id'>>(
  txs: T[],
  companies: Company[],
): { rows: T[]; stats: EnrichStats } {
  const idx = buildChannelIndex(companies);
  let matched = 0, unmatched = 0;
  const rows = txs.map((t) => {
    if (t.companyCode) { matched++; return t; }
    const code = resolveBankCompanyCode(t as BankTransaction, idx);
    if (code) { matched++; return { ...t, companyCode: code }; }
    unmatched++;
    return t;
  });
  return { rows, stats: { matched, unmatched } };
}

export function enrichCardTxBatch<T extends CardTransaction | Omit<CardTransaction, 'id'>>(
  txs: T[],
  companies: Company[],
): { rows: T[]; stats: EnrichStats } {
  const idx = buildChannelIndex(companies);
  let matched = 0, unmatched = 0;
  const rows = txs.map((t) => {
    if (t.companyCode) { matched++; return t; }
    const code = resolveCardCompanyCode(t as CardTransaction, idx);
    if (code) { matched++; return { ...t, companyCode: code }; }
    unmatched++;
    return t;
  });
  return { rows, stats: { matched, unmatched } };
}
