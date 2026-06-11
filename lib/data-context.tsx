'use client';

/**
 * 전역 데이터 Context — 핵심 RTDB 노드를 App layout 에서 한 번만 subscribe.
 *
 *  · 페이지 이동 시 unmount 되지 않음 → 다시 와도 즉시 표시 ("번쩍" X)
 *  · 모든 페이지가 같은 데이터 인스턴스 공유 (중복 subscribe X)
 *  · mutation (add/update/remove) 은 기존 store hook 의 함수 그대로 사용 (RTDB 직접 호출)
 *
 * 노출:
 *   const { vehicles, contracts, companies, policies, history, ... } = useDataContext();
 *
 * Provider 외부에서 호출 시 빈 데이터 반환 (throw X) — 안전 fallback.
 */

import { createContext, useContext, useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { getRtdb, ensureAuth, dbPath, isFirebaseConfigured } from './firebase/client';
import { recalcContract } from './payment-schedule';
import { todayKr } from './mock-data';
import type { Vehicle, Contract, Company, InsurancePolicy, HistoryEntry } from './types';

type DataState = {
  vehicles: Vehicle[];
  vehiclesLoading: boolean;
  contracts: Contract[];
  contractsLoading: boolean;
  companies: Company[];
  companiesLoading: boolean;
  policies: InsurancePolicy[];
  policiesLoading: boolean;
  history: HistoryEntry[];
  historyLoading: boolean;
};

const EMPTY_STATE: DataState = {
  vehicles: [], vehiclesLoading: false,
  contracts: [], contractsLoading: false,
  companies: [], companiesLoading: false,
  policies: [], policiesLoading: false,
  history: [], historyLoading: false,
};

const DataContext = createContext<DataState>(EMPTY_STATE);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractsLoading, setContractsLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setVehiclesLoading(false); setContractsLoading(false);
      setCompaniesLoading(false); setPoliciesLoading(false); setHistoryLoading(false);
      return;
    }
    const unsubs: Array<() => void> = [];
    let cancelled = false;

    (async () => {
      try { await ensureAuth(); }
      catch {
        setVehiclesLoading(false); setContractsLoading(false);
        setCompaniesLoading(false); setPoliciesLoading(false); setHistoryLoading(false);
        return;
      }
      if (cancelled) return;
      const db = getRtdb();
      if (!db) return;

      unsubs.push(onValue(ref(db, dbPath('vehicles')), (snap) => {
        const val = snap.val();
        setVehicles(val ? Object.values<Vehicle>(val) : []);
        setVehiclesLoading(false);
      }));

      unsubs.push(onValue(ref(db, dbPath('contracts')), (snap) => {
        const val = snap.val();
        const raw = val ? Object.values<Contract>(val) : [];
        const today = todayKr();
        setContracts(raw.map((c) => recalcContract(c, today)));
        setContractsLoading(false);
      }));

      unsubs.push(onValue(ref(db, dbPath('companies')), (snap) => {
        const val = snap.val();
        setCompanies(val ? Object.values<Company>(val) : []);
        setCompaniesLoading(false);
      }));

      unsubs.push(onValue(ref(db, dbPath('insurances')), (snap) => {
        const val = snap.val();
        const normalize = (p: InsurancePolicy & { installments?: unknown }): InsurancePolicy => {
          if (p.installments && !Array.isArray(p.installments) && typeof p.installments === 'object') {
            return { ...p, installments: Object.values(p.installments) as InsurancePolicy['installments'] };
          }
          return p;
        };
        setPolicies(val ? Object.values<InsurancePolicy>(val).map(normalize) : []);
        setPoliciesLoading(false);
      }));

      unsubs.push(onValue(ref(db, dbPath('history_entries')), (snap) => {
        const val = snap.val();
        const list = val ? Object.values<HistoryEntry>(val) : [];
        list.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
        setHistory(list);
        setHistoryLoading(false);
      }));
    })();

    return () => {
      cancelled = true;
      for (const u of unsubs) u();
    };
  }, []);

  return (
    <DataContext.Provider
      value={{
        vehicles, vehiclesLoading,
        contracts, contractsLoading,
        companies, companiesLoading,
        policies, policiesLoading,
        history, historyLoading,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useDataContext(): DataState {
  return useContext(DataContext);
}
