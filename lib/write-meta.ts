/**
 * 데이터 변경 메타데이터 — 출처(웹/모바일) + 작성자 자동 태깅.
 *
 * 사용:
 *   await update(ref, withMeta({ ...patch }, user.email));
 *
 * 효과:
 *   · 모든 mutation 에 _meta: { source, by, at } 자동 부여
 *   · 활동 피드 / 알림 / 감사 추적의 단일 소스
 *   · 데스크탑(/) → source='web' / 모바일(/m/*) → source='mobile' 자동 감지
 *
 * 변경 영향: 기존 store add/update 에 1줄 wrapper 만 추가하면 됨.
 */

export type DataSource = 'web' | 'mobile' | 'system';

export type WriteMeta = {
  source: DataSource;
  by?: string;
  at: string;
};

/** 현재 라우트 기반 source 자동 감지. SSR/Node 환경에선 'system'. */
export function detectSource(): DataSource {
  if (typeof window === 'undefined') return 'system';
  const path = window.location.pathname;
  if (path.startsWith('/m/') || path === '/m') return 'mobile';
  return 'web';
}

/** 객체에 _meta 자동 추가. 기존 _meta 가 있어도 덮어쓰지 않음 (외부 시스템 입력 보존). */
export function withMeta<T extends object>(obj: T, by?: string): T & { _meta: WriteMeta } {
  if ('_meta' in obj && (obj as { _meta?: WriteMeta })._meta) {
    return obj as T & { _meta: WriteMeta };
  }
  return {
    ...obj,
    _meta: {
      source: detectSource(),
      by,
      at: new Date().toISOString(),
    },
  };
}
