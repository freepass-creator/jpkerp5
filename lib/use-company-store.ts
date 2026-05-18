'use client';

/**
 * v4 호환 어댑터 — jpkerp5의 useCompanies 를 v4 의 useCompanyStore 시그니처로 매핑.
 * 과태료 모듈에서 사용 — 회사 도장/계좌/주소 등 PDF 발급 정보.
 */

import { useMemo } from 'react';
import { useCompanies } from './firebase/companies-store';
import type { Company as JpkCompany } from './types';
import type { Company } from './sample-companies';

function adapt(c: JpkCompany): Company {
  return {
    code: c.id,                       // jpkerp5는 별도 code 없음 → id 사용
    name: c.name,
    ceo: c.ceo ?? '',
    bizNo: c.bizRegNo ?? '',
    corpNo: c.corpRegNo ?? '',
    hqAddress: c.address ?? '',
    bizType: c.bizType ?? '',
    bizCategory: c.bizItem ?? '',
    phone: '',
    fax: '',
    accounts: (c.accounts ?? []).map((a) => ({
      bank: a.bankName,
      accountNo: a.accountNo,
      holder: a.accountHolder,
      alias: a.purpose,
    })),
    cards: [],
  } as Company;
}

/** v4 시그니처: [companies, setter] — penalty 모듈은 read-only 사용. */
export function useCompanyStore(): readonly [Company[], () => void] {
  const { companies } = useCompanies();
  const adapted = useMemo(() => companies.map(adapt), [companies]);
  return [adapted, () => {}];
}
