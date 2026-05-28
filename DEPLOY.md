# 신규 고객사 배포 가이드

> jpkerp5 (마스터 코드베이스)를 새로운 회사에 배포하는 단계별 가이드.
> 회사마다 **Firebase 프로젝트 분리 + Vercel 프로젝트 분리 + 도메인 분리**.
> 코드는 fork 또는 template copy 후 회사별 customization.

---

## 0. 준비물

- GitHub 계정 (마스터 repo 접근 권한)
- Firebase 계정 (Blaze 플랜 권장 — Spark은 RTDB 동시연결 100 제한)
- Vercel 계정 (Pro 권장 — Hobby는 commercial 사용 불가)
- 도메인 (선택 — 없으면 `*.vercel.app` 무료 서브도메인 사용)
- API 키들 (선택):
  - Gemini API (OCR 기능 — 사업자등록증·면허증)
  - RIMS API (면허번호 검증)

---

## 1. GitHub repo 복사

### 옵션 A — Template repo로 복사 (권장)
1. https://github.com/freepass-creator/jpkerp5 진입
2. 우측 상단 **`Use this template`** → `Create a new repository`
3. Owner / 새 repo 이름: `carting-{회사명}` (예: `carting-스위치플랜`)
4. Private 권장 → **Create repository**

### 옵션 B — 로컬에서 clone + 새 repo로 push
```bash
git clone https://github.com/freepass-creator/jpkerp5 carting-회사명
cd carting-회사명
# 원본 remote 제거 후 새 repo 연결
git remote remove origin
git remote add origin https://github.com/{org}/carting-회사명.git
git push -u origin main
```

---

## 2. Firebase 프로젝트 생성

1. https://console.firebase.google.com → **Add project**
2. 프로젝트 이름: `carting-{회사명}` 또는 회사 식별 명칭
3. Analytics: 끄거나 켜기 (선택)
4. 생성 완료 후 좌측 메뉴:

### 2-1. Realtime Database 활성화
- **Build → Realtime Database → Create Database**
- 위치: `asia-southeast1` (싱가포르) 또는 가까운 region
- 보안 규칙: **locked mode** 로 시작 → 아래 3-1에서 갱신

### 2-2. Authentication 활성화
- **Build → Authentication → Get started**
- Sign-in method → **Email/Password** 사용 설정 → Save

### 2-3. (선택) Storage 활성화 — OCR 파일 보관용
- **Build → Storage → Get started**

### 2-4. 웹 앱 등록
- 프로젝트 개요 → **Add app** → Web (`</>`)
- 앱 닉네임: `carting-{회사명}-web`
- **Firebase Hosting 사용 안 함** (Vercel 사용)
- `Register app` 클릭 → 표시되는 **firebaseConfig** 값 7개 복사

```js
// 표시 예시
const firebaseConfig = {
  apiKey: "AIzaSy...",                              // → NEXT_PUBLIC_FIREBASE_API_KEY
  authDomain: "carting-xxx.firebaseapp.com",        // → NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  databaseURL: "https://carting-xxx.firebaseio.com",// → NEXT_PUBLIC_FIREBASE_DATABASE_URL
  projectId: "carting-xxx",                         // → NEXT_PUBLIC_FIREBASE_PROJECT_ID
  storageBucket: "carting-xxx.appspot.com",         // → NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  messagingSenderId: "1234567890",                  // → NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  appId: "1:1234567890:web:abc123",                 // → NEXT_PUBLIC_FIREBASE_APP_ID
};
```

> ⚠️ `databaseURL` 이 표시 안 되면 Realtime Database 활성화부터.

---

## 3. Firebase 보안 규칙

### 3-1. RTDB Rules
- 좌측 **Realtime Database → Rules** 탭
- 아래 내용으로 교체 → **Publish**:

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

> 권한 분리(SUPER_ADMIN 등)는 앱 코드(`lib/admin-emails.ts`)에서 처리.

### 3-2. (Storage 사용 시) Storage Rules
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## 4. Vercel 프로젝트 생성

1. https://vercel.com/new → **Import Git Repository**
2. 위에서 만든 `carting-{회사명}` repo 선택 → **Import**
3. **Framework Preset**: Next.js (자동 인식)
4. **Root Directory**: `./` (기본값)
5. **Environment Variables** 추가 (아래 5번 참고)
6. **Deploy** 클릭

---

## 5. 환경변수 (Vercel)

Vercel → Settings → Environments → Production → Environment Variables.

> 또는 `.env.local` 통째 import (`...` 메뉴 → Import .env File)

### 필수 — Firebase (7개)
```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=carting-xxx.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://carting-xxx.firebaseio.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=carting-xxx
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=carting-xxx.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
NEXT_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abc123
```

### 선택 — Gemini OCR
```
GEMINI_API_KEY=...
```
> 사업자등록증·면허증·계약서 OCR 사용 시. 미설정 시 OCR 버튼이 동작 안 함 (수동 입력은 가능).

### 선택 — RIMS 면허번호 검증
```
RIMS_AUTH_KEY=...
RIMS_SECRET_KEY=...
RIMS_BASE_URL=https://...
RIMS_DEV_AUTH_KEY=...
RIMS_DEV_SECRET_KEY=...
RIMS_USER_ID=...
```
> 한국교통안전공단 RIMS 키. 면허 검증 안 쓸 거면 생략 가능.

### 환경 설정 범위
- **All Environments** (Production / Preview / Development) 체크 권장

---

## 6. 도메인 연결 (선택)

### 옵션 A — Vercel 무료 서브도메인
- 자동: `carting-{회사명}.vercel.app`
- 추가 작업 없음

### 옵션 B — 커스텀 도메인
1. Vercel → Settings → Domains → **Add**
2. 도메인 입력 (예: `erp.회사도메인.com`)
3. Vercel이 안내하는 DNS 레코드 (`A` 또는 `CNAME`) 를 도메인 관리자에서 설정
4. 자동 SSL 발급 (1-5분)

---

## 7. 코드 커스터마이징 (회사별)

> 아래 파일들만 수정. 본 코드는 건드리지 마세요 — 마스터 업데이트 적용 시 충돌 방지.

### 7-1. 브라우저 탭 제목 + 메타데이터
**`app/layout.tsx`**
```ts
export const metadata: Metadata = {
  title: '카팅 — {회사명}',          // ← 변경
  description: '자동차 대여 관리 시스템',
};
```

### 7-2. 로그인 화면 브랜드
**`components/auth/auth-gate.tsx`** 의 `Brand` 함수 (라인 41-49 근처):
```tsx
function Brand() {
  return (
    <div className="auth-brand">
      <span className="auth-brand__base">{회사명}</span>{' '}
      <span className="auth-brand__erp">ERP</span>
    </div>
  );
}
```
와 `Copyright`:
```tsx
function Copyright() {
  return <div className="auth-copyright">&copy; {new Date().getFullYear()} {회사명}. All Rights Reserved.</div>;
}
```

### 7-3. 사이드바 로고 (선택)
**`components/layout/sidebar.tsx`** — `sb-brand` 영역에 로고 이미지 추가하려면 `<img>` 삽입.

### 7-4. 관리자 이메일 화이트리스트
**`lib/admin-emails.ts`**
```ts
export const SUPER_ADMIN_EMAILS: ReadonlyArray<string> = [
  '대표이메일@회사도메인.com',   // ← 변경
];
```
> 데이터 삭제·일괄 처리 권한자. 보통 사장님 1명.

### 7-5. Firebase 데이터 prefix (선택)
**`lib/firebase/client.ts`**
```ts
export const RTDB_ROOT = 'jpkerp5';   // ← 회사별로 다르게 (예: 'carting001')
```
> 같은 Firebase를 여러 회사가 쓰는 경우에만 필요. **회사별 Firebase 분리 시 그대로 둬도 됨** (데이터는 어차피 격리됨).

### 7-6. 파비콘
**`app/favicon.ico`** 교체.

---

## 8. 배포 후 첫 사용

1. 도메인 접속 → 로그인 화면 표시 확인
2. **계정 만들기** → 사장님(SUPER_ADMIN) 이메일로 가입
3. 자동 로그인 → 온보딩 튜토리얼 자동 진행
4. **법인 관리** → 회사 등록 (사업자등록증 OCR 활용)
5. **운영 현황** → 차량·계약 일괄 업로드 또는 개별 등록

---

## 9. 마스터 업데이트 받아오기

마스터(`jpkerp5`)에서 새 기능이 나오면:

```bash
cd carting-회사명
git remote add upstream https://github.com/freepass-creator/jpkerp5
git fetch upstream
git merge upstream/main
# 충돌 시 7번에서 수정한 파일들만 회사 버전 유지
git push origin main
```

Vercel 자동 배포됨.

---

## 10. 체크리스트 (10분 안에 끝나야 함)

- [ ] GitHub repo 생성 (template copy)
- [ ] Firebase 프로젝트 생성 + RTDB + Auth 활성화
- [ ] Firebase 보안 규칙 적용
- [ ] Vercel 프로젝트 생성 + repo 연결
- [ ] 환경변수 입력 (Firebase 7개 + 선택 API)
- [ ] 도메인 연결
- [ ] `app/layout.tsx` 제목 변경
- [ ] `components/auth/auth-gate.tsx` 브랜드 변경
- [ ] `lib/admin-emails.ts` 관리자 이메일 변경
- [ ] 배포 확인 (로그인 화면에서 "Firebase Auth 미설정" 안 뜨면 성공)
- [ ] 사장님 계정으로 첫 가입 + 온보딩 통과

---

## 트러블슈팅

**"Firebase Auth 미설정" 로그인 화면 빨간 글씨**
→ Vercel 환경변수 누락. Production 환경에 7개 다 들어갔는지 확인 후 Redeploy.

**PERMISSION_DENIED RTDB 에러**
→ RTDB Rules 미적용. 3-1 단계 확인.

**OCR 버튼 클릭해도 무반응**
→ `GEMINI_API_KEY` 미설정.

**면허 검증 동작 안 함**
→ `RIMS_*` 환경변수 미설정 또는 키 만료.

**마스터 update 가져왔는데 회사 커스텀이 사라짐**
→ 7번에서 수정한 파일을 회사 repo에 다시 적용. 충돌 해결 후 push.
