'use client';

/**
 * 상세정보 다이얼로그 공용 shell — 운영현황·계약관리·리스크관리·자산관리 모두 이걸 wrap.
 *
 * 규격:
 *   DialogContent
 *     ├ DialogBody (p-0, flex column)
 *     │   ├ DetailHero (.detail-hero, padding 14 16)
 *     │   │   ├ left: 이름 + meta line
 *     │   │   └ right: 뱃지/KPI/액션 (props)
 *     │   └ 본문
 *     │       ├ Tabs 모드: Tabs.Root + Tabs.List + Tabs.Content (마지막은 wrapper padding 16)
 *     │       └ 단일 모드: 본문 wrapper (padding 16, marginTop 14)
 *     └ DialogFooter ([닫기])
 *
 * → 모든 dialog 가 HERO 좌측 X = 16, 본문 좌측 X = 16 동일.
 * → globals.css .dialog-content scope CSS (.detail-section / .detail-field 등) 가 자동 적용.
 */

import { type ReactNode } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import {
  DialogRoot, DialogContent, DialogBody, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { EditButtons } from '@/components/ui/edit-buttons';

export type ShellTab = {
  value: string;
  label: ReactNode;
  content: ReactNode;
};

export type DetailDialogShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** DialogContent title - 다이얼로그 헤더에 표시 */
  title: string;
  /** HERO 큰 이름 (예: 계약자명, 차종명) */
  heroName: ReactNode;
  /** HERO meta line — plate badge + 텍스트들 (· 구분자 포함) */
  heroMeta: ReactNode;
  /** HERO 우상단 영역 — 뱃지/KPI 표시만 (액션 버튼은 footer 로) */
  heroRight?: ReactNode;
  /** 탭 모드 — tabs 가 있으면 children 무시하고 Tabs.Root 렌더 */
  tabs?: ShellTab[];
  /** 단일 모드 — tabs 없을 때 본문 영역 */
  children?: ReactNode;
  /** Footer 추가 버튼 (닫기 좌측). 미지정 시 [닫기]만 노출. footer prop 사용 시 자동 [수정] 버튼은 비활성화 */
  footer?: ReactNode;
  /** 초기 활성 탭 (tabs 모드에서만, uncontrolled) */
  defaultTab?: string;
  /** 활성 탭 controlled — onTabChange와 함께 사용 */
  activeTab?: string;
  /** 활성 탭 변경 callback */
  onTabChange?: (value: string) => void;

  /* ─── 공용 [수정] 버튼 — 모든 detail dialog 동일 규격 ─── */
  /** [수정] 버튼 클릭 시 호출. 있으면 footer 에 [수정] 자동 노출 */
  onEdit?: () => void;
  /** 편집 중인지 — true 시 footer 가 [취소] [저장] 으로 자동 전환 */
  editing?: boolean;
  /** 편집 중일 때 [저장] 버튼 핸들러 */
  onSave?: () => void;
  /** 편집 중일 때 [취소] 버튼 핸들러 */
  onCancel?: () => void;
  /** 신규 등록 모드 — true 면 hero 좌측에 brand 띠 + "신규 등록" badge */
  isNew?: boolean;
};

export function DetailDialogShell({
  open, onOpenChange, title,
  heroName, heroMeta, heroRight,
  tabs, children, footer, defaultTab, activeTab, onTabChange,
  onEdit, editing, onSave, onCancel, isNew,
}: DetailDialogShellProps) {
  // 모드 — view / edit / new — hero/footer 시각 차별용
  const mode: 'view' | 'edit' | 'new' = isNew ? 'new' : editing ? 'edit' : 'view';
  // 공용 [수정/저장/취소] 자동 footer — footer prop 명시 시 X
  const autoFooter = !footer && (onEdit || editing) ? (
    <EditButtons editing={!!editing} onEdit={onEdit} onSave={onSave} onCancel={onCancel} variant="footer" />
  ) : null;
  const resolvedFooter = footer ?? autoFooter;
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} className={`mode-${mode}`}>
        <DialogBody className="p-0" style={{ display: 'flex', flexDirection: 'column' }}>
          {/* HERO */}
          <div
            className={`detail-hero mode-${mode}`}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <div className="detail-hero-main">
              <div className="detail-hero-name">
                {heroName}
                {mode === 'edit' && <span className="detail-mode-tag mode-edit">편집 중</span>}
                {mode === 'new'  && <span className="detail-mode-tag mode-new">신규 등록</span>}
              </div>
              <div className="detail-hero-meta">{heroMeta}</div>
            </div>
            {heroRight && <div className="detail-hero-right">{heroRight}</div>}
          </div>

          {/* 본문 — Tabs 모드 OR 단일 모드 */}
          {tabs && tabs.length > 0 ? (
            <Tabs.Root
              {...(activeTab !== undefined
                ? { value: activeTab, onValueChange: onTabChange }
                : { defaultValue: defaultTab ?? tabs[0].value, onValueChange: onTabChange })}
              style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, marginTop: 14 }}
            >
              <Tabs.List className="tabs-list">
                {tabs.map((t) => (
                  <Tabs.Trigger key={t.value} value={t.value} className="tabs-trigger">
                    {t.label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
              <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
                {tabs.map((t) => (
                  <Tabs.Content key={t.value} value={t.value}>
                    {t.content}
                  </Tabs.Content>
                ))}
              </div>
            </Tabs.Root>
          ) : (
            <div
              style={{
                flex: 1, overflow: 'auto', padding: 16, marginTop: 14,
                display: 'flex', flexDirection: 'column', gap: 14,
              }}
            >
              {children}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {resolvedFooter}
          <DialogClose asChild>
            <button className="btn">닫기</button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
