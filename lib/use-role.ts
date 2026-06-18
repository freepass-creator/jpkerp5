'use client';

import { useEffect, useState } from 'react';
import { getDatabase, ref, onValue } from 'firebase/database';
import { useAuth } from './use-auth';
import { isSuperAdmin } from './admin-emails';
import { getFirebaseApp, dbPath } from './firebase/client';

/**
 * 3단계 권한 시스템 — RTDB /users/{uid}/role 기반.
 *
 *   master : SUPER_ADMIN_EMAILS 화이트리스트 (코드 박힘) — 위험 작업·관리 페이지
 *   admin  : 마스터가 role='admin' 부여한 직원 — 직원관리 등 admin 페이지 접근
 *   staff  : 기본값 (role 미설정) — 일반 운영 페이지만
 *
 * 사용:
 *   const { role, isMaster, isAdmin, isRealMaster, loading } = useRole();
 *
 * 정책 (2026-06-19 활성화):
 *   - isMaster / isAdmin : permissive (any auth user) — 페이지 접근 gate 호환용
 *   - isRealMaster       : strict (whitelist 만) — 위험 작업 (일괄 삭제·migration)
 *   - 직접 isSuperAdmin() 호출 = strict, 위험 작업 코드용
 */

export type Role = 'master' | 'admin' | 'staff';

export function useRole(): { role: Role; isMaster: boolean; isAdmin: boolean; isRealMaster: boolean; loading: boolean } {
  const { user, loading: authLoading } = useAuth();
  const [rtdbRole, setRtdbRole] = useState<'admin' | 'staff' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setRtdbRole(null);
      setLoading(false);
      return;
    }
    // 마스터는 RTDB 조회 안 해도 됨
    if (isSuperAdmin(user.email)) {
      setLoading(false);
      return;
    }
    const app = getFirebaseApp();
    if (!app) { setLoading(false); return; }
    const db = getDatabase(app);
    const r = ref(db, dbPath(`users/${user.uid}/role`));
    const unsub = onValue(r, (snap) => {
      const val = snap.val();
      setRtdbRole(val === 'admin' ? 'admin' : 'staff');
      setLoading(false);
    }, () => { setLoading(false); });
    return () => unsub();
  }, [user, authLoading]);

  const realMaster = isSuperAdmin(user?.email);
  // 페이지 접근용 — 인증된 사용자 모두 통과 (현재 정책).
  // 추후 정식 운영 들어가면 화이트리스트 strict 로 격상 가능.
  const master = !!user;
  const adminFlag = !!user;
  const role: Role = realMaster ? 'master' : (rtdbRole === 'admin' ? 'admin' : 'staff');

  return { role, isMaster: master, isAdmin: adminFlag, isRealMaster: realMaster, loading: loading || authLoading };
}
