/**
 * 차량번호 정규성 판단 + 자동 status 결정 — 도메인 룰.
 *
 *  · 정규 plate: `\d{2,3}[가-힣]\d{4}` (예: 01도9893, 109호5678)
 *  · 임판: 위 형식 X (예: 임시01-1234, 12-345)
 *  · 빈값: 차량번호 없음 (계약만 입력)
 *
 *  계약을 통해 자산 자동 등록 시 status 자동 결정:
 *    · 빈값 → 구매대기 (차량 매입 전)
 *    · 임판 → 등록대기 (인도 받았지만 정식 번호 안 나옴)
 *    · 정상 → 운행 (계약 매칭되어 등록 완료)
 *
 *  휴차 등은 자동 결정 X — 사용자가 명시적으로 상태 변경.
 */

import type { VehicleStatus } from '@/lib/types';

const PLATE_RE = /^\d{2,3}[가-힣]\d{4}$/;

/** plate 정규화 — 공백/특수문자 제거, OCR 영문→숫자 보정 */
function normPlate(s?: string): string {
  if (!s) return '';
  return s
    .replace(/\s+/g, '')
    .replace(/O/gi, '0')
    .replace(/I/gi, '1')
    .replace(/[^0-9가-힣]/g, '');
}

/** 정규 차량번호인가 — `\d{2,3}[가-힣]\d{4}` 매칭 */
export function isNormalPlate(plate: string | undefined): boolean {
  if (!plate) return false;
  return PLATE_RE.test(normPlate(plate));
}

/**
 * 계약을 통해 차량이 자동 등록될 때 status 결정.
 *
 *  · 빈값      → 구매대기
 *  · 임판      → 등록대기
 *  · 정상 plate → 운행
 *
 * 휴차는 자동 결정 안 함 — 사용자가 직접 휴차 처리할 때만.
 */
export function deriveVehicleStatusFromContract(plate: string | undefined): VehicleStatus {
  if (!plate?.trim()) return '구매대기';
  if (!isNormalPlate(plate)) return '등록대기';
  return '운행';
}

/** 사용자 친화 라벨 — UI 에서 plate 종류 표시 */
export function plateKindLabel(plate: string | undefined): { kind: 'none' | 'temp' | 'normal'; label: string } {
  if (!plate?.trim()) return { kind: 'none', label: '차량번호 없음 (구매대기)' };
  if (!isNormalPlate(plate)) return { kind: 'temp', label: '임시 번호판 (등록대기)' };
  return { kind: 'normal', label: '정상 차량번호 (운행)' };
}
