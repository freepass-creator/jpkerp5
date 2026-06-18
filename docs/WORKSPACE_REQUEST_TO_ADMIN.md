# Google Workspace 관리자 작업 요청서

(이 문서를 그대로 teamjpk.com Workspace 관리자에게 전달하시면 됩니다.)

---

## 안녕하세요. ERP 시스템 (jpkerp5) ↔ teamjpk.com Google Workspace 연동을 위해 다음 작업 부탁드립니다.

목적:
- 계약서·차량등록증·보험증권 등 ERP 업로드 서류를 회사 Google Drive 에 자동 백업
- 만기·검사·반납 일정을 회사 Google Calendar 에 자동 등록
- 미수금 안내·만기 통지를 Gmail 로 자동 발송

작업 5단계. 약 15-30분 소요.

---

## 1단계. Google Cloud 프로젝트 만들기

1. https://console.cloud.google.com 접속 (teamjpk.com 관리자 계정으로 로그인)
2. 상단 프로젝트 선택 → **새 프로젝트** 클릭
3. 프로젝트 이름: `jpkerp5-workspace` (또는 원하시는 이름)
4. 조직: `teamjpk.com` 선택
5. **만들기**

---

## 2단계. API 3개 활성화

좌측 메뉴 → **API 및 서비스** → **라이브러리** 에서 다음 3개 검색 후 각각 **사용 설정** 버튼 클릭:

1. **Google Drive API**
2. **Google Calendar API**
3. **Gmail API**

---

## 3단계. 서비스 계정 만들기 + 키 발급

1. 좌측 메뉴 → **IAM 및 관리자** → **서비스 계정**
2. 상단 **+ 서비스 계정 만들기** 클릭
3. 입력:
   - 이름: `jpkerp5-erp`
   - ID: 자동 생성 (그대로)
   - 설명: `ERP 시스템 - Drive/Calendar/Gmail 연동`
4. **만들고 계속하기** → 역할 부여 없이 **완료**
5. 생성된 서비스 계정 클릭 → **키** 탭 → **키 추가** → **새 키 만들기**
6. **JSON** 선택 → **만들기** → JSON 파일 자동 다운로드
   ↑ 이 파일이 핵심입니다. 안전한 곳에 보관 + 운영자(pyh@teamjpk.com)에게 전달
7. 서비스 계정 상세 → **고급 설정** → **'도메인 전체 위임 사용 설정'** 체크 → 저장
8. 위에서 표시된 **OAuth 2.0 Client ID** (숫자 21자리) 복사

---

## 4단계. Workspace 관리자 콘솔에서 권한 위임

1. https://admin.google.com 접속 (Workspace 관리자)
2. 좌측 메뉴 → **보안** → **액세스 및 데이터 관리** → **API 컨트롤**
3. 하단 **도메인 전체 위임** 섹션 → **새로 추가**
4. 입력:
   - **클라이언트 ID**: 위 3단계 8번에서 복사한 21자리 숫자
   - **OAuth Scope** (콤마로 구분, 한 줄에 모두):
     ```
     https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/gmail.send
     ```
5. **승인**

---

## 5단계. Drive 루트 폴더 만들기

운영자(pyh@teamjpk.com 또는 erp@teamjpk.com) 계정의 Drive 에서:

1. https://drive.google.com 접속
2. **새로 만들기** → **폴더** → 이름: `JPK문서`
3. 그 폴더 안에 하위 폴더 만들기 (자동 생성도 가능하지만 미리 만들어두면 안전):
   - `계약`
   - `자산`
4. `JPK문서` 폴더 더블클릭 → URL 의 `folders/` 다음 문자열 (예: `1AbCdEfGhIjKlMnOpQrStUvWxYz`) 복사 → 운영자에게 전달

---

## 6단계 (선택). 회사 공용 캘린더 만들기

만기·검사·반납 일정을 별도 캘린더에 모으고 싶으시면:

1. https://calendar.google.com 접속
2. 좌측 **다른 캘린더** 옆 **+** → **새 캘린더 만들기**
3. 이름: `JPK 차량 일정` → **캘린더 만들기**
4. 만든 캘린더의 **설정** → **캘린더 통합** → **캘린더 ID** 복사 (예: `c_jpk_main@group.calendar.google.com`)
5. **특정 사용자와 공유** → ERP 서비스 계정 이메일 추가 + **변경 및 공유 관리** 권한 부여
   (서비스 계정 이메일: 3단계의 jpkerp5-erp@PROJECT-ID.iam.gserviceaccount.com)

---

## 결과로 운영자(pyh@teamjpk.com) 에게 전달할 항목

| 항목 | 예시 | 어디서 얻음 |
|---|---|---|
| ① Service Account JSON 키 (파일) | `jpkerp5-workspace-abc123.json` | 3단계 6번 |
| ② Service Account 이메일 | `jpkerp5-erp@PROJECT-ID.iam.gserviceaccount.com` | 3단계 자동 생성 |
| ③ Workspace 도메인 | `teamjpk.com` | 알고 계심 |
| ④ Drive 루트 폴더 ID | `1AbCdEfGhIjKlMnOpQrStUvWxYz` | 5단계 |
| ⑤ 임퍼소네이트 사용자 | `erp@teamjpk.com` (또는 운영자가 지정) | 미리 결정 |
| ⑥ 발신 메일 주소 | `erp@teamjpk.com` (보통 ⑤와 같음) | 미리 결정 |
| ⑦ 회사 캘린더 ID (선택) | `c_jpk_main@group.calendar.google.com` | 6단계 |

---

## 보안 안내

- JSON 키 파일은 **암호 같은 것**입니다. 메일로 보내실 거면 압축+비밀번호 또는 Drive 권한 공유 추천.
- 한 번 누출되면 즉시 폐기 + 새로 발급하셔야 합니다 (서비스 계정 → 키 탭에서 즉시 가능).
- 모든 작업은 audit log 에 남으니, 위임된 권한이 잘 작동 안 할 경우 (예: 401 오류) admin.google.com 의 보안 로그에서 원인 확인 가능합니다.

---

## 작업 완료 후 운영자(pyh@teamjpk.com)에게 알려주실 것

위 표의 ①~⑦ 정보를 안전하게 전달.

문제 발생 시:
- Workspace 관리자 콘솔 (admin.google.com) → 보고서 → 감사 로그
- Cloud Console → IAM 및 관리자 → 감사 로그

감사합니다.
