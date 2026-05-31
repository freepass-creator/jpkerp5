'use client';

import {
  BookOpen, Buildings, House, CurrencyKrw, Warning, FileXls, Camera, MagnifyingGlass,
  CheckCircle, ArrowRight, Question, Plus, ChartBar, ClipboardText, Phone, Sparkle,
  Car, Users, Crown, ShieldStar, Gear, Wrench, Receipt, ShieldCheck,
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
          <div className="topbar-title">
            <BookOpen size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>사용 안내</span>
          </div>
        </header>

        {/* 스크롤 가능한 본문 영역 */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <div style={{ padding: '20px 28px 80px', maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

            {/* 개요 */}
            <header className="page-header">
              <div className="page-header-title-group">
                <h1 className="page-header-title">
                  <BookOpen size={18} weight="duotone" />
                  렌터카매니저 — 사용 안내
                </h1>
                <div className="page-header-title-sub">
                  렌탈 운영 ERP · 직원 가이드 · 처음 쓰시면 위에서 아래로 한 번 훑어보세요
                </div>
              </div>
              <div className="page-header-actions">
                <button className="btn btn-primary" type="button" onClick={restartTour} title="환영 튜토리얼 다시 보기">
                  <Sparkle weight="duotone" /> 튜토리얼 다시 보기
                </button>
              </div>
            </header>

            {/* 목차 — 빠른 점프 */}
            <Section icon={<MagnifyingGlass weight="bold" />} title="목차">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, fontSize: 12 }}>
                <a href="#start" className="help-link">1. 처음 시작 4단계</a>
                <a href="#screens" className="help-link">2. 화면별 안내</a>
                <a href="#vehicle" className="help-link">3. 차량 등록 (5단 분류)</a>
                <a href="#contract" className="help-link">4. 계약 생성 흐름</a>
                <a href="#payment" className="help-link">5. 계좌·수납 관리</a>
                <a href="#risk" className="help-link">6. 리스크 관리 (미수)</a>
                <a href="#upload" className="help-link">7. 엑셀 일괄 업로드</a>
                <a href="#ocr" className="help-link">8. OCR (사진 자동입력)</a>
                <a href="#roles" className="help-link">9. 권한 시스템</a>
                <a href="#tips" className="help-link">10. 자주 쓰는 작업</a>
                <a href="#notes" className="help-link">11. 주의사항</a>
                <a href="#contact" className="help-link">12. 문의·오류 신고</a>
              </div>
            </Section>

            {/* 1. 시작 순서 */}
            <Section icon={<ArrowRight weight="bold" />} title="1. 처음 시작 4단계" id="start">
              <div style={{ fontSize: 12, color: 'var(--text-weak)', marginBottom: 6, lineHeight: 1.6 }}>
                새 회사에서 처음 운영현황 시스템을 켤 때 한 번만 따라하면 되는 순서입니다.
                기존 데이터가 있으면 1·2단계 후 한 번에 엑셀 업로드가 가장 빠릅니다.
              </div>
              <Step n={1} icon={<Buildings size={14} />}>
                <strong>법인 등록</strong> — 설정 → 법인관리 → <Chip color="blue">+ 신규 법인</Chip>
                <Hint>사업자등록증 이미지/PDF 올리면 OCR로 회사명·대표자·법인번호·업태·종목 자동 채움.
                      차고지·주차장 주소도 등록증과 분리해 따로 기록 가능</Hint>
              </Step>
              <Step n={2} icon={<Users size={14} />}>
                <strong>직원 계정 만들기</strong> — 직원이 직접 가입 → 마스터가 설정 → 직원관리에서 권한 부여
                <Hint>가입 시 기본은 <strong>일반 직원</strong>. 마스터가 ↑버튼 누르면 <strong>관리자</strong>로 승급되어 직원관리·개발도구 접근 가능</Hint>
              </Step>
              <Step n={3} icon={<House size={14} />}>
                <strong>차량·계약 일괄 업로드</strong> — 운영현황 → <Chip color="blue">+ 신규 등록</Chip> → <strong>운영 현황 업로드</strong> 탭 → 엑셀 드래그
                <Hint>한 번의 업로드로 차량 + 계약 + 회차 + 현재 미수까지 자동 생성.
                      템플릿 다운로드 → 채워서 다시 업로드 흐름</Hint>
              </Step>
              <Step n={4} icon={<CurrencyKrw size={14} />}>
                <strong>입금 흐름 시작</strong> — 계좌관리 → +신규 → <strong>수납 등록</strong> → 은행 엑셀 그대로 업로드 → 자동매칭
                <Hint>은행 거래내역을 매일 업로드하면 회차별 입금이 자동 매칭되고 운영현황에 즉시 반영</Hint>
              </Step>
            </Section>

            {/* 2. 화면 안내 */}
            <Section icon={<ChartBar weight="bold" />} title="2. 화면별 안내" id="screens">
              <Row icon={<ChartBar size={14} />} title="대시보드">
                오늘의 KPI · 신규 인도 · 반납 예정 · 미수 현황 한눈에. 회사별·차량 상태별 필터.
                각 카드 클릭 시 해당 운영현황 필터로 이동
              </Row>
              <Row icon={<House size={14} />} title="운영 현황 (메인)">
                전체 차량·계약 리스트. 필터(전체·계약중·휴차)에 회사별 칩 필터 + 회사별 차량 댓수 자동 카운트.
                행 더블클릭 = 상세 다이얼로그 (계약자/차량/회차/수납/감사 5탭).
                우클릭 = 컨텍스트 메뉴 (인도/반납/스케줄 재생성/계약서 발행/연락기록/삭제)
              </Row>
              <Row icon={<Warning size={14} />} title="리스크 관리">
                <strong>운영현황에서 떨어진 계약</strong>만 분리해서 관리.
                좌측 그룹 <Chip>미납중</Chip><Chip>시동제어</Chip><Chip>검사지연</Chip><Chip>기타</Chip>,
                우측 그룹 <Chip color="red">종료</Chip><Chip color="red">매각</Chip>.
                연락기록·내용증명·채권화 전이 모두 여기서
              </Row>
              <Row icon={<CurrencyKrw size={14} />} title="계좌 관리 (5탭)">
                <Chip>계좌내역</Chip><Chip>자금일보</Chip><Chip>수납내역</Chip><Chip>지출내역</Chip><Chip>카드매출</Chip> —
                같은 거래내역을 5가지 시각으로 본다. 자금일보는 일자별 입출금 집계
              </Row>
              <Row icon={<Receipt size={14} />} title="과태료 업무">
                통지서 OCR → 위반항목·금액·기한 자동 추출 → 처리 워크플로우 (회사 부담/임차인 부담/미납 추적)
              </Row>
              <Row icon={<Gear size={14} />} title="설정">
                개인 (화면·계정) / 조직 (직원·법인) / 도움 (사용안내) / 운영 (admin 일일작업). 모든 관리 메뉴 진입점
              </Row>
              <Row icon={<Wrench size={14} />} title="개발도구 (관리자 전용)">
                계정관리 · 이력 업로드 · 감사로그 · 진단·wipe (위험)
              </Row>
            </Section>

            {/* 3. 차량 등록 5단 */}
            <Section icon={<Car weight="bold" />} title="3. 차량 등록 — 5단 분류" id="vehicle">
              <div style={{ padding: 10, background: 'var(--blue-bg)', borderRadius: 4, fontSize: 12, marginBottom: 8, lineHeight: 1.6 }}>
                차종은 <strong>5단계로 분리</strong>해서 입력합니다. 제조사·모델은 dropdown으로 자동완성, 나머지는 자유 입력.
                나중에 분류·통계·검색에 활용됩니다.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: '6px 12px', fontSize: 12, lineHeight: 1.7 }}>
                <span style={{ fontWeight: 700, color: 'var(--brand)' }}>① 제조사</span>
                <span>dropdown — <span className="mono">현대 / 기아 / 제네시스 / 쉐보레 / KGM / BMW / 벤츠 / 아우디 …</span> (23종)</span>
                <span style={{ fontWeight: 700, color: 'var(--brand)' }}>② 모델</span>
                <span>dropdown — 제조사 선택 시 그 제조사 모델만 자동완성 (예: 현대 → 아반떼·그랜저·캐스퍼·아이오닉 5 …)</span>
                <span style={{ fontWeight: 700, color: 'var(--brand)' }}>③ 세부모델</span>
                <span>입력 — <span className="mono">예: 더 뉴 그랜저 GN7</span> (chassis 코드 + 페이스리프트)</span>
                <span style={{ fontWeight: 700, color: 'var(--brand)' }}>④ 모델구분</span>
                <span>입력 — <span className="mono">예: 가솔린 3.5 AWD</span> (연료·엔진·구동방식·인승)</span>
                <span style={{ fontWeight: 700, color: 'var(--brand)' }}>⑤ 트림</span>
                <span>입력 — <span className="mono">예: 캘리그래피</span> (인스퍼레이션·익스클루시브·N 라인 등 그레이드)</span>
              </div>
              <div style={{ marginTop: 10, padding: 10, background: 'var(--bg-sunken)', borderRadius: 4, fontSize: 12 }}>
                <strong>저장 시 풀네임 자동 결합:</strong>
                <div className="mono" style={{ marginTop: 4 }}>현대 그랜저 더 뉴 그랜저 GN7 가솔린 3.5 AWD 캘리그래피</div>
              </div>
              <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-main)', fontWeight: 600 }}>차량 등록 폼 — 4섹션 구조:</div>
              <ul style={{ margin: '4px 0 0 0', paddingLeft: 18, lineHeight: 1.7, fontSize: 12 }}>
                <li><strong>필수 정보</strong> — 회사·차량상태·제조사·모델·차량번호 (구매대기면 미정 가능)</li>
                <li><strong>제조사 스펙</strong> — 세부모델·모델구분·트림·선택옵션·외부색·내부색</li>
                <li><strong>자동차등록증 정보</strong> — 차대번호·제작연월일·최초등록일·사용연료·배기량·승차정원·사용본거지·소유자명</li>
                <li><strong>매입 정보</strong> — 매입일·매입가·보험연령·비고</li>
              </ul>
            </Section>

            {/* 4. 계약 생성 */}
            <Section icon={<ClipboardText weight="bold" />} title="4. 계약 생성 흐름" id="contract">
              <Row icon={<MagnifyingGlass size={14} />} title="차량번호 자동 조회 (UPSERT)">
                계약 생성 폼에서 차량번호를 입력하면 즉시 기존 차량 검색.
                <ul style={{ margin: '6px 0 0 0', paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}>
                  <li><strong>매칭됨</strong> ✅ → 5단·옵션·색상 자동 채움 + 잠금. 차량 정보는 차량 상세 페이지에서만 수정</li>
                  <li><strong>미매칭</strong> ⚠️ → 5단 입력 → 저장 시 차량도 자동 신규 등록 + 계약 생성</li>
                  <li><strong>차량번호 미정</strong> ⓘ → 신차 구매 예정 — 계약만 먼저 생성, 차량은 입고 시 별도 등록</li>
                </ul>
              </Row>
              <Row icon={<Phone size={14} />} title="계약자 정보">
                고객명·연락처·등록번호 · 면허번호 (RIMS 검증) · 운전자 (법인 계약 시) · 면허종별
              </Row>
              <Row icon={<CurrencyKrw size={14} />} title="기간·금액">
                계약일·반납예정일 (= 약정개월 자동 계산) · 월 대여료 · 보증금 · 결제일 · 결제방법
              </Row>
              <Row icon={<CheckCircle size={14} />} title="자동 처리">
                저장 시: 차량 신규/매칭 → 계약 코드 발급 (<span className="mono">ICR-YYMM-XXXX</span>) → 회차 N개 자동 생성 → 운영현황 즉시 반영
              </Row>
            </Section>

            {/* 5. 계좌·수납 */}
            <Section icon={<CurrencyKrw weight="bold" />} title="5. 계좌·수납 관리" id="payment">
              <SubSection title="자동매칭 우선순위">
                <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 12 }}>
                  <li>입금자명 = 계약자명 AND 금액 = 회차금액 AND 결제일 ±14일</li>
                  <li>금액 = 회차금액 AND 결제일 ±7일 (입금자 다른 경우 — 부모/배우자 등)</li>
                  <li>카드: 승인번호 또는 카드 뒷 4자리 동일 패턴</li>
                </ol>
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-weak)' }}>
                  · 단일 후보 → 자동 확정 / 다중 후보 → 사용자가 선택 / 무후보 → "미매칭" 영역으로
                </div>
              </SubSection>
              <SubSection title="수동 처리">
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 12 }}>
                  <li><Chip>+ 입금</Chip> — 회차에 입금 한 건 추가 (일부 입금 / 분할 입금 / 선납)</li>
                  <li><Chip color="red">+ 할인</Chip> — 사유 선택(자가조치·보상·사은품·캠페인·기타) + 금액. 청구금액에서 차감</li>
                  <li><Chip>면제</Chip> — 회차 자체를 미수 집계에서 제외</li>
                  <li><Chip color="blue">매칭 해제</Chip> — 잘못 매칭된 입금 해제. 회차 상태 자동 복원</li>
                </ul>
              </SubSection>
              <SubSection title="지출 등록">
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 12 }}>
                  <li>계좌관리 → +신규 → <strong>지출 등록</strong> 탭</li>
                  <li>계정과목 선택 (차량유지비·인건비·통신비·세금·임대료·잡비 등)</li>
                  <li>bank_tx의 <span className="mono">withdraw</span> 필드로 push → 자금일보에 자동 노출</li>
                </ul>
              </SubSection>
            </Section>

            {/* 6. 리스크 관리 */}
            <Section icon={<Warning weight="bold" />} title="6. 리스크 관리 (미수)" id="risk">
              <div style={{ padding: 10, background: 'var(--red-bg)', color: 'var(--text-main)', borderRadius: 4, fontSize: 12, marginBottom: 8, lineHeight: 1.6 }}>
                사이드바 → 리스크 관리. 운영현황에서 떨어진 <strong>위반·종료·매각 계약</strong>을 전문적으로 다루는 화면.
              </div>
              <Row icon={<Warning size={14} />} title="진행중 그룹">
                <Chip>미납중</Chip> 연체 + 부분납 / <Chip>시동제어</Chip> 원격 시동 차단 활성 /
                <Chip>검사지연</Chip> 차량검사 만료 임박 / <Chip>기타</Chip>
              </Row>
              <Row icon={<CheckCircle size={14} />} title="종결 그룹">
                <Chip color="red">종료</Chip> 정상 반납·해지 / <Chip color="red">매각</Chip> 사고·노후 매각
              </Row>
              <Row icon={<ClipboardText size={14} />} title="컬럼 표시">
                회사 · 차량상태 · 차량번호 · 계약자 · 연락처 · <strong>미수금</strong> · 미납회차 · <strong>경과일</strong>(30↓검정·31~60주황·60↑빨강) ·
                마지막연락 · 시동제어 · 채권 · 액션 · 비고
              </Row>
              <Row icon={<Phone size={14} />} title="액션 버튼">
                <Chip>시동제어 토글</Chip> 사유 입력 후 차단 / <Chip>채권화 토글</Chip> 종결 그룹으로 전이 /
                <Chip>연락기록</Chip> 다이얼로그 (방법·반응·다음약속·비고) / <Chip color="red">내용증명</Chip> 최고서 자동 발행 → 위약금 자동 계산
              </Row>
            </Section>

            {/* 7. 업로드 */}
            <Section icon={<FileXls weight="bold" />} title="7. 엑셀 일괄 업로드" id="upload">
              <SubSection title="운영현황 업로드 (운영현황 → +신규)">
                <div style={{ padding: 10, background: 'var(--blue-bg)', borderRadius: 4, fontSize: 12, marginBottom: 8, lineHeight: 1.6 }}>
                  <strong>가장 빠른 초기 세팅 방법</strong>. 템플릿 다운로드 → 채움 → 업로드 → 행별 검증·중복 체크 → 적용.
                  차량 + 계약 + 회차 + 미수 한 번에 생성.
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>필수 컬럼 (별표):</div>
                <ul style={{ margin: '0 0 8px 0', paddingLeft: 18, lineHeight: 1.7, fontSize: 12 }}>
                  <li><strong>법인등록번호*</strong> — 회사 마스터와 자동 매칭 (미등록은 입력값 그대로)</li>
                  <li><strong>계약시작일*</strong>·<strong>계약종료일*</strong> — <span className="mono">2026-01-01 / 26.1.1 / 260101 / 엑셀 날짜</span> 모두 OK</li>
                </ul>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>자동 처리:</div>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 12 }}>
                  <li>차량번호 UPSERT — 같은 번호 있으면 갱신, 없으면 신규</li>
                  <li>차량번호 비고 계약자만 있으면 → <strong>구매대기 계약</strong></li>
                  <li>계약자 비고 차량번호만 있으면 → <strong>휴차 차량</strong></li>
                  <li>등록번호 자릿수로 개인(13)/사업자(10)/법인(13시작 1xxxxx) 자동 구분</li>
                  <li>차량상태: <Chip>계약중</Chip><Chip>휴차중</Chip> 또는 자동 (계약자 있으면 운행)</li>
                  <li>현재미수 N원 입력 시 마지막입금일 이후 회차에 역순 분배</li>
                </ul>
              </SubSection>
              <SubSection title="은행 엑셀 (계좌관리 → 수납 → 엑셀 일괄)">
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 12 }}>
                  <li>은행에서 다운받은 엑셀 <strong>그대로</strong> 업로드 (가공 불필요)</li>
                  <li>지원: KB · 우리 · 신한 · 하나 · 농협 · IBK · SC제일 · 카카오 · 토스 · 케이뱅크 · 새마을금고 · 우체국 · 수협 · 부산 · 대구 · 광주 · 전북 · 경남 · 제주 · 씨티</li>
                  <li>파일명에 은행이름 있으면 자동 인식</li>
                </ul>
              </SubSection>
              <SubSection title="이력 일괄 업로드 (개발도구 → 이력 업로드, 관리자 전용)">
                <div style={{ padding: 10, background: 'var(--bg-sunken)', borderRadius: 4, fontSize: 12, marginBottom: 8, lineHeight: 1.6 }}>
                  과거 데이터 마이그레이션용. <strong>horizontal 형식</strong> (1행 = 1차량/계약, 우측으로 갈수록 직전 이력).
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 12 }}>
                  <li><strong>계약이력.xlsx</strong> — 좌측 5칸 (차량번호·회사·차종·차량상태·현재미수) + 우측 10칸 × 5회 반복 (계약자별 정보)</li>
                  <li><strong>수납이력.xlsx</strong> — 좌측 2칸 (차량번호·계약자등록번호) + 우측 5칸 × 20회 반복 (회차별 결제)</li>
                </ul>
              </SubSection>
            </Section>

            {/* 8. OCR */}
            <Section icon={<Camera weight="bold" />} title="8. OCR — 사진 자동 입력" id="ocr">
              <Row icon={<Buildings size={14} />} title="사업자등록증">
                법인관리 → 신규 → 등록증 이미지/PDF 업로드 → 회사명·대표자·법인번호·업태·종목·주소 자동 채움
              </Row>
              <Row icon={<ClipboardText size={14} />} title="운전면허증 + RIMS 검증">
                계약 상세 → 면허번호 + 종별 입력 → RIMS API 자동 조회 → 정상/정지/취소/만료 상태 즉시 표시.
                <Hint>응답은 캐시에 저장되어 재조회 가능. 면허 만료 임박 시 리스크관리에 자동 노출</Hint>
              </Row>
              <Row icon={<Receipt size={14} />} title="과태료 / 단속 통지서">
                과태료업무에서 통지서 이미지 업로드 → 위반항목·금액·기한 자동 추출
              </Row>
              <Row icon={<Car size={14} />} title="계약서 PDF (다중 파일)">
                운영현황 → +신규 → 계약 생성 → OCR 탭 → 계약서 PDF 여러 개 한 번에 → 차량·회사 자동 매칭 + 계약 생성
              </Row>
            </Section>

            {/* 9. 권한 */}
            <Section icon={<ShieldCheck weight="bold" />} title="9. 권한 시스템" id="roles">
              <div style={{ padding: 10, background: 'var(--bg-sunken)', borderRadius: 4, fontSize: 12, marginBottom: 8, lineHeight: 1.6 }}>
                3단계 권한 구조. 가입은 누구나, 권한 부여는 마스터만.
              </div>
              <Row icon={<Crown size={14} />} title="마스터 (master)">
                <Chip color="red">최상위</Chip> 코드 화이트리스트 (SUPER_ADMIN_EMAILS). 다른 직원에게 관리자 권한 부여/박탈 가능.
                마스터 자신의 권한은 코드 변경 후에만 수정 가능
              </Row>
              <Row icon={<ShieldStar size={14} />} title="관리자 (admin)">
                <Chip color="blue">중간</Chip> 마스터가 부여한 직원. 직원관리·개발도구·법인관리·이력업로드 접근 가능.
                다만 다른 직원 권한 변경은 마스터만
              </Row>
              <Row icon={<Users size={14} />} title="일반 직원 (staff)">
                기본값. 운영현황·리스크관리·계좌관리·과태료·설정(개인) 접근. 관리 메뉴는 자동 숨김
              </Row>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-weak)' }}>
                권한 토글: <strong>설정 → 직원관리 → ↑(승급) / ↓(강등) 버튼</strong> — 마스터에게만 보임
              </div>
            </Section>

            {/* 10. 자주 쓰는 작업 */}
            <Section icon={<Question weight="bold" />} title="10. 자주 쓰는 작업" id="tips">
              <Workflow
                q="80만원 회차에 40 + 20 + 20으로 나눠 받았어요"
                a={<>운영현황 → 계약 더블클릭 → <strong>수납내역</strong> 탭 → 해당 회차의 <Chip>+ 입금</Chip> → 입금일·금액·메모 → 저장. 3번 반복하면 회차 자동 완료</>}
              />
              <Workflow
                q="다음 달 분을 미리 받았어요 (선납)"
                a={<>완료된 회차 행 → <Chip>+ 선납</Chip> → 금액 입력. 회차 초과분은 다음 회차로 자동 흘러감</>}
              />
              <Workflow
                q="자가조치로 10만원 할인해줬어요"
                a={<>회차 행 → <Chip color="red">+ 할인</Chip> → 사유 (자가조치/보상/사은품/캠페인/기타) + 금액. 청구금액 자동 차감 + 감사로그 기록</>}
              />
              <Workflow
                q="은행 엑셀 올렸는데 어느 계약 입금인지 모르겠어요"
                a={<>계좌관리 → <Chip color="blue">자동매칭</Chip> 버튼이 이름·금액 일치하는 회차에 자동 연결.
                     매칭 안 된 거래는 클릭 → 수동으로 계약 검색해서 연결</>}
              />
              <Workflow
                q="차량은 있는데 손님이 아직 없어요"
                a={<>운영현황 업로드 엑셀에서 <strong>차량번호만</strong> 채우고 계약자 빈칸 → 자동으로 <Chip>휴차 차량</Chip>으로 등록</>}
              />
              <Workflow
                q="손님은 있는데 차량이 아직 미정이에요"
                a={<>운영현황 업로드 엑셀에서 <strong>계약자만</strong> 채우고 차량번호 빈칸 → 자동으로 <Chip>구매대기 계약</Chip>으로 등록.
                     나중에 차량 입고되면 차량번호 매칭으로 자동 연결</>}
              />
              <Workflow
                q="계약 인도 / 차량 운행 시작"
                a={<>계약 더블클릭 → <strong>차량상태</strong> 탭 → <Chip color="blue">인도</Chip> → 인도일 입력. 차량상태=<Chip>운행</Chip>으로 변경 + 첫 회차 청구일 자동 조정</>}
              />
              <Workflow
                q="계약 종료 / 반납 처리"
                a={<>차량상태 탭 → <Chip>반납</Chip> → 반납일·주행거리·메모. 남은 회차는 자동 면제 옵션 제시</>}
              />
              <Workflow
                q="10일째 연체 — 시동제어 + 채권화"
                a={<>리스크관리 → 미납중 행 → <Chip color="red">시동제어</Chip> ON → 사유 입력 → 자동 발송 SMS (선택).
                     이후 <Chip color="red">채권</Chip> 토글 → 종결 그룹으로 전이 + 내용증명 발행</>}
              />
              <Workflow
                q="회사 마스터에 새 법인 추가"
                a={<>설정 → 법인관리 → +신규 → 사업자등록증 이미지 업로드 → OCR로 자동 채움 → 저장. 운영현황 회사 칩 필터에 즉시 추가됨</>}
              />
              <Workflow
                q="직원 1명에게 관리자 권한 부여"
                a={<>설정 → 직원관리 → 해당 직원 행에서 <Chip color="blue">↑</Chip> 버튼 (마스터만 보임) → 확인. 그 직원이 다음 새로고침 시 관리 메뉴가 자동 노출</>}
              />
            </Section>

            {/* 11. 주의사항 */}
            <Section icon={<Warning weight="bold" />} title="11. 주의사항" id="notes">
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, color: 'var(--text-main)', fontSize: 13 }}>
                <li><strong>모든 변경 = 감사로그 자동 기록</strong> (누가 / 언제 / 무엇 / before·after) — 개발도구 → 감사로그에서 추적</li>
                <li><strong>삭제는 체크박스 + 확인 다이얼로그</strong> 필수. 일괄 삭제는 마스터만 가능</li>
                <li><strong>운영현황 업로드는 UPSERT</strong> — 같은 차량번호 있으면 갱신, 없으면 신규. 실수해도 다시 올리면 됨</li>
                <li>은행 거래내역 <strong>매칭 해제하면 회차 상태도 자동 복원</strong> — 잘못 매칭해도 안전</li>
                <li>면허번호는 RIMS 검증 후 응답이 캐시에 저장됨 — 재조회 시 빠르게 표시</li>
                <li><strong>휴대폰 브라우저</strong>에서도 그대로 사용 가능 (반응형 디자인)</li>
                <li>같은 회사 안에서 작업 중인 직원이 여러 명이어도 RTDB 실시간 동기화로 충돌 없음</li>
              </ul>
            </Section>

            {/* 12. 문의 */}
            <Section icon={<Phone weight="bold" />} title="12. 문의 · 오류 신고" id="contact">
              <div style={{ padding: '14px 16px', background: 'var(--bg-sunken)', borderRadius: 6, fontSize: 13, lineHeight: 1.7 }}>
                사용 중 막히면 <strong>화면 캡쳐 + 어떤 작업 중이었는지</strong>를 같이 보내주세요. 빠르게 조치합니다.
                <br />
                <br />
                관리자: <span className="mono">dudguq@gmail.com</span> · <span className="mono">jpkpyh@gmail.com</span>
              </div>
            </Section>

          </div>
        </div>
      </div>

      <style jsx>{`
        .help-link {
          padding: 6px 10px;
          background: var(--bg-sunken);
          border-radius: 4px;
          color: var(--text-main);
          text-decoration: none;
          font-weight: 500;
          transition: background 0.1s;
        }
        .help-link:hover {
          background: var(--brand-bg);
          color: var(--brand);
        }
      `}</style>
    </div>
  );
}

/* ────────── helper components ────────── */

function Section({ icon, title, id, children }: { icon: React.ReactNode; title: string; id?: string; children: React.ReactNode }) {
  return (
    <section className="detail-section" id={id} style={{ scrollMarginTop: 20 }}>
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
        <div style={{ color: 'var(--text-sub)', marginTop: 4 }}>{children}</div>
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
