# 렌터카매니저 CHANGELOG

버전 규칙 (semver):
- **MAJOR (5.x.x)** : 큰 마일스톤·정책 변경 (코드 체계 개편, 신규 도메인)
- **MINOR (x.1.x)** : 좀 큰 수정 (신규 기능, 페이지 추가)
- **PATCH (x.x.1)** : 자잘한 수정 (UI 다듬기, 버그 픽스)

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
