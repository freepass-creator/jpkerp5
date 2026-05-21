'use client';

import { useState } from 'react';
import { CheckCircle, CircleNotch } from '@phosphor-icons/react';
import { DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { DateInput } from '@/components/ui/date-input';
import { useHistoryEntries } from '@/lib/firebase/history-store';
import { todayKr } from '@/lib/mock-data';
import type { Contract, HistoryCategory, HistoryScope, HistoryEntry } from '@/lib/types';

const VEHICLE_CATEGORIES: HistoryCategory[] = ['정비', '사고', '검사', '세차', '위반', '보험', '부품교체', '기타'];
const CONTRACT_CATEGORIES: HistoryCategory[] = ['연락기록', '분쟁', '클레임', '수납이슈', '메모', '기타'];

const STATUSES: HistoryEntry['status'][] = ['완료', '진행', '예정'];

/**
 * 이력 추가 다이얼로그.
 *
 *  - scope='vehicle' → 차량 이력 (정비/사고/검사/세차/위반/보험/부품교체)
 *  - scope='contract' → 계약 이력 (연락기록/분쟁/클레임/수납이슈/메모)
 *
 * 차량 이력은 plate에 영구 귀속 (계약 끝나도 같은 차량에 따라감).
 * 계약 이력은 contractId에 귀속 (그 계약에만).
 */
export function HistoryAddDialog({
  open, onOpenChange, scope, contract,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: HistoryScope;
  contract: Contract;
}) {
  const { add } = useHistoryEntries();
  const categories = scope === 'vehicle' ? VEHICLE_CATEGORIES : CONTRACT_CATEGORIES;

  const [category, setCategory] = useState<HistoryCategory>(categories[0]);
  const [date, setDate] = useState(todayKr());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [status, setStatus] = useState<HistoryEntry['status']>('완료');
  const [vendor, setVendor] = useState('');
  const [mileage, setMileage] = useState('');
  const [saving, setSaving] = useState(false);

  const valid = !!title.trim() && !!date;

  async function handleSave() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await add({
        scope,
        contractId: contract.id,
        vehiclePlate: contract.vehiclePlate,
        date,
        category,
        title: title.trim(),
        description: description.trim() || undefined,
        cost: cost ? parseInt(cost.replace(/[^0-9]/g, ''), 10) || undefined : undefined,
        status,
        vendor: vendor.trim() || undefined,
        mileage: mileage ? parseInt(mileage.replace(/[^0-9]/g, ''), 10) || undefined : undefined,
      });
      // 초기화
      setCategory(categories[0]);
      setDate(todayKr());
      setTitle('');
      setDescription('');
      setCost('');
      setStatus('완료');
      setVendor('');
      setMileage('');
      onOpenChange(false);
    } catch (e) {
      alert('이력 추가 실패: ' + ((e as Error).message ?? String(e)));
    } finally {
      setSaving(false);
    }
  }

  const isVehicle = scope === 'vehicle';
  const isMaintenance = isVehicle && (category === '정비' || category === '부품교체' || category === '세차');

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent title={isVehicle ? `차량 이력 추가 — ${contract.vehiclePlate}` : `계약 이력 추가 — ${contract.customerName}`}>
        <DialogBody className="p-0" style={{ display: 'flex', flexDirection: 'column' }}>
          <form
            onSubmit={(e) => { e.preventDefault(); void handleSave(); }}
            style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div className="form-grid-2">
              <label className="form-label">분류 *</label>
              <div className="filter-bar" style={{ gridColumn: 'span 3', flexWrap: 'wrap' }}>
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`chip ${category === c ? 'active' : ''}`}
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <label className="form-label">일자 *</label>
              <DateInput required value={date} onChange={setDate} style={{ width: 200 }} />

              <label className="form-label">상태</label>
              <div className="filter-bar">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`chip ${status === s ? 'active' : ''}`}
                    onClick={() => setStatus(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <label className="form-label">제목 *</label>
              <input
                className="input"
                required
                placeholder={isVehicle
                  ? '예: 엔진오일 교체 / 좌측 펜더 수리'
                  : '예: 미수 1차 안내 통화 / 반납 분쟁 합의'}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ gridColumn: 'span 3' }}
              />

              {isVehicle && (
                <>
                  <label className="form-label">업체</label>
                  <input
                    className="input"
                    placeholder="예: 현대블루핸즈 강남"
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                  />

                  {isMaintenance && (
                    <>
                      <label className="form-label">주행거리</label>
                      <input
                        className="input mono"
                        placeholder="km"
                        value={mileage}
                        onChange={(e) => setMileage(e.target.value.replace(/[^0-9]/g, ''))}
                        style={{ width: 160 }}
                      />
                    </>
                  )}
                </>
              )}

              <label className="form-label">금액</label>
              <input
                className="input mono"
                placeholder="원 단위"
                value={cost}
                onChange={(e) => setCost(e.target.value.replace(/[^0-9]/g, ''))}
                style={{ width: 200 }}
              />

              <label className="form-label" style={{ alignSelf: 'start', paddingTop: 6 }}>상세 내용</label>
              <textarea
                className="input"
                rows={4}
                placeholder={isVehicle
                  ? '작업 내역 / 발견된 문제 / 부품 정보 등'
                  : '응대 내용 / 응답 / 약속 사항 / 다음 액션'}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ height: 'auto', padding: '8px 12px', resize: 'vertical', gridColumn: 'span 3' }}
              />
            </div>
          </form>
        </DialogBody>
        <DialogFooter>
          <div style={{ flex: 1 }} />
          <DialogClose asChild>
            <button className="btn">취소</button>
          </DialogClose>
          <button className="btn btn-primary" type="button" onClick={handleSave} disabled={!valid || saving}>
            {saving ? <CircleNotch size={12} weight="bold" style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={12} />}
            {saving ? '저장 중...' : '이력 추가'}
          </button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
