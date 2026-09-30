import type { IconName } from '@/components/common/icons';
import { getT, type Messages } from '@/i18n';
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
  if (!res.ok) throw new Error(getT().errors.weatherFetchFailed(res.status));
  return parseDaily(await res.json());
}

// WMO weather code -> label and icon
export function weatherLabel(code: number, t: Messages): { label: string; symbol: IconName } {
  const [key, symbol] = weatherOf(code);
  return { label: t.weather[key], symbol };
}

type WeatherKey = keyof Messages['weather'];

function weatherOf(code: number): [WeatherKey, IconName] {
  if (code === 0) return ['clear', 'sun'];
  if (code <= 2) return ['partlyCloudy', 'sunCloud'];
  if (code === 3) return ['overcast', 'cloud'];
  if (code <= 48) return ['fog', 'fog'];
  if (code <= 57) return ['drizzle', 'drizzle'];
  if (code <= 67) return ['rain', 'rain'];
  if (code <= 77) return ['snow', 'snow'];
  if (code <= 82) return ['showers', 'shower'];
  if (code <= 86) return ['snowShowers', 'snowShower'];
  return ['storm', 'storm'];
}
