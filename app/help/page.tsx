'use client';

import {
  BookOpen, Buildings, House, CurrencyKrw, Warning, FileXls, Camera, MagnifyingGlass,
  CheckCircle, ArrowRight, Question, Plus, ChartBar, ClipboardText, Phone, Sparkle,
} from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { useAuth } from '@/lib/use-auth';

export default function HelpPage() {
  const { user } = useAuth();
  function restartTour() {
    if (!user) return;
    try {
      localStorage.removeItem(`jpkerp5_onboarding_done_${user.uid}`);
      location.reload();
    } catch { /* ignore */ }
  }
  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 14, color: 'var(--text-main)' }}>
            <BookOpen size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            사용 안내
          </div>
        </header>

        <div style={{ padding: '20px 28px 60px', maxWidth: 920, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* 개요 */}
          <header className="page-header">
            <div className="page-header-title-group">
              <h1 className="page-header-title">
                <BookOpen size={18} weight="duotone" />
                jpkerp5 — 차량 렌탈 ERP
              </h1>
              <div className="page-header-title-sub">
                직원용 사용 가이드 · 처음 쓰시면 위에서 아래로 한 번 읽어보세요
              </div>
            </div>
            <div className="page-header-actions">
              <button className="btn btn-primary" type="button" onClick={restartTour} title="환영 튜토리얼 다시 보기">
                <Sparkle weight="duotone" /> 튜토리얼 다시 보기
              </button>
            </div>
          </header>

          {/* 1. 시작 순서 */}
          <Section icon={<ArrowRight weight="bold" />} title="시작 순서 (처음 한 번)">
            <Step n={1} icon={<Buildings size={14} />}>
              <strong>법인 관리</strong> → <strong>신규 법인</strong> → 사업자등록증 사진 업로드하면 자동 채움
              <Hint>회사명·대표자·법인번호·업태·종목 OCR로 한 번에</Hint>
            </Step>
            <Step n={2} icon={<House size={14} />}>
              <strong>운영 현황</strong> → <strong>+ 신규</strong> → <strong>운영 현황 업로드</strong> 탭 → 엑셀 일괄 (또는 개별 등록)
              <Hint>차량·계약·고객 한 번에 등록됨. 회차도 자동 생성</Hint>
            </Step>
            <Step n={3} icon={<CurrencyKrw size={14} />}>
              <strong>계좌 관리</strong> → <strong>+ 계좌내역 올리기</strong> → 은행 엑셀 그대로 업로드 → <strong>자동매칭</strong>
              <Hint>KB·우리·신한·하나·농협·IBK·카카오·토스·케이뱅크 등 다 인식</Hint>
            </Step>
            <Step n={4} icon={<CheckCircle size={14} />}>
              <strong>운영 현황</strong>에서 계약 더블클릭 → <strong>수납내역</strong> 탭에서 회차별 입금 확인
              <Hint>미납 / 분할입금 / 선납 / 할인 / 면제 모두 여기서</Hint>
            </Step>
          </Section>

          {/* 2. 주요 화면 */}
          <Section icon={<ChartBar weight="bold" />} title="주요 화면 안내">
            <Row icon={<ChartBar size={14} />} title="대시보드">
              오늘의 KPI · 신규 인도 · 반납 예정 · 미수 현황 한눈에
            </Row>
            <Row icon={<House size={14} />} title="운영 현황">
              모든 차량·계약 리스트. 필터(전체·계약중·휴차·미수), 회사별·차량상태별 정렬. 행 더블클릭 = 상세
            </Row>
            <Row icon={<CurrencyKrw size={14} />} title="계좌 관리 (자금일보)">
              은행 거래내역 한 줄씩 분개 · 일자별 집계 · 카드 매출. 회차 자동매칭
            </Row>
            <Row icon={<Warning size={14} />} title="과태료 업무">
              과태료/단속 처리 워크플로우
            </Row>
            <Row icon={<Buildings size={14} />} title="법인 관리">
              회사 등록 · 계좌/카드 · 사무실·차고지·주차장 · 사업자등록증 등 서류
            </Row>
          </Section>

          {/* 3. 자주 쓰는 작업 */}
          <Section icon={<Question weight="bold" />} title="자주 쓰는 작업">
            <Workflow
              q="80만원 회차에 40만원 + 20만원 + 20만원으로 나눠 받았어요"
              a={<>운영 현황 → 계약 더블클릭 → 수납내역 탭 → 해당 회차의 <Chip>+ 입금</Chip> 버튼 → 입금일/금액/메모 입력 → 저장. 3번 반복하면 회차 완료로 자동 변경</>}
            />
            <Workflow
              q="다음 달 분을 미리 받았어요 (선납)"
              a={<>완료된 회차 행에서 <Chip>+ 선납</Chip> 버튼 → 금액 입력. 회차 초과분은 다음 회차로 자동 흘러감</>}
            />
            <Workflow
              q="자가조치로 10만원 할인해줬어요"
              a={<>해당 회차 <Chip color="red">+ 할인</Chip> 버튼 → 사유 선택(자가조치/보상/사은품/캠페인/기타) + 금액 입력. 청구금액에서 차감됨</>}
            />
            <Workflow
              q="이 회차는 미수에서 빼고 싶어요 (면제)"
              a={<>해당 회차 <Chip>면제</Chip> 버튼 → 회차 자체가 미수 집계에서 제외</>}
            />
            <Workflow
              q="은행 엑셀 올렸는데 어느 계약 입금인지 모르겠어요"
              a={<>계좌 관리 → <Chip color="blue">자동매칭</Chip> 버튼이 이름+금액 일치하는 회차에 자동 연결. 매칭 안 된 거래는 클릭해서 수동 매칭</>}
            />
            <Workflow
              q="차량은 있는데 손님이 아직 없어요 (휴차)"
              a={<>운영 현황 업로드 엑셀에서 차량번호만 채우고 계약자 빈칸. → 자동으로 휴차 차량으로 등록됨</>}
            />
            <Workflow
              q="손님은 있는데 차량이 아직 미정이에요"
              a={<>운영 현황 업로드 엑셀에서 계약자만 채우고 차량번호 빈칸. → 자동으로 구매대기 계약으로 등록</>}
            />
            <Workflow
              q="계약 인도하려고 합니다"
              a={<>계약 더블클릭 → 차량상태 탭 → <Chip color="blue">인도</Chip> 버튼 → 인도일 입력. 차량상태=운행으로 변경</>}
            />
            <Workflow
              q="계약 종료 / 반납"
              a={<>차량상태 탭 → <Chip>반납</Chip> 버튼 → 반납일/거리/메모. 남은 회차는 자동 면제 옵션</>}
            />
          </Section>

          {/* 4. 엑셀 업로드 안내 */}
          <Section icon={<FileXls weight="bold" />} title="엑셀 업로드 안내">
            <SubSection title="이력 일괄 업로드 (개발도구 → 이력 업로드) — 관리자 전용">
              <div style={{ padding: 10, background: 'var(--blue-bg)', borderRadius: 4, fontSize: 12, marginBottom: 8, lineHeight: 1.6 }}>
                <strong>2개 양식</strong>으로 차량·계약·휴차·미수·과거이력·결제이력 전부 입력. horizontal 형식 (우측으로 갈수록 직전 이력).
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>1️⃣ 계약이력.xlsx — 차량/계약 마스터</div>
              <ul style={{ margin: '0 0 12px 0', paddingLeft: 18, lineHeight: 1.7, fontSize: 12 }}>
                <li>1행 = 1차량. 한 차량의 모든 정보 (현재 계약 + 직전 계약 + 휴차 여부)</li>
                <li><strong>좌측 5칸 (고정)</strong>: 차량번호 · 회사 · 차종 · 차량상태 · 현재미수</li>
                <li><strong>우측 블록 10칸 × 5회 반복</strong>: 구분/고객명/연락처/인도일/종료일/반납일/대여료/보증금/결제일/영업자</li>
                <li>블록 1번 = 현재 계약자, 2~5번 = 직전 계약자 (시간 역순)</li>
                <li>모든 블록 비우면 → 휴차 차량으로 자동 등록</li>
                <li><strong>현재미수 N원</strong> 입력 → 직전 회차부터 역순으로 자동 미납/부분납 분배</li>
                <li>현재미수 0 + 수납이력 안 올림 → <strong>오늘 날짜로 마지막 입금일 자동 셋팅</strong> (이전 회차 자동 완료)</li>
              </ul>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>2️⃣ 수납이력.xlsx — 결제 이력</div>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 12 }}>
                <li>1행 = 1계약(차량+등록번호). 같은 차량이라도 계약자별로 따로</li>
                <li><strong>좌측 2칸</strong>: 차량번호 · 계약자등록번호</li>
                <li><strong>우측 블록 5칸 × 20회</strong>: 청구금액/결제금액/결제일자/결제수단/미납금액</li>
                <li>차량+등록번호로 자동 매칭 → 가장 가까운 회차에 입금 push</li>
                <li>등록번호 없는 계약은 첫 결제 매칭 시 자동 백필</li>
                <li>결제일자가 비어있는 블록은 무시 (블록 누락 OK)</li>
              </ul>
            </SubSection>
            <SubSection title="개별 등록 (운영현황 → +신규)">
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 12 }}>
                <li>일상 운영: 차량 1대·계약 1건 추가는 운영현황 → +신규</li>
                <li>날짜 형식 자유: <span className="mono">2026-05-01 / 26.5.1 / 260501 / 엑셀 날짜 셀</span></li>
                <li>등록번호 자릿수로 개인(13)/사업자(10)/법인(12) 자동 구분</li>
              </ul>
            </SubSection>
            <SubSection title="은행 엑셀 (계좌 관리)">
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 12 }}>
                <li>은행에서 다운받은 엑셀 <strong>그대로</strong> 올리면 됨 (별도 가공 불필요)</li>
                <li>지원: KB · 우리 · 신한 · 하나 · 농협 · IBK · SC제일 · 카카오 · 토스 · 케이뱅크 · 새마을금고 · 우체국 · 수협 · 부산 · 대구 · 광주 · 전북 · 경남 · 제주 · 씨티</li>
                <li>파일명에 은행이름 있으면 자동 인식</li>
              </ul>
            </SubSection>
          </Section>

          {/* 5. 미수관리 */}
          <Section icon={<Warning weight="bold" />} title="미수관리 (전문 화면)">
            <div style={{ padding: 10, background: 'var(--red-bg)', color: 'var(--text-main)', borderRadius: 4, fontSize: 12, marginBottom: 8, lineHeight: 1.6 }}>
              사이드바 <strong>미수관리</strong> 메뉴 — 미수 있는 계약만 전문적으로 다루는 화면. 운영현황과는 별도.
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 12 }}>
              <li><strong>4개 필터 탭</strong>: 연체중 · 부분납 · 시동제어 · 채권화 — 각 카운트 뱃지로 한눈에</li>
              <li>표 컬럼: 차량/계약자/연락처/<strong>미수금</strong>/미납회차/<strong>경과일</strong>/마지막연락/시동제어/액션</li>
              <li>경과일 색상: 30일 이하(검정) · 31~60일(주황) · 60일 초과(빨강)</li>
              <li><strong>시동제어 ON/OFF</strong> 토글 — ON 시 사유 입력. 차량 원격 시동 차단 표시</li>
              <li><strong>연락기록</strong> 버튼 → 다이얼로그 (연락일/방법/고객반응/다음 약속일/비고) → 자동 저장</li>
              <li>마지막 연락일은 표에 자동 표시 — 누가 언제 통화했는지 추적</li>
            </ul>
          </Section>

          {/* 5. OCR */}
          <Section icon={<Camera weight="bold" />} title="OCR (사진 → 자동 입력)">
            <Row icon={<Buildings size={14} />} title="사업자등록증">
              법인 관리 → 신규 법인 → 등록증 이미지 업로드. 회사명·대표자·법인번호·업태·종목 자동 채움
            </Row>
            <Row icon={<ClipboardText size={14} />} title="면허증">
              계약 상세 → 면허번호 + RIMS 검증 (정상/정지/만료/취소 자동 조회)
            </Row>
            <Row icon={<Warning size={14} />} title="과태료 / 단속 통지서">
              과태료 업무에서 통지서 이미지 업로드 → 위반항목·금액·기한 자동 추출
            </Row>
          </Section>

          {/* 6. 주의 */}
          <Section icon={<Warning weight="bold" />} title="주의사항">
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, color: 'var(--text-main)' }}>
              <li><strong>모든 변경 = 감사로그 기록</strong> (누가 / 언제 / 무엇)</li>
              <li><strong>삭제는 마스터 관리자만</strong> 가능 (체크박스 선택 후 일괄 삭제)</li>
              <li><strong>운영현황 업로드</strong>는 차량번호 기준 UPSERT — 같은 번호 있으면 갱신, 없으면 신규</li>
              <li>은행 거래내역 매칭 해제하면 회차 상태도 자동 복원됨</li>
              <li>면허번호는 검증되면 RIMS 응답이 캐시에 저장됨 (재조회 가능)</li>
              <li>휴대폰 브라우저에서도 그대로 사용 가능</li>
            </ul>
          </Section>

          {/* 7. 문의 */}
          <Section icon={<Phone weight="bold" />} title="문의·오류 신고">
            <div style={{ padding: '14px 16px', background: 'var(--bg-sunken)', borderRadius: 6, fontSize: 13, lineHeight: 1.7 }}>
              사용 중 막히는 부분 있으면 <strong>화면 캡쳐 + 어떤 작업하다 막혔는지</strong> 같이 보내주세요.
              <br />
              관리자: <span className="mono">dudguq@gmail.com</span> · <span className="mono">jpkpyh@gmail.com</span>
            </div>
          </Section>

        </div>
      </div>
    </div>
  );
}

/* ────────── helper components ────────── */

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="detail-section">
      <div className="detail-section-header">
        <span className="icon">{icon}</span>
        <span className="title" style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
      </div>
      <div className="detail-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-main)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>{children}</div>
    </div>
  );
}

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border-faint, var(--border))' }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%', background: 'var(--brand)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0,
      }}>{n}</div>
      <div style={{ color: 'var(--text-sub)', flexShrink: 0, paddingTop: 4 }}>{icon}</div>
      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.6, color: 'var(--text-main)' }}>{children}</div>
    </div>
  );
}

function Row({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0' }}>
      <div style={{ color: 'var(--text-sub)', flexShrink: 0, paddingTop: 2 }}>{icon}</div>
      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--text-main)' }}>{title}</strong>
        <span style={{ color: 'var(--text-sub)', marginLeft: 8 }}>{children}</span>
      </div>
    </div>
  );
}

function Workflow({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border-faint, var(--border))' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)', marginBottom: 6 }}>
        <Question size={12} weight="bold" style={{ color: 'var(--brand)', marginRight: 6, verticalAlign: 'middle' }} />
        {q}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.6, paddingLeft: 20 }}>
        → {a}
      </div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: 'var(--text-weak)', marginTop: 4, fontStyle: 'italic' }}>
      ↳ {children}
    </div>
  );
}

function Chip({ children, color = 'gray' }: { children: React.ReactNode; color?: 'gray' | 'red' | 'blue' }) {
  const colors = {
    gray: { bg: 'var(--bg-sunken)', text: 'var(--text-main)' },
    red: { bg: 'var(--red-bg)', text: 'var(--red-text)' },
    blue: { bg: 'var(--brand-bg)', text: 'var(--brand)' },
  };
  const c = colors[color];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 8px',
      background: c.bg, color: c.text, borderRadius: 4, fontSize: 11, fontWeight: 600, margin: '0 2px',
    }}>{children}</span>
  );
}
