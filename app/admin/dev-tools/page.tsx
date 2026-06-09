'use client';

import Link from 'next/link';
import { Upload, Database, ClipboardText, Wrench, Warning, Users } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { useAuth } from '@/lib/use-auth';
import { isAdmin } from '@/lib/admin-emails';

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
    href: '/admin/migrate-sheet',
    title: '데이터 초기화 · 진단',
    desc: '☢ 전체 데이터 wipe (테스트 후 처음부터 쓰기) / DB 노드 상태 진단 / 회사 코드 정리 — 관리자 전용 위험 도구. 이중 confirm 거침.',
    icon: <Database size={18} weight="duotone" />,
    variant: 'danger',
  },
];

export default function DevToolsPage() {
  const { user } = useAuth();
  const admin = isAdmin(user?.email);

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
                  borderRadius: 8,
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
                      borderRadius: 3,
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
