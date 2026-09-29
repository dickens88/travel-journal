import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { Colors, Fonts } from '@/constants/theme';

// Rendered from Phosphor by scripts/gen-icons.js; white templates tinted by the tab bar
const ICONS = {
  trips: { default: require('../../../assets/images/tabs/trips.png'), selected: require('../../../assets/images/tabs/trips-selected.png') },
  footprint: { default: require('../../../assets/images/tabs/footprint.png'), selected: require('../../../assets/images/tabs/footprint-selected.png') },
  settings: { default: require('../../../assets/images/tabs/settings.png'), selected: require('../../../assets/images/tabs/settings-selected.png') },
};

export default function TabsLayout() {
  return (
    <NativeTabs
      tintColor={Colors.accent}
      iconColor={{ default: Colors.muted, selected: Colors.accent }}
      indicatorColor={Colors.popSoft}
      backgroundColor={Colors.card}
      labelStyle={{ default: { fontFamily: Fonts.display, fontSize: 12, color: Colors.muted }, selected: { fontFamily: Fonts.display, fontSize: 12, color: Colors.accent } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>旅行</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={ICONS.trips} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="footprint">
        <NativeTabs.Trigger.Label>足迹</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={ICONS.footprint} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>设置</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={ICONS.settings} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
