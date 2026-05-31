'use client';

import { useEffect, useState } from 'react';
import { getDatabase, ref, onValue } from 'firebase/database';
import { useAuth } from './use-auth';
import { isSuperAdmin } from './admin-emails';
import { getFirebaseApp, dbPath } from './firebase/client';

/**
 * 3단계 권한 시스템 — RTDB /users/{uid}/role 기반.
 *
 *   master : SUPER_ADMIN_EMAILS 화이트리스트 (코드 박힘) — 권한 부여·박탈 가능
 *   admin  : 마스터가 role='admin' 부여한 직원 — 직원관리 등 admin 페이지 접근
 *   staff  : 기본값 (role 미설정) — 일반 운영 페이지만
 *
 * 사용:
 *   const { role, isMaster, isAdmin, loading } = useRole();
 */

export type Role = 'master' | 'admin' | 'staff';

export function useRole(): { role: Role; isMaster: boolean; isAdmin: boolean; loading: boolean } {
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

  const master = isSuperAdmin(user?.email);
  const adminFlag = master || rtdbRole === 'admin';
  const role: Role = master ? 'master' : (rtdbRole === 'admin' ? 'admin' : 'staff');

  return { role, isMaster: master, isAdmin: adminFlag, loading: loading || authLoading };
}
