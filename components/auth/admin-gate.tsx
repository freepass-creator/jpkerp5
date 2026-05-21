'use client';

import { ShieldWarning } from '@phosphor-icons/react';
import { useAuth } from '@/lib/use-auth';
import { isAdmin, ADMIN_EMAILS } from '@/lib/admin-emails';

/**
 * Admin 전용 페이지 가드.
 * AuthGate 통과 후(로그인됨)에도 admin 이메일이 아니면 차단.
 *
 * 사용:
 *   <AdminGate><MyAdminPage /></AdminGate>
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return null; // AuthGate 가 처리

  if (!isAdmin(user.email)) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-page)',
      }}>
        <div style={{
          maxWidth: 420, padding: '32px 28px',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', textAlign: 'center',
        }}>
          <ShieldWarning size={32} weight="duotone" style={{ color: 'var(--orange-text)', marginBottom: 12 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-main)', marginBottom: 6 }}>
            관리자 권한이 필요합니다
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.6 }}>
            현재 로그인 — <span className="mono">{user.email}</span>
            <br />
            이 페이지는 관리자({ADMIN_EMAILS.length}명)만 접근할 수 있습니다.
            <br />
            <span className="dim" style={{ fontSize: 11 }}>권한 추가는 lib/admin-emails.ts 수정 후 재배포 필요</span>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
