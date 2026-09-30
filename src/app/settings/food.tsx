import { useState } from 'react';
import { Text } from 'react-native';

import { Button } from '@/components/common/ui';
import { KeyField, Section, SettingsPage, styles as formStyles, Tip, useSettingsSave } from '@/components/settings/form';
import { useT } from '@/i18n';
import { useSettings, useSettingsReady } from '@/settings/settings';

const AMAP_KEYS_URL = 'https://console.amap.com/dev/key/app';
const GOOGLE_KEYS_URL = 'https://console.cloud.google.com/google/maps-apis/credentials';

export default function FoodSettings() {
  return useSettingsReady() ? <FoodForm /> : null;
}

// Map keys the buddy uses to look up restaurants near the user; without them it falls back to OpenStreetMap
function FoodForm() {
  const settings = useSettings();
  const t = useT();
  const [amap, setAmap] = useState(settings.amapKey);
  const [google, setGoogle] = useState(settings.googlePlacesKey);
  const dirty = amap !== settings.amapKey || google !== settings.googlePlacesKey;
  const { saving, save, label } = useSettingsSave(dirty);

  return (
    <SettingsPage footer={<Button label={label} onPress={() => save({ amapKey: amap, googlePlacesKey: google })} loading={saving} disabled={!dirty} style={{ flex: 1 }} />}>
      <Text style={[formStyles.hint, { paddingHorizontal: 4, fontSize: 13, lineHeight: 20 }]}>
        {t.food.intro}
      </Text>

      <Section title={t.food.china}>
        <KeyField label={t.food.amapKey} value={amap} onChangeText={setAmap} placeholder={t.food.amapKeyPlaceholder} />
        <Tip title={t.food.amapTipTitle} link={{ label: t.food.amapTipLink, url: AMAP_KEYS_URL }}>
          {t.food.amapTip}
        </Tip>
      </Section>

      <Section title={t.food.abroad}>
        <KeyField label="Google Places Key" value={google} onChangeText={setGoogle} placeholder={t.food.googleKeyPlaceholder} />
        <Tip title={t.food.googleTipTitle} link={{ label: t.food.googleTipLink, url: GOOGLE_KEYS_URL }}>
          {t.food.googleTip}
        </Tip>
      </Section>
    </SettingsPage>
  );
}
