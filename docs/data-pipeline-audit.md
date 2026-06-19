# 데이터 파이프라인 진단 — 현재 vs 목표

> 작성일 2026-06-19. **로컬 진단용** (커밋·푸시 X). 
> 비전: "**모든 데이터 한 곳에서 수집 → 분류 → 페이지별 뿌리기**"

---

## 1. 목표 (이상적 모델)

```
[모든 입력·수정]               [단일 inbox]              [분류기·매칭기]                  [페이지 = 보여주기만]
────────────────────────────────────────────────────────────────────────────────────────────────────────
파일/엑셀/CSV/PDF/이미지 ┐
사진/녹음/문자/수기 ─────├──→  uploads/{id}     ──→  classify + match     ──→ vehicles / contracts /
시스템 sync ────────────│     {kind?, raw, status}      ↓                       bankTx / cardTx /
모바일 드래그 ─────────┘                            dest + patch                penalty / insurance /
                                                       ↓                       loan / gps / ...
                                                  {matched → commit
                                                   unmatched → pending}                ↓
                                                                              ★ 각 페이지 = READ-ONLY
                                                                                (목록·정렬·필터만)
                                                                                CRUD 다이얼로그·폼 ❌
```

**강한 규칙:**
- **입력·수정은 모두 한 곳** (intake/inbox).
- **각 페이지는 표시만** — 목록, 정렬, 필터, 검색, 엑셀 다운로드.
- 페이지에서 "이 행을 고친다" 라는 행동을 하면 → intake 다이얼로그로 점프 (또는 모달).
- 페이지는 도메인 store 를 **구독만** 함. write 함수 호출 X.

---

---

## 2. 현재 (실제)

### 2-1. 입구 (7개 흩어짐)

| # | 경로 | 입력 | 파서 / 처리 | 출구 노드 |
|---|---|---|---|---|
| 1 | `components/create-dialog.tsx` (신규 등록 다이얼로그) | 엑셀/CSV (계약·자산·재무·시작자료) | `parseContractRow` / `parseVehicleRow` / `parseBankTxRow` / `parseCardTxRow` / `parseSnapshotRow` / `parseHorizontalContractsRow` / `parseReceivablesRow` | `contracts/`, `vehicles/`, `bankTransactions/`, `cardTransactions/`, ... (각각 직접) |
| 2 | `components/penalty/penalty-register-dialog.tsx` | OCR 이미지/PDF (과태료 고지서) | OCR `/api/ocr/extract` (kind=penalty) → `findContractByPlate` | `penalties/` (with `_contract`, `_company` inline) |
| 3 | `components/asset/vehicle-reg-register-dialog.tsx` | OCR 이미지/PDF (자동차등록증) | OCR `/api/ocr/extract` (kind=vehicle_reg) | `vehicles/` |
| 4 | `components/insurance/insurance-register-dialog.tsx` | OCR (보험증권) | OCR `/api/ocr/extract` (kind=insurance_policy) | `insurance/` |
| 5 | `components/companies/business-reg-register-dialog.tsx` | OCR (사업자등록증) | OCR | `companies/` |
| 6 | `app/m/upload/page.tsx` (모바일 드래그·파일선택) | 임의 파일 (사진·녹음·PDF) | `tryAutoMatch` (전화/차번/면허) → kind 자동 / subCategory 사용자 선택 | matched: `vehiclePhotos/` 또는 `fieldLogs/` 직접 / unmatched: `pendingUploads/` |
| 7 | 페이지별 폼 입력 다이얼로그들 | 수기 키보드 입력 | (없음 — 직접 set) | 그 페이지의 도메인 노드 |

#### 보조 sync (시스템 자동)
- `upsertVehicleFromContract` (lib/entity-sync.ts) — 계약 저장 시 같은 plate vehicle 자동 생성/갱신
- `generateSchedules` (lib/payment-schedule.ts) — 계약 저장 시 회차표 자동 생성
- `autoMatchAll` (lib/receipt-match.ts) — 결제 매칭 (휴리스틱 plate suffix 등)
- `syncContractStatusFromVehicle` — vehicle 상태 변경 시 같은 plate 계약 상태 sync

### 2-2. 분류 로직 (산발적)

| 분류 위치 | 기준 | 결과 |
|---|---|---|
| CreateDialog `parseAndDetectKind` | 시트 헤더 패턴 (계약자명+계약일 → '계약', 거래일자+입금/출금 → '계좌', 승인번호+가맹점 → '카드', ...) | `kind: '계약' \| '자산' \| '계좌' \| '자동이체' \| '카드' \| '미분류'` |
| /m/upload `inferKind` | MIME type (image/* → 'image', audio/* → 'audio', application/pdf → 'document') | `kind: 'image' \| 'audio' \| 'document' \| 'other'` + `subCategory` 사용자 선택 |
| OCR dialogs | dialog 고정 (penalty/vehicle/insurance/business 각자 자기 종류) | 분류 단계 없음 — 이미 type 박힌 채 입장 |
| 수기 다이얼로그 | 폼 자체가 type 정의 | 분류 단계 없음 |

⚠️ **공통 SSOT 가 없음.** 같은 PDF 라도 어떤 다이얼로그로 열었느냐에 따라 분류가 다름.

### 2-3. 자동 매칭 로직 (3 종류)

| 위치 | 무엇을 매칭 | 어떻게 |
|---|---|---|
| `tryAutoMatch` (lib/firebase/upload-auto-match.ts) | 모바일 업로드 → 계약 | 전화 → 차번 → 면허 순 |
| `findContractByPlate` (lib/use-contract-store.ts) | 과태료 OCR → 계약 | plate + 위반일 in-period 우선, 활성계약 우선 |
| `autoMatchAll` / `applyMatch` (lib/receipt-match.ts) | 은행 입금 → 계약 회차 | byName + plate-suffix (`박영협8309`) + dueDate proximity |

⚠️ 매칭 로직이 **세 군데 흩어짐.** 입구마다 자기만의 매칭. 공통 confidence 분류·동명이인 safeguard 산발적.

### 2-4. 페이지 구독 매트릭스

| 페이지 | Firebase 노드 | 직접 호출 |
|---|---|---|
| `/` 대시보드 | contracts + vehicles + receivables (파생) | useContractStore + useVehicleStore + computed |
| `/asset` | vehicles | useVehicleStore |
| `/asset/insurance` | vehicles + insurance | 두 store |
| `/asset/loan` | vehicles + loanRecords | 두 store |
| `/asset/repair` | vehicles + repairRecords | 두 store |
| `/asset/gps` | vehicles + gpsRecords | 두 store |
| `/asset/disposal` | vehicles (status filter) | useVehicleStore |
| `/asset/ledger` | vehicles + asset-ledger calc | useVehicleStore + lib/asset-ledger |
| `/contract` | contracts | useContractStore |
| `/contract/expire` / `idle` / `overdue` / `return` / `schedule` | contracts | useContractStore + computed |
| `/payments` | bankTransactions + cardTransactions | useBankTxStore + useCardTxStore |
| `/finance` | 같은 + journal/posted | + useJournalStore |
| `/finance/daily` | 같은 + daily aggregate | computed |
| `/receivables` | contracts (unpaid derived) | useContractStore + computed |
| `/penalty` | penalties | usePenaltyStore |
| `/companies` | companies | useCompanyStore |
| `/notice/cert/*` | contracts + companies | 두 store |

각 페이지가 **자기 도메인 store 만 구독.** 좋은 패턴이지만 입구가 산발적이라 한 사용자 행동 (예: 엑셀 1개 업로드) 의 영향이 **여러 노드에 직접 분산 write** 됨.

---

## 3. 격차 (Gap)

### A. **단일 입구 없음**
- 사용자는 "데이터 올린다" 행동을 7개 다른 위치에서 시작.
- 입력 권한·UX·alias·OCR·매칭이 입구마다 다름.

### B. **공용 분류기 없음**
- "이 파일이 무엇인지" 판단이 5+ 군데 흩어짐.
- 같은 PDF (자동차등록증) 가 vehicle-reg 다이얼로그 vs /m/upload 에서 다르게 처리.

### C. **공용 매칭기 없음**
- 매칭이 입구·도메인마다 다른 구현.
- 같은 plate 인데 모바일/과태료/결제 각각 다른 함수 호출.

### D. **에러·진단 일관성 없음**
- "왜 안 됐는지" 메시지 입구마다 형식·격식 다름.
- 최근 v5.0.0 흡수된 `diagnoseContractRow + previewRow` 가 첫 일관성 시도.

### E. **inbox (pending) 가 모바일에만 있음**
- 데스크탑 업로드는 분류 실패 시 토스트 + 던짐, 보존 X.
- 모바일 만 `pendingUploads/` 노드에 보존.

### F. **각 페이지가 write 권한 가짐 (목표: read-only)**
- 대부분 페이지가 자기 도메인의 inline 수정·삭제·상태 변경 직접 호출:
  - `/asset` BottomBar bulk 상태 변경 → `updateVehicle` 직접
  - `/contract/[id]` 폼 편집 → `updateContract` 직접
  - `/payments` 행 분개·계정과목 → `updateBankTx` 직접
  - `/penalty` 인라인 수정 → `setItems` 직접
  - `/companies` 신규/수정 → `addCompany`/`updateCompany` 직접
- 다이얼로그도 페이지 안에 박혀있음 (vehicle-detail-dialog, contract-detail-dialog, ...).
- 목표 모델: 위 모두를 **공용 intake** 안으로 옮기고, 페이지에서는 "이 행 편집" 버튼 → intake 모달 호출.

---

## 4. 목표 모델로 가는 경로 (옵션)

### (i) 작은 시작 — **공용 IntakeInbox**
- 새 노드 `intake/{id}` 신설 — 모든 입력이 일단 여기로.
- 필드: `{ source, kind?, mimeType?, raw, status: 'classifying'|'matched'|'pending'|'committed', dest?, createdAt }`
- 단일 분류·매칭 모듈 `lib/intake-classify.ts`:
  - file → kind 후보 + confidence
  - row → kind 후보 (헤더 휴리스틱)
  - 매칭 (전화/차번/면허/이름)
- 페이지·다이얼로그 UI 는 그대로 두되, 내부 저장 경로를 intake → classify → commit 로 통일.

### (ii) 중간 — **공통 분류·매칭 라이브러리**
- 위 (i) 의 분류 모듈을 모든 기존 입구가 호출하도록 리팩터.
- 결과 적용 (target node 에 write) 만 기존 흐름 유지.

### (iii) 큰 — **사용자 facing 단일 inbox 페이지**
- `/inbox` — 모든 데이터 입력 진입점. 좌측 입력 zone (드래그·파일선택·붙여넣기·녹음·키보드), 우측 분류 결과 + 미매칭 pending.
- 각 도메인 페이지는 결과 노출만 (입력 X).
- 가장 큰 UX 전환. 기존 7개 다이얼로그·`/m/upload` 와 양립 필요.

---

## 5. 추천 다음 스텝

1. **현 상태 사용자 점검** — 위 입구 7개 다 사용 중인지, 직원 실제 사용 패턴 파악
2. **공용 분류·매칭 모듈부터** (옵션 ii) — 안전·점진적. 사용자 UI 영향 0.
3. 그다음 `intake/` 노드 신설하고 한 입구씩 옮기기 (옵션 i)
4. **나중에** `/inbox` 단일 페이지로 전환 (옵션 iii). 사용자 워크플로우 큰 전환 — 합의 후
5. **마지막**: 각 페이지에서 CRUD 다이얼로그 떼어내고 read-only 화 (E 격차 해소)
   — 페이지 → "편집" 버튼 → /inbox 모달 호출. 페이지 코드 대폭 감소·중복 제거.

---

## 6. 책임 매트릭스 (현재 vs 목표)

| 책임 | 현재 | 목표 |
|---|---|---|
| 파일·수기 받기 | 7곳 산발 | **intake 한 곳** |
| 종류 판단 | 5곳 산발 | **분류기 1곳** |
| 매칭 | 3곳 산발 | **매칭기 1곳** |
| 도메인 노드 write | 각 페이지·다이얼로그 | **intake 안에서만** |
| 페이지 | 표시 + 편집 혼재 | **표시만 (read-only)** |
| 정렬·필터·검색·엑셀 | 페이지 | 페이지 (그대로) |

---

## 부록 — 핵심 파일

- 입력 dialog: `components/create-dialog.tsx`, `components/penalty/penalty-register-dialog.tsx`, `components/asset/vehicle-reg-register-dialog.tsx`, `components/insurance/insurance-register-dialog.tsx`, `components/companies/business-reg-register-dialog.tsx`
- 모바일: `app/m/upload/page.tsx` + `lib/firebase/upload-auto-match.ts`
- 파서: `lib/import-commit.ts`, `lib/parse-helpers.ts`, `lib/parsers/*`
- 매칭: `lib/receipt-match.ts`, `lib/use-contract-store.ts` (findContractByPlate)
- 시스템 sync: `lib/entity-sync.ts`, `lib/payment-schedule.ts`
- 노드 store: `lib/firebase/*-store.ts`, `lib/use-*-store.ts`
