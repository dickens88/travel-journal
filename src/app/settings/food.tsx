import { useState } from 'react';
import { Text } from 'react-native';

import { Button } from '@/components/common/ui';
import { KeyField, Section, SettingsPage, styles as formStyles, Tip, useSettingsSave } from '@/components/settings/form';
import { useSettings, useSettingsReady } from '@/settings/settings';

const AMAP_KEYS_URL = 'https://console.amap.com/dev/key/app';
const GOOGLE_KEYS_URL = 'https://console.cloud.google.com/google/maps-apis/credentials';

export default function FoodSettings() {
  return useSettingsReady() ? <FoodForm /> : null;
}

// Map keys the buddy uses to look up restaurants near the user; without them it falls back to OpenStreetMap
function FoodForm() {
  const settings = useSettings();
  const [amap, setAmap] = useState(settings.amapKey);
  const [google, setGoogle] = useState(settings.googlePlacesKey);
  const dirty = amap !== settings.amapKey || google !== settings.googlePlacesKey;
  const { saving, save, label } = useSettingsSave(dirty);

  return (
    <SettingsPage footer={<Button label={label} onPress={() => save({ amapKey: amap, googlePlacesKey: google })} loading={saving} disabled={!dirty} style={{ flex: 1 }} />}>
      <Text style={[formStyles.hint, { paddingHorizontal: 4, fontSize: 13, lineHeight: 20 }]}>
        搭子推荐吃的时会按你的位置查附近的真实餐厅，能看到评分和价位。两个 Key 都可以不填，这时改用 OpenStreetMap 查，但没有评分。
      </Text>

      <Section title="国内 · 高德">
        <KeyField label="高德 Key" value={amap} onChangeText={setAmap} placeholder="「Web服务」类型的 Key" />
        <Tip title="怎么申请高德 Key？" link={{ label: '去高德开放平台', url: AMAP_KEYS_URL }}>
          在高德开放平台创建应用，添加 Key 时服务平台选「Web服务」，个人开发者每天有免费额度。
        </Tip>
      </Section>

      <Section title="国外 · Google 地图">
        <KeyField label="Google Places Key" value={google} onChangeText={setGoogle} placeholder="Places API (New) 的 Key" />
        <Tip title="怎么申请 Google Places Key？" link={{ label: '去 Google Cloud 控制台', url: GOOGLE_KEYS_URL }}>
          在 Google Cloud 开通 Places API (New) 并创建 API Key，需要绑定结算账号，每月有免费额度。用国内手机卡漫游时连不上 Google，会自动改用 OpenStreetMap。
        </Tip>
      </Section>
    </SettingsPage>
  );
}
