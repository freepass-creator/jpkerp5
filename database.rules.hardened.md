# RTDB 보안 하드닝 초안 (1차 지혈) — `database.rules.hardened.json`

**상태: 초안. 배포 금지. 스테이징에서 스모크 검증 후에만 프로덕션 반영.**
라이브 `database.rules.json`은 건드리지 않음.

## 무엇을 고치나 (감사 CRITICAL 지혈)
현재 규칙은 `$tenant/.write: "auth != null"` 한 줄이 하위의 master-only·append-only 규칙을 전부 **덮어써서 죽여놨음**. 이 한 줄을 제거하고 노드별 `.write`를 명시 → 하위 보호 규칙이 **실효**.

| 차단되는 CRITICAL | 방법 |
|---|---|
| **자가 마스터 승격** (`users/{uid}/role='master'`) | `users/$uid/role` `.validate` = master(super-admin 이메일 or role=master)만 role 변경. 본인 프로필 쓰기는 허용하되 role은 불변 강제 |
| **감사로그 변조·삭제** | `audit_logs/$logId .write: !data.exists()` (append-only) 실효화 — 부모 `.write` 없음(있으면 덮어써짐) |
| **회계 마감 해제** | `closed_periods` master-only 실효 |
| **정책·모듈 변조** | `policy`·`modules` master-only 실효 |

**master 판정 = 코드(`SUPER_ADMIN_EMAILS`)와 동일하게 `auth.token.email`** (pyh@·sym@teamjpk.com) `||` RTDB `role='master'`. → RTDB에 role 씨앗을 안 심어도 동작(부트스트랩 락아웃 회피).

## 무엇을 아직 안 고치나 (Phase 2, 별도)
- **회사간 읽기 격리 없음** — `$tenant/.read: auth != null` 유지. A회사 직원이 B회사 데이터 **읽기**는 여전히 가능. (진짜 격리 = 회사별 하위트리 재구조화 or 서버경유 read. 큰 작업)
- **회사간 데이터 쓰기** — 데이터 노드 `.write: auth != null` 유지(기존 동작). 타 회사 레코드 쓰기 여전히 가능. (Phase 2에서 companyCodes 스코프)
- **손님 익명 전수조회** — 익명 auth도 `auth != null` 통과 → `/v5/contracts` 읽기 가능. (손님 페이지 서버경유 + rate-limit = 별도)
- **FIREBASE_ADMIN_KEY fail-open** (서버 API) — 앱 코드 이슈, 규칙과 무관.

→ 즉 이 초안은 **"쓰기측 최악(권한상승·감사변조·마감해제) 즉시 차단"**이 목표. 읽기 격리는 다음 단계.

## ⚠ 반드시 스테이징서 스모크할 것 (하나라도 실패 = 그 기능 쓰기 막힘)
데이터 노드 `.write`는 앱이 실제 쓰는 노드를 dbPath 전수 grep으로 열거함(22개). **빠진 노드가 있으면 그 노드 쓰기가 전면 거부됨.**

1. **비-master 계정으로 로그인** → 프로필 생성/갱신 성공 확인 (`users/{uid}` self-write; upsertUserProfile이 role을 안 써야 함 — 코드 확인됨, 스테이징 재확인).
2. **비-master로 전 쓰기 플로우**: 계약 생성/수정/삭제 · 차량 등록/상태변경 · 수납(bank_tx/card_tx) 업로드·매칭 · 과태료 · 보험 · 정비/할부/GPS/처분 · 디스패치 · 근태요청 · 공지 · 업로드(pending_uploads/vehicle_attachments) · 현장로그(field_logs*) · 거래처(vendors) · 문서발행(issued_documents/issued_invoices) · intake · schedules · customers · history_entries. **각각 저장 성공 확인.**
3. **super-admin(pyh/sym)로**: 회계마감(closed_periods) · 정책(policy) · 모듈(modules) · role 부여(users role) 성공 확인.
4. **감사로그**: 변경 시 audit_logs push 성공 확인(새 로그는 append 허용).
5. **차단 확인(negative)**: 비-master가 `users/{자기uid}/role='master'` 시도 → **거부**. 비-master가 closed_periods/policy/modules 쓰기 → **거부**. 기존 audit_log 덮어쓰기 → **거부**.

### 행동 변화 주의
- `closed_periods`·`policy`·`modules`는 이제 **super-admin 이메일만** 쓸 수 있음. 현재 앱 `isMaster`는 permissive(`!!user`)라 비-super-admin도 UI로 이 작업을 할 수 있었다면, 규칙 반영 후 **거부**됨. 이 작업을 누가 하는지 확인.
- `audit_logs`/`sms_log`는 진짜 append-only가 됨(덮어쓰기·삭제 불가).

## 배포 절차 (스모크 통과 후)
1. 스테이징 Firebase 프로젝트(또는 별도 네임스페이스)에 prod 데이터 사본 + 이 규칙 배포.
2. 위 스모크 전체 통과 확인.
3. 프로덕션 반영: `database.rules.hardened.json` 내용을 `database.rules.json`으로 복사 후 `firebase deploy --only database`. 배포 직후 로그인·핵심 쓰기 모니터.
4. 쓰기 거부 발생 시 → 해당 노드 `.write: "auth != null"` 추가하고 재배포.

## 다음(Phase 2) 로드맵
- 회사별 하위트리(`v5/companies/{code}/contracts...`) 재구조화 + `companyCodes` 스코프 read/write → 진짜 회사격리.
- 손님 조회 서버경유 + rate-limit 연결(`lib/rate-limit` 死코드 활성).
- 서버 API `requireAuth` fail-open(FIREBASE_ADMIN_KEY 미설정) 닫기.
