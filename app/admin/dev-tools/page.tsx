'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Upload, Database, ClipboardText, Wrench, Warning, Users, Truck, ShieldWarning, LockKey, CalendarX, ClockCounterClockwise } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { useAuth } from '@/lib/use-auth';
import { useRole } from '@/lib/use-role';
import { isDevToolUser } from '@/lib/admin-emails';

type ToolCard = {
  href: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  variant: 'op' | 'danger';
};

const TOOLS: ToolCard[] = [
  {
    href: '/admin/users',
    title: '계정 관리',
    desc: 'Firebase Auth 가입된 전체 직원 계정 — 가입일·마지막 로그인·권한 표시.',
    icon: <Users size={18} weight="duotone" />,
    variant: 'op',
  },
  {
    href: '/admin/import-templates',
    title: '이력 업로드',
    desc: '계약이력 / 수납이력 xlsx 일괄 등록. 차량+계약자별 horizontal 양식.',
    icon: <Upload size={18} weight="duotone" />,
    variant: 'op',
  },
  {
    href: '/admin/audit',
    title: '감사 로그',
    desc: '누가 언제 무엇을 변경했는지 추적. 모든 entity 변경 기록.',
    icon: <ClipboardText size={18} weight="duotone" />,
    variant: 'op',
  },
  {
    href: '/admin/bulk-deliver',
    title: '미인도 일괄 인도완료',
    desc: '계약자 있는데 인도일 비어있는 계약 검출 → 선택 → 일괄 인도완료 + Vehicle 마스터 status 동기화.',
    icon: <Truck size={18} weight="duotone" />,
    variant: 'op',
  },
  {
    href: '/admin/status-drift',
    title: '차량상태 drift 진단',
    desc: '자산 마스터(Vehicle.status) ↔ 계약 사본(Contract.vehicleStatus) 불일치 케이스 가시화 + 수동 정렬. plate 매칭 실패·고립 자산까지 한눈에.',
    icon: <Warning size={18} weight="duotone" />,
    variant: 'op',
  },
  {
    href: '/admin/integrity',
    title: '정합성 점검',
    desc: '차량 마스터 ↔ 계약·보험·과태료 참조무결성 진단 — plate 고아·날짜 역전·핵심 필수 누락. 읽기 전용.',
    icon: <ShieldWarning size={18} weight="duotone" />,
    variant: 'op',
  },
  {
    href: '/admin/reconcile',
    title: '일괄 대사 매칭 (초기 세팅)',
    desc: '3년치 은행입금을 활성 계약자 계약에 계약일순·오래된 미납부터 FIFO 로 채워 미리보기 → 확인 후 일괄 적용. 미귀속(붕 떠있는) 입금 검토 포함.',
    icon: <ShieldWarning size={18} weight="duotone" />,
    variant: 'op',
  },
  {
    href: '/admin/as-of',
    title: '시점 미수 조회 (as-of)',
    desc: '과거 어느 날짜든 "그 시점에 어떤 계약이 어떤 상태였고 미수가 얼마였나" 재구성. 날짜 박힌 입금·회차·반납일 원천을 그대로 재생 — 그 날 이후 입금은 제외. 읽기 전용.',
    icon: <ClockCounterClockwise size={18} weight="duotone" />,
    variant: 'op',
  },
  {
    href: '/admin/deleted-contracts',
    title: '삭제된 계약 (복원)',
    desc: '계약 삭제는 soft delete(deletedAt) — 원본 보존. 삭제된 계약 조회·복원. (#6)',
    icon: <ShieldWarning size={18} weight="duotone" />,
    variant: 'op',
  },
  {
    href: '/admin/closing',
    title: '회계기간 마감',
    desc: '월별 마감 처리 — 마감된 기간은 수납·인도·반납 등 거래 쓰기 차단. (직접 URL 진입만 되던 것 노출)',
    icon: <LockKey size={18} weight="duotone" />,
    variant: 'op',
  },
  {
    href: '/admin/fix-1900-dates',
    title: '1900년대 날짜 보정',
    desc: '엑셀 2자리 연도 변환 버그로 1900년대로 잘못 저장된 계약일·만기일 검출 → 선택 → +100년 일괄 보정.',
    icon: <CalendarX size={18} weight="duotone" />,
    variant: 'danger',
  },
  {
    href: '/admin/migrate-sheet',
    title: '데이터 초기화 · 진단',
    desc: '☢ 전체 데이터 wipe (테스트 후 처음부터 쓰기) / DB 노드 상태 진단 / 회사 코드 정리 — 관리자 전용 위험 도구. 이중 confirm 거침.',
    icon: <Database size={18} weight="duotone" />,
    variant: 'danger',
  },
];

export default function DevToolsPage() {
  // 개발도구 = master 만 (dev-tools 정보 노출 차단)
  const router = useRouter();
  const { isRealMaster, loading: roleLoading } = useRole();
  useEffect(() => { if (!roleLoading && !isRealMaster) router.replace('/'); }, [isRealMaster, roleLoading, router]);

  const { user } = useAuth();
  const admin = isDevToolUser(user?.email);

  return (
    <div className="layout">
      <Sidebar />
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <Wrench size={16} weight="fill" style={{ color: 'var(--brand)' }} />
            <span>개발도구</span>
          </div>
        </header>

        <div style={{ padding: 24, maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <header className="page-header">
            <div className="page-header-title-group">
              <h1 className="page-header-title">
                <Wrench size={18} weight="duotone" />
                개발도구
              </h1>
              <div className="page-header-title-sub">
                데이터 입력·업로드 / 진단 / wipe / 감사 — admin 전용
              </div>
            </div>
          </header>

          {!admin && (
            <div className="notice notice--error">
              <Warning size={14} weight="fill" style={{ marginRight: 6, verticalAlign: 'middle' }} />
              관리자만 접근 가능합니다.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {TOOLS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: 16,
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  textDecoration: 'none',
                  color: 'var(--text-main)',
                  transition: 'border-color 0.15s, transform 0.1s',
                  cursor: 'pointer',
                  minHeight: 110,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = t.variant === 'danger' ? 'var(--red-text)' : 'var(--brand)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
                  <span style={{ color: t.variant === 'danger' ? 'var(--red-text)' : 'var(--brand)' }}>
                    {t.icon}
                  </span>
                  {t.title}
                  {t.variant === 'danger' && (
                    <span style={{
                      fontSize: 10,
                      padding: '2px 6px',
                      background: 'var(--red-bg)',
                      color: 'var(--red-text)',
                      borderRadius: 'var(--radius-sm)',
                      marginLeft: 'auto',
                    }}>
                      위험
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-weak)', lineHeight: 1.5 }}>
                  {t.desc}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
