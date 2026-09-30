import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { Colors, Fonts } from '@/constants/theme';
import { useT } from '@/i18n';

// Rendered from Phosphor by scripts/gen-icons.js; white templates tinted by the tab bar
const ICONS = {
  trips: { default: require('../../../assets/images/tabs/trips.png'), selected: require('../../../assets/images/tabs/trips-selected.png') },
  footprint: { default: require('../../../assets/images/tabs/footprint.png'), selected: require('../../../assets/images/tabs/footprint-selected.png') },
  settings: { default: require('../../../assets/images/tabs/settings.png'), selected: require('../../../assets/images/tabs/settings-selected.png') },
};

export default function TabsLayout() {
  const t = useT();
  return (
    <NativeTabs
      tintColor={Colors.accent}
      iconColor={{ default: Colors.muted, selected: Colors.accent }}
      indicatorColor={Colors.popSoft}
      backgroundColor={Colors.card}
      labelStyle={{ default: { fontFamily: Fonts.display, fontSize: 12, color: Colors.muted }, selected: { fontFamily: Fonts.display, fontSize: 12, color: Colors.accent } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t.tabs.trips}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={ICONS.trips} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="footprint">
        <NativeTabs.Trigger.Label>{t.tabs.footprint}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={ICONS.footprint} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>{t.tabs.settings}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={ICONS.settings} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
