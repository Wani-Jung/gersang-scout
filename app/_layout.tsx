import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { migrateLegacySamin } from '@/lib/backup';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // v1.1.0 까지 옛 키(sword_*)에 저장한 삼인검 기록을 새 키(samin)로 한 번 옮긴다 (이미 옮겼으면 아무것도 안 함)
  useEffect(() => { migrateLegacySamin(); }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="samingeom" options={{ headerShown: false }} />
        <Stack.Screen name="backup" options={{ title: '💾 백업 / 복원' }} />
      </Stack>
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}
