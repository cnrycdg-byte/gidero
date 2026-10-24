import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { Loading } from '@/components/ui';
import { useColors } from '@/constants/theme';
import { QueueProvider } from '@/lib/queue';
import { SessionProvider, useSession } from '@/lib/session';

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SessionProvider>
        <QueueProvider>
          <StatusBar style="auto" />
          <RootStack />
        </QueueProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}

function RootStack() {
  const { ready, session, active } = useSession();
  const c = useColors();
  if (!ready) return <Loading />;

  const signedIn = !!session;
  const hasCompany = !!active;

  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: c.pen,
        headerTitleStyle: { color: c.ink },
        headerLargeTitleStyle: { color: c.ink },
        contentStyle: { backgroundColor: c.canvas },
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerStyle: { backgroundColor: c.canvas },
      }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !hasCompany}>
        <Stack.Screen name="onboarding" options={{ title: 'Şirketinizi kurun', headerLargeTitle: true }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && hasCompany}>
        <Stack.Screen name="index" options={{ title: 'Masraflarım', headerLargeTitle: true }} />
        <Stack.Screen name="camera" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="new-report" options={{ title: 'Yeni rapor', presentation: 'modal' }} />
        <Stack.Screen name="report/[id]" options={{ title: '' }} />
        <Stack.Screen name="expense/[id]" options={{ title: 'Fiş' }} />
        <Stack.Screen name="approvals" options={{ title: 'Onayınızı bekleyenler' }} />
        <Stack.Screen name="team" options={{ title: 'Ekip' }} />
        <Stack.Screen name="settings" options={{ title: 'Ayarlar' }} />
      </Stack.Protected>
    </Stack>
  );
}
