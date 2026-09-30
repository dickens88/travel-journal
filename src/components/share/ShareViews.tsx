import type { Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RouteSketch } from './RouteSketch';
import type { Journal } from '@/ai/schemas';
import { PhotoThumb } from '@/components/common/PhotoThumb';
import { Display, Serif } from '@/components/common/ui';
import { statItems } from '@/components/trip/StatsCard';
import { Colors, Fonts } from '@/constants/theme';
import type { Photo, Trip } from '@/db/types';
import type { Stop } from '@/geo/cluster';
import { useT } from '@/i18n';
import type { TripStats } from '@/stats/tripStats';
import { formatDayLabel } from '@/utils/time';

export type ShareData = { trip: Trip; journal: Journal; stats: TripStats; stops: Stop[]; photos: Map<string, Photo>; cover?: Photo };

function StatGrid({ stats, cols = 3 }: { stats: TripStats; cols?: number }) {
  const t = useT();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 }}>
      {statItems(stats, t).map((it) => (
        <View key={it.label} style={{ width: `${100 / cols}%` }}>
          <Display variant="subheading" style={{ fontSize: 19 }}>
            {it.value}
            <Text style={{ fontSize: 11 }}> {it.unit}</Text>
          </Display>
          <Text style={{ fontSize: 10, color: Colors.muted }}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function LongImage({ data, width, ref }: { data: ShareData; width: number; ref: Ref<View> }) {
  const { trip, journal, stats, stops, photos, cover } = data;
  const t = useT();
  return (
    <View ref={ref} collapsable={false} style={{ width, backgroundColor: Colors.paper }}>
      <View style={{ height: width * 0.78 }}>
        <PhotoThumb file={cover?.file} style={StyleSheet.absoluteFill} />
        <View style={styles.coverShade} />
        <View style={styles.coverText}>
          <Text style={styles.brand}>{t.share.brand}</Text>
          <Display variant="title" style={{ color: Colors.onDark }}>{journal.title}</Display>
          <Text style={{ color: Colors.onDark, fontSize: 12 }}>{trip.title}</Text>
        </View>
      </View>
      <View style={{ padding: 20, gap: 16 }}>
        <Serif style={{ fontSize: 15, lineHeight: 26, color: Colors.inkSoft }}>{journal.summary}</Serif>
        <View style={styles.panel}>
          <StatGrid stats={stats} />
        </View>
        <View style={{ borderRadius: 14, overflow: 'hidden' }}>
          <RouteSketch stops={stops} width={width - 40} height={(width - 40) * 0.62} />
        </View>
        {journal.days.map((day) => (
          <View key={day.date} style={{ gap: 12 }}>
            <Display style={{ marginTop: 8 }}>{formatDayLabel(day.date, t)}</Display>
            {day.sections.map((sec, i) => {
              const p = photos.get(sec.photo_ids[0]);
              return (
                <View key={i} style={{ gap: 8 }}>
                  <Display variant="subheading">{sec.heading}</Display>
                  <Serif style={{ fontSize: 15, lineHeight: 27 }}>{sec.text}</Serif>
                  {p ? <PhotoThumb file={p.file} style={{ height: (width - 40) * Math.min(1.1, p.height / p.width || 0.66), borderRadius: 12 }} /> : null}
                </View>
              );
            })}
          </View>
        ))}
        <Text style={styles.footer}>{t.share.footer}</Text>
      </View>
    </View>
  );
}

export type CardSpec = { kind: 'cover' } | { kind: 'stats' } | { kind: 'section'; day: number; section: number };

// Xiaohongshu allows up to 18 images per note
export function cardSpecs(journal: Journal): CardSpec[] {
  const out: CardSpec[] = [{ kind: 'cover' }, { kind: 'stats' }];
  journal.days.forEach((d, di) => d.sections.forEach((s, si) => s.photo_ids.length && out.push({ kind: 'section', day: di, section: si })));
  return out.slice(0, 18);
}

export function XhsCard({ data, spec, width, ref }: { data: ShareData; spec: CardSpec; width: number; ref: Ref<View> }) {
  const height = (width * 4) / 3;
  const { journal, stats, stops, photos, cover } = data;
  const t = useT();
  if (spec.kind === 'cover') {
    return (
      <View ref={ref} collapsable={false} style={[styles.card, { width, height }]}>
        <PhotoThumb file={cover?.file} style={{ flex: 1 }} />
        <View style={{ padding: 16, gap: 6, backgroundColor: Colors.paper }}>
          <Text style={styles.brandAccent}>{t.share.brand}</Text>
          <Display variant="title" style={{ fontSize: 25, lineHeight: 33 }} numberOfLines={2}>{journal.xhs.title || journal.title}</Display>
          <Text style={{ fontSize: 11, color: Colors.muted }}>
            {[t.trips.days(stats.days), t.trips.photos(stats.photos), `${stats.km} km`].join(' · ')}
          </Text>
        </View>
      </View>
    );
  }
  if (spec.kind === 'stats') {
    return (
      <View ref={ref} collapsable={false} style={[styles.card, { width, height, backgroundColor: Colors.card }]}>
        <RouteSketch stops={stops} width={width} height={height * 0.58} />
        <View style={{ padding: 16, gap: 12 }}>
          <Display variant="subheading">{t.share.thisTrip}</Display>
          <StatGrid stats={stats} />
        </View>
      </View>
    );
  }
  const day = journal.days[spec.day];
  const sec = day.sections[spec.section];
  const p = photos.get(sec.photo_ids[0]);
  return (
    <View ref={ref} collapsable={false} style={[styles.card, { width, height }]}>
      <PhotoThumb file={p?.file} style={{ height: height * 0.62 }} />
      <View style={{ flex: 1, padding: 16, gap: 6, backgroundColor: Colors.paper }}>
        <Text style={styles.brandAccent}>{formatDayLabel(day.date, t)}</Text>
        <Display variant="subheading" style={{ fontSize: 16, lineHeight: 22 }} numberOfLines={1}>{sec.heading}</Display>
        <Serif style={{ fontSize: 13, lineHeight: 22 }} numberOfLines={5}>{sec.text}</Serif>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  coverShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%', backgroundColor: 'rgba(20,16,12,0.5)' },
  coverText: { position: 'absolute', left: 20, right: 20, bottom: 20, gap: 6 },
  brand: { fontFamily: Fonts.display, color: Colors.pop, fontSize: 13, letterSpacing: 3 },
  brandAccent: { fontFamily: Fonts.display, color: Colors.accent, fontSize: 13, letterSpacing: 3 },
  panel: { padding: 16, borderRadius: 14, backgroundColor: Colors.card },
  footer: { fontFamily: Fonts.display, textAlign: 'center', fontSize: 13, color: Colors.muted, marginTop: 12 },
  card: { borderRadius: 16, overflow: 'hidden', backgroundColor: Colors.paper },
});
