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
  Contract,
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
export function resolveBankCompanyCode(
  tx: BankTransaction,
  idx: ChannelIndex,
  contractIdx?: ContractIndex,
): { companyCode?: string; matchedContractId?: string } {
  if (tx.companyCode) return { companyCode: tx.companyCode };
  const accountNo = onlyDigits(tx.account);
  if (accountNo) {
    const hit = idx.byAccountNo.get(accountNo);
    if (hit) return { companyCode: hit };
  }
  // CMS 자동이체 입금 — counterparty 가 회원명(=계약자명)인 케이스
  if (contractIdx && tx.counterparty) {
    const cp = tx.counterparty.trim();
    const suffixMatch = cp.match(/(\d{4})\s*$/);
    // 1) plate suffix + prefix(이름) 모두 일치 → 가장 신뢰도 높음 (동명이인도 분간)
    //    예: '박영협8309' → 8309 차량의 계약자 가 박영협? 둘 다 같으면 확정
    if (suffixMatch) {
      const hitSuffix = contractIdx.byPlateSuffix.get(suffixMatch[1]);
      const prefix = cp.replace(/\d{4}\s*$/, '').trim();
      if (hitSuffix && prefix) {
        // prefix 이름이 그 계약의 customerName 또는 alias 와 일치하는지 확인
        const nameHit = contractIdx.byName.get(prefix);
        const aliasHit = contractIdx.byAlias.get(prefix);
        if (nameHit?.id === hitSuffix.id || aliasHit?.id === hitSuffix.id) {
          return { companyCode: hitSuffix.company, matchedContractId: hitSuffix.id };
        }
      }
    }
    // 2) 풀 이름 정확 일치 (동명이인이면 byName 이 운행/대기 우선 정렬 첫번째 반환)
    const exact = contractIdx.byName.get(cp);
    if (exact) return { companyCode: exact.company, matchedContractId: exact.id };
    // 3) 별칭 정확 일치
    const alias = contractIdx.byAlias.get(cp);
    if (alias) return { companyCode: alias.company, matchedContractId: alias.id };
    // 4) plate suffix 단독 (이름 prefix 없거나 안 맞아도 차량 확정)
    if (suffixMatch) {
      const hitSuffix = contractIdx.byPlateSuffix.get(suffixMatch[1]);
      if (hitSuffix) return { companyCode: hitSuffix.company, matchedContractId: hitSuffix.id };
    }
    // 5) 끝 4자리 떼고 prefix 가 이름과 일치 — '박영협8309' 의 '박영협'
    if (suffixMatch) {
      const prefix = cp.replace(/\d{4}\s*$/, '').trim();
      if (prefix) {
        const hitPrefix = contractIdx.byName.get(prefix);
        if (hitPrefix) return { companyCode: hitPrefix.company, matchedContractId: hitPrefix.id };
      }
    }
  }
  // CMS 자동이체 입금 — counterparty/memo 에 사업자 식별자 포함
  const merged = `${tx.counterparty ?? ''} ${tx.memo ?? ''}`;
  const cms = matchCmsFromText(merged, idx);
  return cms ? { companyCode: cms } : {};
}

export type ContractIndex = {
  byName: Map<string, { id: string; company: string }>;
  byAlias: Map<string, { id: string; company: string }>;
  /** 차량번호 끝 4자리 → 계약 (운행/대기 우선). '박영협8309' 같은 입금자명 매칭용. */
  byPlateSuffix: Map<string, { id: string; company: string }>;
};

/** 계약 마스터에서 계약자명/별칭/차량번호4자리 → contract 역인덱스. */
export function buildContractIndex(contracts: Contract[]): ContractIndex {
  const byName = new Map<string, { id: string; company: string }>();
  const byAlias = new Map<string, { id: string; company: string }>();
  const byPlateSuffix = new Map<string, { id: string; company: string }>();
  const ACTIVE = (c: Contract) => c.status === '운행' || c.status === '대기';
  // 운행/대기 우선 (동명이인 또는 동일 plate 끝자리 차량이 있을 때 최신 운행 계약 우선)
  const sorted = [...contracts].sort((a, b) => {
    const da = ACTIVE(a) ? 0 : 1;
    const db = ACTIVE(b) ? 0 : 1;
    if (da !== db) return da - db;
    return (b.contractDate ?? '').localeCompare(a.contractDate ?? '');
  });
  for (const c of sorted) {
    const name = (c.customerName ?? '').trim();
    if (name && !byName.has(name)) {
      byName.set(name, { id: c.id, company: c.company ?? '' });
    }
    for (const alias of c.payerAliases ?? []) {
      const a = alias.trim();
      if (a && !byAlias.has(a)) {
        byAlias.set(a, { id: c.id, company: c.company ?? '' });
      }
    }
    const suffix = (c.vehiclePlate ?? '').replace(/[^0-9]/g, '').slice(-4);
    if (suffix.length === 4 && !byPlateSuffix.has(suffix)) {
      byPlateSuffix.set(suffix, { id: c.id, company: c.company ?? '' });
    }
  }
  return { byName, byAlias, byPlateSuffix };
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

export type EnrichStats = { matched: number; unmatched: number; contractMatched: number };

/** 배치 enrichment — 업로드 직전에 호출. 새 객체를 반환(원본 불변).
 *  contracts 가 주어지면 counterparty(회원명·계약자명) 로 contract 자동 매칭 + matchedContractId 부여.
 */
export function enrichBankTxBatch<T extends BankTransaction | Omit<BankTransaction, 'id'>>(
  txs: T[],
  companies: Company[],
  contracts?: Contract[],
): { rows: T[]; stats: EnrichStats } {
  const idx = buildChannelIndex(companies);
  const contractIdx = contracts && contracts.length > 0 ? buildContractIndex(contracts) : undefined;
  let matched = 0, unmatched = 0, contractMatched = 0;
  const rows = txs.map((t) => {
    if (t.companyCode && t.matchedContractId) { matched++; return t; }
    const r = resolveBankCompanyCode(t as BankTransaction, idx, contractIdx);
    if (r.companyCode || r.matchedContractId) {
      matched++;
      if (r.matchedContractId && !t.matchedContractId) contractMatched++;
      return {
        ...t,
        companyCode: t.companyCode ?? r.companyCode,
        matchedContractId: t.matchedContractId ?? r.matchedContractId,
      };
    }
    unmatched++;
    return t;
  });
  return { rows, stats: { matched, unmatched, contractMatched } };
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
  return { rows, stats: { matched, unmatched, contractMatched: 0 } };
}
