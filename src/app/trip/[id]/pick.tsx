import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeError } from '@/ai/client';
import { Button, Icon, Segmented } from '@/components/common/ui';
import { Colors } from '@/constants/theme';
import { getTrip, listPhotos } from '@/db/repo';
import { useQuery } from '@/db/useQuery';
import { importAssets, importLibrary, pickPhotos, requestLibraryAccess } from '@/photos/importPhotos';
import { useT } from '@/i18n';
import { todayISO } from '@/utils/time';

const PAGE = 80;
const DAY_MS = 86_400_000;

type Item = { id: string; uri: string };

export default function PickPhotosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const t = useT();
  const trip = useQuery(`getTrip:${id}`, () => getTrip(id));
  const imported = useQuery(`importedAssets:${id}`, () => new Set(listPhotos(id).map((p) => p.asset_id).filter(Boolean)));
  const [access, setAccess] = useState<'all' | 'limited' | 'none' | null>(null);
  const [onlyTrip, setOnlyTrip] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  // Trip days in device-local time, with a day of slack for timezone changes while travelling
  const from = trip ? new Date(`${trip.start_date}T00:00:00`).getTime() - DAY_MS : 0;
  const to = trip ? new Date(`${trip.end_date ?? todayISO()}T23:59:59`).getTime() + DAY_MS : 0;

  // after = null loads the first page; cursor is null once the last page has loaded
  const load = async (after: string | null) => {
    const page = await MediaLibrary.getAssetsAsync({
      first: PAGE,
      after: after ?? undefined,
      mediaType: 'photo',
      sortBy: [['creationTime', false]],
      ...(onlyTrip ? { createdAfter: from, createdBefore: to } : {}),
    });
    const next = page.assets.map((a) => ({ id: a.id, uri: a.uri }));
    setItems((prev) => (after ? [...prev, ...next] : next));
    setCursor(page.hasNextPage ? page.endCursor : null);
  };

  useEffect(() => {
    if (!trip) return;
    let cancelled = false;
    // Expo Go on Android rejects full media access outright; treat that as "no access"
    requestLibraryAccess()
      .catch(() => ({ granted: false, accessPrivileges: 'none' as const }))
      .then((p) => {
        if (cancelled) return;
        setAccess(p.granted ? (p.accessPrivileges ?? 'all') : 'none');
        if (p.granted) load(null).catch((e) => Alert.alert(t.pick.readFailed, describeError(e)));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, onlyTrip]);

  const toggle = (assetId: string) =>
    setSelected((s) => (s.includes(assetId) ? s.filter((x) => x !== assetId) : [...s, assetId]));

  const add = () => {
    importLibrary(id, selected).catch((e) => Alert.alert(t.errors.importFailed, describeError(e)));
    router.back();
  };

  const fromSystemPicker = async () => {
    const sources = await pickPhotos();
    if (!sources.length) return;
    importAssets(id, sources).catch((e) => Alert.alert(t.errors.importFailed, describeError(e)));
    router.back();
  };

  const size = (width - 6) / 4;

  if (access === 'none') {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.hint}>{t.pick.needPermission}</Text>
        <Button label={t.pick.systemPicker} icon="photos" onPress={fromSystemPicker} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Segmented
        options={[{ value: true, label: t.pick.duringTrip }, { value: false, label: t.pick.allPhotos }]}
        value={onlyTrip}
        onChange={setOnlyTrip}
        style={{ margin: 12 }}
      />
      {access === 'limited' ? (
        <View style={styles.limited}>
          <Text style={{ flex: 1, fontSize: 13 }}>{t.pick.limited}</Text>
          <Button
            compact
            kind="secondary"
            label={t.pick.selectMore}
            onPress={() =>
              MediaLibrary.presentPermissionsPickerAsync(['photo'])
                .then(() => load(null))
                .catch(fromSystemPicker)
            }
          />
        </View>
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        numColumns={4}
        columnWrapperStyle={{ gap: 2 }}
        contentContainerStyle={{ gap: 2, paddingBottom: insets.bottom + 90 }}
        onEndReached={() => cursor && load(cursor)}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          access ? <Text style={[styles.hint, { marginTop: 60 }]}>{onlyTrip ? t.pick.noneDuringTrip : t.pick.noPhotos}</Text> : null
        }
        renderItem={({ item }) => {
          const order = selected.indexOf(item.id);
          const already = imported.has(item.id);
          return (
            <Pressable
              onPress={() => !already && toggle(item.id)}
              style={{ width: size, height: size }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: order >= 0, disabled: already }}>
              <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={item.id} />
              {already ? (
                <View style={styles.already}>
                  <Text style={styles.alreadyText}>{t.pick.added}</Text>
                </View>
              ) : null}
              <View style={[styles.check, order >= 0 && styles.checkOn]}>
                {order >= 0 ? <Text style={styles.checkText}>{order + 1}</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
      <View style={[styles.bar, { paddingBottom: insets.bottom + 10 }]}>
        <Pressable onPress={fromSystemPicker} style={styles.system} accessibilityRole="button">
          <Icon name="photos" size={20} color={Colors.muted} />
          <Text style={{ fontSize: 13, color: Colors.muted }}>{t.pick.systemAlbum}</Text>
        </Pressable>
        <Button label={selected.length ? t.pick.add(selected.length) : t.pick.choose} onPress={add} disabled={!selected.length} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.paper },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  hint: { fontSize: 14, color: Colors.muted, textAlign: 'center' },
  limited: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginBottom: 10, padding: 10, borderRadius: 12, backgroundColor: Colors.accentSoft },
  already: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(20,16,12,0.5)', alignItems: 'center', justifyContent: 'center' },
  alreadyText: { color: Colors.onDark, fontSize: 12 },
  check: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: Colors.onDark, backgroundColor: 'rgba(20,16,12,0.2)', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  checkText: { color: Colors.onDark, fontSize: 12, fontWeight: '700' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 10, backgroundColor: Colors.paper, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },
  system: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 12 },
});
