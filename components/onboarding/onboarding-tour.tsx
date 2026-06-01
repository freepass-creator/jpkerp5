'use client';

import { useEffect, useState } from 'react';
import {
  Buildings, House, CurrencyKrw, CheckCircle, BookOpen, X, CaretLeft, CaretRight, FileXls, Camera, Sparkle,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/use-auth';
import Link from 'next/link';

const STORAGE_PREFIX = 'jpkerp5_onboarding_done_';

type Step = {
  icon: React.ReactNode;
  title: string;
  desc: string;
  detail?: React.ReactNode;
};

const STEPS: Step[] = [
  {
    icon: <Sparkle size={48} weight="duotone" />,
    title: 'jpkerp5에 오신 것을 환영합니다',
    desc: '차량 렌탈 ERP — 차량·계약·수납을 한 곳에서 관리',
    detail: (
      <div style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
        몇 분만 따라오시면 시작할 수 있어요. <br />
        총 5단계 — <strong>다음</strong> 버튼으로 진행하세요.
      </div>
    ),
  },
  {
    icon: <Buildings size={48} weight="duotone" />,
    title: '1단계 · 법인 등록',
    desc: '사이드바 → 법인 관리 → + 신규 법인',
    detail: (
      <div style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Camera size={14} weight="duotone" style={{ color: 'var(--brand)' }} /> <strong>사업자등록증 사진</strong>
        </span>{' '}
        업로드하면 회사명·대표자·법인번호·업태·종목이 <strong>자동으로 채워집니다</strong>. <br />
        직접 입력도 가능. 등록된 회사명은 운영현황 업로드 시 법인등록번호로 자동 매칭됨.
      </div>
    ),
  },
  {
    icon: <House size={48} weight="duotone" />,
    title: '2단계 · 차량·계약 등록',
    desc: '사이드바 → 운영 현황 → + 신규 → 운영 현황 업로드',
    detail: (
      <div style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
        <FileXls size={14} weight="duotone" style={{ color: 'var(--brand)', display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
        <strong>템플릿</strong>을 다운받아 채우고 올리면 차량·계약·고객·회차 일괄 등록. <br />
        <em>차량번호만</em> → 휴차 차량 / <em>계약자만</em> → 구매대기 계약 / 둘 다 → 정상 계약. <br />
        날짜 형식 자유: <span className="mono">2026-05-01 / 26.5.1 / 260501</span>
      </div>
    ),
  },
  {
    icon: <CurrencyKrw size={48} weight="duotone" />,
    title: '3단계 · 은행 엑셀 업로드 + 매칭',
    desc: '사이드바 → 입출금 관리 → + 입출금 등록',
    detail: (
      <div style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
        은행 사이트에서 받은 엑셀 그대로 OK — <strong>KB·우리·신한·하나·농협·IBK·카카오·토스·케이뱅크 등 20곳</strong> 자동 인식. <br />
        업로드 후 <strong>자동매칭</strong> 버튼 → 이름+금액 일치하는 회차에 자동 연결됨.
      </div>
    ),
  },
  {
    icon: <CheckCircle size={48} weight="duotone" />,
    title: '4단계 · 수납 관리',
    desc: '운영 현황에서 계약 더블클릭 → 수납내역 탭',
    detail: (
      <div style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
        회차마다 <strong>분할입금</strong> (40+20+20) · <strong>선납</strong> (다음 달 미리) · <strong>청구할인</strong> (자가조치 등) · <strong>면제</strong> 가능. <br />
        은행 입금 매칭 자동 + 수동 모두 지원. 펼치면 입금 상세 내역.
      </div>
    ),
  },
  {
    icon: <BookOpen size={48} weight="duotone" />,
    title: '5단계 · 막힐 때는 사용 안내',
    desc: '사이드바 하단 → 사용 안내 (언제든)',
    detail: (
      <div style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
        자주 쓰는 작업 9개 Q&A · 엑셀 양식 안내 · OCR · 주의사항이 정리되어 있어요. <br />
        지금 이 튜토리얼은 다시 안 뜨지만, 사이드바 <strong>사용 안내</strong>는 언제든 다시 볼 수 있습니다.
      </div>
    ),
  },
];

export function OnboardingTour() {
  const { user, loading } = useAuth();
  const [show, setShow] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (loading || !user) return;
    const key = `${STORAGE_PREFIX}${user.uid}`;
    const done = typeof window !== 'undefined' ? localStorage.getItem(key) : '1';
    if (done !== '1') setShow(true);
  }, [user, loading]);

  if (!show || !user) return null;

  const step = STEPS[idx];
  const isFirst = idx === 0;
  const isLast = idx === STEPS.length - 1;

  function finish() {
    const key = `${STORAGE_PREFIX}${user!.uid}`;
    try { localStorage.setItem(key, '1'); } catch { /* ignore */ }
    setShow(false);
  }

  function next() {
    if (isLast) finish();
    else setIdx((i) => i + 1);
  }

  function prev() {
    if (!isFirst) setIdx((i) => i - 1);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="사용 안내 튜토리얼"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: 12,
          maxWidth: 560,
          width: '100%',
          padding: 0,
          boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        {/* 헤더 — 진행 표시 + 닫기 */}
        <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-sub)' }}>
            {idx + 1} / {STEPS.length}
          </div>
          <div style={{ flex: 1, height: 4, background: 'var(--bg-sunken)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${((idx + 1) / STEPS.length) * 100}%`,
              height: '100%',
              background: 'var(--brand)',
              transition: 'width 0.25s ease',
            }} />
          </div>
          <button
            type="button"
            onClick={finish}
            title="건너뛰기"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-weak)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 24, height: 24, borderRadius: 4,
            }}
          >
            <X size={14} weight="bold" />
          </button>
        </div>

        {/* 본문 */}
        <div style={{ padding: '32px 32px 20px', flex: 1, overflow: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14 }}>
            <div style={{
              width: 88, height: 88, borderRadius: '50%',
              background: 'var(--brand-bg)', color: 'var(--brand)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 4,
            }}>
              {step.icon}
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
              {step.title}
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-sub)', margin: 0, lineHeight: 1.6 }}>
              {step.desc}
            </p>
            {step.detail && (
              <div style={{
                marginTop: 12,
                padding: '12px 16px',
                background: 'var(--bg-sunken)',
                borderRadius: 8,
                textAlign: 'left',
                width: '100%',
              }}>
                {step.detail}
              </div>
            )}
          </div>
        </div>

        {/* 푸터 — 이전·다음 */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <button
            type="button"
            onClick={prev}
            disabled={isFirst}
            className="btn"
            style={{ visibility: isFirst ? 'hidden' : 'visible' }}
          >
            <CaretLeft size={12} weight="bold" /> 이전
          </button>
          <div style={{ flex: 1 }} />
          {!isLast ? (
            <>
              <button type="button" onClick={finish} className="btn btn-ghost">
                건너뛰기
              </button>
              <button type="button" onClick={next} className="btn btn-primary" autoFocus>
                다음 <CaretRight size={12} weight="bold" />
              </button>
            </>
          ) : (
            <>
              <Link href="/help" className="btn" onClick={() => finish()}>
                <BookOpen size={12} weight="duotone" /> 사용 안내 열기
              </Link>
              <button type="button" onClick={finish} className="btn btn-primary" autoFocus>
                <CheckCircle size={12} weight="bold" /> 시작하기
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
