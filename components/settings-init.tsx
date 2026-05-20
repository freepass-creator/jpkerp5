'use client';

import { useEffect } from 'react';
import { initSettingsOnce } from '@/lib/use-settings';

/** 마운트 시 1회 — localStorage에서 settings 로드 + DOM(:root data-theme/CSS 변수) 즉시 반영. */
export function SettingsInit() {
  useEffect(() => { initSettingsOnce(); }, []);
  return null;
}
