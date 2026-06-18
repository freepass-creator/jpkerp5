# 렌터카매니저 CHANGELOG

버전 규칙 (semver):
- **MAJOR (5.x.x)** : 큰 마일스톤·정책 변경 (코드 체계 개편, 신규 도메인)
- **MINOR (x.1.x)** : 좀 큰 수정 (신규 기능, 페이지 추가)
- **PATCH (x.x.1)** : 자잘한 수정 (UI 다듬기, 버그 픽스)

---

## 5.0.3 — 2026-06-19 · 퀵필터 드랍다운 규격 통일

- `app/globals.css` — `.filter-bar / .quick-filters / .topbar` 안의 `input-compact` 만 font 12px + border-radius 4px 로 chip 과 일치 (다이얼로그·폼은 영향 없음, scoped).
- `app/finance/page.tsx` — 입출금 방향 dropdown `data-w="sm"` → `"md"` (타 페이지와 폭 일치).

## 5.0.2 — 2026-06-19 · 계약 import 행별 진단

- **계약 import** — 미반영 행마다 `행번호 + 사유 (계약일 없음 / 계약자명·차량번호 모두 없음) + 미리보기` 토스트로 노출. 직원이 어느 행을 고쳐야 하는지 즉시 인지.
- `lib/import-commit.ts` — `diagnoseContractRow`, `previewRow` 헬퍼 추가.

## 5.0.1 — 2026-06-19 · 내용증명 위약금률 일치

- `components/notice/cert-document.tsx` 의 monthsServed·monthsRemaining 을 `lib/utils.monthsBetween` 으로 통일. 단건/일괄 페이지가 1년 경계에서 위약금률 30% vs 20% 갈리던 사고 해결.

---

## 5.0.0 — 2026-06-19 · 베이스라인

jpkerp5 60라운드 polish + 운영 안정화 완료 시점에서 **렌터카매니저 v5** 로 브랜드 통합.

### 주요 정리
- **권한 분리 활성화** — `isSuperAdmin`/`isAdmin` strict 화이트리스트 (`pyh@teamjpk.com`),
  `useRole().isMaster` 는 permissive (페이지 접근). 위험 작업만 마스터 한정.
- **dashboard cleanup** — 700+ 라인 죽은 컴포넌트 제거 (TodoBoard·CompanyKpiGrid·MainKpi 등).
- **영수증 발행** — 입금 이력 행별 A4 PDF + 인쇄, 한글 금액 변환 (`오십만원정`).
- **계약기간 (개월) 계산 정확화** — 나누기 방식 폐기, 진짜 calendar months.
- **미입력 표시 단순화** — `미입력 ⚠` 통일, 박스 제거.
- **Ctrl+A 토글** — 다시 누르면 전체 해제.
- **재무 업로드** — 카드/계좌/자동이체 alias 확장, 휴리스틱 자동매칭 (`autoMatchAll`, plate suffix).
- **마스터 계정 변경** — `pyh@teamjpk.com`.

### 알려진 미결
- `/m/upload` Phase B (OCR 자동매칭 신뢰도 분류).
- Google Workspace 연동 (키 발급 대기).
- 홈택스 세금계산서 연동.
