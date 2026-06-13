'use client';

/**
 * 날씨 — Open-Meteo (무료, API 키 불필요).
 *  · 기본 위치: 서울 (37.5665, 126.9780). 추후 회사별 차고지 좌표로 확장 가능.
 *  · 오전 (06-12) / 오후 (12-18) 시간대 최고 기온 + 대표 wx 코드.
 *  · WMO weather code → 한글 + 이모지 매핑.
 */

import { useEffect, useState } from 'react';

const SEOUL = { lat: 37.5665, lon: 126.978 };

export type WeatherIconKey = 'sun' | 'cloud_sun' | 'cloud' | 'rain' | 'snow' | 'storm' | 'fog' | 'unknown';

export type WeatherSlot = {
  temp: number;       // °C
  code: number;       // WMO weather code
  iconKey: WeatherIconKey;
  label: string;      // 한글
};

export type WeatherToday = {
  am?: WeatherSlot;
  pm?: WeatherSlot;
  high?: number;
  low?: number;
  loading: boolean;
  error?: string;
};

/** WMO weather code → 한글 라벨 + 이모지 */
function decodeWmo(code: number): { iconKey: WeatherIconKey; label: string } {
  if (code === 0) return { iconKey: 'sun',       label: '맑음' };
  if (code <= 3) return { iconKey: 'cloud_sun', label: '구름 조금' };
  if (code <= 48) return { iconKey: 'fog',       label: '안개' };
  if (code <= 57) return { iconKey: 'rain',      label: '이슬비' };
  if (code <= 67) return { iconKey: 'rain',      label: '비' };
  if (code <= 77) return { iconKey: 'snow',      label: '눈' };
  if (code <= 82) return { iconKey: 'rain',      label: '소나기' };
  if (code <= 86) return { iconKey: 'snow',      label: '눈 소나기' };
  if (code <= 99) return { iconKey: 'storm',     label: '뇌우' };
  return { iconKey: 'unknown', label: '-' };
}

async function fetchWeather(lat: number, lon: number): Promise<WeatherToday> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + `&hourly=temperature_2m,weathercode&timezone=Asia%2FSeoul`
    + `&daily=temperature_2m_max,temperature_2m_min`
    + `&forecast_days=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather ${res.status}`);
  const data = await res.json();
  const times = (data.hourly?.time ?? []) as string[];
  const temps = (data.hourly?.temperature_2m ?? []) as number[];
  const codes = (data.hourly?.weathercode ?? []) as number[];
  const high = data.daily?.temperature_2m_max?.[0] as number | undefined;
  const low  = data.daily?.temperature_2m_min?.[0] as number | undefined;

  function pickRange(fromHour: number, toHour: number): WeatherSlot | undefined {
    let bestTemp: number | undefined;
    let bestCode = 0;
    for (let i = 0; i < times.length; i++) {
      const h = parseInt(times[i].slice(11, 13), 10);
      if (h >= fromHour && h < toHour) {
        const t = temps[i];
        if (bestTemp === undefined || t > bestTemp) bestTemp = t;
        bestCode = codes[i] ?? bestCode;
      }
    }
    if (bestTemp === undefined) return undefined;
    const decoded = decodeWmo(bestCode);
    return { temp: Math.round(bestTemp), code: bestCode, ...decoded };
  }

  return {
    am: pickRange(6, 12),
    pm: pickRange(12, 18),
    high: high === undefined ? undefined : Math.round(high),
    low:  low  === undefined ? undefined : Math.round(low),
    loading: false,
  };
}

/** 오늘 날씨 hook — 5분 캐시 (sessionStorage) */
export function useWeather(): WeatherToday {
  const [state, setState] = useState<WeatherToday>({ loading: true });

  useEffect(() => {
    let cancelled = false;
    const key = 'jpkerp5:weather:seoul';
    const TTL_MS = 5 * 60 * 1000;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const cached = JSON.parse(raw) as { at: number; data: WeatherToday };
        if (Date.now() - cached.at < TTL_MS) {
          setState({ ...cached.data, loading: false });
          return;
        }
      }
    } catch { /* silent */ }
    fetchWeather(SEOUL.lat, SEOUL.lon)
      .then((d) => {
        if (cancelled) return;
        setState(d);
        try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data: d })); } catch { /* silent */ }
      })
      .catch((e) => { if (!cancelled) setState({ loading: false, error: (e as Error).message }); });
    return () => { cancelled = true; };
  }, []);

  return state;
}
