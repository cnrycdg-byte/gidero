import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { Loading } from '@/components/ui';
import { useColors } from '@/constants/theme';
import { SessionProvider, useSession } from '@/lib/session';

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SessionProvider>
        <StatusBar style="auto" />
        <RootStack />
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
        headerTintColor: c.primary,
        headerTitleStyle: { color: c.text },
        contentStyle: { backgroundColor: c.bg },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: c.bg },
      }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !hasCompany}>
        <Stack.Screen name="onboarding" options={{ title: 'Şirketinizi kurun' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && hasCompany}>
        <Stack.Screen name="index" options={{ title: 'Gidero', headerLargeTitle: true }} />
        <Stack.Screen name="new-report" options={{ title: 'Yeni rapor', presentation: 'modal' }} />
        <Stack.Screen name="report/[id]" options={{ title: 'Rapor' }} />
        <Stack.Screen name="expense/[id]" options={{ title: 'Fiş' }} />
        <Stack.Screen name="approvals" options={{ title: 'Onayımı bekleyenler' }} />
        <Stack.Screen name="team" options={{ title: 'Ekip' }} />
        <Stack.Screen name="settings" options={{ title: 'Ayarlar' }} />
      </Stack.Protected>
    </Stack>
  );
}
