import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';

import { ToastHost } from '@/components/common/Toast';
import { Colors, Fonts } from '@/constants/theme';
import { migrate } from '@/db/db';

migrate();

// Native builds embed the display font via the expo-font plugin; Expo Go and web have to load it at runtime
const RUNTIME_FONTS =
  Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    ? { [Fonts.display]: require('@expo-google-fonts/zcool-kuaile/400Regular/ZCOOLKuaiLe_400Regular.ttf') }
    : {};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(RUNTIME_FONTS);
  if (!fontsLoaded && !fontError) return null;
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.paper },
          headerShadowVisible: false,
          headerTintColor: Colors.ink,
          headerTitleStyle: { fontFamily: Fonts.display, fontSize: 19, fontWeight: 'normal' },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: Colors.paper },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="trip/new" options={{ title: '新建旅行' }} />
        <Stack.Screen name="trip/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="trip/[id]/journal" options={{ headerShown: false }} />
        <Stack.Screen name="trip/[id]/map" options={{ headerShown: false }} />
        <Stack.Screen name="trip/[id]/share" options={{ title: '分享游记' }} />
        <Stack.Screen name="trip/[id]/pick" options={{ title: '添加照片' }} />
        <Stack.Screen name="trip/[id]/buddy" options={{ presentation: 'modal', animation: 'slide_from_bottom', headerShown: false }} />
        <Stack.Screen name="trip/[id]/photo" options={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: '#000' } }} />
        <Stack.Screen name="trip/[id]/note" options={{ presentation: 'modal', animation: 'slide_from_bottom', headerShown: false }} />
      </Stack>
      <ToastHost />
    </>
  );
}
