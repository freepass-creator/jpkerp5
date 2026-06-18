# Google Workspace 연동 설정 (teamjpk.com)

ERP 서류·일정·메일을 teamjpk.com Google Workspace 와 연동하는 방법.

## 한 줄 요약

Service Account JSON 키 1개 + 환경변수 4개 → Drive 백업·Calendar 등록·Gmail 발송 동작.

## 1. Google Cloud 프로젝트 + Service Account

teamjpk.com Workspace 관리자 권한으로 진행:

1. https://console.cloud.google.com 접속
2. 새 프로젝트 생성 (예: `jpkerp5-workspace`)
3. **API 활성화** (좌측 메뉴 → API 및 서비스 → 라이브러리):
   - **Google Drive API**
   - **Google Calendar API**
   - **Gmail API**
4. **Service Account 생성** (IAM 및 관리자 → 서비스 계정 → +서비스 계정 만들기):
   - 이름: `jpkerp5-erp`
   - 역할: 없음 (Workspace 권한은 별도 위임)
   - **JSON 키 다운로드** ← 안전한 곳에 보관, 이 파일이 ERP 인증의 핵심
5. **Domain-Wide Delegation 활성화** (해당 서비스 계정 상세 → 고급 설정 → '도메인 전체 위임 사용 설정' 체크) → Client ID 복사

## 2. Workspace 관리자 콘솔 (admin.google.com)

위에서 복사한 Client ID 로 권한 위임:

1. https://admin.google.com 접속 (Workspace 관리자)
2. 보안 → 액세스 및 데이터 관리 → **API 컨트롤**
3. **도메인 전체 위임** → 새로 추가:
   - Client ID: 위에서 복사한 값
   - OAuth Scope (콤마 구분):
     ```
     https://www.googleapis.com/auth/drive,
     https://www.googleapis.com/auth/calendar,
     https://www.googleapis.com/auth/gmail.send
     ```
4. 저장

## 3. Drive 루트 폴더 준비

teamjpk.com 사용자 계정 (예: `erp@teamjpk.com`) 의 Drive 에 폴더 생성:

```
JPK문서/
  계약/
  자산/
  보험/
```

해당 `JPK문서` 폴더 URL 에서 ID 복사 (`drive.google.com/drive/folders/{ID}` 의 `{ID}` 부분).

## 4. ERP 환경변수 (.env.local)

```bash
# Google Workspace 연동 ──────────────────────────────────────────

# Service Account JSON 키 — 한 줄 raw JSON 또는 base64 인코딩 모두 지원.
# raw JSON 권장 (다중 줄 \n 처리 가능):
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...","client_email":"jpkerp5-erp@PROJECT.iam.gserviceaccount.com",...}

# Domain-Wide Delegation 으로 임퍼소네이트할 사용자 (이 사용자의 Drive·Gmail 권한 사용)
GOOGLE_IMPERSONATE_USER=erp@teamjpk.com

# Workspace 도메인
GOOGLE_WORKSPACE_DOMAIN=teamjpk.com

# Drive 루트 폴더 ID (위 3번에서 복사)
GOOGLE_DRIVE_ROOT_FOLDER_ID=1AbCdEfGhIjKlMnOpQrStUvWxYz

# Gmail 발신 주소 (보통 GOOGLE_IMPERSONATE_USER 와 동일)
GMAIL_SENDER=erp@teamjpk.com

# 회사 공용 캘린더 ID (없으면 'primary' = 임퍼소네이트 사용자의 기본 캘린더)
GOOGLE_CALENDAR_ID=primary
```

## 5. 검증

dev 서버 띄우고 curl/Postman 으로 테스트:

### Drive 업로드
```bash
curl -X POST http://localhost:7502/api/google/drive/upload \
  -H "Authorization: Bearer <FIREBASE_ID_TOKEN>" \
  -F "file=@/path/to/계약서.pdf" \
  -F "path=계약/JPK본사/12가1234/CR-2026-001" \
  -F "fileName=계약서.pdf"
```

### Calendar 이벤트
```bash
curl -X POST http://localhost:7502/api/google/calendar/event \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"summary":"보험 만기: 12가1234","date":"2026-08-15","reminders":[{"method":"email","minutes":1440}]}'
```

### Gmail 발송
```bash
curl -X POST http://localhost:7502/api/google/gmail/send \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"to":"test@example.com","subject":"테스트","bodyText":"안녕하세요"}'
```

## 트러블슈팅

- **`401 unauthorized_client`** → Workspace 관리자 콘솔의 Scope 가 정확한지 (콤마/공백 X), Client ID 가 맞는지 재확인
- **`403 invalid_grant`** → impersonateUser 가 teamjpk.com 도메인이 아니거나 비활성 계정
- **`Drive folder not found`** → ROOT_FOLDER_ID 의 폴더가 impersonate 사용자에게 공유 안 됨
- **`Service Account 키 parse 실패`** → JSON 의 `\n` (private_key) escape 확인 — base64 인코딩 추천:
  ```bash
  base64 -i service-account.json
  ```

## 보안

- `GOOGLE_SERVICE_ACCOUNT_KEY` 는 **서버 전용** (NEXT_PUBLIC_ 접두사 X). 클라이언트 노출 절대 금지.
- `.env.local` 은 `.gitignore` 에 포함되어 있는지 확인.
- Production 배포 (Vercel·자체 서버) 시 환경변수 콘솔에 직접 입력.
