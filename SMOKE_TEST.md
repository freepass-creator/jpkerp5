# jpkerp5 월요일 사용 전 스모크 테스트

13개 commit 큰 변경 후 검증 항목. 각 시나리오 순서대로 따라가면서 확인.

## 0. 사전 준비 (사용자 측, 1회만)

- [ ] GitHub Actions Secrets 셋팅:
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_DATABASE_URL`
  - `FIREBASE_SERVICE_ACCOUNT_KEY` (workspace JSON 그대로 paste)
- [ ] Actions 탭 → `daily-backup` 수동 트리거 → 성공 확인
- [ ] Firebase Console → Realtime Database → Rules 탭 → `database.rules.json` 내용 paste → 게시

## 1. Firebase Rules 배포 검증

- [ ] 인증 없이 RTDB 접근 시도 → 거부 확인 (예: 브라우저 콘솔에서 `fetch('https://...rtdb.firebaseio.com/jpkerp5/contracts.json')` → 401)
- [ ] 로그인 후 ERP 정상 동작 → contracts/vehicles 로드 OK

## 2. 멱등성 (#16) — 결제 더블탭 방지

대상: 어떤 운영중 계약 → 상세 → 수납 탭

- [ ] [+ 입금 등록] → 금액 입력 → [저장] 빠르게 2번 클릭
- [ ] **기대**: 1건만 추가됨 (2번째 클릭은 disabled 또는 무시)
- [ ] 버튼 라벨이 잠시 "저장 중…" 표시되는지

## 3. 동시편집 (#22) — Lost Update 방지

브라우저 2개 (또는 시크릿 모드 사용)에서 같은 계약 상세 열기

- [ ] A 창에서 메모 "AAA" 수정 → 저장
- [ ] B 창에서 메모 "BBB" 수정 → 저장
- [ ] **기대**: B 창에 토스트 "다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도"
- [ ] A 창 변경 보존 확인 (B 가 덮어쓰지 않음)

## 4. 회사 격리 (#19)

마스터 (dudguq@gmail.com) 가 staff 계정에 회사 권한 부여 테스트:

- [ ] Firebase Console → RTDB → `jpkerp5/users/{uid}` 노드에 `companyCodes: ["CP01"]` 수동 추가
- [ ] 그 staff 계정으로 로그인
- [ ] **기대**:
  - 계약/차량 리스트에 CP01 회사 데이터만 표시
  - 다른 회사 계약 0건
  - 회사 필터 dropdown 에 CP01 만

- [ ] 마스터 본인 로그인 → 전체 회사 데이터 정상 (영향 0)

## 5. 회계기간 마감 (#18)

- [ ] `/admin/closing` 진입 → 24개월 그리드 표시
- [ ] 2026-05 [마감] 클릭 → 확인 다이얼로그 → 마감 처리
- [ ] 카드 색 변경 (빨강 + Lock 아이콘)
- [ ] 운영중 계약 → 수납 → 입금일 `2026-05-15` 로 입력 → [저장]
- [ ] **기대**: 토스트 "회계기간 마감 — 2026-05월 거래 등록 불가" → 차단됨
- [ ] 2026-06 등 다른 월 입금 정상 가능
- [ ] [재오픈] → 사유 prompt → audit log 기록 확인

## 6. PII Excel 마스킹 (#23)

- [ ] 계약 리스트 → [엑셀 다운로드] → 다운로드된 파일 열기
- [ ] **기대**: 연락처 컬럼이 `010-****-5678` 형태 (raw X)
- [ ] 등록번호 컬럼도 마스킹 유지

## 7. 상태 SSOT (#4) — 반납 처리

운영중 계약 우클릭 → [반납 처리]

- [ ] 확인 → 처리
- [ ] **기대**:
  - contract.status = '반납' 변경
  - contract.returnedDate = 오늘
  - 마지막 회차 일할 자동 정산 (반납일 기준)
  - vehicle.status = '반납' (자산관리에서 확인)

## 8. SMS 멱등 + Ledger (#26, #27)

- [ ] SMS 발송 다이얼로그 → 1명 선택 → 발송
- [ ] **기대**: Firebase Console → `sms_log/{opKey}` 노드 확인 — 보낸 시각·메시지·결과 기록
- [ ] 같은 발송 다시 시도 (네트워크 실패 가정) → 같은 idempotencyKey 로 호출 시 중복 발송 X (mock)

## 9. 보고서 Frozen (#29)

- [ ] 자금일보 → [세금계산서 엑셀] → 다운로드
- [ ] **기대**: Firebase Console → `issued_invoices/{batchId}` 노드 — items 배열에 발행 시점 스냅샷 보존
- [ ] 발행 후 계약 monthlyRent 수정 → snapshot 은 변경 안 됨 확인

## 10. 업무 API (#31) — /api/contracts/[id]/return

호출 예 (DevTools 콘솔):
```js
const idToken = await firebase.auth().currentUser.getIdToken();
fetch('/api/contracts/{CONTRACT_ID}/return', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
  body: JSON.stringify({ returnedDate: '2026-06-20' })
}).then(r => r.json()).then(console.log);
```

- [ ] **기대**: `{ ok: true, returnedDate: '2026-06-20' }`
- [ ] 회계기간 마감된 월 시도 → `{ ok: false, error: 'period_closed' }`
- [ ] 이미 반납된 계약 → `{ ok: false, error: 'already returned' }`

## 11. 백업 (#20)

- [ ] GitHub Actions → daily-backup → 수동 트리거
- [ ] 성공 후 artifact 다운로드 → JSON 열어보고 contracts/vehicles 데이터 확인

---

## 발견된 이슈 기록

| 시나리오 | 발견 | 우선도 |
|---|---|---|
| | | |

회귀 발견 시 알려주세요. 즉시 hotfix.
