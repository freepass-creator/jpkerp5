# lib/intake — 단일 입구·분류·매칭 레이어

> Phase 0 (현재) — 파일·타입만 신설. 기존 코드 호출 X. UI 영향 X.
> 자세한 비전: [docs/data-pipeline-audit.md](../../docs/data-pipeline-audit.md)

## 핵심

```
모든 입력 → IntakeRaw → classify() → ClassifyResult { kind, confidence }
                                  ↓
                            match(signals) → MatchResult { contractId?, candidates, confidence }
                                  ↓
                            shouldAutoCommit ? commit : pending
```

## 파일

- `types.ts` — IntakeSource / IntakeKind / IntakeRaw / ClassifyResult / MatchResult / IntakeItem / IntakeStatus
- `classify.ts` — `classify(raw)`, `shouldAutoCommit(classifyResult)`
- `match.ts` — `match(signals, contracts, vehicles)`, `shouldAutoCommit(matchResult)`

## Phase 마이그레이션

### Phase 0 — 토대 ✓ (현재)
- [x] `lib/intake/` 신설.
- [x] types / classify / match 스켈레톤 (기존 로직 wrap).
- [x] typecheck 통과.

### Phase 1 — 호출자 리팩터 (UI 영향 0) ★ 완료

기존 산발 분류·매칭을 이 모듈로 위임.

- [x] `lib/firebase/pending-uploads-store.ts` `detectKind(mime)` → `classify({mode:'file'})` 위임
- [x] `lib/firebase/upload-auto-match.ts` `tryAutoMatch` → `match()` thin wrapper
- [x] `lib/excel-detect.ts` `detectHeaderRow` → `classifyByHeaders` 위임 + production keywords SSOT
      → create-dialog 의 엑셀 import (`parseExcelFile` 호출) 도 자동으로 SSOT 사용

#### Phase 1 에 안 들어가는 항목 (다른 abstraction)

- `lib/receipt-match.ts` `autoMatchAll` — schedule-level 매칭 (`contract.schedule[seq]`
  단위). intake/match 는 contract-level 만. dueDate proximity / FIFO / 동명이인
  격하 등 특화 로직 다수. Phase 2 에서 schedule matcher 를 별도 모듈로 분리 검토.

- `components/penalty/penalty-register-dialog.tsx` `findContractByPlate` —
  `lib/use-contract-store.ts` 의 adapted Contract shape (plate/startDate/endDate)
  이라 intake/match 직접 호출 불가. Phase 2 adapter 정리 시 동반.

각 단계마다 기존 동작 동일 유지 (regression 0). 단지 구현 위치만 이동.

### Phase 2 — `intake/` RTDB 노드 신설
모든 입력을 일단 intake 에 저장 → classify → match → status 갱신.

- [x] `lib/firebase/intake-store.ts` 신설 — CRUD + 라이브 구독:
      `addIntakeItem` / `setIntakeClassify` / `setIntakeMatch` /
      `setIntakeOverrideKind` / `setIntakeOverrideMatch` /
      `markIntakeCommitted` / `markIntakeRejected` / `removeIntakeItem` /
      `useIntakeItems` / `useIntakeItem`
- [ ] **Firebase Rules 검증** — 콘솔에서 `/intake/{itemId}` 가 `auth != null`
      체크만 확인. 메모리 [[v4-permission-policy]] 정책 그대로.
      base64 데이터 큰 항목은 추후 Storage 분리 검토.
- [ ] `app/api/intake/process/route.ts` (서버 worker) — pending intake 재처리
- [ ] 기존 입구 7곳이 모두 intake/ 로 우회 (Phase 2.1+)
  - [x] 2.1 `/m/upload` — 평행 기록 (기존 pending_uploads / vehicle_photos /
        field_logs 흐름 유지 + intake/ 에 audit 로그). 미매칭은 intake status='pending'.
  - [x] 2.2 CreateDialog (엑셀 import) — 배치 단위 평행 기록 (write 폭증 방지).
        commitContractFiles / commitPaymentFiles / commitSnapshotRows /
        commitVehicleRows 모두 intakeBatchStart + intakeBatchEnd 추가.
        (horizontal / receivables 는 less-common, 추후)
  - [x] 2.3 OCR dialog 4종 — 평행 기록 (배치 단위)
    - penalty-register-dialog.tsx commitAll → desktop-ocr-penalty
    - vehicle-reg-register-dialog.tsx handleCommitAll → desktop-ocr-vehicle
    - insurance-register-dialog.tsx handleCommitAll → desktop-ocr-insurance
    - business-reg-register-dialog.tsx handleCommitAll → desktop-ocr-business
  - [x] 2.4 모바일 entry 4종 평행 기록 (2026-06-20)
    - /m/entry/license: source='mobile-upload', kind='document-misc' (license-verify scope)
    - /m/entry/deliver: source='mobile-upload', kind='contract' (deliver scope)
    - /m/entry/return: source='mobile-upload', kind='contract' (return scope)
    - /m/entry/memo: source='mobile-upload', kind='document-misc' (memo-{contract/vehicle/customer} scope)
  - [ ] 2.5 데스크탑 페이지 폼 다이얼로그 (contract-detail / vehicle-detail / 등 다수)

### Phase 3 — `/inbox` 단일 페이지
- [x] `app/inbox/page.tsx` — intake/ 라이브 구독, 행 클릭 → raw + classify + match 상세 패널.
      필터: status (active/all/각 단계), source (mobile/excel/OCR 4종/manual), 검색.
- [x] Sidebar 메뉴 `inbox` 추가 (master 한정, /inbox).

### Phase 3.1 — /inbox 수동 보정 액션
- [x] kind 수동 override (overrideKind) — 드롭다운 선택 즉시 setIntakeOverrideKind
- [x] 거부 처리 (markIntakeRejected + 사용자 입력 reason)
- [x] 삭제 (이미 있음 — intake/ 노드에서 제거, 도메인 노드 영향 X)
- [ ] 계약 매칭 수동 변경 (overrideMatch) — 계약 검색 다이얼로그 필요. 추후.
- [ ] 재처리 (status reset + classify/match 재실행) — Phase 3.2.

- [ ] 기존 7개 다이얼로그·`/m/upload` 와 양립 (점진 폐기) — Phase 4 이후.

### Phase 4 — 각 페이지 read-only 화
- [ ] 페이지에서 CRUD 다이얼로그 떼고 "편집" 버튼 → /inbox 모달 호출.
- [ ] 페이지는 표시·정렬·필터·엑셀만.

## 사용 예시 (Phase 1+ 부터)

```ts
import { classify } from '@/lib/intake/classify';
import { match } from '@/lib/intake/match';

// 엑셀 한 행
const c = classify({ mode: 'row', row, headerHint: headers });
if (c.kind === 'contract' && c.confidence >= 0.85) {
  // 즉시 contract patch + commit
}

// 모바일 업로드
const c = classify({ mode: 'file', file, ocrFields });
if (c.kind === 'penalty') {
  const m = match({ plate: ocrFields.plate, eventDate: ocrFields.date }, contracts, vehicles);
  if (m.confidence === 'high') { /* commit */ }
  else { /* intake pending — 사용자 후보 선택 */ }
}
```

## 비목표 (앞으로도 안 함)

- 도메인 노드 (vehicles/contracts/...) 자체의 구조 변경 — intake 는 입구·분류·매칭만.
- 페이지 store 의 read API 변경 — useVehicleStore 등 그대로.
- 보안·권한 모델 변경 — admin-emails / use-role 그대로.
