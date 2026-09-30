import { Chip } from '@/components/common/ui';
import { Colors } from '@/constants/theme';
import type { DayWeather } from '@/db/types';
import { useT } from '@/i18n';
import { weatherLabel } from '@/weather/openMeteo';

export function WeatherChip({ day }: { day: DayWeather | undefined }) {
  const t = useT();
  if (!day) return null;
  const w = weatherLabel(day.code, t);
  return (
    <Chip
      icon={w.symbol}
      iconColor={day.code <= 2 ? Colors.sun : Colors.cloud}
      label={`${w.label} ${Math.round(day.tmax)}°/${Math.round(day.tmin)}°`}
    />
  );
}
