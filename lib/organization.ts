import { useMemo } from 'react';
import { useAuth, useUsers } from '@/lib/use-auth';

/**
 * 조직도 마스터 — 부서·팀 계층.
 *
 *   관리부 ─ 영업지원팀
 *           ├ 운영지원팀
 *           └ 경영지원팀
 *
 *  · UserProfile.department 에 팀명 저장 (예: '영업지원팀')
 *  · 업무 요청(DispatchOrder) 시:
 *     - assignedToUid    = 특정 개인
 *     - assignedToTeam   = 특정 팀 (산하 직원 모두)
 *     - assignedToDivision = 부 단위 (산하 모든 팀)
 *     - 모두 비우면 전체 broadcast
 */

export type Division = {
  name: string;
  teams: string[];
};

export const ORGANIZATION: Division[] = [
  {
    name: '관리부',
    teams: ['영업지원팀', '운영지원팀', '경영지원팀'],
  },
];

/** 모든 팀 (flat) — selectbox·필터용 */
export const ALL_TEAMS: string[] = ORGANIZATION.flatMap((d) => d.teams);

/** 모든 부 (top-level) */
export const ALL_DIVISIONS: string[] = ORGANIZATION.map((d) => d.name);

/** 팀명 → 소속 부서. unknown 팀은 undefined */
export function divisionOfTeam(team: string): string | undefined {
  return ORGANIZATION.find((d) => d.teams.includes(team))?.name;
}

/** 부서 → 산하 팀 목록 */
export function teamsOfDivision(division: string): string[] {
  return ORGANIZATION.find((d) => d.name === division)?.teams ?? [];
}

/** 본인 소속 정보 (uid + 팀 + 부) — 업무 요청 매칭에 사용 */
export function useMyOrgContext(): { uid: string | undefined; team: string | undefined; division: string | undefined } {
  const { user } = useAuth();
  const allUsers = useUsers();
  const myProfile = useMemo(() => allUsers.find((u) => u.uid === user?.uid), [allUsers, user?.uid]);
  const team = myProfile?.department;
  const division = useMemo(() => team ? divisionOfTeam(team) : undefined, [team]);
  return { uid: user?.uid ?? undefined, team, division };
}
