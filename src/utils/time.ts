// Local wall-clock parts of a UTC timestamp at a fixed offset (minutes east of UTC); defaults to the device zone
export function localParts(ms: number, offsetMin = deviceOffsetMin(ms)) {
  const d = new Date(ms + offsetMin * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const hm = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return { date, hm, minutesOfDay: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export function deviceOffsetMin(ms: number) {
  return -new Date(ms).getTimezoneOffset();
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// "2025-11-12" -> "11月12日 周三"
export function formatDayLabel(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}月${d}日 ${WEEKDAYS[wd]}`;
}

export function formatDateDots(date: string) {
  return date.replaceAll('-', '.');
}

export function todayISO() {
  return localParts(Date.now()).date;
}

export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

// 1-based day index of `date` within a trip starting on `start`
export function tripDayNumber(start: string, date: string) {
  return daysBetween(start, date) + 1;
}

// "2025.11.12 – 11.15", or "2025.11.12 起" while the trip is open
export function formatTripRange(start: string, end: string | null) {
  return end ? `${formatDateDots(start)} – ${formatDateDots(end).slice(5)}` : `${formatDateDots(start)} 起`;
}
