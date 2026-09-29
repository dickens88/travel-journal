import type { IconName } from '@/components/common/icons';
import { daysBetween, todayISO } from '@/utils/time';

export type DailyWeather = { date: string; code: number; tmax: number; tmin: number };

export function buildWeatherUrl(lat: number, lng: number, start: string, end: string, today = todayISO()) {
  const params = `latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&start_date=${start}&end_date=${end}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;
  // The archive lags a few days; recent dates come from the forecast API
  const host = daysBetween(end, today) > 7 ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
  return `${host}?${params}`;
}

export function parseDaily(json: any): DailyWeather[] {
  const d = json?.daily;
  if (!d?.time) return [];
  return (d.time as string[])
    .map((date, i) => ({ date, code: d.weather_code?.[i], tmax: d.temperature_2m_max?.[i], tmin: d.temperature_2m_min?.[i] }))
    .filter((w) => w.code != null && w.tmax != null && w.tmin != null);
}

export async function fetchDailyWeather(lat: number, lng: number, start: string, end: string) {
  const res = await fetch(buildWeatherUrl(lat, lng, start, end));
  if (!res.ok) throw new Error(`天气查询失败 ${res.status}`);
  return parseDaily(await res.json());
}

// WMO weather code -> label and icon
export function weatherLabel(code: number): { label: string; symbol: IconName } {
  if (code === 0) return { label: '晴', symbol: 'sun' };
  if (code <= 2) return { label: '晴间多云', symbol: 'sunCloud' };
  if (code === 3) return { label: '阴', symbol: 'cloud' };
  if (code <= 48) return { label: '雾', symbol: 'fog' };
  if (code <= 57) return { label: '毛毛雨', symbol: 'drizzle' };
  if (code <= 67) return { label: '雨', symbol: 'rain' };
  if (code <= 77) return { label: '雪', symbol: 'snow' };
  if (code <= 82) return { label: '阵雨', symbol: 'shower' };
  if (code <= 86) return { label: '阵雪', symbol: 'snowShower' };
  return { label: '雷雨', symbol: 'storm' };
}
