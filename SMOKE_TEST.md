# jpkerp5 월요일 사용 전 스모크 테스트

**27개 commit 누적 변경 후 검증 시나리오.** 각 시나리오 순서대로 따라가면서 확인.

## 0. 사전 준비 (사용자 측, 1회만)

- [ ] **GitHub Actions Secrets 셋팅** (Settings → Secrets and variables → Actions):
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_DATABASE_URL` (예: `https://jpkerp5-default-rtdb.firebaseio.com`)
  - `FIREBASE_SERVICE_ACCOUNT_KEY` (workspace JSON 그대로 paste)
- [ ] Actions 탭 → `daily-backup` 수동 트리거 → 성공 확인
- [ ] **Firebase Console** → Realtime Database → Rules 탭 → `database.rules.json` 내용 paste → 게시
- [ ] **Vercel** 최신 deploy 녹색 확인 (commit `431b167`)

## 1. Firebase Rules 배포 검증 (#21)

- [ ] 인증 없이 RTDB 접근 시도 → 거부 확인 (예: 브라우저 콘솔 `fetch('https://...rtdb.firebaseio.com/jpkerp5/contracts.json')` → 401)
- [ ] 로그인 후 ERP 정상 동작 → contracts/vehicles 로드 OK
- [ ] 비-master 사용자가 `/admin/migrate-sheet` 접근 → 즉시 `/` 로 redirect

## 2. 멱등성 — 결제 더블탭 방지 (#16)

운영중 계약 → 상세 → 수납 탭

- [ ] [+ 입금 등록] → 금액 → [저장] 빠르게 3번 연타
- [ ] **기대**: 1건만 추가, "저장 중…" 라벨 0.6초 + disabled 가드

## 3. 동시편집 — Lost Update (#22)

브라우저 2개 (시크릿 + 일반) 같은 계약 상세 열기

- [ ] A 창: 메모 "AAA" → 저장
- [ ] B 창: 메모 "BBB" → 저장
- [ ] **기대**: B 창 토스트 "다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도"
- [ ] A 의 변경 보존 (B 가 덮어쓰지 않음)

## 4. 회사 격리 (#19)

- [ ] Firebase Console → RTDB → `jpkerp5/users/{staff_uid}/companyCodes: ["CP01"]` 추가
- [ ] 해당 staff 로그인 → CP01 회사 데이터만 표시
- [ ] master(dudguq@gmail.com) → 전체 데이터 그대로

## 5. 회계기간 마감 (#18)

- [ ] `/admin/closing` → 2026-05 [마감] → 확인 다이얼로그
- [ ] 운영 계약 → 수납 → 입금일 `2026-05-15` → [저장]
- [ ] **기대**: 토스트 "회계기간 마감 — 2026-05월 거래 등록 불가" → 차단
- [ ] 모바일 `/m/entry/return` 도 같은 검사 ✓

## 6. PII Excel 마스킹 (#23)

- [ ] 계약 리스트 → [엑셀] → 다운로드 파일 확인
- [ ] **기대**: 연락처 `010-****-5678` 형태, 등록번호도 마스킹

## 7. 상태 SSOT — 반납 일할 정산 (#4)

- [ ] 운영중 계약 우클릭 → [반납 처리]
- [ ] **기대**: contract.status = '반납', returnedDate = 오늘, 마지막 회차 일할 자동 차감, vehicle.status = '반납' 동기

## 8. 신규 계약 등록 → detail 자동 오픈 (트렌드 UX)

- [ ] 운영현황 [+ 신규] → 계약 탭
- [ ] **첫 화면**: 필수 5개 (회사·계약자명·연락처·계약일·월대여료) + 차량번호 + 계약조건
- [ ] **advanced 접힘**: 차량 5단·운전자/면허 (펼침 가능)
- [ ] 필수만 입력 → [등록]
- [ ] **기대**: dialog 닫힘 + 새 계약 detail 자동 오픈
- [ ] 점진 입력: 메모 칸 클릭 → 타이핑 → 자동 저장 (1단계)

## 9. 신규 차량 등록 → 자산 detail 자동 오픈

- [ ] 운영현황 [+ 신규] → 차량 탭
- [ ] **첫 화면**: 필수 4개 + 차량번호
- [ ] **advanced 접힘**: 제조사 스펙·등록증·매입 (펼침 가능)
- [ ] [등록] → 자산 페이지로 이동 + 그 차량 detail 자동 열림

## 10. 이력 등록 (history-pane hotfix)

- [ ] 운영현황 [+ 신규] → 이력 탭
- [ ] 차량 검색 → 선택 → 폼 입력 → [이력 저장]
- [ ] **기대**: 토스트 "이력 저장됨" + 실제 RTDB `/history_entries/` 에 기록 (Firebase Console 확인)

## 11. 인라인 편집 트렌드 (UX 1-8차)

| 페이지 | 필드 | 동작 |
|---|---|---|
| 계약 detail → 계약정보 | 연락처/연락처2 | 클릭 → 자동 하이픈 PhoneInput |
| 계약 detail → 계약정보 | 반납예정일 | 클릭 → DateInput (캘린더) |
| 계약 detail → 계약정보 | 결제방법/담당자/메모 | 클릭 → 즉시 입력 |
| 차량 detail → 등록증 | 사용본거지 | 클릭 → 즉시 입력 |
| 차량 detail → 비고 | 메모 | 클릭 → 즉시 입력 (신규 섹션) |
| 법인 detail → 메모 | 회사 메모 | 클릭 → 즉시 입력 (신규 섹션) |
| 모바일 계약 페이지 | 비고 | 탭 → 즉시 입력 (별도 페이지 단계 X) |

- [ ] 5개 이상 확인

## 12. SMS 멱등 + Ledger (#26, #27)

- [ ] SMS 발송 → Firebase Console → `sms_log/{opKey}` 확인
- [ ] 같은 메시지 빠르게 재발송 → 중복 0 (mock)

## 13. 보고서 Frozen (#29)

- [ ] 자금일보 [세금계산서 엑셀] → 다운로드
- [ ] Firebase Console → `issued_invoices/{batchId}` → items 배열 확인
- [ ] 계약 monthlyRent 수정 → snapshot 은 변경 X

## 14. 업무 API (#31)

DevTools 콘솔:
```js
const t = await firebase.auth().currentUser.getIdToken();
fetch('/api/contracts/{CONTRACT_ID}/return', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
  body: JSON.stringify({ returnedDate: '2026-06-20' })
}).then(r => r.json()).then(console.log);
```
- [ ] `{ok: true}` 정상
- [ ] 마감된 월 시도 → `period_closed`
- [ ] 이미 반납된 계약 → `already returned`

## 15. 백업 (#20)

- [ ] Actions → `daily-backup` 수동 트리거
- [ ] artifact 다운로드 → JSON 열어 contracts/vehicles 데이터 확인

---

## 발견된 이슈 기록

| 시나리오 | 발견 | 우선도 | hotfix commit |
|---|---|---|---|
| | | | |

회귀 발견 시 즉시 알려주세요. hotfix 즉시 적용.

---

## 누적 push 27개 (오늘 8시간 marathon)

```
1-6차    Korean SSOT · selection · lifecycle · PageLoading · EmptyRow · Confirm
df12293  create-dialog Phase 1 (History 분리)
ERP 원칙 적용 7건  (#16·#22·#11·#17·#19·#20·#21·#26·#27·#18·#23·#4·#29·#31)
hotfix 3건         (useEffect 무한루프 · 이력 저장 미구현 · 모바일 회계마감)
직원 UX 8차       (인라인 편집 + 자동 detail 오픈 + advanced 접기 + 트렌드 입력)
보안 1건           (admin 6 페이지 진입 가드)
검증 hotfix 1건    (모바일 회계마감 · 거래처 검증)
```

마지막 commit: `431b167`
