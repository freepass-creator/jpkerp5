'use client';

/**
 * 렌터카매니저 제안서 — 대표·외부 보고용 인쇄 가능 페이지.
 * 사이드바 X (단독 페이지). /proposal 직접 접근.
 * 인쇄 시 @media print 로 페이지 분할 + 헤더·푸터 자동.
 */

import {
  BookOpen, CheckCircle, Car, CurrencyKrw, FileText, House, Warning, Camera,
  ShieldCheck, ChartBar, Sparkle, Receipt, ClipboardText, Cube,
} from '@phosphor-icons/react';

export default function ProposalPage() {
  return (
    <div className="proposal-root">
      {/* 인쇄 액션 */}
      <div className="proposal-actions">
        <button className="btn btn-primary" type="button" onClick={() => window.print()}>
          <FileText size={14} weight="bold" /> PDF 저장 / 인쇄
        </button>
      </div>

      <main className="proposal-main">
        {/* ─── 표지 ─── */}
        <section className="proposal-cover">
          <div className="cover-eyebrow">렌터카 운영 ERP — 도입 제안</div>
          <h1 className="cover-title">렌터카매니저</h1>
          <div className="cover-subtitle">차량·계약·수납·미수·과태료를 한 곳에서 관리</div>
          <div className="cover-meta">
            <span>jpkerp5</span> · <span>2026</span> · <span>Confidential</span>
          </div>
        </section>

        {/* ─── 1. 도입 배경 ─── */}
        <section className="proposal-section">
          <h2><BookOpen size={18} weight="duotone" /> 1. 도입 배경 — 엑셀 운영의 한계</h2>
          <div className="grid-3">
            <Card icon={<Warning size={18} />} title="실수·중복" body="여러 명이 엑셀 따로 쓰면 차량·계약 정보 어긋남. 한 명이 수정한 게 다른 사람에게 반영 안 됨." />
            <Card icon={<Warning size={18} />} title="조회 시간" body="‘이 차량 마지막 수납이 언제였지’ 한 번 찾는 데 여러 시트·파일 뒤져야 함. 평균 5~10분." />
            <Card icon={<Warning size={18} />} title="추적 불가" body="누가 언제 무엇을 바꿨는지 기록 X. 분쟁·감사 시 근거 못 댐." />
          </div>
        </section>

        {/* ─── 2. 핵심 가치 ─── */}
        <section className="proposal-section">
          <h2><Sparkle size={18} weight="duotone" /> 2. 핵심 가치 — 시간·정확·증거</h2>
          <div className="value-row">
            <Value n="시간 절약" headline="조회 30초" body="차량번호 검색 한 번으로 계약·수납·정비·보험·과태료 전체 이력 즉시" />
            <Value n="실수 차단" headline="OCR 자동입력" body="자등증·통지서·증권 사진 한 장으로 모든 필드 자동 채움. 오타 0" />
            <Value n="감사 증거" headline="감사로그 100%" body="누가 언제 무엇을 바꿨는지 영구 기록. 분쟁·세무·승계 모두 대응" />
          </div>
        </section>

        {/* ─── 3. 핵심 기능 6개 ─── */}
        <section className="proposal-section">
          <h2><Cube size={18} weight="duotone" /> 3. 핵심 기능 — 6 모듈</h2>
          <div className="grid-3">
            <Feature icon={<House size={20} />} title="운영현황" body="전체 차량·계약 한눈에. 회사·상태·만기·미수 필터. 행 더블클릭 = 상세 5탭" />
            <Feature icon={<Car size={20} />} title="자산관리" body="등록차량·자산현황·보험증권·구매방식·수선·GPS·치분 7개 sub-page. 자산현황 detail = 운영 요약 한 화면" />
            <Feature icon={<FileText size={20} />} title="계약관리" body="라이프사이클 [유지][종료][전체] + 보조 [만기임박][반납][미수금]. 종료 사유 자동 결정 (정상/중도/채권)" />
            <Feature icon={<CurrencyKrw size={20} />} title="수납·재무" body="은행·카드 엑셀 업로드 → 회차별 자동 매칭. 자금일보 일자별 집계 (세무사 공유)" />
            <Feature icon={<Warning size={20} />} title="미수·리스크" body="연체 자동 분류 (3회+·2회·1회). 시동제어·내용증명·채권화 전이" />
            <Feature icon={<Receipt size={20} />} title="과태료" body="통지서 OCR → 위반항목·금액 자동 추출 → 부과 근거 자동 결정 (회사/계약자)" />
          </div>
        </section>

        {/* ─── 4. 차별점 ─── */}
        <section className="proposal-section">
          <h2><ShieldCheck size={18} weight="duotone" /> 4. 차별점 — 동종 시스템 대비</h2>
          <table className="proposal-table">
            <thead>
              <tr>
                <th>항목</th>
                <th>일반 ERP</th>
                <th>렌터카매니저</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>입력 방식</strong></td>
                <td>수기 입력</td>
                <td><Mark>OCR 자동입력</Mark> (자등증·보험증권·통지서·계약서)</td>
              </tr>
              <tr>
                <td><strong>데이터 동기화</strong></td>
                <td>저장 시 반영</td>
                <td><Mark>실시간</Mark> (RTDB — 입력 즉시 모든 직원 화면 갱신)</td>
              </tr>
              <tr>
                <td><strong>모듈 연동</strong></td>
                <td>각자 독립</td>
                <td><Mark>양방향 연동</Mark> (계약 등록 시 차량 자동 생성 / 보험·할부 연결)</td>
              </tr>
              <tr>
                <td><strong>감사로그</strong></td>
                <td>선택 사항</td>
                <td><Mark>전 작업 기본</Mark> (누가·언제·무엇을 — 영구 보존)</td>
              </tr>
              <tr>
                <td><strong>모바일</strong></td>
                <td>별도 앱</td>
                <td><Mark>휴대폰 브라우저 그대로</Mark> (반응형, 설치 X)</td>
              </tr>
              <tr>
                <td><strong>도메인 룰</strong></td>
                <td>일반 비즈니스</td>
                <td><Mark>렌터카 전용</Mark> (차량번호 5단 분류·임판·휴차·반납·매각 흐름 내장)</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* ─── 5. ROI ─── */}
        <section className="proposal-section">
          <h2><ChartBar size={18} weight="duotone" /> 5. 도입 효과 — ROI 측정 포인트</h2>
          <div className="grid-3">
            <Roi metric="조회 시간" before="5~10분" after="10~30초" rate="-95%" />
            <Roi metric="입력 오타" before="월 ~10건" after="OCR 후 ~0건" rate="-100%" />
            <Roi metric="미수 발견" before="익월 결산 시" after="실시간 알람" rate="추적 즉시" />
            <Roi metric="감사 응답" before="수일" after="당일 (감사로그)" rate="시간 ↓" />
            <Roi metric="과태료 부과 누락" before="평균 월 1~2건" after="자동 부과 근거" rate="0" />
            <Roi metric="직원 교육" before="신입 1주" after="튜토리얼 30분" rate="-95%" />
          </div>
        </section>

        {/* ─── 6. 보안·인프라 ─── */}
        <section className="proposal-section">
          <h2><ShieldCheck size={18} weight="duotone" /> 6. 보안·인프라</h2>
          <div className="grid-2">
            <Card icon={<ShieldCheck size={18} />} title="권한 관리" body="마스터 / 관리자 / 일반 3단계. 페이지·기능 단위 접근 통제. 개인정보(법인등록번호) 마스킹." />
            <Card icon={<FileText size={18} />} title="감사 추적" body="모든 create/update/delete/restore — 누가·언제·무엇을 영구 기록. audit_logs 별도 노드." />
            <Card icon={<Camera size={18} />} title="OCR 원본 보존" body="자동 인식 결과 외에도 원본 파일 자동 보관. 분쟁 시 증거." />
            <Card icon={<ClipboardText size={18} />} title="Firebase RTDB" body="Google Cloud 기반. 자동 백업·암호화·SSL. 가용성 99.95%." />
          </div>
        </section>

        {/* ─── 7. 도입 단계 ─── */}
        <section className="proposal-section">
          <h2><CheckCircle size={18} weight="duotone" /> 7. 도입 단계</h2>
          <ol className="proposal-steps">
            <li>
              <strong>1단계 — 데이터 이관 (1~2일)</strong>
              <div>기존 엑셀에서 차량·계약·미수 데이터를 통합 양식으로 정리 → 일괄 업로드</div>
            </li>
            <li>
              <strong>2단계 — 직원 교육 (30분)</strong>
              <div>처음 시작 4단계 + 자주 쓰는 작업 위주. /help 사용 안내 페이지에서 셀프 학습</div>
            </li>
            <li>
              <strong>3단계 — 운영 시작</strong>
              <div>은행·카드 엑셀 일일 업로드 + 신규 계약·과태료 즉시 입력. 1주 후 안정화</div>
            </li>
            <li>
              <strong>4단계 — 효과 측정 (1개월 후)</strong>
              <div>조회 시간·미수 회복·과태료 부과 정확도 등 KPI 점검. 추가 요구사항 수렴 후 2차 보강</div>
            </li>
          </ol>
        </section>

        {/* 푸터 */}
        <footer className="proposal-footer">
          <div>렌터카매니저 — jpkerp5 · 2026</div>
          <div>문의: dudguq@gmail.com / jpkpyh@gmail.com</div>
        </footer>
      </main>

      <style jsx>{`
        .proposal-root {
          min-height: 100vh;
          background: var(--bg-page);
          color: var(--text-main);
        }
        .proposal-actions {
          position: sticky;
          top: 0;
          z-index: 10;
          background: var(--bg-card);
          border-bottom: 1px solid var(--border);
          padding: 8px 16px;
          display: flex;
          gap: 8px;
        }
        .proposal-main {
          max-width: 820px;
          margin: 0 auto;
          padding: 30px 40px 80px;
          background: var(--bg-card);
          min-height: 100vh;
        }
        .proposal-cover {
          text-align: center;
          padding: 60px 0 40px;
          border-bottom: 2px solid var(--brand);
          margin-bottom: 40px;
        }
        .cover-eyebrow {
          font-size: 12px;
          color: var(--text-sub);
          letter-spacing: 4px;
          margin-bottom: 16px;
          text-transform: uppercase;
        }
        .cover-title {
          font-size: 42px;
          font-weight: 800;
          color: var(--brand);
          margin: 0 0 12px;
          letter-spacing: -2px;
        }
        .cover-subtitle {
          font-size: 16px;
          color: var(--text-main);
          margin-bottom: 30px;
        }
        .cover-meta {
          font-size: 11px;
          color: var(--text-weak);
          letter-spacing: 2px;
        }
        .proposal-section {
          padding: 24px 0;
          page-break-inside: avoid;
        }
        .proposal-section h2 {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 18px;
          font-weight: 700;
          color: var(--brand);
          margin: 0 0 18px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--border);
        }
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .grid-3 {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 12px;
        }
        .value-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 16px;
        }
        .proposal-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .proposal-table th {
          background: var(--bg-header);
          padding: 8px 12px;
          text-align: left;
          font-weight: 700;
          border-bottom: 2px solid var(--brand);
        }
        .proposal-table td {
          padding: 10px 12px;
          border-bottom: 1px solid var(--border-soft);
        }
        .proposal-steps {
          list-style: none;
          counter-reset: step;
          padding: 0;
          margin: 0;
        }
        .proposal-steps li {
          counter-increment: step;
          padding: 12px 0 12px 48px;
          position: relative;
          font-size: 13px;
          border-bottom: 1px solid var(--border-soft);
        }
        .proposal-steps li::before {
          content: counter(step);
          position: absolute;
          left: 0;
          top: 12px;
          width: 32px;
          height: 32px;
          background: var(--brand);
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
        }
        .proposal-steps li strong {
          color: var(--brand);
          font-size: 14px;
        }
        .proposal-steps li div {
          color: var(--text-sub);
          margin-top: 4px;
        }
        .proposal-footer {
          margin-top: 60px;
          padding: 20px 0;
          border-top: 1px solid var(--border);
          font-size: 11px;
          color: var(--text-weak);
          display: flex;
          justify-content: space-between;
        }

        @media print {
          .proposal-actions { display: none; }
          .proposal-main { padding: 0 20mm; max-width: none; }
          .proposal-section { page-break-inside: avoid; }
          .proposal-cover { page-break-after: always; }
        }
      `}</style>
    </div>
  );
}

function Card({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div style={{ padding: 14, background: 'var(--bg-sunken)', borderRadius: 6, fontSize: 12 }}>
      <div style={{ color: 'var(--brand)', marginBottom: 8 }}>{icon}</div>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div style={{ color: 'var(--text-sub)', lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div style={{ padding: 16, background: 'var(--brand-bg)', borderRadius: 6, border: '1px solid var(--brand)', fontSize: 12 }}>
      <div style={{ color: 'var(--brand)', marginBottom: 10 }}>{icon}</div>
      <div style={{ fontWeight: 700, color: 'var(--brand)', marginBottom: 6 }}>{title}</div>
      <div style={{ color: 'var(--text-main)', lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

function Value({ n, headline, body }: { n: string; headline: string; body: string }) {
  return (
    <div style={{ padding: 18, background: 'var(--bg-sunken)', borderRadius: 6, textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: 'var(--text-sub)', letterSpacing: 2, marginBottom: 10 }}>{n}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--brand)', marginBottom: 10 }}>{headline}</div>
      <div style={{ fontSize: 11, color: 'var(--text-sub)', lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

function Roi({ metric, before, after, rate }: { metric: string; before: string; after: string; rate: string }) {
  return (
    <div style={{ padding: 14, background: 'var(--bg-sunken)', borderRadius: 6, fontSize: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{metric}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'var(--text-weak)', textDecoration: 'line-through' }}>{before}</span>
        <span style={{ color: 'var(--text-sub)' }}>→</span>
        <span style={{ color: 'var(--green-text)', fontWeight: 600 }}>{after}</span>
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--brand)', fontWeight: 700 }}>{rate}</div>
    </div>
  );
}

function Mark({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ background: 'var(--green-bg)', color: 'var(--green-text)', padding: '2px 6px', borderRadius: 3, fontWeight: 600 }}>
      {children}
    </span>
  );
}
