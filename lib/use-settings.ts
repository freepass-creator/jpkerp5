'use client';

import { useEffect, useState } from 'react';

/**
 * 사용자 환경설정 — localStorage 영구 저장 + :root CSS 변수 즉시 반영.
 *
 * 설정 항목:
 *   · theme        — light / dark / auto (시스템 따라감)
 *   · fontFamily   — mono(Consolas+굴림체) / sans(Pretendard) / system
 *   · fontSize     — 11~14px (테이블 밀도)
 *   · density      — compact / comfortable (행 높이)
 *
 * 적용:
 *   - <html data-theme="dark"> 토글로 다크모드 색상 변수 스왑
 *   - --font / --font-mono / --font-size CSS 변수 직접 set
 */

export type Theme = 'light' | 'sepia' | 'cool' | 'warm' | 'mint' | 'dark' | 'auto';
export type FontFamily =
  | 'pretendard'     // Pretendard Variable — 기본 (한글·영문·숫자 통일)
  | 'pretendard-mono'// Pretendard 한글 + Consolas 영문/숫자 (등폭)
  | 'mono'           // Consolas + 굴림체 — 전통 ERP
  | 'noto'           // Noto Sans KR
  | 'spoqa'          // Spoqa Han Sans Neo
  | 'nanum'          // 나눔고딕
  | 'nanum-square'   // 나눔스퀘어 라운드
  | 'ibm-plex'       // IBM Plex Sans KR
  | 'gowun'          // 고운돋움 (Gowun Dodum)
  | 'system';        // OS 기본
export type FontSize = 11 | 12 | 13 | 14;
export type Density = 'compact' | 'comfortable';
export type Radius = 'square' | 'soft' | 'rounded';
export type Accent = 'navy' | 'blue' | 'indigo' | 'teal' | 'green' | 'red' | 'orange' | 'purple' | 'slate' | 'custom';

export type Settings = {
  theme: Theme;
  fontFamily: FontFamily;
  fontSize: FontSize;
  density: Density;
  radius: Radius;
  accent: Accent;
  /** accent='custom' 일 때 사용할 hex 색상 (예: #ff6600). 다른 accent 일 때 무시. */
  customAccent: string;
};

const DEFAULTS: Settings = {
  theme: 'light',
  fontFamily: 'pretendard',
  fontSize: 12,
  density: 'compact',
  radius: 'soft', // 약간 둥글게 — 표준. 각지게(square)/더 둥글게(rounded) 사용자 선택
  accent: 'navy',
  customAccent: '#1B2A4A',
};

/** hex → RGB 튜플 */
function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}
/** RGB 튜플 → hex */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
/** 어둡게 (hover용) — amount 0.15 = 15% 어둡게 */
function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}
/** 밝고 흐리게 (brand-bg) — amount 0.92 = 92% 화이트 쪽으로 */
function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}
/** hex → rgba 문자열 (focus-ring 용 0.18 알파) */
function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 커스텀 색상 → 4종 CSS 변수 set */
function customAccentVars(hex: string): Record<string, string> {
  return {
    '--brand':      hex,
    '--brand-h':    darken(hex, 0.18),
    '--brand-bg':   lighten(hex, 0.90),
    '--focus-ring': hexToRgba(hex, 0.18),
  };
}

/** 브랜드 색상 — 활성·hover·연한배경·포커스링 4종 set. custom 은 customAccent hex 로 동적 계산. */
const ACCENT_VARS: Record<Exclude<Accent, 'custom'>, Record<string, string>> = {
  navy:   { '--brand': '#1B2A4A', '--brand-h': '#0F1B35', '--brand-bg': '#eef2f7', '--focus-ring': 'rgba(27, 42, 74, 0.18)' },
  blue:   { '--brand': '#2563eb', '--brand-h': '#1d4ed8', '--brand-bg': '#eff6ff', '--focus-ring': 'rgba(37, 99, 235, 0.18)' },
  indigo: { '--brand': '#4f46e5', '--brand-h': '#4338ca', '--brand-bg': '#eef2ff', '--focus-ring': 'rgba(79, 70, 229, 0.18)' },
  teal:   { '--brand': '#0d9488', '--brand-h': '#0f766e', '--brand-bg': '#f0fdfa', '--focus-ring': 'rgba(13, 148, 136, 0.18)' },
  green:  { '--brand': '#16a34a', '--brand-h': '#15803d', '--brand-bg': '#f0fdf4', '--focus-ring': 'rgba(22, 163, 74, 0.18)' },
  red:    { '--brand': '#dc2626', '--brand-h': '#b91c1c', '--brand-bg': '#fef2f2', '--focus-ring': 'rgba(220, 38, 38, 0.18)' },
  orange: { '--brand': '#ea580c', '--brand-h': '#c2410c', '--brand-bg': '#fff7ed', '--focus-ring': 'rgba(234, 88, 12, 0.18)' },
  purple: { '--brand': '#9333ea', '--brand-h': '#7e22ce', '--brand-bg': '#faf5ff', '--focus-ring': 'rgba(147, 51, 234, 0.18)' },
  slate:  { '--brand': '#475569', '--brand-h': '#334155', '--brand-bg': '#f1f5f9', '--focus-ring': 'rgba(71, 85, 105, 0.18)' },
};

/** 라디우스별 4종 CSS 변수 (sm / 기본 / md / lg). 직각·중간·둥근 3단계. */
const RADIUS_VARS: Record<Radius, Record<string, string>> = {
  square:  { '--radius-sm': '0',   '--radius': '0',   '--radius-md': '0',   '--radius-lg': '0' },
  soft:    { '--radius-sm': '3px', '--radius': '4px', '--radius-md': '6px', '--radius-lg': '8px' },
  rounded: { '--radius-sm': '4px', '--radius': '6px', '--radius-md': '8px', '--radius-lg': '12px' },
};

/** 폰트별 CDN 링크 — 사용자 선택 시 동적 로드. mono/system 은 시스템 기본이라 로드 X. */
const FONT_HREFS: Partial<Record<FontFamily, string>> = {
  pretendard:     'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css',
  spoqa:          'https://cdn.jsdelivr.net/gh/spoqa/spoqa-han-sans@01ff0283e44dba80f88abec6cdfe1b5b6e7b5dd9/css/SpoqaHanSansNeo.css',
  noto:           'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap',
  nanum:          'https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700&display=swap',
  'nanum-square': 'https://fonts.googleapis.com/css2?family=Nanum+Square+Round:wght@400;700&display=swap',
  'ibm-plex':     'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;700&display=swap',
  gowun:          'https://fonts.googleapis.com/css2?family=Gowun+Dodum&display=swap',
};
const loadedFonts = new Set<FontFamily>();
function ensureFontLoaded(family: FontFamily) {
  if (typeof document === 'undefined') return;
  if (loadedFonts.has(family)) return;
  const href = FONT_HREFS[family];
  if (!href) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.fontFamily = family;
  document.head.appendChild(link);
  loadedFonts.add(family);
}

const STORAGE_KEY = 'jpkerp5:settings';

const FONT_STACKS: Record<FontFamily, { font: string; mono: string }> = {
  pretendard: {
    // 기본 — 영문·숫자·한글 모두 Pretendard 일관. 숫자 등폭은 font-feature-settings: 'tnum' 으로 처리.
    font: "'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    mono: "'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', Consolas, monospace",
  },
  'pretendard-mono': {
    // Pretendard 한글 + Consolas 영문/숫자 (등폭). 영문 코드·차량번호 가독성 좋아짐.
    font: "Consolas, 'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    mono: "Consolas, 'JetBrains Mono', 'Pretendard Variable', Pretendard, 'Menlo', monospace",
  },
  mono: {
    font: "Consolas, 'GulimChe', '굴림체', 'Segoe UI', sans-serif",
    mono: "Consolas, 'GulimChe', '굴림체', 'Menlo', monospace",
  },
  noto: {
    font: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    mono: "Consolas, 'JetBrains Mono', monospace",
  },
  spoqa: {
    font: "'Spoqa Han Sans Neo', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    mono: "Consolas, 'JetBrains Mono', monospace",
  },
  nanum: {
    font: "'Nanum Gothic', '나눔고딕', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    mono: "Consolas, 'D2Coding', 'Menlo', monospace",
  },
  'nanum-square': {
    font: "'Nanum Square Round', '나눔스퀘어라운드', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    mono: "Consolas, 'D2Coding', 'Menlo', monospace",
  },
  'ibm-plex': {
    font: "'IBM Plex Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    mono: "'IBM Plex Mono', Consolas, monospace",
  },
  gowun: {
    font: "'Gowun Dodum', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    mono: "Consolas, 'JetBrains Mono', monospace",
  },
  system: {
    font: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
};

const DENSITY_VARS: Record<Density, Record<string, string>> = {
  compact:     { '--row-height': '30px', '--input-height': '26px', '--button-height': '26px', '--cell-padding': '6px 8px' },
  comfortable: { '--row-height': '36px', '--input-height': '32px', '--button-height': '32px', '--cell-padding': '8px 10px' },
};

function load(): Settings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function save(s: Settings) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** 시스템 다크모드 매체 쿼리 — 'auto' 일 때 사용. */
function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Settings → DOM 반영 (data-theme + CSS 변수). */
function apply(s: Settings) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  // theme
  let resolved: 'light' | 'dark' | 'sepia' | 'cool' | 'warm' | 'mint' = 'light';
  if (s.theme === 'auto') resolved = systemPrefersDark() ? 'dark' : 'light';
  else if (s.theme !== 'light') resolved = s.theme;
  root.dataset.theme = resolved;

  // font — 선택된 폰트만 동적 로드 (system/mono 는 OS 폰트라 로드 X)
  ensureFontLoaded(s.fontFamily);
  const stack = FONT_STACKS[s.fontFamily];
  root.style.setProperty('--font', stack.font);
  root.style.setProperty('--font-mono', stack.mono);
  root.style.setProperty('--font-size', `${s.fontSize}px`);

  // density
  const d = DENSITY_VARS[s.density];
  for (const [k, v] of Object.entries(d)) root.style.setProperty(k, v);

  // radius — 직각/중간/둥근
  const r = RADIUS_VARS[s.radius ?? 'square'];
  for (const [k, v] of Object.entries(r)) root.style.setProperty(k, v);

  // accent — 브랜드 색상. custom 이면 customAccent hex 로 동적 계산.
  const a = s.accent === 'custom'
    ? customAccentVars(s.customAccent || '#1B2A4A')
    : ACCENT_VARS[(s.accent ?? 'navy') as Exclude<Accent, 'custom'>];
  for (const [k, v] of Object.entries(a)) root.style.setProperty(k, v);
}

let cache: Settings = DEFAULTS;
let initialized = false;
const listeners = new Set<(s: Settings) => void>();

function ensureInit() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  cache = load();
  apply(cache);
  // 시스템 다크모드 토글 추적 — theme='auto' 일 때만 의미 있음
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (cache.theme === 'auto') apply(cache);
  });
}

export function useSettings() {
  const [settings, setLocal] = useState<Settings>(() => {
    ensureInit();
    return cache;
  });

  useEffect(() => {
    ensureInit();
    const fn = (s: Settings) => setLocal(s);
    listeners.add(fn);
    setLocal(cache);
    return () => { listeners.delete(fn); };
  }, []);

  function update(patch: Partial<Settings>) {
    cache = { ...cache, ...patch };
    save(cache);
    apply(cache);
    listeners.forEach((l) => l(cache));
  }

  function reset() {
    cache = { ...DEFAULTS };
    save(cache);
    apply(cache);
    listeners.forEach((l) => l(cache));
  }

  return { settings, update, reset };
}

/** layout 등 클라이언트 컴포넌트에서 마운트 1회 호출 — settings를 즉시 적용. */
export function initSettingsOnce() { ensureInit(); }
