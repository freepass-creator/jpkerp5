'use client';

/**
 * 일반관리 → 증차 신청 view.
 *
 * 흐름:
 *   1) 회사별 row 표시 (면허/보유/구매대기/차고지 KPI 한 줄)
 *   2) [증차신청서 출력] 또는 더블클릭 → 다이얼로그
 *   3) 다이얼로그에서:
 *      · 신청 차고지 선택 (그 회사 차고지 중 여유 있는)
 *      · 구매대기 차량 체크박스로 선택 (계약사실확인서 ✓ 만 가능)
 *      · 사유 입력
 *      · 출력: 변경등록신청서 + 신구대비표 + 첨부서류 묶음 PDF
 */

import { useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import { FileText, Paperclip } from '@phosphor-icons/react';
import { StatusBadge } from '@/components/ui/status-badge';

export type MockCompanyLite = {
  id: string;
  name: string;
  branchType: '본점' | '지점' | '영업소';
  vehicleCount: number;
  fleetLimit: number;
  garages: Array<{ id: string; name: string; address: string; allowedFleet: number; currentCount: number; areaSqm: number }>;
  fleetApps: Array<{ id: string }>;
};

export type PendingVehicle = {
  id: string;
  plate: string;
  model: string;
  carType: '승용' | '소형승합' | '중형승합';
  contractDocAttached: boolean;
  contractDocName?: string;       // 첨부 파일명 (예: 계약사실확인서_12가3456.pdf)
  contractDocUploadedAt?: string; // YYYY-MM-DD
  // 실제는 contractDocUrl 까지 — Firebase Storage URL
  purchaseDate: string;
};

type Props = {
  companies: MockCompanyLite[];
  pendingByCompany: Record<string, PendingVehicle[]>;
};

export function FleetApplyView({ companies, pendingByCompany }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = companies.find((c) => c.id === openId) ?? null;

  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th>회사명</th>
            <th style={{ width: 70 }}>구분</th>
            <th className="center" style={{ width: 110 }}>면허/보유</th>
            <th className="center" style={{ width: 90 }}>증차 가능</th>
            <th className="center" style={{ width: 130 }}>구매대기</th>
            <th className="center" style={{ width: 90 }}>차고지</th>
            <th className="center" style={{ width: 110 }}>진행 중</th>
            <th style={{ width: 160 }}></th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c) => {
            const avail = Math.max(0, c.fleetLimit - c.vehicleCount);
            const pending = pendingByCompany[c.id] ?? [];
            const ready = pending.filter((v) => v.contractDocAttached).length;
            return (
              <tr
                key={c.id}
                style={{ cursor: 'pointer' }}
                onDoubleClick={() => setOpenId(c.id)}
                title="더블클릭 또는 우측 [증차신청서 출력] 버튼"
              >
                <td><strong>{c.name}</strong></td>
                <td><StatusBadge tone={c.branchType === '본점' ? 'brand' : 'neutral'}>{c.branchType}</StatusBadge></td>
                <td className="center mono">{c.fleetLimit} / {c.vehicleCount}</td>
                <td className="center mono" style={{ color: avail > 0 ? 'var(--green-text)' : 'var(--text-weak)' }}>{avail}대</td>
                <td className="center mono" style={{ color: pending.length > 0 ? 'var(--orange-text, #c2410c)' : 'var(--text-weak)' }}>
                  {pending.length > 0 ? <>{pending.length}대 <span style={{ fontSize: 10, color: 'var(--text-weak)' }}>(서류 {ready}/{pending.length})</span></> : '-'}
                </td>
                <td className="center mono">{c.garages.length}개소</td>
                <td className="center mono" style={{ color: c.fleetApps.length > 0 ? 'var(--brand)' : 'var(--text-weak)' }}>
                  {c.fleetApps.length > 0 ? `${c.fleetApps.length}건` : '-'}
                </td>
                <td className="center" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn btn-sm btn-primary"
                    type="button"
                    onClick={() => setOpenId(c.id)}
                    disabled={pending.length === 0}
                    title={pending.length === 0 ? '구매대기 차량 없음' : '증차신청서 출력'}
                  >
                    <FileText size={11} weight="bold" /> 증차신청서 출력
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {opened && (
        <FleetApplyDialog
          c={opened}
          pending={pendingByCompany[opened.id] ?? []}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

function FleetApplyDialog({ c, pending: pendingProp, onClose }: { c: MockCompanyLite; pending: PendingVehicle[]; onClose: () => void }) {
  // 이 다이얼로그 안에서 첨부 상태를 로컬 state로 관리 (실제는 자산관리 RTDB 갱신)
  const [pending, setPending] = useState<PendingVehicle[]>(pendingProp);
  const [garageId, setGarageId] = useState(c.garages[0]?.id ?? '');
  const garage = c.garages.find((g) => g.id === garageId);
  const garageAvail = garage ? garage.allowedFleet - garage.currentCount : 0;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const selectedVehicles = pending.filter((v) => selectedIds.has(v.id));
  const overCapacity = selectedVehicles.length > garageAvail;

  // 파일 input ref 맵 — 차량별 트리거
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function carTypeBucket(t: PendingVehicle['carType']): 'passenger' | 'smallBus' | 'midBus' {
    if (t === '승용') return 'passenger';
    if (t === '소형승합') return 'smallBus';
    return 'midBus';
  }

  function handlePrintPackage() {
    if (selectedVehicles.length === 0 || overCapacity || !garage) return;

    // 변경 전 — 현재 회사 보유 차량 (mock — 실은 vehicles 카운트)
    const beforeTotal = c.vehicleCount;
    const beforePassenger = Math.floor(beforeTotal * 0.6);
    const beforeSmallBus = Math.floor(beforeTotal * 0.3);
    const beforeMidBus = beforeTotal - beforePassenger - beforeSmallBus;

    // 증감 — 선택 차량 차종별 카운트
    const deltaPassenger = selectedVehicles.filter((v) => v.carType === '승용').length;
    const deltaSmallBus = selectedVehicles.filter((v) => v.carType === '소형승합').length;
    const deltaMidBus = selectedVehicles.filter((v) => v.carType === '중형승합').length;
    const deltaTotal = selectedVehicles.length;

    const today = new Date().toISOString().slice(0, 10);

    const payload = {
      application: {
        companyName: c.name,
        corpRegNo: '110111-0000000',     // mock — 실은 c.corpRegNo
        bizRegNo: '000-00-00000',         // mock
        ceo: '대표자명',                  // mock
        address: '서울특별시 강남구 …',    // mock
        phone: '02-0000-0000',             // mock
        changes: {
          passenger: { before: beforePassenger, after: beforePassenger + deltaPassenger },
          smallBus: { before: beforeSmallBus, after: beforeSmallBus + deltaSmallBus },
          midBus: { before: beforeMidBus, after: beforeMidBus + deltaMidBus },
          total: { before: beforeTotal, after: beforeTotal + deltaTotal },
        },
        vehicles: selectedVehicles.map((v) => ({
          plate: v.plate,
          model: v.model,
          carType: v.carType,
          contractDocAttached: v.contractDocAttached,
          contractDocFileName: v.contractDocName,
        })),
        issuedDate: today,
        receiver: '서울특별시장',
      },
      doc: {
        companyName: c.name,
        registeredDate: '2020-01-01',
        ceo: '대표자명',
        corpRegNo: '110111-0000000',
        bizRegNo: '000-00-00000',
        phone: '02-0000-0000',
        issuedDate: today,
        before: [
          { category: '사무실' as const, location: c.name, areaSqm: 60, totalCars: beforeTotal, passenger: beforePassenger, smallBus: beforeSmallBus, midBus: beforeMidBus },
          { category: '차고지' as const, location: garage.address, areaSqm: garage.areaSqm, leaseStart: '2024-01-01', leaseEnd: '2027-12-31', totalCars: garage.currentCount, passenger: Math.floor(garage.currentCount * 0.6), smallBus: Math.floor(garage.currentCount * 0.3), midBus: garage.currentCount - Math.floor(garage.currentCount * 0.6) - Math.floor(garage.currentCount * 0.3) },
        ],
        after: [
          { category: '사무실' as const, location: c.name, areaSqm: 60, totalCars: beforeTotal + deltaTotal, passenger: beforePassenger + deltaPassenger, smallBus: beforeSmallBus + deltaSmallBus, midBus: beforeMidBus + deltaMidBus },
          { category: '차고지' as const, location: garage.address, areaSqm: garage.areaSqm, leaseStart: '2024-01-01', leaseEnd: '2027-12-31', totalCars: garage.currentCount + deltaTotal, passenger: Math.floor(garage.currentCount * 0.6) + deltaPassenger, smallBus: Math.floor(garage.currentCount * 0.3) + deltaSmallBus, midBus: (garage.currentCount - Math.floor(garage.currentCount * 0.6) - Math.floor(garage.currentCount * 0.3)) + deltaMidBus },
        ],
        requiredAreaSqm: (beforeTotal + deltaTotal) * 13,
        surplusAreaSqm: garage.areaSqm - (beforeTotal + deltaTotal) * 13,
        changeSummary: [reason || '증차 신청', `${selectedVehicles.length}대 증차`],
      },
    };

    try {
      localStorage.setItem('jpkerp5_fleet_apply_print', JSON.stringify(payload));
      window.open('/general/fleet-apply/print', '_blank');
    } catch (e) {
      toast.error(`인쇄 페이지 열기 실패: ${(e as Error).message ?? String(e)}`);
    }
  }
  void carTypeBucket; // type checker — 추후 grouping 확장용

  function triggerFile(vehicleId: string) {
    fileInputs.current[vehicleId]?.click();
  }
  function handleFile(vehicleId: string, file: File | null) {
    if (!file) return;
    const today = new Date().toISOString().slice(0, 10);
    // mock: 실제로는 Firebase Storage 업로드 + vehicles/{id}.purchaseContractDocUrl 갱신
    setPending((prev) => prev.map((v) => v.id === vehicleId
      ? { ...v, contractDocAttached: true, contractDocName: file.name, contractDocUploadedAt: today }
      : v
    ));
  }

  return (
    <div
      role="dialog"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', width: '90vw', maxWidth: 900, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ flex: '0 0 auto', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>증차 신청 — {c.name}</h2>
          <button className="btn btn-sm btn-ghost" type="button" onClick={onClose}>✕</button>
        </div>

        <div style={{ flex: '1 1 auto', overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 1. 차고지 */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>① 신청 차고지</div>
            <select className="input" value={garageId} onChange={(e) => setGarageId(e.target.value)} style={{ padding: '6px 10px', fontSize: 12, width: '100%' }}>
              {c.garages.map((g) => {
                const a = g.allowedFleet - g.currentCount;
                return (
                  <option key={g.id} value={g.id}>
                    {g.name} — 허가 {g.allowedFleet} / 현재 {g.currentCount} / 여유 {a}{a === 0 ? ' (만차)' : ''}
                  </option>
                );
              })}
            </select>
            {garage && <div style={{ fontSize: 11, color: 'var(--text-weak)', marginTop: 4 }}>{garage.address} · 면적 {garage.areaSqm}㎡</div>}
          </div>

          {/* 2. 차량 선택 */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
              <span>② 신청 차량 선택 (구매대기 — 계약사실확인서 ✓ 만 가능)</span>
              <span style={{ fontSize: 11, color: overCapacity ? 'var(--red-text)' : 'var(--text-sub)' }}>
                선택 {selectedVehicles.length} / 차고지 여유 {garageAvail} {overCapacity && '⚠ 초과'}
              </span>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 28 }}></th>
                  <th>차량번호</th>
                  <th>차종</th>
                  <th>분류</th>
                  <th>매입일</th>
                  <th className="center" style={{ width: 120 }}>계약사실확인서</th>
                </tr>
              </thead>
              <tbody>
                {pending.length === 0 ? (
                  <tr><td colSpan={6} className="muted center" style={{ padding: 18 }}>구매대기 차량 없음</td></tr>
                ) : pending.map((v) => {
                  const canSelect = v.contractDocAttached;
                  return (
                    <tr key={v.id} style={{ cursor: canSelect ? 'pointer' : 'default' }} onClick={() => canSelect && toggle(v.id)}>
                      <td className="center" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(v.id)} disabled={!canSelect} onChange={() => toggle(v.id)} />
                      </td>
                      <td className="mono"><strong>{v.plate}</strong></td>
                      <td>{v.model}</td>
                      <td><span style={{ fontSize: 10, padding: '1px 6px', background: 'var(--bg-sunken)', borderRadius: 'var(--radius-sm)' }}>{v.carType}</span></td>
                      <td className="mono dim">{v.purchaseDate}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {v.contractDocAttached ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                            <button
                              type="button"
                              onClick={() => {
                                // 실제: window.open(v.contractDocUrl, '_blank') 또는 PDF 미리보기 모달
                                toast.info(`계약사실확인서 미리보기\n파일: ${v.contractDocName ?? '계약사실확인서.pdf'}\n차량: ${v.plate}\n(샘플: 실제는 저장된 PDF/이미지 새 창)`);
                              }}
                              title="클릭 시 미리보기"
                              style={{
                                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                color: 'var(--brand)', fontSize: 11, textAlign: 'left',
                                textDecoration: 'underline', textUnderlineOffset: 2,
                              }}
                            >
                              📄 {v.contractDocName ?? '계약사실확인서.pdf'}
                            </button>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 10, color: 'var(--text-weak)' }}>
                              <span>{v.contractDocUploadedAt ?? '-'} 업로드</span>
                              <span style={{ color: 'var(--border)' }}>·</span>
                              <button
                                type="button"
                                onClick={() => triggerFile(v.id)}
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-sub)', fontSize: 10 }}
                                title="파일 교체"
                              >
                                교체
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            className="btn btn-sm"
                            type="button"
                            onClick={() => triggerFile(v.id)}
                            style={{ color: 'var(--orange-text, #c2410c)' }}
                            title="계약사실확인서 PDF/이미지 첨부"
                          >
                            <Paperclip size={11} weight="bold" /> 첨부
                          </button>
                        )}
                        <input
                          ref={(el) => { fileInputs.current[v.id] = el; }}
                          type="file"
                          accept="application/pdf,image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => handleFile(v.id, e.target.files?.[0] ?? null)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 3. 사유 */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>③ 신청 사유 (선택)</div>
            <textarea
              value={reason} onChange={(e) => setReason(e.target.value)}
              rows={2}
              style={{ width: '100%', padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius)', resize: 'vertical' }}
              placeholder="예: 영업 확장에 따른 차량 증차"
            />
          </div>

          {/* 4. 자동 묶음 안내 */}
          <div style={{ padding: 12, background: 'var(--bg-sunken)', borderRadius: 'var(--radius)', fontSize: 11 }}>
            <strong>출력 시 자동 생성·수집:</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.8 }}>
              <li>📄 자동차대여사업 변경등록신청서 (별지 제35호) — 회사·차량 자동 합성</li>
              <li>📄 신·구사업계획 대비표 — 차고지·사무실 현황 + 변경 후 자동</li>
              <li>📎 계약사실확인서 ({selectedVehicles.length}건) — 자산관리에서 자동 호출</li>
              <li>📎 자동차등록증·보험증명 — 자산관리에서 자동 호출</li>
              <li>📎 차고지 임대차계약서 — 일반관리 차고지에서 자동 호출</li>
            </ul>
          </div>
        </div>

        <div style={{ flex: '0 0 auto', background: 'var(--bg-card)', borderTop: '1px solid var(--border)', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn" type="button" disabled={selectedVehicles.length === 0 || overCapacity} title="신구대비표만 미리보기">
              📄 신구대비표
            </button>
            <button className="btn" type="button" disabled={selectedVehicles.length === 0 || overCapacity} title="신청서만 미리보기">
              📄 신청서
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn" type="button" onClick={onClose}>취소</button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={selectedVehicles.length === 0 || overCapacity}
              onClick={handlePrintPackage}
              title={selectedVehicles.length === 0 ? '차량 선택 필요' : overCapacity ? '차고지 여유 초과' : '묶음 PDF 출력'}
            >
              📄 묶음 PDF 출력 ({selectedVehicles.length}대)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
